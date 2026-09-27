import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as stellar from "@stellar/stellar-sdk";
import * as diagnostics from "../lib/wallet/connection-diagnostics";
import * as transactionProof from "../lib/wallet/transaction-proof";

const user = stellar.Keypair.random();
const network = stellar.Networks.PUBLIC;
const source = ts.transpileModule(readFileSync(new URL("../lib/wallet/freighter.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const transaction = (value = "original", passphrase = network) => new stellar.TransactionBuilder(
  new stellar.Account(user.publicKey(), "1"), { fee: "100", networkPassphrase: passphrase },
).addOperation(stellar.Operation.manageData({ name: "synthetic", value })).setTimeout(60).build();
const original = transaction().toXDR();
function signed(xdr = original, signer = user, passphrase = network) {
  const tx = stellar.TransactionBuilder.fromXDR(xdr, passphrase); tx.sign(signer); return tx.toXDR();
}

function harness(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const api = {
    signTransaction: async () => { calls.push("sign"); return { signedTxXdr: signed(), signerAddress: user.publicKey() }; },
    isAllowed: async () => { calls.push("allowed"); return { isAllowed: true }; },
    getAddress: async () => { calls.push("address"); return { address: user.publicKey() }; },
    getNetworkDetails: async () => { calls.push("network"); return { networkPassphrase: network }; },
    ...overrides,
  };
  const modules: Record<string, unknown> = {
    "@stellar/freighter-api": api, "@stellar/stellar-sdk": stellar, buffer: { Buffer },
    "./connection-diagnostics": diagnostics, "./transaction-proof": transactionProof,
    "./walletconnect": { usesMobileWallet: () => false },
  };
  const module = { exports: {} as typeof import("../lib/wallet/freighter") };
  vm.runInNewContext(source, { module, exports: module.exports, Error,
    require(name: string) { assert.ok(Object.hasOwn(modules, name)); return modules[name]; } });
  return { ...module.exports, calls };
}

test("desktop opens the signing prompt before any async reads, then verifies exact body, signer and session", async () => {
  const h = harness();
  const pending = h.signFreighterTransaction(original, user.publicKey(), network);
  assert.deepEqual(h.calls, ["sign"]);
  assert.equal(await pending, signed());
  assert.deepEqual(h.calls, ["sign", "allowed", "address", "network"]);
});

test("desktop rejects changed, unsigned, wrong-key and wrong-network envelopes before releasing the result", async () => {
  for (const [xdr, reason] of [
    [signed(transaction("changed").toXDR()), /changed/],
    [original, /not signed/],
    [signed(original, stellar.Keypair.random()), /not signed/],
    [signed(original, user, stellar.Networks.TESTNET), /not signed/],
  ] as const) {
    const h = harness({ signTransaction: async () => ({ signedTxXdr: xdr, signerAddress: user.publicKey() }) });
    await assert.rejects(h.signFreighterTransaction(original, user.publicKey(), network), reason);
    assert.deepEqual(h.calls, []);
  }
});

test("a missing signer label is accepted only with the actual connected account signature", async () => {
  const h = harness({ signTransaction: async () => ({ signedTxXdr: signed() }) });
  assert.equal(await h.signFreighterTransaction(original, user.publicKey(), network), signed());
  const wrong = harness({ signTransaction: async () => ({ signedTxXdr: signed(), signerAddress: stellar.Keypair.random().publicKey() }) });
  await assert.rejects(wrong.signFreighterTransaction(original, user.publicKey(), network), /different signer/);
});

test("desktop rejects a valid signature if the active network, account or permission changed during approval", async () => {
  for (const override of [
    { getNetworkDetails: async () => ({ networkPassphrase: stellar.Networks.TESTNET }) },
    { getAddress: async () => ({ address: stellar.Keypair.random().publicKey() }) },
    { isAllowed: async () => ({ isAllowed: false }) },
    { getNetworkDetails: async () => ({ error: { code: -1, message: "private provider payload" } }) },
  ]) {
    await assert.rejects(harness(override).signFreighterTransaction(original, user.publicKey(), network), /account or network could not be confirmed/);
  }
});

test("desktop session reuse detects network changes while unreadable or missing providers stay unknown", async () => {
  assert.equal(await harness().freighterSessionState(user.publicKey(), network), "matches");
  assert.equal(await harness({ getNetworkDetails: async () => ({ networkPassphrase: stellar.Networks.TESTNET }) }).freighterSessionState(user.publicKey(), network), "different");
  assert.equal(await harness({ getNetworkDetails: async () => ({}) }).freighterSessionState(user.publicKey(), network), "unknown");
  assert.equal(await harness({ getNetworkDetails: async () => { throw new Error("unavailable"); } }).freighterSessionState(user.publicKey(), network), "unknown");
});

test("signer API converts failed verification into an empty result and never returns the unsafe XDR", async () => {
  const h = harness({ signTransaction: async () => ({ signedTxXdr: signed(transaction("changed").toXDR()) }) });
  const result = await h.freighterSigner(user.publicKey(), network).signTransaction(original, { address: user.publicKey(), networkPassphrase: network });
  assert.equal(result.signedTxXdr, ""); assert.ok(result.error);
});

test("rejection never falls through to another signature request or session reads", async () => {
  let prompts = 0;
  const h = harness({ signTransaction: async () => { prompts++; return { error: { message: "Rejected" } }; } });
  await assert.rejects(h.signFreighterTransaction(original, user.publicKey(), network), /Rejected/);
  assert.equal(prompts, 1); assert.deepEqual(h.calls, []);
});


test("explicit Testnet reuse succeeds and records terminal wallet checks separately from HTTP sessions", async () => {
  const h = harness({ getNetworkDetails: async () => ({ networkPassphrase: stellar.Networks.TESTNET }) });
  assert.equal(await h.freighterSessionState(user.publicKey(), stellar.Networks.TESTNET), "matches");
  const events = () => diagnostics.buildConnectionReport({}).events.slice(-2).map(({ step, outcome }) => ({ step, outcome }));
  assert.deepEqual(events(), [{ step: "wallet-session", outcome: "started" }, { step: "wallet-session", outcome: "ok" }]);
  assert.equal(await h.freighterSessionState(user.publicKey(), network), "different");
  assert.deepEqual(events(), [{ step: "wallet-session", outcome: "started" }, { step: "wallet-session", outcome: "mismatch" }]);
  const unavailable = harness({ isAllowed: async () => ({ error: { message: "private permission payload" } }) });
  assert.equal(await unavailable.freighterSessionState(user.publicKey(), network), "unknown");
  assert.deepEqual(events(), [{ step: "wallet-session", outcome: "started" }, { step: "wallet-session", outcome: "unavailable" }]);
  await assert.rejects(unavailable.signFreighterTransaction(original, user.publicKey(), network), /account or network could not be confirmed/);
  assert.equal(diagnostics.buildConnectionReport({}).events.at(-1)?.outcome, "mismatch");
  assert.doesNotMatch(JSON.stringify(diagnostics.buildConnectionReport({})), /private permission payload/);
});

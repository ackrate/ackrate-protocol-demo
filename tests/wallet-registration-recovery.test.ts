import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as stellar from "@stellar/stellar-sdk";
import * as recovery from "../lib/wallet/registration-recovery";
import * as mandateIds from "../lib/wallet/mandate-id";

const now = Math.floor(Date.now() / 1000);
const user = stellar.Keypair.fromRawEd25519Seed(Buffer.alloc(32, 31));
const other = stellar.Keypair.fromRawEd25519Seed(Buffer.alloc(32, 32));
const config = {
  network: "mainnet", networkPassphrase: stellar.Networks.PUBLIC,
  rpcUrl: "https://fixture.invalid/rpc", mandateRegistryId: stellar.StrKey.encodeContract(Buffer.alloc(32, 5)),
};
const scope: recovery.RegistrationScope = {
  id: "d".repeat(64), credentialHash: "c".repeat(64), user: user.publicKey(), agent: other.publicKey(),
  merchant: other.publicKey(), asset: stellar.StrKey.encodeContract(Buffer.alloc(32, 6)), maxAmount: "1000000", expiry: now + 3600,
};
const intent = { ...scope, id: scope.credentialHash, idBuffer: Buffer.from(scope.credentialHash, "hex"), maxAmount: BigInt(scope.maxAmount), decimals: 7 };
function transaction(options: { sequence?: string; signer?: stellar.Keypair | null; maxTime?: number; network?: string; registry?: string } = {}) {
  const tx = new stellar.TransactionBuilder(new stellar.Account(scope.user, options.sequence ?? "100"), {
    fee: "100000", networkPassphrase: options.network ?? config.networkPassphrase,
    timebounds: { minTime: 0, maxTime: options.maxTime ?? now + 600 },
  }).addOperation(new stellar.Contract(options.registry ?? config.mandateRegistryId).call("register_mandate",
    ...[scope.user, scope.agent, scope.merchant, scope.asset].map((value) => new stellar.Address(value).toScVal()),
    stellar.nativeToScVal(BigInt(scope.maxAmount), { type: "i128" }),
    stellar.nativeToScVal(BigInt(scope.expiry), { type: "u64" }),
    stellar.nativeToScVal(Buffer.from(scope.credentialHash, "hex"), { type: "bytes" }),
  )).build();
  if (options.signer !== null) tx.sign(options.signer ?? user);
  return tx;
}
const signed = transaction();
const pending = () => recovery.signedRegistrationEvidence(signed.toXDR(), config.networkPassphrase, config.mandateRegistryId, scope, now);
const resultMeta = (id = scope.id) => new stellar.xdr.TransactionMeta(3, new stellar.xdr.TransactionMetaV3({
  ext: new stellar.xdr.ExtensionPoint(0), txChangesBefore: [], operations: [], txChangesAfter: [],
  sorobanMeta: new stellar.xdr.SorobanTransactionMeta({
    ext: new stellar.xdr.SorobanTransactionMetaExt(0), events: [], diagnosticEvents: [],
    returnValue: stellar.nativeToScVal(Buffer.from(id, "hex"), { type: "bytes" }),
  }),
})).toXDR("base64");

test("signed registration evidence binds the exact wallet, network, body, rules, hash and expiry", () => {
  const evidence = pending();
  assert.equal(evidence.txHash, signed.hash().toString("hex"));
  assert.equal(evidence.signedTransactionXdr, signed.toXDR());
  assert.equal(evidence.validUntil, now + 600);
  for (const tx of [transaction({ signer: null }), transaction({ signer: other }), transaction({ network: stellar.Networks.TESTNET }), transaction({ registry: scope.asset }), transaction({ maxTime: now - 1 })]) {
    assert.throws(() => recovery.signedRegistrationEvidence(tx.toXDR(), config.networkPassphrase, config.mandateRegistryId, scope, now));
  }
  for (const altered of [{ user: other.publicKey() }, { agent: user.publicKey() }, { merchant: user.publicKey() }, { asset: config.mandateRegistryId }, { maxAmount: "2000000" }, { expiry: scope.expiry + 1 }, { credentialHash: "e".repeat(64) }]) {
    assert.throws(() => recovery.signedRegistrationEvidence(signed.toXDR(), config.networkPassphrase, config.mandateRegistryId, { ...scope, ...altered }, now));
  }
});

test("recovered on-chain mandate must match the original id and all spending rules", () => {
  assert.doesNotThrow(() => recovery.assertRegistrationMandate(scope, { ...scope, status: "Active" }));
  for (const field of ["id", "user", "agent", "merchant", "asset", "maxAmount", "expiry"]) {
    assert.throws(() => recovery.assertRegistrationMandate(scope, { ...scope, [field]: "different" }), /does not match/);
  }
});

test("missing legacy markers and pending receipts block replacement; only known no-send or terminal states allow it", () => {
  assert.equal(recovery.registrationNeedsReconciliation(null), false);
  assert.equal(recovery.registrationNeedsReconciliation({}), true);
  assert.equal(recovery.registrationNeedsReconciliation({ registrationState: "pending" }), true);
  assert.equal(recovery.registrationNeedsReconciliation({ registrationState: "not-submitted" }), false);
  assert.equal(recovery.registrationNeedsReconciliation({ registrationState: "failed" }), false);
  assert.equal(recovery.registrationNeedsReconciliation({ registrationTx: pending().txHash }), false);
  for (const registrationState of ["not-submitted", "failed"] as const) {
    assert.equal(recovery.registrationNeedsReconciliation({ registrationState, pendingRegistration: pending() }), true);
  }
});

test("reconciliation reads the exact saved receipt only; covered expiry and verified failure are terminal", async (t) => {
  let result: unknown;
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    calls += 1;
    assert.equal(url, config.rpcUrl);
    assert.equal(init?.credentials, "same-origin");
    assert.equal(init?.cache, "no-store");
    assert.deepEqual(JSON.parse(String(init?.body)), { jsonrpc: "2.0", id: "registration-confirmation", method: "getTransaction", params: { hash: pending().txHash } });
    return Response.json({ result });
  });
  for (const [status, expected] of [["SUCCESS", "confirmed"], ["FAILED", "failed"]]) {
    result = { status, envelopeXdr: signed.toXDR(), resultMetaXdr: resultMeta() };
    assert.equal(await recovery.readRegistrationConfirmation(config, scope, pending()), expected);
  }
  result = { status: "NOT_FOUND", oldestLedgerCloseTime: now - 100, latestLedgerCloseTime: now + 601 };
  assert.equal(await recovery.readRegistrationConfirmation(config, scope, pending()), "expired");
  result = { status: "NOT_FOUND", oldestLedgerCloseTime: String(now - 100), latestLedgerCloseTime: String(now + 601) };
  assert.equal(await recovery.readRegistrationConfirmation(config, scope, pending()), "expired");
  for (const resultValue of [
    { status: "NOT_FOUND" },
    { status: "NOT_FOUND", oldestLedgerCloseTime: now + 1, latestLedgerCloseTime: now + 601 },
    { status: "NOT_FOUND", oldestLedgerCloseTime: now - 100, latestLedgerCloseTime: now + 600 },
    { status: "NOT_FOUND", oldestLedgerCloseTime: `0${now - 100}`, latestLedgerCloseTime: String(now + 601) },
  ]) {
    result = resultValue;
    assert.equal(await recovery.readRegistrationConfirmation(config, scope, pending()), "pending");
  }
  assert.equal(calls, 8);
});

test("different receipts, corrupt retained evidence and outages cannot prove a retry is safe", async (t) => {
  let result: unknown = { status: "SUCCESS", envelopeXdr: transaction({ sequence: "101" }).toXDR() };
  let reads = 0;
  t.mock.method(globalThis, "fetch", async () => { reads += 1; return Response.json({ result }); });
  await assert.rejects(recovery.readRegistrationConfirmation(config, scope, pending()), /different registration/);
  result = { status: "FAILED" };
  await assert.rejects(recovery.readRegistrationConfirmation(config, scope, pending()), /different registration/);
  result = { status: "UNEXPECTED" };
  await assert.rejects(recovery.readRegistrationConfirmation(config, scope, pending()), /unknown/);
  await assert.rejects(recovery.readRegistrationConfirmation(config, scope, { ...pending(), txHash: "0".repeat(64) }), /hash or expiry changed/);
  await assert.rejects(recovery.readRegistrationConfirmation(config, scope, { ...pending(), validUntil: now + 1 }), /hash or expiry changed/);
  assert.equal(reads, 3, "corrupt evidence fails before any request");
  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async () => { throw new Error("synthetic offline transport"); });
  await assert.rejects(recovery.readRegistrationConfirmation(config, scope, pending()), /offline/);
});

test("successful receipt must return this exact mandate id, not another same-scope registration", async (t) => {
  let metadata: string | undefined = resultMeta("f".repeat(64));
  t.mock.method(globalThis, "fetch", async () => Response.json({ result: { status: "SUCCESS", envelopeXdr: signed.toXDR(), resultMetaXdr: metadata } }));
  await assert.rejects(recovery.readRegistrationConfirmation(config, scope, pending()), /different mandate id/);
  metadata = undefined;
  await assert.rejects(recovery.readRegistrationConfirmation(config, scope, pending()), /missing.*mandate id/);
  metadata = resultMeta();
  await assert.rejects(recovery.readRegistrationConfirmation(config, { ...scope, id: "e".repeat(64) }, pending()), /different mandate id/);
  assert.equal(await recovery.readRegistrationConfirmation(config, scope, pending()), "confirmed");
});

test("aborting recovery ends even a transport that ignores abort, with no submission", async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async () => { controller.abort(new Error("synthetic cancelled check")); return new Promise<Response>(() => {}); });
  await assert.rejects(recovery.readRegistrationConfirmation(config, scope, pending(), controller.signal), /cancelled check/);
});

const clientSource = ts.transpileModule(readFileSync(new URL("../lib/wallet/mandate-client.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function clientHarness(options: { signError?: boolean; sendError?: boolean; changedBody?: boolean; wrongResult?: boolean } = {}) {
  const order: string[] = [];
  const built = transaction({ signer: null });
  const assembled = {
    built, signed: undefined as stellar.Transaction | undefined,
    result: { unwrap: () => Buffer.from(scope.id, "hex") },
    async sign() {
      order.push("sign");
      if (options.signError) throw new Error("synthetic signing rejection");
      this.signed = options.changedBody ? transaction({ sequence: "999" }) : signed;
    },
    async send() {
      order.push("send");
      if (options.sendError) throw new Error("synthetic confirmation response lost");
      return {
        sendTransactionResponse: { hash: signed.hash().toString("hex") }, getTransactionResponse: { status: "SUCCESS" },
        result: { unwrap: () => Buffer.from(options.wrongResult ? "f".repeat(64) : scope.id, "hex") },
      };
    },
  };
  const modules: Record<string, unknown> = {
    buffer: { Buffer }, "@stellar/stellar-sdk": { ...stellar, rpc: { Server: class {} } },
    "@ackrate/stellar": { Client: class { async register_mandate() { order.push("prepare"); return assembled; } } },
    "@ackrate/core": { ackrate: {} }, "./freighter": { freighterSigner: () => ({ signTransaction: () => { throw new Error("The fixture never opens a wallet"); } }) },
    "./horizon-account": {}, "./mandate-id": mandateIds, "./rpc-retry": { installMainnetRpcRetry: () => {} },
    "./client-readiness": {}, "./allowance-sequence": {}, "./registration-recovery": recovery,
  };
  const module = { exports: {} as typeof import("../lib/wallet/mandate-client") };
  vm.runInNewContext(clientSource, {
    module, exports: module.exports, Error,
    require(name: string) { assert.ok(Object.hasOwn(modules, name), `Unexpected client import: ${name}`); return modules[name]; },
  });
  return { client: module.exports, order };
}

test("actual registration client saves exact signed envelope before its single submission", async () => {
  const h = clientHarness();
  let saved: recovery.PendingRegistration | undefined;
  const result = await h.client.registerWithFreighter(config as Parameters<typeof h.client.registerWithFreighter>[0], intent,
    (id) => { h.order.push("save-id"); assert.equal(id, scope.id); },
    (evidence) => { h.order.push("save-signed"); saved = evidence; });
  assert.deepEqual(h.order, ["prepare", "save-id", "sign", "save-signed", "send"]);
  assert.equal(result.transactionHash, pending().txHash);
  assert.equal(saved?.signedTransactionXdr, signed.toXDR());
  assert.equal(saved?.txHash, result.transactionHash);
});

test("signing rejection, body change and failed local persistence never submit", async () => {
  for (const options of [{ signError: true }, { changedBody: true }, {}]) {
    const h = clientHarness(options);
    await assert.rejects(h.client.registerWithFreighter(config as Parameters<typeof h.client.registerWithFreighter>[0], intent,
      undefined, () => { throw new Error("synthetic storage unavailable"); }), h.client.RegistrationNotSubmittedError);
    assert.equal(h.order.includes("send"), false);
  }
});

test("wallet registration cannot bypass durable retention with a missing or asynchronous callback", async () => {
  const missing = clientHarness();
  await assert.rejects(missing.client.registerRetainedWithFreighter(config as Parameters<typeof missing.client.registerWithFreighter>[0], intent, () => {}, undefined as never), missing.client.RegistrationNotSubmittedError);
  assert.equal(missing.order.includes("sign"), false);
  const asynchronous = clientHarness();
  await assert.rejects(asynchronous.client.registerRetainedWithFreighter(config as Parameters<typeof asynchronous.client.registerWithFreighter>[0], intent,
    () => {}, async () => { throw new Error("Synthetic async storage failure"); }), asynchronous.client.RegistrationNotSubmittedError);
  assert.equal(asynchronous.order.includes("send"), false);
});

test("lost submission response retains exact evidence and never signs or submits again", async () => {
  const h = clientHarness({ sendError: true });
  let saved: recovery.PendingRegistration | undefined;
  await assert.rejects(h.client.registerWithFreighter(config as Parameters<typeof h.client.registerWithFreighter>[0], intent,
    undefined, (evidence) => { saved = evidence; }), /confirmation response lost/);
  assert.equal(saved?.txHash, pending().txHash);
  assert.equal(saved?.signedTransactionXdr, signed.toXDR());
  assert.deepEqual(h.order, ["prepare", "sign", "send"]);
  assert.equal(recovery.registrationNeedsReconciliation({ registrationState: "pending" }), true);
});

test("a different final registered id fails closed while retaining the submitted receipt", async () => {
  const h = clientHarness({ wrongResult: true });
  let saved: recovery.PendingRegistration | undefined;
  await assert.rejects(h.client.registerWithFreighter(config as Parameters<typeof h.client.registerWithFreighter>[0], intent,
    undefined, (evidence) => { saved = evidence; }), /different identifiers/);
  assert.equal(saved?.txHash, pending().txHash);
  assert.equal(h.order.filter((item) => item === "send").length, 1);
});

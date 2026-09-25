import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { Account, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import * as sessions from "../lib/wallet/walletconnect-session";
import * as diagnostics from "../lib/wallet/connection-diagnostics";

const user = Keypair.random();
const network = Networks.PUBLIC;
const chain = "stellar:pubnet";
const session = () => ({ expiry: Math.floor(Date.now() / 1000) + 3600,
  namespaces: { stellar: { accounts: [`${chain}:${user.publicKey()}`], methods: [...sessions.MOBILE_METHODS] } } });
const transaction = (value = "original") => new TransactionBuilder(new Account(user.publicKey(), "1"), { fee: "100", networkPassphrase: network })
  .addOperation(Operation.manageData({ name: "test", value })).setTimeout(60).build();

test("mobile sessions require the selected chain, valid single account, both methods and a live expiry", () => {
  assert.equal(sessions.stellarChain(network), chain);
  assert.equal(sessions.stellarChain(Networks.TESTNET), "stellar:testnet");
  assert.throws(() => sessions.stellarChain("custom"), /does not support/);
  assert.equal(sessions.mobileSessionAddress(session(), chain), user.publicKey());
  assert.throws(() => sessions.mobileSessionAddress(undefined, chain), /expired/);
  assert.throws(() => sessions.mobileSessionAddress({ ...session(), expiry: 0 }, chain), /expired/);
  assert.throws(() => sessions.mobileSessionAddress(session(), "stellar:testnet"), /Choose one/);
  const missing = session(); missing.namespaces.stellar.methods = ["stellar_signXDR"];
  assert.throws(() => sessions.mobileSessionAddress(missing, chain), /offline sign-in/);
  const ambiguous = session(); ambiguous.namespaces.stellar.accounts.push(`${chain}:${Keypair.random().publicKey()}`);
  assert.throws(() => sessions.mobileSessionAddress(ambiguous, chain), /Choose one/);
});

test("mobile transactions cannot change payload or substitute a signer", () => {
  const tx = transaction(); const original = tx.toXDR(); tx.sign(user);
  assert.equal(sessions.validateMobileTransaction(original, tx.toXDR(), user.publicKey(), network), tx.toXDR());
  const tampered = transaction("modified"); tampered.sign(user);
  assert.throws(() => sessions.validateMobileTransaction(original, tampered.toXDR(), user.publicKey(), network), /changed/);
  const wrong = TransactionBuilder.fromXDR(original, network); wrong.sign(Keypair.random());
  assert.throws(() => sessions.validateMobileTransaction(original, wrong.toXDR(), user.publicKey(), network), /not signed/);
  assert.throws(() => sessions.validateMobileTransaction(original, original, user.publicKey(), network), /not signed/);
  assert.throws(() => sessions.validateMobileTransaction(original, undefined, user.publicKey(), network), /did not return/);
});

const source = ts.transpileModule(readFileSync(new URL("../lib/wallet/walletconnect.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
function harness({ configured = true, initial = undefined as ReturnType<typeof session> | undefined, connect = undefined as (() => Promise<ReturnType<typeof session>>) | undefined } = {}) {
  const calls: { method: string; params?: unknown; chain?: string }[] = [];
  const events: Record<string, () => void> = {};
  const storage = new Map<string, string>();
  let stateListener: ((state: { open: boolean }) => void) | undefined;
  const provider = { session: initial,
    on: (name: string, listener: () => void) => { events[name] = listener; },
    connect: async (params: unknown) => { calls.push({ method: "connect", params }); provider.session = connect ? await connect() : session(); return provider.session; },
    disconnect: async () => { calls.push({ method: "disconnect" }); provider.session = undefined; },
    cleanupPendingPairings: async () => { calls.push({ method: "cleanup-pairings" }); },
    request: async ({ method, params }: { method: string; params: { message: string; xdr: string } }, requestedChain: string) => {
      calls.push({ method, params, chain: requestedChain });
      if (method === "stellar_signMessage") return { signature: user.signMessage(params.message).toString("base64") };
      const tx = TransactionBuilder.fromXDR(params.xdr, network); tx.sign(user); return { signedXDR: tx.toXDR() };
    },
  };
  const modules: Record<string, unknown> = {
    "./connection-diagnostics": diagnostics, "./walletconnect-session": sessions,
    "@walletconnect/universal-provider": { UniversalProvider: { init: async () => provider } },
    "@reown/appkit/core": { createAppKit: () => ({ open: async () => {}, close: async () => {}, subscribeState: (listener: typeof stateListener) => { stateListener = listener; return () => { stateListener = undefined; }; } }) },
    "@reown/appkit/networks": { mainnet: {} },
  };
  const module = { exports: {} as typeof import("../lib/wallet/walletconnect") };
  vm.runInNewContext(source, { module, exports: module.exports, Error, TextEncoder, Event,
    window: { dispatchEvent: () => {} }, location: { origin: "https://staging.ackrate.com" },
    process: { env: { NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: configured ? "1".repeat(32) : "" } },
    localStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) },
    require(name: string) { assert.ok(Object.hasOwn(modules, name), name); return modules[name]; },
  });
  return { api: module.exports, calls, provider, events, close: () => stateListener?.({ open: false }) };
}

test("missing project config fails before opening or contacting WalletConnect", async () => {
  const h = harness({ configured: false });
  await assert.rejects(h.api.connectMobileWallet(network), /not enabled/);
  assert.equal(h.calls.length, 0);
});

test("mobile connect, offline message, transaction, reload state and disconnect share one transport", async () => {
  const h = harness();
  assert.equal(await h.api.connectMobileWallet(network), user.publicKey());
  assert.equal(h.api.usesMobileWallet(), true);
  assert.equal(await h.api.mobileSessionState(user.publicKey(), network), "matches");
  assert.equal(await h.api.mobileSessionState(Keypair.random().publicKey(), network), "different");
  const proof = await h.api.mobileSignMessage("Offline sign-in", user.publicKey(), network);
  assert.equal(user.verifyMessage("Offline sign-in", Buffer.from(proof, "base64")), true);
  await h.api.mobileSignTransaction(transaction().toXDR(), user.publicKey(), network);
  assert.deepEqual(h.calls.map((c) => c.method), ["connect", "stellar_signMessage", "stellar_signXDR"]);
  assert.equal(h.calls[1]?.chain, chain);
  assert.doesNotMatch(JSON.stringify(h.calls[0]), /signAndSubmit|signAuthEntry|eip155/);
  await assert.rejects(h.api.mobileSignMessage("x".repeat(1025), user.publicKey(), network), /size limit/);
  h.events.session_expire!();
  await assert.rejects(h.api.mobileSignMessage("expired", user.publicKey(), network), /changed/);
  await h.api.disconnectMobileWallet();
  assert.equal(h.api.usesMobileWallet(), false);
  assert.equal(h.provider.session, undefined);
  const restored = harness({ initial: session() }); restored.api.selectMobileWallet(true);
  assert.equal(await restored.api.mobileSessionState(user.publicKey(), network), "matches");
  assert.equal(restored.calls.length, 0);
});

test("closing the modal clears pairings and prevents retrying an outstanding approval", async () => {
  const h = harness({ connect: () => new Promise(() => {}) });
  const pending = h.api.connectMobileWallet(network);
  while (!h.calls.length) await new Promise((resolve) => setImmediate(resolve));
  h.close();
  await assert.rejects(pending, /cancelled/);
  assert.equal(h.calls.at(-1)?.method, "cleanup-pairings");
  await assert.rejects(h.api.connectMobileWallet(network), /Refresh/);
  assert.equal(h.api.usesMobileWallet(), false);
});

test("late approval after cancellation is disconnected rather than silently reused", async () => {
  let approve!: (value: ReturnType<typeof session>) => void;
  const h = harness({ connect: () => new Promise((resolve) => { approve = resolve; }) });
  const pending = h.api.connectMobileWallet(network);
  while (!h.calls.length) await new Promise((resolve) => setImmediate(resolve));
  h.close(); await assert.rejects(pending, /cancelled/);
  approve(session());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.provider.session, undefined);
  assert.equal(h.calls.at(-1)?.method, "disconnect");
  assert.equal(h.api.usesMobileWallet(), false);
});

test("account change events invalidate a session even when the provider retains old namespace accounts", async () => {
  const h = harness(); await h.api.connectMobileWallet(network);
  h.events.accountsChanged!();
  assert.equal(await h.api.mobileSessionState(user.publicKey(), network), "disconnected");
  await assert.rejects(h.api.mobileSignTransaction(transaction().toXDR(), user.publicKey(), network), /changed/);
  assert.equal(await h.api.connectMobileWallet(network), user.publicKey());
  assert.deepEqual(h.calls.map((call) => call.method), ["connect", "disconnect", "connect"]);
});

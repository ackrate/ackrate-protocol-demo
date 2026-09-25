import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as stellar from "@stellar/stellar-sdk";
import * as diagnostics from "../lib/wallet/connection-diagnostics";
import { safeWalletError } from "../lib/wallet/notifications";

const user = stellar.Keypair.random();
const network = stellar.Networks.PUBLIC;
const source = ts.transpileModule(readFileSync(new URL("../lib/wallet/freighter.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
function harness(overrides: Record<string, unknown> = {}, mobile = false) {
  const calls: string[] = [];
  const api = {
    isConnected: async () => { calls.push("detect"); return { isConnected: true }; },
    requestAccess: async () => { calls.push("access"); return { address: user.publicKey() }; },
    getNetworkDetails: async () => { calls.push("network"); return { networkPassphrase: network }; },
    signMessage: async (text: string) => ({ signedMessage: user.signMessage(text), signerAddress: user.publicKey() }),
    ...overrides,
  };
  const modules: Record<string, unknown> = { "@stellar/freighter-api": api, buffer: { Buffer },
    "@stellar/stellar-sdk": stellar, "./connection-diagnostics": { ...diagnostics, isMobileBrowser: () => mobile } };
  const module = { exports: {} as { connectFreighter: (network: string, onStatus?: (s: string) => void) => Promise<string>;
    signFreighterMessage: (text: string, address: string, network: string) => Promise<string> } };
  vm.runInNewContext(source, { module, exports: module.exports, Error,
    require(name: string) { assert.ok(Object.hasOwn(modules, name)); return modules[name]; } });
  return { ...module.exports, calls };
}

test("connect checks extension, requests access, then validates network and reports each phase", async () => {
  const h = harness(); const status: string[] = [];
  assert.equal(await h.connectFreighter(network, (s) => status.push(s)), user.publicKey());
  assert.deepEqual(h.calls, ["detect", "access", "network"]);
  assert.equal(status.length, 3);
});

test("mobile and missing extensions never invoke an approval request", async () => {
  const mobile = harness({}, true);
  await assert.rejects(mobile.connectFreighter(network), /Mobile needs WalletConnect/);
  assert.deepEqual(mobile.calls, []);
  const missing = harness({ isConnected: async () => ({ isConnected: false }) });
  await assert.rejects(missing.connectFreighter(network), /not detected/);
  assert.deepEqual(missing.calls, []);
});

test("denial, invalid accounts and wrong networks fail with controlled errors", async () => {
  const rejected = harness({ requestAccess: async () => ({ error: { code: -4, message: "secret payload" } }) });
  try { await rejected.connectFreighter(network); assert.fail("connection must fail"); }
  catch (cause) { assert.doesNotMatch(safeWalletError(cause, "fallback"), /secret payload|fallback/); }
  assert.deepEqual(rejected.calls, ["detect"]);
  await assert.rejects(harness({ requestAccess: async () => ({ address: "invalid" }) }).connectFreighter(network), /valid Stellar/);
  await assert.rejects(harness({ getNetworkDetails: async () => ({ networkPassphrase: stellar.Networks.TESTNET }) }).connectFreighter(network), /Switch Freighter/);
});

test("duplicate connection cannot open another approval while one is pending", async () => {
  let resolve!: (value: { address: string }) => void;
  const pending = new Promise<{ address: string }>((done) => { resolve = done; });
  const h = harness({ requestAccess: () => pending });
  const first = h.connectFreighter(network);
  await assert.rejects(h.connectFreighter(network), /already pending/);
  resolve({ address: user.publicKey() });
  assert.equal(await first, user.publicKey());
});

test("stalled request times out, clears its wait and does not consume a late response", async () => {
  let resolve!: (value: string) => void; let continued = false;
  const pending = new Promise<string>((done) => { resolve = done; });
  const request = diagnostics.connectionRequest("access", () => pending, 5).then(() => { continued = true; });
  await assert.rejects(request, /did not respond in time/);
  resolve("late account");
  await Promise.resolve();
  assert.equal(continued, false);
  assert.equal(await diagnostics.connectionRequest("detect", async () => true, 5), true);
});

test("offline sign-in verifies exact message and signer without a transaction fallback", async () => {
  const text = "Sign in to REAPP. No transaction or spending permission.";
  const signature = await harness().signFreighterMessage(text, user.publicKey(), network);
  assert.equal(user.verifyMessage(text, Buffer.from(signature, "base64")), true);
  await assert.rejects(harness({ signMessage: async () => ({ signedMessage: user.signMessage("another message"), signerAddress: user.publicKey() }) }).signFreighterMessage(text, user.publicKey(), network), /exact sign-in message/);
  await assert.rejects(harness({ signMessage: async () => ({ signedMessage: user.signMessage(text), signerAddress: stellar.Keypair.random().publicKey() }) }).signFreighterMessage(text, user.publicKey(), network), /different signer/);
});

test("report bounds events and excludes arbitrary payloads and malformed release metadata", () => {
  for (let i = 0; i < 45; i++) diagnostics.recordConnectionEvent("access", "failed", { message: "secret signature xdr" });
  diagnostics.recordConnectionEvent("access", "failed", -4);
  diagnostics.recordConnectionEvent("secret" as diagnostics.ConnectionStep, "failed");
  const report = diagnostics.buildConnectionReport({ sourceCommit: "secret-token", network: user.publicKey(), ready: false });
  assert.equal(report.events.length, 40);
  assert.equal(report.events.at(-1)?.code, -4);
  assert.equal(report.sourceCommit, null);
  assert.equal(report.network, "unknown");
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /secret|signature|xdr/);
  assert.equal(serialized.includes(user.publicKey()), false);
  report.events[0]!.outcome = "ok";
  assert.equal(diagnostics.buildConnectionReport({}).events[0]!.outcome, "failed");
});

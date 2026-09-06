import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Account, Address, Contract, Keypair, Networks, Operation, StrKey, TransactionBuilder, nativeToScVal } from "@stellar/stellar-sdk";
import { allowanceTransactionIsFresh, mandateCanAfford, preparedAllowanceEvidence, readAllowanceConfirmation, walletAmountAtomic, type AllowanceScope } from "../lib/wallet/client-readiness";
import { initialServiceInputValues, serializedServiceInputs, serviceInputProblem } from "../components/wallet/ServiceConfigurator";
import { PDF_URL_INPUTS, WEB_SEARCH_INPUTS, type MarketplaceService } from "../lib/wallet/marketplace-catalog";

const search: MarketplaceService = { id: "search", name: "Web search", description: "Published search", method: "GET", path: "/api/search", price: "0.02", category: "web", categoryLabel: "Web", docs: "https://agent402.tools/tools/search", schemaSource: "verified-docs", inputs: WEB_SEARCH_INPUTS };
const pdf: MarketplaceService = { ...search, id: "pdf", name: "PDF to text", method: "POST", path: "/api/pdf", price: "0.01", inputs: PDF_URL_INPUTS };

test("wallet money comparisons use exact token units", () => {
  assert.equal(walletAmountAtomic("0.02", 7), 200000n);
  assert.equal(walletAmountAtomic(" 2.0698716 ", 7), 20698716n);
  assert.equal(walletAmountAtomic("0.0000001", 7), 1n);
  assert.equal(walletAmountAtomic("0", 7), 0n);
  for (const value of ["", "NaN", "Infinity", "1e-2", "-0.1", "+0.1", ".1", "0.00000001", "0.1.2", "1.", "99999999999999999999999999999999999999999999999999"]) assert.equal(walletAmountAtomic(value, 7), null, value);
});

test("an active mandate needs the complete quoted service price, down to one token unit", () => {
  assert.equal(mandateCanAfford("200000", "0.02", 7), true);
  assert.equal(mandateCanAfford("199999", "0.02", 7), false);
  assert.equal(mandateCanAfford("200000", "0.03", 7), false);
  for (const remaining of [undefined, "-1", "0.02", "NaN", "0"]) assert.equal(mandateCanAfford(remaining, "0.02", 7), false);
  assert.equal(mandateCanAfford("1", "0", 7), false);
});

function approvalXdr(minTime: number, maxTime: number): string {
  return new TransactionBuilder(new Account(Keypair.random().publicKey(), "0"), { fee: "100", networkPassphrase: Networks.TESTNET, timebounds: { minTime, maxTime } })
    .addOperation(Operation.manageData({ name: "unsigned-local-test", value: "fixture" }))
    .build().toXDR();
}

test("a cached approval must leave time for a human to review before Freighter opens", () => {
  const xdr = approvalXdr(0, 1600);
  assert.equal(allowanceTransactionIsFresh(xdr, Networks.TESTNET, 1000), true);
  assert.equal(allowanceTransactionIsFresh(xdr, Networks.TESTNET, 1539), true);
  assert.equal(allowanceTransactionIsFresh(xdr, Networks.TESTNET, 1540), false);
  assert.equal(allowanceTransactionIsFresh(xdr, Networks.TESTNET, 1600), false);
  assert.equal(allowanceTransactionIsFresh(approvalXdr(1200, 1800), Networks.TESTNET, 1000), false);
  assert.equal(allowanceTransactionIsFresh(approvalXdr(0, 0), Networks.TESTNET, 1000), false);
  assert.equal(allowanceTransactionIsFresh("invalid", Networks.TESTNET, 1000), false);
});

test("search prefills the editable Stellar question and preserves optional published parameters", () => {
  const values = initialServiceInputValues(search);
  assert.equal(values.q, "What is Stellar?");
  assert.equal(serviceInputProblem(search, values), null);
  assert.equal(serializedServiceInputs(search, values).q, "What is Stellar?");
  assert.match(serviceInputProblem(search, { ...values, q: "" })!, /Enter q/);
  assert.match(serviceInputProblem(search, { ...values, q: "a" })!, /between 3 and 400/);
  assert.equal(serviceInputProblem(search, { q: "What is Stellar?", count: "10", freshness: "" }), null);
  assert.deepEqual(serializedServiceInputs(search, { q: "What is Stellar?", count: "10", freshness: "" }), { q: "What is Stellar?", count: 10 });
  assert.throws(() => serializedServiceInputs(search, { q: "" }), /Enter q/);
});

test("PDF requires a complete published URL parameter before asking for a quote", () => {
  for (const value of ["", "not-a-url", "file:///private/document.pdf", "https://user:secret@example.com/document.pdf"]) {
    assert.ok(serviceInputProblem(pdf, { url: value }), value);
    assert.throws(() => serializedServiceInputs(pdf, { url: value }));
  }
  assert.deepEqual(serializedServiceInputs(pdf, { url: "https://example.com/document.pdf" }), { url: "https://example.com/document.pdf" });
});

test("schema integer, enum, boolean, and object validity is shared by UI and serialization", () => {
  const service: MarketplaceService = { ...pdf, inputs: [
    { name: "pages", type: "integer", required: true, description: "Page count", options: [], example: 1 },
    { name: "format", type: "string", required: true, description: "Output format", options: ["text", "json"], example: "text" },
    { name: "include", type: "boolean", required: false, description: "Include detail", options: [], example: null },
    { name: "settings", type: "object", required: false, description: "Settings", options: [], example: null },
  ] };
  const valid = { pages: "2", format: "text", include: "false", settings: '{"compact":true}' };
  assert.deepEqual(serializedServiceInputs(service, valid), { pages: 2, format: "text", include: false, settings: { compact: true } });
  for (const invalid of [{ pages: "1.5" }, { format: "html" }, { include: "maybe" }, { settings: "[]" }, { settings: "not-json" }]) {
    assert.ok(serviceInputProblem(service, { ...valid, ...invalid }));
    assert.throws(() => serializedServiceInputs(service, { ...valid, ...invalid }));
  }
});

test("approval click signs immediately only after separate fresh transaction preparation", () => {
  const app = readFileSync(new URL("../components/wallet/WalletChatApp.tsx", import.meta.url), "utf8");
  const retry = app.slice(app.indexOf("const retryAllowance = async"), app.indexOf("const confirmServiceInputs = async"));
  assert.match(retry, /allowanceTransactionIsFresh\(preparedAllowance.xdr, config.networkPassphrase\)/);
  assert.match(retry, /if \(!prepared\)[\s\S]*?await prepareAllowanceTransaction[\s\S]*?return;/);
  assert.match(retry, /approvalInFlight.current/);
  const signing = retry.slice(retry.indexOf('setNotice("Opening Freighter now.'));
  assert.equal(signing.indexOf("await "), signing.indexOf("await submitPreparedAllowanceWithFreighter"));
  const client = readFileSync(new URL("../lib/wallet/mandate-client.ts", import.meta.url), "utf8");
  const submit = client.slice(client.indexOf("export async function submitPreparedAllowanceWithFreighter"), client.indexOf("export async function approveWithFreighter"));
  assert.equal(submit.indexOf("await "), submit.indexOf("await signer.signTransaction"));
  assert.match(submit, /signedTransaction.hash\(\).equals\(preparedTransaction.hash\(\)\)/);
});

function allowanceFixture() {
  const scope: AllowanceScope = { user: Keypair.random().publicKey(), asset: StrKey.encodeContract(Buffer.alloc(32, 1)), spender: StrKey.encodeContract(Buffer.alloc(32, 2)), maxAmount: "1000000" };
  const transactionXdr = new TransactionBuilder(new Account(scope.user, "0"), { fee: "100", networkPassphrase: Networks.TESTNET, timebounds: { minTime: 0, maxTime: 1600 } })
    .addOperation(new Contract(scope.asset).call("approve", new Address(scope.user).toScVal(), new Address(scope.spender).toScVal(), nativeToScVal(BigInt(scope.maxAmount), { type: "i128" }), nativeToScVal(10000, { type: "u32" })))
    .build().toXDR();
  return { scope, transactionXdr, pending: preparedAllowanceEvidence(transactionXdr, Networks.TESTNET, scope, 1000) };
}

test("a retained approval is bound to its source, asset contract, registry spender, and amount", () => {
  const { scope, transactionXdr, pending } = allowanceFixture();
  assert.match(pending.txHash, /^[0-9a-f]{64}$/);
  assert.equal(pending.validUntil, 1600);
  for (const change of [{ user: Keypair.random().publicKey() }, { asset: scope.spender }, { spender: scope.asset }, { maxAmount: "2000000" }]) {
    assert.throws(() => preparedAllowanceEvidence(transactionXdr, Networks.TESTNET, { ...scope, ...change }, 1000));
  }
  assert.throws(() => preparedAllowanceEvidence(approvalXdr(0, 1600), Networks.TESTNET, scope, 1000));
});

test("read-only allowance recovery accepts only SUCCESS for the exact retained transaction", async (t) => {
  const { scope, transactionXdr, pending } = allowanceFixture();
  let response: object = { result: { status: "SUCCESS", envelopeXdr: transactionXdr } };
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url: string | URL | Request, init?: RequestInit) => {
    calls++;
    assert.deepEqual(JSON.parse(String(init?.body)), { jsonrpc: "2.0", id: "allowance-confirmation", method: "getTransaction", params: { hash: pending.txHash } });
    return Response.json(response);
  });
  assert.equal(await readAllowanceConfirmation("/api/wallet/rpc", Networks.TESTNET, scope, pending), "confirmed");
  response = { result: { status: "FAILED", envelopeXdr: transactionXdr } };
  assert.equal(await readAllowanceConfirmation("/api/wallet/rpc", Networks.TESTNET, scope, pending), "failed");
  response = { result: { status: "SUCCESS", envelopeXdr: allowanceFixture().transactionXdr } };
  await assert.rejects(readAllowanceConfirmation("/api/wallet/rpc", Networks.TESTNET, scope, pending));
  response = { result: { status: "SUCCESS" } };
  await assert.rejects(readAllowanceConfirmation("/api/wallet/rpc", Networks.TESTNET, scope, pending), /verification/);
  await assert.rejects(readAllowanceConfirmation("/api/wallet/rpc", Networks.TESTNET, scope, { ...pending, txHash: "f".repeat(64) }), /signed hash/);
  assert.equal(calls, 4, "tampered retained hash fails before network access");
});

test("missing allowance confirmation stays locked until its full validity window is covered by RPC history", async (t) => {
  const { scope, pending } = allowanceFixture();
  let result = { status: "NOT_FOUND", latestLedgerCloseTime: 1500, oldestLedgerCloseTime: 500 };
  t.mock.method(globalThis, "fetch", async () => Response.json({ result }));
  assert.equal(await readAllowanceConfirmation("/api/wallet/rpc", Networks.TESTNET, scope, pending), "pending");
  result = { status: "NOT_FOUND", latestLedgerCloseTime: 1700, oldestLedgerCloseTime: 500 };
  assert.equal(await readAllowanceConfirmation("/api/wallet/rpc", Networks.TESTNET, scope, pending), "expired");
  result = { status: "NOT_FOUND", latestLedgerCloseTime: 1700, oldestLedgerCloseTime: 1100 };
  assert.equal(await readAllowanceConfirmation("/api/wallet/rpc", Networks.TESTNET, scope, pending), "pending");
  result = { status: "UNRECOGNIZED", latestLedgerCloseTime: 1700, oldestLedgerCloseTime: 500 };
  await assert.rejects(readAllowanceConfirmation("/api/wallet/rpc", Networks.TESTNET, scope, pending), /unknown allowance status/);
});

test("signed allowance is retained before submission and retries cannot open another wallet prompt", () => {
  const app = readFileSync(new URL("../components/wallet/WalletChatApp.tsx", import.meta.url), "utf8");
  const retry = app.slice(app.indexOf("const retryAllowance = async"), app.indexOf("const confirmServiceInputs = async"));
  const pendingBranch = retry.slice(retry.indexOf("if (stored.pendingAllowance)"), retry.indexOf("if (stored.expiry"));
  assert.match(pendingBranch, /readAllowanceConfirmation/);
  assert.doesNotMatch(pendingBranch, /submitPreparedAllowanceWithFreighter|signTransaction|prepareAllowanceTransaction/);
  assert.match(pendingBranch, /return;/);
  assert.match(app, /pendingAllowance\?: PendingAllowance/);
  assert.match(app, /Check USDC approval — no new fee/);
  const client = readFileSync(new URL("../lib/wallet/mandate-client.ts", import.meta.url), "utf8");
  assert.match(client, /onPrepared\?\.\(pending\);\s*return submitAllowance/);
});

test("expired quotes and insufficient balances block new runs without hiding receipt recovery", () => {
  const app = readFileSync(new URL("../components/wallet/WalletChatApp.tsx", import.meta.url), "utf8");
  assert.match(app, /const servicePrice = marketplaceQuote\?\.price \?\? marketplaceService.price/);
  assert.match(app, /canRun=\{activeMandateReady && quoteCurrent\}/);
  assert.match(app, /recoverableRun = Boolean\([\s\S]*?\|\| !enoughRemaining\)/);
  assert.match(app, /stored\?\.allowanceTx && stored.expiry <= nowSeconds/);
  assert.match(app, /confirmed.status === "Active" && confirmed.expiry > Math.floor/);
});

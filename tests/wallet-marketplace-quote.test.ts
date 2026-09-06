import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import { loadAppConfig } from "../lib/wallet/app-config";
import { assertQuotedRecipient, issueMarketplaceQuote, verifyMarketplaceQuote } from "../lib/wallet/marketplace-quote";
import { assertSuccessfulDelivery, MAX_DELIVERY_BYTES, modelDeliverySummary, receiptMatchesPurchase } from "../lib/wallet/delivery-result";
import { completeToolCall, reserveToolCall } from "../lib/wallet/journal";

const user = Keypair.random().publicKey();
const seller = Keypair.random().publicKey();
const config = loadAppConfig({ NODE_ENV: "test", ACKRATE_WALLET_NETWORK: "mainnet",
  ACKRATE_CHAT_AGENT_PUBLIC_KEY: Keypair.random().publicKey(), ACKRATE_SESSION_SECRET: "test-only-session-secret-".repeat(3),
  ACKRATE_APP_ORIGIN: "https://example.test" });
const now = 1_788_600_000;
const input = { config, user, sourceId: "agent402-research", parameters: { q: "What is Stellar?", count: 5 }, now };

test("unpaid quote binds wallet, release, service, normalized inputs and published seller", () => {
  const issued = issueMarketplaceQuote({ ...input, payTo: seller });
  const quote = verifyMarketplaceQuote({ ...input, token: issued.token });
  assert.equal(quote.payTo, seller);
  assert.equal(quote.relay, config.public.agentAddress);
  assert.equal(quote.amountAtomic, "200000");
  assert.equal(issued.price, "0.02");
  assert.equal(issued.expiresAt, now + 1800);
  assert.ok(issued.token.length < 1800);
  assert.equal(issued.token.includes(config.sessionSecret!), false);
  assert.deepEqual(verifyMarketplaceQuote({ ...input, token: issued.token, parameters: { count: "5", q: " What   is Stellar? " } }), quote);
  assert.throws(() => verifyMarketplaceQuote({ ...input, token: `${issued.token.slice(0, -3)}xxx` }), /signature/);
  assert.throws(() => verifyMarketplaceQuote({ ...input, token: issued.token, user: seller }), /changed: user/);
  assert.throws(() => verifyMarketplaceQuote({ ...input, token: issued.token, parameters: { q: "A different request", count: 5 } }), /changed: parametersHash/);
  assert.throws(() => verifyMarketplaceQuote({ ...input, token: issued.token, sourceId: "agent402-pdf", parameters: { url: "https://example.com/paper.pdf" } }), /changed: sourceId/);
  assert.throws(() => verifyMarketplaceQuote({ ...input, token: issued.token, config: { ...config, public: { ...config.public, releaseFingerprint: "new-release" } } }), /changed: release/);
});

test("expired quotes cannot start purchases; only verified settled receipts recover", () => {
  const { token } = issueMarketplaceQuote({ ...input, payTo: seller });
  assert.throws(() => verifyMarketplaceQuote({ ...input, token, now: now + 1800 }), /expired/);
  assert.doesNotThrow(() => verifyMarketplaceQuote({ ...input, token, now: now + 3600, settledRecovery: true }));
  assert.throws(() => verifyMarketplaceQuote({ ...input, token, now: now - 61 }), /time window/);
});

test("recipient, amount, asset and network changes fail before marketplace signing", () => {
  const { token } = issueMarketplaceQuote({ ...input, payTo: seller });
  const quote = verifyMarketplaceQuote({ ...input, token });
  const expected = { payTo: seller, amount: "200000", asset: config.public.asset.contractId, network: "stellar:pubnet" };
  assert.doesNotThrow(() => assertQuotedRecipient(quote, expected));
  for (const changed of [{ payTo: user }, { amount: "900000" }, { asset: "different-token" }, { network: "stellar:testnet" }]) {
    assert.throws(() => assertQuotedRecipient(quote, { ...expected, ...changed }), /payment details changed/);
  }
});

test("HTTP 200 terminal failures or absent marketplace evidence are not successful deliveries", () => {
  const expected = { sourceId: "agent402-research", txHash: "a".repeat(64), mandateId: "b".repeat(64),
    price: "0.02", assetCode: "USDC", assetContract: config.public.asset.contractId };
  assert.throws(() => assertSuccessfulDelivery({ ok: false, deliveryState: "terminal", error: "paid fulfillment failed after settlement" }, expected), /contract payment settled, but service delivery failed/);
  const delivered = { ok: true, source: expected.sourceId, settledTx: expected.txHash, mandateId: expected.mandateId,
    settledAmount: expected.price, asset: "USDC", brief: { title: "Stellar" } };
  assert.throws(() => assertSuccessfulDelivery(delivered, expected), /marketplace receipt/);
  const good = { ...delivered, marketplace: { settlement: { transaction: "c".repeat(64), network: "stellar:pubnet",
    asset: expected.assetContract, amountAtomic: "200000", amount: "0.02", payTo: seller } } };
  assert.doesNotThrow(() => assertSuccessfulDelivery(good, expected));
  assert.throws(() => assertSuccessfulDelivery({ ...good, mandateId: "d".repeat(64) }, expected), /does not match/);
});

test("PDF result storage allows the bounded evidence envelope; model context stays compact", () => {
  const result = { source: { id: "agent402-pdf" }, payment: { txHash: "f".repeat(64) },
    delivered: { toolOutput: { text: "x".repeat(2 * 1024 * 1024 - 100) }, marketplace: { settlement: { transaction: "c".repeat(64) } } } };
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < MAX_DELIVERY_BYTES);
  const summary = modelDeliverySummary(result);
  assert.ok(summary.length <= 32_000);
  assert.match(summary, /preview may be truncated/);
  assert.ok(summary.includes("c".repeat(64)));
});

test("durable run identity retains original input hash under duplicate requests", async () => {
  const run = { sessionId: crypto.randomUUID(), toolCallId: `configured:${crypto.randomUUID()}`, mandateId: "a".repeat(64), sourceId: "agent402-research", requestHash: "1".repeat(64) };
  assert.equal((await reserveToolCall(run)).created, true);
  await completeToolCall({ ...run, status: "succeeded", result: { original: true } });
  const changed = await reserveToolCall({ ...run, requestHash: "2".repeat(64) });
  assert.equal(changed.created, false);
  assert.equal(changed.record.requestHash, run.requestHash);
  assert.deepEqual(changed.record.result, { original: true });
});

test("a concurrent tab cannot associate another request's retained receipt with its own output", () => {
  const requested = "https://example.test/api/wallet/source/agent402-research?q=Stellar&_quote=one";
  assert.equal(receiptMatchesPurchase({ url: requested, method: "GET" }, requested), true);
  assert.equal(receiptMatchesPurchase({ url: requested, method: "GET" }, requested.replace("Stellar", "Solana")), false);
  assert.equal(receiptMatchesPurchase({ url: requested, method: "GET" }, requested.replace("one", "two")), false);
  assert.equal(receiptMatchesPurchase({ url: requested, method: "POST" }, requested), false);
});

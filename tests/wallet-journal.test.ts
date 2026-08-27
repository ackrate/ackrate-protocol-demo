import assert from "node:assert/strict";
import test from "node:test";
import {
  completePendingToolCalls,
  completeToolCall,
  consumeChallenge,
  DurableReceiptStore,
  latestSucceededToolCall,
  reserveToolCall,
} from "../lib/wallet/journal";

test("authentication challenge can be consumed only once", async () => {
  const jti = crypto.randomUUID().replaceAll("-", "");
  assert.equal(await consumeChallenge(jti, Math.floor(Date.now() / 1_000) + 60), true);
  assert.equal(await consumeChallenge(jti, Math.floor(Date.now() / 1_000) + 60), false);
});

test("a completed delivery remains recoverable after its receipt is acknowledged", async () => {
  const sessionId = crypto.randomUUID();
  const mandateId = "9".repeat(64);
  const toolCallId = crypto.randomUUID();
  await reserveToolCall({ sessionId, toolCallId, mandateId, sourceId: "market-brief" });
  const result = { payment: { txHash: "8".repeat(64) } };
  await completeToolCall({ sessionId, toolCallId, status: "succeeded", result });
  assert.deepEqual((await latestSucceededToolCall({ sessionId, mandateId }))?.result, result);
});

test("tool-call reservation is idempotent and returns the durable result", async () => {
  const sessionId = crypto.randomUUID();
  const toolCallId = crypto.randomUUID();
  const input = { sessionId, toolCallId, mandateId: "a".repeat(64), sourceId: "market-brief" };
  const first = await reserveToolCall(input);
  assert.equal(first.created, true);
  await completeToolCall({ sessionId, toolCallId, status: "succeeded", result: { txHash: "b".repeat(64) } });
  const duplicate = await reserveToolCall(input);
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.record.status, "succeeded");
  assert.deepEqual(duplicate.record.result, { txHash: "b".repeat(64) });
});

test("delivery recovery closes only the matching pending tool call", async () => {
  const sessionId = crypto.randomUUID();
  const toolCallId = crypto.randomUUID();
  const input = { sessionId, toolCallId, mandateId: "c".repeat(64), sourceId: "market-brief" };
  await reserveToolCall(input);
  await completeToolCall({ sessionId, toolCallId, status: "delivery_pending", result: { pending: true } });
  const result = { payment: { txHash: "d".repeat(64) } };
  await completePendingToolCalls({
    sessionId,
    mandateId: input.mandateId,
    sourceId: input.sourceId,
    result,
  });
  const recovered = await reserveToolCall(input);
  assert.equal(recovered.created, false);
  assert.equal(recovered.record.status, "succeeded");
  assert.deepEqual(recovered.record.result, result);
});

test("pending settlement receipt survives listing until explicit acknowledgement", async () => {
  const sessionId = crypto.randomUUID();
  const mandateId = "e".repeat(64);
  const store = new DurableReceiptStore(sessionId, mandateId);
  const receipt = {
    receiptId: "f".repeat(64),
    proofVersion: 2 as const,
    url: "https://merchant.example/source",
    method: "GET",
    txHash: "1".repeat(64),
    mandateId,
    amount: "0.01",
    submittedAt: 1,
    validUntil: 2,
    proof: {
      proofVersion: 2 as const,
      scheme: "ackrate-soroban-bound",
      network: "stellar-mainnet",
      txHash: "1".repeat(64),
      mandateId,
      challenge: {
        proofVersion: 2 as const,
        challengeId: "challenge",
        audience: "https://merchant.example",
        scheme: "ackrate-soroban-bound",
        method: "GET",
        resource: "/source",
        bodySha256: null,
        network: "stellar-mainnet",
        networkId: "2".repeat(64),
        registryId: "C".repeat(56),
        merchant: "G".repeat(56),
        asset: "C".repeat(56),
        amountStroops: "100000",
        decimals: 7,
        issuedAt: 1,
        expiresAt: 2,
        authorization: { algorithm: "hmac-sha256" as const, mac: "mac" },
      },
      authorization: { algorithm: "stellar-ed25519-sha256" as const, signature: "signature" },
    },
  };
  await store.savePending(receipt);
  assert.deepEqual(await store.listPending(), [receipt]);
  await store.clearPending(receipt.receiptId);
  assert.deepEqual(await store.listPending(), []);
});

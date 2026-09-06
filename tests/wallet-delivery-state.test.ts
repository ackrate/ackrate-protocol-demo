import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { BoundDeliveryRecord, StoredBoundJsonResponse } from "@ackrate/express-middleware";
import { StrKey } from "@stellar/stellar-sdk";
import { assertDeliveryCanRecover, existingPurchaseResult, PaidDeliveryReconciliationError, recoveryStateForUnredeemedProof, recoveryStateForVerifiedDelivery } from "../lib/wallet/delivery-result";

const address = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 1));
const base = {
  key: "test-redemption-key", proofDigest: "d".repeat(64), executionId: "one-owner", startedAt: 100,
  payment: {
    txHash: "a".repeat(64), mandateId: "b".repeat(64), user: address, agent: address,
    amount: "0.02", amountStroops: 200000n, merchant: address, asset: StrKey.encodeContract(Buffer.alloc(32, 2)),
    registryId: StrKey.encodeContract(Buffer.alloc(32, 3)), scheme: "ackrate-soroban-bound", network: "stellar-mainnet", ledger: 100,
  },
};

function stored(body: unknown): StoredBoundJsonResponse {
  const bytes = Buffer.from(JSON.stringify(body));
  return { status: 200, contentType: "application/json; charset=utf-8", bodyBase64: bytes.toString("base64"),
    bodySha256: createHash("sha256").update(bytes).digest("hex") };
}

test("prepared receipt alone does not assert confirmed settlement or a completed result", () => {
  const state = recoveryStateForVerifiedDelivery(null);
  assert.equal(state.paymentConfirmed, false);
  assert.equal(state.deliveryState, "pending");
  assert.match(state.message!, /not yet confirmed/);
  assert.doesNotThrow(() => assertDeliveryCanRecover(state));
});

test("expired unredeemed proof needs reconciliation without asserting settlement or reopening payment", () => {
  assert.equal(recoveryStateForUnredeemedProof(1001, 1000).deliveryState, "pending");
  const expired = recoveryStateForUnredeemedProof(1000, 1000);
  assert.equal(expired.deliveryState, "reconciliation_required");
  assert.equal(expired.paymentConfirmed, false);
  assert.throws(() => assertDeliveryCanRecover(expired), /expired before service redemption/);
});

test("verified executing delivery remains pending and matching saved output is ready", () => {
  const executing = recoveryStateForVerifiedDelivery({ ...base, state: "executing" });
  assert.equal(executing.paymentConfirmed, true);
  assert.equal(executing.deliveryState, "pending");
  const ready = recoveryStateForVerifiedDelivery({ ...base, state: "completed", response: stored({ ok: true, source: "agent402-research" }) });
  assert.equal(ready.paymentConfirmed, true);
  assert.equal(ready.deliveryState, "ready");
});

test("terminal HTTP 200 result is never reported ready and never allows recovery execution", (t) => {
  const fetchGuard = t.mock.method(globalThis, "fetch", async () => { throw new Error("offline state check cannot make a payment or network request"); });
  const record: BoundDeliveryRecord = { ...base, state: "completed", response: stored({ ok: false, deliveryState: "terminal", error: "paid fulfillment failed after settlement" }) };
  const exactBefore = JSON.stringify(record.response);
  const state = recoveryStateForVerifiedDelivery(record);
  assert.equal(state.paymentConfirmed, true);
  assert.equal(state.deliveryState, "reconciliation_required");
  assert.throws(() => assertDeliveryCanRecover(state), PaidDeliveryReconciliationError);
  assert.match(state.message!, /Repeating recovery cannot rerun/);
  assert.equal(JSON.stringify(record.response), exactBefore, "classification must not rewrite stored response bytes");
  assert.equal(fetchGuard.mock.callCount(), 0);
});

test("corrupt durable response bytes fail closed instead of advertising recovery success", () => {
  const response = stored({ ok: true });
  assert.throws(() => recoveryStateForVerifiedDelivery({ ...base, state: "completed", response: { ...response, bodySha256: "0".repeat(64) } }), /integrity check/);
  assert.throws(() => recoveryStateForVerifiedDelivery({ ...base, state: "completed", response: { ...response, status: 503 } }), /integrity check/);
});

test("saved HTTP 200 output with missing marketplace settlement requires reconciliation, not a retry loop", () => {
  const expected = { sourceId: "agent402-research", txHash: base.payment.txHash, mandateId: base.payment.mandateId,
    price: "0.02", assetCode: "USDC", assetContract: base.payment.asset };
  const record: BoundDeliveryRecord = { ...base, state: "completed", response: stored({
    ok: true, source: expected.sourceId, settledTx: expected.txHash, mandateId: expected.mandateId,
    settledAmount: expected.price, asset: expected.assetCode, brief: { title: "Stellar" },
  }) };
  const state = recoveryStateForVerifiedDelivery(record, expected);
  assert.equal(state.deliveryState, "reconciliation_required");
  assert.equal(state.paymentConfirmed, true);
  assert.match(state.message!, /marketplace receipt is missing/);
  assert.throws(() => assertDeliveryCanRecover(state), /do not pay again/);
});

test("every previously reserved attempt returns its existing result or stops; retained settlement cannot repay", () => {
  const result = { original: "paid-output" };
  assert.equal(existingPurchaseResult({ status: "succeeded", result }), result);
  for (const status of ["running", "failed", "delivery_pending", "unknown-state"]) {
    assert.throws(() => existingPurchaseResult({ status, result: null }));
  }
  assert.throws(() => existingPurchaseResult({ status: "delivery_pending", result: { txHash: "a".repeat(64) } }), /do not make another payment/);
});

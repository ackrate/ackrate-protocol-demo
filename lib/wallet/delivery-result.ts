import { StrKey } from "@stellar/stellar-sdk";
import { createHash } from "node:crypto";
import type { BoundPaymentProofV2 } from "@ackrate/core";
import type { BoundDeliveryRecord } from "@ackrate/express-middleware";
import { supportedAgent402ToolForSource } from "./agent402-tools";

// Upstream JSON is capped at 2 MiB. The stored envelope includes a copy of the
// raw tool output in evidence, so allow that plus bounded metadata overhead.
export const MAX_DELIVERY_BYTES = 5 * 1024 * 1024;
export const MAX_BOUND_PAYMENT_HEADER_BYTES = 8_192;

export interface DeliveryRecoveryState {
  deliveryState: "pending" | "ready" | "reconciliation_required";
  paymentConfirmed: boolean;
  message?: string;
}

export class PaidDeliveryReconciliationError extends Error {}

interface ExpectedDelivery {
  sourceId: string; txHash: string; mandateId: string; price: string; assetCode: string; assetContract: string;
}

/** A previously reserved payment attempt must never fall through to a new payment. */
export function existingPurchaseResult(attempt: { status: string; result: unknown }): unknown {
  if (attempt.status === "succeeded") return attempt.result;
  if (attempt.status === "running") throw new Error("this purchase is already in progress");
  if (attempt.status === "failed") throw new Error("this exact purchase attempt previously failed; start a new chat request");
  throw new PaidDeliveryReconciliationError("This purchase already has settlement evidence retained for recovery. Reconcile its existing receipt; do not make another payment.");
}

/** Call only after the durable record has matched the receipt and its agent signature. */
export function recoveryStateForVerifiedDelivery(record: Readonly<BoundDeliveryRecord> | null, expected?: ExpectedDelivery): DeliveryRecoveryState {
  if (!record) {
    return { deliveryState: "pending", paymentConfirmed: false,
      message: "A prepared payment receipt is retained. Its settlement is not yet confirmed here. Recover this same receipt; do not create another payment." };
  }
  if (record.state === "executing") {
    return { deliveryState: "pending", paymentConfirmed: true,
      message: "The contract payment is confirmed. Delivery is still pending; recovery will not make another payment." };
  }
  const stored = record.response;
  const bytes = Buffer.from(stored.bodyBase64, "base64");
  if (bytes.length > MAX_DELIVERY_BYTES || bytes.toString("base64") !== stored.bodyBase64
    || createHash("sha256").update(bytes).digest("hex") !== stored.bodySha256
    || stored.status < 200 || stored.status > 299 || stored.contentType !== "application/json; charset=utf-8") {
    throw new Error("Stored delivery evidence failed its integrity check. Keep this receipt for reconciliation; do not pay again.");
  }
  const delivered = object(JSON.parse(bytes.toString("utf8")));
  if (!delivered || delivered.ok !== true || delivered.deliveryState === "terminal") {
    return { deliveryState: "reconciliation_required", paymentConfirmed: true,
      message: "The contract payment is confirmed, but the service returned a terminal failure. Repeating recovery cannot rerun it. Keep this receipt for reconciliation; do not pay again." };
  }
  if (expected) {
    try {
      assertSuccessfulDelivery(delivered, expected);
    } catch (error) {
      if (!(error instanceof PaidDeliveryReconciliationError)) throw error;
      return { deliveryState: "reconciliation_required", paymentConfirmed: true, message: error.message };
    }
  }
  return { deliveryState: "ready", paymentConfirmed: true };
}

export function assertDeliveryCanRecover(state: DeliveryRecoveryState): void {
  if (state.deliveryState === "reconciliation_required") throw new PaidDeliveryReconciliationError(state.message);
}

export function recoveryStateForUnredeemedProof(expiresAt: number, now = Math.floor(Date.now() / 1000)): DeliveryRecoveryState {
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) {
    return { deliveryState: "reconciliation_required", paymentConfirmed: false,
      message: "This retained payment proof expired before service redemption. Repeating it cannot unlock the service. Keep the receipt and check its transaction for reconciliation; do not pay again." };
  }
  return recoveryStateForVerifiedDelivery(null);
}

/** Check the paid retry's wire size before the SDK can submit a transaction. */
export function assertBoundPaymentRequestSize(input: {
  url: string; registry: string; merchant: string; asset: string;
  amountAtomic: string; decimals: number; network: string;
}): void {
  const target = new URL(input.url);
  // This is only a size model, never a signed proof. Fixed-width placeholders
  // reserve every authentication byte; maximum-width times overestimate the
  // installed SDK's canonical serialization without creating a signer.
  const model: BoundPaymentProofV2 = {
    proofVersion: 2, scheme: "ackrate-soroban-bound", network: input.network,
    txHash: "0".repeat(64), mandateId: "0".repeat(64),
    challenge: {
      proofVersion: 2, challengeId: "0".repeat(43), audience: target.origin,
      scheme: "ackrate-soroban-bound", method: "GET",
      resource: `${target.pathname}${target.search}`, bodySha256: null,
      network: input.network, networkId: "0".repeat(64), registryId: input.registry,
      merchant: input.merchant, asset: input.asset, amountStroops: input.amountAtomic,
      decimals: input.decimals, issuedAt: Number.MAX_SAFE_INTEGER - 900,
      expiresAt: Number.MAX_SAFE_INTEGER,
      authorization: { algorithm: "hmac-sha256", mac: Buffer.alloc(32).toString("base64") },
    },
    authorization: { algorithm: "stellar-ed25519-sha256", signature: Buffer.alloc(64).toString("base64") },
  };
  const encodedBytes = 4 * Math.ceil(Buffer.byteLength(JSON.stringify(model), "utf8") / 3);
  if (encodedBytes > MAX_BOUND_PAYMENT_HEADER_BYTES) {
    throw new Error("These service inputs are too large for the protected payment request. Use a shorter question or PDF URL. No new payment was sent.");
  }
}

export function receiptMatchesPurchase(receipt: { url: string; method: string }, requestedUrl: string | undefined): boolean {
  return Boolean(requestedUrl && receipt.method === "GET" && receipt.url === requestedUrl);
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function assertSuccessfulDelivery(value: unknown, expected: ExpectedDelivery): void {
  const delivered = object(value);
  if (!delivered || delivered.ok !== true || delivered.deliveryState === "terminal") {
    throw new PaidDeliveryReconciliationError("The contract payment settled, but service delivery failed. Keep this receipt for reconciliation; do not make a second payment.");
  }
  if (delivered.source !== expected.sourceId || delivered.settledTx !== expected.txHash
    || delivered.mandateId !== expected.mandateId || delivered.settledAmount !== expected.price
    || delivered.asset !== expected.assetCode) {
    throw new PaidDeliveryReconciliationError("The paid response does not match this settlement. Keep the receipt for reconciliation; do not pay again.");
  }
  const tool = supportedAgent402ToolForSource(expected.sourceId);
  if (!tool) return;
  const settlement = object(object(delivered.marketplace)?.settlement);
  if (!settlement || typeof settlement.transaction !== "string" || !/^[0-9a-f]{64}$/i.test(settlement.transaction)
    || settlement.network !== "stellar:pubnet" || settlement.asset !== expected.assetContract
    || settlement.amountAtomic !== tool.amountAtomic || settlement.amount !== tool.price
    || typeof settlement.payTo !== "string" || !StrKey.isValidEd25519PublicKey(settlement.payTo)) {
    throw new PaidDeliveryReconciliationError("The marketplace receipt is missing or mismatched. The contract payment is retained for reconciliation; do not pay again.");
  }
  if (tool.slug === "search" ? !object(delivered.brief) : delivered.toolOutput === undefined) {
    throw new PaidDeliveryReconciliationError("Marketplace settlement was returned without the service output. Keep the existing receipt; do not pay again.");
  }
}

/** Keep complete paid output for the user, but bound what is sent to the model. */
export function modelDeliverySummary(value: unknown): string {
  const result = object(value);
  const delivered = object(result?.delivered);
  const summary = {
    source: result?.source,
    payment: result?.payment,
    marketplaceSettlement: object(delivered?.marketplace)?.settlement,
    brief: delivered?.brief,
    service: delivered?.service,
    outputPreview: delivered?.toolOutput === undefined ? undefined : JSON.stringify(delivered.toolOutput).slice(0, 16_000),
    note: "The complete service output and downloads are retained in the result view. A preview may be truncated; do not claim to have read beyond it.",
  };
  return JSON.stringify(summary).slice(0, 32_000);
}

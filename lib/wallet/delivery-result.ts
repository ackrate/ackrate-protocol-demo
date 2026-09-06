import { StrKey } from "@stellar/stellar-sdk";
import { supportedAgent402ToolForSource } from "./agent402-tools";

// Upstream JSON is capped at 2 MiB. The stored envelope includes a copy of the
// raw tool output in evidence, so allow that plus bounded metadata overhead.
export const MAX_DELIVERY_BYTES = 5 * 1024 * 1024;

export function receiptMatchesPurchase(receipt: { url: string; method: string }, requestedUrl: string | undefined): boolean {
  return Boolean(requestedUrl && receipt.method === "GET" && receipt.url === requestedUrl);
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function assertSuccessfulDelivery(value: unknown, expected: {
  sourceId: string; txHash: string; mandateId: string; price: string; assetCode: string; assetContract: string;
}): void {
  const delivered = object(value);
  if (!delivered || delivered.ok !== true || delivered.deliveryState === "terminal") {
    throw new Error("The contract payment settled, but service delivery failed. Keep this receipt for reconciliation; do not make a second payment.");
  }
  if (delivered.source !== expected.sourceId || delivered.settledTx !== expected.txHash
    || delivered.mandateId !== expected.mandateId || delivered.settledAmount !== expected.price
    || delivered.asset !== expected.assetCode) {
    throw new Error("The paid response does not match this settlement. Keep the receipt for reconciliation; do not pay again.");
  }
  const tool = supportedAgent402ToolForSource(expected.sourceId);
  if (!tool) return;
  const settlement = object(object(delivered.marketplace)?.settlement);
  if (!settlement || typeof settlement.transaction !== "string" || !/^[0-9a-f]{64}$/i.test(settlement.transaction)
    || settlement.network !== "stellar:pubnet" || settlement.asset !== expected.assetContract
    || settlement.amountAtomic !== tool.amountAtomic || settlement.amount !== tool.price
    || typeof settlement.payTo !== "string" || !StrKey.isValidEd25519PublicKey(settlement.payTo)) {
    throw new Error("The marketplace receipt is missing or mismatched. The contract payment is retained for reconciliation; do not pay again.");
  }
  if (tool.slug === "search" ? !object(delivered.brief) : delivered.toolOutput === undefined) {
    throw new Error("Marketplace settlement was returned without the service output. Keep the existing receipt; do not pay again.");
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

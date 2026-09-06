import { Address, TransactionBuilder, scValToNative } from "@stellar/stellar-sdk";

export interface AllowanceScope { user: string; asset: string; spender: string; maxAmount: string }
export interface PendingAllowance { txHash: string; transactionXdr: string; submittedAt: number; validUntil: number }

/** Check the exact allowance body before signing and again before trusting a recovered receipt. */
export function preparedAllowanceEvidence(transactionXdr: string, networkPassphrase: string, scope: AllowanceScope, submittedAt = Math.floor(Date.now() / 1_000)): PendingAllowance {
  const transaction = TransactionBuilder.fromXDR(transactionXdr, networkPassphrase);
  if (!("source" in transaction) || transaction.source !== scope.user || transaction.operations.length !== 1) throw new Error("The allowance transaction source does not match this wallet.");
  const operation = transaction.operations[0]!;
  if (operation.type !== "invokeHostFunction" || (operation.source && operation.source !== scope.user)
    || operation.func.switch().name !== "hostFunctionTypeInvokeContract") throw new Error("The transaction is not the expected contract allowance.");
  const invocation = operation.func.invokeContract();
  const args = invocation.args().map((value) => scValToNative(value));
  if (Address.fromScAddress(invocation.contractAddress()).toString() !== scope.asset
    || invocation.functionName().toString() !== "approve" || args.length !== 4
    || args[0] !== scope.user || args[1] !== scope.spender || args[2] !== BigInt(scope.maxAmount)
    || !Number.isSafeInteger(args[3]) || Number(args[3]) <= 0) throw new Error("The allowance asset, contract recipient, or amount changed.");
  const validUntil = Number(transaction.timeBounds?.maxTime);
  if (!Number.isSafeInteger(submittedAt) || submittedAt <= 0 || !Number.isSafeInteger(validUntil) || validUntil <= submittedAt) throw new Error("The allowance transaction has no valid expiry.");
  return { txHash: transaction.hash().toString("hex"), transactionXdr, submittedAt, validUntil };
}

/** Read-only reconciliation. Missing history or an ambiguous RPC response never permits another approval. */
export async function readAllowanceConfirmation(rpcUrl: string, networkPassphrase: string, scope: AllowanceScope, pending: PendingAllowance): Promise<"confirmed" | "failed" | "expired" | "pending"> {
  const expected = preparedAllowanceEvidence(pending.transactionXdr, networkPassphrase, scope, pending.submittedAt);
  if (expected.txHash !== pending.txHash || expected.validUntil !== pending.validUntil) throw new Error("The retained allowance does not match its signed hash.");
  const response = await fetch(rpcUrl, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: "allowance-confirmation", method: "getTransaction", params: { hash: pending.txHash } }) });
  if (!response.ok) throw new Error(`Stellar confirmation returned HTTP ${response.status}`);
  const body = await response.json() as { error?: unknown; result?: { status?: string; envelopeXdr?: string; latestLedgerCloseTime?: number; oldestLedgerCloseTime?: number } };
  if (body.error || !body.result) throw new Error("Stellar could not confirm the existing allowance yet.");
  const result = body.result;
  if (result.status === "SUCCESS" || result.status === "FAILED") {
    if (!result.envelopeXdr) throw new Error("Stellar did not return the allowance transaction for verification.");
    const confirmed = preparedAllowanceEvidence(result.envelopeXdr, networkPassphrase, scope, pending.submittedAt);
    if (confirmed.txHash !== pending.txHash) throw new Error("Stellar returned a different allowance transaction.");
    return result.status === "SUCCESS" ? "confirmed" : "failed";
  }
  if (result.status === "NOT_FOUND") {
    const latest = result.latestLedgerCloseTime;
    const oldest = result.oldestLedgerCloseTime;
    if (Number.isSafeInteger(latest) && Number.isSafeInteger(oldest)
      && oldest! > 0 && oldest! <= pending.submittedAt && latest! > pending.validUntil) return "expired";
    return "pending";
  }
  throw new Error("Stellar returned an unknown allowance status. No new approval was sent.");
}

/** Parse displayed token units without accepting rounding, exponents, or excess precision. */
export function walletAmountAtomic(value: string, decimals: number): bigint | null {
  const normalized = value.trim();
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 18
    || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > decimals) return null;
  const amount = BigInt(whole!) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
  return amount <= (1n << 127n) - 1n ? amount : null;
}

export function mandateCanAfford(remaining: string | undefined, price: string, decimals: number): boolean {
  const minimum = walletAmountAtomic(price, decimals);
  return Boolean(remaining && /^\d+$/.test(remaining) && minimum !== null && minimum > 0n && BigInt(remaining) >= minimum);
}

/** Starting over is navigation, never authority to replace a live or unconfirmed allowance. */
export function canStartFreshWalletLimit(
  stored: { id: string; expiry: number; pendingAllowance?: unknown } | null,
  confirmed: { id: string; status: string } | null,
  nowSeconds = Math.floor(Date.now() / 1_000),
): boolean {
  if (!stored || stored.pendingAllowance || !Number.isSafeInteger(stored.expiry)
    || !Number.isSafeInteger(nowSeconds)) return false;
  return stored.expiry <= nowSeconds || Boolean(confirmed?.id === stored.id
    && (confirmed.status === "Revoked" || confirmed.status === "Exhausted"));
}

/** Keep every prior mandate reference; starting a new setup must not erase payment evidence. */
export function retainWalletMandate<T extends { id: string }>(history: readonly T[], current: T): T[] {
  return [current, ...history.filter((entry) => entry.id !== current.id)];
}

/** A synchronous check preserves the wallet-opening click's user activation. */
export function allowanceTransactionIsFresh(xdr: string, networkPassphrase: string, nowSeconds = Math.floor(Date.now() / 1_000)): boolean {
  try {
    const transaction = TransactionBuilder.fromXDR(xdr, networkPassphrase);
    if (!("timeBounds" in transaction) || !transaction.timeBounds) return false;
    const validUntil = Number(transaction.timeBounds.maxTime);
    const validAfter = Number(transaction.timeBounds.minTime);
    return Number.isSafeInteger(validUntil) && Number.isSafeInteger(validAfter)
      && validAfter <= nowSeconds && validUntil > nowSeconds + 60;
  } catch { return false; }
}

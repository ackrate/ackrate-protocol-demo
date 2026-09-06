import { Address, TransactionBuilder, scValToNative } from "@stellar/stellar-sdk";

export interface AllowanceScope { user: string; asset: string; spender: string; maxAmount: string }
export interface PendingAllowance { txHash: string; transactionXdr: string; submittedAt: number; validUntil: number }
export type AllowanceConfirmation = "confirmed" | "failed" | "expired" | "pending";
export interface AllowanceConfirmationOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  intervalMs?: number;
  onRetry?: () => void;
}

const ALLOWANCE_READ_TIMEOUT_MS = 15_000;
const ALLOWANCE_WAIT_TIMEOUT_MS = 120_000;
const ALLOWANCE_POLL_INTERVAL_MS = 2_000;

class AllowanceVerificationError extends Error {}

function cancellationReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Allowance confirmation was cancelled.", "AbortError");
}

function confirmationDeadline(timeoutMs: number, parent?: AbortSignal) {
  const controller = new AbortController();
  const cancel = () => controller.abort(parent ? cancellationReason(parent) : undefined);
  const timer = setTimeout(() => controller.abort(new DOMException("Allowance confirmation timed out.", "TimeoutError")), timeoutMs);
  if (parent?.aborted) cancel();
  else parent?.addEventListener("abort", cancel, { once: true });
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", cancel);
    },
  };
}

/** Also bounds response-body reads and transports that do not promptly honor abort. */
function abortableConfirmation<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(cancellationReason(signal));
  return new Promise<T>((resolve, reject) => {
    const cancel = () => { signal.removeEventListener("abort", cancel); reject(cancellationReason(signal)); };
    signal.addEventListener("abort", cancel, { once: true });
    Promise.resolve().then(() => {
      if (signal.aborted) throw cancellationReason(signal);
      return operation();
    }).then(resolve, reject).finally(() => signal.removeEventListener("abort", cancel));
  });
}

function waitForConfirmationRetry(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(cancellationReason(signal));
  return new Promise<void>((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); signal.removeEventListener("abort", cancel); reject(cancellationReason(signal)); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", cancel); resolve(); }, milliseconds);
    signal.addEventListener("abort", cancel, { once: true });
  });
}

function validateRetainedAllowance(networkPassphrase: string, scope: AllowanceScope, pending: PendingAllowance): void {
  const expected = preparedAllowanceEvidence(pending.transactionXdr, networkPassphrase, scope, pending.submittedAt);
  if (expected.txHash !== pending.txHash || expected.validUntil !== pending.validUntil) throw new AllowanceVerificationError("The retained allowance does not match its signed hash.");
}

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
export async function readAllowanceConfirmation(rpcUrl: string, networkPassphrase: string, scope: AllowanceScope, pending: PendingAllowance, signal?: AbortSignal): Promise<AllowanceConfirmation> {
  validateRetainedAllowance(networkPassphrase, scope, pending);
  const deadline = confirmationDeadline(ALLOWANCE_READ_TIMEOUT_MS, signal);
  try {
    return await abortableConfirmation(async () => {
      const response = await fetch(rpcUrl, {
        method: "POST", credentials: "same-origin", cache: "no-store", signal: deadline.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "allowance-confirmation", method: "getTransaction", params: { hash: pending.txHash } }),
      });
      if (!response.ok) throw new Error(`Stellar confirmation returned HTTP ${response.status}`);
      const body = await response.json() as { error?: unknown; result?: { status?: string; envelopeXdr?: string; latestLedgerCloseTime?: number; oldestLedgerCloseTime?: number } };
      if (body.error || !body.result) throw new Error("Stellar could not confirm the existing allowance yet.");
      const result = body.result;
      if (result.status === "SUCCESS" || result.status === "FAILED") {
        if (!result.envelopeXdr) throw new AllowanceVerificationError("Stellar did not return the allowance transaction for verification.");
        let confirmed: PendingAllowance;
        try { confirmed = preparedAllowanceEvidence(result.envelopeXdr, networkPassphrase, scope, pending.submittedAt); }
        catch { throw new AllowanceVerificationError("Stellar returned an allowance transaction that could not be verified."); }
        if (confirmed.txHash !== pending.txHash) throw new AllowanceVerificationError("Stellar returned a different allowance transaction.");
        return result.status === "SUCCESS" ? "confirmed" : "failed";
      }
      if (result.status === "NOT_FOUND") {
        const latest = result.latestLedgerCloseTime;
        const oldest = result.oldestLedgerCloseTime;
        if (Number.isSafeInteger(latest) && Number.isSafeInteger(oldest)
          && oldest! > 0 && oldest! <= pending.submittedAt && latest! > pending.validUntil) return "expired";
        return "pending";
      }
      throw new AllowanceVerificationError("Stellar returned an unknown allowance status. No new approval was sent.");
    }, deadline.signal);
  } finally { deadline.dispose(); }
}

/** Poll one retained receipt only. A timeout never authorizes a replacement transaction. */
export async function waitForAllowanceConfirmation(
  rpcUrl: string,
  networkPassphrase: string,
  scope: AllowanceScope,
  pending: PendingAllowance,
  options: AllowanceConfirmationOptions = {},
): Promise<AllowanceConfirmation> {
  validateRetainedAllowance(networkPassphrase, scope, pending);
  const timeoutMs = options.timeoutMs ?? ALLOWANCE_WAIT_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? ALLOWANCE_POLL_INTERVAL_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || timeoutMs > 2_147_483_647
    || !Number.isFinite(intervalMs) || intervalMs <= 0 || intervalMs > 2_147_483_647) throw new Error("Invalid allowance confirmation timing.");
  if (options.signal?.aborted) throw cancellationReason(options.signal);
  if (timeoutMs === 0) return "pending";
  const deadline = confirmationDeadline(timeoutMs, options.signal);
  try {
    while (!deadline.signal.aborted) {
      try {
        const status = await readAllowanceConfirmation(rpcUrl, networkPassphrase, scope, pending, deadline.signal);
        if (status !== "pending") return status;
      } catch (cause) {
        if (deadline.signal.aborted || cause instanceof AllowanceVerificationError) throw cause;
      }
      options.onRetry?.();
      await waitForConfirmationRetry(intervalMs, deadline.signal);
    }
    return "pending";
  } catch (cause) {
    if (options.signal?.aborted) throw cancellationReason(options.signal);
    if (deadline.signal.aborted) return "pending";
    throw cause;
  } finally { deadline.dispose(); }
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

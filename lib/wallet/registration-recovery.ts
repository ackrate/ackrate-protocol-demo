import { Buffer } from "buffer";
import { Address, Keypair, Transaction, TransactionBuilder, scValToNative, xdr } from "@stellar/stellar-sdk";

export interface RegistrationScope {
  id: string; credentialHash: string; user: string; agent: string; merchant: string;
  asset: string; maxAmount: string; expiry: number;
}
export interface PendingRegistration {
  txHash: string; signedTransactionXdr: string; submittedAt: number; validUntil: number;
}
export type RegistrationState = "not-submitted" | "pending" | "failed";
export type RegistrationConfirmation = "confirmed" | "failed" | "expired" | "pending";

function ledgerTime(value: unknown): number | null {
  const parsed = typeof value === "string" && /^[1-9]\d*$/.test(value) ? Number(value) : value;
  return typeof parsed === "number" && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function assertRegistrationMandate(scope: RegistrationScope, observed: Record<string, unknown>): void {
  for (const field of ["id", "user", "agent", "merchant", "asset", "maxAmount", "expiry"] as const) {
    if (observed[field] !== scope[field]) throw new Error("The original on-chain mandate does not match the saved registration.");
  }
}

/** Missing markers in older records are ambiguous, not permission to replace. */
export function registrationNeedsReconciliation(stored: {
  registrationTx?: string; registrationState?: RegistrationState; pendingRegistration?: PendingRegistration;
} | null): boolean {
  if (!stored) return false;
  if (stored.pendingRegistration) return true;
  return !stored.registrationTx && stored.registrationState !== "not-submitted" && stored.registrationState !== "failed";
}

/** Validate the exact bounded, signed registration before retaining or trusting it. */
export function signedRegistrationEvidence(
  signedTransactionXdr: string,
  networkPassphrase: string,
  registryId: string,
  scope: RegistrationScope,
  submittedAt = Math.floor(Date.now() / 1000),
): PendingRegistration {
  if (!/^[0-9a-f]{64}$/.test(scope.id) || !/^[0-9a-f]{64}$/.test(scope.credentialHash)
    || !/^[1-9]\d*$/.test(scope.maxAmount) || !Number.isSafeInteger(scope.expiry) || scope.expiry <= 0) {
    throw new Error("The saved registration rules are invalid.");
  }
  const transaction = TransactionBuilder.fromXDR(signedTransactionXdr, networkPassphrase);
  if (!(transaction instanceof Transaction) || transaction.source !== scope.user || transaction.operations.length !== 1) {
    throw new Error("The registration transaction does not match this wallet.");
  }
  const operation = transaction.operations[0]!;
  if (operation.type !== "invokeHostFunction" || (operation.source && operation.source !== scope.user)
    || operation.func.switch().name !== "hostFunctionTypeInvokeContract") throw new Error("The transaction is not a mandate registration.");
  const invocation = operation.func.invokeContract();
  const args = invocation.args().map((value) => scValToNative(value));
  if (Address.fromScAddress(invocation.contractAddress()).toString() !== registryId
    || invocation.functionName().toString() !== "register_mandate" || args.length !== 7
    || args[0] !== scope.user || args[1] !== scope.agent || args[2] !== scope.merchant || args[3] !== scope.asset
    || args[4] !== BigInt(scope.maxAmount) || args[5] !== BigInt(scope.expiry)
    || !(args[6] instanceof Uint8Array) || Buffer.from(args[6]).toString("hex") !== scope.credentialHash) {
    throw new Error("The registration transaction changed the saved spending rules.");
  }
  const verifier = Keypair.fromPublicKey(scope.user);
  if (!transaction.signatures.some((signature) => {
    try { return verifier.verify(transaction.hash(), signature.signature()); } catch { return false; }
  })) throw new Error("The registration is missing the connected wallet's valid signature.");
  const validUntil = Number(transaction.timeBounds?.maxTime);
  if (!Number.isSafeInteger(submittedAt) || submittedAt <= 0 || !Number.isSafeInteger(validUntil)
    || validUntil <= submittedAt || Number(transaction.timeBounds?.minTime) > submittedAt) {
    throw new Error("The registration transaction has no valid expiry.");
  }
  return { txHash: transaction.hash().toString("hex"), signedTransactionXdr, submittedAt, validUntil };
}

/** Never signs or submits. Unknown history, outages and stale coverage retain the original attempt. */
export async function readRegistrationConfirmation(
  config: { rpcUrl: string; networkPassphrase: string; mandateRegistryId: string },
  scope: RegistrationScope,
  pending: PendingRegistration,
  signal?: AbortSignal,
): Promise<RegistrationConfirmation> {
  const validate = (xdr: string) => signedRegistrationEvidence(xdr, config.networkPassphrase, config.mandateRegistryId, scope, pending.submittedAt);
  const retained = validate(pending.signedTransactionXdr);
  if (retained.txHash !== pending.txHash || retained.validUntil !== pending.validUntil) throw new Error("The retained registration hash or expiry changed.");
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason);
  const timer = setTimeout(() => controller.abort(new DOMException("Registration confirmation timed out.", "TimeoutError")), 15_000);
  if (signal?.aborted) cancel();
  else signal?.addEventListener("abort", cancel, { once: true });
  let abort: (() => void) | undefined;
  try {
    return await new Promise<RegistrationConfirmation>((resolve, reject) => {
      abort = () => reject(controller.signal.reason);
      controller.signal.addEventListener("abort", abort, { once: true });
      void (async (): Promise<RegistrationConfirmation> => {
        if (controller.signal.aborted) throw controller.signal.reason;
        const response = await fetch(config.rpcUrl, {
          method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: "registration-confirmation", method: "getTransaction", params: { hash: pending.txHash } }),
        });
        if (!response.ok) throw new Error(`Registration confirmation returned HTTP ${response.status}.`);
        const body = await response.json() as { error?: unknown; result?: {
          status?: string; envelopeXdr?: string; resultMetaXdr?: string; oldestLedgerCloseTime?: number | string; latestLedgerCloseTime?: number | string;
        } };
        const result = body.result;
        if (body.error || !result) throw new Error("The original registration could not be confirmed yet.");
        if (result.status === "SUCCESS" || result.status === "FAILED") {
          if (!result.envelopeXdr || validate(result.envelopeXdr).txHash !== pending.txHash) {
            throw new Error("Stellar returned a different registration transaction.");
          }
          if (result.status === "SUCCESS") {
            if (!result.resultMetaXdr) throw new Error("The registration receipt is missing its returned mandate id.");
            const meta = xdr.TransactionMeta.fromXDR(result.resultMetaXdr, "base64");
            const value = meta.switch() === 3 ? meta.v3().sorobanMeta()?.returnValue()
              : meta.switch() === 4 ? meta.v4().sorobanMeta()?.returnValue() : undefined;
            const returned = value ? scValToNative(value) : undefined;
            if (!(returned instanceof Uint8Array) || Buffer.from(returned).toString("hex") !== scope.id) {
              throw new Error("The confirmed registration returned a different mandate id.");
            }
          }
          return result.status === "SUCCESS" ? "confirmed" : "failed";
        }
        if (result.status !== "NOT_FOUND") throw new Error("The original registration status is unknown.");
        const oldest = ledgerTime(result.oldestLedgerCloseTime), latest = ledgerTime(result.latestLedgerCloseTime);
        return oldest !== null && latest !== null
          && oldest <= pending.submittedAt && latest > pending.validUntil ? "expired" : "pending";
      })().then(resolve, reject);
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    if (abort) controller.signal.removeEventListener("abort", abort);
  }
}

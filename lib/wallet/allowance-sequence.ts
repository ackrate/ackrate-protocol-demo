import { Buffer } from "buffer";
import { Address, TransactionBuilder, scValToNative } from "@stellar/stellar-sdk";
import type { IntentMandate } from "@ackrate/core";
import type { SafeAppConfig } from "./types";

type RegistrationConfig = Pick<SafeAppConfig, "rpcUrl" | "networkPassphrase" | "mandateRegistryId">;
type RegistrationMandate = Pick<IntentMandate, "user" | "agent" | "merchant" | "asset" | "maxAmount" | "expiry" | "idBuffer"> & { credentialHash?: string };

const MAX_SEQUENCE = (1n << 63n) - 1n;
const RECEIPT_TIMEOUT_MS = 15_000;

export class AllowanceSequenceConsumedError extends Error {}

/** Only the exact sequence of a DIFFERENT verified registration proves a conflict. */
export function allowanceConflictsWithRegistration(xdr: string, networkPassphrase: string, registrationSequence: string): boolean {
  const transaction = TransactionBuilder.fromXDR(xdr, networkPassphrase);
  return "source" in transaction && sequenceNumber(transaction.sequence) === sequenceNumber(registrationSequence);
}

function sequenceNumber(value: string): bigint {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/.test(value)) throw new Error("The wallet sequence is invalid.");
  const sequence = BigInt(value);
  if (sequence > MAX_SEQUENCE) throw new Error("The wallet sequence is outside the supported range.");
  return sequence;
}

/** A lagging account index cannot lower the sequence proved by registration. */
export function selectAllowanceAccountSequence(observed: string, confirmed: string): string {
  const accountSequence = sequenceNumber(observed);
  const registrationSequence = sequenceNumber(confirmed);
  if (registrationSequence === 0n) throw new Error("The confirmed registration sequence is invalid.");
  return (accountSequence > registrationSequence ? accountSequence : registrationSequence).toString();
}

/** Validate cached transaction bodies before asking for another wallet signature. */
export function validateAllowanceSequence(preparedTransactionXdr: string, networkPassphrase: string, registrationSequence: string): void {
  const floor = sequenceNumber(registrationSequence);
  if (floor === 0n) throw new Error("The confirmed registration sequence is invalid.");
  const transaction = TransactionBuilder.fromXDR(preparedTransactionXdr, networkPassphrase);
  if (!("source" in transaction)) throw new Error("The allowance must use a wallet transaction.");
  if (sequenceNumber(transaction.sequence) <= floor) throw new AllowanceSequenceConsumedError("The prepared allowance uses an outdated wallet sequence. Prepare a new USDC allowance.");
}

function credentialHashFor(mandate: RegistrationMandate): string {
  if (mandate.credentialHash !== undefined) {
    if (!/^[0-9a-f]{64}$/i.test(mandate.credentialHash)) throw new Error("The registration credential hash is invalid.");
    return mandate.credentialHash.toLowerCase();
  }
  if (!(mandate.idBuffer instanceof Uint8Array) || mandate.idBuffer.length !== 32) throw new Error("The registration credential hash is invalid.");
  return Buffer.from(mandate.idBuffer).toString("hex");
}

async function readRegistrationReceipt(rpcUrl: string, hash: string, signal?: AbortSignal): Promise<unknown> {
  if (signal?.aborted) throw signal.reason;
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason);
  const timer = setTimeout(() => controller.abort(new DOMException("Registration receipt lookup timed out.", "TimeoutError")), RECEIPT_TIMEOUT_MS);
  signal?.addEventListener("abort", cancel, { once: true });
  let rejectOnAbort: (() => void) | undefined;
  try {
    return await new Promise<unknown>((resolve, reject) => {
      rejectOnAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener("abort", rejectOnAbort, { once: true });
      void (async () => {
        if (controller.signal.aborted) throw controller.signal.reason;
        const response = await fetch(rpcUrl, {
          method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal,
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: "allowance-registration-sequence", method: "getTransaction", params: { hash } }),
        });
        if (!response.ok) throw new Error(`Registration receipt lookup returned HTTP ${response.status}.`);
        return response.json();
      })().then(resolve, reject);
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    if (rejectOnAbort) controller.signal.removeEventListener("abort", rejectOnAbort);
  }
}

/** Read and verify the actual registration receipt before trusting its sequence. */
export async function confirmedRegistrationSequence(
  config: RegistrationConfig,
  mandate: RegistrationMandate,
  registrationTx: string,
  signal?: AbortSignal,
): Promise<string> {
  if (typeof registrationTx !== "string" || !/^[0-9a-f]{64}$/i.test(registrationTx)) throw new Error("The registration transaction hash is invalid.");
  const hash = registrationTx.toLowerCase();
  const credentialHash = credentialHashFor(mandate);
  if (!Number.isSafeInteger(mandate.expiry) || mandate.expiry <= 0 || typeof mandate.maxAmount !== "bigint" || mandate.maxAmount <= 0n) {
    throw new Error("The registered mandate spending rules are invalid.");
  }
  const raw = await readRegistrationReceipt(config.rpcUrl, hash, signal);
  if (typeof raw !== "object" || raw === null) throw new Error("Stellar did not return a registration receipt.");
  const body = raw as { error?: unknown; result?: { status?: unknown; envelopeXdr?: unknown } };
  if (body.error || body.result?.status !== "SUCCESS" || typeof body.result.envelopeXdr !== "string") {
    throw new Error("Stellar has not confirmed the registration receipt. No allowance was prepared.");
  }
  const envelope = TransactionBuilder.fromXDR(body.result.envelopeXdr, config.networkPassphrase);
  if (envelope.hash().toString("hex") !== hash) throw new Error("Stellar returned a different registration transaction.");
  const transaction = "innerTransaction" in envelope ? envelope.innerTransaction : envelope;
  if (transaction.source !== mandate.user || transaction.operations.length !== 1) throw new Error("The registration transaction does not match this wallet.");
  const operation = transaction.operations[0]!;
  if (operation.type !== "invokeHostFunction" || (operation.source && operation.source !== mandate.user)
    || operation.func.switch().name !== "hostFunctionTypeInvokeContract") throw new Error("The transaction is not the expected mandate registration.");
  const invocation = operation.func.invokeContract();
  if (Address.fromScAddress(invocation.contractAddress()).toString() !== config.mandateRegistryId
    || invocation.functionName().toString() !== "register_mandate") throw new Error("The registration contract or function does not match this setup.");
  const args = invocation.args().map((value) => scValToNative(value));
  if (args.length !== 7 || args[0] !== mandate.user || args[1] !== mandate.agent || args[2] !== mandate.merchant
    || args[3] !== mandate.asset || args[4] !== mandate.maxAmount || args[5] !== BigInt(mandate.expiry)
    || !(args[6] instanceof Uint8Array) || Buffer.from(args[6]).toString("hex") !== credentialHash) {
    throw new Error("The registration parameters do not match the saved mandate.");
  }
  if (sequenceNumber(transaction.sequence) === 0n) throw new Error("The confirmed registration sequence is invalid.");
  return transaction.sequence;
}

"use client";

import { Buffer } from "buffer";
import {
  Account,
  Address,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  rpc,
} from "@stellar/stellar-sdk";
import { Client, type NetworkConfig } from "@ackrate/stellar";
import { ackrate, type IntentMandate } from "@ackrate/core";
import type { SafeAppConfig } from "./types";
import { freighterSigner } from "./freighter";
import { loadAccountSequence } from "./horizon-account";
import { registeredMandateIdHex } from "./mandate-id";
import { installMainnetRpcRetry, retryRateLimited } from "./rpc-retry";
import { allowanceTransactionIsFresh, preparedAllowanceEvidence, waitForAllowanceConfirmation, type PendingAllowance } from "./client-readiness";
import { confirmedRegistrationSequence, selectAllowanceAccountSequence, validateAllowanceSequence } from "./allowance-sequence";
import { signedRegistrationEvidence, type PendingRegistration } from "./registration-recovery";

if (typeof window !== "undefined" && !window.Buffer) window.Buffer = Buffer;

const INCLUSION_FEE = "100000";
const APPROVAL_TIMEBOUND_SECONDS = 10 * 60;
const SUBMISSION_RETRY_DELAYS_MS = Object.freeze([750, 1_500, 2_500]);
const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class AllowanceSubmissionRejected extends Error {
  constructor(readonly resultCode: string) {
    super(`Stellar rejected the allowance submission (${resultCode}).`);
    this.name = "AllowanceSubmissionRejected";
  }
}

export class AllowanceNotSubmittedError extends Error {
  constructor(readonly reason: "sequence-changed" | "check-unavailable", options?: ErrorOptions) {
    super(reason === "sequence-changed"
      ? "Wallet activity changed before allowance submission."
      : "The signed allowance could not complete its pre-submission check.", options);
    this.name = "AllowanceNotSubmittedError";
  }
}

export interface CreateMandateForm {
  budget: string;
  expiry: number;
}

export interface RegistrationResult {
  mandateId: string;
  transactionHash: string;
}

export class RegistrationNotSubmittedError extends Error {
  constructor(options?: ErrorOptions) {
    super("Registration was not submitted to Stellar. You can retry the same spending rules when ready.", options);
    this.name = "RegistrationNotSubmittedError";
  }
}

export function publicNetwork(config: SafeAppConfig): NetworkConfig {
  return {
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.networkPassphrase,
    mandateRegistryId: config.mandateRegistryId,
    nativeSac: config.asset.contractId,
  };
}

export function buildMandate(config: SafeAppConfig, user: string, form: CreateMandateForm): IntentMandate {
  if (!config.agentAddress || !config.merchant.address) {
    throw new Error("agent and merchant configuration is incomplete");
  }
  return ackrate.createIntentMandate({
    user,
    agent: config.agentAddress,
    merchant: config.merchant.address,
    asset: config.asset.contractId,
    maxAmount: form.budget,
    expiry: form.expiry,
    decimals: config.asset.decimals,
  }, publicNetwork(config));
}

function walletClient(config: SafeAppConfig, address: string): Client {
  const signer = freighterSigner(address, config.networkPassphrase);
  const server = walletRpcServer(config);
  return new Client({
    contractId: config.mandateRegistryId,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.networkPassphrase,
    publicKey: address,
    signTransaction: signer.signTransaction,
    allowHttp: config.rpcUrl.startsWith("http://"),
    server,
  });
}

export function walletRpcServer(config: SafeAppConfig): rpc.Server {
  installMainnetRpcRetry(config.network);
  const server = new rpc.Server(config.rpcUrl, { allowHttp: config.rpcUrl.startsWith("http://") });
  server.getAccount = async (address: string) => new Account(
    address,
    await loadAccountSequence(address, config.network),
  );
  return server;
}

function transactionHash(sent: { sendTransactionResponse?: { hash?: string } }): string {
  const hash = sent.sendTransactionResponse?.hash;
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) {
    throw new Error("Soroban submission did not return a transaction hash");
  }
  return hash;
}

/** Wallet setup requires retention; the older experimental caller remains compatible. */
export async function registerRetainedWithFreighter(
  config: SafeAppConfig,
  mandate: IntentMandate,
  onPrepared: (mandateId: string) => void,
  onSigned: (pending: PendingRegistration) => void,
): Promise<RegistrationResult> {
  if (typeof onSigned !== "function") {
    throw new RegistrationNotSubmittedError({ cause: new Error("Registration requires durable signed-transaction retention before submission.") });
  }
  return registerWithFreighter(config, mandate, onPrepared, onSigned);
}

export async function registerWithFreighter(
  config: SafeAppConfig,
  mandate: IntentMandate,
  onPrepared?: (mandateId: string) => void,
  onSigned?: (pending: PendingRegistration) => void,
): Promise<RegistrationResult> {
  const client = walletClient(config, mandate.user);
  const assembled = await client.register_mandate({
    user: mandate.user,
    agent: mandate.agent,
    merchant: mandate.merchant,
    asset: mandate.asset,
    max_amount: mandate.maxAmount,
    expiry: BigInt(mandate.expiry),
    vc_hash: mandate.idBuffer,
  });
  const preparedMandateId = registeredMandateIdHex(assembled.result.unwrap());
  if (config.network === "mainnet" && preparedMandateId === mandate.id) {
    throw new Error("Mainnet registration returned the legacy credential identifier instead of a V2 mandate id");
  }
  onPrepared?.(preparedMandateId);
  let pending: PendingRegistration;
  try {
    // The installed SDK updates timebounds while signing; inspect its final
    // built body, not the earlier simulation envelope. No broadcast occurs here.
    await assembled.sign();
    if (!assembled.signed || !assembled.built || !assembled.signed.hash().equals(assembled.built.hash())) {
      throw new Error("Freighter changed the prepared registration transaction.");
    }
    pending = signedRegistrationEvidence(assembled.signed.toXDR(), config.networkPassphrase, config.mandateRegistryId, {
      id: preparedMandateId, credentialHash: mandate.idBuffer.toString("hex"), user: mandate.user,
      agent: mandate.agent, merchant: mandate.merchant, asset: mandate.asset,
      maxAmount: mandate.maxAmount.toString(), expiry: mandate.expiry,
    });
    // A storage failure must prevent submission. This callback is synchronous.
    const retained: unknown = onSigned?.(pending);
    if (retained && typeof retained === "object" && "then" in retained) {
      // This UI contract is deliberately synchronous: do not send while an
      // unawaited browser storage callback may still fail.
      void Promise.resolve(retained).catch(() => undefined);
      throw new Error("Registration retention must finish synchronously before submission.");
    }
  } catch (cause) {
    throw new RegistrationNotSubmittedError({ cause });
  }
  const sent = await assembled.send();
  if (sent.getTransactionResponse?.status !== "SUCCESS" || transactionHash(sent) !== pending.txHash) {
    throw new Error("The original registration is awaiting verified confirmation. No replacement was submitted.");
  }
  const submittedMandateId = registeredMandateIdHex(sent.result.unwrap());
  if (submittedMandateId !== preparedMandateId) {
    throw new Error("MandateRegistry returned different identifiers before and after submission");
  }
  return {
    mandateId: submittedMandateId,
    transactionHash: transactionHash(sent),
  };
}

export async function submitAllowance(
  server: rpc.Server,
  transaction: ReturnType<typeof TransactionBuilder.fromXDR>,
): Promise<string> {
  const expectedHash = transaction.hash().toString("hex");
  for (let attempt = 0; ; attempt += 1) {
    const submitted = await server.sendTransaction(transaction);
    if (submitted.status === "PENDING" || submitted.status === "DUPLICATE") {
      if (submitted.hash !== expectedHash) throw new Error("Stellar returned a different allowance transaction hash.");
      return submitted.hash;
    }
    if (submitted.status === "TRY_AGAIN_LATER") {
      const delay = SUBMISSION_RETRY_DELAYS_MS[attempt];
      if (delay === undefined) {
        throw new Error("the Stellar network stayed busy after three automatic retries");
      }
      await sleep(delay);
      continue;
    }
    const resultCode = submitted.errorResult?.result().switch().name ?? "unknown";
    throw new AllowanceSubmissionRejected(resultCode);
  }
}

/**
 * Read the latest ledger sequence through the same-origin relay directly.
 * The relay compacts getLatestLedger to its identity fields (the upstream
 * response carries megabytes of ledger metadata), and the SDK's parsed
 * getLatestLedger() now insists on headerXdr/metadataXdr, so the parsed path
 * fails before Freighter is ever opened. Only the sequence is needed here.
 */
export async function latestLedgerSequence(config: SafeAppConfig): Promise<number> {
  return retryRateLimited(async () => {
    const response = await fetch(config.rpcUrl, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "latest-ledger", method: "getLatestLedger", params: {} }),
    });
    if (response.status === 429) throw Object.assign(new Error("Stellar RPC is rate limited"), { response });
    if (!response.ok) throw new Error(`Stellar RPC returned HTTP ${response.status}`);
    const body = await response.json() as { result?: { sequence?: unknown } };
    const sequence = body.result?.sequence;
    if (typeof sequence !== "number" || !Number.isInteger(sequence) || sequence <= 0) {
      throw new Error("Stellar RPC did not return the latest ledger sequence");
    }
    return sequence;
  });
}

export async function prepareAllowanceTransaction(config: SafeAppConfig, mandate: IntentMandate, registrationTx?: string): Promise<string> {
  const server = walletRpcServer(config);
  const observed = await server.getAccount(mandate.user);
  // Horizon can trail the RPC receipt that just confirmed registration. Never
  // build transaction 2 with transaction 1's already-consumed sequence.
  const registrationSequence = registrationTx
    ? await confirmedRegistrationSequence(config, mandate, registrationTx) : observed.sequenceNumber();
  const source = new Account(mandate.user, selectAllowanceAccountSequence(observed.sequenceNumber(), registrationSequence));
  const expirationLedger = (await latestLedgerSequence(config)) + 17_280;
  const operation = new Contract(mandate.asset).call(
    "approve",
    new Address(mandate.user).toScVal(),
    new Address(config.mandateRegistryId).toScVal(),
    nativeToScVal(mandate.maxAmount, { type: "i128" }),
    nativeToScVal(expirationLedger, { type: "u32" }),
  );
  const built = new TransactionBuilder(source, {
    fee: INCLUSION_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(operation)
    // A short time bound can expire while somebody is reading Freighter's
    // confirmation screen. Ten minutes still bounds replay while leaving ample
    // time for an explicit human approval.
    .setTimeout(APPROVAL_TIMEBOUND_SECONDS)
    .build();
  const prepared = await server.prepareTransaction(built);
  validateAllowanceSequence(prepared.toXDR(), config.networkPassphrase, registrationSequence);
  return prepared.toXDR();
}

export async function submitPreparedAllowanceWithFreighter(
  config: SafeAppConfig,
  mandate: IntentMandate,
  preparedTransactionXdr: string,
  onPrepared?: (pending: PendingAllowance) => void,
  options: { waitForConfirmation?: boolean; registrationTx?: string } = {},
): Promise<string> {
  if (!allowanceTransactionIsFresh(preparedTransactionXdr, config.networkPassphrase)) {
    throw new Error("The prepared allowance expired. Prepare a fresh approval before opening Freighter.");
  }
  const pending = preparedAllowanceEvidence(preparedTransactionXdr, config.networkPassphrase, {
    user: mandate.user, asset: mandate.asset, spender: config.mandateRegistryId, maxAmount: mandate.maxAmount.toString(),
  });
  const signer = freighterSigner(mandate.user, config.networkPassphrase);
  // Keep signing as the first asynchronous action. Chrome can otherwise drop
  // the click's user-activation context while RPC preparation is in flight,
  // preventing Freighter from opening its confirmation window.
  const signed = await signer.signTransaction(preparedTransactionXdr, {
    address: mandate.user,
    networkPassphrase: config.networkPassphrase,
  });
  if (signed.error) throw new Error(`allowance signing failed: ${signed.error.message}`);
  if (signed.signerAddress && signed.signerAddress !== mandate.user) {
    throw new Error("allowance signing failed: Freighter returned a different signer address");
  }
  const server = walletRpcServer(config);
  const signedTransaction = TransactionBuilder.fromXDR(signed.signedTxXdr, config.networkPassphrase);
  const preparedTransaction = TransactionBuilder.fromXDR(preparedTransactionXdr, config.networkPassphrase);
  if (!signedTransaction.hash().equals(preparedTransaction.hash())) {
    throw new Error("allowance signing failed: Freighter changed the prepared transaction");
  }
  // Do this AFTER opening Freighter to preserve the click activation, but
  // BEFORE broadcasting or retaining a pending receipt. Another wallet action
  // may have consumed a pre-prepared transaction's sequence in the meantime.
  let currentSequence: string;
  try {
    const observed = await server.getAccount(mandate.user);
    const registrationSequence = options.registrationTx
      ? await confirmedRegistrationSequence(config, mandate, options.registrationTx) : observed.sequenceNumber();
    currentSequence = selectAllowanceAccountSequence(observed.sequenceNumber(), registrationSequence);
  } catch (cause) {
    throw new AllowanceNotSubmittedError("check-unavailable", { cause });
  }
  if (!("sequence" in signedTransaction) || BigInt(signedTransaction.sequence) !== BigInt(currentSequence) + 1n) {
    throw new AllowanceNotSubmittedError("sequence-changed");
  }
  // Persist the exact unsigned body/hash before broadcast so a lost response only checks this receipt.
  onPrepared?.(pending);
  const hash = await submitAllowance(server, signedTransaction);
  // The wallet screen owns resumable confirmation so a refresh never needs a
  // second signature. Other callers keep the confirmed-receipt return contract.
  if (options.waitForConfirmation === false) return hash;
  const status = await waitForAllowanceConfirmation(config.rpcUrl, config.networkPassphrase, {
    user: mandate.user, asset: mandate.asset, spender: config.mandateRegistryId, maxAmount: mandate.maxAmount.toString(),
  }, pending);
  if (status !== "confirmed") throw new Error(`Allowance confirmation is ${status}. Check the retained transaction before signing again.`);
  return hash;
}

export async function approveWithFreighter(config: SafeAppConfig, mandate: IntentMandate): Promise<string> {
  const prepared = await prepareAllowanceTransaction(config, mandate);
  return submitPreparedAllowanceWithFreighter(config, mandate, prepared);
}

export async function revokeWithFreighter(config: SafeAppConfig, mandate: IntentMandate, onSubmitted?: (hash: string) => void): Promise<string> {
  const client = walletClient(config, mandate.user);
  const assembled = await client.revoke_mandate({ mandate_id: mandate.idBuffer });
  const sent = await assembled.signAndSend({ watcher: {
    onSubmitted: (response) => onSubmitted?.(transactionHash({ sendTransactionResponse: response })),
  } });
  if (sent.getTransactionResponse?.status !== "SUCCESS") {
    throw new Error("Stellar has not confirmed that spending is off. Check the existing transaction before trying again.");
  }
  sent.result.unwrap();
  return transactionHash(sent);
}

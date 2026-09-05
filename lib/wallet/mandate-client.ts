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
import { installMainnetRpcRetry } from "./rpc-retry";

if (typeof window !== "undefined" && !window.Buffer) window.Buffer = Buffer;

const INCLUSION_FEE = "100000";
const APPROVAL_TIMEBOUND_SECONDS = 10 * 60;
const SUBMISSION_RETRY_DELAYS_MS = Object.freeze([750, 1_500, 2_500]);
const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export interface CreateMandateForm {
  budget: string;
  expiry: number;
}

export interface RegistrationResult {
  mandateId: string;
  transactionHash: string;
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

export async function registerWithFreighter(
  config: SafeAppConfig,
  mandate: IntentMandate,
  onPrepared?: (mandateId: string) => void,
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
  const sent = await assembled.signAndSend();
  const submittedMandateId = registeredMandateIdHex(sent.result.unwrap());
  if (submittedMandateId !== preparedMandateId) {
    throw new Error("MandateRegistry returned different identifiers before and after submission");
  }
  return {
    mandateId: submittedMandateId,
    transactionHash: transactionHash(sent),
  };
}

async function settle(server: rpc.Server, hash: string): Promise<void> {
  let result = await server.getTransaction(hash);
  for (let attempt = 0; result.status === "NOT_FOUND" && attempt < 30; attempt += 1) {
    await sleep(1_000);
    result = await server.getTransaction(hash);
  }
  if (result.status !== "SUCCESS") {
    throw new Error(`transaction ${hash} did not succeed: ${result.status}`);
  }
}

async function submitAllowance(
  server: rpc.Server,
  transaction: ReturnType<typeof TransactionBuilder.fromXDR>,
): Promise<string> {
  for (let attempt = 0; ; attempt += 1) {
    const submitted = await server.sendTransaction(transaction);
    if (submitted.status === "PENDING" || submitted.status === "DUPLICATE") {
      await settle(server, submitted.hash);
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
    const resultCode = submitted.errorResult?.result().switch().name;
    throw new Error(`allowance submission was rejected${resultCode ? ` (${resultCode})` : ""}`);
  }
}

export async function approveWithFreighter(config: SafeAppConfig, mandate: IntentMandate): Promise<string> {
  const signer = freighterSigner(mandate.user, config.networkPassphrase);
  const server = walletRpcServer(config);
  const source = await server.getAccount(mandate.user);
  const expirationLedger = (await server.getLatestLedger()).sequence + 17_280;
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
  const signed = await signer.signTransaction(prepared.toXDR(), {
    address: mandate.user,
    networkPassphrase: config.networkPassphrase,
  });
  if (signed.error) throw new Error(`allowance signing failed: ${signed.error.message}`);
  if (signed.signerAddress && signed.signerAddress !== mandate.user) {
    throw new Error("allowance signing failed: Freighter returned a different signer address");
  }
  const signedTransaction = TransactionBuilder.fromXDR(signed.signedTxXdr, config.networkPassphrase);
  return submitAllowance(server, signedTransaction);
}

export async function revokeWithFreighter(config: SafeAppConfig, mandate: IntentMandate): Promise<string> {
  const client = walletClient(config, mandate.user);
  const assembled = await client.revoke_mandate({ mandate_id: mandate.idBuffer });
  const sent = await assembled.signAndSend();
  sent.result.unwrap();
  return transactionHash(sent);
}

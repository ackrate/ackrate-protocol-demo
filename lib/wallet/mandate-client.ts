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
import { installMainnetRpcRetry } from "./rpc-retry";

if (typeof window !== "undefined" && !window.Buffer) window.Buffer = Buffer;

const INCLUSION_FEE = "100000";
const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export interface CreateMandateForm {
  budget: string;
  expiry: number;
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

export async function registerWithFreighter(config: SafeAppConfig, mandate: IntentMandate): Promise<string> {
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
  const sent = await assembled.signAndSend();
  sent.result.unwrap();
  return transactionHash(sent);
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
    .setTimeout(60)
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
  const submitted = await server.sendTransaction(signedTransaction);
  if (submitted.errorResult) throw new Error(`allowance submission failed: ${submitted.status}`);
  await settle(server, submitted.hash);
  return submitted.hash;
}

export async function revokeWithFreighter(config: SafeAppConfig, mandate: IntentMandate): Promise<string> {
  const client = walletClient(config, mandate.user);
  const assembled = await client.revoke_mandate({ mandate_id: mandate.idBuffer });
  const sent = await assembled.signAndSend();
  sent.result.unwrap();
  return transactionHash(sent);
}

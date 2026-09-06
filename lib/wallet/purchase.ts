import { createHash } from "node:crypto";
import {
  DeliveryPendingError,
  decodePaymentProof,
  encodePaymentProof,
  getSettlementReceipt,
  isBoundPaymentProof,
  ackrate,
  toStroops,
  verifyBoundPaymentProofSignature,
  type IntentMandate,
} from "@ackrate/core";
import { createRedemptionKey } from "@ackrate/express-middleware";
import type { AppConfig } from "./app-config";
import { boundedResponseJson } from "./http";
import { completePendingToolCalls, completeToolCall, DurableReceiptStore, latestSucceededToolCall, reserveToolCall } from "./journal";
import { attachMarketBriefToPurchaseResult } from "./market-brief";
import { assertMandateBindings, assertMandateIdentityBindings, readMandate } from "./mandate-state";
import { installMainnetAccountFallback } from "./rpc-account-fallback";
import { installMainnetRpcRetry } from "./rpc-retry";
import { normalizeAgent402SearchInput, normalizeResearchQuestion, preflightAgent402Tool } from "./agent402";
import {
  agent402InternalQuery,
  normalizeAgent402ToolInput,
  supportedAgent402ToolForSource,
} from "./agent402-tools";
import { ensureAgentUsdcTrustline } from "./trustline";
import { assertQuotedRecipient, verifyMarketplaceQuote } from "./marketplace-quote";
import { assertBoundPaymentRequestSize, assertDeliveryCanRecover, assertSuccessfulDelivery, existingPurchaseResult, MAX_DELIVERY_BYTES,
  PaidDeliveryReconciliationError, receiptMatchesPurchase, recoveryStateForUnredeemedProof,
  recoveryStateForVerifiedDelivery, type DeliveryRecoveryState } from "./delivery-result";
import { PostgresBoundRedemptionStore } from "./redemption-store";

export interface PurchaseInput {
  config: AppConfig;
  sessionAddress: string;
  sessionId: string;
  toolCallId: string;
  mandateId: string;
  sourceId: string;
  question?: string;
  parameters?: unknown;
  quoteToken?: string;
}

export interface PendingPurchaseRecovery extends Partial<DeliveryRecoveryState> {
  pending: boolean;
  txHash?: string;
  amount?: string;
  asset?: string;
  sourceId?: string;
  sourceTitle?: string;
  result?: unknown;
}

type PurchaseContext = Awaited<ReturnType<typeof createPurchaseContext>>;

async function retainedDeliveryState(
  config: AppConfig,
  context: PurchaseContext,
  receipt: NonNullable<ReturnType<typeof getSettlementReceipt>>,
): Promise<DeliveryRecoveryState> {
  const pending = recoveryStateForVerifiedDelivery(null);
  if (!config.databaseUrl || receipt.proofVersion !== 2) return pending;
  const proof = decodePaymentProof(encodePaymentProof(receipt.proof));
  if (!isBoundPaymentProof(proof)) throw new Error("Retained payment proof has an invalid version");
  const key = createRedemptionKey(config.network.networkPassphrase, config.public.mandateRegistryId, receipt.txHash);
  const proofDigest = createHash("sha256").update(JSON.stringify(proof), "utf8").digest("hex");
  const found = await new PostgresBoundRedemptionStore(config.databaseUrl).lookup(key, proofDigest);
  if (found.kind === "missing") return recoveryStateForUnredeemedProof(proof.challenge.expiresAt);
  if (found.kind === "conflict") {
    return { deliveryState: "reconciliation_required", paymentConfirmed: false,
      message: "This settlement is bound to another request. Keep its receipt for reconciliation; do not make another payment." };
  }
  const { record } = found;
  const payment = record.payment;
  const target = new URL(receipt.url);
  if (record.key !== key || record.proofDigest !== proofDigest
    || payment.txHash !== receipt.txHash || proof.txHash !== receipt.txHash
    || payment.mandateId !== context.mandate.id || proof.mandateId !== context.mandate.id
    || payment.user !== context.onChain.user || payment.agent !== context.onChain.agent
    || payment.merchant !== context.onChain.merchant || payment.asset !== context.onChain.asset
    || payment.registryId !== config.public.mandateRegistryId
    || payment.scheme !== proof.scheme || payment.network !== proof.network
    || proof.challenge.method !== receipt.method || proof.challenge.audience !== target.origin
    || proof.challenge.resource !== `${target.pathname}${target.search}`
    || payment.amountStroops !== toStroops(receipt.amount, config.public.asset.decimals)
    || !verifyBoundPaymentProofSignature(proof, context.onChain.agent)) {
    throw new Error("Stored payment evidence does not match this receipt. Keep it for reconciliation; do not pay again.");
  }
  const { item } = catalogItemForReceipt(config, receipt);
  return recoveryStateForVerifiedDelivery(record, {
    sourceId: item.id, txHash: receipt.txHash, mandateId: receipt.mandateId,
    price: item.price, assetCode: config.public.asset.code, assetContract: config.public.asset.contractId,
  });
}

async function createPurchaseContext(config: AppConfig, sessionAddress: string, mandateId: string) {
  installMainnetRpcRetry(config.public.network);
  installMainnetAccountFallback(config.public.network);
  if (!config.agentSecret || !config.merchantUrl || !config.public.agentAddress || !config.public.merchant.address) {
    throw new Error("payment execution is not configured");
  }
  const onChain = await readMandate(config.network, sessionAddress, mandateId);
  assertMandateBindings(onChain, {
    user: sessionAddress,
    agent: config.public.agentAddress,
    merchant: config.public.merchant.address,
    asset: config.public.asset.contractId,
  });
  const mandate: IntentMandate = {
    id: onChain.id,
    idBuffer: Buffer.from(onChain.id, "hex"),
    user: onChain.user,
    agent: onChain.agent,
    merchant: onChain.merchant,
    asset: onChain.asset,
    maxAmount: BigInt(onChain.maxAmount),
    expiry: onChain.expiry,
    decimals: config.public.asset.decimals,
  };
  return { onChain, mandate };
}

/**
 * Recovery never spends. A mandate that is exhausted or expired after a paid
 * delivery stalled must still let the buyer collect what was paid for, so
 * only the identity bindings are checked here.
 */
async function createRecoveryContext(config: AppConfig, sessionAddress: string, mandateId: string) {
  installMainnetRpcRetry(config.public.network);
  installMainnetAccountFallback(config.public.network);
  if (!config.agentSecret || !config.merchantUrl || !config.public.agentAddress || !config.public.merchant.address) {
    throw new Error("payment execution is not configured");
  }
  const onChain = await readMandate(config.network, sessionAddress, mandateId);
  assertMandateIdentityBindings(onChain, {
    user: sessionAddress,
    agent: config.public.agentAddress,
    merchant: config.public.merchant.address,
    asset: config.public.asset.contractId,
  });
  const mandate: IntentMandate = {
    id: onChain.id,
    idBuffer: Buffer.from(onChain.id, "hex"),
    user: onChain.user,
    agent: onChain.agent,
    merchant: onChain.merchant,
    asset: onChain.asset,
    maxAmount: BigInt(onChain.maxAmount),
    expiry: onChain.expiry,
    decimals: config.public.asset.decimals,
  };
  return { onChain, mandate };
}

function catalogItemForReceipt(config: AppConfig, receipt: { url: string; method: string; amount: string }) {
  if (!config.merchantUrl || receipt.method !== "GET") {
    throw new Error("retained settlement receipt does not match an allowlisted purchase");
  }
  const retained = new URL(receipt.url);
  const item = config.public.catalog.find((candidate) => (
    new URL(candidate.path, config.merchantUrl!).origin === retained.origin
    && new URL(candidate.path, config.merchantUrl!).pathname === retained.pathname
    && candidate.price === receipt.amount
  ));
  if (!item) throw new Error("retained settlement receipt does not match an allowlisted purchase");
  const tool = supportedAgent402ToolForSource(item.id);
  const allowedParams = new Set([...(tool?.parameterNames ?? []), "_quote"]);
  if ([...retained.searchParams.keys()].some((key) => !allowedParams.has(key))) {
    throw new Error("retained settlement receipt has unexpected query parameters");
  }
  if (tool) {
    normalizeAgent402ToolInput(tool.slug, Object.fromEntries([...retained.searchParams].filter(([key]) => key !== "_quote")));
  }
  const question = item.id === "agent402-research"
    ? normalizeResearchQuestion(retained.searchParams.get("q") ?? "")
    : null;
  return { item, question };
}

function agentFor(config: AppConfig, context: PurchaseContext, receiptStore: DurableReceiptStore) {
  if (!config.agentSecret) throw new Error("payment execution is not configured");
  return ackrate.agent({
    mandate: context.mandate,
    signer: config.agentSecret,
    proofPolicy: "bound-v2-only",
    receiptStore,
  }, config.network);
}

async function completedResult(
  config: AppConfig,
  item: AppConfig["public"]["catalog"][number],
  receipt: NonNullable<ReturnType<typeof getSettlementReceipt>>,
  response: Response,
) {
  if (!response.ok) throw new Error(`merchant delivery failed with HTTP ${response.status}`);
  const delivered = await boundedResponseJson(response, MAX_DELIVERY_BYTES);
  assertSuccessfulDelivery(delivered, { sourceId: item.id, txHash: receipt.txHash, mandateId: receipt.mandateId,
    price: item.price, assetCode: config.public.asset.code, assetContract: config.public.asset.contractId });
  return attachMarketBriefToPurchaseResult({
    source: { id: item.id, title: item.title },
    payment: {
      status: "settled",
      amount: item.price,
      asset: config.public.asset.code,
      txHash: receipt.txHash,
      mandateId: receipt.mandateId,
    },
    delivered,
  });
}

function completedRecoveryEvidence(value: unknown): PendingPurchaseRecovery | null {
  if (typeof value !== "object" || value === null) return null;
  const result = value as { source?: { id?: unknown; title?: unknown }; payment?: { txHash?: unknown; amount?: unknown; asset?: unknown } };
  if (typeof result.payment?.txHash !== "string" || !/^[0-9a-f]{64}$/i.test(result.payment.txHash)) return null;
  return {
    pending: true,
    deliveryState: "ready",
    paymentConfirmed: true,
    txHash: result.payment.txHash,
    amount: typeof result.payment.amount === "string" ? result.payment.amount : undefined,
    asset: typeof result.payment.asset === "string" ? result.payment.asset : undefined,
    sourceId: typeof result.source?.id === "string" ? result.source.id : undefined,
    sourceTitle: typeof result.source?.title === "string" ? result.source.title : undefined,
  };
}

export async function getPendingCatalogRecovery(input: Omit<PurchaseInput, "toolCallId" | "sourceId">): Promise<PendingPurchaseRecovery> {
  const context = await createRecoveryContext(input.config, input.sessionAddress, input.mandateId);
  const receiptStore = new DurableReceiptStore(input.sessionId, input.mandateId);
  const receipts = await receiptStore.listPending();
  if (receipts.length === 0) {
    const completed = await latestSucceededToolCall(input);
    const result = completed ? attachMarketBriefToPurchaseResult(completed.result) : null;
    const evidence = completedRecoveryEvidence(result);
    return evidence ? { ...evidence, result } : { pending: false };
  }
  if (receipts.length !== 1) throw new Error("multiple retained settlements require operator review");
  const receipt = receipts[0]!;
  if (receipt.mandateId !== context.mandate.id) throw new Error("retained settlement mandate mismatch");
  const { item } = catalogItemForReceipt(input.config, receipt);
  const delivery = await retainedDeliveryState(input.config, context, receipt);
  return {
    pending: true,
    ...delivery,
    txHash: receipt.txHash,
    amount: item.price,
    asset: input.config.public.asset.code,
    sourceId: item.id,
    sourceTitle: item.title,
  };
}

export async function recoverPendingCatalogPurchase(input: Omit<PurchaseInput, "toolCallId" | "sourceId">): Promise<unknown> {
  const context = await createRecoveryContext(input.config, input.sessionAddress, input.mandateId);
  const receiptStore = new DurableReceiptStore(input.sessionId, input.mandateId);
  const receipts = await receiptStore.listPending();
  if (receipts.length === 0) {
    const completed = await latestSucceededToolCall(input);
    if (completed) return attachMarketBriefToPurchaseResult(completed.result);
    throw new Error("no retained delivery is waiting for recovery");
  }
  if (receipts.length !== 1) throw new Error("multiple retained settlements require operator review");
  const receipt = receipts[0]!;
  if (receipt.mandateId !== context.mandate.id) throw new Error("retained settlement mandate mismatch");
  const { item } = catalogItemForReceipt(input.config, receipt);
  const delivery = await retainedDeliveryState(input.config, context, receipt);
  assertDeliveryCanRecover(delivery);
  const consumer = agentFor(input.config, context, receiptStore);
  const response = await consumer.retryDelivery(receipt, {
    headers: { Accept: "application/json" },
    redirect: "error",
  });
  const result = await completedResult(input.config, item, receipt, response);
  await completePendingToolCalls({
    sessionId: input.sessionId,
    mandateId: input.mandateId,
    sourceId: item.id,
    txHash: receipt.txHash,
    result,
  });
  await consumer.acknowledgeDelivery(receipt);
  return result;
}

export async function purchaseCatalogItem(input: PurchaseInput): Promise<unknown> {
  const { config } = input;
  const context = await createPurchaseContext(config, input.sessionAddress, input.mandateId);
  if (!config.merchantUrl) throw new Error("payment execution is not configured");
  const item = config.public.catalog.find((candidate) => candidate.id === input.sourceId);
  if (!item) throw new Error("the requested source is not in the server allowlist");
  const tool = supportedAgent402ToolForSource(item.id);
  if (tool && !input.quoteToken) throw new Error("Review the service inputs and confirm its marketplace quote before running.");
  const toolInput = tool
    ? normalizeAgent402ToolInput(tool.slug, input.parameters ?? { q: input.question ?? "" })
    : null;
  const searchInput = tool?.slug === "search" && toolInput
    ? normalizeAgent402SearchInput(toolInput)
    : null;
  const question = searchInput?.q ?? null;
  const quote = input.quoteToken && tool && toolInput ? verifyMarketplaceQuote({
    token: input.quoteToken, config, user: input.sessionAddress, sourceId: item.id, parameters: toolInput,
  }) : null;
  const requestHash = createHash("sha256").update(JSON.stringify({
    sourceId: item.id, parameters: toolInput, payTo: quote?.payTo ?? null,
    registry: config.public.mandateRegistryId, amount: item.price,
  })).digest("hex");
  let requestedUrl: string | undefined;
  const receiptStore = new DurableReceiptStore(input.sessionId, input.mandateId, async (receipt) => {
    if (receipt.mandateId !== input.mandateId || !receiptMatchesPurchase(receipt, requestedUrl)) return;
    await completeToolCall({
      sessionId: input.sessionId,
      toolCallId: input.toolCallId,
      status: "running",
      result: { stage: "checking_payment", txHash: receipt.txHash, mandateId: input.mandateId, sourceId: input.sourceId },
    });
  });
  if ((await receiptStore.listPending()).length > 0) {
    throw new Error("A previous contract payment is retained for recovery. Resolve that receipt before any new purchase.");
  }
  const reservation = await reserveToolCall({
    sessionId: input.sessionId,
    toolCallId: input.toolCallId,
    mandateId: input.mandateId,
    sourceId: input.sourceId,
    requestHash,
  });
  if (!reservation.created) {
    if (reservation.record.mandateId !== input.mandateId || reservation.record.sourceId !== input.sourceId
      || reservation.record.requestHash !== requestHash) {
      throw new Error("tool call id was already bound to different payment inputs");
    }
    return existingPurchaseResult(reservation.record);
  }

  let deliveredReceipt: ReturnType<typeof getSettlementReceipt>;
  try {
    const amount = toStroops(item.price, config.public.asset.decimals);
    if (BigInt(context.onChain.remaining) < amount) throw new Error("the contract mandate does not have enough remaining budget");
    const paidUrl = new URL(item.path, config.merchantUrl);
    if (tool && toolInput) {
      for (const [name, value] of agent402InternalQuery(tool, toolInput)) paidUrl.searchParams.set(name, value);
    }
    if (input.quoteToken) paidUrl.searchParams.set("_quote", input.quoteToken);
    requestedUrl = paidUrl.toString();
    assertBoundPaymentRequestSize({ url: requestedUrl, registry: config.public.mandateRegistryId,
      merchant: config.public.merchant.address!, asset: config.public.asset.contractId,
      amountAtomic: amount.toString(), decimals: config.public.asset.decimals,
      network: config.public.network === "mainnet" ? "stellar-mainnet" : "stellar-testnet" });
    if (tool && toolInput) {
      const preflight = await preflightAgent402Tool(tool, toolInput, config.public.asset.contractId);
      if (quote) assertQuotedRecipient(quote, preflight.requirement);
      // Fund the relay's trustline before execute_payment can transfer USDC.
      await ensureAgentUsdcTrustline(config);
    }
    const consumer = agentFor(config, context, receiptStore);
    const response = await consumer.fetch(requestedUrl, {
      headers: { Accept: "application/json" },
      redirect: "error",
    });
    const receipt = getSettlementReceipt(response);
    if (!receipt) throw new Error("paid response did not carry a settlement receipt");
    deliveredReceipt = receipt;
    const result = await completedResult(config, item, receipt, response);
    await completeToolCall({
      sessionId: input.sessionId,
      toolCallId: input.toolCallId,
      status: "succeeded",
      result,
    });
    await consumer.acknowledgeDelivery(receipt).catch(() => undefined);
    return result;
  } catch (error) {
    const foundReceipt = error instanceof DeliveryPendingError ? error.receipt : deliveredReceipt;
    // Another tab may have saved a receipt after our initial pending check.
    // Never attach its paid output to this request's different input/quote.
    const pendingReceipt = foundReceipt && receiptMatchesPurchase(foundReceipt, requestedUrl) ? foundReceipt : undefined;
    if (pendingReceipt) {
      const pending = {
        status: "delivery_pending",
        txHash: pendingReceipt.txHash,
        mandateId: pendingReceipt.mandateId,
        message: error instanceof PaidDeliveryReconciliationError ? error.message
          : "Settlement may have occurred, but delivery is pending. The exact receipt is retained for recovery; do not issue a second payment.",
      };
      await completeToolCall({
        sessionId: input.sessionId,
        toolCallId: input.toolCallId,
        status: "delivery_pending",
        result: pending,
      });
      throw new Error(pending.message, { cause: error });
    }
    await completeToolCall({
      sessionId: input.sessionId,
      toolCallId: input.toolCallId,
      status: "failed",
      result: { message: error instanceof Error ? error.message : "purchase failed" },
    });
    throw error;
  }
}

import {
  DeliveryPendingError,
  getSettlementReceipt,
  ackrate,
  toStroops,
  type IntentMandate,
} from "@ackrate/core";
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

export interface PurchaseInput {
  config: AppConfig;
  sessionAddress: string;
  sessionId: string;
  toolCallId: string;
  mandateId: string;
  sourceId: string;
  question?: string;
  parameters?: unknown;
}

export interface PendingPurchaseRecovery {
  pending: boolean;
  txHash?: string;
  amount?: string;
  asset?: string;
  sourceId?: string;
  sourceTitle?: string;
  result?: unknown;
}

type PurchaseContext = Awaited<ReturnType<typeof createPurchaseContext>>;

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
  const allowedParams = new Set(tool?.parameterNames ?? []);
  if ([...retained.searchParams.keys()].some((key) => !allowedParams.has(key))) {
    throw new Error("retained settlement receipt has unexpected query parameters");
  }
  if (tool) {
    normalizeAgent402ToolInput(tool.slug, Object.fromEntries(retained.searchParams));
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
  const delivered = await boundedResponseJson(response);
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
    txHash: result.payment.txHash,
    amount: typeof result.payment.amount === "string" ? result.payment.amount : undefined,
    asset: typeof result.payment.asset === "string" ? result.payment.asset : undefined,
    sourceId: typeof result.source?.id === "string" ? result.source.id : undefined,
    sourceTitle: typeof result.source?.title === "string" ? result.source.title : undefined,
  };
}

function builtInReportResult(
  config: AppConfig,
  item: AppConfig["public"]["catalog"][number],
  receipt: NonNullable<ReturnType<typeof getSettlementReceipt>>,
) {
  return attachMarketBriefToPurchaseResult({
    source: { id: item.id, title: item.title },
    payment: {
      status: "settled",
      amount: item.price,
      asset: config.public.asset.code,
      txHash: receipt.txHash,
      mandateId: receipt.mandateId,
    },
    delivered: {
      ok: true,
      source: item.id,
      title: item.title,
      data: item.description,
      settledTx: receipt.txHash,
      mandateId: receipt.mandateId,
      settledAmount: item.price,
      asset: config.public.asset.code,
    },
  });
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
  return {
    pending: true,
    txHash: receipt.txHash,
    amount: item.price,
    asset: input.config.public.asset.code,
    sourceId: item.id,
    sourceTitle: item.title,
    result: item.id === "market-brief" ? builtInReportResult(input.config, item, receipt) : undefined,
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
  if (item.id === "market-brief") {
    const result = builtInReportResult(input.config, item, receipt);
    await completePendingToolCalls({
      sessionId: input.sessionId,
      mandateId: input.mandateId,
      sourceId: item.id,
      result,
    });
    await receiptStore.clearPending(receipt.receiptId);
    return result;
  }
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
  const toolInput = tool
    ? normalizeAgent402ToolInput(tool.slug, input.parameters ?? { q: input.question ?? "" })
    : null;
  const searchInput = tool?.slug === "search" && toolInput
    ? normalizeAgent402SearchInput(toolInput)
    : null;
  const question = searchInput?.q ?? null;
  const reservation = await reserveToolCall({
    sessionId: input.sessionId,
    toolCallId: input.toolCallId,
    mandateId: input.mandateId,
    sourceId: input.sourceId,
  });
  if (!reservation.created) {
    if (reservation.record.mandateId !== input.mandateId || reservation.record.sourceId !== input.sourceId) {
      throw new Error("tool call id was already bound to different payment inputs");
    }
    if (reservation.record.status === "succeeded") return reservation.record.result;
    if (reservation.record.status === "running") throw new Error("this purchase is already in progress");
    if (reservation.record.status === "failed") throw new Error("this exact purchase attempt previously failed; start a new chat request");
  }

  const amount = toStroops(item.price, config.public.asset.decimals);
  if (BigInt(context.onChain.remaining) < amount) throw new Error("the contract mandate does not have enough remaining budget");
  if (tool && toolInput) {
    await preflightAgent402Tool(tool, toolInput, config.public.asset.contractId);
    // The contract pays the relay before fulfillment runs. Its Circle USDC
    // trustline must therefore exist before execute_payment is submitted.
    await ensureAgentUsdcTrustline(config);
  }
  const receiptStore = new DurableReceiptStore(input.sessionId, input.mandateId);
  const consumer = agentFor(config, context, receiptStore);
  const paidUrl = new URL(item.path, config.merchantUrl);
  if (tool && toolInput) {
    for (const [name, value] of agent402InternalQuery(tool, toolInput)) paidUrl.searchParams.set(name, value);
  }
  const url = paidUrl.toString();
  let deliveredReceipt: ReturnType<typeof getSettlementReceipt>;

  try {
    const response = await consumer.fetch(url, {
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
    const pendingReceipt = error instanceof DeliveryPendingError ? error.receipt : deliveredReceipt;
    if (pendingReceipt) {
      const pending = {
        status: "delivery_pending",
        txHash: pendingReceipt.txHash,
        mandateId: pendingReceipt.mandateId,
        message: "Settlement may have occurred, but delivery is pending. The exact receipt is retained for recovery; do not issue a second payment.",
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

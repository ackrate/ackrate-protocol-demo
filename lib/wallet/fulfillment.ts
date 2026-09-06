import { once } from "node:events";
import type { Server } from "node:http";
import express, { type NextFunction, type Request, type Response } from "express";
import { createBoundAckratePaidJsonRoute } from "@ackrate/express-middleware";
import { toStroops } from "@ackrate/core";
import { requireReadyConfig, type AppConfig } from "./app-config";
import { PostgresBoundRedemptionStore } from "./redemption-store";
import { installMainnetAccountFallback } from "./rpc-account-fallback";
import { installMainnetRpcRetry } from "./rpc-retry";
import { MARKET_SIGNAL_BRIEF } from "./market-brief";
import { normalizeAgent402SearchInput, runAgent402Research, runAgent402Tool } from "./agent402";
import { agent402InputFromQuery, supportedAgent402ToolForSource } from "./agent402-tools";
import { verifyMarketplaceQuote } from "./marketplace-quote";
import { assertBoundPaymentRequestSize, MAX_BOUND_PAYMENT_HEADER_BYTES, MAX_DELIVERY_BYTES } from "./delivery-result";
import { createMainnetV2PaymentVerifier } from "./mainnet-payment-verifier";

type Runtime = { server: Server; origin: string; fingerprint: string };
const globalRuntime = globalThis as typeof globalThis & { __ackrateMainnetFulfillment?: Promise<Runtime> };

function fingerprint(config: AppConfig): string {
  return [
    config.public.releaseFingerprint,
    config.public.merchant.address,
    config.public.asset.contractId,
    config.appOrigin,
  ].join(":");
}

async function startRuntime(config: AppConfig): Promise<Runtime> {
  installMainnetRpcRetry(config.public.network);
  installMainnetAccountFallback(config.public.network);
  if (
    !config.databaseUrl
    || !config.challengeSecret
    || !config.appOrigin
    || !config.public.merchant.address
  ) throw new Error("mainnet fulfillment configuration is incomplete");

  const catalog = new Map(config.public.catalog.map((item) => [item.path, item]));
  const store = new PostgresBoundRedemptionStore(config.databaseUrl);
  const app = express();
  app.disable("x-powered-by");
  const paidSource = createBoundAckratePaidJsonRoute({
    maxResponseBytes: MAX_DELIVERY_BYTES,
    maxHeaderBytes: MAX_BOUND_PAYMENT_HEADER_BYTES,
    merchant: config.public.merchant.address,
    sourceAccount: config.public.merchant.address,
    audience: config.appOrigin,
    challengeSecret: config.challengeSecret,
    redemptionStore: store,
    amount: (request) => catalog.get(request.path)?.price ?? "",
    resource: (request) => request.originalUrl,
    networkConfig: config.network,
    network: config.public.network === "mainnet" ? "stellar-mainnet" : "stellar-testnet",
    asset: config.public.asset.contractId,
    decimals: config.public.asset.decimals,
    verifier: config.public.network === "mainnet" ? createMainnetV2PaymentVerifier(config) : undefined,
  }, async ({ request, payment }) => {
    const item = catalog.get(request.path);
    if (!item) throw new Error("validated catalog item disappeared before fulfillment");
    const tool = supportedAgent402ToolForSource(item.id);
    const toolInput = tool ? agent402InputFromQuery(tool, request.query) : null;
    const quoteToken = request.query._quote;
    if (quoteToken !== undefined && typeof quoteToken !== "string") throw new Error("Invalid marketplace quote");
    const quote = quoteToken && toolInput ? verifyMarketplaceQuote({
      token: quoteToken, config, user: payment.user, sourceId: item.id,
      parameters: toolInput, settledRecovery: true,
    }) : undefined;
    const searchInput = tool?.slug === "search" && toolInput ? normalizeAgent402SearchInput(toolInput) : null;
    const marketplaceResult = searchInput
      ? await runAgent402Research({
          config,
          question: searchInput.q,
          searchInput,
          mandateId: payment.mandateId,
          contractTx: payment.txHash,
          quote,
        })
      : tool && toolInput
        ? await runAgent402Tool({
            config,
            tool,
            parameters: toolInput,
            mandateId: payment.mandateId,
            contractTx: payment.txHash,
            quote,
          })
      : null;
    return {
      body: {
        ok: true,
        source: item.id,
        title: item.title,
        data: item.description,
        brief: marketplaceResult && "brief" in marketplaceResult ? marketplaceResult.brief : (item.id === "market-brief" ? MARKET_SIGNAL_BRIEF : undefined),
        service: marketplaceResult && "service" in marketplaceResult ? marketplaceResult.service : undefined,
        parameters: marketplaceResult && "parameters" in marketplaceResult ? marketplaceResult.parameters : undefined,
        toolOutput: marketplaceResult && "toolOutput" in marketplaceResult ? marketplaceResult.toolOutput : undefined,
        marketplace: marketplaceResult?.marketplace,
        settledTx: payment.txHash,
        mandateId: payment.mandateId,
        settledAmount: payment.amount,
        asset: config.public.asset.code,
      },
    };
  });

  app.get(
    "/api/wallet/source/:id",
    (request: Request, response: Response, next: NextFunction): void => {
      const item = catalog.get(request.path);
      if (!item) {
        response.status(404).json({ error: "unknown paid source" });
        return;
      }
      try {
        assertBoundPaymentRequestSize({
          url: new URL(request.originalUrl, config.appOrigin!).toString(),
          registry: config.public.mandateRegistryId, merchant: config.public.merchant.address!,
          asset: config.public.asset.contractId,
          amountAtomic: toStroops(item.price, config.public.asset.decimals).toString(),
          decimals: config.public.asset.decimals,
          network: config.public.network === "mainnet" ? "stellar-mainnet" : "stellar-testnet",
        });
      } catch (error) {
        response.set("cache-control", "private, no-store");
        response.status(414).json({ error: error instanceof Error ? error.message : "protected payment request is too large" });
        return;
      }
      next();
    },
    paidSource,
  );
  app.use((_request: Request, response: Response): void => {
    response.status(404).json({ error: "not found" });
  });
  app.use((_error: unknown, _request: Request, response: Response, _next: NextFunction): void => {
    response.set("cache-control", "private, no-store");
    response.status(503).json({ error: "fulfillment unavailable" });
  });

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fulfillment server did not bind a local port");
  return { server, origin: `http://127.0.0.1:${address.port}`, fingerprint: fingerprint(config) };
}

async function runtime(): Promise<Runtime> {
  const config = requireReadyConfig();
  const expected = fingerprint(config);
  const current = globalRuntime.__ackrateMainnetFulfillment && await globalRuntime.__ackrateMainnetFulfillment;
  if (current?.fingerprint === expected && current.server.listening) return current;
  if (current?.server.listening) await new Promise<void>((resolve) => current.server.close(() => resolve()));
  globalRuntime.__ackrateMainnetFulfillment = startRuntime(config);
  return globalRuntime.__ackrateMainnetFulfillment;
}

export async function proxyPaidSource(request: globalThis.Request): Promise<globalThis.Response> {
  const target = await runtime();
  const incoming = new URL(request.url);
  const url = new URL(`${incoming.pathname}${incoming.search}`, target.origin);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  const response = await fetch(url, { method: "GET", headers, redirect: "manual" });
  const outgoingHeaders = new Headers(response.headers);
  outgoingHeaders.set("cache-control", "private, no-store, no-transform");
  outgoingHeaders.set("x-content-type-options", "nosniff");
  return new globalThis.Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: outgoingHeaders,
  });
}

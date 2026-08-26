import { once } from "node:events";
import type { Server } from "node:http";
import express, { type NextFunction, type Request, type Response } from "express";
import { createBoundReappPaidJsonRoute } from "@reapp-sdk/express-middleware";
import { requireReadyConfig, type AppConfig } from "./app-config";
import { PostgresBoundRedemptionStore } from "./redemption-store";
import { installMainnetAccountFallback } from "./rpc-account-fallback";
import { installMainnetRpcRetry } from "./rpc-retry";

type Runtime = { server: Server; origin: string; fingerprint: string };
const globalRuntime = globalThis as typeof globalThis & { __reappMainnetFulfillment?: Promise<Runtime> };

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
  const paidSource = createBoundReappPaidJsonRoute({
    merchant: config.public.merchant.address,
    sourceAccount: config.public.merchant.address,
    audience: config.appOrigin,
    challengeSecret: config.challengeSecret,
    redemptionStore: store,
    amount: (request) => catalog.get(request.originalUrl)?.price ?? "",
    resource: (request) => request.originalUrl,
    networkConfig: config.network,
    network: config.public.network === "mainnet" ? "stellar-mainnet" : "stellar-testnet",
    asset: config.public.asset.contractId,
    decimals: config.public.asset.decimals,
  }, ({ request, payment }) => {
    const item = catalog.get(request.originalUrl);
    if (!item) throw new Error("validated catalog item disappeared before fulfillment");
    return {
      body: {
        ok: true,
        source: item.id,
        title: item.title,
        data: item.description,
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
      if (!catalog.has(request.originalUrl)) {
        response.status(404).json({ error: "unknown paid source" });
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
  const current = globalRuntime.__reappMainnetFulfillment && await globalRuntime.__reappMainnetFulfillment;
  if (current?.fingerprint === expected && current.server.listening) return current;
  if (current?.server.listening) await new Promise<void>((resolve) => current.server.close(() => resolve()));
  globalRuntime.__reappMainnetFulfillment = startRuntime(config);
  return globalRuntime.__reappMainnetFulfillment;
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

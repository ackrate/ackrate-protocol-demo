import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { AppConfig } from "./app-config";
import { normalizeAgent402ToolInput, supportedAgent402ToolForSource } from "./agent402-tools";

const Quote = z.object({
  version: z.literal(1),
  user: z.string(),
  sourceId: z.string(),
  parametersHash: z.string().regex(/^[0-9a-f]{64}$/),
  registry: z.string(),
  release: z.string().nullable(),
  relay: z.string(),
  asset: z.string(),
  network: z.literal("stellar:pubnet"),
  payTo: z.string().regex(/^G[A-Z2-7]{55}$/),
  amountAtomic: z.string().regex(/^[1-9][0-9]*$/),
  price: z.string(),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
}).strict();

export type MarketplaceQuote = z.infer<typeof Quote>;
export interface MarketplaceQuoteView {
  token: string;
  payTo: string;
  relay: string;
  price: string;
  expiresAt: number;
}

function signature(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(`ackrate-marketplace-quote-v1\0${payload}`).digest();
}

function scope(config: AppConfig, user: string, sourceId: string, parameters: unknown) {
  const tool = supportedAgent402ToolForSource(sourceId);
  if (!tool || !config.public.catalog.some((item) => item.id === sourceId && item.price === tool.price)) {
    throw new Error("This service is not enabled for protected payments");
  }
  if (config.public.network !== "mainnet" || !config.public.merchant.address) {
    throw new Error("Marketplace quotes require the configured Mainnet relay");
  }
  return {
    user, sourceId,
    parametersHash: createHash("sha256").update(JSON.stringify(normalizeAgent402ToolInput(tool.slug, parameters))).digest("hex"),
    registry: config.public.mandateRegistryId,
    release: config.public.releaseFingerprint,
    relay: config.public.merchant.address,
    asset: config.public.asset.contractId,
    network: "stellar:pubnet" as const,
    amountAtomic: tool.amountAtomic,
    price: tool.price,
  };
}

export function issueMarketplaceQuote(input: {
  config: AppConfig; user: string; sourceId: string; parameters: unknown;
  payTo: string; now?: number;
}): MarketplaceQuoteView {
  if (!input.config.sessionSecret) throw new Error("Marketplace quote signing is not configured");
  const issuedAt = input.now ?? Math.floor(Date.now() / 1000);
  const quote = Quote.parse({ version: 1, ...scope(input.config, input.user, input.sourceId, input.parameters),
    payTo: input.payTo, issuedAt, expiresAt: issuedAt + 30 * 60 });
  const payload = Buffer.from(JSON.stringify(quote)).toString("base64url");
  const token = `${payload}.${signature(payload, input.config.sessionSecret).toString("base64url")}`;
  return { token, payTo: quote.payTo, relay: quote.relay, price: quote.price, expiresAt: quote.expiresAt };
}

/** A quote fixes the relay's downstream recipient; it is not an on-chain merchant mandate. */
export function verifyMarketplaceQuote(input: {
  token: string; config: AppConfig; user: string; sourceId: string; parameters: unknown;
  now?: number; settledRecovery?: boolean;
}): MarketplaceQuote {
  if (!input.config.sessionSecret) throw new Error("Marketplace quote signing is not configured");
  if (input.token.length > 12_000) throw new Error("Invalid marketplace quote");
  const parts = input.token.split(".");
  if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) throw new Error("Invalid marketplace quote");
  const received = Buffer.from(parts[1]!, "base64url");
  const expected = signature(parts[0]!, input.config.sessionSecret);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error("Marketplace quote signature does not match");
  const quote = Quote.parse(JSON.parse(Buffer.from(parts[0]!, "base64url").toString("utf8")));
  const expectedScope = scope(input.config, input.user, input.sourceId, input.parameters);
  for (const key of Object.keys(expectedScope) as Array<keyof typeof expectedScope>) {
    if (JSON.stringify(quote[key]) !== JSON.stringify(expectedScope[key])) throw new Error(`Marketplace quote changed: ${key}. Review the service again.`);
  }
  const now = input.now ?? Math.floor(Date.now() / 1000);
  if (quote.issuedAt > now + 60 || quote.expiresAt - quote.issuedAt !== 1800) throw new Error("Invalid marketplace quote time window");
  // Only a verified, already-paid bound receipt may recover after this window.
  if (!input.settledRecovery && quote.expiresAt <= now) throw new Error("Marketplace quote expired. Review the service inputs again before running.");
  return quote;
}

export function assertQuotedRecipient(quote: Pick<MarketplaceQuote, "payTo" | "amountAtomic" | "asset" | "network">, requirement: {
  payTo: string; amount: string; asset: string; network: string;
}) {
  if (quote.payTo !== requirement.payTo || quote.amountAtomic !== requirement.amount
    || quote.asset !== requirement.asset || quote.network !== requirement.network) {
    throw new Error("The marketplace payment details changed. No new marketplace payment was sent; review the service again.");
  }
}

import { createHash } from "node:crypto";
import { StrKey } from "@stellar/stellar-sdk";
import {
  x402Client,
  x402HTTPClient,
  type PaymentRequired,
  type PaymentRequirements,
} from "@x402/fetch";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { z } from "zod";
import type { AppConfig } from "./app-config";
import { boundedResponseJson } from "./http";
import {
  completeMarketplaceRun,
  getMarketplaceRun,
  markMarketplacePaid,
  markMarketplaceReviewRequired,
  reserveMarketplaceRun,
} from "./journal";
import { createMarketplaceReport } from "./marketplace-report";
import type { Agent402Evidence, Agent402SearchResult } from "./marketplace-types";
import { ensureAgentUsdcTrustline } from "./trustline";

export const AGENT402_MARKETPLACE_URL = "https://agent402.tools/stellar";
export const AGENT402_DISCOVERY_URL = "https://agent402.tools/api/route";
export const AGENT402_SEARCH_URL = "https://agent402.tools/api/search";
export const AGENT402_NETWORK = "stellar:pubnet" as const;
export const AGENT402_AMOUNT_ATOMIC = "200000" as const;
export const AGENT402_PRICE = "0.02" as const;

const DiscoverySeller = z.object({
  seller: z.string().min(1).max(200),
  sellerName: z.string().min(1).max(200),
  slug: z.literal("search"),
  name: z.literal("Web search"),
  method: z.literal("GET"),
  route: z.literal("/api/search"),
  url: z.literal(AGENT402_SEARCH_URL),
  priceUsd: z.number().finite(),
  health: z.number().finite().min(1),
  paymentNetworksKnown: z.literal(true),
  routerDispatchEligible: z.literal(true),
}).passthrough();

const DiscoveryCandidate = z.object({
  seller: z.string().min(1).max(2_000),
  sellerName: z.string().min(1).max(200),
  slug: z.string().min(1).max(200),
  name: z.string().min(1).max(300),
  method: z.enum(["GET", "POST"]),
  route: z.string().min(1).max(500),
  url: z.string().url().max(2_000),
  priceUsd: z.number().finite().nonnegative(),
  health: z.number().finite().min(0).max(1),
  paymentNetworksKnown: z.boolean(),
  routerDispatchEligible: z.boolean(),
}).passthrough();

const DiscoveryResponse = z.object({
  results: z.array(DiscoveryCandidate).min(1).max(50),
}).passthrough();

const SearchResult = z.object({
  title: z.string().trim().min(1).max(500),
  url: z.string().url().max(2_000),
  description: z.string().trim().max(4_000).default(""),
  age: z.union([z.string().max(100), z.null()]).optional().default(null),
}).strict();

const SearchResponse = z.object({
  query: z.string().trim().min(1).max(400),
  count: z.number().int().min(0).max(20),
  results: z.array(SearchResult).min(1).max(20),
  untrustedContent: z.literal(true),
}).passthrough();

export interface Agent402Preflight {
  question: string;
  seller: z.infer<typeof DiscoverySeller>;
  paymentRequired: PaymentRequired;
  requirement: PaymentRequirements;
  requestUrl: string;
}

type Fetcher = typeof globalThis.fetch;

export function normalizeResearchQuestion(question: string): string {
  const normalized = question.replace(/\s+/g, " ").trim();
  if (normalized.length < 3 || normalized.length > 400) {
    throw new Error("research question must contain between 3 and 400 characters");
  }
  return normalized;
}

function timedFetch(fetcher: Fetcher, input: string | URL, init?: RequestInit): Promise<Response> {
  return fetcher(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(20_000) });
}

function validatedSearchResults(results: z.infer<typeof SearchResult>[]): Agent402SearchResult[] {
  const seen = new Set<string>();
  const output: Agent402SearchResult[] = [];
  for (const result of results) {
    const url = new URL(result.url);
    if (url.protocol !== "https:" || url.username || url.password || seen.has(url.toString())) continue;
    seen.add(url.toString());
    output.push({ ...result, url: url.toString() });
  }
  if (output.length === 0) throw new Error("Agent402 returned no safe HTTPS research sources");
  return output;
}

export function selectAgent402StellarRequirement(
  paymentRequired: PaymentRequired,
  expectedAsset: string,
): PaymentRequirements {
  if (paymentRequired.x402Version !== 2) throw new Error("Agent402 returned an unsupported x402 version");
  const resource = new URL(paymentRequired.resource.url);
  if (resource.origin !== "https://agent402.tools" || resource.pathname !== "/api/search") {
    throw new Error("Agent402 returned a payment challenge for an unexpected resource");
  }
  const matches = paymentRequired.accepts.filter((candidate) => (
    candidate.scheme === "exact"
    && candidate.network === AGENT402_NETWORK
    && candidate.asset === expectedAsset
    && candidate.amount === AGENT402_AMOUNT_ATOMIC
    && Number.isInteger(candidate.maxTimeoutSeconds)
    && candidate.maxTimeoutSeconds > 0
    && candidate.maxTimeoutSeconds <= 300
    && StrKey.isValidEd25519PublicKey(candidate.payTo)
    && candidate.extra?.areFeesSponsored === true
  ));
  if (matches.length !== 1) {
    throw new Error("Agent402 did not return one exact sponsored Stellar Mainnet USDC payment option");
  }
  return matches[0]!;
}

async function discover(fetcher: Fetcher): Promise<z.infer<typeof DiscoverySeller>> {
  const discoveryUrl = new URL(AGENT402_DISCOVERY_URL);
  discoveryUrl.searchParams.set("q", "web search");
  discoveryUrl.searchParams.set("network", "stellar");
  discoveryUrl.searchParams.set("include", "all");
  const response = await timedFetch(fetcher, discoveryUrl, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok) throw new Error(`Agent402 discovery returned HTTP ${response.status}`);
  const parsed = DiscoveryResponse.parse(await boundedResponseJson(response));
  const candidate = parsed.results.find((result) => result.seller === "self");
  const seller = candidate ? DiscoverySeller.safeParse(candidate) : null;
  if (!seller?.success || seller.data.priceUsd !== Number(AGENT402_PRICE)) {
    throw new Error("Agent402 discovery did not return the expected healthy web-search seller");
  }
  return seller.data;
}

function requestUrl(question: string): string {
  const url = new URL(AGENT402_SEARCH_URL);
  url.searchParams.set("q", question);
  url.searchParams.set("count", "10");
  url.searchParams.set("freshness", "py");
  return url.toString();
}

function parserOnlyClient(): x402HTTPClient {
  return new x402HTTPClient(new x402Client());
}

export async function preflightAgent402Research(
  question: string,
  expectedAsset: string,
  fetcher: Fetcher = globalThis.fetch,
): Promise<Agent402Preflight> {
  const normalized = normalizeResearchQuestion(question);
  const seller = await discover(fetcher);
  const url = requestUrl(normalized);
  const unpaid = await timedFetch(fetcher, url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    redirect: "error",
  });
  if (unpaid.status !== 402) throw new Error("Agent402 search did not return a payment challenge");
  const body = await boundedResponseJson(unpaid);
  const paymentRequired = parserOnlyClient().getPaymentRequiredResponse(
    (name) => unpaid.headers.get(name),
    body,
  );
  const requirement = selectAgent402StellarRequirement(paymentRequired, expectedAsset);
  return { question: normalized, seller, paymentRequired, requirement, requestUrl: url };
}

function paymentClient(config: AppConfig) {
  if (!config.agentSecret) throw new Error("research relay signer is not configured");
  const signer = createEd25519Signer(config.agentSecret, AGENT402_NETWORK);
  return new x402HTTPClient(x402Client.fromConfig({
    schemes: [{
      network: AGENT402_NETWORK,
      client: new ExactStellarScheme(signer, { url: config.network.rpcUrl }),
    }],
    spendControls: { maxAmountPerPayment: `$${AGENT402_PRICE}` },
    policies: [(_version, requirements) => requirements.filter((candidate) => (
      candidate.scheme === "exact"
      && candidate.network === AGENT402_NETWORK
      && candidate.asset === config.public.asset.contractId
      && candidate.amount === AGENT402_AMOUNT_ATOMIC
    ))],
    paymentRequirementsSelector: (_version, requirements) => {
      if (requirements.length !== 1) throw new Error("Agent402 payment selection was ambiguous");
      return requirements[0]!;
    },
  }));
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function completedFromRecord(record: Awaited<ReturnType<typeof getMarketplaceRun>>) {
  if (!record || record.status !== "complete" || !record.report || !record.evidence) return null;
  return { brief: record.report, marketplace: record.evidence };
}

export async function runAgent402Research(input: {
  config: AppConfig;
  question: string;
  mandateId: string;
  contractTx: string;
  fetcher?: Fetcher;
}) {
  const fetcher = input.fetcher ?? globalThis.fetch;
  const question = normalizeResearchQuestion(input.question);
  const questionHash = hash(question);
  const existing = await getMarketplaceRun(input.contractTx);
  if (existing) {
    if (existing.mandateId !== input.mandateId || existing.questionHash !== questionHash) {
      throw new Error("contract settlement is already bound to different research inputs");
    }
    const complete = completedFromRecord(existing);
    if (complete) return complete;
    if (existing.status === "marketplace_paid" && existing.evidence) {
      const evidence = existing.evidence as Agent402Evidence;
      const brief = await createMarketplaceReport(question, evidence);
      await completeMarketplaceRun(input.contractTx, brief);
      return { brief, marketplace: evidence };
    }
    throw new Error("marketplace payment outcome requires review before another attempt");
  }

  const preflight = await preflightAgent402Research(question, input.config.public.asset.contractId, fetcher);
  const trustlineTransaction = await ensureAgentUsdcTrustline(input.config);
  const client = paymentClient(input.config);
  const scopedRequired: PaymentRequired = { ...preflight.paymentRequired, accepts: [preflight.requirement] };
  const paymentPayload = await client.createPaymentPayload(scopedRequired);
  const paymentPayloadHash = hash(JSON.stringify(paymentPayload));
  const idempotencyKey = hash([
    "ackrate-agent402-v1",
    input.contractTx,
    input.mandateId,
    questionHash,
  ].join("\0"));
  const reservation = await reserveMarketplaceRun({
    contractTx: input.contractTx,
    mandateId: input.mandateId,
    question,
    questionHash,
    idempotencyKey,
    paymentPayloadHash,
  });
  if (!reservation.created) {
    const complete = completedFromRecord(reservation.record);
    if (complete) return complete;
    throw new Error("marketplace payment is already in progress or requires review");
  }

  let paid: Response;
  try {
    paid = await timedFetch(fetcher, preflight.requestUrl, {
      headers: {
        Accept: "application/json",
        "Idempotency-Key": idempotencyKey,
        ...client.encodePaymentSignatureHeader(paymentPayload),
      },
      cache: "no-store",
      redirect: "error",
    });
  } catch (error) {
    await markMarketplaceReviewRequired(input.contractTx);
    throw new Error("Agent402 payment response was interrupted and requires transaction review", { cause: error });
  }

  let settlement;
  try {
    settlement = client.getPaymentSettleResponse((name) => paid.headers.get(name));
  } catch (error) {
    await markMarketplaceReviewRequired(input.contractTx);
    throw new Error("Agent402 did not return verifiable settlement evidence", { cause: error });
  }
  if (
    !paid.ok
    || !settlement.success
    || settlement.network !== AGENT402_NETWORK
    || !/^[0-9a-f]{64}$/i.test(settlement.transaction)
    || (settlement.amount !== undefined && settlement.amount !== AGENT402_AMOUNT_ATOMIC)
    || (settlement.payer !== undefined && settlement.payer !== input.config.public.agentAddress)
  ) {
    await markMarketplaceReviewRequired(input.contractTx);
    throw new Error("Agent402 settlement did not match the approved Stellar payment");
  }

  const search = SearchResponse.parse(await boundedResponseJson(paid));
  const results = validatedSearchResults(search.results);
  const evidence: Agent402Evidence = {
    query: search.query,
    count: results.length,
    results,
    untrustedContent: true,
    discovery: {
      marketplace: "Agent402",
      marketplaceUrl: AGENT402_MARKETPLACE_URL,
      seller: preflight.seller.seller,
      sellerName: preflight.seller.sellerName,
      route: preflight.seller.route,
      serviceUrl: preflight.seller.url,
      health: preflight.seller.health,
    },
    settlement: {
      transaction: settlement.transaction.toLowerCase(),
      network: AGENT402_NETWORK,
      amountAtomic: AGENT402_AMOUNT_ATOMIC,
      amount: AGENT402_PRICE,
      asset: preflight.requirement.asset,
      payTo: preflight.requirement.payTo,
      payer: settlement.payer ?? null,
      idempotencyKey,
    },
    trustlineTransaction,
  };
  await markMarketplacePaid({
    contractTx: input.contractTx,
    marketplaceTx: evidence.settlement.transaction,
    seller: evidence.discovery.sellerName,
    sellerUrl: evidence.discovery.serviceUrl,
    price: evidence.settlement.amount,
    evidence,
  });
  const brief = await createMarketplaceReport(question, evidence);
  await completeMarketplaceRun(input.contractTx, brief);
  return { brief, marketplace: evidence };
}

import { z } from "zod";

export interface MarketplaceInputField {
  name: string;
  type: "string" | "number" | "integer" | "boolean" | "array" | "object";
  description: string;
  required: boolean;
  options: string[];
  example: string | number | boolean | string[] | null;
}

export interface MarketplaceService {
  id: string;
  name: string;
  description: string;
  category: string;
  categoryLabel: string;
  method: "GET" | "POST";
  path: string;
  price: string;
  docs: string;
  inputs: MarketplaceInputField[];
  schemaSource: "agent402-find" | "verified-docs" | "unavailable";
}

export const WEB_SEARCH_INPUTS: MarketplaceInputField[] = [
  { name: "q", type: "string", description: "Search query (max 400 chars)", required: true, options: [], example: "What is Solana?" },
  { name: "count", type: "number", description: "Results to return, 1-20 (default 10)", required: false, options: [], example: 10 },
  { name: "freshness", type: "string", description: "Optional: pd, pw, pm, or py (past day/week/month/year)", required: false, options: [], example: null },
];

const EndpointSchema = z.object({
  method: z.enum(["GET", "POST"]),
  path: z.string().min(1).max(180),
  name: z.string().min(1).max(120),
  price: z.string().regex(/^\$\d+(?:\.\d{1,7})?$/),
  category: z.string().min(1).max(48),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,95}$/),
  description: z.string().min(1).max(4_000),
  docs: z.string().url(),
});

const PricingSchema = z.object({
  payment: z.object({
    networks: z.array(z.string()).max(32),
  }),
  categories: z.record(z.string(), z.string()),
  endpoints: z.array(EndpointSchema).min(1).max(1_200),
});

const FindPropertySchema = z.object({
  type: z.enum(["string", "number", "integer", "boolean", "array", "object"]),
  description: z.string().max(2_000).optional().default(""),
  enum: z.array(z.union([z.string(), z.number(), z.boolean()])).max(100).optional(),
}).passthrough();

const FindResultSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,95}$/),
  name: z.string().min(1).max(200),
  route: z.string().regex(/^(GET|POST) \/\S+$/).max(240),
  price: z.string().regex(/^\$\d+(?:\.\d{1,7})?$/),
  category: z.string().min(1).max(48),
  description: z.string().min(1).max(4_000),
  docs: z.string().url(),
  inputSchema: z.object({
    properties: z.record(z.string(), FindPropertySchema).default({}),
    required: z.array(z.string()).max(100).optional().default([]),
  }).passthrough(),
  example: z.record(z.string(), z.unknown()).optional().default({}),
}).passthrough();

const FindResponseSchema = z.object({
  count: z.number().int().nonnegative().max(10_000),
  results: z.array(FindResultSchema).max(50),
}).passthrough();

const FEATURED_SLUGS = [
  "search",
  "extract",
  "render",
  "pdf",
  "search-news",
  "research",
  "v1-chat-grounded",
] as const;

export const FALLBACK_MARKETPLACE_SERVICES: MarketplaceService[] = [
  {
    id: "search",
    name: "Web search",
    description: "Find ranked, current web results with titles, links, snippets, and freshness metadata.",
    category: "web",
    categoryLabel: "Web & documents",
    method: "GET",
    path: "/api/search",
    price: "0.02",
    docs: "https://agent402.tools/tools/search",
    inputs: WEB_SEARCH_INPUTS,
    schemaSource: "verified-docs",
  },
  {
    id: "extract",
    name: "Extract article",
    description: "Turn a public article into clean markdown with its title, byline, excerpt, and word count.",
    category: "web",
    categoryLabel: "Web & documents",
    method: "POST",
    path: "/api/extract",
    price: "0.010",
    docs: "https://agent402.tools/tools/extract",
    inputs: [],
    schemaSource: "unavailable",
  },
  {
    id: "render",
    name: "Browser render",
    description: "Render JavaScript-heavy pages in a browser and return their main content as markdown.",
    category: "web",
    categoryLabel: "Web & documents",
    method: "POST",
    path: "/api/render",
    price: "0.02",
    docs: "https://agent402.tools/tools/render",
    inputs: [],
    schemaSource: "unavailable",
  },
  {
    id: "pdf",
    name: "PDF to text",
    description: "Fetch a public PDF and extract its document information, page count, and full text.",
    category: "web",
    categoryLabel: "Web & documents",
    method: "POST",
    path: "/api/pdf",
    price: "0.01",
    docs: "https://agent402.tools/tools/pdf",
    inputs: [],
    schemaSource: "unavailable",
  },
  {
    id: "v1-chat-grounded",
    name: "Grounded chat",
    description: "Answer a prompt using live web search and return citations with the response.",
    category: "llm",
    categoryLabel: "LLM gateway",
    method: "POST",
    path: "/v1/grounded/chat/completions",
    price: "0.03",
    docs: "https://agent402.tools/tools/chat-grounded",
    inputs: [],
    schemaSource: "unavailable",
  },
  {
    id: "research",
    name: "Deep research report",
    description: "Research a complete question and return one grounded report with citations and source metadata.",
    category: "llm",
    categoryLabel: "LLM gateway",
    method: "POST",
    path: "/v1/research",
    price: "0.60",
    docs: "https://agent402.tools/tools/research",
    inputs: [],
    schemaSource: "unavailable",
  },
];

function compactDescription(value: string): string {
  const sentence = value.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/, 1)[0] ?? value;
  return sentence.length <= 170 ? sentence : `${sentence.slice(0, 167).trimEnd()}…`;
}

function safeDocs(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "agent402.tools"
      ? url.toString()
      : "https://agent402.tools/stellar";
  } catch {
    return "https://agent402.tools/stellar";
  }
}

export function parseMarketplacePricing(value: unknown): MarketplaceService[] {
  const pricing = PricingSchema.parse(value);
  if (!pricing.payment.networks.includes("stellar")) {
    throw new Error("Agent402 pricing no longer advertises Stellar payments");
  }

  return pricing.endpoints.map((endpoint) => ({
    id: endpoint.slug,
    name: endpoint.name,
    description: compactDescription(endpoint.description),
    category: endpoint.category,
    categoryLabel: pricing.categories[endpoint.category] ?? endpoint.category,
    method: endpoint.method,
    path: endpoint.path,
    price: endpoint.price.slice(1),
    docs: safeDocs(endpoint.docs),
    inputs: endpoint.slug === "search" ? WEB_SEARCH_INPUTS : [],
    schemaSource: endpoint.slug === "search" ? "verified-docs" : "unavailable",
  }));
}

function fieldExample(value: unknown): MarketplaceInputField["example"] {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value;
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export function parseMarketplaceFind(value: unknown): { services: MarketplaceService[]; totalMatches: number } {
  const found = FindResponseSchema.parse(value);
  const services = found.results.map((result) => {
    const [method, path] = result.route.split(" ", 2) as ["GET" | "POST", string];
    const required = new Set(result.inputSchema.required);
    const inputs = Object.entries(result.inputSchema.properties).map(([name, property]) => ({
      name,
      type: property.type,
      description: property.description,
      required: required.has(name),
      options: property.enum?.map(String) ?? [],
      example: fieldExample(result.example[name]),
    }));
    if ([...required].some((name) => !inputs.some((field) => field.name === name))) {
      throw new Error(`Agent402 schema for ${result.slug} omitted a required property`);
    }
    return {
      id: result.slug,
      name: result.name,
      description: compactDescription(result.description),
      category: result.category,
      categoryLabel: result.category,
      method,
      path,
      price: result.price.slice(1),
      docs: safeDocs(result.docs),
      inputs,
      schemaSource: "agent402-find" as const,
    };
  });
  return { services, totalMatches: found.count };
}

function searchable(service: MarketplaceService): string {
  return [
    service.id,
    service.name,
    service.description,
    service.category,
    service.categoryLabel,
    service.path,
  ].join(" ").toLowerCase();
}

const SEARCH_ALIASES: Record<string, string[]> = {
  scrape: ["scrape", "extract", "render", "browser", "article"],
  scraper: ["scrape", "extract", "render", "browser", "article"],
  crawl: ["crawl", "extract", "render", "browser", "article"],
  crawler: ["crawl", "extract", "render", "browser", "article"],
  research: ["research", "search", "grounded", "evidence", "report"],
};

function relevance(service: MarketplaceService, terms: string[]): number {
  if (terms.length === 0) {
    const featured = FEATURED_SLUGS.indexOf(service.id as (typeof FEATURED_SLUGS)[number]);
    return featured === -1 ? 0 : 1_000 - featured;
  }

  const haystack = searchable(service);
  const termGroups = terms.map((term) => SEARCH_ALIASES[term] ?? [term]);
  if (!termGroups.every((group) => group.some((term) => haystack.includes(term)))) return -1;
  const name = service.name.toLowerCase();
  const id = service.id.toLowerCase();
  return termGroups.reduce((score, group) => score + Math.max(...group.map((term) => (
    (name === term || id === term ? 120 : 0)
    + (name.startsWith(term) || id.startsWith(term) ? 70 : 0)
    + (name.includes(term) ? 35 : 0)
    + (service.category.includes(term) ? 18 : 0)
    + (service.description.toLowerCase().includes(term) ? 8 : 0)
  ))), 0);
}

export function searchMarketplaceServices(
  services: MarketplaceService[],
  query: string,
  limit = 7,
): { services: MarketplaceService[]; totalMatches: number } {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean).slice(0, 8);
  const ranked = services
    .map((service) => ({ service, score: relevance(service, terms) }))
    .filter(({ score }) => score >= 0)
    .sort((left, right) => right.score - left.score || left.service.name.localeCompare(right.service.name));

  return {
    services: ranked.slice(0, Math.max(1, Math.min(limit, 12))).map(({ service }) => service),
    totalMatches: ranked.length,
  };
}

import { isIP } from "node:net";
import { z } from "zod";

export type SupportedAgent402Slug = "search" | "pdf" | "pdf-info";

export interface SupportedAgent402Tool {
  slug: SupportedAgent402Slug;
  sourceId: string;
  name: string;
  method: "GET" | "POST";
  path: string;
  url: string;
  price: string;
  amountAtomic: string;
  parameterNames: readonly string[];
}

export const SUPPORTED_AGENT402_TOOLS: Record<SupportedAgent402Slug, SupportedAgent402Tool> = {
  search: {
    slug: "search",
    sourceId: "agent402-research",
    name: "Web search",
    method: "GET",
    path: "/api/search",
    url: "https://agent402.tools/api/search",
    price: "0.02",
    amountAtomic: "200000",
    parameterNames: ["q", "count", "freshness"],
  },
  pdf: {
    slug: "pdf",
    sourceId: "agent402-pdf",
    name: "PDF to text",
    method: "POST",
    path: "/api/pdf",
    url: "https://agent402.tools/api/pdf",
    price: "0.01",
    amountAtomic: "100000",
    parameterNames: ["url"],
  },
  "pdf-info": {
    slug: "pdf-info",
    sourceId: "agent402-pdf-info",
    name: "PDF info",
    method: "POST",
    path: "/api/pdf-info",
    url: "https://agent402.tools/api/pdf-info",
    price: "0.002",
    amountAtomic: "20000",
    parameterNames: ["url"],
  },
};

const SearchInput = z.object({
  q: z.string().transform((value) => value.replace(/\s+/g, " ").trim()).pipe(z.string().min(3).max(400)),
  count: z.coerce.number().int().min(1).max(20).default(10),
  freshness: z.enum(["pd", "pw", "pm", "py"]).optional(),
}).strict();

const PublicPdfUrl = z.string().trim().min(1).max(2_000).transform((value, context) => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    context.addIssue({ code: "custom", message: "PDF URL must be a valid public http(s) URL" });
    return z.NEVER;
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  const ipVersion = isIP(host.replace(/^\[|\]$/g, ""));
  const privateName = host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local");
  const privateIpv4 = ipVersion === 4 && /^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host);
  const privateIpv6 = ipVersion === 6 && /^(?:::1|f[cd][0-9a-f]{2}:|fe[89ab][0-9a-f]:)/i.test(host);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || privateName || privateIpv4 || privateIpv6) {
    context.addIssue({ code: "custom", message: "PDF URL must be a public http(s) URL" });
    return z.NEVER;
  }
  return parsed.toString();
});

const PdfInput = z.object({ url: PublicPdfUrl }).strict();

export type Agent402ToolInput = Record<string, string | number>;

export function supportedAgent402Tool(slug: string): SupportedAgent402Tool | null {
  return Object.prototype.hasOwnProperty.call(SUPPORTED_AGENT402_TOOLS, slug)
    ? SUPPORTED_AGENT402_TOOLS[slug as SupportedAgent402Slug]
    : null;
}

export function supportedAgent402ToolForSource(sourceId: string): SupportedAgent402Tool | null {
  return Object.values(SUPPORTED_AGENT402_TOOLS).find((tool) => tool.sourceId === sourceId) ?? null;
}

export function normalizeAgent402ToolInput(slug: SupportedAgent402Slug, value: unknown): Agent402ToolInput {
  const parsed = slug === "search" ? SearchInput.safeParse(value) : PdfInput.safeParse(value);
  if (!parsed.success) throw new Error(`Agent402 ${SUPPORTED_AGENT402_TOOLS[slug].name} inputs are invalid`);
  return parsed.data as Agent402ToolInput;
}

export function agent402InternalQuery(tool: SupportedAgent402Tool, input: Agent402ToolInput): URLSearchParams {
  const query = new URLSearchParams();
  for (const name of tool.parameterNames) {
    const value = input[name];
    if (value !== undefined) query.set(name, String(value));
  }
  return query;
}

export function agent402InputFromQuery(tool: SupportedAgent402Tool, query: Record<string, unknown>): Agent402ToolInput {
  const candidate = Object.fromEntries(tool.parameterNames.flatMap((name) => {
    const value = query[name];
    if (value === undefined || value === "") return [];
    return [[name, value]];
  }));
  return normalizeAgent402ToolInput(tool.slug, candidate);
}

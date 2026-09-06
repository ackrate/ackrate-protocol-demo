import { z } from "zod";
import type { MarketBrief } from "./market-brief";

export const isSharedReportId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const sourceUrl = z.string().max(4096).refine((value) => {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }
  catch { return false; }
});
const briefSchema = z.object({
  kicker: z.string().max(500),
  title: z.string().min(1).max(1000),
  subtitle: z.string().max(4000),
  opening: z.string().max(12000),
  findings: z.array(z.object({ number: z.string().max(32), title: z.string().max(1000), body: z.string().max(12000) })).max(40),
  takeaway: z.string().max(12000),
  sources: z.array(z.object({ publisher: z.string().max(1000), title: z.string().max(2000), url: sourceUrl })).max(100),
  methodology: z.string().max(4000).optional(),
  generatedAt: z.string().max(100).optional(),
});
const summarySchema = z.array(z.string().trim().min(1).max(1200)).min(3).max(4);

/** Copy only editorial fields. No wallet, receipt, merchant, or raw payload metadata is public. */
export function sharedReportBrief(value: unknown): MarketBrief | null {
  const parsed = briefSchema.safeParse(value);
  if (!parsed.success) return null;
  const summary = summarySchema.safeParse((value as { summary?: unknown }).summary);
  const brief: MarketBrief = { ...parsed.data, ...(summary.success ? { summary: summary.data } : {}) };
  return JSON.stringify(brief).length <= 256 * 1024 ? brief : null;
}

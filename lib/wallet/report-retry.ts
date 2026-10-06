import { createHash } from "node:crypto";
import { z } from "zod";
import type { MarketBrief } from "./market-brief";
import { createMarketplaceReport, validComposedReport } from "./marketplace-report";
import { createPostgresClient, type PostgresQueryable } from "./postgres";

// Changing this version is an explicit operator decision to permit another model attempt.
export const REPORT_COMPOSER_VERSION = "structured-report-v1";
const ATTEMPT_STALE_MS = 120_000;
const Hash = z.string().regex(/^[0-9a-f]{64}$/);
export const ReportRetryInput = z.object({ mandateId: Hash, txHash: Hash }).strict();
const OwnerInput = ReportRetryInput.extend({ owner: z.string().regex(/^G[A-Z2-7]{55}$/) }).strict();
export type ReportRetryInput = z.infer<typeof OwnerInput>;
export type ReportRetryView = { status: "eligible" | "not_needed" | "running" | "succeeded" | "failed" | "uncertain"; retryAllowed: boolean; brief?: MarketBrief };
export class ReportRetryError extends Error {
  constructor(readonly code: "not_found" | "unavailable") { super(code); }
}

const PublicUrl = z.string().url().max(2048).refine((value) => {
  const url = new URL(value);
  return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
});
const Evidence = z.object({
  query: z.string().min(1).max(1000), count: z.number().int().min(1).max(20), untrustedContent: z.literal(true),
  results: z.array(z.object({ title: z.string().min(1).max(1000), url: PublicUrl,
    description: z.string().max(10_000), age: z.string().max(300).nullable() })).min(1).max(20),
  discovery: z.object({ marketplace: z.literal("Agent402"), marketplaceUrl: z.literal("https://agent402.tools/stellar"),
    seller: z.string(), sellerName: z.string(), route: z.string(), serviceUrl: PublicUrl, health: z.number() }),
  settlement: z.object({ transaction: Hash, network: z.literal("stellar:pubnet"), amountAtomic: z.string().regex(/^\d+$/),
    amount: z.string().regex(/^\d+(?:\.\d+)?$/), asset: z.string(), payTo: z.string(), payer: z.string().nullable(), idempotencyKey: z.string() }),
  trustlineTransaction: Hash.nullable(),
  delivery: z.object({ state: z.literal("received"), httpStatus: z.number().int().min(200).max(299) }),
});
const PaidResult = z.object({
  source: z.object({ id: z.literal("agent402-research"), title: z.string() }),
  payment: z.object({ status: z.literal("settled"), txHash: Hash, mandateId: Hash,
    amount: z.string().regex(/^\d+(?:\.\d+)?$/), asset: z.literal("USDC") }),
  delivered: z.object({ ok: z.literal(true), source: z.literal("agent402-research"), settledTx: Hash,
    mandateId: Hash, settledAmount: z.string(), asset: z.literal("USDC"), brief: z.unknown(), marketplace: Evidence }),
});
function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function missingTable(error: unknown) { return object(error)?.code === "42P01"; }
function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function atomicAmount(value: string) {
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > 7) throw new ReportRetryError("not_found");
  return BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, "0"));
}

/** No payment executor, signer, marketplace client or source fetch is imported here. */
export function createReportRetryStore(client: PostgresQueryable | null, dependencies: {
  compose?: typeof createMarketplaceReport; now?: () => number;
} = {}) {
  const compose = dependencies.compose ?? createMarketplaceReport;
  const now = dependencies.now ?? Date.now;
  let initialization: Promise<void> | undefined;
  function database() {
    if (!client) throw new ReportRetryError("unavailable");
    return client;
  }
  async function owned(raw: ReportRetryInput) {
    const input = OwnerInput.parse(raw);
    let rows;
    try {
      rows = await database().query(`
        SELECT t.session_id, t.mandate_id, t.source_id, t.status, t.result,
          m.contract_tx, m.mandate_id AS paid_mandate, m.question, m.marketplace_tx, m.price,
          m.status AS marketplace_status, m.evidence
        FROM ackrate_tool_calls t JOIN ackrate_marketplace_runs m
          ON m.contract_tx = t.result->'payment'->>'txHash'
        WHERE t.session_id = $1 AND t.mandate_id = $2 AND t.status = 'succeeded'
          AND t.source_id = 'agent402-research' AND m.contract_tx = $3
        ORDER BY t.updated_at DESC LIMIT 1
      `, [`${input.owner}:${input.mandateId}`, input.mandateId, input.txHash]);
    } catch (error) { if (missingTable(error)) throw new ReportRetryError("not_found"); throw error; }
    const row = rows[0];
    const result = PaidResult.safeParse(row?.result);
    const evidence = Evidence.safeParse(row?.evidence);
    const question = z.string().trim().min(1).max(1000).safeParse(row?.question);
    if (!row || !result.success || !evidence.success || !question.success) throw new ReportRetryError("not_found");
    const { payment, delivered } = result.data;
    const saved = evidence.data;
    if (row.session_id !== `${input.owner}:${input.mandateId}` || row.mandate_id !== input.mandateId
      || row.paid_mandate !== input.mandateId || row.contract_tx !== input.txHash
      || row.status !== "succeeded" || row.marketplace_status !== "complete" || row.source_id !== "agent402-research"
      || payment.txHash !== input.txHash || payment.mandateId !== input.mandateId
      || delivered.settledTx !== input.txHash || delivered.mandateId !== input.mandateId
      || delivered.settledAmount !== payment.amount || delivered.asset !== payment.asset
      || row.marketplace_tx !== saved.settlement.transaction || row.price !== saved.settlement.amount
      || saved.count !== saved.results.length
      || digest(saved) !== digest(delivered.marketplace)
      || atomicAmount(payment.amount) <= 0n || atomicAmount(payment.amount) !== BigInt(saved.settlement.amountAtomic)
      || atomicAmount(saved.settlement.amount) !== BigInt(saved.settlement.amountAtomic)) throw new ReportRetryError("not_found");
    const brief = object(delivered.brief);
    if (brief?.question !== question.data) throw new ReportRetryError("not_found");
    const eligible = brief?.editorialPasses === 0 && brief?.summary === undefined;
    return { input, question: question.data, evidence: saved, eligible, sourceDigest: digest({ question: question.data, evidence: saved }) };
  }
  type Owned = Awaited<ReturnType<typeof owned>>;
  function view(row: Record<string, unknown>, base: Owned): ReportRetryView {
    if (row.owner !== base.input.owner || row.mandate_id !== base.input.mandateId
      || row.source_digest !== base.sourceDigest) throw new ReportRetryError("not_found");
    if (row.status === "succeeded") {
      if (!validComposedReport(row.brief as MarketBrief, base.evidence, base.question)) throw new ReportRetryError("unavailable");
      return { status: "succeeded", retryAllowed: false, brief: row.brief as MarketBrief };
    }
    if (row.status === "failed") return { status: "failed", retryAllowed: false };
    if (row.status !== "running") throw new ReportRetryError("unavailable");
    return { status: now() - Number(row.started_at) > ATTEMPT_STALE_MS ? "uncertain" : "running", retryAllowed: false };
  }
  async function attempt(base: Owned): Promise<ReportRetryView> {
    try {
      const rows = await database().query(`SELECT * FROM ackrate_report_revisions
        WHERE contract_tx = $1 AND composer_version = $2`, [base.input.txHash, REPORT_COMPOSER_VERSION]);
      if (rows[0]) return view(rows[0], base);
    } catch (error) { if (!missingTable(error)) throw error; }
    return { status: base.eligible ? "eligible" : "not_needed", retryAllowed: base.eligible };
  }
  async function get(input: ReportRetryInput) { return attempt(await owned(input)); }
  async function retry(input: ReportRetryInput): Promise<ReportRetryView> {
    const base = await owned(input);
    const prior = await attempt(base);
    if (!prior.retryAllowed) return prior;
    initialization ??= database().query(`CREATE TABLE IF NOT EXISTS ackrate_report_revisions (
      contract_tx text NOT NULL, composer_version text NOT NULL, owner text NOT NULL,
      mandate_id text NOT NULL, source_digest text NOT NULL,
      status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
      started_at bigint NOT NULL, finished_at bigint, brief jsonb,
      PRIMARY KEY (contract_tx, composer_version)
    )`).then(() => undefined).catch((error) => { initialization = undefined; throw error; });
    await initialization;
    const inserted = await database().query(`INSERT INTO ackrate_report_revisions
      (contract_tx, composer_version, owner, mandate_id, source_digest, status, started_at)
      VALUES ($1, $2, $3, $4, $5, 'running', $6) ON CONFLICT DO NOTHING RETURNING *`,
    [input.txHash, REPORT_COMPOSER_VERSION, input.owner, input.mandateId, base.sourceDigest, now()]);
    if (inserted.length !== 1) return attempt(base);
    // No automatic retry, including after an uncertain worker outcome. One reserved call only.
    let brief: MarketBrief | null = null;
    try {
      const candidate = await compose(base.question, base.evidence, { singlePass: true });
      if (validComposedReport(candidate, base.evidence, base.question)) brief = candidate;
    } catch { /* The original paid report remains available. Do not repeat a model call. */ }
    const rows = await database().query(`UPDATE ackrate_report_revisions
      SET status = $6, brief = $7::jsonb, finished_at = $8
      WHERE contract_tx = $1 AND composer_version = $2 AND owner = $3
        AND mandate_id = $4 AND source_digest = $5 AND status = 'running' RETURNING *`,
    [input.txHash, REPORT_COMPOSER_VERSION, input.owner, input.mandateId, base.sourceDigest,
      brief ? "succeeded" : "failed", JSON.stringify(brief), now()]);
    if (!rows[0]) throw new ReportRetryError("unavailable");
    return view(rows[0], base);
  }
  return { get, retry };
}

let configured: { url: string | undefined; store: ReturnType<typeof createReportRetryStore> } | undefined;
export function reportRetryStore() {
  const url = process.env.DATABASE_URL;
  if (!configured || configured.url !== url) configured = { url, store: createReportRetryStore(url ? createPostgresClient(url) : null) };
  return configured.store;
}

import { randomUUID } from "node:crypto";
import type { MarketBrief } from "./market-brief";
import { createPostgresClient, type PostgresQueryable } from "./postgres";
import { sharedReportBrief } from "./shared-report";

export interface SharedReportSnapshot {
  id: string;
  createdAt: string;
  brief: MarketBrief;
}

export interface CreateSharedReportInput {
  owner: string;
  mandateId: string;
  txHash: string;
}

export class SharedReportStoreError extends Error {
  constructor(public readonly code: "unavailable" | "not_found" | "invalid", message: string) {
    super(message);
    this.name = "SharedReportStoreError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/i;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function missingTable(error: unknown): boolean {
  return object(error)?.code === "42P01";
}

function notFound(): SharedReportStoreError {
  return new SharedReportStoreError("not_found", "A completed report for this payment was not found in your wallet history.");
}

function snapshot(row: Record<string, unknown> | undefined): SharedReportSnapshot | null {
  if (!row || typeof row.id !== "string" || !UUID.test(row.id)) return null;
  const brief = sharedReportBrief(row.brief);
  const created = row.created_at instanceof Date ? row.created_at
    : typeof row.created_at === "string" ? new Date(row.created_at) : null;
  if (!brief || !created || !Number.isFinite(created.getTime())) return null;
  return { id: row.id.toLowerCase(), createdAt: created.toISOString(), brief };
}

function ownedBrief(row: Record<string, unknown> | undefined, input: CreateSharedReportInput): MarketBrief | null {
  if (!row || row.session_id !== `${input.owner}:${input.mandateId}`
    || row.mandate_id !== input.mandateId || row.status !== "succeeded"
    || typeof row.source_id !== "string" || !row.source_id) return null;
  const result = object(row.result);
  const source = object(result?.source);
  const payment = object(result?.payment);
  const delivered = object(result?.delivered);
  if (!source || source.id !== row.source_id || !payment || payment.status !== "settled"
    || payment.txHash !== input.txHash || payment.mandateId !== input.mandateId
    || typeof payment.amount !== "string" || !/^\d+(?:\.\d+)?$/.test(payment.amount)
    || !Number.isFinite(Number(payment.amount)) || Number(payment.amount) <= 0
    || typeof payment.asset !== "string" || !payment.asset
    || !delivered || delivered.ok !== true || delivered.deliveryState === "terminal"
    || delivered.source !== row.source_id || delivered.settledTx !== input.txHash
    || delivered.mandateId !== input.mandateId || delivered.settledAmount !== payment.amount
    || delivered.asset !== payment.asset) return null;
  return sharedReportBrief(delivered.brief);
}

/** Durable report snapshots only. No process-memory or filesystem fallback. */
export function createSharedReportStore(client: PostgresQueryable | null) {
  let initialization: Promise<void> | undefined;

  async function initialize(): Promise<void> {
    if (!client) throw new SharedReportStoreError("unavailable", "Report sharing requires the configured PostgreSQL database.");
    initialization ??= client.query(`
      CREATE TABLE IF NOT EXISTS ackrate_shared_reports (
        id uuid PRIMARY KEY,
        owner text NOT NULL,
        mandate_id text NOT NULL,
        tx_hash text NOT NULL,
        brief jsonb NOT NULL,
        created_at timestamptz NOT NULL,
        UNIQUE (owner, tx_hash)
      )
    `).then(() => undefined).catch((error) => {
      initialization = undefined;
      throw error;
    });
    await initialization;
  }

  async function createSharedReport(raw: CreateSharedReportInput): Promise<SharedReportSnapshot> {
    if (!client) throw new SharedReportStoreError("unavailable", "Report sharing requires the configured PostgreSQL database.");
    if (!raw || typeof raw.owner !== "string" || !/^G[A-Z2-7]{55}$/.test(raw.owner)
      || typeof raw.mandateId !== "string" || !HASH.test(raw.mandateId)
      || typeof raw.txHash !== "string" || !HASH.test(raw.txHash)) {
      throw new SharedReportStoreError("invalid", "Choose a completed report from your wallet history.");
    }
    const input = { owner: raw.owner, mandateId: raw.mandateId.toLowerCase(), txHash: raw.txHash.toLowerCase() };
    let rows: ReadonlyArray<Record<string, unknown>>;
    try {
      rows = await client.query(`
        SELECT session_id, mandate_id, source_id, status, result
        FROM ackrate_tool_calls
        WHERE session_id = $1 AND mandate_id = $2 AND status = 'succeeded'
          AND result->'payment'->>'txHash' = $3
        ORDER BY updated_at DESC LIMIT 1
      `, [`${input.owner}:${input.mandateId}`, input.mandateId, input.txHash]);
    } catch (error) {
      if (missingTable(error)) throw notFound();
      throw error;
    }
    const brief = ownedBrief(rows[0], input);
    if (!brief) throw notFound();

    // Only an explicit share of a verified owned report may create the table.
    await initialize();
    const inserted = await client.query(`
      INSERT INTO ackrate_shared_reports (id, owner, mandate_id, tx_hash, brief, created_at)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6::timestamptz)
      ON CONFLICT (owner, tx_hash) DO NOTHING
      RETURNING id, brief, created_at
    `, [randomUUID(), input.owner, input.mandateId, input.txHash, JSON.stringify(brief), new Date().toISOString()]);
    const existing = inserted.length ? inserted : await client.query(`
      SELECT id, brief, created_at FROM ackrate_shared_reports
      WHERE owner = $1 AND tx_hash = $2 AND mandate_id = $3
      LIMIT 1
    `, [input.owner, input.txHash, input.mandateId]);
    const saved = snapshot(existing[0]);
    if (!saved) throw new SharedReportStoreError("unavailable", "The saved report could not be loaded. Please try sharing it again.");
    return saved;
  }

  async function getSharedReport(id: string): Promise<SharedReportSnapshot | null> {
    if (typeof id !== "string" || !UUID.test(id) || !client) return null;
    try {
      const rows = await client.query(`
        SELECT id, brief, created_at FROM ackrate_shared_reports WHERE id = $1 LIMIT 1
      `, [id.toLowerCase()]);
      return snapshot(rows[0]);
    } catch (error) {
      if (missingTable(error)) return null;
      throw error;
    }
  }

  return { createSharedReport, getSharedReport };
}

let configured: { url: string | undefined; store: ReturnType<typeof createSharedReportStore> } | undefined;

function configuredStore() {
  const url = process.env.DATABASE_URL;
  if (!configured || configured.url !== url) {
    configured = { url, store: createSharedReportStore(url ? createPostgresClient(url) : null) };
  }
  return configured.store;
}

export function createSharedReport(input: CreateSharedReportInput): Promise<SharedReportSnapshot> {
  return configuredStore().createSharedReport(input);
}

export function getSharedReport(id: string): Promise<SharedReportSnapshot | null> {
  return configuredStore().getSharedReport(id);
}

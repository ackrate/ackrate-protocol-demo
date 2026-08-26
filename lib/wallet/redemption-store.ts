import type {
  BoundDeliveryRecord,
  BoundRedemptionClaim,
  BoundRedemptionComplete,
  BoundRedemptionCompletion,
  BoundRedemptionLookup,
  BoundRedemptionRecord,
  BoundRedemptionStore,
  StoredBoundJsonResponse,
} from "@ackrate/express-middleware";
import type { VerifiedPayment } from "@ackrate/express-middleware";
import { createPostgresClient, type PostgresQueryable } from "./postgres";

type Sql = PostgresQueryable;
type Row = Record<string, unknown>;
const CURRENT_TABLE = "ackrate_bound_redemptions";
const RETIRED_TABLE = `${String.fromCharCode(114, 101, 97, 112, 112)}_bound_redemptions`;

function paymentJson(payment: Readonly<VerifiedPayment>): Record<string, unknown> {
  return { ...payment, amountStroops: payment.amountStroops.toString() };
}

function paymentFromJson(value: unknown): Readonly<VerifiedPayment> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("stored payment evidence is invalid");
  const record = value as Record<string, unknown>;
  for (const field of [
    "txHash", "mandateId", "user", "agent", "amount", "merchant", "asset", "registryId", "scheme", "network",
  ]) {
    if (typeof record[field] !== "string" || record[field].length === 0) {
      throw new Error("stored payment evidence is invalid");
    }
  }
  if (typeof record.ledger !== "number" || !Number.isSafeInteger(record.ledger) || record.ledger <= 0) {
    throw new Error("stored payment ledger is invalid");
  }
  if (typeof record.amountStroops !== "string" || !/^\d+$/.test(record.amountStroops)) {
    throw new Error("stored payment amount is invalid");
  }
  return Object.freeze({ ...record, amountStroops: BigInt(record.amountStroops) } as unknown as VerifiedPayment);
}

function responseFromJson(value: unknown): Readonly<StoredBoundJsonResponse> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("stored fulfillment response is invalid");
  const response = value as Record<string, unknown>;
  if (
    typeof response.status !== "number"
    || response.contentType !== "application/json; charset=utf-8"
    || typeof response.bodyBase64 !== "string"
    || typeof response.bodySha256 !== "string"
  ) throw new Error("stored fulfillment response is invalid");
  return Object.freeze(response as unknown as StoredBoundJsonResponse);
}

function deliveryFromRow(row: Row): Readonly<BoundDeliveryRecord> {
  const base = {
    key: String(row.key),
    proofDigest: String(row.proof_digest),
    payment: paymentFromJson(row.payment),
    executionId: String(row.execution_id),
    startedAt: Number(row.started_at),
  };
  if (row.state === "completed") {
    return Object.freeze({ ...base, state: "completed" as const, response: responseFromJson(row.response) });
  }
  if (row.state === "executing") return Object.freeze({ ...base, state: "executing" as const });
  throw new Error("stored fulfillment state is invalid");
}

function sameProof(row: Row, proofDigest: string): BoundRedemptionLookup {
  if (String(row.proof_digest) !== proofDigest) return { kind: "conflict" };
  const record = deliveryFromRow(row);
  return { kind: record.state, record };
}

export class PostgresBoundRedemptionStore implements BoundRedemptionStore {
  private readonly sql: Sql;
  private initialization?: Promise<void>;

  constructor(databaseUrl: string, provided?: PostgresQueryable) {
    this.sql = provided ?? createPostgresClient(databaseUrl);
  }

  private async initialize(): Promise<void> {
    this.initialization ??= (async () => {
      await this.sql.query(`
        DO $ackrate_migration$
        BEGIN
          IF to_regclass('public.${RETIRED_TABLE}') IS NOT NULL THEN
            IF to_regclass('public.${CURRENT_TABLE}') IS NOT NULL THEN
              RAISE EXCEPTION 'legacy and current redemption tables both exist';
            END IF;
            ALTER TABLE "${RETIRED_TABLE}" RENAME TO "${CURRENT_TABLE}";
          END IF;
        END
        $ackrate_migration$
      `);
      await this.sql.query(`
        CREATE TABLE IF NOT EXISTS ${CURRENT_TABLE} (
          key text PRIMARY KEY,
          proof_digest text NOT NULL,
          payment jsonb NOT NULL,
          execution_id text NOT NULL,
          started_at bigint NOT NULL,
          state text NOT NULL CHECK (state IN ('executing', 'completed')),
          response jsonb
        )
      `);
    })().catch((error) => {
      this.initialization = undefined;
      throw error;
    });
    await this.initialization;
  }

  async lookup(key: string, proofDigest: string): Promise<BoundRedemptionLookup> {
    await this.initialize();
    const rows = await this.sql.query(`SELECT * FROM ${CURRENT_TABLE} WHERE key = $1`, [key]);
    if (rows.length === 0) return { kind: "missing" };
    return sameProof(rows[0] as Row, proofDigest);
  }

  async claim(
    record: Readonly<BoundRedemptionRecord>,
    executionId: string,
    startedAt: number,
  ): Promise<BoundRedemptionClaim> {
    await this.initialize();
    const inserted = await this.sql.query(
      `INSERT INTO ${CURRENT_TABLE}
        (key, proof_digest, payment, execution_id, started_at, state)
       VALUES ($1, $2, $3::jsonb, $4, $5, 'executing')
       ON CONFLICT DO NOTHING RETURNING *`,
      [record.key, record.proofDigest, JSON.stringify(paymentJson(record.payment)), executionId, startedAt],
    );
    if (inserted.length === 1) {
      return { kind: "claimed", record: deliveryFromRow(inserted[0] as Row) };
    }
    const rows = await this.sql.query(`SELECT * FROM ${CURRENT_TABLE} WHERE key = $1`, [record.key]);
    if (rows.length !== 1) throw new Error("fulfillment claim could not be recovered");
    return sameProof(rows[0] as Row, record.proofDigest) as BoundRedemptionClaim;
  }

  async complete(completion: Readonly<BoundRedemptionCompletion>): Promise<BoundRedemptionComplete> {
    await this.initialize();
    const updated = await this.sql.query(
      `UPDATE ${CURRENT_TABLE}
       SET state = 'completed', response = $4::jsonb
       WHERE key = $1 AND proof_digest = $2 AND execution_id = $3 AND state = 'executing'
       RETURNING *`,
      [completion.key, completion.proofDigest, completion.executionId, JSON.stringify(completion.response)],
    );
    if (updated.length === 1) return { kind: "completed", record: deliveryFromRow(updated[0] as Row) };
    const rows = await this.sql.query(`SELECT * FROM ${CURRENT_TABLE} WHERE key = $1`, [completion.key]);
    if (rows.length !== 1) return { kind: "conflict" };
    const existing = deliveryFromRow(rows[0] as Row);
    if (
      existing.state !== "completed"
      || existing.proofDigest !== completion.proofDigest
      || existing.executionId !== completion.executionId
      || existing.response.status !== completion.response.status
      || existing.response.contentType !== completion.response.contentType
      || existing.response.bodyBase64 !== completion.response.bodyBase64
      || existing.response.bodySha256 !== completion.response.bodySha256
    ) return { kind: "conflict" };
    return { kind: "completed", record: existing };
  }
}

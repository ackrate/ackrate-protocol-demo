import type { SettlementReceipt, SettlementReceiptStore } from "@ackrate/core";
import { createPostgresClient, type PostgresQueryable } from "./postgres";
import { restoreReceiptKeyOrder } from "./receipt-order";

type Sql = PostgresQueryable;

const memory = globalThis as typeof globalThis & {
  __ackrateChallenges?: Set<string>;
  __ackrateToolCalls?: Map<string, ToolCallRecord>;
  __ackrateReceipts?: Map<string, SettlementReceipt>;
  __ackrateMarketplaceRuns?: Map<string, MarketplaceRunRecord>;
};

memory.__ackrateChallenges ??= new Set();
memory.__ackrateToolCalls ??= new Map();
memory.__ackrateReceipts ??= new Map();
memory.__ackrateMarketplaceRuns ??= new Map();

let sqlClient: Sql | null | undefined;
let initialization: Promise<void> | undefined;

function sql(): Sql | null {
  if (sqlClient !== undefined) return sqlClient;
  sqlClient = process.env.DATABASE_URL ? createPostgresClient(process.env.DATABASE_URL) : null;
  return sqlClient;
}

async function initialize(): Promise<Sql | null> {
  const client = sql();
  if (!client) return null;
  initialization ??= (async () => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ackrate_auth_challenges (
        jti text PRIMARY KEY,
        expires_at bigint NOT NULL,
        consumed_at bigint NOT NULL
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ackrate_tool_calls (
        session_id text NOT NULL,
        tool_call_id text NOT NULL,
        mandate_id text NOT NULL,
        source_id text NOT NULL,
        status text NOT NULL CHECK (status IN ('running', 'succeeded', 'delivery_pending', 'failed')),
        result jsonb,
        created_at bigint NOT NULL,
        updated_at bigint NOT NULL,
        PRIMARY KEY (session_id, tool_call_id)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ackrate_payment_receipts (
        receipt_id text PRIMARY KEY,
        session_id text NOT NULL,
        mandate_id text NOT NULL,
        receipt jsonb NOT NULL,
        created_at bigint NOT NULL
      )
    `);
    /* A receipt's id hashes JSON.stringify of its proof, so key order is part
       of its identity and jsonb does not preserve it. Keep the exact bytes. */
    await client.query(`
      ALTER TABLE ackrate_payment_receipts ADD COLUMN IF NOT EXISTS receipt_text text
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ackrate_marketplace_runs (
        contract_tx text PRIMARY KEY,
        mandate_id text NOT NULL,
        question text NOT NULL,
        question_hash text NOT NULL,
        idempotency_key text NOT NULL UNIQUE,
        payment_payload_hash text NOT NULL,
        status text NOT NULL CHECK (status IN ('payment_pending', 'marketplace_paid', 'complete', 'review_required')),
        marketplace_tx text,
        seller text,
        seller_url text,
        price text,
        evidence jsonb,
        report jsonb,
        created_at bigint NOT NULL,
        updated_at bigint NOT NULL
      )
    `);
  })().catch((error) => {
    initialization = undefined;
    throw error;
  });
  await initialization;
  return client;
}

export async function consumeChallenge(jti: string, expiresAt: number): Promise<boolean> {
  const client = await initialize();
  if (!client) {
    if (memory.__ackrateChallenges!.has(jti)) return false;
    memory.__ackrateChallenges!.add(jti);
    return true;
  }
  const rows = await client.query(
    `INSERT INTO ackrate_auth_challenges (jti, expires_at, consumed_at)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING jti`,
    [jti, expiresAt, Math.floor(Date.now() / 1_000)],
  );
  return rows.length === 1;
}

export interface ToolCallRecord {
  sessionId: string;
  toolCallId: string;
  mandateId: string;
  sourceId: string;
  status: "running" | "succeeded" | "delivery_pending" | "failed";
  result: unknown;
}

const toolKey = (sessionId: string, toolCallId: string) => `${sessionId}:${toolCallId}`;

export async function reserveToolCall(input: Omit<ToolCallRecord, "status" | "result">): Promise<{ created: boolean; record: ToolCallRecord }> {
  const client = await initialize();
  const record: ToolCallRecord = { ...input, status: "running", result: null };
  if (!client) {
    const key = toolKey(input.sessionId, input.toolCallId);
    const existing = memory.__ackrateToolCalls!.get(key);
    if (existing) return { created: false, record: existing };
    memory.__ackrateToolCalls!.set(key, record);
    return { created: true, record };
  }
  const now = Math.floor(Date.now() / 1_000);
  const inserted = await client.query(
    `INSERT INTO ackrate_tool_calls
       (session_id, tool_call_id, mandate_id, source_id, status, result, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'running', NULL, $5, $5)
     ON CONFLICT DO NOTHING RETURNING *`,
    [input.sessionId, input.toolCallId, input.mandateId, input.sourceId, now],
  );
  const rows = inserted.length ? inserted : await client.query(
    `SELECT * FROM ackrate_tool_calls WHERE session_id = $1 AND tool_call_id = $2`,
    [input.sessionId, input.toolCallId],
  );
  const row = rows[0] as Record<string, unknown>;
  return {
    created: inserted.length === 1,
    record: {
      sessionId: String(row.session_id),
      toolCallId: String(row.tool_call_id),
      mandateId: String(row.mandate_id),
      sourceId: String(row.source_id),
      status: row.status as ToolCallRecord["status"],
      result: row.result ?? null,
    },
  };
}

export async function completeToolCall(
  input: Pick<ToolCallRecord, "sessionId" | "toolCallId" | "status" | "result">,
): Promise<void> {
  const client = await initialize();
  if (!client) {
    const key = toolKey(input.sessionId, input.toolCallId);
    const prior = memory.__ackrateToolCalls!.get(key);
    if (!prior) throw new Error("tool call was not reserved");
    memory.__ackrateToolCalls!.set(key, { ...prior, status: input.status, result: input.result });
    return;
  }
  await client.query(
    `UPDATE ackrate_tool_calls SET status = $3, result = $4::jsonb, updated_at = $5
     WHERE session_id = $1 AND tool_call_id = $2`,
    [input.sessionId, input.toolCallId, input.status, JSON.stringify(input.result), Math.floor(Date.now() / 1_000)],
  );
}

export async function completePendingToolCalls(input: {
  sessionId: string;
  mandateId: string;
  sourceId: string;
  result: unknown;
}): Promise<void> {
  const client = await initialize();
  if (!client) {
    for (const [key, record] of memory.__ackrateToolCalls!.entries()) {
      if (
        record.sessionId === input.sessionId
        && record.mandateId === input.mandateId
        && record.sourceId === input.sourceId
        && record.status === "delivery_pending"
      ) {
        memory.__ackrateToolCalls!.set(key, { ...record, status: "succeeded", result: input.result });
      }
    }
    return;
  }
  await client.query(
    `UPDATE ackrate_tool_calls SET status = 'succeeded', result = $4::jsonb, updated_at = $5
     WHERE session_id = $1 AND mandate_id = $2 AND source_id = $3 AND status = 'delivery_pending'`,
    [input.sessionId, input.mandateId, input.sourceId, JSON.stringify(input.result), Math.floor(Date.now() / 1_000)],
  );
}

export async function latestSucceededToolCall(input: {
  sessionId: string;
  mandateId: string;
}): Promise<ToolCallRecord | null> {
  const client = await initialize();
  if (!client) {
    const matches = [...memory.__ackrateToolCalls!.values()].filter((record) => (
      record.sessionId === input.sessionId
      && record.mandateId === input.mandateId
      && record.status === "succeeded"
    ));
    return matches.at(-1) ?? null;
  }
  const rows = await client.query(
    `SELECT * FROM ackrate_tool_calls
     WHERE session_id = $1 AND mandate_id = $2 AND status = 'succeeded'
     ORDER BY updated_at DESC LIMIT 1`,
    [input.sessionId, input.mandateId],
  );
  if (!rows[0]) return null;
  const row = rows[0] as Record<string, unknown>;
  return {
    sessionId: String(row.session_id),
    toolCallId: String(row.tool_call_id),
    mandateId: String(row.mandate_id),
    sourceId: String(row.source_id),
    status: "succeeded",
    result: row.result ?? null,
  };
}

export class DurableReceiptStore implements SettlementReceiptStore {
  constructor(private readonly sessionId: string, private readonly mandateId: string) {}

  async savePending(receipt: Readonly<SettlementReceipt>): Promise<void> {
    const client = await initialize();
    if (!client) {
      memory.__ackrateReceipts!.set(receipt.receiptId, receipt);
      return;
    }
    const exact = JSON.stringify(receipt);
    await client.query(
      `INSERT INTO ackrate_payment_receipts (receipt_id, session_id, mandate_id, receipt, receipt_text, created_at)
       VALUES ($1, $2, $3, $4::jsonb, $4, $5)
       ON CONFLICT (receipt_id) DO UPDATE SET receipt = EXCLUDED.receipt, receipt_text = EXCLUDED.receipt_text`,
      [receipt.receiptId, this.sessionId, this.mandateId, exact, Math.floor(Date.now() / 1_000)],
    );
  }

  async clearPending(receiptId: string): Promise<void> {
    const client = await initialize();
    if (!client) {
      memory.__ackrateReceipts!.delete(receiptId);
      return;
    }
    await client.query(
      `DELETE FROM ackrate_payment_receipts WHERE receipt_id = $1 AND session_id = $2 AND mandate_id = $3`,
      [receiptId, this.sessionId, this.mandateId],
    );
  }

  async listPending(): Promise<ReadonlyArray<Readonly<SettlementReceipt>>> {
    const client = await initialize();
    if (!client) {
      return [...memory.__ackrateReceipts!.values()].filter((receipt) => receipt.mandateId === this.mandateId);
    }
    const rows = await client.query(
      `SELECT receipt, receipt_text FROM ackrate_payment_receipts
       WHERE session_id = $1 AND mandate_id = $2 ORDER BY created_at ASC`,
      [this.sessionId, this.mandateId],
    );
    return rows.flatMap((row) => {
      const record = row as { receipt: SettlementReceipt; receipt_text: string | null };
      /* Exact bytes when this receipt was written after the text column
         existed; otherwise repair the key order jsonb dropped. */
      if (record.receipt_text) {
        try {
          return [JSON.parse(record.receipt_text) as SettlementReceipt];
        } catch {
          /* fall through to the jsonb copy */
        }
      }
      const restored = restoreReceiptKeyOrder(record.receipt);
      return restored ? [restored] : [record.receipt];
    });
  }
}

export interface MarketplaceRunRecord {
  contractTx: string;
  mandateId: string;
  question: string;
  questionHash: string;
  idempotencyKey: string;
  paymentPayloadHash: string;
  status: "payment_pending" | "marketplace_paid" | "complete" | "review_required";
  marketplaceTx: string | null;
  seller: string | null;
  sellerUrl: string | null;
  price: string | null;
  evidence: unknown;
  report: unknown;
}

function marketplaceRow(row: Record<string, unknown>): MarketplaceRunRecord {
  return {
    contractTx: String(row.contract_tx),
    mandateId: String(row.mandate_id),
    question: String(row.question),
    questionHash: String(row.question_hash),
    idempotencyKey: String(row.idempotency_key),
    paymentPayloadHash: String(row.payment_payload_hash),
    status: row.status as MarketplaceRunRecord["status"],
    marketplaceTx: typeof row.marketplace_tx === "string" ? row.marketplace_tx : null,
    seller: typeof row.seller === "string" ? row.seller : null,
    sellerUrl: typeof row.seller_url === "string" ? row.seller_url : null,
    price: typeof row.price === "string" ? row.price : null,
    evidence: row.evidence ?? null,
    report: row.report ?? null,
  };
}

export async function getMarketplaceRun(contractTx: string): Promise<MarketplaceRunRecord | null> {
  const client = await initialize();
  if (!client) return memory.__ackrateMarketplaceRuns!.get(contractTx) ?? null;
  const rows = await client.query(
    `SELECT * FROM ackrate_marketplace_runs WHERE contract_tx = $1`,
    [contractTx],
  );
  return rows[0] ? marketplaceRow(rows[0] as Record<string, unknown>) : null;
}

export async function reserveMarketplaceRun(
  input: Omit<MarketplaceRunRecord, "status" | "marketplaceTx" | "seller" | "sellerUrl" | "price" | "evidence" | "report">,
): Promise<{ created: boolean; record: MarketplaceRunRecord }> {
  const client = await initialize();
  const record: MarketplaceRunRecord = {
    ...input,
    status: "payment_pending",
    marketplaceTx: null,
    seller: null,
    sellerUrl: null,
    price: null,
    evidence: null,
    report: null,
  };
  if (!client) {
    const existing = memory.__ackrateMarketplaceRuns!.get(input.contractTx);
    if (existing) return { created: false, record: existing };
    memory.__ackrateMarketplaceRuns!.set(input.contractTx, record);
    return { created: true, record };
  }
  const now = Math.floor(Date.now() / 1_000);
  const inserted = await client.query(
    `INSERT INTO ackrate_marketplace_runs
       (contract_tx, mandate_id, question, question_hash, idempotency_key, payment_payload_hash, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'payment_pending', $7, $7)
     ON CONFLICT DO NOTHING RETURNING *`,
    [input.contractTx, input.mandateId, input.question, input.questionHash, input.idempotencyKey, input.paymentPayloadHash, now],
  );
  const rows = inserted.length ? inserted : await client.query(
    `SELECT * FROM ackrate_marketplace_runs WHERE contract_tx = $1`,
    [input.contractTx],
  );
  if (!rows[0]) throw new Error("marketplace payment reservation collided with a different request");
  return { created: inserted.length === 1, record: marketplaceRow(rows[0] as Record<string, unknown>) };
}

export async function markMarketplacePaid(input: {
  contractTx: string;
  marketplaceTx: string;
  seller: string;
  sellerUrl: string;
  price: string;
  evidence: unknown;
}): Promise<void> {
  const client = await initialize();
  if (!client) {
    const prior = memory.__ackrateMarketplaceRuns!.get(input.contractTx);
    if (!prior) throw new Error("marketplace run was not reserved");
    memory.__ackrateMarketplaceRuns!.set(input.contractTx, {
      ...prior,
      status: "marketplace_paid",
      marketplaceTx: input.marketplaceTx,
      seller: input.seller,
      sellerUrl: input.sellerUrl,
      price: input.price,
      evidence: input.evidence,
    });
    return;
  }
  const rows = await client.query(
    `UPDATE ackrate_marketplace_runs
     SET status = 'marketplace_paid', marketplace_tx = $2, seller = $3, seller_url = $4,
         price = $5, evidence = $6::jsonb, updated_at = $7
     WHERE contract_tx = $1 AND status IN ('payment_pending', 'marketplace_paid') RETURNING contract_tx`,
    [input.contractTx, input.marketplaceTx, input.seller, input.sellerUrl, input.price, JSON.stringify(input.evidence), Math.floor(Date.now() / 1_000)],
  );
  if (rows.length !== 1) throw new Error("marketplace payment state could not be committed");
}

export async function completeMarketplaceRun(contractTx: string, report: unknown): Promise<void> {
  const client = await initialize();
  if (!client) {
    const prior = memory.__ackrateMarketplaceRuns!.get(contractTx);
    if (!prior || !prior.marketplaceTx) throw new Error("marketplace payment evidence is missing");
    memory.__ackrateMarketplaceRuns!.set(contractTx, { ...prior, status: "complete", report });
    return;
  }
  const rows = await client.query(
    `UPDATE ackrate_marketplace_runs SET status = 'complete', report = $2::jsonb, updated_at = $3
     WHERE contract_tx = $1 AND status IN ('marketplace_paid', 'complete') AND marketplace_tx IS NOT NULL
     RETURNING contract_tx`,
    [contractTx, JSON.stringify(report), Math.floor(Date.now() / 1_000)],
  );
  if (rows.length !== 1) throw new Error("marketplace report state could not be committed");
}

export async function markMarketplaceReviewRequired(contractTx: string): Promise<void> {
  const client = await initialize();
  if (!client) {
    const prior = memory.__ackrateMarketplaceRuns!.get(contractTx);
    if (!prior) throw new Error("marketplace run was not reserved");
    memory.__ackrateMarketplaceRuns!.set(contractTx, { ...prior, status: "review_required" });
    return;
  }
  await client.query(
    `UPDATE ackrate_marketplace_runs SET status = 'review_required', updated_at = $2
     WHERE contract_tx = $1 AND status = 'payment_pending'`,
    [contractTx, Math.floor(Date.now() / 1_000)],
  );
}

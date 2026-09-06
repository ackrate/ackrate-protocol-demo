import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResultRow } from "pg";
import { MARKET_SIGNAL_BRIEF } from "../lib/wallet/market-brief";
import type { PostgresQueryable } from "../lib/wallet/postgres";
import { createSharedReportStore, SharedReportStoreError } from "../lib/wallet/shared-report-store";

const owner = `G${"A".repeat(55)}`;
const mandateId = "a".repeat(64);
const txHash = "b".repeat(64);
const input = { owner, mandateId, txHash };
const publicId = "f67389f8-6fa9-4b86-aeaa-0c0ea43f57c9";

function completedRow(): Record<string, unknown> {
  return {
    session_id: `${owner}:${mandateId}`, mandate_id: mandateId,
    source_id: "agent402-search", status: "succeeded",
    result: {
      source: { id: "agent402-search", title: "Web search" },
      payment: { status: "settled", txHash, mandateId, amount: "0.02", asset: "USDC" },
      delivered: {
        ok: true, source: "agent402-search", settledTx: txHash, mandateId,
        settledAmount: "0.02", asset: "USDC",
        brief: { ...structuredClone(MARKET_SIGNAL_BRIEF), owner, payment: { txHash }, receipt: "private-receipt", question: "private original request" },
        marketplace: { settlement: { transaction: "private-marketplace-transaction" } },
      },
    },
  };
}

class FakeSql implements PostgresQueryable {
  calls: Array<{ text: string; values: readonly unknown[] }> = [];
  row: Record<string, unknown> | null = completedRow();
  snapshots = new Map<string, Record<string, unknown>>();
  initFailures = 0;
  publicReadError: unknown;

  async query<Row extends QueryResultRow = QueryResultRow>(text: string, values: readonly unknown[] = []): Promise<ReadonlyArray<Row>> {
    const sql = text.replace(/\s+/g, " ").trim();
    this.calls.push({ text: sql, values });
    let rows: Record<string, unknown>[];
    if (sql.includes("FROM ackrate_tool_calls")) rows = this.row ? [this.row] : [];
    else if (sql.startsWith("CREATE TABLE")) {
      if (this.initFailures-- > 0) throw new Error("temporary initialization failure");
      rows = [];
    } else if (sql.startsWith("INSERT INTO ackrate_shared_reports")) {
      const [id, storedOwner, storedMandate, storedHash, brief, createdAt] = values;
      const existing = [...this.snapshots.values()].find((row) => row.owner === storedOwner && row.tx_hash === storedHash);
      if (existing) rows = [];
      else {
        const row = { id, owner: storedOwner, mandate_id: storedMandate, tx_hash: storedHash, brief: JSON.parse(String(brief)), created_at: createdAt };
        this.snapshots.set(String(id), row);
        rows = [row];
      }
    } else if (sql.includes("WHERE owner = $1")) {
      rows = [...this.snapshots.values()].filter((row) => row.owner === values[0] && row.tx_hash === values[1] && row.mandate_id === values[2]);
    } else if (sql.includes("WHERE id = $1")) {
      if (this.publicReadError) throw this.publicReadError;
      const row = this.snapshots.get(String(values[0]));
      rows = row ? [row] : [];
    } else throw new Error(`Unexpected SQL: ${sql}`);
    return rows as Row[];
  }
}

const resultOf = (row: Record<string, unknown>) => row.result as {
  source: Record<string, unknown>; payment: Record<string, unknown>; delivered: Record<string, unknown>;
};
const codeIs = (code: SharedReportStoreError["code"]) => (error: unknown) => error instanceof SharedReportStoreError && error.code === code;

test("sharing loads the exact owned succeeded payment and stores only editorial fields", async () => {
  const sql = new FakeSql();
  const saved = await createSharedReportStore(sql).createSharedReport({ ...input, brief: { title: "client-injected title" } } as typeof input);
  assert.match(saved.id, /^[0-9a-f-]{36}$/);
  assert.equal(saved.brief.title, MARKET_SIGNAL_BRIEF.title);
  assert.deepEqual(Object.keys(saved).sort(), ["brief", "createdAt", "id"]);
  assert.deepEqual(sql.calls[0].values, [`${owner}:${mandateId}`, mandateId, txHash]);
  assert.match(sql.calls[0].text, /session_id = \$1 AND mandate_id = \$2 AND status = 'succeeded'/);
  assert.match(sql.calls[0].text, /result->'payment'->>'txHash' = \$3/);
  assert.equal(sql.calls.filter((call) => call.text.startsWith("CREATE TABLE")).length, 1);
  const encoded = String(sql.calls.find((call) => call.text.startsWith("INSERT"))!.values[4]);
  for (const secret of [owner, mandateId, txHash, "private-receipt", "private-marketplace-transaction", "private original request", "client-injected title"]) {
    assert.equal(encoded.includes(secret), false, secret);
  }
});

test("repeated share clicks reuse the original immutable snapshot and UUID", async () => {
  const sql = new FakeSql();
  const store = createSharedReportStore(sql);
  const first = await store.createSharedReport(input);
  const delivered = resultOf(sql.row!).delivered;
  delivered.brief = { ...MARKET_SIGNAL_BRIEF, title: "A later journal edit must not rewrite the public snapshot" };
  const second = await store.createSharedReport(input);
  assert.deepEqual(second, first);
  assert.equal(sql.snapshots.size, 1);
  assert.equal(sql.calls.filter((call) => call.text.startsWith("CREATE TABLE")).length, 1);
  assert.ok(sql.calls.some((call) => call.text.includes("ON CONFLICT (owner, tx_hash) DO NOTHING")));
});

test("simultaneous share requests converge on one durable snapshot", async () => {
  const sql = new FakeSql();
  const store = createSharedReportStore(sql);
  const results = await Promise.all([store.createSharedReport(input), store.createSharedReport(input)]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(sql.snapshots.size, 1);
  assert.equal(sql.calls.filter((call) => call.text.startsWith("CREATE TABLE")).length, 1);
});

test("unowned, unpaid, mismatched, or incomplete deliveries cannot be published", async () => {
  const mutations: Array<(row: Record<string, unknown>) => void> = [
    (row) => { row.session_id = `${"G".repeat(56)}:${mandateId}`; },
    (row) => { row.mandate_id = "c".repeat(64); },
    (row) => { row.status = "delivery_pending"; },
    (row) => { resultOf(row).source.id = "different-service"; },
    (row) => { resultOf(row).payment.status = "pending"; },
    (row) => { resultOf(row).payment.txHash = "c".repeat(64); },
    (row) => { resultOf(row).payment.mandateId = "c".repeat(64); },
    (row) => { resultOf(row).payment.amount = "0"; },
    (row) => { resultOf(row).delivered.ok = false; },
    (row) => { resultOf(row).delivered.deliveryState = "terminal"; },
    (row) => { resultOf(row).delivered.source = "different-service"; },
    (row) => { resultOf(row).delivered.settledTx = "c".repeat(64); },
    (row) => { resultOf(row).delivered.mandateId = "c".repeat(64); },
    (row) => { resultOf(row).delivered.settledAmount = "0.03"; },
    (row) => { resultOf(row).delivered.asset = "XLM"; },
    (row) => { resultOf(row).delivered.brief = { title: "not a complete report" }; },
  ];
  for (const mutate of mutations) {
    const sql = new FakeSql(); mutate(sql.row!);
    await assert.rejects(createSharedReportStore(sql).createSharedReport(input), codeIs("not_found"));
    assert.equal(sql.calls.length, 1, "invalid ownership or delivery must not initialize or insert");
  }
});

test("missing journal entries cannot create the public report table", async () => {
  const sql = new FakeSql(); sql.row = null;
  await assert.rejects(createSharedReportStore(sql).createSharedReport(input), codeIs("not_found"));
  assert.equal(sql.calls.length, 1);
});

test("public reads return only the sanitized snapshot and never initialize or mutate tables", async () => {
  const sql = new FakeSql();
  sql.snapshots.set(publicId, { id: publicId, brief: { ...MARKET_SIGNAL_BRIEF, owner }, owner, mandate_id: mandateId, tx_hash: txHash, created_at: new Date("2026-09-07T00:00:00Z") });
  const result = await createSharedReportStore(sql).getSharedReport(publicId.toUpperCase());
  assert.equal(result?.createdAt, "2026-09-07T00:00:00.000Z");
  assert.deepEqual(Object.keys(result!).sort(), ["brief", "createdAt", "id"]);
  assert.equal(JSON.stringify(result).includes(owner), false);
  assert.deepEqual(sql.calls.map((call) => call.text), ["SELECT id, brief, created_at FROM ackrate_shared_reports WHERE id = $1 LIMIT 1"]);
  assert.deepEqual(sql.calls[0].values, [publicId]);
});

test("unknown or invalid public IDs return null without any creation", async () => {
  const sql = new FakeSql(); const store = createSharedReportStore(sql);
  assert.equal(await store.getSharedReport("not-a-guid' OR true--"), null);
  assert.equal(sql.calls.length, 0);
  assert.equal(await store.getSharedReport(publicId), null);
  assert.equal(sql.calls.length, 1);
});

test("missing database fails creation clearly and has no ephemeral fallback", async () => {
  const store = createSharedReportStore(null);
  await assert.rejects(store.createSharedReport(input), codeIs("unavailable"));
  assert.equal(await store.getSharedReport(publicId), null);
});

test("public lookup tolerates an uninitialized table but does not hide database outages", async () => {
  const sql = new FakeSql(); const store = createSharedReportStore(sql);
  sql.publicReadError = Object.assign(new Error("missing table"), { code: "42P01" });
  assert.equal(await store.getSharedReport(publicId), null);
  sql.publicReadError = Object.assign(new Error("connection unavailable"), { code: "ECONNRESET" });
  await assert.rejects(store.getSharedReport(publicId), /connection unavailable/);
  assert.equal(sql.calls.every((call) => call.text.startsWith("SELECT")), true);
});

test("failed initialization can be retried without retaining a rejected promise", async () => {
  const sql = new FakeSql(); sql.initFailures = 1;
  const store = createSharedReportStore(sql);
  await assert.rejects(store.createSharedReport(input), /temporary initialization failure/);
  const saved = await store.createSharedReport(input);
  assert.ok(saved.id);
  assert.equal(sql.calls.filter((call) => call.text.startsWith("CREATE TABLE")).length, 2);
});

test("malformed creation inputs are rejected before any SQL", async () => {
  const sql = new FakeSql(); const store = createSharedReportStore(sql);
  for (const invalid of [{ ...input, owner: "attacker'--" }, { ...input, mandateId: "not-a-mandate" }, { ...input, txHash: "not-a-payment" }]) {
    await assert.rejects(store.createSharedReport(invalid), codeIs("invalid"));
  }
  assert.equal(sql.calls.length, 0);
});

test("invalid stored snapshots are not returned as public reports", async () => {
  const sql = new FakeSql(); const store = createSharedReportStore(sql);
  sql.snapshots.set(publicId, { id: publicId, brief: MARKET_SIGNAL_BRIEF, created_at: "invalid date" });
  assert.equal(await store.getSharedReport(publicId), null);
  sql.snapshots.set(publicId, { id: publicId, brief: { title: "incomplete" }, created_at: new Date() });
  assert.equal(await store.getSharedReport(publicId), null);
});

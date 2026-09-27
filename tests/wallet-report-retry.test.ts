import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { rpc } from "@stellar/stellar-sdk";
import type { PostgresQueryable } from "../lib/wallet/postgres";
import type { MarketBrief } from "../lib/wallet/market-brief";
import { createReportRetryStore, ReportRetryError, REPORT_COMPOSER_VERSION } from "../lib/wallet/report-retry";
import { createReportRetryHandlers } from "../lib/wallet/report-retry-http";

const owner = `G${"A".repeat(55)}`;
const input = { owner, mandateId: "a".repeat(64), txHash: "b".repeat(64) };
const evidence = {
  query: "What is Stellar?", count: 1, untrustedContent: true,
  results: [{ title: "Stellar overview", url: "https://stellar.org/learn", description: "Stellar supports payments and digital assets.", age: null }],
  discovery: { marketplace: "Agent402", marketplaceUrl: "https://agent402.tools/stellar", seller: "fixture", sellerName: "Fixture",
    route: "/api/search", serviceUrl: "https://fixture.invalid/api/search", health: 1 },
  settlement: { transaction: "c".repeat(64), network: "stellar:pubnet", amountAtomic: "100000", amount: "0.01", asset: "fixture-asset",
    payTo: "fixture-recipient", payer: null, idempotencyKey: "fixture" },
  trustlineTransaction: null, delivery: { state: "received", httpStatus: 200 },
};
const revised: MarketBrief = {
  kicker: "Saved research", title: "Stellar payments and digital assets", subtitle: "An overview drawn from the saved source.",
  opening: "The saved overview describes Stellar as a network supporting payments and digital assets. [1]",
  findings: Array.from({ length: 3 }, (_, i) => ({ number: String(i + 1), title: "Payments and assets", body: "The overview describes payment and digital asset support. [1]" })),
  takeaway: "Consult the original Stellar overview to learn more about payments and digital assets. [1]",
  summary: Array.from({ length: 3 }, () => "Stellar supports payments and digital assets according to the overview. The retained source provides that limited starting point. [1]"),
  sources: [{ publisher: "stellar.org", title: "Stellar overview", url: "https://stellar.org/learn" }],
  question: evidence.query, editorialPasses: 1,
};
const original = {
  source: { id: "agent402-research", title: "Web search" },
  payment: { status: "settled", ...input, owner: undefined, amount: "0.01", asset: "USDC" },
  delivered: { ok: true, source: "agent402-research", settledTx: input.txHash, mandateId: input.mandateId,
    settledAmount: "0.01", asset: "USDC", marketplace: evidence, brief: { editorialPasses: 0, title: evidence.query, question: evidence.query } },
};
async function fixture(t: TestContext) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`CREATE TABLE ackrate_tool_calls (session_id text, mandate_id text, source_id text, status text, result jsonb, updated_at bigint);
    CREATE TABLE ackrate_marketplace_runs (contract_tx text, mandate_id text, question text, marketplace_tx text, price text, status text, evidence jsonb);`);
  await db.query(`INSERT INTO ackrate_tool_calls VALUES ($1,$2,'agent402-research','succeeded',$3,1)`, [`${owner}:${input.mandateId}`, input.mandateId, JSON.stringify(original)]);
  await db.query(`INSERT INTO ackrate_marketplace_runs VALUES ($1,$2,$3,$4,'0.01','complete',$5)`, [input.txHash, input.mandateId, evidence.query, evidence.settlement.transaction, JSON.stringify(evidence)]);
  const client: PostgresQueryable = { async query(text, values) { return (await db.query(text, values ? [...values] : undefined)).rows as never; } };
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async () => { calls.push("network"); throw new Error("No payment, RPC, or marketplace request allowed"); });
  t.mock.method(rpc.Server.prototype, "sendTransaction", async () => { calls.push("broadcast"); throw new Error("No transaction allowed"); });
  t.after(() => assert.deepEqual(calls, []));
  return { db, client };
}

test("one durable retry survives concurrent requests and reload without changing the paid evidence", async (t) => {
  const { db, client } = await fixture(t);
  let complete!: () => void;
  const wait = new Promise<void>((resolve) => { complete = resolve; });
  let entered!: () => void;
  const composing = new Promise<void>((resolve) => { entered = resolve; });
  let calls = 0;
  const store = createReportRetryStore(client, { compose: async (_q, _e, bounds) => {
    calls++; assert.equal(bounds?.singlePass, true); entered(); await wait; return structuredClone(revised);
  } });
  assert.deepEqual(await store.get(input), { status: "eligible", retryAllowed: true });
  assert.equal((await db.query("SELECT tablename FROM pg_tables WHERE tablename='ackrate_report_revisions'")).rows.length, 0);
  const before = await db.query("SELECT result FROM ackrate_tool_calls");
  const beforeEvidence = await db.query("SELECT * FROM ackrate_marketplace_runs");
  const pending = store.retry(input);
  await composing;
  const duplicate = await store.retry(input);
  assert.equal(duplicate.status, "running");
  assert.equal(duplicate.retryAllowed, false);
  complete();
  const success = await pending;
  assert.equal(success.status, "succeeded");
  assert.deepEqual(success.brief, revised);
  assert.equal(calls, 1);
  const restarted = createReportRetryStore(client, { compose: async () => { throw new Error("Must not run again"); } });
  assert.deepEqual(await restarted.get(input), success);
  assert.deepEqual(await restarted.retry(input), success);
  assert.deepEqual((await db.query("SELECT result FROM ackrate_tool_calls")).rows, before.rows);
  assert.deepEqual((await db.query("SELECT * FROM ackrate_marketplace_runs")).rows, beforeEvidence.rows);
  assert.equal((await db.query("SELECT * FROM ackrate_report_revisions")).rows.length, 1);
});

test("wrong owner, mandate, hash, service or mismatched paid evidence never invokes a model", async (t) => {
  const { db, client } = await fixture(t);
  let calls = 0;
  const store = createReportRetryStore(client, { compose: async () => { calls++; return revised; } });
  const notFound = (e: unknown) => e instanceof ReportRetryError && e.code === "not_found";
  for (const altered of [{ ...input, owner: `G${"B".repeat(55)}` }, { ...input, mandateId: "d".repeat(64) }, { ...input, txHash: "e".repeat(64) }]) {
    await assert.rejects(store.retry(altered), notFound);
  }
  for (const sql of [
    "UPDATE ackrate_tool_calls SET status = 'running'",
    "UPDATE ackrate_tool_calls SET source_id = 'agent402-pdf'",
    "UPDATE ackrate_tool_calls SET result = jsonb_set(result, '{payment,amount}', '\"0.02\"')",
    "UPDATE ackrate_marketplace_runs SET marketplace_tx = 'wrong'",
    "UPDATE ackrate_marketplace_runs SET status = 'marketplace_paid'",
    "UPDATE ackrate_marketplace_runs SET evidence = jsonb_set(evidence, '{delivery,state}', '\"rejected\"')",
    "UPDATE ackrate_marketplace_runs SET evidence = jsonb_set(evidence, '{results}', '[]')",
    "UPDATE ackrate_marketplace_runs SET evidence = jsonb_set(evidence, '{count}', '10')",
  ]) {
    await db.exec(sql);
    await assert.rejects(store.retry(input), notFound);
    await db.query("UPDATE ackrate_tool_calls SET status='succeeded',source_id='agent402-research',result=$1", [JSON.stringify(original)]);
    await db.query("UPDATE ackrate_marketplace_runs SET marketplace_tx=$1,status='complete',evidence=$2", [evidence.settlement.transaction, JSON.stringify(evidence)]);
  }
  assert.equal(calls, 0);
});

test("failed composition and uncertain completion never reset the model allowance", async (t) => {
  const { db, client } = await fixture(t);
  let calls = 0;
  const store = createReportRetryStore(client, { compose: async () => { calls++; throw new Error("private provider failure"); } });
  assert.deepEqual(await store.retry(input), { status: "failed", retryAllowed: false });
  assert.deepEqual(await store.retry(input), { status: "failed", retryAllowed: false });
  assert.equal(calls, 1);
  await db.query("UPDATE ackrate_report_revisions SET status='running',started_at=$1 WHERE composer_version=$2", [1, REPORT_COMPOSER_VERSION]);
  assert.deepEqual(await store.get(input), { status: "uncertain", retryAllowed: false });
  assert.deepEqual(await store.retry(input), { status: "uncertain", retryAllowed: false });
  assert.equal(calls, 1);
});

test("seller-normalized query retains the paid question and actual delivered result count", async (t) => {
  const { db, client } = await fixture(t);
  const saved = { ...evidence, query: "Stellar network overview" };
  const result = { ...original, delivered: { ...original.delivered, marketplace: saved } };
  await db.query("UPDATE ackrate_marketplace_runs SET evidence=$1", [JSON.stringify(saved)]);
  await db.query("UPDATE ackrate_tool_calls SET result=$1", [JSON.stringify(result)]);
  const store = createReportRetryStore(client, { compose: async (question, packet) => {
    assert.equal(question, original.delivered.brief.question);
    assert.equal(packet.query, saved.query);
    assert.equal(packet.count, packet.results.length);
    return revised;
  } });
  assert.equal((await store.retry(input)).status, "succeeded");
});

test("a valid existing summary requires no retry or revision table", async (t) => {
  const { db, client } = await fixture(t);
  const result = { ...original, delivered: { ...original.delivered, brief: revised } };
  await db.query("UPDATE ackrate_tool_calls SET result=$1", [JSON.stringify(result)]);
  const store = createReportRetryStore(client, { compose: async () => { assert.fail("Existing summaries cannot be retried"); } });
  assert.deepEqual(await store.get(input), { status: "not_needed", retryAllowed: false });
  assert.deepEqual(await store.retry(input), { status: "not_needed", retryAllowed: false });
  assert.equal((await db.query("SELECT tablename FROM pg_tables WHERE tablename='ackrate_report_revisions'")).rows.length, 0);
});

test("changed source evidence is rejected after a revision was reserved", async (t) => {
  const { db, client } = await fixture(t);
  const store = createReportRetryStore(client, { compose: async () => revised });
  await store.retry(input);
  const changed = structuredClone(evidence); changed.results[0].description = "Changed retained source";
  const changedResult = structuredClone(original); changedResult.delivered.marketplace = changed;
  await db.query("UPDATE ackrate_tool_calls SET result=$1", [JSON.stringify(changedResult)]);
  await db.query("UPDATE ackrate_marketplace_runs SET evidence=$1", [JSON.stringify(changed)]);
  await assert.rejects(store.retry(input), ReportRetryError);
});

test("HTTP handlers require owner session and same origin; GET only reads and failures are generic", async () => {
  let modelCalls = 0;
  let reads = 0;
  const store = { async get() { reads++; return { status: "eligible" as const, retryAllowed: true }; },
    async retry() { modelCalls++; return { status: "failed" as const, retryAllowed: false }; } };
  const deps = { requireOrigin: async () => {}, authenticate: async () => owner, modelConfigured: () => true, store: () => store };
  const post = () => new Request("https://wallet.invalid/api/wallet/reports/retry", { method: "POST", body: JSON.stringify({ mandateId: input.mandateId, txHash: input.txHash }) });
  const badOrigin = createReportRetryHandlers({ ...deps, requireOrigin: async () => { throw new Error("foreign"); } });
  assert.equal((await badOrigin.POST(post())).status, 403);
  const unsigned = createReportRetryHandlers({ ...deps, authenticate: async () => { throw new Error("private auth details"); } });
  assert.equal((await unsigned.POST(post())).status, 401);
  assert.equal((await createReportRetryHandlers({ ...deps, modelConfigured: () => false }).POST(post())).status, 503);
  const handlers = createReportRetryHandlers(deps);
  const result = await handlers.GET(new Request(`https://wallet.invalid/api/wallet/reports/retry?mandateId=${input.mandateId}&txHash=${input.txHash}`));
  assert.equal(result.status, 200); assert.match(result.headers.get("Cache-Control")!, /no-store/);
  assert.equal(reads, 1); assert.equal(modelCalls, 0);
  assert.equal((await handlers.POST(new Request(post().url, { method: "POST", body: JSON.stringify({ ...input }) }))).status, 400);
  assert.equal((await handlers.POST(post())).status, 200); assert.equal(modelCalls, 1);
  const fail = createReportRetryHandlers({ ...deps, store: () => { throw new Error("PRIVATE_DATABASE_URL"); } });
  assert.doesNotMatch(await (await fail.POST(post())).text(), /PRIVATE_DATABASE_URL/);
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import type { QueryResultRow } from "pg";
import { CLI_TEST_TTL_SECONDS, createCliTestStore } from "../lib/cli-test-store";
import { createCliBurnerJobController, type CliBurnerJobDependencies } from "../lib/cli-test-burner-job";
import type { PostgresQueryable } from "../lib/wallet/postgres";

// PostgreSQL SQL execution in a fresh in-memory WASM database per test. No
// connection string, wallet configuration, network dependency, or real funds.
// CI can pin @electric-sql/pglite@0.5.8; a temporary module can be selected with
// ACKRATE_TEST_PGLITE_MODULE without modifying the project's dependencies.
const engineModule = process.env.ACKRATE_TEST_PGLITE_MODULE || "@electric-sql/pglite";
interface Engine {
  query<Row extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<{ rows: Row[] }>;
  close(): Promise<void>;
}
const { PGlite } = await import(engineModule) as { PGlite: new () => Engine };
const TEST_SECRET = "fixture-only-postgres-cli-encryption-32-bytes";
const OWNER = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 31)).publicKey();
const now = () => Math.floor(Date.now() / 1_000);

async function withPostgres(work: (client: PostgresQueryable, engine: Engine) => Promise<void>) {
  const engine = new PGlite();
  const client: PostgresQueryable = {
    async query<Row extends QueryResultRow = QueryResultRow>(sql: string, values: readonly unknown[] = []) {
      return (await engine.query<Row>(sql, [...values])).rows;
    },
  };
  try { await work(client, engine); } finally { await engine.close(); }
}

test("PostgreSQL create/read/update/secrets execute actual SQL and retain all public RETURNING fields", async () => {
  await withPostgres(async (db, engine) => {
    const store = createCliTestStore(db, TEST_SECRET);
    const session = await store.create(OWNER);
    assert.equal(session.row.state, "prepared");
    assert.equal(session.row.version, 0);
    assert.equal(session.row.owner, OWNER);
    assert.equal(session.row.expiresAt - session.row.createdAt, CLI_TEST_TTL_SECONDS);
    assert.deepEqual(await store.read(session.id, session.token), session.row);
    const secrets = await store.secrets(session.id, session.token);
    const raw = (await engine.query("SELECT * FROM ackrate_cli_test_runs WHERE id=$1", [session.id])).rows[0];
    assert.equal(raw.token_hash, createHash("sha256").update(session.token).digest("hex"));
    for (const role of ["payer", "agent", "merchant"] as const) {
      assert.equal(Keypair.fromSecret(secrets[role]).publicKey(), session.row[role]);
      assert.equal(JSON.stringify(raw).includes(secrets[role]), false);
      assert.equal(JSON.stringify(session.row).includes(secrets[role]), false);
    }
    assert.equal("encrypted_secrets" in session.row, false);
    assert.equal("token_hash" in session.row, false);
    const funding = await store.update(session.id, session.token, 0, {
      state: "funding", logs: "fixture funding prepared", fundingXdr: "fixture-envelope",
      fundingHash: "a".repeat(64), fundingExpiresAt: now() + 300,
    });
    assert.equal(funding.state, "funding");
    assert.equal(funding.version, 1);
    const funded = await store.update(session.id, session.token, 1, { state: "funded", logs: "fixture confirmed" });
    assert.equal(funded.state, "funded");
    assert.equal(funded.version, 2);
    assert.equal(funded.fundingXdr, "fixture-envelope");
    assert.equal(funded.fundingHash, "a".repeat(64));
    const restart = createCliTestStore(db, TEST_SECRET);
    assert.deepEqual(await restart.read(session.id, session.token), funded);
    assert.deepEqual(await restart.secrets(session.id, session.token), secrets);
  });
});

test("PostgreSQL CAS has one winner, and capability/expiry predicates protect every operation", async () => {
  await withPostgres(async (db, engine) => {
    const store = createCliTestStore(db, TEST_SECRET);
    const first = await store.create(OWNER);
    const second = await store.create(OWNER);
    const attempts = await Promise.allSettled([
      store.update(first.id, first.token, 0, { state: "funding", logs: "winner" }),
      store.update(first.id, first.token, 0, { state: "running", logs: "other" }),
    ]);
    assert.equal(attempts.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal((await store.read(first.id, first.token))?.version, 1);
    assert.equal(await store.read(first.id, second.token), null);
    await assert.rejects(store.secrets(first.id, second.token), /unavailable/);
    await assert.rejects(store.update(first.id, second.token, 1, { logs: "unauthorized" }), /rejected/);
    await engine.query("UPDATE ackrate_cli_test_runs SET created_at=created_at-$2, expires_at=expires_at-$2 WHERE id=$1", [first.id, CLI_TEST_TTL_SECONDS + 1]);
    assert.equal(await store.read(first.id, first.token), null);
    await assert.rejects(store.secrets(first.id, first.token), /unavailable/);
    await assert.rejects(store.update(first.id, first.token, 1, { logs: "expired" }), /rejected/);
    assert.equal((await engine.query("SELECT count(*)::int AS count FROM ackrate_cli_test_runs")).rows[0].count, 2);
  });
});

test("PostgreSQL owner reservation CTE enforces three creations and rolls back on failed insertion", async () => {
  await withPostgres(async (db, engine) => {
    const store = createCliTestStore(db, TEST_SECRET);
    await store.create(OWNER);
    await engine.query("ALTER TABLE ackrate_cli_test_runs ADD CONSTRAINT fixture_reject_insert CHECK (false) NOT VALID");
    await assert.rejects(store.create(OWNER), /fixture_reject_insert/);
    assert.equal((await engine.query("SELECT cardinality(created_times) AS count FROM ackrate_cli_test_owners WHERE owner=$1", [OWNER])).rows[0].count, 1);
    await engine.query("ALTER TABLE ackrate_cli_test_runs DROP CONSTRAINT fixture_reject_insert");
    const attempts = await Promise.allSettled(Array.from({ length: 8 }, () => store.create(OWNER)));
    assert.equal(attempts.filter((item) => item.status === "fulfilled").length, 2);
    assert.equal((await engine.query("SELECT count(*)::int AS count FROM ackrate_cli_test_runs")).rows[0].count, 3);
    await engine.query("UPDATE ackrate_cli_test_owners SET created_times=ARRAY[$2::bigint] WHERE owner=$1", [OWNER, now() - 3600]);
    assert.equal((await store.create(OWNER)).row.state, "prepared");
  });
});

test("PostgreSQL JSONB keeps encrypted capability binding and rejects wrong secret or row swap", async () => {
  await withPostgres(async (db, engine) => {
    const store = createCliTestStore(db, TEST_SECRET);
    const first = await store.create(OWNER);
    const second = await store.create(OWNER);
    await assert.rejects(createCliTestStore(db, `${TEST_SECRET}-wrong`).secrets(first.id, first.token), /key recovery failed/);
    await engine.query("UPDATE ackrate_cli_test_runs SET encrypted_secrets=(SELECT encrypted_secrets FROM ackrate_cli_test_runs WHERE id=$2) WHERE id=$1", [first.id, second.id]);
    await assert.rejects(store.secrets(first.id, first.token), /key recovery failed/);
    assert.equal((await store.read(first.id, first.token))?.id, first.id);
  });
});

function burnerFixture(db: PostgresQueryable, options: { uncertain?: boolean; block?: boolean } = {}) {
  const store = createCliTestStore(db, TEST_SECRET);
  const calls = { prepared: 0, validated: 0, submitted: 0, launched: 0 };
  let completion: Promise<unknown> = Promise.resolve();
  const deps: CliBurnerJobDependencies = {
    ready: async () => undefined,
    prepare: async () => {
      calls.prepared++;
      if (options.block) throw new Error("fixture preparation blocked");
      return { preparedXdr: "fixture-original", signedXdr: "fixture-signed", hash: "b".repeat(64), expiresAt: now() + 600 };
    },
    validate: (row, signed) => {
      calls.validated++;
      assert.equal(row.fundingXdr, "fixture-original"); assert.equal(signed, "fixture-signed");
    },
    submit: async (signed) => {
      calls.submitted++; assert.equal(signed, "fixture-signed");
      if (options.uncertain) throw new Error("fixture unknown funding response");
    },
    reconcile: async (row, token) => options.uncertain ? row : store.update(row.id, token, row.version, { state: "funded" }),
    launch: (row, token) => {
      calls.launched++;
      completion = store.update(row.id, token, row.version, { state: "succeeded", logs: "fixture completed", finishedAt: now() });
    },
    sleep: async () => { await completion; },
    now, maxPolls: 12,
  };
  return { store, calls, deps, controller: createCliBurnerJobController(db, store, TEST_SECRET, deps) };
}

test("PostgreSQL durable burner claims one funding and one run across concurrent controllers/restarts", async () => {
  await withPostgres(async (db, engine) => {
    const fixture = burnerFixture(db);
    const second = createCliBurnerJobController(db, fixture.store, TEST_SECRET, fixture.deps);
    assert.equal((await fixture.controller.status()).state, "not-started");
    await Promise.all([fixture.controller.run(), second.run()]);
    await second.run();
    const status = await second.status();
    assert.equal(status.state, "succeeded");
    assert.equal(status.run?.state, "succeeded");
    assert.equal(status.run?.logs, "fixture completed");
    assert.equal(fixture.calls.prepared, 1);
    assert.equal(fixture.calls.submitted, 1);
    assert.equal(fixture.calls.launched, 1);
    assert.equal((await engine.query("SELECT count(*)::int AS count FROM ackrate_cli_test_runs")).rows[0].count, 1);
    const job = (await engine.query("SELECT * FROM ackrate_cli_burner_jobs")).rows[0];
    assert.equal(job.state, "succeeded");
    assert.equal(job.funding_hash, "b".repeat(64));
    assert.equal(JSON.stringify(job).includes("fixture-signed"), false, "signed funding is encrypted");
    assert.equal("sealed" in status, false);
    assert.equal("token" in status, false);
  });
});

test("PostgreSQL uncertain funding survives restart and only reconciles the retained transaction", async () => {
  await withPostgres(async (db) => {
    const options = { uncertain: true };
    const fixture = burnerFixture(db, options);
    await fixture.controller.run();
    assert.equal((await fixture.controller.status()).state, "funding");
    options.uncertain = false;
    const restart = createCliBurnerJobController(db, fixture.store, TEST_SECRET, fixture.deps);
    await restart.run();
    assert.equal((await restart.status()).state, "succeeded");
    assert.equal(fixture.calls.prepared, 1);
    assert.equal(fixture.calls.submitted, 1, "no replacement or repeated funding submission");
    assert.equal(fixture.calls.launched, 1);
  });
});

test("PostgreSQL preparation failure remains blocked without replacement accounts or submission", async () => {
  await withPostgres(async (db, engine) => {
    const fixture = burnerFixture(db, { block: true });
    await fixture.controller.run();
    const restart = createCliBurnerJobController(db, fixture.store, TEST_SECRET, fixture.deps);
    await restart.run();
    assert.equal((await restart.status()).state, "blocked");
    assert.equal(fixture.calls.prepared, 1);
    assert.equal(fixture.calls.submitted, 0);
    assert.equal(fixture.calls.launched, 0);
    assert.equal((await engine.query("SELECT count(*)::int AS count FROM ackrate_cli_test_runs")).rows[0].count, 1);
  });
});

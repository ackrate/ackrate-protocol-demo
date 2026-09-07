import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import test from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import type { QueryResultRow } from "pg";
import { CLI_TEST_TTL_SECONDS, createCliTestStore } from "../lib/cli-test-store";
import { CLI_BURNER_JOB_ID, createCliBurnerJobController, type CliBurnerJobDependencies } from "../lib/cli-test-burner-job";
import { CLI_TEST_BURNER_OWNER } from "../lib/cli-test-burner";
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

function burnerFixture(db: PostgresQueryable, options: { uncertain?: boolean; block?: boolean; preflightFailure?: boolean } = {}) {
  const store = createCliTestStore(db, TEST_SECRET);
  const calls = { prepared: 0, validated: 0, submitted: 0, launched: 0 };
  const envelopes: string[] = [];
  const launchAttempts: Array<string | undefined> = [];
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
      assert.equal(row.fundingHash, "b".repeat(64));
      assert.ok(row.fundingExpiresAt! > deps.now(), "fixture funding is not expired");
    },
    submit: async (signed) => {
      calls.submitted++; assert.equal(signed, "fixture-signed");
      envelopes.push(signed);
      if (options.uncertain) throw new Error("fixture unknown funding response");
    },
    reconcile: async (row, token) => options.uncertain ? row : store.update(row.id, token, row.version, { state: "funded" }),
    launch: (row, token, attempt) => {
      calls.launched++;
      launchAttempts.push(attempt);
      completion = store.update(row.id, token, row.version, options.preflightFailure ? {
        state: "failed", logs: `${row.logs}\nCLI test signer refuses transaction source, signatures, operations, fee, or time bounds\n`,
        error: "fixture local signer refusal", finishedAt: now() - 700,
      } : { state: "succeeded", logs: attempt ? `${row.logs}\nfixture completed` : "fixture completed", finishedAt: now() });
    },
    sleep: async () => { await completion; },
    now, maxPolls: 12,
  };
  return { store, calls, envelopes, launchAttempts, deps, controller: createCliBurnerJobController(db, store, TEST_SECRET, deps) };
}

// Decode only this test's in-memory fixture capability, using its fixed fixture
// key, to simulate a legacy deployed record or an interrupted attempt claim.
async function fixtureCapability(engine: Engine, replace?: (value: Record<string, unknown>) => void) {
  const job = (await engine.query("SELECT sealed FROM ackrate_cli_burner_jobs WHERE job_id=$1", [CLI_BURNER_JOB_ID])).rows[0];
  const purpose = "ackrate/cli-burner-job/capability-and-funding/v1";
  const key = Buffer.from(hkdfSync("sha256", TEST_SECRET, "ackrate-cli-burner-job-hkdf-v1", purpose, 32));
  const aad = Buffer.from(JSON.stringify([purpose, CLI_BURNER_JOB_ID, CLI_TEST_BURNER_OWNER]));
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(job.sealed.iv, "base64url"));
  decipher.setAAD(aad); decipher.setAuthTag(Buffer.from(job.sealed.tag, "base64url"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(job.sealed.ciphertext, "base64url")), decipher.final()]);
  const capability = JSON.parse(plaintext.toString("utf8")) as Record<string, unknown>;
  plaintext.fill(0);
  if (replace) {
    replace(capability);
    const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, iv); cipher.setAAD(aad);
    const bytes = Buffer.from(JSON.stringify(capability));
    const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]); bytes.fill(0);
    const sealed = { v: 1, iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"), ciphertext: ciphertext.toString("base64url") };
    await engine.query("UPDATE ackrate_cli_burner_jobs SET sealed=$2::jsonb WHERE job_id=$1", [CLI_BURNER_JOB_ID, JSON.stringify(sealed)]);
  }
  key.fill(0);
  return capability;
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

test("PostgreSQL uncertain funding caps exact-envelope submissions at three and later confirms without replacement", async () => {
  await withPostgres(async (db, engine) => {
    const options = { uncertain: true };
    const fixture = burnerFixture(db, options);
    await fixture.controller.run();
    assert.equal((await fixture.controller.status()).state, "funding");
    assert.equal(fixture.calls.submitted, 3);
    assert.equal((await fixtureCapability(engine)).submitAttempts, 3);
    await fixture.controller.run();
    assert.equal(fixture.calls.submitted, 3, "restart does not reset the durable attempt count");
    options.uncertain = false;
    const restart = createCliBurnerJobController(db, fixture.store, TEST_SECRET, fixture.deps);
    await restart.run();
    assert.equal((await restart.status()).state, "succeeded");
    assert.equal(fixture.calls.prepared, 1);
    assert.equal(fixture.calls.submitted, 3, "later confirmation does not submit again");
    assert.equal(fixture.calls.launched, 1);
    assert.deepEqual(fixture.envelopes, Array(3).fill("fixture-signed"));
    assert.equal((await engine.query("SELECT count(*)::int AS count FROM ackrate_cli_test_runs")).rows[0].count, 1);
  });
});

test("PostgreSQL legacy capability counts its original submission and concurrent replicas share the retry cap", async () => {
  await withPostgres(async (db, engine) => {
    const options = { uncertain: true };
    const fixture = burnerFixture(db, options); fixture.deps.maxPolls = 1;
    await fixture.controller.run();
    assert.equal(fixture.calls.submitted, 1);
    const original = await fixtureCapability(engine, (capability) => { delete capability.submitAttempts; });
    const originalRun = (await fixture.controller.status()).run!;
    fixture.deps.maxPolls = 12;
    await Promise.all(Array.from({ length: 12 }, () => createCliBurnerJobController(db, fixture.store, TEST_SECRET, fixture.deps).run()));
    await Promise.all(Array.from({ length: 12 }, () => createCliBurnerJobController(db, fixture.store, TEST_SECRET, fixture.deps).run()));
    const retained = await fixtureCapability(engine);
    assert.equal(retained.submitAttempts, 3);
    for (const key of ["sessionId", "token", "signedFundingXdr"]) assert.equal(retained[key], original[key]);
    assert.equal(fixture.calls.prepared, 1);
    assert.equal(fixture.calls.submitted, 3, "legacy original plus at most two exact-envelope retries");
    assert.equal(fixture.calls.launched, 0);
    assert.deepEqual(fixture.envelopes, Array(3).fill("fixture-signed"));
    const pending = (await fixture.controller.status()).run!;
    for (const key of ["id", "owner", "payer", "agent", "merchant", "fundingHash"] as const) assert.equal(pending[key], originalRun[key]);
    options.uncertain = false;
    await Promise.all(Array.from({ length: 4 }, () => createCliBurnerJobController(db, fixture.store, TEST_SECRET, fixture.deps).run()));
    await fixture.controller.run();
    assert.equal((await fixture.controller.status()).state, "succeeded");
    assert.equal(fixture.calls.launched, 1);
    assert.equal(fixture.calls.submitted, 3);
    assert.equal((await engine.query("SELECT count(*)::int AS count FROM ackrate_cli_test_runs")).rows[0].count, 1);
  });
});

test("PostgreSQL retry claim committed before interruption consumes its attempt without duplicate POST", async () => {
  await withPostgres(async (db, engine) => {
    const fixture = burnerFixture(db, { uncertain: true }); fixture.deps.maxPolls = 1;
    await fixture.controller.run(); fixture.deps.maxPolls = 12;
    let interrupted = false;
    const interruptedDb: PostgresQueryable = {
      async query<Row extends QueryResultRow = QueryResultRow>(sql: string, values: readonly unknown[] = []) {
        const rows = await db.query<Row>(sql, values);
        if (!interrupted && sql.includes("UPDATE ackrate_cli_burner_jobs") && values[3] === "funding" && values[9] === "funding" && rows.length) {
          interrupted = true; throw new Error("fixture process interruption after committed retry claim");
        }
        return rows;
      },
    };
    await createCliBurnerJobController(interruptedDb, fixture.store, TEST_SECRET, fixture.deps).run();
    assert.equal(interrupted, true);
    assert.equal((await fixtureCapability(engine)).submitAttempts, 2);
    assert.equal(fixture.calls.submitted, 1);
    await fixture.controller.run(); await fixture.controller.run();
    assert.equal((await fixtureCapability(engine)).submitAttempts, 3);
    assert.equal(fixture.calls.submitted, 2, "interrupted claim is not retried as the same attempt");
    assert.deepEqual(fixture.envelopes, Array(2).fill("fixture-signed"));
    assert.equal(fixture.calls.prepared, 1); assert.equal(fixture.calls.launched, 0);
  });
});

test("PostgreSQL expired or invalid retained capabilities cannot authorize another funding submission", async () => {
  for (const mode of ["expired", "counter", "ciphertext"]) {
    await withPostgres(async (db, engine) => {
      const fixture = burnerFixture(db, { uncertain: true }); fixture.deps.maxPolls = 1;
      await fixture.controller.run(); fixture.deps.maxPolls = 12;
      if (mode === "expired") fixture.deps.now = () => now() + 601;
      if (mode === "counter") await fixtureCapability(engine, (capability) => { capability.submitAttempts = 0; });
      if (mode === "ciphertext") await engine.query("UPDATE ackrate_cli_burner_jobs SET sealed='{}'::jsonb");
      await fixture.controller.run();
      assert.equal(fixture.calls.submitted, 1, mode);
      assert.equal(fixture.calls.prepared, 1, mode);
      assert.equal(fixture.calls.launched, 0, mode);
      assert.equal((await engine.query("SELECT count(*)::int AS count FROM ackrate_cli_test_runs")).rows[0].count, 1);
    });
  }
});

test("PostgreSQL retry diagnostics retain only public codes, never the signed envelope or capability", async () => {
  await withPostgres(async (db, engine) => {
    const fixture = burnerFixture(db, { uncertain: true }); fixture.deps.maxPolls = 1;
    fixture.deps.submit = async () => ({ httpStatus: 400, transactionCode: "tx_too_early", operationCodes: ["op_success", "fixture private diagnostic text"] });
    await fixture.controller.run();
    const capability = await fixtureCapability(engine);
    const status = await fixture.controller.status();
    assert.match(status.run!.logs, /Funding submission 1\/3.*HTTP 400; tx_too_early; op_success/);
    for (const forbidden of ["fixture private diagnostic text", "fixture-signed", String(capability.token)]) assert.equal(JSON.stringify(status).includes(forbidden), false);
    const before = (await engine.query("SELECT version FROM ackrate_cli_burner_jobs")).rows[0].version;
    await fixture.controller.status(false);
    assert.equal((await engine.query("SELECT version FROM ackrate_cli_burner_jobs")).rows[0].version, before, "status remains read-only");
  });
});

test("PostgreSQL delayed submission diagnostics cannot strand an already claimed CLI launch", async () => {
  await withPostgres(async (db) => {
    const fixture = burnerFixture(db); fixture.deps.maxPolls = 1;
    let releaseSubmission!: () => void;
    let submissionStarted!: () => void;
    const started = new Promise<void>((resolve) => { submissionStarted = resolve; });
    const delayedSubmission = new Promise<void>((resolve) => { releaseSubmission = resolve; });
    fixture.deps.submit = async () => { submissionStarted(); await delayedSubmission; };
    const originalWorker = fixture.controller.run();
    await started;
    let interleaved = false;
    const competingDb: PostgresQueryable = {
      async query<Row extends QueryResultRow = QueryResultRow>(sql: string, values: readonly unknown[] = []) {
        const rows = await db.query<Row>(sql, values);
        if (!interleaved && sql.includes("UPDATE ackrate_cli_burner_jobs") && values[3] === "running" && rows.length) {
          // The competing worker has the durable launch claim and a previously
          // read funded session. Let the original POST's diagnostic save finish
          // before the competing worker can update that session or launch.
          interleaved = true; releaseSubmission(); await originalWorker;
        }
        return rows;
      },
    };
    fixture.deps.maxPolls = 12;
    const competingWorker = createCliBurnerJobController(competingDb, fixture.store, TEST_SECRET, fixture.deps);
    await competingWorker.run();
    assert.equal(interleaved, true);
    assert.equal((await competingWorker.status()).state, "succeeded");
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

function unstartedFixtureProof(row: Parameters<NonNullable<CliBurnerJobDependencies["proveUnstarted"]>>[0], observedAt = now()) {
  return { kind: "funded-unstarted" as const, runId: row.id, fundingHash: row.fundingHash!,
    owner: row.owner, payer: row.payer, agent: row.agent, merchant: row.merchant, finishedAt: row.finishedAt!,
    fundingLedger: 100, initialActorSequence: (100n << 32n).toString(),
    horizonLedger: 200, horizonClosedAt: observedAt - 5, rpcLedger: 200, observedAt };
}

test("PostgreSQL proven pre-registration failure permits only one same-funded recovery across replicas", async () => {
  await withPostgres(async (db, engine) => {
    const options = { preflightFailure: true };
    const fixture = burnerFixture(db, options); fixture.deps.now = () => now() - 1_000;
    await fixture.controller.run();
    assert.equal((await fixture.controller.status()).state, "failed");
    const original = (await fixture.controller.status()).run!;
    const originalCapability = await fixtureCapability(engine);
    options.preflightFailure = false; fixture.deps.now = now;
    fixture.deps.proveUnstarted = async (row) => unstartedFixtureProof(row);
    await Promise.all(Array.from({ length: 12 }, () => createCliBurnerJobController(db, fixture.store, TEST_SECRET, fixture.deps).run()));
    await fixture.controller.run();
    const status = await fixture.controller.status();
    const capability = await fixtureCapability(engine);
    assert.equal(status.state, "succeeded");
    assert.equal(fixture.calls.prepared, 1); assert.equal(fixture.calls.submitted, 1);
    assert.equal(fixture.calls.launched, 2, "one original failed process plus exactly one recovery");
    assert.deepEqual(fixture.launchAttempts, [undefined, "preflight-repair-1"]);
    for (const key of ["id", "owner", "payer", "agent", "merchant", "fundingHash"] as const) assert.equal(status.run![key], original[key]);
    for (const key of ["sessionId", "token", "signedFundingXdr"]) assert.equal(capability[key], originalCapability[key]);
    const repair = capability.preflightRepair as { version: number; prior: { logs: string; error: string; finishedAt: number } };
    assert.equal(repair.version, 1); assert.equal(repair.prior.logs, original.logs);
    assert.equal(repair.prior.error, original.error); assert.equal(repair.prior.finishedAt, original.finishedAt);
    assert.ok(status.run!.logs.startsWith(original.logs), "old local failure output is retained");
    assert.equal((await engine.query("SELECT count(*)::int AS count FROM ackrate_cli_test_runs")).rows[0].count, 1);
  });
});

test("PostgreSQL preflight proof mismatches and stale/too-early evidence never claim recovery", async () => {
  await withPostgres(async (db, engine) => {
    // Freeze both the verifier clock and proof timestamps. A one-second future
    // proof must stay future even if another test or build delays this loop.
    const observedAt = now();
    const fixture = burnerFixture(db, { preflightFailure: true }); fixture.deps.now = () => observedAt - 1_000;
    await fixture.controller.run(); fixture.deps.now = () => observedAt; fixture.deps.maxPolls = 1;
    const failed = (await fixture.controller.status()).run!;
    const patches = [
      { fundingHash: "f".repeat(64) }, { runId: "different-run" }, { owner: OWNER }, { payer: OWNER },
      { agent: OWNER }, { merchant: OWNER }, { initialActorSequence: "1" }, { rpcLedger: 99 },
      { observedAt: observedAt - 121 }, { observedAt: observedAt + 1 }, { horizonClosedAt: observedAt - 200 },
      { horizonClosedAt: failed.finishedAt! + 600 }, { fundingLedger: 201 },
    ];
    for (const patch of patches) {
      fixture.deps.proveUnstarted = async (row) => ({ ...unstartedFixtureProof(row, observedAt), ...patch });
      await createCliBurnerJobController(db, fixture.store, TEST_SECRET, fixture.deps).run();
      assert.equal((await fixture.controller.status()).state, "failed", JSON.stringify(patch));
    }
    fixture.deps.proveUnstarted = async () => { throw new Error("fixture RPC unavailable"); };
    await fixture.controller.run();
    assert.equal((await fixtureCapability(engine)).preflightRepair, undefined);
    assert.equal(fixture.calls.launched, 1); assert.equal(fixture.calls.submitted, 1);
  });
});

test("PostgreSQL a second pre-registration failure cannot consume another recovery or funding", async () => {
  await withPostgres(async (db, engine) => {
    const fixture = burnerFixture(db, { preflightFailure: true }); fixture.deps.now = () => now() - 1_000;
    await fixture.controller.run(); fixture.deps.now = now;
    fixture.deps.proveUnstarted = async (row) => unstartedFixtureProof(row);
    await fixture.controller.run(); await fixture.controller.run();
    await Promise.all(Array.from({ length: 4 }, () => createCliBurnerJobController(db, fixture.store, TEST_SECRET, fixture.deps).run()));
    assert.equal((await fixture.controller.status()).state, "failed");
    assert.equal(fixture.calls.launched, 2); assert.equal(fixture.calls.prepared, 1); assert.equal(fixture.calls.submitted, 1);
    assert.equal((await fixtureCapability(engine)).preflightRepair !== undefined, true);
  });
});

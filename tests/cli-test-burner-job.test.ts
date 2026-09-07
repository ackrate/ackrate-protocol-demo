import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResultRow } from "pg";
import { StrKey } from "@stellar/stellar-sdk";
import { CLI_TEST_BURNER_OWNER } from "../lib/cli-test-burner";
import { CLI_BURNER_JOB_ID, createCliBurnerJobController, type CliBurnerJobDependencies } from "../lib/cli-test-burner-job";
import type { CliTestRow, CliTestStore } from "../lib/cli-test-store";
import type { PostgresQueryable } from "../lib/wallet/postgres";

const SECRET = "synthetic-burner-job-encryption-secret-32";
const SESSION_ID = "12345678-1234-4234-8234-123456789abc";
const TOKEN = Buffer.alloc(32, 7).toString("base64url");
const HASH = "a".repeat(64);
const NOW = 1_900_000_000;

/** Atomic SQL statement model. It neither connects to PostgreSQL nor moves funds. */
class FakeDatabase implements PostgresQueryable {
  job: QueryResultRow | null = null;
  throwAfterState: string | null = null;
  beforeTransition?: (nextState: unknown) => Promise<void>;
  calls: { text: string; values: readonly unknown[] }[] = [];
  async query<Row extends QueryResultRow = QueryResultRow>(text: string, values: readonly unknown[] = []): Promise<ReadonlyArray<Row>> {
    const sql = text.replace(/\s+/g, " ").trim();
    this.calls.push({ text: sql, values: structuredClone(values) });
    if (sql.startsWith("CREATE TABLE")) return [];
    if (sql.startsWith("INSERT")) {
      assert.match(sql, /ON CONFLICT \(job_id\) DO NOTHING/);
      if (this.job) return [];
      this.job = { job_id: values[0], owner: values[1], version: 0, state: "initializing", session_id: null, sealed: null, funding_hash: null, created_at: values[2], updated_at: values[2], error: null };
      return [structuredClone(this.job)] as Row[];
    }
    if (sql.startsWith("SELECT")) return (this.job ? [structuredClone(this.job)] : []) as Row[];
    if (sql.startsWith("UPDATE")) {
      assert.match(sql, /WHERE job_id = \$1 AND owner = \$2 AND version = \$3 AND state = \$10/);
      await this.beforeTransition?.(values[3]);
      if (!this.job || this.job.job_id !== values[0] || this.job.owner !== values[1] || this.job.version !== values[2] || this.job.state !== values[9]) return [];
      this.job = { ...this.job, version: this.job.version + 1, state: values[3],
        session_id: values[4] ?? this.job.session_id, sealed: values[5] ? JSON.parse(String(values[5])) : this.job.sealed,
        funding_hash: values[6] ?? this.job.funding_hash, updated_at: values[7], error: values[8] ?? this.job.error };
      if (this.throwAfterState === values[3]) { this.throwAfterState = null; throw new Error("synthetic interruption after durable transition"); }
      return [structuredClone(this.job)] as Row[];
    }
    throw new Error("unexpected synthetic SQL");
  }
}

function fixture() {
  const db = new FakeDatabase();
  const events: string[] = [];
  let row: CliTestRow | null = null;
  let mode: "success" | "ambiguous" | "funding-failed" | "running" = "success";
  let creates = 0; let submits = 0; let launches = 0;
  let crashFundingUpdate = false; let crashRunningUpdate = false;
  const store = {
    async create(owner: string) {
      assert.equal(db.job?.state, "initializing", "global durable claim precedes session creation");
      creates++; events.push("create");
      row = { id: SESSION_ID, owner, version: 0, state: "prepared", logs: "", createdAt: NOW, updatedAt: NOW, expiresAt: NOW + 86400,
        payer: StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 2)), agent: StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 3)), merchant: StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 4)) };
      return { id: SESSION_ID, token: TOKEN, row: structuredClone(row) };
    },
    async read(id: string, token: string) { return id === SESSION_ID && token === TOKEN && row ? structuredClone(row) : null; },
    async update(id: string, token: string, version: number, patch: Partial<CliTestRow>) {
      assert.equal(id, SESSION_ID); assert.equal(token, TOKEN);
      if (!row || row.version !== version) throw new Error("synthetic session CAS conflict");
      if ((patch.state === "funding" && crashFundingUpdate) || (patch.state === "running" && crashRunningUpdate)) throw new Error("synthetic crash after durable job claim");
      row = { ...row, ...patch, version: row.version + 1 }; events.push(`session:${patch.state ?? "metadata"}`); return structuredClone(row);
    },
    async secrets() { throw new Error("synthetic job tests must not retrieve or generate private keys"); },
  } as CliTestStore;
  const deps: CliBurnerJobDependencies = {
    async ready() { events.push("ready"); },
    async prepare() { return { preparedXdr: "synthetic-prepared-envelope", signedXdr: "synthetic-owner-signed-envelope", hash: HASH, expiresAt: NOW + 600 }; },
    validate(candidate, signed) { assert.equal(candidate.owner, CLI_TEST_BURNER_OWNER); assert.equal(candidate.fundingHash, HASH); assert.equal(signed, "synthetic-owner-signed-envelope"); },
    async submit(signed) {
      assert.equal(signed, "synthetic-owner-signed-envelope"); assert.equal(db.job?.state, "funding"); assert.equal(row?.state, "funding");
      assert.equal(db.job?.funding_hash, HASH); assert.ok(db.job?.sealed);
      submits++; events.push("submit"); if (mode === "ambiguous") throw new Error("synthetic lost response");
    },
    async reconcile(candidate, token) {
      assert.equal(candidate.fundingHash, HASH); events.push("reconcile");
      if (mode === "ambiguous") return candidate;
      return store.update(candidate.id, token, candidate.version, { state: mode === "funding-failed" ? "failed" : "funded" });
    },
    launch(candidate, token) {
      assert.equal(db.job?.state, "running"); assert.equal(candidate.state, "running"); assert.equal(token, TOKEN);
      launches++; events.push("launch");
      if (mode !== "running") row = { ...candidate, state: "succeeded", version: candidate.version + 1, logs: "synthetic delivered result", finishedAt: NOW + 10 };
    },
    async sleep() {}, now: () => NOW, maxPolls: 12,
  };
  return { db, deps, store, events, controller: () => createCliBurnerJobController(db, store, SECRET, deps),
    counters: () => ({ creates, submits, launches }), setMode: (value: typeof mode) => { mode = value; },
    crashFunding: () => { crashFundingUpdate = true; }, crashRunning: () => { crashRunningUpdate = true; } };
}

test("one-off job persists its claim and encrypted exact funding before a single submission and launch", async () => {
  const f = fixture(); await f.controller().run();
  assert.deepEqual(f.counters(), { creates: 1, submits: 1, launches: 1 });
  assert.equal(f.db.job?.job_id, CLI_BURNER_JOB_ID); assert.equal(f.db.job?.state, "succeeded");
  assert.ok(f.events.indexOf("session:funding") < f.events.indexOf("submit"));
  assert.ok(f.events.indexOf("session:running") < f.events.indexOf("launch"));
  for (const protectedValue of [TOKEN, "synthetic-owner-signed-envelope"]) assert.ok(!JSON.stringify(f.db.job).includes(protectedValue));
  const status = await f.controller().status();
  assert.equal(status.state, "succeeded"); assert.equal(status.run?.fundingHash, HASH);
  for (const forbidden of [TOKEN, "synthetic-owner-signed-envelope", "synthetic-prepared-envelope", "fundingXdr", "sealed", "capability"]) assert.ok(!JSON.stringify(status).includes(forbidden));
});

test("concurrent replicas and later deployments cannot duplicate a funded one-off run", async () => {
  const f = fixture(); await Promise.all(Array.from({ length: 12 }, () => f.controller().run()));
  await Promise.all(Array.from({ length: 6 }, () => f.controller().run()));
  assert.deepEqual(f.counters(), { creates: 1, submits: 1, launches: 1 });
  assert.equal(f.db.job?.state, "succeeded");
});

for (const [heldState, nextState] of [["prepared", "funding"], ["funded", "running"]] as const) {
  test(`replicas racing the same ${heldState} version have one ${nextState} effect winner`, async () => {
    const f = fixture(); f.db.throwAfterState = heldState; await f.controller().run();
    assert.equal(f.db.job?.state, heldState);
    let arrivals = 0; let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    f.db.beforeTransition = async (state) => {
      if (state !== nextState) return;
      arrivals++;
      if (arrivals === 2) { f.db.beforeTransition = undefined; release(); }
      await barrier;
    };
    await Promise.all([f.controller().run(), f.controller().run()]);
    assert.equal(arrivals, 2);
    assert.deepEqual(f.counters(), { creates: 1, submits: 1, launches: 1 });
    assert.equal(f.db.job?.state, "succeeded");
  });
}

test("ambiguous funding is reconciled by exact hash on restart, never submitted again", async () => {
  const f = fixture(); f.setMode("ambiguous"); await f.controller().run();
  assert.equal(f.db.job?.state, "funding"); assert.deepEqual(f.counters(), { creates: 1, submits: 1, launches: 0 });
  await f.controller().run(); assert.deepEqual(f.counters(), { creates: 1, submits: 1, launches: 0 });
  f.setMode("success"); await f.controller().run();
  assert.deepEqual(f.counters(), { creates: 1, submits: 1, launches: 1 }); assert.equal(f.db.job?.state, "succeeded");
});

test("interruption between funding claim and submission cannot cause a deployment to submit later", async () => {
  const f = fixture(); f.crashFunding(); await f.controller().run();
  assert.equal(f.db.job?.state, "funding");
  await f.controller().run(); assert.deepEqual(f.counters(), { creates: 1, submits: 0, launches: 0 });
});

test("interruption between run claim and launch leaves a closed claim without a restart launch", async () => {
  const f = fixture(); f.crashRunning(); await f.controller().run();
  assert.equal(f.db.job?.state, "running");
  await f.controller().run(); assert.deepEqual(f.counters(), { creates: 1, submits: 1, launches: 0 });
});

test("an already-running job is observed but never relaunched on restart", async () => {
  const f = fixture(); f.setMode("running"); await f.controller().run(); await f.controller().run();
  assert.equal(f.db.job?.state, "running"); assert.deepEqual(f.counters(), { creates: 1, submits: 1, launches: 1 });
});

test("failed funding and unknown initialization remain permanently closed to a replacement", async () => {
  const failed = fixture(); failed.setMode("funding-failed"); await failed.controller().run(); await failed.controller().run();
  assert.equal(failed.db.job?.state, "failed"); assert.deepEqual(failed.counters(), { creates: 1, submits: 1, launches: 0 });
  const interrupted = fixture();
  interrupted.db.job = { job_id: CLI_BURNER_JOB_ID, owner: CLI_TEST_BURNER_OWNER, version: 0, state: "initializing", session_id: null, sealed: null, funding_hash: null, created_at: NOW, updated_at: NOW, error: null };
  await interrupted.controller().run(); assert.deepEqual(interrupted.counters(), { creates: 0, submits: 0, launches: 0 });
});

test("read-only status does not claim a job or retrieve secrets, and malformed ciphertext cannot authorize action", async () => {
  const f = fixture(); const initial = await f.controller().status();
  assert.equal(initial.state, "not-started"); assert.deepEqual(f.counters(), { creates: 0, submits: 0, launches: 0 });
  assert.ok(f.db.calls.every((call) => call.text.startsWith("SELECT")));
  f.setMode("ambiguous"); await f.controller().run();
  f.db.job!.sealed = { v: 1, iv: "broken", tag: "broken", ciphertext: "broken" };
  await f.controller().run();
  assert.deepEqual(f.counters(), { creates: 1, submits: 1, launches: 0 });
  const status = await f.controller().status(); assert.equal(status.run, undefined); assert.match(status.error!, /manual recovery/);
});

test("preparation errors never expose raw signer material or create a second session", async () => {
  const f = fixture(); f.deps.prepare = async () => { throw new Error("synthetic-sensitive-error-must-not-leak"); };
  await f.controller().run(); await f.controller().run();
  assert.equal(f.db.job?.state, "blocked"); assert.deepEqual(f.counters(), { creates: 1, submits: 0, launches: 0 });
  assert.ok(!JSON.stringify(await f.controller().status()).includes("synthetic-sensitive-error-must-not-leak"));
});

test("invalid read-only readiness does not claim a permanent job and can be corrected", async () => {
  const f = fixture(); const controller = f.controller();
  f.deps.ready = async () => { throw new Error("synthetic-mnemonic-error-must-not-leak"); };
  await controller.run();
  assert.equal(f.db.job, null); assert.deepEqual(f.counters(), { creates: 0, submits: 0, launches: 0 });
  const status = await controller.status();
  assert.equal(status.state, "configuration-error"); assert.ok(!JSON.stringify(status).includes("synthetic-mnemonic"));
  assert.ok(!f.db.calls.some((call) => call.text.startsWith("INSERT")));
  f.deps.ready = async () => {};
  await controller.run(); assert.deepEqual(f.counters(), { creates: 1, submits: 1, launches: 1 });
});

test("removing the mnemonic hides no retained evidence and cannot trigger work through status", async () => {
  const f = fixture(); const absent = await f.controller().status(false);
  assert.equal(absent.configured, false); assert.equal(absent.state, "not-configured");
  await f.controller().run();
  f.deps.ready = async () => { throw new Error("seed is no longer configured"); };
  const before = f.counters(); const status = await f.controller().status(false);
  assert.equal(status.configured, true); assert.equal(status.state, "succeeded"); assert.equal(status.run?.fundingHash, HASH);
  assert.deepEqual(f.counters(), before);
});

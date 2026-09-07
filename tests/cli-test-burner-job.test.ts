import assert from "node:assert/strict";
import test from "node:test";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import type { QueryResultRow } from "pg";
import { Account, Keypair, StrKey } from "@stellar/stellar-sdk";
import { CLI_TEST_BURNER_OWNER } from "../lib/cli-test-burner";
import { CLI_BURNER_JOB_ID, CLI_REGISTERED_SETUP_HASH, createCliBurnerJobController, readCliBurnerSubmission, startCliBurnerJob, verifyCliBurnerRenewal, verifyCliPreflightRepairProof, verifyCliRegisteredSetupProof, type CliBurnerJobDependencies } from "../lib/cli-test-burner-job";
import { buildCliFunding } from "../lib/cli-test-transactions";
import type { CliFundingExpiryProof } from "../lib/cli-test-funding-expiry";
import type { CliUnstartedProof, CliRegisteredSetupProof } from "../lib/cli-test-unstarted-proof";
import type { CliTestRow, CliTestStore } from "../lib/cli-test-store";
import type { PostgresQueryable } from "../lib/wallet/postgres";

const SECRET = "synthetic-burner-job-encryption-secret-32";
const SESSION_ID = "12345678-1234-4234-8234-123456789abc";
const TOKEN = Buffer.alloc(32, 7).toString("base64url");
const HASH = "a".repeat(64);
const RENEWED_HASH = "b".repeat(64);
const NOW = 1_900_000_000;
const PURPOSE = "ackrate/cli-burner-job/capability-and-funding/v1";
const TEST_KEY = Buffer.from(hkdfSync("sha256", SECRET, "ackrate-cli-burner-job-hkdf-v1", PURPOSE, 32));
const TEST_AAD = Buffer.from(JSON.stringify([PURPOSE, CLI_BURNER_JOB_ID, CLI_TEST_BURNER_OWNER]));
function decodedCapability(db: FakeDatabase): Record<string, unknown> {
  const sealed = db.job!.sealed;
  const decipher = createDecipheriv("aes-256-gcm", TEST_KEY, Buffer.from(sealed.iv, "base64url"));
  decipher.setAAD(TEST_AAD); decipher.setAuthTag(Buffer.from(sealed.tag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, "base64url")), decipher.final()]).toString());
}
function replaceSyntheticCapability(db: FakeDatabase, value: Record<string, unknown>): void {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", TEST_KEY, iv); cipher.setAAD(TEST_AAD);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  db.job!.sealed = { v: 1, iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"), ciphertext: ciphertext.toString("base64url") };
}

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
    validate(candidate, signed) { assert.equal(candidate.owner, CLI_TEST_BURNER_OWNER); assert.ok([HASH, RENEWED_HASH].includes(candidate.fundingHash!)); assert.equal(signed, candidate.fundingHash === HASH ? "synthetic-owner-signed-envelope" : "synthetic-owner-signed-renewal"); assert.ok(candidate.fundingExpiresAt! > deps.now()); },
    async submit(signed) {
      assert.equal(signed, row?.fundingHash === HASH ? "synthetic-owner-signed-envelope" : "synthetic-owner-signed-renewal"); assert.equal(db.job?.state, "funding"); assert.equal(row?.state, "funding");
      assert.equal(db.job?.funding_hash, row?.fundingHash); assert.ok(db.job?.sealed);
      submits++; events.push("submit"); if (mode === "ambiguous") throw new Error("synthetic lost response");
    },
    async reconcile(candidate, token) {
      assert.ok([HASH, RENEWED_HASH].includes(candidate.fundingHash!)); events.push("reconcile");
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

test("ambiguous funding retries only one retained signed hash up to three posts across restarts", async () => {
  const f = fixture(); f.setMode("ambiguous"); await f.controller().run();
  assert.equal(f.db.job?.state, "funding"); assert.deepEqual(f.counters(), { creates: 1, submits: 3, launches: 0 });
  await f.controller().run(); assert.deepEqual(f.counters(), { creates: 1, submits: 3, launches: 0 });
  f.setMode("success"); await f.controller().run();
  assert.deepEqual(f.counters(), { creates: 1, submits: 3, launches: 1 }); assert.equal(f.db.job?.state, "succeeded");
  assert.equal(decodedCapability(f.db).submitAttempts, 3);
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
  assert.deepEqual(f.counters(), { creates: 1, submits: 3, launches: 0 });
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

for (const heldState of ["prepared", "funded"] as const) {
  test(`retained ${heldState} jobs require valid startup readiness before any resumed effect`, async () => {
    const f = fixture(); f.db.throwAfterState = heldState; await f.controller().run();
    assert.equal(f.db.job?.state, heldState);
    const retainedJob = structuredClone(f.db.job);
    const retainedSession = await f.store.read(SESSION_ID, TOKEN);
    const before = f.counters();
    const callsBefore = f.db.calls.length;
    f.deps.ready = async () => { throw new Error("synthetic invalid build or mnemonic"); };
    await f.controller().run();
    assert.deepEqual(f.counters(), before);
    assert.deepEqual(f.db.job, retainedJob);
    assert.deepEqual(await f.store.read(SESSION_ID, TOKEN), retainedSession);
    assert.ok(!f.db.calls.slice(callsBefore).some((call) => /^(INSERT|UPDATE)/.test(call.text)));

    f.deps.ready = async () => {};
    f.deps.prepare = async () => { throw new Error("retained funding must never be prepared again"); };
    await f.controller().run();
    assert.deepEqual(f.counters(), { creates: 1, submits: 1, launches: 1 });
    assert.equal(f.db.job?.state, "succeeded");
    assert.equal(f.db.job?.funding_hash, HASH);
    assert.equal(decodedCapability(f.db).signedFundingXdr, "synthetic-owner-signed-envelope", "recovery keeps the exact original signed funding envelope");
    assert.equal(decodedCapability(f.db).token, TOKEN);
    await f.controller().run();
    assert.deepEqual(f.counters(), { creates: 1, submits: 1, launches: 1 });
  });
}

test("development, production build, and disabled startup return before reading sensitive configuration", () => {
  const cases: { values: Record<string, string | undefined>; expectedReads: string[] }[] = [
    { values: { NODE_ENV: "development" }, expectedReads: ["NODE_ENV"] },
    { values: { NODE_ENV: "production", NEXT_PHASE: "phase-production-build" }, expectedReads: ["NODE_ENV", "NEXT_PHASE"] },
    { values: { NODE_ENV: "production", NEXT_PHASE: undefined, ACKRATE_CLI_RUNTIME_START: "0" }, expectedReads: ["NODE_ENV", "NEXT_PHASE", "ACKRATE_CLI_RUNTIME_START"] },
  ];
  for (const { values, expectedReads } of cases) {
    const descriptor = Object.getOwnPropertyDescriptor(process, "env")!;
    const reads: string[] = [];
    const env = new Proxy({}, {
      get(_target, property) {
        reads.push(String(property));
        if (!Object.hasOwn(values, property)) throw new Error("startup read sensitive configuration before its runtime guard");
        return values[String(property)];
      },
    });
    let error: unknown;
    try {
      Object.defineProperty(process, "env", { ...descriptor, value: env });
      startCliBurnerJob();
    } catch (caught) { error = caught; }
    finally { Object.defineProperty(process, "env", descriptor); }
    assert.equal(error, undefined);
    assert.deepEqual(reads, expectedReads);
  }
});

test("legacy pending capability counts the original attempt and concurrent replicas cannot exceed three posts", async () => {
  const f = fixture(); f.setMode("ambiguous"); f.deps.maxPolls = 1; await f.controller().run();
  assert.equal(f.counters().submits, 1);
  const legacy = decodedCapability(f.db); delete legacy.submitAttempts; replaceSyntheticCapability(f.db, legacy);
  f.deps.maxPolls = 12;
  await Promise.all(Array.from({ length: 12 }, () => f.controller().run()));
  await Promise.all(Array.from({ length: 12 }, () => f.controller().run()));
  assert.deepEqual(f.counters(), { creates: 1, submits: 3, launches: 0 });
  assert.equal(decodedCapability(f.db).submitAttempts, 3);
  assert.equal(decodedCapability(f.db).signedFundingXdr, legacy.signedFundingXdr);
  const before = f.counters(); await f.controller().status(); assert.deepEqual(f.counters(), before);
});

test("expired pending funding never retries or prepares a replacement", async () => {
  const f = fixture(); f.setMode("ambiguous"); f.deps.maxPolls = 1; await f.controller().run();
  const retained = structuredClone(f.db.job);
  f.deps.now = () => NOW + 601; f.deps.maxPolls = 12;
  await f.controller().run();
  assert.deepEqual(f.counters(), { creates: 1, submits: 1, launches: 0 });
  assert.deepEqual(f.db.job, retained);
});

test("attempt claims survive interruption before a retry post and remain globally capped", async () => {
  const f = fixture(); f.setMode("ambiguous"); f.deps.maxPolls = 1; await f.controller().run();
  f.deps.maxPolls = 12; f.db.throwAfterState = "funding";
  await f.controller().run();
  assert.equal(decodedCapability(f.db).submitAttempts, 2); assert.equal(f.counters().submits, 1);
  await f.controller().run(); await f.controller().run();
  assert.equal(decodedCapability(f.db).submitAttempts, 3);
  assert.deepEqual(f.counters(), { creates: 1, submits: 2, launches: 0 });
});

test("submission diagnostics preserve only bounded HTTP and result codes, not echoed authorization", async () => {
  const response = new Response(JSON.stringify({ detail: "sensitive raw text", extras: {
    envelope_xdr: "sensitive-signed-envelope", result_codes: { transaction: "tx_too_early", operations: ["op_success", "sensitive error text", "op_bad_auth"] },
  } }), { status: 400 });
  assert.deepEqual(await readCliBurnerSubmission(response), { httpStatus: 400, transactionCode: "tx_too_early", operationCodes: ["op_success", "op_bad_auth"] });
  assert.deepEqual(await readCliBurnerSubmission(new Response("x".repeat(20_000), { status: 503 })), { httpStatus: 503 });
  const f = fixture(); f.setMode("ambiguous"); f.deps.maxPolls = 1;
  f.deps.submit = async () => ({ httpStatus: 400, transactionCode: "tx_too_early", operationCodes: ["op_success", "sensitive raw text"] });
  await f.controller().run();
  const status = await f.controller().status();
  assert.match(status.run!.logs, /HTTP 400; tx_too_early; op_success/);
  for (const value of ["sensitive raw text", "synthetic-owner-signed-envelope", TOKEN]) assert.ok(!JSON.stringify(status).includes(value));
});

async function renewalFixture() {
  const f = fixture(); f.setMode("ambiguous"); f.deps.maxPolls = 1; await f.controller().run();
  f.deps.now = () => NOW + 601; f.deps.maxPolls = 12;
  let preparations = 0; let proofs = 0;
  const proof: CliFundingExpiryProof = { kind: "expired-unused", originalHash: HASH, owner: CLI_TEST_BURNER_OWNER,
    payer: StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 2)), agent: StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 3)), merchant: StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 4)),
    originalSequence: "100", currentOwnerSequence: "99", maxTime: NOW + 600,
    horizonLedger: 100, horizonClosedAt: NOW + 601, rpcLedger: 101, observedAt: NOW + 601 };
  // State-machine isolation only. Real XDR/signature/body checks are tested
  // separately below using local deterministic, synthetic signing identities.
  f.deps.proveUnused = async () => { proofs++; return proof; };
  f.deps.verifyExpiredOriginal = (row, signed, actual) => {
    assert.equal(row.fundingHash, HASH); assert.equal(signed, "synthetic-owner-signed-envelope"); assert.deepEqual(actual, proof);
  };
  f.deps.verifyRenewal = (row, signed, funding, actual) => {
    f.deps.verifyExpiredOriginal!(row, signed, actual, f.deps.now());
    assert.equal(funding.hash, RENEWED_HASH); assert.equal(funding.signedXdr, "synthetic-owner-signed-renewal");
  };
  f.deps.prepare = async (row, token, sequence) => {
    assert.equal(f.db.job?.state, "initializing", "renewal claim precedes preparation/signing");
    assert.equal(sequence, proof.originalSequence); assert.equal(row.id, SESSION_ID); assert.equal(token, TOKEN);
    const marker = decodedCapability(f.db).renewal as { original: { hash: string; signedXdr: string }; proof: CliFundingExpiryProof };
    assert.equal(marker.original.hash, HASH); assert.equal(marker.original.signedXdr, "synthetic-owner-signed-envelope"); assert.deepEqual(marker.proof, proof);
    preparations++;
    return { preparedXdr: "synthetic-renewed-prepared-envelope", signedXdr: "synthetic-owner-signed-renewal", hash: RENEWED_HASH, expiresAt: NOW + 1200 };
  };
  return { ...f, proof, renewalCounts: () => ({ preparations, proofs }) };
}

test("one proven-unused renewal retains original evidence and same session across concurrent replicas", async () => {
  const f = await renewalFixture();
  // Keep the old hash unconfirmed; only the renewed hash gets synthetic finality.
  const reconcile = f.deps.reconcile;
  f.deps.reconcile = async (row, token) => {
    if (row.fundingHash === RENEWED_HASH) f.setMode("success");
    return reconcile(row, token);
  };
  await Promise.all(Array.from({ length: 12 }, () => f.controller().run()));
  await f.controller().run();
  assert.equal(f.renewalCounts().preparations, 1);
  assert.deepEqual(f.counters(), { creates: 1, submits: 2, launches: 1 });
  assert.equal(f.db.job?.state, "succeeded"); assert.equal(f.db.job?.session_id, SESSION_ID);
  const retained = decodedCapability(f.db);
  assert.equal(retained.token, TOKEN); assert.equal(retained.signedFundingXdr, "synthetic-owner-signed-renewal");
  const marker = retained.renewal as { version: number; original: { hash: string; preparedXdr: string; signedXdr: string }; proof: CliFundingExpiryProof };
  assert.equal(marker.version, 1); assert.equal(marker.original.hash, HASH); assert.deepEqual(marker.proof, f.proof);
  assert.equal(marker.original.preparedXdr, "synthetic-prepared-envelope"); assert.equal(marker.original.signedXdr, "synthetic-owner-signed-envelope");
  for (const forbidden of [TOKEN, marker.original.preparedXdr, marker.original.signedXdr, "synthetic-owner-signed-renewal"]) assert.ok(!JSON.stringify(await f.controller().status()).includes(forbidden));
});

test("missing or rejected expiry proof never claims renewal, signs, or changes original funding", async () => {
  const f = await renewalFixture(); const original = structuredClone(f.db.job); const before = f.counters();
  f.deps.proveUnused = async () => { throw new Error("ambiguous or changed-sequence proof"); };
  await f.controller().run();
  assert.deepEqual(f.db.job, original); assert.deepEqual(f.counters(), before); assert.equal(f.renewalCounts().preparations, 0);
});

test("an expired renewed envelope cannot receive a second renewal", async () => {
  const f = await renewalFixture(); await f.controller().run();
  assert.equal(f.renewalCounts().preparations, 1);
  assert.deepEqual(f.counters(), { creates: 1, submits: 4, launches: 0 });
  const before = structuredClone(f.db.job); const proofsBefore = f.renewalCounts().proofs;
  f.deps.now = () => NOW + 1201;
  await f.controller().run(); await f.controller().run();
  assert.deepEqual(f.db.job, before); assert.equal(f.renewalCounts().proofs, proofsBefore);
  assert.equal(f.renewalCounts().preparations, 1); assert.deepEqual(f.counters(), { creates: 1, submits: 4, launches: 0 });
});

test("renewal claim interruption retains original proof without a restart signing or replacement session", async () => {
  const f = await renewalFixture(); f.db.throwAfterState = "initializing";
  await f.controller().run(); assert.equal(f.db.job?.state, "initializing");
  assert.ok(decodedCapability(f.db).renewal);
  await f.controller().run(); assert.equal(f.renewalCounts().preparations, 0);
  assert.deepEqual(f.counters(), { creates: 1, submits: 1, launches: 0 });
});

test("renewal body validation failure cannot submit and cannot attempt another renewal", async () => {
  const f = await renewalFixture(); f.deps.verifyRenewal = () => { throw new Error("synthetic changed actor or sequence"); };
  await f.controller().run(); await f.controller().run();
  assert.equal(f.db.job?.state, "blocked"); assert.equal(f.renewalCounts().preparations, 1);
  assert.deepEqual(f.counters(), { creates: 1, submits: 1, launches: 0 });
  assert.ok(decodedCapability(f.db).renewal);
});

function cryptographicRenewalFixture() {
  const owner = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 51));
  const actors = { payer: Keypair.fromRawEd25519Seed(Buffer.alloc(32, 52)), agent: Keypair.fromRawEd25519Seed(Buffer.alloc(32, 53)), merchant: Keypair.fromRawEd25519Seed(Buffer.alloc(32, 54)) };
  const funding = (sequence: string, selected = actors, time = NOW) => {
    const tx = buildCliFunding(new Account(owner.publicKey(), sequence), selected, time);
    const preparedXdr = tx.toXDR(); tx.sign(owner);
    return { preparedXdr, signedXdr: tx.toXDR(), hash: tx.hash().toString("hex"), expiresAt: Number(tx.timeBounds!.maxTime), sequence: tx.sequence };
  };
  const original = funding("99"); const later = original.expiresAt + 2; const renewed = funding("99", actors, later);
  const row: CliTestRow = { id: SESSION_ID, owner: owner.publicKey(), payer: actors.payer.publicKey(), agent: actors.agent.publicKey(), merchant: actors.merchant.publicKey(),
    state: "funding", version: 1, fundingXdr: original.preparedXdr, fundingHash: original.hash, fundingExpiresAt: original.expiresAt,
    logs: "", createdAt: NOW, updatedAt: NOW, expiresAt: NOW + 86400 };
  const proof: CliFundingExpiryProof = { kind: "expired-unused", originalHash: original.hash, owner: row.owner, payer: row.payer, agent: row.agent, merchant: row.merchant,
    originalSequence: "100", currentOwnerSequence: "99", maxTime: original.expiresAt, horizonLedger: 100, horizonClosedAt: later, rpcLedger: 101, observedAt: later };
  return { row, original, renewed, proof, later, actors, funding };
}

test("cryptographic renewal permits only new time bounds with identical actors, source sequence, and budget", () => {
  const f = cryptographicRenewalFixture();
  assert.doesNotThrow(() => verifyCliBurnerRenewal(f.row, f.original.signedXdr, f.renewed, f.proof, f.later));
  const changedSequence = f.funding("100", f.actors, f.later);
  assert.throws(() => verifyCliBurnerRenewal(f.row, f.original.signedXdr, changedSequence, f.proof, f.later), /time bounds only/);
  const changedActors = f.funding("99", { ...f.actors, agent: Keypair.fromRawEd25519Seed(Buffer.alloc(32, 55)) }, f.later);
  assert.throws(() => verifyCliBurnerRenewal(f.row, f.original.signedXdr, changedActors, f.proof, f.later), /time bounds only/);
  assert.throws(() => verifyCliBurnerRenewal(f.row, f.original.preparedXdr, f.renewed, f.proof, f.later), /signatures/);
  for (const patch of [{ originalHash: HASH }, { currentOwnerSequence: "100" }, { horizonClosedAt: f.original.expiresAt }, { rpcLedger: 99 }, { observedAt: f.later - 121 }, { payer: f.row.agent }]) {
    assert.throws(() => verifyCliBurnerRenewal(f.row, f.original.signedXdr, f.renewed, { ...f.proof, ...patch }, f.later));
  }
});

const PREFLIGHT_LOG = "CLI test signer refuses transaction source, signatures, operations, fee, or time bounds";
async function preflightFixture() {
  const f = fixture(); f.setMode("running"); await f.controller().run();
  const running = (await f.store.read(SESSION_ID, TOKEN))!;
  const failed = await f.store.update(SESSION_ID, TOKEN, running.version, {
    state: "failed", error: "synthetic local signer preflight refusal", logs: PREFLIGHT_LOG, finishedAt: NOW + 10,
  });
  await f.controller().run(); assert.equal(f.db.job?.state, "failed");
  f.deps.now = () => NOW + 611;
  const proof: CliUnstartedProof = { kind: "funded-unstarted", runId: SESSION_ID, fundingHash: HASH,
    owner: failed.owner, payer: failed.payer, agent: failed.agent, merchant: failed.merchant, finishedAt: NOW + 10,
    fundingLedger: 100, initialActorSequence: (100n << 32n).toString(), horizonLedger: 110,
    horizonClosedAt: NOW + 611, rpcLedger: 111, observedAt: NOW + 611 };
  let proofs = 0;
  let recoveredMode: "success" | "running" = "success";
  f.deps.proveUnstarted = async () => { proofs++; return proof; };
  f.deps.prepare = async () => { throw new Error("preflight recovery must not prepare or fund"); };
  f.deps.submit = async () => { throw new Error("preflight recovery must not submit funding"); };
  const originalLaunch = f.deps.launch;
  f.deps.launch = (row, token, attempt) => {
    assert.equal(attempt, "preflight-repair-1"); assert.equal(row.id, failed.id); assert.equal(row.fundingHash, HASH);
    assert.equal(row.owner, failed.owner); assert.equal(row.payer, failed.payer); assert.equal(row.agent, failed.agent); assert.equal(row.merchant, failed.merchant);
    assert.ok(row.logs.includes(PREFLIGHT_LOG));
    const marker = decodedCapability(f.db).preflightRepair as { prior: { logs: string; finishedAt: number }; proof: CliUnstartedProof };
    assert.equal(marker.prior.logs, failed.logs); assert.equal(marker.prior.finishedAt, failed.finishedAt); assert.deepEqual(marker.proof, proof);
    f.setMode(recoveredMode); originalLaunch(row, token, attempt);
  };
  return { ...f, failed, proof, proofs: () => proofs, setRecoveredMode: (mode: "success" | "running") => { recoveredMode = mode; } };
}

test("concurrent unstarted recovery launches once with original funding, actors, history, and isolated attempt", async () => {
  const f = await preflightFixture(); const fundingHash = f.db.job!.funding_hash;
  await Promise.all(Array.from({ length: 12 }, () => f.controller().run())); await f.controller().run();
  assert.deepEqual(f.counters(), { creates: 1, submits: 1, launches: 2 });
  assert.equal(f.db.job?.state, "succeeded"); assert.equal(f.db.job?.funding_hash, fundingHash); assert.equal(f.db.job?.session_id, SESSION_ID);
  const capability = decodedCapability(f.db);
  assert.equal(capability.token, TOKEN); assert.equal(capability.signedFundingXdr, "synthetic-owner-signed-envelope");
  assert.ok(capability.preflightRepair);
  const before = f.counters(); await f.controller().status(); assert.deepEqual(f.counters(), before);
});

test("no unstarted recovery before the prior signing window expires", async () => {
  const f = await preflightFixture(); f.deps.now = () => NOW + 610;
  const retained = structuredClone(f.db.job); await f.controller().run();
  assert.deepEqual(f.db.job, retained); assert.equal(f.proofs(), 0);
  assert.deepEqual(f.counters(), { creates: 1, submits: 1, launches: 1 });
});

test("rejected chain proof preserves failed state with no funding or second launch", async () => {
  const f = await preflightFixture(); const retained = structuredClone(f.db.job);
  f.deps.proveUnstarted = async () => { throw new Error("actor sequence advanced or chain evidence uncertain"); };
  await f.controller().run();
  assert.deepEqual(f.db.job, retained); assert.deepEqual(f.counters(), { creates: 1, submits: 1, launches: 1 });
});

test("ordinary paid failures cannot enter the narrowly allowed signer preflight recovery", async () => {
  for (const logs of ["unknown CLI failure", `${PREFLIGHT_LOG}\nmandate and contract allowance confirmed`, `${PREFLIGHT_LOG}\nSaved reference-agent evidence`]) {
    const f = await preflightFixture(); const current = (await f.store.read(SESSION_ID, TOKEN))!;
    await f.store.update(SESSION_ID, TOKEN, current.version, { logs });
    await f.controller().run(); assert.equal(f.proofs(), 0);
    assert.deepEqual(f.counters(), { creates: 1, submits: 1, launches: 1 });
  }
});

test("preflight recovery marker survives interruption without a restart launch", async () => {
  const f = await preflightFixture(); f.db.throwAfterState = "funded";
  await f.controller().run(); assert.equal(f.db.job?.state, "funded"); assert.ok(decodedCapability(f.db).preflightRepair);
  await f.controller().run(); assert.deepEqual(f.counters(), { creates: 1, submits: 1, launches: 1 });
});

test("a second preflight failure cannot receive another recovery", async () => {
  const f = await preflightFixture(); const launch = f.deps.launch;
  f.setRecoveredMode("running");
  f.deps.launch = (row, token, attempt) => {
    launch(row, token, attempt);
    // Simulate the repaired child also failing, after its launch count advanced.
    void f.store.update(row.id, token, row.version, {
      state: "failed", logs: PREFLIGHT_LOG, finishedAt: NOW + 620,
    });
  };
  await f.controller().run();
  // Allow the synthetic child final save to settle before a later deployment.
  await new Promise((resolve) => setImmediate(resolve));
  f.deps.now = () => NOW + 1300;
  await f.controller().run(); await f.controller().run();
  assert.equal(f.db.job?.state, "failed");
  assert.deepEqual(f.counters(), { creates: 1, submits: 1, launches: 2 });
  assert.ok(decodedCapability(f.db).preflightRepair);
});

test("preflight proof binding rejects changed identity, funding hash, sequence, cutoff, and stale evidence", async () => {
  const f = await preflightFixture();
  assert.doesNotThrow(() => verifyCliPreflightRepairProof(f.failed, f.proof, NOW + 611));
  for (const patch of [{ runId: "another-run" }, { fundingHash: RENEWED_HASH }, { payer: f.failed.agent }, { finishedAt: NOW + 9 },
    { initialActorSequence: ((100n << 32n) + 1n).toString() }, { horizonClosedAt: NOW + 610 }, { rpcLedger: 109 }, { observedAt: NOW + 490 }]) {
    assert.throws(() => verifyCliPreflightRepairProof(f.failed, { ...f.proof, ...patch }, NOW + 611));
  }
});

// Only the public identifiers are those of the narrowly permitted recovery.
// All storage, accounts, timestamps, proofs, and child effects are synthetic.
function registeredSetupFixture() {
  const db = new FakeDatabase();
  const id = "9f54b4f8-554b-4e92-acfd-4dd25631cbcc";
  const fundingHash = "39196eaa6c7b20257da4dcf011ac24e984da1e50a0f308d072ca43cdf27b9c55";
  let row: CliTestRow = { id, owner: CLI_TEST_BURNER_OWNER, version: 20, state: "failed",
    payer: StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 62)), agent: StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 63)), merchant: StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 64)),
    fundingHash, fundingXdr: "synthetic-retained-funding", fundingExpiresAt: NOW - 1000,
    logs: `${PREFLIGHT_LOG}\nExisting registration ${CLI_REGISTERED_SETUP_HASH}\nCLI test signer RPC response is invalid`,
    error: "synthetic oversized RPC response", createdAt: NOW - 2000, updatedAt: NOW - 601,
    startedAt: NOW - 1000, finishedAt: NOW - 601, expiresAt: NOW + 86400 };
  const failed = structuredClone(row);
  const unstarted: CliUnstartedProof = { kind: "funded-unstarted", runId: id, fundingHash, owner: row.owner,
    payer: row.payer, agent: row.agent, merchant: row.merchant, finishedAt: NOW - 1800, fundingLedger: 100,
    initialActorSequence: (100n << 32n).toString(), horizonLedger: 110, horizonClosedAt: NOW - 1199, rpcLedger: 111, observedAt: NOW - 1199 };
  const proof: CliRegisteredSetupProof = { ...unstarted, kind: "registered-unspent", finishedAt: row.finishedAt!,
    registrationHash: CLI_REGISTERED_SETUP_HASH, registrationLedger: 120, mandateExpiry: NOW + 600,
    horizonLedger: 130, horizonClosedAt: NOW, rpcLedger: 131, observedAt: NOW };
  db.job = { job_id: CLI_BURNER_JOB_ID, owner: row.owner, version: 10, state: "failed", session_id: id,
    sealed: null, funding_hash: fundingHash, created_at: row.createdAt, updated_at: row.updatedAt, error: row.error };
  const priorPreflight = { version: 1, prior: { logs: PREFLIGHT_LOG, finishedAt: unstarted.finishedAt }, proof: unstarted };
  replaceSyntheticCapability(db, { sessionId: id, token: TOKEN, signedFundingXdr: "synthetic-retained-signed-funding", submitAttempts: 1, preflightRepair: priorPreflight });
  const calls = { creates: 0, prepares: 0, submits: 0, secrets: 0, proofs: 0, launches: 0 };
  let result: "succeeded" | "failed" | "running" = "succeeded";
  const store = {
    async create() { calls.creates++; throw new Error("recovery must not create accounts"); },
    async secrets() { calls.secrets++; throw new Error("unit test must not retrieve keys"); },
    async read(selectedId: string, token: string) { return selectedId === id && token === TOKEN ? structuredClone(row) : null; },
    async update(selectedId: string, token: string, version: number, patch: Partial<CliTestRow>) {
      assert.equal(selectedId, id); assert.equal(token, TOKEN);
      if (row.version !== version) throw new Error("synthetic CAS conflict");
      row = { ...row, ...patch, version: row.version + 1 }; return structuredClone(row);
    },
  } as CliTestStore;
  const deps: CliBurnerJobDependencies = {
    async ready() {}, async sleep() {}, now: () => NOW, maxPolls: 12,
    async prepare() { calls.prepares++; throw new Error("recovery must not prepare funding"); },
    async submit() { calls.submits++; throw new Error("recovery must not submit funding"); },
    validate() { throw new Error("recovery must not validate a new funding envelope"); },
    async reconcile() { throw new Error("confirmed funding must not reenter reconciliation"); },
    async proveRegisteredSetup(candidate) { calls.proofs++; assert.deepEqual(candidate, failed); return proof; },
    launch(candidate, token, attempt, registrationHash) {
      calls.launches++;
      assert.equal(db.job?.state, "running"); assert.equal(candidate.state, "running"); assert.equal(token, TOKEN);
      assert.equal(attempt, "registered-setup-repair-1"); assert.equal(registrationHash, CLI_REGISTERED_SETUP_HASH);
      for (const field of ["id", "fundingHash", "owner", "payer", "agent", "merchant"] as const) assert.equal(candidate[field], failed[field]);
      assert.ok(candidate.logs.startsWith(failed.logs));
      const sealed = decodedCapability(db);
      assert.deepEqual(sealed.preflightRepair, priorPreflight);
      assert.deepEqual(sealed.registeredSetupRepair, { version: 1,
        prior: { logs: failed.logs, error: failed.error, startedAt: failed.startedAt, finishedAt: failed.finishedAt }, proof });
      row = { ...candidate, state: result, version: candidate.version + 1,
        logs: `${candidate.logs}\nsynthetic resumed setup ${result}`, finishedAt: NOW + 10 };
    },
  };
  return { db, store, deps, calls, failed, proof, controller: () => createCliBurnerJobController(db, store, SECRET, deps),
    result: (value: typeof result) => { result = value; } };
}

test("registered setup recovery claims once across replicas and retains exact registration, actors, funding, and logs", async () => {
  const f = registeredSetupFixture();
  await Promise.all(Array.from({ length: 12 }, () => f.controller().run()));
  await Promise.all(Array.from({ length: 6 }, () => f.controller().run()));
  assert.equal(f.calls.launches, 1); assert.equal(f.db.job?.state, "succeeded");
  for (const field of ["creates", "prepares", "submits", "secrets"] as const) assert.equal(f.calls[field], 0, field);
  assert.equal(f.db.job?.funding_hash, f.failed.fundingHash); assert.equal(f.db.job?.session_id, f.failed.id);
  const status = await f.controller().status(false);
  assert.ok(status.run?.logs.startsWith(f.failed.logs)); assert.match(status.run!.logs, /no new funding/);
  for (const forbidden of [TOKEN, "synthetic-retained-signed-funding", "synthetic-retained-funding", "sealed", "registeredSetupRepair"]) assert.ok(!JSON.stringify(status).includes(forbidden));
});

test("registered setup recovery marker survives interrupted claim without a later launch", async () => {
  const f = registeredSetupFixture(); f.db.throwAfterState = "funded";
  await f.controller().run(); assert.equal(f.db.job?.state, "funded");
  const marker = decodedCapability(f.db).registeredSetupRepair; assert.ok(marker);
  await f.controller().run(); await f.controller().run();
  assert.deepEqual(decodedCapability(f.db).registeredSetupRepair, marker);
  assert.equal(f.calls.launches, 0); assert.equal(f.calls.submits, 0); assert.equal(f.calls.creates, 0);
});

test("a second registered setup failure and a retained running child never receive another launch", async () => {
  for (const result of ["failed", "running"] as const) {
    const f = registeredSetupFixture(); f.result(result); await f.controller().run();
    const marker = decodedCapability(f.db).registeredSetupRepair; const proofs = f.calls.proofs;
    f.deps.now = () => NOW + 1000;
    await Promise.all(Array.from({ length: 6 }, () => f.controller().run()));
    assert.equal(f.calls.launches, 1); assert.equal(f.calls.proofs, proofs); assert.equal(f.db.job?.state, result);
    assert.deepEqual(decodedCapability(f.db).registeredSetupRepair, marker);
    assert.equal(f.calls.submits, 0); assert.equal(f.calls.prepares, 0); assert.equal(f.calls.creates, 0);
  }
});

test("registered recovery requires the pinned failure and previous preflight marker", async () => {
  for (const patch of [{ logs: "unknown failure" }, { logs: `${registeredSetupFixture().failed.logs}\nmandate and contract allowance confirmed` },
    { logs: `${registeredSetupFixture().failed.logs}\nSaved reference-agent evidence` }, { logs: `${registeredSetupFixture().failed.logs}\nVerified result` }]) {
    const f = registeredSetupFixture(); await f.store.update(f.failed.id, TOKEN, f.failed.version, patch);
    await f.controller().run(); assert.equal(f.calls.proofs, 0); assert.equal(f.calls.launches, 0);
  }
  const f = registeredSetupFixture(); const capability = decodedCapability(f.db); delete capability.preflightRepair; replaceSyntheticCapability(f.db, capability);
  await f.controller().run(); assert.equal(f.calls.proofs, 0); assert.equal(f.calls.launches, 0);
});

test("registered proof rejects scope, hash, ledger ordering, expiry, and stale or future evidence without claiming", async () => {
  const f = registeredSetupFixture();
  assert.doesNotThrow(() => verifyCliRegisteredSetupProof(f.failed, f.proof, NOW));
  const invalid: Partial<CliRegisteredSetupProof>[] = [{ kind: "funded-unstarted" as never }, { runId: SESSION_ID }, { fundingHash: HASH },
    { registrationHash: HASH }, { owner: f.failed.payer }, { payer: f.failed.agent }, { agent: f.failed.merchant }, { merchant: f.failed.payer },
    { finishedAt: f.failed.finishedAt! - 1 }, { initialActorSequence: ((100n << 32n) + 1n).toString() },
    { registrationLedger: 99 }, { horizonLedger: 119 }, { rpcLedger: 129 }, { mandateExpiry: NOW + 120 },
    { mandateExpiry: NOW - 1 }, { horizonClosedAt: NOW - 1 }, { horizonClosedAt: NOW + 1 }, { observedAt: NOW - 121 }, { observedAt: NOW + 1 }, { observedAt: NaN }];
  for (const patch of invalid) {
    assert.throws(() => verifyCliRegisteredSetupProof(f.failed, { ...f.proof, ...patch }, NOW));
    const candidate = registeredSetupFixture(); const before = structuredClone(candidate.db.job);
    candidate.deps.proveRegisteredSetup = async () => ({ ...candidate.proof, ...patch });
    await candidate.controller().run(); assert.deepEqual(candidate.db.job, before);
    assert.equal(candidate.calls.launches, 0); assert.equal(candidate.calls.submits, 0); assert.equal(candidate.calls.creates, 0);
  }
  for (const patch of [{ id: SESSION_ID }, { fundingHash: HASH }, { state: "running" as const }]) {
    assert.throws(() => verifyCliRegisteredSetupProof({ ...f.failed, ...patch }, f.proof, NOW));
  }
});

test("registered proof read failures and unexpired prior packets preserve the failed record", async () => {
  const f = registeredSetupFixture(); const before = structuredClone(f.db.job);
  f.deps.proveRegisteredSetup = async () => { throw new Error("synthetic uncertain chain evidence"); };
  await f.controller().run(); assert.deepEqual(f.db.job, before); assert.equal(f.calls.launches, 0);
  const early = registeredSetupFixture(); early.deps.now = () => NOW - 1;
  await early.controller().run(); assert.equal(early.calls.proofs, 0); assert.equal(early.calls.launches, 0);
});

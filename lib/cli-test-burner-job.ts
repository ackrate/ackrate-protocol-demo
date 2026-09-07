import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { Keypair } from "@stellar/stellar-sdk";
import type { QueryResultRow } from "pg";
import { CLI_TEST_BURNER_OWNER, loadCliTestBurner } from "./cli-test-burner";
import { ownerFundingSnapshot, reconcileFunding } from "./cli-test-network";
import { CLI_TEST_SOURCE, CLI_TEST_VERSION, launchCliTest } from "./cli-test-runner";
import { createCliTestStore, type CliTestRow, type CliTestStore } from "./cli-test-store";
import { buildCliFunding, CLI_MAINNET_HORIZON, verifyCliFundingSigned } from "./cli-test-transactions";
import { createPostgresClient, type PostgresQueryable } from "./wallet/postgres";

export const CLI_BURNER_JOB_ID = "cli-mainnet-burner-20260907-v1";
type JobState = "initializing" | "prepared" | "funding" | "funded" | "running" | "succeeded" | "failed" | "blocked";
interface Job extends QueryResultRow {
  job_id: string; owner: string; version: number; state: JobState;
  session_id: string | null; sealed: unknown; funding_hash: string | null;
  created_at: number; updated_at: number; error: string | null;
}
interface Capability { sessionId: string; token: string; signedFundingXdr?: string }
export interface CliBurnerFunding { preparedXdr: string; signedXdr: string; hash: string; expiresAt: number }
export interface CliBurnerJobDependencies {
  ready(): Promise<void>;
  prepare(row: CliTestRow, token: string): Promise<CliBurnerFunding>;
  validate(row: CliTestRow, signedXdr: string): void;
  submit(signedXdr: string): Promise<void>;
  reconcile(row: CliTestRow, token: string): Promise<CliTestRow>;
  launch(row: CliTestRow, token: string): void;
  sleep(milliseconds: number): Promise<void>;
  now(): number;
  maxPolls?: number;
}
export interface CliBurnerJobStatus {
  configured: boolean; state: string; error?: string;
  run?: Pick<CliTestRow, "id" | "owner" | "payer" | "agent" | "merchant" | "state" | "logs" | "error" | "fundingHash" | "startedAt" | "finishedAt">;
  version: string; sourceCommit: string;
}
const PURPOSE = "ackrate/cli-burner-job/capability-and-funding/v1";
const STATES: JobState[] = ["initializing", "prepared", "funding", "funded", "running", "succeeded", "failed", "blocked"];
const RELEASE = { version: CLI_TEST_VERSION, sourceCommit: CLI_TEST_SOURCE };
const JOB_COLUMNS = "job_id, owner, version, state, session_id, sealed, funding_hash, created_at, updated_at, error";

function validateJob(row: QueryResultRow): Job {
  if (row.job_id !== CLI_BURNER_JOB_ID || row.owner !== CLI_TEST_BURNER_OWNER
    || !Number.isSafeInteger(row.version) || row.version < 0 || !STATES.includes(row.state)
    || (row.session_id !== null && !/^[a-f0-9-]{36}$/.test(row.session_id))
    || (row.funding_hash !== null && !/^[a-f0-9]{64}$/.test(row.funding_hash))) throw new Error("invalid retained burner job");
  return row as Job;
}

/** A dependency-injected single-run controller. No method accepts a new job ID,
 * owner, reset flag, mnemonic, or alternate payment target.
 */
export function createCliBurnerJobController(db: PostgresQueryable, store: CliTestStore, secret: string, deps: CliBurnerJobDependencies) {
  if (!db || typeof db.query !== "function" || Buffer.byteLength(secret) < 32) throw new Error("burner job storage configuration is invalid");
  const key = Buffer.from(hkdfSync("sha256", secret, "ackrate-cli-burner-job-hkdf-v1", PURPOSE, 32));
  const aad = Buffer.from(JSON.stringify([PURPOSE, CLI_BURNER_JOB_ID, CLI_TEST_BURNER_OWNER]));
  let initialization: Promise<void> | undefined;
  let readinessError: string | undefined;

  function seal(capability: Capability) {
    const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, iv); cipher.setAAD(aad);
    const plaintext = Buffer.from(JSON.stringify(capability));
    let ciphertext: Buffer;
    try { ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]); } finally { plaintext.fill(0); }
    return { v: 1, iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"), ciphertext: ciphertext.toString("base64url") };
  }

  function unseal(job: Job): Capability {
    try {
      const value = job.sealed as { v: number; iv: string; tag: string; ciphertext: string };
      if (!value || value.v !== 1 || Object.keys(value).sort().join(",") !== "ciphertext,iv,tag,v") throw new Error();
      const decode = (text: string, size?: number) => {
        if (typeof text !== "string" || !/^[A-Za-z0-9_-]+$/.test(text)) throw new Error();
        const bytes = Buffer.from(text, "base64url");
        if (bytes.toString("base64url") !== text || (size && bytes.length !== size)) throw new Error();
        return bytes;
      };
      const decipher = createDecipheriv("aes-256-gcm", key, decode(value.iv, 12));
      decipher.setAAD(aad); decipher.setAuthTag(decode(value.tag, 16));
      const plaintext = Buffer.concat([decipher.update(decode(value.ciphertext)), decipher.final()]);
      let capability: Capability;
      try { capability = JSON.parse(plaintext.toString("utf8")); } finally { plaintext.fill(0); }
      if (capability.sessionId !== job.session_id || !/^[a-f0-9-]{36}$/.test(capability.sessionId)
        || !/^[A-Za-z0-9_-]{43}$/.test(capability.token)
        || Object.keys(capability).some((field) => !["sessionId", "token", "signedFundingXdr"].includes(field))
        || (capability.signedFundingXdr !== undefined && (typeof capability.signedFundingXdr !== "string" || capability.signedFundingXdr.length > 131_072))) throw new Error();
      return capability;
    } catch { throw new Error("retained burner job capability cannot be recovered"); }
  }

  async function initialize() {
    initialization ??= db.query(`CREATE TABLE IF NOT EXISTS ackrate_cli_burner_jobs (
      job_id text PRIMARY KEY, owner text NOT NULL, version integer NOT NULL CHECK (version >= 0),
      state text NOT NULL CHECK (state IN ('initializing','prepared','funding','funded','running','succeeded','failed','blocked')),
      session_id text, sealed jsonb, funding_hash text, created_at bigint NOT NULL, updated_at bigint NOT NULL, error text
    )`).then(() => undefined).catch((error) => { initialization = undefined; throw error; });
    await initialization;
  }

  async function load(): Promise<Job | null> {
    const rows = await db.query(`SELECT ${JOB_COLUMNS} FROM ackrate_cli_burner_jobs WHERE job_id = $1`, [CLI_BURNER_JOB_ID]);
    return rows.length === 1 ? validateJob(rows[0]) : null;
  }

  async function transition(job: Job, state: JobState, patch: { sessionId?: string; sealed?: unknown; fundingHash?: string; error?: string } = {}): Promise<Job | null> {
    const rows = await db.query(`UPDATE ackrate_cli_burner_jobs
      SET version = version + 1, state = $4, session_id = COALESCE($5, session_id),
        sealed = COALESCE($6::jsonb, sealed), funding_hash = COALESCE($7, funding_hash),
        updated_at = $8, error = COALESCE($9, error)
      WHERE job_id = $1 AND owner = $2 AND version = $3 AND state = $10 RETURNING ${JOB_COLUMNS}`,
    [CLI_BURNER_JOB_ID, CLI_TEST_BURNER_OWNER, job.version, state, patch.sessionId ?? null,
      patch.sealed === undefined ? null : JSON.stringify(patch.sealed), patch.fundingHash ?? null, deps.now(), patch.error ?? null, job.state]);
    return rows.length === 1 ? validateJob(rows[0]) : null;
  }

  async function session(job: Job): Promise<{ capability: Capability; row: CliTestRow }> {
    const capability = unseal(job);
    const row = await store.read(capability.sessionId, capability.token);
    if (!row || row.owner !== CLI_TEST_BURNER_OWNER || row.id !== job.session_id
      || (job.funding_hash !== null && row.fundingHash !== job.funding_hash)) throw new Error("retained burner session is unavailable");
    return { capability, row };
  }

  async function run(): Promise<void> {
    await initialize();
    // Validate the build and pinned signer on every startup, including retained
    // prepared jobs. This read-only check cannot create or submit a transaction.
    try { await deps.ready(); readinessError = undefined; }
    catch { readinessError = "The one-off test configuration could not be validated. No new action was started."; return; }
    const now = deps.now();
    const claimed = await db.query(`INSERT INTO ackrate_cli_burner_jobs
      (job_id, owner, version, state, session_id, sealed, funding_hash, created_at, updated_at, error)
      VALUES ($1, $2, 0, 'initializing', NULL, NULL, NULL, $3, $3, NULL)
      ON CONFLICT (job_id) DO NOTHING RETURNING ${JOB_COLUMNS}`, [CLI_BURNER_JOB_ID, CLI_TEST_BURNER_OWNER, now]);
    let job = claimed.length === 1 ? validateJob(claimed[0]) : await load();
    if (!job) return;
    try {
      if (claimed.length === 1) {
        const created = await store.create(CLI_TEST_BURNER_OWNER);
        const capability: Capability = { sessionId: created.id, token: created.token };
        const attached = await transition(job, "initializing", { sessionId: created.id, sealed: seal(capability) });
        if (!attached) return;
        job = attached;
        const funding = await deps.prepare(created.row, created.token);
        if (!/^[a-f0-9]{64}$/.test(funding.hash) || !Number.isSafeInteger(funding.expiresAt)
          || funding.expiresAt <= deps.now() || funding.preparedXdr.length > 100_000 || funding.signedXdr.length > 131_072) throw new Error("invalid prepared burner funding");
        const prepared = await store.update(created.id, created.token, created.row.version, {
          fundingXdr: funding.preparedXdr, fundingHash: funding.hash, fundingExpiresAt: funding.expiresAt,
          logs: "One-off burner test prepared. Maximum account funding: 6 XLM plus fee; purchase budget: 0.03 USDC.\n",
        });
        deps.validate(prepared, funding.signedXdr);
        const updated = await transition(job, "prepared", { fundingHash: funding.hash,
          sealed: seal({ ...capability, signedFundingXdr: funding.signedXdr }) });
        if (!updated) return;
        job = updated;
      } else if (job.state === "initializing") {
        // Its original owner may still be preparing, or may have crashed before
        // attaching a capability. Neither case permits another store.create.
        return;
      }

      const polls = Math.min(Math.max(deps.maxPolls ?? 360, 1), 360);
      for (let attempt = 0; attempt < polls; attempt++) {
        job = await load();
        if (!job || ["succeeded", "failed", "blocked", "initializing"].includes(job.state)) return;
        const { capability, row } = await session(job);
        if (job.state === "prepared") {
          if (row.state !== "prepared" || !capability.signedFundingXdr) throw new Error("funding preparation state differs");
          deps.validate(row, capability.signedFundingXdr);
          const fundingClaim = await transition(job, "funding");
          if (!fundingClaim) continue;
          job = fundingClaim;
          await store.update(row.id, capability.token, row.version, { state: "funding" });
          // This exact CAS winner submits at most once. Restarts only reconcile
          // the retained hash, even if a crash happened immediately before POST.
          try { await deps.submit(capability.signedFundingXdr); } catch { /* Keep funding; no submission retry. */ }
          continue;
        }
        if (job.state === "funding") {
          const latest = row.state === "funding" ? await deps.reconcile(row, capability.token) : row;
          if (latest.state === "funded") { await transition(job, "funded"); continue; }
          if (latest.state === "failed") { await transition(job, "failed", { error: "The exact funding transaction failed; this job will not repeat." }); return; }
          if (latest.state !== "funding") return;
        } else if (job.state === "funded") {
          if (row.state !== "funded") return;
          const runClaim = await transition(job, "running");
          if (!runClaim) continue;
          job = runClaim;
          const running = await store.update(row.id, capability.token, row.version, { state: "running", startedAt: deps.now(), logs: `${row.logs}\nAuthorized one-off Mainnet run claimed.\n` });
          deps.launch(running, capability.token);
          continue;
        } else if (job.state === "running") {
          if (row.state === "succeeded") { await transition(job, "succeeded"); return; }
          if (row.state === "failed") { await transition(job, "failed", { error: "The CLI stopped before completion; this job will not restart." }); return; }
          if (row.state !== "running") return;
        }
        await deps.sleep(2_000);
      }
    } catch {
      // Never erase a funding/running claim or expose errors containing signer
      // data. Unknown initialization stays terminal and requires manual review.
      if (job && ["initializing", "prepared"].includes(job.state)) {
        await transition(job, "blocked", { error: "The one-off test could not be prepared safely. No replacement run will be created." }).catch(() => undefined);
      }
    }
  }

  async function status(seedConfigured = true): Promise<CliBurnerJobStatus> {
    const absent = (): CliBurnerJobStatus => ({ configured: seedConfigured,
      state: seedConfigured ? (readinessError ? "configuration-error" : "not-started") : "not-configured",
      ...(seedConfigured && readinessError ? { error: readinessError } : {}), ...RELEASE });
    let job: Job | null;
    try { job = await load(); }
    catch (error) {
      if ((error as { code?: string }).code === "42P01") return absent();
      return { configured: true, state: "unavailable", error: "The retained one-off job status is unavailable.", ...RELEASE };
    }
    if (!job) return absent();
    const result: CliBurnerJobStatus = { configured: true, state: job.state, ...RELEASE };
    if (job.error) result.error = job.error;
    if (job.session_id) {
      try {
        const { row } = await session(job);
        result.run = { id: row.id, owner: row.owner, payer: row.payer, agent: row.agent, merchant: row.merchant,
          state: row.state, logs: row.logs,
          ...(row.error ? { error: row.error } : {}), ...(row.fundingHash ? { fundingHash: row.fundingHash } : {}),
          ...(row.startedAt ? { startedAt: row.startedAt } : {}), ...(row.finishedAt ? { finishedAt: row.finishedAt } : {}) };
      } catch { result.error = "The retained session requires manual recovery; no replacement will be created."; }
    }
    return result;
  }
  return { run, status };
}

async function verifyBuild(): Promise<void> {
  const path = join(process.cwd(), "vendor", "ackrate-cli-test.mjs");
  const metadata = join(process.cwd(), "vendor", "cli-test-build.json");
  if ((await stat(path)).size > 16 * 1024 * 1024 || (await stat(metadata)).size > 16_384) throw new Error("invalid CLI build");
  const manifest = JSON.parse(await readFile(metadata, "utf8"));
  if (manifest.version !== CLI_TEST_VERSION || manifest.sourceCommit !== CLI_TEST_SOURCE
    || createHash("sha256").update(await readFile(path)).digest("hex") !== manifest.sha256) throw new Error("CLI build identity mismatch");
}

let controller: { databaseUrl: string; secret: string; value: ReturnType<typeof createCliBurnerJobController> } | undefined;
function storageReady(): boolean { return Boolean(process.env.DATABASE_URL && process.env.ACKRATE_SESSION_SECRET && Buffer.byteLength(process.env.ACKRATE_SESSION_SECRET) >= 32); }
function seedConfigured(): boolean { return Boolean(process.env.ACKRATE_CLI_BURNER_MNEMONIC); }
function defaultController() {
  const databaseUrl = process.env.DATABASE_URL!; const secret = process.env.ACKRATE_SESSION_SECRET!;
  if (controller?.databaseUrl === databaseUrl && controller.secret === secret) return controller.value;
  const db = createPostgresClient(databaseUrl); const store = createCliTestStore(db, secret);
  const value = createCliBurnerJobController(db, store, secret, {
    ready: async () => { await verifyBuild(); loadCliTestBurner(); },
    prepare: async (row, token) => {
      const owner = loadCliTestBurner();
      const account = await ownerFundingSnapshot(CLI_TEST_BURNER_OWNER);
      const responses = await Promise.all([row.payer, row.agent, row.merchant].map((address) => fetch(`${CLI_MAINNET_HORIZON}/accounts/${address}`, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000) })));
      if (responses.some((response) => response.status !== 404)) throw new Error("fresh test accounts could not be verified");
      const keys = await store.secrets(row.id, token);
      const transaction = buildCliFunding(account, { payer: Keypair.fromSecret(keys.payer), agent: Keypair.fromSecret(keys.agent), merchant: Keypair.fromSecret(keys.merchant) });
      const preparedXdr = transaction.toXDR(); transaction.sign(owner);
      const signedXdr = transaction.toXDR();
      verifyCliFundingSigned(preparedXdr, signedXdr, CLI_TEST_BURNER_OWNER);
      return { preparedXdr, signedXdr, hash: transaction.hash().toString("hex"), expiresAt: Number(transaction.timeBounds!.maxTime) };
    },
    validate: (row, signedXdr) => {
      if (!row.fundingXdr || !row.fundingHash || row.owner !== CLI_TEST_BURNER_OWNER) throw new Error("missing exact funding context");
      const tx = verifyCliFundingSigned(row.fundingXdr, signedXdr, CLI_TEST_BURNER_OWNER);
      if (tx.hash().toString("hex") !== row.fundingHash || Number(tx.timeBounds!.maxTime) !== row.fundingExpiresAt) throw new Error("funding hash or expiry differs");
    },
    submit: async (signedXdr) => {
      const response = await fetch(`${CLI_MAINNET_HORIZON}/transactions`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ tx: signedXdr }), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20_000) });
      await response.body?.cancel();
    },
    reconcile: (row, token) => reconcileFunding(store, row, token),
    launch: (row, token) => launchCliTest(store, row, token),
    sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    now: () => Math.floor(Date.now() / 1000),
  });
  controller = { databaseUrl, secret, value }; return value;
}

const runtime = globalThis as typeof globalThis & { __ackrateCliBurnerStarted?: boolean; __ackrateCliBurnerStartupError?: boolean };
/** Called only by the explicit production-start marker, never by status reads. */
export function startCliBurnerJob(): void {
  if (process.env.NODE_ENV !== "production" || process.env.NEXT_PHASE === "phase-production-build" || process.env.ACKRATE_CLI_RUNTIME_START !== "1" || !storageReady() || !seedConfigured() || runtime.__ackrateCliBurnerStarted) return;
  runtime.__ackrateCliBurnerStarted = true;
  try { void defaultController().run().catch(() => { runtime.__ackrateCliBurnerStartupError = true; }); }
  catch { runtime.__ackrateCliBurnerStartupError = true; /* No raw config/signer error is logged. */ }
}

/** Read-only public projection. It cannot claim, initialize, submit, or launch a job. */
export async function readCliBurnerJobStatus(): Promise<CliBurnerJobStatus> {
  const seeded = seedConfigured();
  if (!storageReady()) return seeded
    ? { configured: true, state: "unavailable", error: "The one-off job storage is unavailable.", ...RELEASE }
    : { configured: false, state: "not-configured", ...RELEASE };
  try {
    const result = await defaultController().status(seeded);
    if (result.state === "not-started" && runtime.__ackrateCliBurnerStartupError) return {
      ...result, state: "configuration-error", error: "The one-off test could not start safely. No replacement is authorized.",
    };
    return result;
  }
  catch { return { configured: true, state: "unavailable", error: "The one-off job status is unavailable.", ...RELEASE }; }
}

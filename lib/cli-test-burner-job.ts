import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { Keypair, Transaction, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import type { QueryResultRow } from "pg";
import { CLI_TEST_BURNER_OWNER, loadCliTestBurner } from "./cli-test-burner";
import { ownerFundingSnapshot, reconcileFunding } from "./cli-test-network";
import { CLI_TEST_SOURCE, CLI_TEST_VERSION, launchCliTest } from "./cli-test-runner";
import { createCliTestStore, type CliTestRow, type CliTestStore } from "./cli-test-store";
import { buildCliFunding, CLI_MAINNET_HORIZON, CLI_MAINNET_PASSPHRASE, verifyCliFundingSigned } from "./cli-test-transactions";
import { proveCliFundingExpiredUnused, type CliFundingExpiryProof } from "./cli-test-funding-expiry";
import { proveCliTestUnstarted, proveCliRegisteredSetup, type CliUnstartedProof, type CliRegisteredSetupProof } from "./cli-test-unstarted-proof";
import { createPostgresClient, type PostgresQueryable } from "./wallet/postgres";
import { boundedResponseJson } from "./wallet/http";

export const CLI_BURNER_JOB_ID = "cli-mainnet-burner-20260907-v1";
export const CLI_REGISTERED_SETUP_HASH = "a41fe8e9cbc237686ff535906caa0290e0c2468662a4e751ba251526d58a77e6";
type JobState = "initializing" | "prepared" | "funding" | "funded" | "running" | "succeeded" | "failed" | "blocked";
interface Job extends QueryResultRow {
  job_id: string; owner: string; version: number; state: JobState;
  session_id: string | null; sealed: unknown; funding_hash: string | null;
  created_at: number; updated_at: number; error: string | null;
}
interface Capability {
  sessionId: string; token: string; signedFundingXdr?: string; submitAttempts?: number;
  renewal?: { version: 1; original: CliBurnerFunding & { submitAttempts: number }; proof: CliFundingExpiryProof };
  preflightRepair?: { version: 1; prior: { logs: string; error?: string; startedAt?: number; finishedAt: number }; proof: CliUnstartedProof };
  registeredSetupRepair?: { version: 1; prior: { logs: string; error?: string; startedAt?: number; finishedAt: number }; proof: CliRegisteredSetupProof };
}
export interface CliBurnerFunding { preparedXdr: string; signedXdr: string; hash: string; expiresAt: number }
export interface CliBurnerSubmission { httpStatus?: number; transactionCode?: string; operationCodes?: string[] }
export interface CliBurnerJobDependencies {
  ready(): Promise<void>;
  prepare(row: CliTestRow, token: string, originalSequence?: string): Promise<CliBurnerFunding>;
  proveUnused?(row: CliTestRow): Promise<CliFundingExpiryProof>;
  proveUnstarted?(row: CliTestRow): Promise<CliUnstartedProof>;
  proveRegisteredSetup?(row: CliTestRow): Promise<CliRegisteredSetupProof>;
  verifyExpiredOriginal?(row: CliTestRow, signedXdr: string, proof: CliFundingExpiryProof, now: number): void;
  verifyRenewal?(row: CliTestRow, originalSignedXdr: string, funding: CliBurnerFunding, proof: CliFundingExpiryProof, now: number): void;
  validate(row: CliTestRow, signedXdr: string): void;
  submit(signedXdr: string): Promise<CliBurnerSubmission | void>;
  reconcile(row: CliTestRow, token: string): Promise<CliTestRow>;
  launch(row: CliTestRow, token: string, attempt?: "preflight-repair-1" | "registered-setup-repair-1", registrationHash?: string): void;
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
const RESULT_CODE = /^(?:tx|op)_[a-z0-9_]{1,64}$/;

function isUnstartedCandidate(row: CliTestRow): boolean {
  return row.state === "failed" && Number.isSafeInteger(row.finishedAt) && row.finishedAt! > 0
    && row.logs.includes("CLI test signer refuses transaction source, signatures, operations, fee, or time bounds")
    && !["mandate and contract allowance confirmed", "Saved reference-agent evidence", "Verified result"].some((text) => row.logs.includes(text));
}

function isRegisteredSetupCandidate(row: CliTestRow): boolean {
  return row.id === "9f54b4f8-554b-4e92-acfd-4dd25631cbcc"
    && row.fundingHash === "39196eaa6c7b20257da4dcf011ac24e984da1e50a0f308d072ca43cdf27b9c55"
    && row.state === "failed" && Number.isSafeInteger(row.finishedAt) && row.finishedAt! > 0
    && row.logs.includes("CLI test signer RPC response is invalid")
    && !["mandate and contract allowance confirmed", "Saved reference-agent evidence", "Verified result"].some((text) => row.logs.includes(text));
}

export function verifyCliRegisteredSetupProof(row: CliTestRow, proof: CliRegisteredSetupProof, now: number): void {
  if (!isRegisteredSetupCandidate(row) || proof.kind !== "registered-unspent" || proof.registrationHash !== CLI_REGISTERED_SETUP_HASH
    || proof.runId !== row.id || proof.fundingHash !== row.fundingHash || proof.finishedAt !== row.finishedAt
    || ["owner", "payer", "agent", "merchant"].some((field) => proof[field as "owner"] !== row[field as "owner"])
    || ![proof.finishedAt, proof.fundingLedger, proof.registrationLedger, proof.mandateExpiry, proof.horizonLedger, proof.horizonClosedAt, proof.rpcLedger, proof.observedAt, now].every((value) => Number.isSafeInteger(value) && value > 0)
    || proof.initialActorSequence !== (BigInt(proof.fundingLedger) << 32n).toString()
    || proof.registrationLedger < proof.fundingLedger || proof.horizonLedger < proof.registrationLedger
    || proof.horizonClosedAt <= proof.finishedAt + 600 || proof.horizonClosedAt > proof.observedAt
    || proof.rpcLedger < proof.horizonLedger || proof.mandateExpiry <= now + 120
    || proof.observedAt > now || now - proof.observedAt > 120 || proof.observedAt - proof.horizonClosedAt > 120) {
    throw new Error("registered CLI setup recovery evidence does not match");
  }
}

/** The proof is produced from pinned chain reads; this also binds every field
 * to the exact failed run before its one recovery marker may be claimed. */
export function verifyCliPreflightRepairProof(row: CliTestRow, proof: CliUnstartedProof, now: number): void {
  if (!isUnstartedCandidate(row) || proof.kind !== "funded-unstarted" || proof.runId !== row.id
    || proof.fundingHash !== row.fundingHash || proof.finishedAt !== row.finishedAt
    || ["owner", "payer", "agent", "merchant"].some((field) => proof[field as "owner"] !== row[field as "owner"])
    || ![proof.finishedAt, proof.fundingLedger, proof.horizonLedger, proof.horizonClosedAt, proof.rpcLedger, proof.observedAt, now].every((value) => Number.isSafeInteger(value) && value > 0)
    || proof.initialActorSequence !== (BigInt(proof.fundingLedger) << 32n).toString()
    || proof.horizonClosedAt <= proof.finishedAt + 600 || proof.horizonClosedAt > proof.observedAt
    || proof.horizonLedger < proof.fundingLedger || proof.rpcLedger < proof.horizonLedger
    || proof.observedAt > now || now - proof.observedAt > 120 || proof.observedAt - proof.horizonClosedAt > 120) {
    throw new Error("failed CLI preflight recovery evidence does not match");
  }
}

function verifiedRenewalOriginal(row: CliTestRow, signedXdr: string, proof: CliFundingExpiryProof, now: number): Transaction {
  if (!row.fundingXdr || !row.fundingHash || !row.fundingExpiresAt) throw new Error("missing original funding");
  const parsed = TransactionBuilder.fromXDR(row.fundingXdr, CLI_MAINNET_PASSPHRASE);
  if (!(parsed instanceof Transaction)) throw new Error("invalid original funding");
  const original = verifyCliFundingSigned(row.fundingXdr, signedXdr, row.owner, Number(parsed.timeBounds?.minTime));
  if (original.hash().toString("hex") !== row.fundingHash || Number(original.timeBounds?.maxTime) !== row.fundingExpiresAt
    || original.toEnvelope().v1().tx().cond().switch().name !== "precondTime"
    || proof.kind !== "expired-unused" || proof.originalHash !== row.fundingHash
    || ["owner", "payer", "agent", "merchant"].some((field) => proof[field as "owner"] !== row[field as "owner"])
    || proof.originalSequence !== original.sequence || !/^(?:0|[1-9]\d*)$/.test(proof.currentOwnerSequence)
    || BigInt(proof.currentOwnerSequence) !== BigInt(original.sequence) - 1n || proof.maxTime !== row.fundingExpiresAt
    || ![proof.maxTime, proof.horizonLedger, proof.horizonClosedAt, proof.rpcLedger, proof.observedAt, now].every((value) => Number.isSafeInteger(value) && value > 0)
    || proof.horizonClosedAt <= proof.maxTime || proof.horizonClosedAt > proof.observedAt
    || proof.rpcLedger < proof.horizonLedger || proof.observedAt > now || now - proof.observedAt > 120
    || proof.observedAt - proof.horizonClosedAt > 120) throw new Error("original funding expiry proof does not match");
  const [payer, agent, merchant] = original.operations;
  if (payer.type !== "createAccount" || payer.destination !== row.payer
    || agent.type !== "createAccount" || agent.destination !== row.agent
    || merchant.type !== "createAccount" || merchant.destination !== row.merchant) throw new Error("original actor binding differs");
  return original;
}

/** Pure verification: renewal may change time bounds only, never the payment body. */
export function verifyCliBurnerRenewal(row: CliTestRow, originalSignedXdr: string, funding: CliBurnerFunding, proof: CliFundingExpiryProof, now: number): void {
  const original = verifiedRenewalOriginal(row, originalSignedXdr, proof, now);
  const renewed = verifyCliFundingSigned(funding.preparedXdr, funding.signedXdr, row.owner, now);
  if (renewed.hash().toString("hex") !== funding.hash || funding.hash === row.fundingHash
    || Number(renewed.timeBounds?.maxTime) !== funding.expiresAt
    || renewed.toEnvelope().v1().tx().cond().switch().name !== "precondTime") throw new Error("renewal identity or expiry differs");
  const oldBody = original.toEnvelope().v1().tx(); const newBody = renewed.toEnvelope().v1().tx();
  oldBody.cond(xdr.Preconditions.precondNone()); newBody.cond(xdr.Preconditions.precondNone());
  if (oldBody.toXDR("base64") !== newBody.toXDR("base64")) throw new Error("renewal may change time bounds only");
}

/** Keep only bounded public status codes, never Horizon's echoed envelope. */
export async function readCliBurnerSubmission(response: Response): Promise<CliBurnerSubmission> {
  const result: CliBurnerSubmission = { httpStatus: response.status };
  try {
    const raw = await boundedResponseJson(response, 16 * 1024) as { extras?: { result_codes?: { transaction?: unknown; operations?: unknown } } };
    const codes = raw?.extras?.result_codes;
    if (typeof codes?.transaction === "string" && RESULT_CODE.test(codes.transaction)) result.transactionCode = codes.transaction;
    if (Array.isArray(codes?.operations)) result.operationCodes = codes.operations.slice(0, 6).filter((code): code is string => typeof code === "string" && RESULT_CODE.test(code));
  } catch { /* Malformed, oversized, or non-JSON response: retain HTTP status only. */ }
  return result;
}

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
        || Object.keys(capability).some((field) => !["sessionId", "token", "signedFundingXdr", "submitAttempts", "renewal", "preflightRepair", "registeredSetupRepair"].includes(field))
        || (capability.submitAttempts !== undefined && (!Number.isSafeInteger(capability.submitAttempts) || capability.submitAttempts < 1 || capability.submitAttempts > 3))
        || (capability.signedFundingXdr !== undefined && (typeof capability.signedFundingXdr !== "string" || capability.signedFundingXdr.length > 131_072))) throw new Error();
      if (capability.renewal) {
        const renewal = capability.renewal; const original = renewal.original;
        if (renewal.version !== 1 || !original || !renewal.proof || renewal.proof.kind !== "expired-unused"
          || Object.keys(renewal).sort().join(",") !== "original,proof,version"
          || typeof original.preparedXdr !== "string" || original.preparedXdr.length > 100_000
          || typeof original.signedXdr !== "string" || original.signedXdr.length > 131_072
          || !/^[a-f0-9]{64}$/.test(original.hash) || !Number.isSafeInteger(original.expiresAt)
          || !Number.isSafeInteger(original.submitAttempts) || original.submitAttempts < 1 || original.submitAttempts > 3) throw new Error();
      } else if (capability.renewal !== undefined) throw new Error();
      if (capability.preflightRepair) {
        const repair = capability.preflightRepair;
        if (repair.version !== 1 || !repair.prior || !repair.proof || repair.proof.kind !== "funded-unstarted"
          || Object.keys(repair).sort().join(",") !== "prior,proof,version"
          || typeof repair.prior.logs !== "string" || Buffer.byteLength(repair.prior.logs) > 200 * 1024
          || !Number.isSafeInteger(repair.prior.finishedAt) || repair.prior.finishedAt <= 0
          || (repair.prior.error !== undefined && (typeof repair.prior.error !== "string" || Buffer.byteLength(repair.prior.error) > 4096))) throw new Error();
      } else if (capability.preflightRepair !== undefined) throw new Error();
      if (capability.registeredSetupRepair) {
        const repair = capability.registeredSetupRepair;
        if (!capability.preflightRepair || repair.version !== 1 || !repair.prior || !repair.proof
          || repair.proof.kind !== "registered-unspent" || repair.proof.registrationHash !== CLI_REGISTERED_SETUP_HASH
          || Object.keys(repair).sort().join(",") !== "prior,proof,version"
          || typeof repair.prior.logs !== "string" || Buffer.byteLength(repair.prior.logs) > 200 * 1024
          || !Number.isSafeInteger(repair.prior.finishedAt) || repair.prior.finishedAt <= 0) throw new Error();
      } else if (capability.registeredSetupRepair !== undefined) throw new Error();
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

  async function submitExact(row: CliTestRow, capability: Capability, attempt: number): Promise<void> {
    let report: CliBurnerSubmission | void = undefined;
    try { report = await deps.submit(capability.signedFundingXdr!); }
    catch { /* The exact envelope may have landed. No raw error is retained. */ }
    const details = [`Funding submission ${attempt}/3 for retained hash ${row.fundingHash}`];
    if (report && Number.isSafeInteger(report.httpStatus) && report.httpStatus! >= 100 && report.httpStatus! <= 599) details.push(`HTTP ${report.httpStatus}`);
    else details.push("network outcome unconfirmed");
    if (report && typeof report.transactionCode === "string" && RESULT_CODE.test(report.transactionCode)) details.push(report.transactionCode);
    if (report && Array.isArray(report.operationCodes)) details.push(...report.operationCodes.slice(0, 6).filter((code) => typeof code === "string" && RESULT_CODE.test(code)));
    // This diagnostic update cannot authorize a submission; the durable global
    // attempt claim already did that. CAS conflicts simply retain older logs.
    try {
      const latest = await store.read(row.id, capability.token);
      if (latest?.state === "funding" && latest.fundingHash === row.fundingHash) await store.update(row.id, capability.token, latest.version, { logs: `${latest.logs}\n${details.join("; ")}.\n` });
    } catch { /* Keep the journal and its attempt counter even if logging fails. */ }
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
        if (!job || ["succeeded", "blocked", "initializing"].includes(job.state)) return;
        const { capability, row } = await session(job);
        if (job.state === "failed") {
          const registered = Boolean(capability.preflightRepair && !capability.registeredSetupRepair && deps.proveRegisteredSetup && isRegisteredSetupCandidate(row));
          if (!registered && (capability.preflightRepair || !deps.proveUnstarted || !isUnstartedCandidate(row))) return;
          if (deps.now() <= row.finishedAt! + 600) { await deps.sleep(2_000); continue; }
          let proof: CliUnstartedProof | CliRegisteredSetupProof;
          try {
            if (registered) { proof = await deps.proveRegisteredSetup!(row); verifyCliRegisteredSetupProof(row, proof, deps.now()); }
            else { proof = await deps.proveUnstarted!(row); verifyCliPreflightRepairProof(row, proof, deps.now()); }
          }
          catch { await deps.sleep(2_000); continue; /* No proof failure permits recovery. */ }
          const prior = { logs: row.logs, finishedAt: row.finishedAt!, ...(row.error ? { error: row.error } : {}), ...(row.startedAt ? { startedAt: row.startedAt } : {}) };
          const repairCapability: Capability = proof.kind === "registered-unspent"
            ? { ...capability, registeredSetupRepair: { version: 1, prior, proof } }
            : { ...capability, preflightRepair: { version: 1, prior, proof } };
          // Funding is already confirmed. No build/sign/submit path is entered.
          // This marker is permanent even if a crash precedes the session update.
          const repairClaim = await transition(job, "funded", { sealed: seal(repairCapability), error: "" });
          if (!repairClaim) continue;
          job = repairClaim;
          let recovered = false;
          for (let retry = 0; retry < 3 && !recovered; retry++) {
            const fresh = await store.read(row.id, capability.token);
            if (!fresh || fresh.state !== "failed" || fresh.fundingHash !== row.fundingHash || fresh.finishedAt !== row.finishedAt
              || ["id", "owner", "payer", "agent", "merchant"].some((field) => fresh[field as "owner"] !== row[field as "owner"])) return;
            try {
              await store.update(row.id, capability.token, fresh.version, { state: "funded", error: "",
                logs: `${fresh.logs}\n${registered ? `Existing registration ${CLI_REGISTERED_SETUP_HASH} verified with no actor payment or allowance; resume its setup only.` : "Prior local signer refusal retained; all three actor sequences remain unused."} Prior packets expired at ledger ${proof.rpcLedger}. One guarded recovery claimed; no new funding.\n` });
              recovered = true;
            } catch { /* Retry only an unchanged failed session under this owned marker. */ }
          }
          if (!recovered) return;
          continue;
        }
        if (job.state === "prepared") {
          if (row.state !== "prepared" || !capability.signedFundingXdr) throw new Error("funding preparation state differs");
          deps.validate(row, capability.signedFundingXdr);
          const attemptCapability = { ...capability, submitAttempts: 1 };
          const fundingClaim = await transition(job, "funding", { sealed: seal(attemptCapability) });
          if (!fundingClaim) continue;
          job = fundingClaim;
          const fundingRow = await store.update(row.id, capability.token, row.version, { state: "funding" });
          await submitExact(fundingRow, attemptCapability, 1);
          continue;
        }
        if (job.state === "funding") {
          const latest = row.state === "funding" ? await deps.reconcile(row, capability.token) : row;
          if (latest.state === "funded") { await transition(job, "funded"); continue; }
          if (latest.state === "failed") { await transition(job, "failed", { error: "The exact funding transaction failed; this job will not repeat." }); return; }
          if (latest.state !== "funding") return;
          if (latest.fundingExpiresAt && deps.now() > latest.fundingExpiresAt && !capability.renewal
            && capability.signedFundingXdr && deps.proveUnused) {
            const proof = await deps.proveUnused(latest);
            (deps.verifyExpiredOriginal ?? verifiedRenewalOriginal)(latest, capability.signedFundingXdr, proof, deps.now());
            const renewalCapability: Capability = { ...capability, renewal: { version: 1,
              original: { preparedXdr: latest.fundingXdr!, signedXdr: capability.signedFundingXdr,
                hash: latest.fundingHash!, expiresAt: latest.fundingExpiresAt, submitAttempts: capability.submitAttempts ?? 1 }, proof } };
            // The permanent renewal marker and original evidence precede any
            // replacement signing. An interrupted initializing job cannot resume.
            const renewalClaim = await transition(job, "initializing", { sealed: seal(renewalCapability) });
            if (!renewalClaim) continue;
            job = renewalClaim;
            const funding = await deps.prepare(latest, capability.token, proof.originalSequence);
            (deps.verifyRenewal ?? verifyCliBurnerRenewal)(latest, capability.signedFundingXdr, funding, proof, deps.now());
            let prepared: CliTestRow | null = null;
            for (let retry = 0; retry < 3 && !prepared; retry++) {
              const fresh = await store.read(latest.id, capability.token);
              if (!fresh || fresh.state !== "funding" || fresh.fundingHash !== latest.fundingHash
                || ["id", "owner", "payer", "agent", "merchant"].some((field) => fresh[field as "owner"] !== latest[field as "owner"])) return;
              try {
                prepared = await store.update(fresh.id, capability.token, fresh.version, {
                  state: "prepared", fundingXdr: funding.preparedXdr, fundingHash: funding.hash, fundingExpiresAt: funding.expiresAt,
                  logs: `${fresh.logs}\nOriginal funding ${latest.fundingHash} proven expired and unused at ledger ${proof.rpcLedger}. One renewal of the same accounts and budget prepared: ${funding.hash}.\n`,
                });
              } catch { /* A late diagnostic write may advance only the old funding version. */ }
            }
            if (!prepared) return;
            const renewed = await transition(job, "prepared", { fundingHash: funding.hash, sealed: seal({
              sessionId: capability.sessionId, token: capability.token, signedFundingXdr: funding.signedXdr, renewal: renewalCapability.renewal,
            }) });
            if (!renewed) return;
            job = renewed;
            continue;
          }
          // Deployed records from before attempt journaling already crossed the
          // original submission boundary, so absent means one attempt, not zero.
          const attempts = capability.submitAttempts ?? 1;
          if (attempts < 3 && capability.signedFundingXdr) {
            await deps.sleep(2_000);
            deps.validate(latest, capability.signedFundingXdr);
            const attemptCapability = { ...capability, submitAttempts: attempts + 1 };
            const retryClaim = await transition(job, "funding", { sealed: seal(attemptCapability) });
            if (!retryClaim) continue;
            job = retryClaim;
            // Only the exact pre-existing envelope is retried. Its transaction
            // hash, sequence, signatures, actors, amount, and expiry never change.
            await submitExact(latest, attemptCapability, attempts + 1);
            continue;
          }
        } else if (job.state === "funded") {
          if (row.state !== "funded") return;
          const runClaim = await transition(job, "running");
          if (!runClaim) continue;
          job = runClaim;
          let running: CliTestRow | null = null;
          for (let retry = 0; retry < 3 && !running; retry++) {
            const fresh = await store.read(row.id, capability.token);
            if (!fresh || fresh.state !== "funded" || fresh.fundingHash !== row.fundingHash
              || ["id", "owner", "payer", "agent", "merchant"].some((field) => fresh[field as "owner"] !== row[field as "owner"])) return;
            try { running = await store.update(row.id, capability.token, fresh.version, { state: "running", startedAt: deps.now(), logs: `${fresh.logs}\nAuthorized one-off Mainnet run claimed.\n` }); }
            catch { /* Retry only this owned claim while the exact session remains funded. */ }
          }
          if (!running) return;
          deps.launch(running, capability.token, capability.registeredSetupRepair ? "registered-setup-repair-1" : capability.preflightRepair ? "preflight-repair-1" : undefined,
            capability.registeredSetupRepair?.proof.registrationHash);
          continue;
        } else if (job.state === "running") {
          if (row.state === "succeeded") { await transition(job, "succeeded"); return; }
          if (row.state === "failed") { await transition(job, "failed", { error: "The CLI stopped before completion; its evidence is retained for verification." }); continue; }
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
    prepare: async (row, token, originalSequence) => {
      const owner = loadCliTestBurner();
      const account = await ownerFundingSnapshot(CLI_TEST_BURNER_OWNER);
      if (originalSequence !== undefined && BigInt(account.sequenceNumber()) !== BigInt(originalSequence) - 1n) throw new Error("renewal source sequence changed before signing");
      const responses = await Promise.all([row.payer, row.agent, row.merchant].map((address) => fetch(`${CLI_MAINNET_HORIZON}/accounts/${address}`, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000) })));
      if (responses.some((response) => response.status !== 404)) throw new Error("fresh test accounts could not be verified");
      const keys = await store.secrets(row.id, token);
      const transaction = buildCliFunding(account, { payer: Keypair.fromSecret(keys.payer), agent: Keypair.fromSecret(keys.agent), merchant: Keypair.fromSecret(keys.merchant) });
      const preparedXdr = transaction.toXDR(); transaction.sign(owner);
      const signedXdr = transaction.toXDR();
      verifyCliFundingSigned(preparedXdr, signedXdr, CLI_TEST_BURNER_OWNER);
      return { preparedXdr, signedXdr, hash: transaction.hash().toString("hex"), expiresAt: Number(transaction.timeBounds!.maxTime) };
    },
    proveUnused: (row) => {
      if (!row.fundingXdr || !row.fundingHash || !row.fundingExpiresAt) throw new Error("missing original funding expiry context");
      return proveCliFundingExpiredUnused({ owner: row.owner, payer: row.payer, agent: row.agent, merchant: row.merchant,
        fundingXdr: row.fundingXdr, fundingHash: row.fundingHash, fundingExpiresAt: row.fundingExpiresAt });
    },
    proveUnstarted: (row) => {
      if (row.state !== "failed" || !row.finishedAt || !row.fundingHash) throw new Error("missing failed CLI preflight context");
      return proveCliTestUnstarted({ id: row.id, state: "failed", finishedAt: row.finishedAt, fundingHash: row.fundingHash,
        owner: row.owner, payer: row.payer, agent: row.agent, merchant: row.merchant });
    },
    proveRegisteredSetup: (row) => {
      if (!isRegisteredSetupCandidate(row)) throw new Error("missing registered CLI setup context");
      return proveCliRegisteredSetup({ id: row.id, state: "failed", finishedAt: row.finishedAt!, fundingHash: row.fundingHash!,
        owner: row.owner, payer: row.payer, agent: row.agent, merchant: row.merchant, registrationHash: CLI_REGISTERED_SETUP_HASH });
    },
    validate: (row, signedXdr) => {
      if (!row.fundingXdr || !row.fundingHash || row.owner !== CLI_TEST_BURNER_OWNER) throw new Error("missing exact funding context");
      const tx = verifyCliFundingSigned(row.fundingXdr, signedXdr, CLI_TEST_BURNER_OWNER);
      if (tx.hash().toString("hex") !== row.fundingHash || Number(tx.timeBounds!.maxTime) !== row.fundingExpiresAt) throw new Error("funding hash or expiry differs");
    },
    submit: async (signedXdr) => {
      const response = await fetch(`${CLI_MAINNET_HORIZON}/transactions`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ tx: signedXdr }), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20_000) });
      return readCliBurnerSubmission(response);
    },
    reconcile: (row, token) => reconcileFunding(store, row, token),
    launch: (row, token, attempt, registrationHash) => launchCliTest(store, row, token, attempt, registrationHash),
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

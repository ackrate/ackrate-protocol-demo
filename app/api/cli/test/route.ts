import { createHash, timingSafeEqual } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { cliChallenge, cliTestOrigin, verifyCliChallenge } from "../../../../lib/cli-test-auth";
import { CLI_TEST_SOURCE, CLI_TEST_VERSION, launchCliTest } from "../../../../lib/cli-test-runner";
import { CLI_TEST_TTL_SECONDS, createCliTestStore, type CliTestRow, type CliTestStore } from "../../../../lib/cli-test-store";
import {
  buildCliFunding, CLI_MAINNET_HORIZON, CLI_MAX_XDR_LENGTH, verifyCliFundingSigned,
} from "../../../../lib/cli-test-transactions";
import { CliTestNetworkError as PublicError, ownerFundingSnapshot, reconcileFunding } from "../../../../lib/cli-test-network";
import { createPostgresClient, type PostgresQueryable } from "../../../../lib/wallet/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HEADERS = { "cache-control": "no-store, max-age=0", "x-content-type-options": "nosniff", "x-robots-tag": "noindex, nofollow" };
const RELEASE = { version: CLI_TEST_VERSION, sourceCommit: CLI_TEST_SOURCE, publishedVersion: "0.2.0" };
const GAddress = z.string().refine(StrKey.isValidEd25519PublicKey);
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("challenge"), owner: GAddress }).strict(),
  z.object({ action: z.literal("prepare"), owner: GAddress, challengeToken: z.string().min(1).max(2048), signedXdr: z.string().min(1).max(12_000) }).strict(),
  z.object({ action: z.literal("fund"), signedXdr: z.string().min(1).max(CLI_MAX_XDR_LENGTH) }).strict(),
  z.object({ action: z.literal("run"), confirmRealUsdc: z.literal(true) }).strict(),
]);


interface Services { db: PostgresQueryable; store: CliTestStore; secret: string }
let cached: (Services & { databaseUrl: string }) | undefined;
let readiness: { services: Services; until: number; check: Promise<void> } | undefined;
let nonceInitialization: { db: PostgresQueryable; check: Promise<void> } | undefined;

function services(): Services {
  const secret = process.env.ACKRATE_SESSION_SECRET;
  const databaseUrl = process.env.DATABASE_URL;
  if (!secret || Buffer.byteLength(secret) < 32 || !databaseUrl
    || (process.env.NODE_ENV === "production" && !process.env.ACKRATE_APP_ORIGIN)) {
    throw new PublicError("The CLI test is not configured. No funding or payment was started.", 503);
  }
  if (!cached || cached.secret !== secret || cached.databaseUrl !== databaseUrl) {
    const db = createPostgresClient(databaseUrl);
    cached = { db, store: createCliTestStore(db, secret), secret, databaseUrl };
  }
  return cached;
}

async function requireReady(current: Services): Promise<void> {
  if (!readiness || readiness.services !== current || readiness.until <= Date.now()) {
    const check = (async () => {
      const rows = await current.db.query<{ ok: number }>("SELECT 1 AS ok");
      if (rows.length !== 1 || Number(rows[0]?.ok) !== 1) throw new Error("database readiness failed");
      const manifestPath = join(process.cwd(), "vendor", "cli-test-build.json");
      const bundlePath = join(process.cwd(), "vendor", "ackrate-cli-test.mjs");
      if ((await stat(manifestPath)).size > 16_384 || (await stat(bundlePath)).size > 16 * 1024 * 1024) throw new Error("invalid build size");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      if (manifest.version !== CLI_TEST_VERSION || manifest.sourceCommit !== CLI_TEST_SOURCE
        || typeof manifest.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(manifest.sha256)
        || createHash("sha256").update(await readFile(bundlePath)).digest("hex") !== manifest.sha256) throw new Error("invalid build identity");
    })();
    readiness = { services: current, until: Date.now() + 30_000, check };
  }
  try { await readiness.check; }
  catch { readiness = undefined; throw new PublicError("The CLI test build or storage is unavailable. No new funding or run can start.", 503); }
}

const cookieName = (kind: "session" | "challenge") => `${process.env.NODE_ENV === "production" ? "__Host-" : ""}ackrate_cli_test_${kind}`;
const cookieOptions = (maxAge: number) => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/", maxAge });

function cookie(request: Request, kind: "session" | "challenge"): string | null {
  const header = request.headers.get("cookie") ?? "";
  if (header.length > 16_384) return null;
  const matches = header.split(";").map((item) => item.trim()).filter((item) => item.startsWith(`${cookieName(kind)}=`));
  if (matches.length !== 1) return null;
  try { return decodeURIComponent(matches[0].slice(cookieName(kind).length + 1)); } catch { return null; }
}

function capability(request: Request): { id: string; token: string } | null {
  const value = cookie(request, "session");
  if (!value || !/^[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/.test(value)) return null;
  const [id, token] = value.split(".");
  return { id, token };
}

function sameToken(left: string | null, right: string): boolean {
  if (!left) return false;
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function parseBody(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new PublicError("Send a JSON test request.");
  const size = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(size) || size < 0 || size > 200 * 1024 || !request.body) throw new PublicError("The test request is too large or invalid.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 200 * 1024) { await reader.cancel(); throw new PublicError("The test request is too large."); }
      chunks.push(value);
    }
    return Body.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch (error) {
    if (error instanceof PublicError) throw error;
    throw new PublicError("The test request contains invalid or unsupported fields.");
  } finally { reader.releaseLock(); }
}


async function consumeNonce(db: PostgresQueryable, owner: string, nonce: string, expiresAt: number): Promise<void> {
  if (!nonceInitialization || nonceInitialization.db !== db) {
    const check = db.query(`CREATE TABLE IF NOT EXISTS ackrate_cli_test_auth_nonces (
      nonce text PRIMARY KEY, owner text NOT NULL, expires_at bigint NOT NULL, consumed_at bigint NOT NULL
    )`).then(() => undefined);
    nonceInitialization = { db, check };
  }
  try { await nonceInitialization.check; } catch { nonceInitialization = undefined; throw new Error("authentication storage unavailable"); }
  const rows = await db.query(`INSERT INTO ackrate_cli_test_auth_nonces (nonce, owner, expires_at, consumed_at)
    SELECT $1, $2, $3, $4 WHERE $3::bigint > $4::bigint ON CONFLICT (nonce) DO NOTHING RETURNING nonce`,
  [nonce, owner, expiresAt, Math.floor(Date.now() / 1000)]);
  if (rows.length !== 1) throw new PublicError("This ownership check was already used or expired. Connect again.", 409);
}


function status(run?: CliTestRow) { return { ready: true, ...RELEASE, ...(run ? { run } : {}) }; }
function reply(run?: CliTestRow) { return NextResponse.json(status(run), { headers: HEADERS }); }

export async function GET(request: Request) {
  try {
    const current = services();
    await requireReady(current);
    const auth = capability(request);
    const row = auth ? await current.store.read(auth.id, auth.token) : null;
    return reply(row && auth ? await reconcileFunding(current.store, row, auth.token) : undefined);
  } catch (error) {
    return NextResponse.json({ ready: false, ...RELEASE, error: error instanceof PublicError ? error.message : "The test status is unavailable. Existing funding and run records have not been reset." }, { status: 503, headers: HEADERS });
  }
}

export async function POST(request: Request) {
  let created: { id: string; token: string; row: CliTestRow } | undefined;
  let current: Services | undefined;
  try {
    try { cliTestOrigin(request); } catch { throw new PublicError("Open this test from its own application page.", 403); }
    const body = await parseBody(request);
    current = services();
    await requireReady(current);
    const auth = capability(request);
    let row = auth ? await current.store.read(auth.id, auth.token) : null;
    if (body.action === "challenge") {
      if (row) throw new PublicError("Keep the existing test session; a replacement run is not started automatically.", 409);
      const challenge = cliChallenge(body.owner, current.secret);
      const response = NextResponse.json(challenge, { headers: HEADERS });
      response.cookies.set(cookieName("challenge"), challenge.challengeToken, cookieOptions(300));
      return response;
    }
    if (body.action === "prepare") {
      if (row) throw new PublicError("An existing test session must not be replaced.", 409);
      if (!sameToken(cookie(request, "challenge"), body.challengeToken)) throw new PublicError("The ownership check does not belong to this browser. Connect again.", 401);
      let proof;
      try { proof = verifyCliChallenge(body.owner, body.challengeToken, body.signedXdr, current.secret); }
      catch { throw new PublicError("The signed ownership check is invalid or expired. Connect again.", 401); }
      const ownerAccount = await ownerFundingSnapshot(body.owner);
      await consumeNonce(current.db, body.owner, proof.nonce, proof.expiresAt);
      created = await current.store.create(body.owner);
      const actors = [created.row.payer, created.row.agent, created.row.merchant];
      const absent = await Promise.all(actors.map((address) => fetch(`${CLI_MAINNET_HORIZON}/accounts/${address}`, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000) })));
      if (actors.includes(body.owner) || absent.some((response) => response.status !== 404)) throw new Error("new actor readiness could not be verified");
      const generated = await current.store.secrets(created.id, created.token);
      const funding = buildCliFunding(ownerAccount, { payer: Keypair.fromSecret(generated.payer), agent: Keypair.fromSecret(generated.agent), merchant: Keypair.fromSecret(generated.merchant) });
      created.row = await current.store.update(created.id, created.token, created.row.version, {
        fundingXdr: funding.toXDR(), fundingHash: funding.hash().toString("hex"), fundingExpiresAt: Number(funding.timeBounds!.maxTime),
        logs: "Prepared three isolated test accounts. No funding or payment has been submitted.\n",
      });
      const response = reply(created.row);
      response.cookies.set(cookieName("session"), `${created.id}.${created.token}`, cookieOptions(CLI_TEST_TTL_SECONDS));
      response.cookies.set(cookieName("challenge"), "", cookieOptions(0));
      return response;
    }
    if (!auth || !row) throw new PublicError("The test session is missing or expired. No new action was started.", 401);
    if (body.action === "fund") {
      if (row.state === "funded" || row.state === "running" || row.state === "succeeded") return reply(row);
      if (row.state !== "prepared" && row.state !== "funding") throw new PublicError("This run cannot accept another funding submission.", 409);
      row = await reconcileFunding(current.store, row, auth.token);
      if (row.state !== "prepared" && row.state !== "funding") return reply(row);
      if (!row.fundingXdr || !row.fundingHash || !row.fundingExpiresAt) throw new PublicError("This run has no complete prepared funding transaction.", 409);
      let signed;
      try {
        signed = verifyCliFundingSigned(row.fundingXdr, body.signedXdr, row.owner);
        if (signed.hash().toString("hex") !== row.fundingHash
          || Number(signed.timeBounds!.maxTime) !== row.fundingExpiresAt) throw new Error("funding identity mismatch");
      } catch { throw new PublicError("Freighter must sign the exact unexpired prepared funding transaction. No replacement was submitted."); }
      // Also CAS an explicit same-hash retry: a stale prepared/funding reader
      // cannot authorize a submission after another request advances the row.
      row = await current.store.update(row.id, auth.token, row.version, { state: "funding" });
      try {
        const response = await fetch(`${CLI_MAINNET_HORIZON}/transactions`, {
          method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ tx: signed.toXDR() }), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20_000),
        });
        await response.body?.cancel();
      } catch { /* Submission may have landed. Retain funding and its exact hash. */ }
      return reply(await reconcileFunding(current.store, row, auth.token));
    }
    if (row.state !== "funded") throw new PublicError("Only a confirmed funded test can start. Running or failed tests are never restarted automatically.", 409);
    row = await current.store.update(row.id, auth.token, row.version, { state: "running", startedAt: Math.floor(Date.now() / 1000), logs: `${row.logs}\nReal-USDC run explicitly confirmed.\n` });
    launchCliTest(current.store, row, auth.token);
    return reply(row);
  } catch (error) {
    if (created && current) {
      try { created.row = await current.store.update(created.id, created.token, created.row.version, { state: "failed", error: "Preparation stopped before funding. Preserve this test session; no payment was submitted.", finishedAt: Math.floor(Date.now() / 1000) }); } catch { /* Retain its original state. */ }
    }
    const response = NextResponse.json({ ready: !(error instanceof PublicError && error.status === 503), ...RELEASE,
      ...(created ? { run: created.row } : {}), error: error instanceof PublicError ? error.message : "The request could not complete. Refresh the saved test status before taking another action; no automatic retry was started." },
    { status: error instanceof PublicError ? error.status : 409, headers: HEADERS });
    if (created) response.cookies.set(cookieName("session"), `${created.id}.${created.token}`, cookieOptions(CLI_TEST_TTL_SECONDS));
    return response;
  }
}

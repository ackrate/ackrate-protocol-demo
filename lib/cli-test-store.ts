import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, randomUUID } from "node:crypto";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import type { QueryResultRow } from "pg";
import type { PostgresQueryable } from "./wallet/postgres";

export type CliTestState = "prepared" | "funding" | "funded" | "running" | "succeeded" | "failed";
export interface CliTestRow {
  id: string;
  owner: string;
  version: number;
  state: CliTestState;
  payer: string;
  agent: string;
  merchant: string;
  fundingXdr?: string;
  fundingHash?: string;
  fundingExpiresAt?: number;
  logs: string;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}
export type CliTestPatch = Partial<Pick<CliTestRow,
  "state" | "fundingXdr" | "fundingHash" | "fundingExpiresAt" | "logs" | "error" | "startedAt" | "finishedAt"
>>;
export interface CliTestSecrets { payer: string; agent: string; merchant: string }

export const CLI_TEST_TTL_SECONDS = 24 * 60 * 60;
const PURPOSE = "ackrate/cli-test/encrypted-keys/v1";
const PUBLIC_COLUMNS = "id, owner, version, state, payer, agent, merchant, public_data, created_at, updated_at, expires_at";
const STATES: readonly CliTestState[] = ["prepared", "funding", "funded", "running", "succeeded", "failed"];
const PATCH_KEYS = ["state", "fundingXdr", "fundingHash", "fundingExpiresAt", "logs", "error", "startedAt", "finishedAt"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECRET_PATTERN = /\bS[A-Z2-7]{55}\b/;
const nowSeconds = () => Math.floor(Date.now() / 1_000);
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function authorization(id: string, token: string): { id: string; hash: string } | null {
  if (!UUID.test(id) || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const bytes = Buffer.from(token, "base64url");
  if (bytes.length !== 32 || bytes.toString("base64url") !== token) return null;
  return { id: id.toLowerCase(), hash: hashToken(token) };
}

function integer(value: unknown): number {
  const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isSafeInteger(parsed) || parsed < 0) throw new Error("invalid CLI test record");
  return parsed;
}

function validatePatch(input: unknown): CliTestPatch {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid CLI test update");
  const patch = input as Record<string, unknown>;
  if (Object.keys(patch).some((key) => !PATCH_KEYS.includes(key) || patch[key] === undefined)) throw new Error("immutable or unknown CLI test field");
  if ("state" in patch && !STATES.includes(patch.state as CliTestState)) throw new Error("invalid CLI test state");
  for (const key of ["fundingExpiresAt", "startedAt", "finishedAt"]) {
    if (key in patch && (typeof patch[key] !== "number" || integer(patch[key]) <= 0)) throw new Error("invalid CLI test timestamp");
  }
  for (const [key, limit] of [["logs", 200 * 1024], ["error", 4096], ["fundingXdr", 100_000]] as const) {
    const value = patch[key];
    if (key in patch && (typeof value !== "string" || Buffer.byteLength(value) > limit || value.includes("\0") || SECRET_PATTERN.test(value))) {
      throw new Error("invalid or sensitive CLI test text");
    }
  }
  if ("fundingHash" in patch && (typeof patch.fundingHash !== "string" || !/^[0-9a-f]{64}$/.test(patch.fundingHash))) {
    throw new Error("invalid CLI test funding hash");
  }
  return { ...patch } as CliTestPatch;
}

function publicRow(row: QueryResultRow): CliTestRow {
  const data = validatePatch(row.public_data);
  if ("state" in data || typeof data.logs !== "string" || !STATES.includes(row.state)
    || !UUID.test(row.id) || ![row.owner, row.payer, row.agent, row.merchant].every((key) => typeof key === "string" && StrKey.isValidEd25519PublicKey(key))
    || new Set([row.payer, row.agent, row.merchant]).size !== 3) throw new Error("invalid CLI test record");
  return {
    ...data,
    id: row.id, owner: row.owner, version: integer(row.version), state: row.state,
    payer: row.payer, agent: row.agent, merchant: row.merchant, logs: data.logs,
    createdAt: integer(row.created_at), updatedAt: integer(row.updated_at), expiresAt: integer(row.expires_at),
  };
}

function binding(row: Pick<CliTestRow, "id" | "owner" | "payer" | "agent" | "merchant">): Buffer {
  return Buffer.from(JSON.stringify([PURPOSE, row.id, row.owner, row.payer, row.agent, row.merchant]));
}

/** Server-only. The caller authenticates owner before create and keeps token in an HttpOnly cookie.
 * No fallback storage: every successful method depends on the supplied PostgreSQL client.
 */
export function createCliTestStore(client: PostgresQueryable, secret: string) {
  if (!client || typeof client.query !== "function") throw new Error("CLI test PostgreSQL storage is required");
  if (typeof secret !== "string" || Buffer.byteLength(secret) < 32) throw new Error("CLI test encryption requires a configured session secret of at least 32 bytes");
  const encryptionKey = Buffer.from(hkdfSync("sha256", secret, "ackrate-cli-test-hkdf-v1", PURPOSE, 32));
  let initialization: Promise<void> | undefined;

  async function initialize(): Promise<void> {
    initialization ??= (async () => {
      await client.query(`CREATE TABLE IF NOT EXISTS ackrate_cli_test_owners (
        owner text PRIMARY KEY, created_times bigint[] NOT NULL CHECK (cardinality(created_times) <= 3)
      )`);
      await client.query(`CREATE TABLE IF NOT EXISTS ackrate_cli_test_runs (
        id text PRIMARY KEY, owner text NOT NULL, token_hash text NOT NULL,
        version integer NOT NULL CHECK (version >= 0),
        state text NOT NULL CHECK (state IN ('prepared', 'funding', 'funded', 'running', 'succeeded', 'failed')),
        payer text NOT NULL, agent text NOT NULL, merchant text NOT NULL,
        public_data jsonb NOT NULL, encrypted_secrets jsonb NOT NULL,
        created_at bigint NOT NULL, updated_at bigint NOT NULL, expires_at bigint NOT NULL,
        CHECK (expires_at = created_at + 86400), CHECK (payer <> agent AND payer <> merchant AND agent <> merchant)
      )`);
    })().catch((error) => { initialization = undefined; throw error; });
    await initialization;
  }

  return {
    async create(owner: string): Promise<{ id: string; token: string; row: CliTestRow }> {
      if (!StrKey.isValidEd25519PublicKey(owner)) throw new Error("valid CLI test owner is required");
      await initialize();
      const id = randomUUID();
      const token = randomBytes(32).toString("base64url");
      const keys = { payer: Keypair.random(), agent: Keypair.random(), merchant: Keypair.random() };
      const actors = { id, owner, payer: keys.payer.publicKey(), agent: keys.agent.publicKey(), merchant: keys.merchant.publicKey() };
      const plaintext = Buffer.from(JSON.stringify({ payer: keys.payer.secret(), agent: keys.agent.secret(), merchant: keys.merchant.secret() }));
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
      cipher.setAAD(binding(actors));
      let encrypted: Buffer;
      try { encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]); }
      finally { plaintext.fill(0); }
      const sealed = { version: 1, iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"), ciphertext: encrypted.toString("base64url") };
      const now = nowSeconds();
      // ON CONFLICT serializes the per-owner row and rechecks its current array.
      // Rate reservation and insertion commit together; no read/check/insert race.
      const rows = await client.query(`WITH reservation AS (
        INSERT INTO ackrate_cli_test_owners (owner, created_times) VALUES ($2, ARRAY[$10::bigint])
        ON CONFLICT (owner) DO UPDATE SET created_times =
          ARRAY(SELECT t FROM unnest(ackrate_cli_test_owners.created_times) AS t WHERE t > $10::bigint - 3600) || $10::bigint
        WHERE cardinality(ARRAY(SELECT t FROM unnest(ackrate_cli_test_owners.created_times) AS t WHERE t > $10::bigint - 3600)) < 3
        RETURNING owner
      ) INSERT INTO ackrate_cli_test_runs
        (id, owner, token_hash, version, state, payer, agent, merchant, public_data, encrypted_secrets, created_at, updated_at, expires_at)
        SELECT $1, $2, $3, 0, 'prepared', $4, $5, $6, $7::jsonb, $8::jsonb, $10, $10, $9
        FROM reservation RETURNING ${PUBLIC_COLUMNS}`,
      [id, owner, hashToken(token), actors.payer, actors.agent, actors.merchant, JSON.stringify({ logs: "" }), JSON.stringify(sealed), now + CLI_TEST_TTL_SECONDS, now]);
      if (rows.length !== 1) throw new Error("CLI test creation limit reached; existing sessions remain accessible");
      return { id, token, row: publicRow(rows[0]) };
    },

    async read(id: string, token: string): Promise<CliTestRow | null> {
      const auth = authorization(id, token);
      if (!auth) return null;
      await initialize();
      const rows = await client.query(`SELECT ${PUBLIC_COLUMNS} FROM ackrate_cli_test_runs
        WHERE id = $1 AND token_hash = $2 AND expires_at > $3 LIMIT 1`, [auth.id, auth.hash, nowSeconds()]);
      return rows.length === 1 ? publicRow(rows[0]) : null;
    },

    async update(id: string, token: string, expectedVersion: number, input: CliTestPatch): Promise<CliTestRow> {
      const auth = authorization(id, token);
      if (!auth || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || expectedVersion >= 2_147_483_647) throw new Error("invalid CLI test update authorization");
      const { state, ...patch } = validatePatch(input);
      await initialize();
      const rows = await client.query(`UPDATE ackrate_cli_test_runs
        SET state = COALESCE($4::text, state), public_data = public_data || $5::jsonb,
            version = version + 1, updated_at = $6
        WHERE id = $1 AND token_hash = $2 AND version = $3 AND expires_at > $6
        RETURNING ${PUBLIC_COLUMNS}`,
      [auth.id, auth.hash, expectedVersion, state ?? null, JSON.stringify(patch), nowSeconds()]);
      if (rows.length !== 1) throw new Error("CLI test update rejected: session unavailable or version changed");
      return publicRow(rows[0]);
    },

    /** Returns generated seeds only to server code with this session's capability. Never serialize this result. */
    async secrets(id: string, token: string): Promise<CliTestSecrets> {
      const auth = authorization(id, token);
      if (!auth) throw new Error("CLI test session unavailable");
      await initialize();
      const rows = await client.query(`SELECT ${PUBLIC_COLUMNS}, encrypted_secrets FROM ackrate_cli_test_runs
        WHERE id = $1 AND token_hash = $2 AND expires_at > $3 LIMIT 1`, [auth.id, auth.hash, nowSeconds()]);
      if (rows.length !== 1) throw new Error("CLI test session unavailable");
      try {
        const row = publicRow(rows[0]);
        const sealed = rows[0].encrypted_secrets;
        if (!sealed || Object.keys(sealed).sort().join(",") !== "ciphertext,iv,tag,version" || sealed.version !== 1) throw new Error();
        const decode = (value: unknown, size?: number) => {
          if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
          const result = Buffer.from(value, "base64url");
          if (result.toString("base64url") !== value || (size !== undefined && result.length !== size)) throw new Error();
          return result;
        };
        const decipher = createDecipheriv("aes-256-gcm", encryptionKey, decode(sealed.iv, 12));
        decipher.setAAD(binding(row));
        decipher.setAuthTag(decode(sealed.tag, 16));
        const plaintext = Buffer.concat([decipher.update(decode(sealed.ciphertext)), decipher.final()]);
        let result: CliTestSecrets;
        try { result = JSON.parse(plaintext.toString("utf8")); } finally { plaintext.fill(0); }
        if (Object.keys(result).sort().join(",") !== "agent,merchant,payer") throw new Error();
        for (const role of ["payer", "agent", "merchant"] as const) {
          if (Keypair.fromSecret(result[role]).publicKey() !== row[role]) throw new Error();
        }
        return result;
      } catch { throw new Error("CLI test key recovery failed"); }
    },
  };
}

export type CliTestStore = ReturnType<typeof createCliTestStore>;

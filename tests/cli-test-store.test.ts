import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import type { QueryResultRow } from "pg";
import { CLI_TEST_TTL_SECONDS, createCliTestStore, type CliTestPatch } from "../lib/cli-test-store";
import type { PostgresQueryable } from "../lib/wallet/postgres";

const TEST_SECRET = "test-only-cli-session-encryption-key-32-bytes";
const owner = Keypair.random().publicKey();

/** Atomic-query model, not a PostgreSQL integration or financial test. */
class FakePostgres implements PostgresQueryable {
  calls: Array<{ text: string; values: readonly unknown[] }> = [];
  rows = new Map<string, QueryResultRow>();
  owners = new Map<string, number[]>();
  initializationFailures = 0;
  unavailable = false;

  async query<Row extends QueryResultRow = QueryResultRow>(text: string, values: readonly unknown[] = []): Promise<ReadonlyArray<Row>> {
    const sql = text.replace(/\s+/g, " ").trim();
    this.calls.push({ text: sql, values: structuredClone(values) });
    if (this.unavailable) throw new Error("test database unavailable");
    if (sql.startsWith("CREATE TABLE")) {
      if (this.initializationFailures-- > 0) throw new Error("test initialization failure");
      return [];
    }
    if (sql.startsWith("WITH reservation AS")) {
      const [id, actorOwner, tokenHash, payer, agent, merchant, data, encrypted, expiresAt, now] = values;
      const recent = (this.owners.get(String(actorOwner)) ?? []).filter((time) => time > Number(now) - 3600);
      if (recent.length >= 3) return [];
      this.owners.set(String(actorOwner), [...recent, Number(now)]);
      const row = {
        id, owner: actorOwner, token_hash: tokenHash, payer, agent, merchant,
        public_data: JSON.parse(String(data)), encrypted_secrets: JSON.parse(String(encrypted)),
        version: 0, state: "prepared", created_at: now, updated_at: now, expires_at: expiresAt,
      };
      this.rows.set(String(id), row);
      return [structuredClone(row)] as unknown as Row[];
    }
    const row = this.rows.get(String(values[0]));
    if (sql.startsWith("SELECT")) {
      if (!row || row.token_hash !== values[1] || row.expires_at <= Number(values[2])) return [];
      const copy = structuredClone(row);
      if (!sql.includes(", encrypted_secrets FROM")) delete copy.encrypted_secrets;
      delete copy.token_hash;
      return [copy] as Row[];
    }
    if (sql.startsWith("UPDATE ackrate_cli_test_runs")) {
      if (!row || row.token_hash !== values[1] || row.version !== values[2] || row.expires_at <= Number(values[5])) return [];
      row.state = values[3] ?? row.state;
      row.public_data = { ...row.public_data, ...JSON.parse(String(values[4])) };
      row.version += 1;
      row.updated_at = values[5];
      return [structuredClone(row)] as Row[];
    }
    throw new Error("unexpected test SQL");
  }
}

test("creation generates distinct keys, stores ciphertext and token hash, and returns public fields only", async () => {
  const db = new FakePostgres();
  const store = createCliTestStore(db, TEST_SECRET);
  assert.equal(db.calls.length, 0, "schema initialization is lazy");
  const session = await store.create(owner);
  const saved = db.rows.get(session.id)!;
  const secrets = await store.secrets(session.id, session.token);
  assert.equal(session.row.owner, owner);
  assert.equal(session.row.version, 0);
  assert.equal(session.row.state, "prepared");
  assert.equal(session.row.expiresAt - session.row.createdAt, CLI_TEST_TTL_SECONDS);
  assert.equal(new Set([session.row.payer, session.row.agent, session.row.merchant]).size, 3);
  assert.deepEqual(Object.keys(session.row).sort(), ["id", "owner", "version", "state", "payer", "agent", "merchant", "logs", "createdAt", "updatedAt", "expiresAt"].sort());
  for (const role of ["payer", "agent", "merchant"] as const) {
    assert.equal(Keypair.fromSecret(secrets[role]).publicKey(), session.row[role]);
    assert.ok(!JSON.stringify(saved).includes(secrets[role]));
    assert.ok(!JSON.stringify(session.row).includes(secrets[role]));
    assert.ok(!JSON.stringify(db.calls).includes(secrets[role]));
  }
  assert.equal(saved.token_hash, createHash("sha256").update(session.token).digest("hex"));
  assert.ok(!JSON.stringify(saved).includes(session.token));
  assert.equal(Buffer.from(saved.encrypted_secrets.iv, "base64url").length, 12);
  assert.equal(Buffer.from(saved.encrypted_secrets.tag, "base64url").length, 16);
  const restarted = createCliTestStore(db, TEST_SECRET);
  assert.deepEqual(await restarted.secrets(session.id, session.token), secrets);
  assert.deepEqual(await restarted.read(session.id, session.token), session.row);
});

test("wrong key, modified ciphertext, and row-swapped encrypted keys all fail closed", async () => {
  const db = new FakePostgres();
  const store = createCliTestStore(db, TEST_SECRET);
  const first = await store.create(owner);
  const second = await store.create(owner);
  assert.notEqual(db.rows.get(first.id)!.encrypted_secrets.iv, db.rows.get(second.id)!.encrypted_secrets.iv);
  await assert.rejects(createCliTestStore(db, `${TEST_SECRET}-different`).secrets(first.id, first.token), /key recovery failed/);
  const saved = db.rows.get(first.id)!;
  const original = structuredClone(saved.encrypted_secrets);
  saved.encrypted_secrets = structuredClone(db.rows.get(second.id)!.encrypted_secrets);
  await assert.rejects(store.secrets(first.id, first.token), /key recovery failed/);
  saved.encrypted_secrets = original;
  const bytes = Buffer.from(saved.encrypted_secrets.ciphertext, "base64url");
  bytes[0] ^= 1;
  saved.encrypted_secrets.ciphertext = bytes.toString("base64url");
  await assert.rejects(store.secrets(first.id, first.token), /key recovery failed/);
  assert.equal((await store.read(first.id, first.token))?.id, first.id, "public reads never need to decrypt keys");
});

test("invalid, absent, and cross-session capabilities cannot read, update, or recover keys", async () => {
  const db = new FakePostgres();
  const store = createCliTestStore(db, TEST_SECRET);
  const first = await store.create(owner);
  const second = await store.create(owner);
  for (const token of ["", "malformed", second.token]) {
    assert.equal(await store.read(first.id, token), null);
    await assert.rejects(store.secrets(first.id, token), /unavailable/);
    await assert.rejects(store.update(first.id, token, 0, { state: "running" }), /authorization|rejected/);
  }
  assert.equal(await store.read("invalid-id", first.token), null);
  assert.equal((await store.read(first.id, first.token))?.version, 0);
  for (const call of db.calls.filter((call) => /^(SELECT|UPDATE)/.test(call.text))) {
    assert.match(call.text, /id = \$1 AND token_hash = \$2/);
    assert.match(call.text, /expires_at > \$/);
    assert.ok(!call.text.includes(first.token));
  }
});

test("optimistic updates have one winner and keep immutable identities and encrypted keys unchanged", async () => {
  const db = new FakePostgres();
  const store = createCliTestStore(db, TEST_SECRET);
  const session = await store.create(owner);
  const originalCiphertext = structuredClone(db.rows.get(session.id)!.encrypted_secrets);
  const results = await Promise.allSettled([
    store.update(session.id, session.token, 0, { state: "funding", logs: "request prepared", fundingHash: "a".repeat(64) }),
    store.update(session.id, session.token, 0, { state: "running", logs: "stale request" }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  const current = (await store.read(session.id, session.token))!;
  assert.equal(current.version, 1);
  assert.equal(current.logs, "request prepared");
  assert.equal(current.payer, session.row.payer);
  assert.equal(current.fundingHash, "a".repeat(64));
  assert.deepEqual(db.rows.get(session.id)!.encrypted_secrets, originalCiphertext);
  assert.match(db.calls.find((call) => call.text.startsWith("UPDATE"))!.text, /AND version = \$3 AND expires_at > \$6/);
  const updated = await store.update(session.id, session.token, current.version, { state: "funded", logs: "funding confirmed" });
  assert.equal(updated.version, 2);
  assert.equal(updated.fundingHash, current.fundingHash, "partial updates preserve prior public evidence");
});

test("unknown, immutable, oversized, malformed, and secret-bearing patches are rejected before writes", async () => {
  const db = new FakePostgres();
  const store = createCliTestStore(db, TEST_SECRET);
  const session = await store.create(owner);
  const secrets = await store.secrets(session.id, session.token);
  const patches = [
    { owner }, { payer: owner }, { id: session.id }, { version: 8 }, { expiresAt: 9999999999 },
    { encrypted_secrets: "replace" }, { token_hash: "replace" }, { state: "unknown" },
    { logs: "x".repeat(200 * 1024 + 1) }, { error: "x".repeat(4097) }, { fundingXdr: "x".repeat(100_001) },
    { logs: secrets.payer }, { error: `failure ${secrets.agent}` }, { logs: "nul\0byte" },
    { startedAt: NaN }, { fundingExpiresAt: -1 }, { finishedAt: "123" }, { fundingHash: "not-a-hash" },
    { state: undefined },
  ];
  const before = db.calls.length;
  for (const patch of patches) await assert.rejects(store.update(session.id, session.token, 0, patch as CliTestPatch));
  assert.equal(db.calls.length, before);
  assert.equal(db.rows.get(session.id)!.version, 0);
});

test("a valid capability cannot replace authenticated ownership or any generated public identity", async () => {
  const db = new FakePostgres();
  const store = createCliTestStore(db, TEST_SECRET);
  const session = await store.create(owner);
  const otherOwner = Keypair.random().publicKey();
  const before = db.calls.length;
  for (const field of ["owner", "payer", "agent", "merchant"]) {
    await assert.rejects(store.update(session.id, session.token, 0, { [field]: otherOwner } as CliTestPatch), /immutable or unknown/);
  }
  assert.equal(db.calls.length, before, "identity substitution never reaches SQL");
  assert.deepEqual(await store.read(session.id, session.token), session.row);
  // A polluted public-data object cannot shadow the separately stored owner.
  db.rows.get(session.id)!.public_data.owner = otherOwner;
  await assert.rejects(store.read(session.id, session.token), /immutable or unknown/);
});

test("24-hour expiry blocks reads, writes, and secret recovery without deleting retained evidence", async (t) => {
  let now = 1_900_000_000;
  t.mock.method(Date, "now", () => now * 1_000);
  const db = new FakePostgres();
  const store = createCliTestStore(db, TEST_SECRET);
  const session = await store.create(owner);
  now += CLI_TEST_TTL_SECONDS - 1;
  assert.ok(await store.read(session.id, session.token));
  now += 1;
  assert.equal(await store.read(session.id, session.token), null);
  await assert.rejects(store.update(session.id, session.token, 0, { state: "running" }), /rejected/);
  await assert.rejects(store.secrets(session.id, session.token), /unavailable/);
  assert.equal(db.rows.size, 1);
  assert.ok(db.rows.get(session.id)!.encrypted_secrets);
});

test("atomic rolling-hour limit admits three concurrent creations and leaves existing sessions accessible", async (t) => {
  let now = 1_900_000_000;
  t.mock.method(Date, "now", () => now * 1_000);
  const db = new FakePostgres();
  const store = createCliTestStore(db, TEST_SECRET);
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => store.create(owner)));
  const created = results.filter((result) => result.status === "fulfilled");
  assert.equal(created.length, 3);
  assert.equal(db.rows.size, 3);
  assert.equal(db.calls.filter((call) => call.text.startsWith("CREATE TABLE")).length, 2);
  const first = created[0];
  assert.equal(first.status, "fulfilled");
  if (first.status !== "fulfilled") return;
  assert.ok(await store.read(first.value.id, first.value.token));
  await store.update(first.value.id, first.value.token, 0, { logs: "still accessible after rate limit" });
  assert.ok(await store.create(Keypair.random().publicKey()), "limits are isolated per authenticated owner");
  now += 3599;
  await assert.rejects(store.create(owner), /limit reached/);
  now += 1;
  assert.ok(await store.create(owner));
  const creation = db.calls.find((call) => call.text.startsWith("WITH reservation AS"))!;
  assert.match(creation.text, /ON CONFLICT \(owner\) DO UPDATE SET created_times/);
  assert.match(creation.text, /WHERE cardinality\(ARRAY\(SELECT t FROM unnest/);
  assert.match(creation.text, /FROM reservation RETURNING/);
  assert.ok(!creation.text.includes(owner));
});

test("missing configuration, unavailable PostgreSQL, and failed initialization never fall back to memory", async () => {
  const db = new FakePostgres();
  assert.throws(() => createCliTestStore(null as unknown as PostgresQueryable, TEST_SECRET), /PostgreSQL storage is required/);
  assert.throws(() => createCliTestStore(db, "short"), /configured session secret/);
  const store = createCliTestStore(db, TEST_SECRET);
  await assert.rejects(store.create("invalid-owner"), /valid CLI test owner/);
  assert.equal(db.calls.length, 0);
  db.initializationFailures = 1;
  await assert.rejects(store.create(owner), /initialization failure/);
  const session = await store.create(owner);
  db.unavailable = true;
  await assert.rejects(store.read(session.id, session.token), /database unavailable/);
  await assert.rejects(store.secrets(session.id, session.token), /database unavailable/);
  await assert.rejects(store.update(session.id, session.token, 0, { state: "funded" }), /database unavailable/);
  assert.equal(db.rows.get(session.id)!.version, 0);
});

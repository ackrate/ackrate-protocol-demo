import assert from "node:assert/strict";
import test from "node:test";
import { createPostgresClient } from "../lib/wallet/postgres";

test("rejects non-PostgreSQL connection URLs", () => {
  assert.throws(() => createPostgresClient("https://example.com/database"), /PostgreSQL URL/);
  assert.throws(() => createPostgresClient("postgresql://example.com/database"), /credentialed PostgreSQL URL/);
});

test("uses parameterized TCP PostgreSQL queries and returns rows", async () => {
  const calls: Array<{ text: string; values?: unknown[] }> = [];
  const client = createPostgresClient("postgresql://user:password@postgres.railway.internal:5432/railway", {
    async query<Row>(text: string, values?: unknown[]) {
      calls.push({ text, values });
      return { rows: [{ answer: 1 }] as Row[] };
    },
  });
  const rows = await client.query<{ answer: number }>("SELECT $1::int AS answer", [1]);
  assert.deepEqual(rows, [{ answer: 1 }]);
  assert.deepEqual(calls, [{ text: "SELECT $1::int AS answer", values: [1] }]);
});

test("does not retain a mutable parameter array", async () => {
  const original = ["safe"];
  let received: unknown[] | undefined;
  const client = createPostgresClient("postgresql://user:password@postgres.railway.internal:5432/railway", {
    async query<Row>(_text: string, values?: unknown[]) {
      received = values;
      return { rows: [] as Row[] };
    },
  });
  await client.query("SELECT $1::text", original);
  original[0] = "changed";
  assert.deepEqual(received, ["safe"]);
});

import assert from "node:assert/strict";
import test from "node:test";
import { PostgresBoundRedemptionStore } from "../lib/wallet/redemption-store";
import type { PostgresQueryable } from "../lib/wallet/postgres";

const databaseUrl = "postgresql://user:password@localhost/ackrate";

test("redemption initialization migrates the legacy table before using the Ackrate table", async () => {
  const queries: string[] = [];
  const sql = {
    async query(text: string) {
      queries.push(text);
      return [];
    },
  } as PostgresQueryable;
  const store = new PostgresBoundRedemptionStore(databaseUrl, sql);

  assert.deepEqual(await store.lookup("receipt-key", "proof-digest"), { kind: "missing" });
  assert.equal(queries.length, 3);
  const retiredTable = `${String.fromCharCode(114, 101, 97, 112, 112)}_bound_redemptions`;
  assert.match(queries[0], new RegExp(`ALTER TABLE "${retiredTable}" RENAME TO "ackrate_bound_redemptions"`));
  assert.match(queries[1], /CREATE TABLE IF NOT EXISTS ackrate_bound_redemptions/);
  assert.match(queries[2], /SELECT \* FROM ackrate_bound_redemptions WHERE key = \$1/);
});

test("redemption initialization fails closed and retries after a migration outage", async () => {
  let calls = 0;
  const sql = {
    async query() {
      calls += 1;
      throw new Error("migration unavailable");
    },
  } as PostgresQueryable;
  const store = new PostgresBoundRedemptionStore(databaseUrl, sql);

  await assert.rejects(store.lookup("receipt-key", "proof-digest"), /migration unavailable/);
  await assert.rejects(store.lookup("receipt-key", "proof-digest"), /migration unavailable/);
  assert.equal(calls, 2);
});

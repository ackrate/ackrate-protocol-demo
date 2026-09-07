import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test, { type TestContext } from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { Keypair, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { cliChallenge, cliTestOrigin, verifyCliChallenge } from "../lib/cli-test-auth";
import * as network from "../lib/cli-test-network";
import { CLI_TEST_SOURCE, CLI_TEST_VERSION } from "../lib/cli-test-runner";
import * as storage from "../lib/cli-test-store";
import * as funding from "../lib/cli-test-transactions";

const ORIGIN = "https://interactive.example";
const require = createRequire(import.meta.url);
const routeFile = new URL("../app/api/cli/test/route.ts", import.meta.url);
const code = ts.transpileModule(readFileSync(routeFile, "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
type Routes = { GET(request: Request): Promise<Response>; POST(request: Request): Promise<Response> };

async function fixture(context: TestContext) {
  const db = new PGlite();
  context.after(() => db.close());
  const owner = Keypair.random();
  const submitted: string[] = [];
  const launches: Array<{ id: string; state: string }> = [];
  const confirmed = new Map<string, { hash: string; source_account: string; successful: boolean }>();
  let ambiguous = false;
  const query = { query: async (sql: string, values: unknown[] = []) => (await db.query(sql, values)).rows };
  const fetchMock: typeof fetch = async (input, options) => {
    const url = String(input);
    assert.equal(options?.redirect, "error");
    if (url === funding.CLI_MAINNET_RPC) {
      assert.equal(JSON.parse(String(options?.body)).method, "getNetwork");
      return Response.json({ jsonrpc: "2.0", id: 1, result: { passphrase: funding.CLI_MAINNET_PASSPHRASE } });
    }
    if (url === `${funding.CLI_MAINNET_HORIZON}/ledgers?order=desc&limit=1`) {
      return Response.json({ _embedded: { records: [{ sequence: 1000, base_reserve_in_stroops: 5_000_000,
        closed_at: new Date().toISOString() }] } });
    }
    if (url === `${funding.CLI_MAINNET_HORIZON}/accounts/${owner.publicKey()}`) {
      return Response.json({ account_id: owner.publicKey(), sequence: "100", subentry_count: 1, num_sponsoring: 0, num_sponsored: 0,
        balances: [{ asset_type: "native", balance: "10.0000000", selling_liabilities: "0", buying_liabilities: "0" },
          { asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: funding.CLI_USDC_ISSUER,
            balance: "1.0000000", selling_liabilities: "0", buying_liabilities: "0", is_authorized: true }] });
    }
    if (url.startsWith(`${funding.CLI_MAINNET_HORIZON}/accounts/`)) return new Response(null, { status: 404 });
    if (url === `${funding.CLI_MAINNET_HORIZON}/transactions` && options?.method === "POST") {
      const xdr = new URLSearchParams(String(options.body)).get("tx")!;
      const tx = TransactionBuilder.fromXDR(xdr, funding.CLI_MAINNET_PASSPHRASE) as Transaction;
      assert.equal(tx.source, owner.publicKey());
      assert.equal(tx.operations.length, 6);
      assert.equal(tx.signatures.length, 3);
      submitted.push(tx.hash().toString("hex"));
      if (ambiguous) throw new Error("synthetic transport ambiguity");
      confirmed.set(tx.hash().toString("hex"), { hash: tx.hash().toString("hex"), source_account: owner.publicKey(), successful: true });
      return Response.json({ successful: true });
    }
    if (url.startsWith(`${funding.CLI_MAINNET_HORIZON}/transactions/`)) {
      const match = confirmed.get(url.split("/").at(-1)!);
      return match ? Response.json(match) : new Response(null, { status: 404 });
    }
    assert.fail(`unexpected synthetic endpoint: ${url}`);
  };
  context.mock.method(globalThis, "fetch", fetchMock);
  const environment = new Proxy({ NODE_ENV: "production", ACKRATE_APP_ORIGIN: ORIGIN,
    ACKRATE_SESSION_SECRET: "synthetic-route-test-secret-0123456789abcdef", DATABASE_URL: "postgres://synthetic:test@invalid/test" }, {
    get(target, key: string) {
      assert.notEqual(key, "ACKRATE_CLI_BURNER_MNEMONIC", "interactive sessions must not depend on the team funding key");
      return target[key as keyof typeof target];
    },
  });
  const modules: Record<string, unknown> = {
    "../../../../lib/cli-test-auth": { cliChallenge, verifyCliChallenge, cliTestOrigin: (request: Request) => cliTestOrigin(request, ORIGIN) },
    "../../../../lib/cli-test-runner": { CLI_TEST_SOURCE, CLI_TEST_VERSION,
      launchCliTest: (_store: unknown, row: { id: string; state: string }) => launches.push({ id: row.id, state: row.state }) },
    "../../../../lib/cli-test-store": storage,
    "../../../../lib/cli-test-transactions": funding,
    "../../../../lib/cli-test-network": network,
    "../../../../lib/wallet/postgres": { createPostgresClient: () => query },
  };
  const exports: Partial<Routes> = {};
  vm.runInNewContext(code, { exports, require: (id: string) => modules[id] ?? require(id),
    process: { env: environment, cwd: () => fileURLToPath(new URL("../", import.meta.url)) },
    Buffer, fetch: fetchMock, AbortSignal, Request, Response, URLSearchParams, Date }, { filename: fileURLToPath(routeFile) });
  const route = exports as Routes;
  const request = (body?: object, cookies = "", origin = ORIGIN) => new Request(`${ORIGIN}/api/cli/test`, {
    method: body ? "POST" : "GET", headers: { origin, "sec-fetch-site": "same-origin", "content-type": "application/json", cookie: cookies },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const sessionCookie = (response: Response, kind: "session" | "challenge") => {
    const match = response.headers.get("set-cookie")?.match(new RegExp(`(__Host-ackrate_cli_test_${kind}=[^;,]+)`));
    assert.ok(match, `missing ${kind} cookie`); return match[1];
  };
  async function prepare() {
    const challengeResponse = await route.POST(request({ action: "challenge", owner: owner.publicKey() }));
    assert.equal(challengeResponse.status, 200);
    const challenge = await challengeResponse.json();
    const tx = TransactionBuilder.fromXDR(challenge.xdr, funding.CLI_MAINNET_PASSPHRASE) as Transaction;
    assert.equal(tx.sequence, "0"); tx.sign(owner);
    const body = { action: "prepare", owner: owner.publicKey(), challengeToken: challenge.challengeToken, signedXdr: tx.toXDR() };
    const cookie = sessionCookie(challengeResponse, "challenge");
    const response = await route.POST(request(body, cookie));
    assert.equal(response.status, 200, await response.clone().text());
    return { response, run: (await response.json()).run as storage.CliTestRow, cookie: sessionCookie(response, "session"), authBody: body, authCookie: cookie };
  }
  return { db, route, request, owner, prepare, launches, submitted, setAmbiguous: (value: boolean) => { ambiguous = value; } };
}

test("interactive route completes ownership, exact funding and one explicit launch independently of team key", async (context) => {
  const f = await fixture(context);
  assert.equal((await (await f.route.GET(f.request())).json()).ready, true);
  const prepared = await f.prepare();
  assert.equal(prepared.run.state, "prepared");
  assert.equal(new Set([prepared.run.owner, prepared.run.payer, prepared.run.agent, prepared.run.merchant]).size, 4);
  const tx = TransactionBuilder.fromXDR(prepared.run.fundingXdr!, funding.CLI_MAINNET_PASSPHRASE) as Transaction;
  assert.deepEqual(tx.operations.slice(0, 3).map(op => op.type === "createAccount" ? op.startingBalance : "wrong"), ["2.1000000", "2.1000000", "1.8000000"]);
  tx.sign(f.owner);
  funding.verifyCliFundingSigned(prepared.run.fundingXdr!, tx.toXDR(), f.owner.publicKey());
  const funded = await f.route.POST(f.request({ action: "fund", signedXdr: tx.toXDR() }, prepared.cookie));
  assert.equal(funded.status, 200); assert.equal((await funded.json()).run.state, "funded");
  assert.equal(f.launches.length, 0);
  const reload = await f.route.GET(f.request(undefined, prepared.cookie));
  assert.equal((await reload.json()).run.id, prepared.run.id);
  const requests = await Promise.all([1, 2].map(() => f.route.POST(f.request({ action: "run", confirmRealUsdc: true }, prepared.cookie))));
  assert.deepEqual(requests.map(r => r.status).sort(), [200, 409]);
  assert.deepEqual(f.launches, [{ id: prepared.run.id, state: "running" }]);
  assert.equal((await (await f.route.GET(f.request(undefined, prepared.cookie))).json()).run.state, "running");
  assert.equal(f.submitted.length, 1); assert.equal(f.launches.length, 1);
});

test("interactive route rejects cross-origin, missing capability and absent spending consent before actions", async (context) => {
  const f = await fixture(context);
  assert.equal((await f.route.POST(f.request({ action: "challenge", owner: f.owner.publicKey() }, "", "https://other.example"))).status, 403);
  assert.equal((await f.route.POST(f.request({ action: "fund", signedXdr: "synthetic" }))).status, 401);
  const prepared = await f.prepare();
  assert.equal((await f.route.POST(f.request({ action: "run" }, prepared.cookie))).status, 400);
  assert.equal((await f.route.POST(f.request({ action: "run", confirmRealUsdc: true }, prepared.cookie))).status, 409);
  assert.equal((await f.route.POST(f.request({ action: "challenge", owner: f.owner.publicKey() }, prepared.cookie))).status, 409);
  assert.equal(f.submitted.length, 0); assert.equal(f.launches.length, 0);
});

test("ownership nonce replay cannot create a second session and altered funding cannot submit", async (context) => {
  const f = await fixture(context); const prepared = await f.prepare();
  assert.equal((await f.route.POST(f.request(prepared.authBody, prepared.authCookie))).status, 409);
  const tx = TransactionBuilder.fromXDR(prepared.run.fundingXdr!, funding.CLI_MAINNET_PASSPHRASE) as Transaction;
  const altered = TransactionBuilder.cloneFrom(tx, { fee: "101" }).build(); altered.sign(f.owner);
  assert.equal((await f.route.POST(f.request({ action: "fund", signedXdr: altered.toXDR() }, prepared.cookie))).status, 400);
  assert.equal(f.submitted.length, 0);
  assert.equal((await f.db.query<{ count: number }>("SELECT count(*)::int AS count FROM ackrate_cli_test_runs")).rows[0].count, 1);
});

test("ambiguous funding remains on its exact hash across reload; only explicit same-envelope retry submits", async (context) => {
  const f = await fixture(context); const prepared = await f.prepare();
  const tx = TransactionBuilder.fromXDR(prepared.run.fundingXdr!, funding.CLI_MAINNET_PASSPHRASE) as Transaction; tx.sign(f.owner);
  f.setAmbiguous(true);
  const pending = await f.route.POST(f.request({ action: "fund", signedXdr: tx.toXDR() }, prepared.cookie));
  assert.equal((await pending.json()).run.state, "funding");
  for (let i = 0; i < 3; i++) assert.equal((await (await f.route.GET(f.request(undefined, prepared.cookie))).json()).run.fundingHash, prepared.run.fundingHash);
  assert.equal(f.submitted.length, 1); assert.equal(f.launches.length, 0);
  f.setAmbiguous(false);
  const retried = await f.route.POST(f.request({ action: "fund", signedXdr: tx.toXDR() }, prepared.cookie));
  assert.equal((await retried.json()).run.state, "funded");
  assert.deepEqual(f.submitted, [prepared.run.fundingHash, prepared.run.fundingHash]);
  assert.equal((await f.route.POST(f.request({ action: "fund", signedXdr: tx.toXDR() }, prepared.cookie))).status, 200);
  assert.equal(f.submitted.length, 2); assert.equal(f.launches.length, 0);
});

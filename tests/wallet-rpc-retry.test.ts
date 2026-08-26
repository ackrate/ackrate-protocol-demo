import assert from "node:assert/strict";
import test from "node:test";
import { postRpcWithRetry, retryRateLimited } from "../lib/wallet/rpc-retry";

test("RPC fetch fails over and then retries after HTTP 429", async () => {
  const calls: string[] = [];
  const waits: number[] = [];
  const response = await postRpcWithRetry(
    ["https://rpc-a.example", "https://rpc-b.example"],
    { jsonrpc: "2.0", id: 1, method: "getLatestLedger" },
    async (input) => {
      calls.push(String(input));
      return calls.length < 3 ? new Response("busy", { status: 429 }) : Response.json({ result: { sequence: 1 } });
    },
    async (milliseconds) => { waits.push(milliseconds); },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["https://rpc-a.example", "https://rpc-b.example", "https://rpc-a.example"]);
  assert.deepEqual(waits, [250]);
});

test("SDK RPC operation retries only explicit HTTP 429", async () => {
  let calls = 0;
  const result = await retryRateLimited(async () => {
    calls += 1;
    if (calls === 1) throw { response: { status: 429 } };
    return "ok";
  }, async () => undefined);
  assert.equal(result, "ok");
  assert.equal(calls, 2);

  await assert.rejects(
    retryRateLimited(async () => { throw { response: { status: 500 } }; }, async () => undefined),
  );
});

test("RPC retry honors a bounded Retry-After response", async () => {
  const waits: number[] = [];
  let calls = 0;
  const response = await postRpcWithRetry(
    "https://rpc.example",
    { jsonrpc: "2.0", id: 1, method: "getLatestLedger" },
    async () => {
      calls += 1;
      return calls === 1
        ? new Response("busy", { status: 429, headers: { "Retry-After": "5" } })
        : Response.json({ result: { sequence: 1 } });
    },
    async (milliseconds) => { waits.push(milliseconds); },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(waits, [2_000]);
});

test("RPC fetch fails over after a reset without leaking the transport error", async () => {
  const calls: string[] = [];
  const response = await postRpcWithRetry(
    ["https://rpc-a.example", "https://rpc-b.example"],
    { jsonrpc: "2.0", id: 1, method: "simulateTransaction" },
    async (input) => {
      calls.push(String(input));
      if (calls.length === 1) throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });
      return Response.json({ result: { transactionData: "ok" } });
    },
    async () => undefined,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["https://rpc-a.example", "https://rpc-b.example"]);
});

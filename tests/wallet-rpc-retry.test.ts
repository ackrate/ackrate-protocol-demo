import assert from "node:assert/strict";
import test from "node:test";
import { postRpcWithRetry, retryRateLimited } from "../lib/wallet/rpc-retry";

test("RPC fetch retries the same endpoint after HTTP 429", async () => {
  const calls: string[] = [];
  const waits: number[] = [];
  const response = await postRpcWithRetry(
    "https://rpc.example",
    { jsonrpc: "2.0", id: 1, method: "getLatestLedger" },
    async (input) => {
      calls.push(String(input));
      return calls.length < 3 ? new Response("busy", { status: 429 }) : Response.json({ result: { sequence: 1 } });
    },
    async (milliseconds) => { waits.push(milliseconds); },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["https://rpc.example", "https://rpc.example", "https://rpc.example"]);
  assert.deepEqual(waits, [250, 750]);
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

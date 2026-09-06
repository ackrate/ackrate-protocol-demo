import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { Account, Address, Contract, Keypair, Networks, StrKey, TransactionBuilder, nativeToScVal } from "@stellar/stellar-sdk";
import { preparedAllowanceEvidence, readAllowanceConfirmation, waitForAllowanceConfirmation, type AllowanceScope } from "../lib/wallet/client-readiness";

function allowanceFixture() {
  const scope: AllowanceScope = {
    user: Keypair.random().publicKey(),
    asset: StrKey.encodeContract(Buffer.alloc(32, 1)),
    spender: StrKey.encodeContract(Buffer.alloc(32, 2)),
    maxAmount: "1000000",
  };
  const build = (sequence: string) => new TransactionBuilder(new Account(scope.user, sequence), {
    fee: "100", networkPassphrase: Networks.TESTNET, timebounds: { minTime: 0, maxTime: 1600 },
  }).addOperation(new Contract(scope.asset).call("approve",
    new Address(scope.user).toScVal(), new Address(scope.spender).toScVal(),
    nativeToScVal(BigInt(scope.maxAmount), { type: "i128" }), nativeToScVal(10000, { type: "u32" }),
  )).build().toXDR();
  const transactionXdr = build("0");
  return { scope, transactionXdr, otherTransactionXdr: build("1"), pending: preparedAllowanceEvidence(transactionXdr, Networks.TESTNET, scope, 1000) };
}

function mockReceiptReads(t: TestContext, hash: string, respond: (call: number, signal: AbortSignal) => Promise<Response>) {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(url, "/api/wallet/rpc");
    assert.equal(init?.method, "POST");
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.credentials, "same-origin");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      jsonrpc: "2.0", id: "allowance-confirmation", method: "getTransaction", params: { hash },
    });
    assert.ok(init?.signal instanceof AbortSignal);
    return respond(++calls, init.signal);
  });
  return () => calls;
}

const pendingResult = { status: "NOT_FOUND", latestLedgerCloseTime: 1200, oldestLedgerCloseTime: 500 };

test("allowance polling survives a temporary read failure and confirms the same receipt", async (t) => {
  const { scope, pending, transactionXdr } = allowanceFixture();
  const calls = mockReceiptReads(t, pending.txHash, async (call) => {
    if (call === 1) return Response.json({ result: pendingResult });
    if (call === 2) throw new TypeError("Temporary connection reset");
    return Response.json({ result: { status: "SUCCESS", envelopeXdr: transactionXdr } });
  });
  let retries = 0;
  assert.equal(await waitForAllowanceConfirmation("/api/wallet/rpc", Networks.TESTNET, scope, pending, {
    intervalMs: 1, timeoutMs: 1000, onRetry: () => { retries++; },
  }), "confirmed");
  assert.equal(calls(), 3);
  assert.equal(retries, 2);
});

test("an exact FAILED receipt terminates polling without reporting success", async (t) => {
  const { scope, pending, transactionXdr } = allowanceFixture();
  const calls = mockReceiptReads(t, pending.txHash, async () => Response.json({ result: { status: "FAILED", envelopeXdr: transactionXdr } }));
  assert.equal(await waitForAllowanceConfirmation("/api/wallet/rpc", Networks.TESTNET, scope, pending), "failed");
  assert.equal(calls(), 1);
});

test("only complete RPC history after the transaction validity window proves expiry", async (t) => {
  const { scope, pending } = allowanceFixture();
  const calls = mockReceiptReads(t, pending.txHash, async (call) => Response.json({ result: {
    status: "NOT_FOUND", latestLedgerCloseTime: 1700, oldestLedgerCloseTime: call === 1 ? 1100 : 500,
  } }));
  assert.equal(await waitForAllowanceConfirmation("/api/wallet/rpc", Networks.TESTNET, scope, pending, { intervalMs: 1 }), "expired");
  assert.equal(calls(), 2);
});

test("a mismatched response cannot be replaced with a later successful result", async (t) => {
  const { scope, pending, transactionXdr, otherTransactionXdr } = allowanceFixture();
  const calls = mockReceiptReads(t, pending.txHash, async (call) => Response.json({ result: {
    status: "SUCCESS", envelopeXdr: call === 1 ? otherTransactionXdr : transactionXdr,
  } }));
  await assert.rejects(waitForAllowanceConfirmation("/api/wallet/rpc", Networks.TESTNET, scope, pending, { intervalMs: 1 }), /different allowance transaction/);
  assert.equal(calls(), 1);
});

test("unknown status and missing verification evidence fail closed", async (t) => {
  const { scope, pending } = allowanceFixture();
  let result: object = { status: "UNKNOWN" };
  mockReceiptReads(t, pending.txHash, async () => Response.json({ result }));
  await assert.rejects(waitForAllowanceConfirmation("/api/wallet/rpc", Networks.TESTNET, scope, pending), /unknown allowance status/);
  result = { status: "SUCCESS" };
  await assert.rejects(waitForAllowanceConfirmation("/api/wallet/rpc", Networks.TESTNET, scope, pending), /verification/);
});

test("malformed retained scope, hash, and expiry fail before any RPC call", async (t) => {
  const { scope, pending } = allowanceFixture();
  const calls = mockReceiptReads(t, pending.txHash, async () => { throw new Error("Must not call RPC"); });
  await assert.rejects(waitForAllowanceConfirmation("/api/wallet/rpc", Networks.TESTNET, { ...scope, maxAmount: "2000000" }, pending));
  await assert.rejects(waitForAllowanceConfirmation("/api/wallet/rpc", Networks.TESTNET, scope, { ...pending, txHash: "f".repeat(64) }), /signed hash/);
  await assert.rejects(waitForAllowanceConfirmation("/api/wallet/rpc", Networks.TESTNET, scope, { ...pending, validUntil: 1700 }), /signed hash/);
  assert.equal(calls(), 0);
});

test("overall deadline bounds even a hung transport and preserves pending state", async (t) => {
  const { scope, pending } = allowanceFixture();
  let requestSignal: AbortSignal | undefined;
  const calls = mockReceiptReads(t, pending.txHash, async (_call, signal) => {
    requestSignal = signal;
    return new Promise<Response>(() => undefined);
  });
  assert.equal(await waitForAllowanceConfirmation("/api/wallet/rpc", Networks.TESTNET, scope, pending, { timeoutMs: 20 }), "pending");
  assert.equal(calls(), 1);
  assert.equal(requestSignal?.aborted, true);
});

test("overall deadline also bounds a hung response body", async (t) => {
  const { scope, pending } = allowanceFixture();
  mockReceiptReads(t, pending.txHash, async () => ({ ok: true, json: () => new Promise(() => undefined) }) as unknown as Response);
  assert.equal(await waitForAllowanceConfirmation("/api/wallet/rpc", Networks.TESTNET, scope, pending, { timeoutMs: 20 }), "pending");
});

test("caller abort cancels a hung request promptly without another receipt read", async (t) => {
  const { scope, pending } = allowanceFixture();
  const controller = new AbortController();
  const calls = mockReceiptReads(t, pending.txHash, async () => {
    queueMicrotask(() => controller.abort());
    return new Promise<Response>(() => undefined);
  });
  await assert.rejects(waitForAllowanceConfirmation("/api/wallet/rpc", Networks.TESTNET, scope, pending, { signal: controller.signal }), { name: "AbortError" });
  assert.equal(calls(), 1);
});

test("caller abort cancels the retry delay rather than waiting for its interval", async (t) => {
  const { scope, pending } = allowanceFixture();
  const controller = new AbortController();
  const reason = new Error("View closed");
  const calls = mockReceiptReads(t, pending.txHash, async () => Response.json({ result: pendingResult }));
  await assert.rejects(waitForAllowanceConfirmation("/api/wallet/rpc", Networks.TESTNET, scope, pending, {
    signal: controller.signal, intervalMs: 60_000,
    onRetry: () => queueMicrotask(() => controller.abort(reason)),
  }), (cause) => cause === reason);
  assert.equal(calls(), 1);
});

test("an already cancelled poll and a zero deadline send no RPC request", async (t) => {
  const { scope, pending } = allowanceFixture();
  const calls = mockReceiptReads(t, pending.txHash, async () => { throw new Error("Must not call RPC"); });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(waitForAllowanceConfirmation("/api/wallet/rpc", Networks.TESTNET, scope, pending, { signal: controller.signal }), { name: "AbortError" });
  assert.equal(await waitForAllowanceConfirmation("/api/wallet/rpc", Networks.TESTNET, scope, pending, { timeoutMs: 0 }), "pending");
  assert.equal(calls(), 0);
});

test("a direct read has its own 15-second deadline even without a polling caller", async (t) => {
  const { scope, pending } = allowanceFixture();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let requestSignal: AbortSignal | undefined;
  mockReceiptReads(t, pending.txHash, async (_call, signal) => {
    requestSignal = signal;
    return new Promise<Response>(() => undefined);
  });
  const read = readAllowanceConfirmation("/api/wallet/rpc", Networks.TESTNET, scope, pending);
  const rejected = assert.rejects(read, { name: "TimeoutError" });
  await Promise.resolve();
  t.mock.timers.tick(15_000);
  await rejected;
  assert.equal(requestSignal?.aborted, true);
});

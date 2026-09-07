import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { type TestContext } from "node:test";
import { Keypair, Networks, StrKey, rpc } from "@stellar/stellar-sdk";
import {
  ackrate, createBoundPaymentProof, createSettlementReceiptId, decodePaymentProof,
  DeliveryPendingError, type BoundPaymentChallengeV2, type SettlementReceipt,
} from "@ackrate/core";
import { DurableReceiptStore } from "../lib/wallet/journal";

// Node's test runner isolates this file. Exercise the actual in-memory journal
// implementation without inheriting or contacting a configured production DB.
delete process.env.DATABASE_URL;

function fixture(t: TestContext) {
  const key = Keypair.random();
  const user = Keypair.random().publicKey();
  const merchant = Keypair.random().publicKey();
  const asset = StrKey.encodeContract(Buffer.alloc(32, 20));
  const registry = StrKey.encodeContract(Buffer.alloc(32, 21));
  const network = {
    rpcUrl: "https://offline.invalid", networkPassphrase: Networks.PUBLIC,
    mandateRegistryId: registry, nativeSac: asset,
  };
  const now = Math.floor(Date.now() / 1_000);
  const mandate = ackrate.createIntentMandate({
    user, agent: key.publicKey(), merchant, asset, maxAmount: "0.03", expiry: now + 600,
  }, network);
  const challenge: BoundPaymentChallengeV2 = {
    proofVersion: 2, challengeId: Buffer.alloc(32, 5).toString("base64url"),
    audience: "https://merchant.invalid", scheme: "ackrate-soroban-bound", method: "GET",
    resource: "/source", bodySha256: null, network: "stellar-mainnet",
    networkId: createHash("sha256").update(Networks.PUBLIC).digest("hex"),
    registryId: registry, merchant, asset, amountStroops: "100000", decimals: 7,
    issuedAt: now, expiresAt: now + 300,
    authorization: { algorithm: "hmac-sha256", mac: Buffer.alloc(32, 6).toString("base64") },
  };
  function makeReceipt(txHash = "a".repeat(64)): SettlementReceipt {
    const proof = createBoundPaymentProof({ challenge, txHash, mandateId: mandate.id, signer: key });
    const body = {
      proofVersion: 2 as const, url: "https://merchant.invalid/source", method: "GET",
      txHash, mandateId: mandate.id, amount: "0.01", submittedAt: now, validUntil: now + 60, proof,
    };
    return { receiptId: createSettlementReceiptId(body), ...body };
  }
  const receipt = makeReceipt();
  const signTransaction = t.mock.fn(async (): Promise<never> => {
    throw new Error("Recovery must not sign a transaction");
  });
  const signPayload = t.mock.fn(async (): Promise<never> => {
    throw new Error("Recovery must reuse its existing proof, not sign another");
  });
  const rpcGuards = ["sendTransaction", "simulateTransaction", "getTransaction", "getAccount"]
    .map((method) => t.mock.method(rpc.Server.prototype, method as "getAccount", async (): Promise<never> => {
      throw new Error("This offline recovery check forbids RPC or broadcast");
    }));
  const stores: DurableReceiptStore[] = [];
  const consumers: ReturnType<typeof ackrate.agent>[] = [];
  function request() {
    const store = new DurableReceiptStore(`${user}:${mandate.id}`, mandate.id);
    const consumer = ackrate.agent({
      mandate, signer: { publicKey: key.publicKey(), signTransaction, signPayload },
      proofPolicy: "bound-v2-only", receiptStore: store,
    }, network);
    stores.push(store);
    consumers.push(consumer);
    return { store, consumer };
  }
  t.after(() => {
    assert.equal(signTransaction.mock.callCount(), 0);
    assert.equal(signPayload.mock.callCount(), 0);
    for (const guard of rpcGuards) assert.equal(guard.mock.callCount(), 0);
  });
  return { receipt, makeReceipt, request, stores, consumers };
}

test("a new wallet request recovers the exact receipt after a transient merchant failure", async (t) => {
  const f = fixture(t);
  const first = f.request();
  await first.store.savePending(f.receipt);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    calls++;
    assert.equal(url, f.receipt.url);
    assert.equal(init?.redirect, "manual");
    assert.deepEqual(decodePaymentProof(new Headers(init?.headers).get("X-PAYMENT")!), f.receipt.proof);
    return calls === 1 ? new Response("temporary outage", { status: 503 }) : Response.json({ ok: true });
  });
  await assert.rejects(first.consumer.retryDelivery(f.receipt), DeliveryPendingError);
  const next = f.request();
  const [retained] = await next.store.listPending();
  assert.deepEqual(retained, f.receipt);
  const response = await next.consumer.retryDelivery(retained!);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(calls, 2);
  assert.equal((await next.store.listPending()).length, 1, "HTTP success is not the business commit");
  await next.consumer.acknowledgeDelivery(retained!);
  assert.deepEqual(await first.store.listPending(), []);
  assert.equal(first.consumer.getPendingSettlement(), undefined, "original claim owner observes recovery acknowledgement");
});

test("recovery sharing cannot replace a held receipt or open another payment", async (t) => {
  const f = fixture(t);
  const first = f.request();
  await first.store.savePending(f.receipt);
  const fetchGuard = t.mock.method(globalThis, "fetch", async () => new Response("temporary outage", { status: 503 }));
  await assert.rejects(first.consumer.retryDelivery(f.receipt), DeliveryPendingError);
  const other = f.request();
  await assert.rejects(other.consumer.retryDelivery(f.makeReceipt("b".repeat(64))), /another payment operation/);
  const prepared = t.mock.fn(async () => undefined);
  await assert.rejects(other.consumer.pay("0.01", { onPrepared: prepared }), /another payment operation/);
  assert.equal(prepared.mock.callCount(), 0);
  assert.equal(fetchGuard.mock.callCount(), 1);
  assert.deepEqual(await other.store.listPending(), [f.receipt]);
});

test("an incomplete response body remains recoverable by a later wallet request", async (t) => {
  const f = fixture(t);
  const first = f.request();
  await first.store.savePending(f.receipt);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return calls === 1 ? new Response(new ReadableStream({
      start(controller) { controller.error(new Error("body interrupted")); },
    })) : Response.json({ ok: true });
  });
  await assert.rejects(first.consumer.retryDelivery(f.receipt), DeliveryPendingError);
  const next = f.request();
  const [retained] = await next.store.listPending();
  assert.deepEqual(await (await next.consumer.retryDelivery(retained!)).json(), { ok: true });
  await next.consumer.acknowledgeDelivery(retained!);
  assert.equal(calls, 2);
  assert.equal(first.consumer.getPendingSettlement(), undefined);
});

test("failed receipt acknowledgement keeps the exact shared operation recoverable", async (t) => {
  const f = fixture(t);
  const first = f.request();
  await first.store.savePending(f.receipt);
  t.mock.method(globalThis, "fetch", async () => Response.json({ ok: true }));
  await first.consumer.retryDelivery(f.receipt);
  const next = f.request();
  await next.consumer.retryDelivery(f.receipt);
  const clear = t.mock.method(next.store, "clearPending", async () => { throw new Error("database unavailable"); });
  await assert.rejects(next.consumer.acknowledgeDelivery(f.receipt), DeliveryPendingError);
  assert.deepEqual(await first.store.listPending(), [f.receipt]);
  clear.mock.restore();
  const last = f.request();
  await last.consumer.retryDelivery(f.receipt);
  await last.consumer.acknowledgeDelivery(f.receipt);
  assert.deepEqual(await first.store.listPending(), []);
  assert.equal(first.consumer.getPendingSettlement(), undefined);
  assert.equal(next.consumer.getPendingSettlement(), undefined);
});

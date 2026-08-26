import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import {
  DeliveryPendingError,
  PaymentRejectedError,
  ackrate,
} from "@ackrate/core";
import {
  acknowledgeResolvedTerminalBoundJson,
  canonicalMandateSnapshot,
  createBoundTestnetConsumer,
  isBudgetRejection,
  isExpiryRejection,
  isRevocationRejection,
  expectVerifiedBudgetRejection,
  expectVerifiedExpiryRejection,
  expectVerifiedRevocationRejection,
  purchaseVerifiedBoundJson,
  recoverBoundJson,
  verifyExactBound402,
} from "../starter-kit-src/shared/contract.mjs";

const URL = "http://127.0.0.1:4021/items/alpha";
const PRICE = "1.00";

function challengeBody(merchant, ttlSeconds = 900) {
  const now = Math.floor(Date.now() / 1_000);
  const networkId = createHash("sha256")
    .update(ackrate.testnet.networkPassphrase, "utf8")
    .digest("hex");
  const challenge = {
    proofVersion: 2,
    challengeId: randomBytes(32).toString("base64url"),
    audience: "http://127.0.0.1:4021",
    scheme: "ackrate-soroban-bound",
    method: "GET",
    resource: "/items/alpha",
    bodySha256: null,
    network: "stellar-testnet",
    networkId,
    registryId: ackrate.testnet.mandateRegistryId,
    merchant,
    asset: ackrate.testnet.nativeSac,
    amountStroops: "10000000",
    decimals: 7,
    issuedAt: now,
    expiresAt: now + ttlSeconds,
    authorization: {
      algorithm: "hmac-sha256",
      mac: randomBytes(32).toString("base64"),
    },
  };
  return {
    x402Version: 1,
    accepts: [{
      scheme: "ackrate-soroban-bound",
      network: "stellar-testnet",
      maxAmountRequired: PRICE,
      asset: ackrate.testnet.nativeSac,
      payTo: merchant,
      resource: "/items/alpha",
      extra: {
        contract: ackrate.testnet.mandateRegistryId,
        ackrateProofVersion: 2,
        challenge,
      },
    }],
  };
}

async function verifiedQuote(merchant, ttlSeconds = 900) {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify(challengeBody(merchant, ttlSeconds)), {
      status: 402,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const quote = await verifyExactBound402({ url: URL, merchant, amount: PRICE });
    assert.equal(calls, 1);
    return quote;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function testMandate(signer, merchant) {
  return canonicalMandateSnapshot({
    id: "b".repeat(64),
    idBuffer: Buffer.from("b".repeat(64), "hex"),
    user: Keypair.random().publicKey(),
    agent: signer.publicKey(),
    merchant,
    asset: ackrate.testnet.nativeSac,
    maxAmount: 30_000_000n,
    expiry: Math.floor(Date.now() / 1_000) + 3_600,
    decimals: 7,
  });
}

function memoryReceiptStore() {
  const pending = new Map();
  return {
    async savePending(receipt) { pending.set(receipt.receiptId, receipt); },
    async clearPending(receiptId) { pending.delete(receiptId); },
    async listPending() { return [...pending.values()]; },
  };
}

function fakeConsumer(store, {
  responseStatus = 200,
  settlementOverrides = {},
  paymentError,
  paymentErrorBeforePrepared,
} = {}) {
  const calls = { pay: 0, retry: 0, acknowledge: 0 };
  return {
    calls,
    async pay(amount, lifecycle) {
      calls.pay += 1;
      assert.equal(amount, PRICE);
      if (paymentErrorBeforePrepared) throw paymentErrorBeforePrepared;
      const now = Math.floor(Date.now() / 1_000);
      const settlement = {
        txHash: "a".repeat(64),
        mandateId: "b".repeat(64),
        amount,
        expectedSeq: "0",
        submittedAt: now,
        validUntil: now + 60,
        ...settlementOverrides,
      };
      const receiptId = await lifecycle.onPrepared(settlement);
      assert.match(receiptId, /^[0-9a-f]{64}$/);
      assert.equal(lifecycle.onSubmitted?.(settlement.txHash), receiptId);
      if (paymentError) throw paymentError;
      return settlement.txHash;
    },
    async retryDelivery(receipt) {
      calls.retry += 1;
      assert.equal((await store.listPending())[0], receipt);
      return new Response(JSON.stringify({ ok: true, item: "alpha" }), {
        status: responseStatus,
        headers: { "content-type": "application/json" },
      });
    },
    async acknowledgeDelivery(receipt) {
      calls.acknowledge += 1;
      await store.clearPending(receipt.receiptId);
    },
    async reconcilePendingSettlement() {
      return { kind: "none" };
    },
  };
}

function bindFakeConsumer(store, mandate, signer, options) {
  const fake = fakeConsumer(store, options);
  const originalFactory = ackrate.agent;
  ackrate.agent = () => fake;
  try {
    const consumer = createBoundTestnetConsumer({ mandate, agent: signer, receiptStore: store });
    return Object.freeze({ consumer, calls: fake.calls });
  } finally {
    ackrate.agent = originalFactory;
  }
}

test("canonical mandate snapshots cannot be changed through source or buffer mutation", () => {
  const signer = Keypair.random();
  const merchant = Keypair.random().publicKey();
  const sourceId = Buffer.from("e".repeat(64), "hex");
  const source = {
    id: sourceId.toString("hex"),
    idBuffer: sourceId,
    user: Keypair.random().publicKey(),
    agent: signer.publicKey(),
    merchant,
    asset: ackrate.testnet.nativeSac,
    maxAmount: 30_000_000n,
    expiry: Math.floor(Date.now() / 1_000) + 3_600,
    decimals: 7,
  };
  const snapshot = canonicalMandateSnapshot(source);
  const firstRead = snapshot.idBuffer;

  source.decimals = 18;
  source.merchant = Keypair.random().publicKey();
  source.idBuffer.fill(0);
  firstRead.fill(1);

  assert.equal(snapshot.decimals, 7);
  assert.equal(snapshot.merchant, merchant);
  assert.equal(snapshot.id, "e".repeat(64));
  assert.equal(snapshot.idBuffer.toString("hex"), "e".repeat(64));
  assert.notEqual(snapshot.idBuffer, snapshot.idBuffer);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.throws(() => { snapshot.decimals = 18; }, TypeError);
});

test("one inspected quote is the exact paid challenge with no second 402", async () => {
  const signer = Keypair.random();
  const merchant = Keypair.random().publicKey();
  const mandate = testMandate(signer, merchant);
  const quote = await verifiedQuote(merchant);
  const store = memoryReceiptStore();
  const bound = bindFakeConsumer(store, mandate, signer);
  const { consumer } = bound;
  let committed;

  const result = await purchaseVerifiedBoundJson({
    consumer,
    mandate,
    url: URL,
    quote,
    validateDelivery: ({ body }) => ({ item: body.item }),
    commitDelivery: async ({ value }) => { committed = value; },
  });

  assert.deepEqual(committed, { item: "alpha" });
  assert.deepEqual(result.receipt.proof.challenge, quote.challenge);
  assert.deepEqual(bound.calls, { pay: 1, retry: 1, acknowledge: 1 });
  assert.equal((await store.listPending()).length, 0);
  await assert.rejects(
    purchaseVerifiedBoundJson({
      consumer,
      mandate,
      url: URL,
      quote,
      validateDelivery: () => ({}),
      commitDelivery: async () => {},
    }),
    /exact verified bound-v2 quote/,
  );
});

test("structural quote copies and cleartext remote paid origins fail before payment", async () => {
  const signer = Keypair.random();
  const merchant = Keypair.random().publicKey();
  const mandate = testMandate(signer, merchant);
  const quote = await verifiedQuote(merchant);
  const store = memoryReceiptStore();
  const bound = bindFakeConsumer(store, mandate, signer);
  const { consumer } = bound;
  await assert.rejects(
    purchaseVerifiedBoundJson({
      consumer,
      mandate,
      url: URL,
      quote: Object.freeze({ ...quote }),
      validateDelivery: () => ({}),
      commitDelivery: async () => {},
    }),
    /exact verified bound-v2 quote/,
  );
  await assert.rejects(
    verifyExactBound402({
      url: "http://merchant.example/items/alpha",
      merchant,
      amount: PRICE,
    }),
    /must use HTTPS/,
  );
  await assert.rejects(
    recoverBoundJson({
      consumer,
      receipt: { url: "http://merchant.example/items/alpha", proofVersion: 2, method: "GET" },
      validateDelivery: () => ({}),
      commitDelivery: async () => {},
    }),
    /must use HTTPS/,
  );
  assert.equal(bound.calls.pay, 0);
});

test("non-200 paid JSON stays recovery-locked", async () => {
  const signer = Keypair.random();
  const merchant = Keypair.random().publicKey();
  const mandate = testMandate(signer, merchant);
  const quote = await verifiedQuote(merchant);
  const store = memoryReceiptStore();
  const bound = bindFakeConsumer(store, mandate, signer, { responseStatus: 201 });
  const { consumer } = bound;
  await assert.rejects(
    purchaseVerifiedBoundJson({
      consumer,
      mandate,
      url: URL,
      quote,
      validateDelivery: () => ({}),
      commitDelivery: async () => {},
    }),
    DeliveryPendingError,
  );
  assert.deepEqual(bound.calls, { pay: 1, retry: 1, acknowledge: 0 });
  assert.equal((await store.listPending()).length, 1);
});

test("mandate, signer, prepared settlement, and delivery window are coherent before broadcast", async () => {
  const signer = Keypair.random();
  const merchant = Keypair.random().publicKey();
  const mandate = testMandate(signer, merchant);
  const store = memoryReceiptStore();

  assert.throws(
    () => createBoundTestnetConsumer({
      mandate,
      agent: Keypair.random(),
      receiptStore: store,
    }),
    /signer does not match/,
  );

  const mismatchedQuote = await verifiedQuote(merchant);
  const mismatchedBound = bindFakeConsumer(store, mandate, signer, {
    settlementOverrides: { mandateId: "c".repeat(64) },
  });
  await assert.rejects(
    purchaseVerifiedBoundJson({
      consumer: mismatchedBound.consumer,
      mandate,
      url: URL,
      quote: mismatchedQuote,
      validateDelivery: () => ({}),
      commitDelivery: async () => {},
    }),
    /prepared settlement does not match/,
  );
  assert.deepEqual(mismatchedBound.calls, { pay: 1, retry: 0, acknowledge: 0 });
  assert.equal((await store.listPending()).length, 0);

  const expiringQuote = await verifiedQuote(merchant, 200);
  const expiringBound = bindFakeConsumer(store, mandate, signer);
  await assert.rejects(
    purchaseVerifiedBoundJson({
      consumer: expiringBound.consumer,
      mandate,
      url: URL,
      quote: expiringQuote,
      validateDelivery: () => ({}),
      commitDelivery: async () => {},
    }),
    /at least 300 seconds remaining/,
  );
  assert.equal(expiringBound.calls.pay, 0);
});

test("only exact contract error 6 counts as budget evidence", () => {
  const mandateId = "b".repeat(64);
  assert.equal(isBudgetRejection(new Error("budget exceeded"), mandateId), false);
  assert.equal(
    isBudgetRejection(new PaymentRejectedError(mandateId, new Error("BudgetExceeded")), mandateId),
    false,
  );
  assert.equal(
    isBudgetRejection(new PaymentRejectedError(
      mandateId,
      new Error("HostError: Error(Contract, #6)"),
    ), mandateId),
    true,
  );
  assert.equal(
    isBudgetRejection(
      new PaymentRejectedError("c".repeat(64), new Error("Error(Contract, #6)")),
      mandateId,
    ),
    false,
  );
});

test("expiry and revocation helpers require their exact finalized contract errors", async () => {
  const mandateId = "b".repeat(64);
  const expiryError = new PaymentRejectedError(
    mandateId,
    new Error("HostError: Error(Contract, #4)"),
  );
  const revocationError = new PaymentRejectedError(
    mandateId,
    new Error("HostError: Error(Contract, #5)"),
  );
  assert.equal(isExpiryRejection(expiryError, mandateId), true);
  assert.equal(isExpiryRejection(revocationError, mandateId), false);
  assert.equal(isRevocationRejection(revocationError, mandateId), true);
  assert.equal(isRevocationRejection(expiryError, mandateId), false);
  assert.equal(
    isExpiryRejection(
      new PaymentRejectedError("c".repeat(64), new Error("Error(Contract, #4)")),
      mandateId,
    ),
    false,
  );

  const signer = Keypair.random();
  const merchant = Keypair.random().publicKey();
  const mandate = testMandate(signer, merchant);
  for (const [kind, error, invoke] of [
    ["contract-expiry-rejection", expiryError, expectVerifiedExpiryRejection],
    ["contract-revocation-rejection", revocationError, expectVerifiedRevocationRejection],
  ]) {
    const store = memoryReceiptStore();
    const quote = await verifiedQuote(merchant);
    const bound = bindFakeConsumer(store, mandate, signer, { paymentError: error });
    const evidence = await invoke({
      consumer: bound.consumer,
      mandate,
      url: URL,
      quote,
    });
    assert.equal(evidence.kind, kind);
    assert.equal(evidence.mandateId, mandate.id);
    assert.equal(evidence.contractCode, kind === "contract-expiry-rejection" ? 4 : 5);
    assert.deepEqual(bound.calls, { pay: 1, retry: 0, acknowledge: 0 });
    assert.equal((await store.listPending()).length, 0);
  }
});

test("expected negative paths accept only exact pre-broadcast simulation rejections", async () => {
  const signer = Keypair.random();
  const merchant = Keypair.random().publicKey();
  const mandate = testMandate(signer, merchant);
  const exactSimulation = new Error(
    'Transaction simulation failed: "HostError: Error(Contract, #6)\nDiagnostic: Error(Contract, #6)"',
  );
  const store = memoryReceiptStore();
  const bound = bindFakeConsumer(store, mandate, signer, {
    paymentErrorBeforePrepared: exactSimulation,
  });
  const evidence = await expectVerifiedBudgetRejection({
    consumer: bound.consumer,
    mandate,
    url: URL,
    quote: await verifiedQuote(merchant),
  });
  assert.equal(evidence.kind, "contract-budget-rejection");
  assert.equal(evidence.contractCode, 6);
  assert.equal(evidence.mandateId, mandate.id);
  assert.deepEqual(bound.calls, { pay: 1, retry: 0, acknowledge: 0 });
  assert.equal((await store.listPending()).length, 0);

  for (const unsafe of [
    new Error("HostError: Error(Contract, #6)"),
    new Error('Transaction simulation failed: "HostError: Error(Contract, #5)"'),
    new Error('Transaction simulation failed: "HostError: Error(Contract, #6) then Error(Contract, #5)"'),
  ]) {
    const rejectedStore = memoryReceiptStore();
    const rejectedBound = bindFakeConsumer(rejectedStore, mandate, signer, {
      paymentErrorBeforePrepared: unsafe,
    });
    await assert.rejects(
      expectVerifiedBudgetRejection({
        consumer: rejectedBound.consumer,
        mandate,
        url: URL,
        quote: await verifiedQuote(merchant),
      }),
      (error) => error === unsafe,
    );
    assert.equal((await rejectedStore.listPending()).length, 0);
  }
});

test("resolved terminal bytes are durably committed before receipt acknowledgment", async () => {
  const receipt = Object.freeze({
    receiptId: "d".repeat(64),
    proofVersion: 2,
    method: "GET",
    url: URL,
    txHash: "a".repeat(64),
    mandateId: "b".repeat(64),
  });
  const terminalText = JSON.stringify({
    ok: false,
    error: "paid fulfillment failed after settlement",
    deliveryState: "terminal",
  });
  const calls = [];
  const rawConsumer = {
    async pay() {
      throw new Error("payment is not expected during terminal recovery");
    },
    async retryDelivery(candidate) {
      calls.push(["retry", candidate.receiptId]);
      return new Response(terminalText, {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    },
    async acknowledgeDelivery(candidate) {
      calls.push(["acknowledge", candidate.receiptId]);
    },
    async reconcilePendingSettlement() {
      return { kind: "none" };
    },
  };
  const signer = Keypair.random();
  const merchant = Keypair.random().publicKey();
  const mandate = canonicalMandateSnapshot({
    id: receipt.mandateId,
    idBuffer: Buffer.from(receipt.mandateId, "hex"),
    user: Keypair.random().publicKey(),
    agent: signer.publicKey(),
    merchant,
    asset: ackrate.testnet.nativeSac,
    maxAmount: 10_000_000n,
    expiry: Math.floor(Date.now() / 1_000) + 3_600,
    decimals: 7,
  });
  const originalFactory = ackrate.agent;
  ackrate.agent = () => rawConsumer;
  let consumer;
  try {
    consumer = createBoundTestnetConsumer({
      mandate,
      agent: signer,
      receiptStore: memoryReceiptStore(),
    });
  } finally {
    ackrate.agent = originalFactory;
  }
  let committed;
  const evidence = await acknowledgeResolvedTerminalBoundJson({
    consumer,
    receipt,
    commitTerminal: async (value) => {
      calls.push(["commit", value.receiptId]);
      committed = value;
    },
  });
  assert.equal(committed, evidence);
  assert.match(evidence.bodySha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(calls.map(([kind]) => kind), ["retry", "commit", "acknowledge"]);

  await assert.rejects(
    acknowledgeResolvedTerminalBoundJson({
      consumer: (() => {
        const invalidRaw = {
          ...rawConsumer,
          async retryDelivery() {
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
          },
        };
        const savedFactory = ackrate.agent;
        ackrate.agent = () => invalidRaw;
        try {
          return createBoundTestnetConsumer({
            mandate,
            agent: signer,
            receiptStore: memoryReceiptStore(),
          });
        } finally {
          ackrate.agent = savedFactory;
        }
      })(),
      receipt,
      commitTerminal: async () => {},
    }),
    DeliveryPendingError,
  );
});

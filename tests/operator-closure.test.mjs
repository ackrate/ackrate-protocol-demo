import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import {
  BOUND_PAYMENT_SCHEME,
  createBoundPaymentProof,
  createSettlementReceiptId,
  ackrate,
} from "@ackrate/core";
import { createRedemptionKey } from "@ackrate/express-middleware";
import {
  acknowledgeResolvedTerminalBoundJson,
  canonicalMandateSnapshot,
  createBoundTestnetConsumer,
} from "../starter-kit-src/shared/contract.mjs";
import {
  inspectInterruptedDeliveries,
  resolveInterruptedDelivery,
} from "../starter-kit-src/shared/operator-recovery.mjs";
import { inspectResetSafety, runSafeReset } from "../starter-kit-src/shared/reset.mjs";
import {
  FileBoundRedemptionStore,
  FileRunResultStore,
  FileSettlementReceiptStore,
} from "../starter-kit-src/shared/storage.mjs";

async function temporaryDirectory(t, prefix) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("operator terminal recovery closes receipt, result, redemption, and reset state", async (t) => {
  const directory = await temporaryDirectory(t, "ackrate-operator-closure-");
  const stateRoot = resolve(directory, "state");
  const archiveRoot = resolve(directory, "archive");
  const receiptStore = new FileSettlementReceiptStore(
    resolve(stateRoot, "pending-receipts.json"),
  );
  const resultStore = new FileRunResultStore(resolve(stateRoot, "results.json"));
  const redemptionStore = new FileBoundRedemptionStore(
    resolve(stateRoot, "fulfillment-redemptions.json"),
  );
  const signer = Keypair.random();
  const merchant = Keypair.random().publicKey();
  const mandateId = "b".repeat(64);
  const txHash = "a".repeat(64);
  const submittedAt = Math.floor(Date.now() / 1_000) - 600;
  const mandate = canonicalMandateSnapshot({
    id: mandateId,
    idBuffer: Buffer.from(mandateId, "hex"),
    user: Keypair.random().publicKey(),
    agent: signer.publicKey(),
    merchant,
    asset: ackrate.testnet.nativeSac,
    maxAmount: 30_000_000n,
    expiry: Math.floor(Date.now() / 1_000) + 3_600,
    decimals: 7,
  });
  const challenge = Object.freeze({
    proofVersion: 2,
    challengeId: randomBytes(32).toString("base64url"),
    audience: "http://127.0.0.1:4021",
    scheme: BOUND_PAYMENT_SCHEME,
    method: "GET",
    resource: "/items/alpha",
    bodySha256: null,
    network: "stellar-testnet",
    networkId: createHash("sha256")
      .update(ackrate.testnet.networkPassphrase, "utf8")
      .digest("hex"),
    registryId: ackrate.testnet.mandateRegistryId,
    merchant,
    asset: ackrate.testnet.nativeSac,
    amountStroops: "10000000",
    decimals: 7,
    issuedAt: submittedAt - 30,
    expiresAt: submittedAt + 870,
    authorization: Object.freeze({
      algorithm: "hmac-sha256",
      mac: randomBytes(32).toString("base64"),
    }),
  });
  const proof = Object.freeze(createBoundPaymentProof({
    challenge,
    txHash,
    mandateId,
    signer,
  }));
  const receiptWithoutId = Object.freeze({
    proofVersion: 2,
    url: "http://127.0.0.1:4021/items/alpha",
    method: "GET",
    txHash,
    mandateId,
    amount: "1.00",
    submittedAt,
    validUntil: submittedAt + 60,
    proof,
  });
  const receipt = Object.freeze({
    receiptId: createSettlementReceiptId(receiptWithoutId),
    ...receiptWithoutId,
  });
  await receiptStore.savePending(receipt);
  const runId = await resultStore.begin({ scenarioId: "operator-closure" });

  const proofDigest = createHash("sha256")
    .update(JSON.stringify(proof), "utf8")
    .digest("hex");
  const redemptionKey = createRedemptionKey(
    ackrate.testnet.networkPassphrase,
    ackrate.testnet.mandateRegistryId,
    txHash,
  );
  const claimed = await redemptionStore.claim(Object.freeze({
    key: redemptionKey,
    proofDigest,
    payment: Object.freeze({
      txHash,
      ledger: 1_234,
      mandateId,
      user: mandate.user,
      agent: mandate.agent,
      amount: "1.00",
      amountStroops: 10_000_000n,
      merchant,
      asset: ackrate.testnet.nativeSac,
      registryId: ackrate.testnet.mandateRegistryId,
      scheme: BOUND_PAYMENT_SCHEME,
      network: "stellar-testnet",
    }),
  }), "stranded-execution", submittedAt);
  assert.equal(claimed.kind, "claimed");

  const inspected = await inspectInterruptedDeliveries({
    stateRoot,
    minimumAgeSeconds: 60,
    now: () => submittedAt + 600,
  });
  assert.equal(inspected.records.length, 1);
  assert.equal(inspected.records[0].eligible, true);
  const identity = {
    key: inspected.records[0].key,
    executionId: inspected.records[0].executionId,
    proofDigest: inspected.records[0].proofDigest,
    txHash: inspected.records[0].txHash,
  };
  const resolved = await resolveInterruptedDelivery({
    stateRoot,
    identity,
    confirmation: inspected.records[0].confirmation,
    minimumAgeSeconds: 60,
    now: () => submittedAt + 600,
  });
  assert.equal(resolved.kind, "resolved-terminal");

  const rawConsumer = {
    async pay() {
      throw new Error("operator closure must not create another payment");
    },
    async retryDelivery(candidate) {
      assert.equal(candidate.receiptId, receipt.receiptId);
      const stored = await redemptionStore.lookup(redemptionKey, proofDigest);
      assert.equal(stored.kind, "completed");
      return new Response(Buffer.from(stored.record.response.bodyBase64, "base64"), {
        status: stored.record.response.status,
        headers: { "content-type": stored.record.response.contentType },
      });
    },
    async acknowledgeDelivery(candidate) {
      await receiptStore.clearPending(candidate.receiptId);
    },
    async reconcilePendingSettlement() {
      return { kind: "none" };
    },
  };
  const originalAgentFactory = ackrate.agent;
  ackrate.agent = () => rawConsumer;
  let consumer;
  try {
    consumer = createBoundTestnetConsumer({ mandate, agent: signer, receiptStore });
  } finally {
    ackrate.agent = originalAgentFactory;
  }

  const evidence = await acknowledgeResolvedTerminalBoundJson({
    consumer,
    receipt,
    commitTerminal: async (terminal) => resultStore.commitDelivery(runId, {
      type: "delivery_accepted",
      receiptId: terminal.receiptId,
      txHash: terminal.txHash,
      path: "/items/alpha",
      bodySha256: terminal.bodySha256,
      explorer: `https://stellar.expert/explorer/testnet/tx/${terminal.txHash}`,
      evidence: { deliveryState: terminal.deliveryState },
    }),
  });
  assert.equal(evidence.deliveryState, "terminal");
  assert.equal((await receiptStore.listPending()).length, 0);
  assert.deepEqual(await resultStore.acceptedReceipts(), [{
    receiptId: receipt.receiptId,
    txHash,
  }]);
  await resultStore.finish(runId, "complete", { deliveryState: "terminal" });

  const safe = await inspectResetSafety({ stateRoot });
  assert.equal(safe.safe, true);
  assert.equal(safe.unresolved.length, 0);
  assert.equal(safe.executing.length, 0);
  const reset = await runSafeReset({ stateRoot, archiveRoot });
  assert.equal(reset.kind, "archived");
  await assert.rejects(access(stateRoot), /ENOENT/);
  await access(reset.destination);
});

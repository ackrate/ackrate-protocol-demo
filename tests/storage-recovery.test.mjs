import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import {
  InterruptedDeliveryResolutionRefusedError,
  inspectInterruptedDeliveries,
  resolveInterruptedDelivery,
} from "../starter-kit-src/shared/operator-recovery.mjs";
import { runSafeReset } from "../starter-kit-src/shared/reset.mjs";
import {
  FileBoundRedemptionStore,
  FileRunResultStore,
} from "../starter-kit-src/shared/storage.mjs";

async function temporaryDirectory(t, prefix) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function redemptionRecord({
  key = "redemption-key",
  proofDigest = "c".repeat(64),
  txHash = "a".repeat(64),
  mandateId = "b".repeat(64),
} = {}) {
  return Object.freeze({
    key,
    proofDigest,
    payment: Object.freeze({
      txHash,
      mandateId,
      amountStroops: 10_000_000n,
      merchant: Keypair.random().publicKey(),
      asset: "native-test-asset",
      registryId: "registry",
      scheme: "ackrate-soroban-bound",
      network: "stellar-testnet",
      agent: Keypair.random().publicKey(),
      user: Keypair.random().publicKey(),
    }),
  });
}

function storedResponse(body) {
  const bytes = Buffer.from(JSON.stringify(body), "utf8");
  return Object.freeze({
    status: 200,
    contentType: "application/json; charset=utf-8",
    bodyBase64: bytes.toString("base64"),
    bodySha256: createHash("sha256").update(bytes).digest("hex"),
  });
}

test("oversized result replacement is rejected before the prior file changes", async (t) => {
  const directory = await temporaryDirectory(t, "ackrate-storage-limit-");
  const path = resolve(directory, "results.json");
  const store = new FileRunResultStore(path);
  const runId = await store.begin({ scenarioId: "storage-limit" });
  const before = await readFile(path);

  await assert.rejects(
    store.append(runId, {
      type: "large-evidence",
      payload: "x".repeat(4 * 1024 * 1024),
    }),
    /would exceed the safe ACKRATE state limit/,
  );

  const after = await readFile(path);
  assert.equal(Buffer.compare(after, before), 0);
  assert.deepEqual(await store.acceptedReceipts(), []);
});

test("generic journal append cannot forge lifecycle or delivery events", async (t) => {
  const directory = await temporaryDirectory(t, "ackrate-storage-reserved-");
  const store = new FileRunResultStore(resolve(directory, "results.json"));
  const runId = await store.begin({ scenarioId: "reserved-events" });

  for (const type of ["delivery_accepted", "run_complete", "run_failed", "run_started"]) {
    await assert.rejects(
      store.append(runId, { type }),
      /reserved for a dedicated lifecycle operation/,
    );
  }
  await assert.rejects(
    store.append(runId, { type: "ordinary-event", at: new Date().toISOString() }),
    /timestamp is assigned by the result store/,
  );

  const event = {
    type: "delivery_accepted",
    receiptId: "d".repeat(64),
    txHash: "a".repeat(64),
    path: "/items/alpha",
  };
  const first = await store.commitDelivery(runId, event);
  const second = await store.commitDelivery(runId, event);
  assert.equal(first.at, second.at);
  await assert.rejects(
    store.commitDelivery(runId, { ...event, path: "/items/changed" }),
    /different delivery evidence/,
  );
});

test("tampered result runs and committed delivery records fail closed", async (t) => {
  const directory = await temporaryDirectory(t, "ackrate-storage-tamper-");
  const path = resolve(directory, "results.json");
  const store = new FileRunResultStore(path);
  const runId = await store.begin({ scenarioId: "tamper" });
  await store.commitDelivery(runId, {
    type: "delivery_accepted",
    receiptId: "d".repeat(64),
    txHash: "a".repeat(64),
    path: "/items/alpha",
    bodySha256: "e".repeat(64),
  });
  const valid = JSON.parse(await readFile(path, "utf8"));

  const tamperedDelivery = structuredClone(valid);
  tamperedDelivery.runs[0].events[0].receiptId = "not-a-receipt";
  await writeFile(path, `${JSON.stringify(tamperedDelivery, null, 2)}\n`, "utf8");
  await assert.rejects(store.acceptedReceipts(), /canonical receipt and transaction hashes/);

  const tamperedRun = structuredClone(valid);
  tamperedRun.runs[0].finishedAt = new Date().toISOString();
  await writeFile(path, `${JSON.stringify(tamperedRun, null, 2)}\n`, "utf8");
  await assert.rejects(store.acceptedReceipts(), /running result must not have a finish timestamp/);

  const extendedDelivery = structuredClone(valid);
  extendedDelivery.runs[0].events[0].unreviewed = true;
  await writeFile(path, `${JSON.stringify(extendedDelivery, null, 2)}\n`, "utf8");
  await assert.rejects(store.acceptedReceipts(), /unsupported field unreviewed/);
});

test("operator resolution requires age and exact confirmation then stores immutable terminal bytes", async (t) => {
  const directory = await temporaryDirectory(t, "ackrate-operator-recovery-");
  const stateRoot = resolve(directory, "state");
  const archiveRoot = resolve(directory, "archive");
  const store = new FileBoundRedemptionStore(
    resolve(stateRoot, "fulfillment-redemptions.json"),
  );
  const record = redemptionRecord();
  const startedAt = 1_700_000_000;
  const executionId = "execution-1";
  await store.claim(record, executionId, startedAt);

  const young = await inspectInterruptedDeliveries({
    stateRoot,
    minimumAgeSeconds: 60,
    now: () => startedAt + 30,
  });
  assert.equal(young.records.length, 1);
  assert.equal(young.records[0].eligible, false);

  const identity = {
    key: young.records[0].key,
    executionId: young.records[0].executionId,
    proofDigest: young.records[0].proofDigest,
    txHash: young.records[0].txHash,
  };
  await assert.rejects(
    resolveInterruptedDelivery({
      stateRoot,
      identity,
      confirmation: young.records[0].confirmation,
      minimumAgeSeconds: 60,
      now: () => startedAt + 30,
    }),
    (error) => error instanceof InterruptedDeliveryResolutionRefusedError
      && error.reason === "execution is not old enough",
  );
  await assert.rejects(
    resolveInterruptedDelivery({
      stateRoot,
      identity,
      confirmation: "RESOLVE-INTERRUPTED-DELIVERY:wrong",
      minimumAgeSeconds: 60,
      now: () => startedAt + 300,
    }),
    (error) => error instanceof InterruptedDeliveryResolutionRefusedError
      && error.reason === "explicit confirmation did not match",
  );

  const oldEnough = await inspectInterruptedDeliveries({
    stateRoot,
    minimumAgeSeconds: 60,
    now: () => startedAt + 300,
  });
  assert.equal(oldEnough.records[0].eligible, true);
  const resolved = await resolveInterruptedDelivery({
    stateRoot,
    identity,
    confirmation: oldEnough.records[0].confirmation,
    minimumAgeSeconds: 60,
    now: () => startedAt + 300,
  });
  assert.equal(resolved.kind, "resolved-terminal");
  assert.deepEqual(
    JSON.parse(Buffer.from(resolved.response.bodyBase64, "base64").toString("utf8")),
    {
      ok: false,
      error: "paid fulfillment failed after settlement",
      deliveryState: "terminal",
    },
  );

  const lookup = await store.lookup(record.key, record.proofDigest);
  assert.equal(lookup.kind, "completed");
  assert.equal(
    (await store.complete({
      key: record.key,
      proofDigest: record.proofDigest,
      executionId,
      response: storedResponse({ ok: true, unsafe: "replacement" }),
    })).kind,
    "conflict",
  );
  await assert.rejects(
    resolveInterruptedDelivery({
      stateRoot,
      identity,
      confirmation: oldEnough.records[0].confirmation,
      minimumAgeSeconds: 60,
      now: () => startedAt + 600,
    }),
    (error) => error instanceof InterruptedDeliveryResolutionRefusedError
      && error.reason === "the exact execution is not stranded",
  );

  const reset = await runSafeReset({ stateRoot, archiveRoot });
  assert.equal(reset.kind, "archived");
  await assert.rejects(access(stateRoot), /ENOENT/);
  await access(reset.destination);
});

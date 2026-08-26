import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Duplex } from "node:stream";
import test from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import {
  BOUND_PAYMENT_CAPABILITY,
  ACKRATE_PAYMENT_CAPABILITIES_HEADER,
  X_PAYMENT_HEADER,
  createBoundPaymentProof,
  createSettlementReceiptId,
  encodePaymentProof,
  parse402,
  ackrate,
} from "@ackrate/core";
import {
  parseNamedArgs,
  validateExactOrigin,
  validatePositiveAmount,
  validateRequestPath,
} from "../starter-kit-src/shared/config.mjs";
import {
  assertMandateStateUnchanged,
  readTestnetMandateState,
} from "../starter-kit-src/shared/contract.mjs";
import {
  canonicalJsonStringify,
  createJsonEvidenceEnvelope,
  toJsonSafeValue,
} from "../starter-kit-src/shared/evidence.mjs";
import {
  createFulfillmentApp,
  rejectWithoutPayment,
} from "../starter-kit-src/shared/fulfillment.mjs";
import {
  createIdempotentServerCloser,
} from "../starter-kit-src/shared/http.mjs";
import {
  expectBoundProofRejected,
  expectReboundTransactionConflict,
  validateNegativePathEvent,
  validateNegativePathEvidence,
  validateScenarioDefinition,
} from "../starter-kit-src/shared/local-demo.mjs";
import {
  SafeResetRefusedError,
  inspectResetSafety,
  runSafeReset,
} from "../starter-kit-src/shared/reset.mjs";
import {
  FileBoundRedemptionStore,
  FileRunResultStore,
  FileSettlementReceiptStore,
} from "../starter-kit-src/shared/storage.mjs";
import { waitForTestnetLedgerTime } from "../starter-kit-src/shared/testnet.mjs";

class CaptureSocket extends Duplex {
  constructor() {
    super();
    this.chunks = [];
    this.remoteAddress = "127.0.0.1";
  }

  _read() {}

  _write(chunk, _encoding, callback) {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }
}

async function requestApp(app, { method = "GET", path = "/", headers = {} } = {}) {
  return new Promise((resolvePromise, reject) => {
    const socket = new CaptureSocket();
    const request = new IncomingMessage(socket);
    request.method = method;
    request.url = path;
    request.headers = Object.create(null);
    request.rawHeaders = [];
    const completeHeaders = { host: "127.0.0.1", ...headers };
    for (const [name, value] of Object.entries(completeHeaders)) {
      request.headers[name.toLowerCase()] = String(value);
      request.rawHeaders.push(name, String(value));
    }
    const response = new ServerResponse(request);
    response.assignSocket(socket);
    response.once("error", reject);
    socket.once("error", reject);
    response.once("finish", () => {
      const raw = Buffer.concat(socket.chunks).toString("utf8");
      const separator = raw.indexOf("\r\n\r\n");
      const body = separator === -1 ? "" : raw.slice(separator + 4);
      const result = {
        status: response.statusCode,
        headers: response.getHeaders(),
        body,
      };
      socket.destroy();
      resolvePromise(result);
    });
    try {
      app(request, response);
    } catch (error) {
      reject(error);
    }
  });
}

async function withAppFetch(app, operation) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    const result = await requestApp(app, {
      method: init.method ?? "GET",
      path: `${url.pathname}${url.search}`,
      headers,
    });
    return new Response(result.body, {
      status: result.status,
      headers: result.headers,
    });
  };
  try {
    return await operation();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function temporaryDirectory(t, prefix) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function legacyReceipt({ tx = "a".repeat(64), mandate = "b".repeat(64) } = {}) {
  const proof = Object.freeze({
    scheme: "ackrate-soroban",
    network: "stellar-testnet",
    txHash: tx,
    mandateId: mandate,
    amount: "1.00",
  });
  const envelope = Object.freeze({
    proofVersion: 1,
    url: "https://merchant.example/items/alpha",
    method: "GET",
    txHash: tx,
    mandateId: mandate,
    amount: "1.00",
    submittedAt: 1_700_000_000,
    validUntil: 1_700_000_060,
    proof,
  });
  return Object.freeze({
    receiptId: createSettlementReceiptId(envelope),
    ...envelope,
  });
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

function storedResponse(body = { ok: true }) {
  const bytes = Buffer.from(JSON.stringify(body), "utf8");
  return Object.freeze({
    status: 200,
    contentType: "application/json; charset=utf-8",
    bodyBase64: bytes.toString("base64"),
    bodySha256: createHash("sha256").update(bytes).digest("hex"),
  });
}

test("config and canonical evidence reject ambiguous values", () => {
  assert.deepEqual(
    { ...parseNamedArgs(["--endpoint", "https://example.test", "--merchant=GTEST"], ["endpoint", "merchant"]) },
    { endpoint: "https://example.test", merchant: "GTEST" },
  );
  assert.throws(
    () => parseNamedArgs(["--endpoint=a", "--endpoint=b"], ["endpoint"]),
    /more than once/,
  );
  assert.throws(() => parseNamedArgs(["--unknown=x"], ["endpoint"]), /unknown option/);
  assert.equal(validateExactOrigin("https://example.test"), "https://example.test");
  assert.equal(validateExactOrigin("http://127.0.0.1:4021"), "http://127.0.0.1:4021");
  assert.throws(() => validateExactOrigin("http://example.test"), /HTTPS/);
  assert.equal(validateRequestPath("/items/alpha?format=json"), "/items/alpha?format=json");
  assert.throws(() => validateRequestPath("//example.test/items"), /exact absolute path/);
  assert.equal(validatePositiveAmount("1.00"), "1.00");
  assert.throws(() => validatePositiveAmount("0.00"), /greater than zero/);

  assert.equal(
    canonicalJsonStringify({ z: 1, a: { y: 2, x: 3 } }),
    '{"a":{"x":3,"y":2},"z":1}',
  );
  const left = createJsonEvidenceEnvelope("fixture-output", { z: 1, a: 2 });
  const right = createJsonEvidenceEnvelope("fixture-output", { a: 2, z: 1 });
  assert.equal(left.sha256, right.sha256);
  assert(Object.isFrozen(left));
  assert.throws(() => toJsonSafeValue({ amount: 1n }), /non-JSON/);
  assert.throws(() => toJsonSafeValue({ when: new Date() }), /non-plain object/);
});

test("expiry waiting is pinned to observed testnet ledger time", async () => {
  const originalFetch = globalThis.fetch;
  let requested;
  globalThis.fetch = async (input) => {
    requested = new URL(input);
    return new Response(JSON.stringify({
      _embedded: {
        records: [{ closed_at: "2026-07-16T09:00:05.000Z" }],
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    assert.equal(await waitForTestnetLedgerTime(1_784_192_405, { attempts: 1 }), 1_784_192_405);
    assert.equal(requested.origin, "https://horizon-testnet.stellar.org");
    assert.equal(requested.pathname, "/ledgers");
    assert.equal(requested.searchParams.get("order"), "desc");
    assert.equal(requested.searchParams.get("limit"), "1");
  } finally {
    globalThis.fetch = originalFetch;
  }
  await assert.rejects(
    waitForTestnetLedgerTime(0, { attempts: 1 }),
    /target ledger time/,
  );
});

test("fulfillment preflight rejects without billing and paid routes remain GET-only", async (t) => {
  const stateRoot = await temporaryDirectory(t, "ackrate-shared-http-");
  let verifierCalls = 0;
  let fulfillmentCalls = 0;
  let preflightCalls = 0;
  const app = createFulfillmentApp({
    merchant: Keypair.random().publicKey(),
    audience: "http://127.0.0.1:4021",
    challengeSecret: "s".repeat(32),
    routePattern: "/items/:id",
    amount: "1.00",
    stateRoot,
    testVerifier: {
      async verify() {
        verifierCalls += 1;
        return { ok: false, kind: "invalid", reason: "test verifier should not run" };
      },
    },
    preflight(request) {
      preflightCalls += 1;
      if (request.params.id === "explode") throw new Error("fixture preflight failed");
      if (request.params.id === "stale") rejectWithoutPayment(410, "fixture-stale");
      return request.params.id === "known" ? { id: "known", priceXlm: "1.00" } : null;
    },
    fulfill() {
      fulfillmentCalls += 1;
      return { body: { ok: true } };
    },
  });

  const missing = await requestApp(app, { path: "/items/missing" });
  assert.equal(missing.status, 404);
  assert.deepEqual(JSON.parse(missing.body), { error: "resource not found" });
  assert.equal(verifierCalls, 0);
  assert.equal(fulfillmentCalls, 0);

  const wrongMethod = await requestApp(app, { method: "POST", path: "/items/known" });
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.allow, "GET");
  assert.equal(preflightCalls, 1);
  assert.equal(verifierCalls, 0);

  const failedClosed = await requestApp(app, { path: "/items/explode" });
  assert.equal(failedClosed.status, 500);
  assert.deepEqual(JSON.parse(failedClosed.body), { error: "fulfillment failed closed" });
  assert.equal(verifierCalls, 0);
  assert.equal(fulfillmentCalls, 0);

  const stale = await requestApp(app, { path: "/items/stale" });
  assert.equal(stale.status, 410);
  assert.deepEqual(JSON.parse(stale.body), { error: "fixture-stale" });
  assert.equal(verifierCalls, 0);
  assert.equal(fulfillmentCalls, 0);

  const challenge = await requestApp(app, {
    path: "/items/known",
    headers: { "ackrate-payment-capabilities": "ackrate-bound-v2" },
  });
  assert.equal(challenge.status, 402);
  assert.equal(JSON.parse(challenge.body).accepts[0].extra.ackrateProofVersion, 2);
  assert.equal(verifierCalls, 0);
  assert.throws(() => createFulfillmentApp({
    merchant: Keypair.random().publicKey(),
    audience: "http://127.0.0.1:4021",
    challengeSecret: "s".repeat(32),
    routePattern: "/items/:id",
    amount: "1.00",
    preflight: () => true,
    fulfill: () => ({ body: { ok: true } }),
    testVerifier: {},
  }), /testVerifier/);
  assert.throws(() => rejectWithoutPayment(402, "wrong-status"), /non-billable status/);
});

test("bound proof executes once, recovers exact bytes, and rejects both rebinding forms", async (t) => {
  const stateRoot = await temporaryDirectory(t, "ackrate-shared-bound-proof-");
  const redemptionPath = resolve(stateRoot, "fulfillment-redemptions.json");
  const redemptionStore = new FileBoundRedemptionStore(redemptionPath);
  const merchant = Keypair.random().publicKey();
  const user = Keypair.random().publicKey();
  const agent = Keypair.random();
  const txHash = "1".repeat(64);
  const mandateId = "2".repeat(64);
  let verifierCalls = 0;
  let fulfillmentCalls = 0;

  const app = createFulfillmentApp({
    merchant,
    audience: "http://127.0.0.1:4021",
    challengeSecret: "b".repeat(32),
    routePattern: "/items/:id",
    amount: "1.00",
    redemptionStore,
    stateRoot,
    preflight(request) {
      return request.params.id === "alpha" || request.params.id === "beta"
        ? { id: request.params.id, priceXlm: "1.00" }
        : null;
    },
    fulfill({ payment, preflight }) {
      fulfillmentCalls += 1;
      return {
        body: {
          ok: true,
          id: preflight.id,
          settledTx: payment.txHash,
        },
      };
    },
    testVerifier: {
      async verify(candidateTxHash, requirement) {
        verifierCalls += 1;
        assert.equal(candidateTxHash, txHash);
        return {
          ok: true,
          payment: Object.freeze({
            txHash: candidateTxHash,
            ledger: 1_234,
            mandateId,
            user,
            agent: agent.publicKey(),
            amount: requirement.amount,
            amountStroops: requirement.amountStroops,
            merchant: requirement.merchant,
            asset: requirement.asset,
            registryId: requirement.registryId,
            scheme: requirement.scheme,
            network: requirement.network,
          }),
        };
      },
    },
  });

  const capabilityHeaders = {
    [ACKRATE_PAYMENT_CAPABILITIES_HEADER]: BOUND_PAYMENT_CAPABILITY,
  };
  const alphaChallengeResponse = await requestApp(app, {
    path: "/items/alpha",
    headers: capabilityHeaders,
  });
  assert.equal(alphaChallengeResponse.status, 402);
  const alphaRequirement = await parse402(new Response(alphaChallengeResponse.body, { status: 402 }));
  const alphaProof = createBoundPaymentProof({
    challenge: alphaRequirement.challenge,
    txHash,
    mandateId,
    signer: agent,
  });
  const alphaHeaders = {
    ...capabilityHeaders,
    [X_PAYMENT_HEADER]: encodePaymentProof(alphaProof),
  };

  const delivered = await requestApp(app, {
    path: "/items/alpha",
    headers: alphaHeaders,
  });
  assert.equal(delivered.status, 200);
  assert.deepEqual(JSON.parse(delivered.body), {
    ok: true,
    id: "alpha",
    settledTx: txHash,
  });
  assert.equal(verifierCalls, 1);
  assert.equal(fulfillmentCalls, 1);

  const recovered = await requestApp(app, {
    path: "/items/alpha",
    headers: alphaHeaders,
  });
  assert.equal(recovered.status, 200);
  assert.equal(recovered.body, delivered.body);
  assert.equal(recovered.headers["content-type"], delivered.headers["content-type"]);
  assert.equal(verifierCalls, 1);
  assert.equal(fulfillmentCalls, 1);

  const receipt = Object.freeze({
    proofVersion: 2,
    method: "GET",
    url: "http://127.0.0.1:4021/items/alpha",
    proof: alphaProof,
    receiptId: "3".repeat(64),
    txHash,
    mandateId,
  });
  const target = "http://127.0.0.1:4021/items/beta";
  const oldProofNewResource = await withAppFetch(app, () => expectBoundProofRejected({
    receipt,
    url: target,
  }));
  assert.equal(oldProofNewResource.status, 402);
  const rebound = await withAppFetch(app, () => expectReboundTransactionConflict({
    receipt,
    url: target,
    agent,
  }));
  assert.equal(rebound.status, 409);
  assert.equal(verifierCalls, 1);
  assert.equal(fulfillmentCalls, 1);

  const durable = JSON.parse(await readFile(redemptionPath, "utf8"));
  assert.equal(Object.keys(durable.records).length, 1);
  const stored = Object.values(durable.records)[0];
  assert.equal(stored.state, "completed");
  assert.equal(Buffer.from(stored.response.bodyBase64, "base64").toString("utf8"), delivered.body);
});

test("server closer is idempotent across concurrent and repeated calls", async () => {
  let closeCalls = 0;
  const fakeServer = {
    listening: true,
    close(callback) {
      closeCalls += 1;
      setImmediate(() => {
        this.listening = false;
        callback();
      });
    },
    closeAllConnections() {
      throw new Error("timeout path should not run");
    },
  };
  const close = createIdempotentServerCloser(fakeServer, 1_000);
  await Promise.all([close(), close(), close()]);
  await close();
  assert.equal(closeCalls, 1);
});

test("durable result commits are idempotent and conflicting receipt reuse fails", async (t) => {
  const directory = await temporaryDirectory(t, "ackrate-shared-results-");
  const path = resolve(directory, "results.json");
  const store = new FileRunResultStore(path);
  const runId = await store.begin({ scenario: "fixture" });
  const receiptId = "d".repeat(64);
  const txHash = "a".repeat(64);
  const event = {
    type: "delivery_accepted",
    receiptId,
    txHash,
    path: "/items/alpha",
  };
  const first = await store.commitDelivery(runId, event);
  const second = await store.commitDelivery(runId, event);
  assert.equal(first.at, second.at);
  await assert.rejects(
    store.commitDelivery(runId, { ...event, txHash: "e".repeat(64) }),
    /already bound/,
  );
  const file = JSON.parse(await readFile(path, "utf8"));
  assert.equal(file.runs[0].events.length, 1);
  assert.deepEqual(await store.acceptedReceipts(), [{ receiptId, txHash }]);
});

test("settlement receipt storage detects envelope tampering", async (t) => {
  const directory = await temporaryDirectory(t, "ackrate-shared-receipts-");
  const path = resolve(directory, "pending.json");
  const store = new FileSettlementReceiptStore(path);
  const receipt = legacyReceipt();
  await store.savePending(receipt);
  assert.equal((await store.listPending())[0].receiptId, receipt.receiptId);
  const file = JSON.parse(await readFile(path, "utf8"));
  file.pending[receipt.receiptId].txHash = "e".repeat(64);
  await writeFile(path, `${JSON.stringify(file)}\n`, "utf8");
  await assert.rejects(store.listPending(), /proof does not match|integrity/);
});

test("redemption storage preserves one execution and exact completed bytes", async (t) => {
  const directory = await temporaryDirectory(t, "ackrate-shared-redemptions-");
  const store = new FileBoundRedemptionStore(resolve(directory, "redemptions.json"));
  const record = redemptionRecord();
  const claimed = await store.claim(record, "execution-1", 1_700_000_000);
  assert.equal(claimed.kind, "claimed");
  assert.equal((await store.claim(record, "execution-2", 1_700_000_001)).kind, "executing");
  assert.equal((await store.lookup(record.key, "e".repeat(64))).kind, "conflict");
  const completion = {
    key: record.key,
    proofDigest: record.proofDigest,
    executionId: "execution-1",
    response: storedResponse(),
  };
  assert.equal((await store.complete(completion)).kind, "completed");
  assert.equal((await store.complete(completion)).kind, "completed");
  assert.equal((await store.lookup(record.key, record.proofDigest)).kind, "completed");
  assert.equal((await store.listExecuting()).length, 0);
  assert.equal((await store.complete({ ...completion, response: storedResponse({ ok: false }) })).kind, "conflict");
});

test("safe reset refuses unresolved receipts and executing fulfillment", async (t) => {
  const directory = await temporaryDirectory(t, "ackrate-shared-reset-refuse-");
  const stateRoot = resolve(directory, "state");
  const archiveRoot = resolve(directory, "archive");
  const receipts = new FileSettlementReceiptStore(resolve(stateRoot, "pending-receipts.json"));
  await receipts.savePending(legacyReceipt());
  const unresolved = await inspectResetSafety({ stateRoot });
  assert.equal(unresolved.safe, false);
  assert.equal(unresolved.clearedAcceptedReceipts, 0);
  assert.equal(unresolved.unresolved.length, 1);
  await assert.rejects(
    runSafeReset({ stateRoot, archiveRoot }),
    (error) => error instanceof SafeResetRefusedError && error.report.unresolved.length === 1,
  );
  await access(stateRoot);

  await receipts.clearPending(legacyReceipt().receiptId);
  const redemptions = new FileBoundRedemptionStore(
    resolve(stateRoot, "fulfillment-redemptions.json"),
  );
  const record = redemptionRecord();
  await redemptions.claim(record, "execution-1", 1_700_000_000);
  const executing = await inspectResetSafety({ stateRoot });
  assert.equal(executing.safe, false);
  assert.equal(executing.executing.length, 1);
  await assert.rejects(runSafeReset({ stateRoot, archiveRoot }), SafeResetRefusedError);
  await access(stateRoot);
});

test("safe reset clears only durably accepted receipts and archives instead of deleting", async (t) => {
  const directory = await temporaryDirectory(t, "ackrate-shared-reset-archive-");
  const stateRoot = resolve(directory, "state");
  const archiveRoot = resolve(directory, "archive");
  const receipt = legacyReceipt();
  const receipts = new FileSettlementReceiptStore(resolve(stateRoot, "pending-receipts.json"));
  const results = new FileRunResultStore(resolve(stateRoot, "results.json"));
  await receipts.savePending(receipt);
  const runId = await results.begin({ scenario: "fixture" });
  await results.commitDelivery(runId, {
    type: "delivery_accepted",
    receiptId: receipt.receiptId,
    txHash: receipt.txHash,
    path: "/items/alpha",
  });

  const inspected = await inspectResetSafety({ stateRoot });
  assert.equal(inspected.safe, true);
  assert.equal(inspected.clearedAcceptedReceipts, 1);
  assert.equal((await receipts.listPending()).length, 0);
  const reset = await runSafeReset({
    stateRoot,
    archiveRoot,
    now: () => new Date("2026-07-16T12:00:00.000Z"),
  });
  assert.equal(reset.kind, "archived");
  await assert.rejects(access(stateRoot), /ENOENT/);
  await access(reset.destination);
});

test("scenario contract requires an explicit JSON-safe negative hook and final output", async () => {
  assert.throws(
    () => validateScenarioDefinition(Object.freeze({ id: "structural-lookalike" })),
    /requires a scenario returned by defineScenario/,
  );
  const evidence = validateNegativePathEvidence({ code: "EXPIRED", unchanged: true });
  assert(Object.isFrozen(evidence));
  assert.throws(() => validateNegativePathEvidence(undefined), /must be a JSON object/);
  assert.throws(() => validateNegativePathEvidence({ spent: 1n }), /non-JSON/);
  assert.deepEqual(
    validateNegativePathEvent({ type: "expiry-rejected", code: "EXPIRED" }),
    { type: "expiry-rejected", code: "EXPIRED" },
  );
  assert.throws(
    () => validateNegativePathEvent({ type: "expiry_rejected" }),
    /kebab-case/,
  );
  assert.throws(
    () => validateNegativePathEvent({ type: "negative_path_verified" }),
    /reserved/,
  );
});

test("testnet mandate state helper returns JSON-safe state and detects deltas via injection", async () => {
  const idBuffer = Buffer.alloc(32, 0xab);
  const mandate = {
    id: idBuffer.toString("hex"),
    idBuffer,
    user: Keypair.random().publicKey(),
    agent: Keypair.random().publicKey(),
    merchant: Keypair.random().publicKey(),
    asset: ackrate.testnet.nativeSac,
    maxAmount: 30_000_000n,
    expiry: Math.floor(Date.now() / 1_000) + 3_600,
    decimals: 7,
  };
  const before = await readTestnetMandateState({
    mandate,
    testLoadMandate: async (loadedId) => {
      assert.equal(Buffer.compare(loadedId, idBuffer), 0);
      return { seq: 2, spent: 20_000_000n, status: { tag: "Active", values: undefined } };
    },
  });
  assert.deepEqual(before, {
    mandateId: mandate.id,
    seq: 2,
    spentStroops: "20000000",
    status: "Active",
  });
  assert.deepEqual(assertMandateStateUnchanged(before, { ...before }), {
    kind: "mandate-state-unchanged",
    mandateId: mandate.id,
    seq: 2,
    spentStroops: "20000000",
    status: "Active",
  });
  assert.throws(
    () => assertMandateStateUnchanged(before, { ...before, seq: 3 }),
    /changed unexpectedly at seq/,
  );
  await assert.rejects(
    readTestnetMandateState({
      mandate,
      testLoadMandate: async () => ({ seq: -1, spent: 0n, status: { tag: "Active" } }),
    }),
    /invalid shape/,
  );
});

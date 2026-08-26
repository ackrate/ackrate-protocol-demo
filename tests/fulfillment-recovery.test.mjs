import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
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
  encodePaymentProof,
  parse402,
} from "@ackrate/core";
import {
  createFulfillmentApp,
  createFulfillmentMetrics,
  rejectWithoutPayment,
} from "../starter-kit-src/shared/fulfillment.mjs";
import { FileBoundRedemptionStore } from "../starter-kit-src/shared/storage.mjs";

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
    for (const [name, value] of Object.entries({ host: "127.0.0.1", ...headers })) {
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
      socket.destroy();
      resolvePromise({
        status: response.statusCode,
        headers: response.getHeaders(),
        body,
      });
    });
    try {
      app(request, response);
    } catch (error) {
      reject(error);
    }
  });
}

async function temporaryDirectory(t, prefix) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

const CAPABILITY_HEADERS = Object.freeze({
  [ACKRATE_PAYMENT_CAPABILITIES_HEADER]: BOUND_PAYMENT_CAPABILITY,
});

async function challenge(app, path) {
  const response = await requestApp(app, { path, headers: CAPABILITY_HEADERS });
  assert.equal(response.status, 402, response.body);
  return parse402(new Response(response.body, { status: 402 }));
}

function paidHeaders(requirement, { txHash, mandateId, agent }) {
  const proof = createBoundPaymentProof({
    challenge: requirement.challenge,
    txHash,
    mandateId,
    signer: agent,
  });
  return Object.freeze({
    proof,
    headers: Object.freeze({
      ...CAPABILITY_HEADERS,
      [X_PAYMENT_HEADER]: encodePaymentProof(proof),
    }),
  });
}

function verifiedPayment({ requirement, txHash, mandateId, user, agent }) {
  return Object.freeze({
    txHash,
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
  });
}

function storedJson(body) {
  const bytes = Buffer.from(JSON.stringify(body), "utf8");
  return Object.freeze({
    status: 200,
    contentType: "application/json; charset=utf-8",
    bodyBase64: bytes.toString("base64"),
    bodySha256: createHash("sha256").update(bytes).digest("hex"),
  });
}

test("scenario callbacks receive only a frozen sanitized request view", async (t) => {
  const stateRoot = await temporaryDirectory(t, "ackrate-fulfillment-sanitized-");
  const merchant = Keypair.random().publicKey();
  const user = Keypair.random().publicKey();
  const agent = Keypair.random();
  const txHash = "1".repeat(64);
  const mandateId = "2".repeat(64);
  const seen = [];
  let freeView;

  const app = createFulfillmentApp({
    merchant,
    audience: "http://127.0.0.1:4021",
    challengeSecret: "s".repeat(32),
    routePattern: "/items/:id",
    amount(request) {
      seen.push(["amount", request]);
      return "1.00";
    },
    stateRoot,
    configureFreeRoutes(routes) {
      assert.deepEqual(Object.keys(routes), ["get"]);
      routes.get("/catalog/:id", (request) => {
        freeView = request;
        return { body: { id: request.params.id } };
      });
    },
    preflight(request) {
      seen.push(["preflight", request]);
      return { id: request.params.id, priceXlm: "1.00" };
    },
    fulfill({ request, payment, preflight }) {
      seen.push(["fulfill", request]);
      assert.equal(payment.txHash, txHash);
      assert.equal(Object.isFrozen(preflight), true);
      return { status: 200, body: { ok: true, id: preflight.id } };
    },
    testVerifier: {
      async verify(candidateTxHash, requirement) {
        assert.equal(candidateTxHash, txHash);
        return {
          ok: true,
          payment: verifiedPayment({ requirement, txHash, mandateId, user, agent }),
        };
      },
    },
  });

  const free = await requestApp(app, { path: "/catalog/public?view=summary" });
  assert.equal(free.status, 200);
  assert.deepEqual(JSON.parse(free.body), { id: "public" });
  assert.deepEqual(Object.keys(freeView), ["method", "path", "params", "query"]);

  const path = "/items/alpha?tag=b&tag=a&view=full";
  const requirement = await challenge(app, path);
  const paid = paidHeaders(requirement, { txHash, mandateId, agent });
  const delivered = await requestApp(app, { path, headers: paid.headers });
  assert.equal(delivered.status, 200);
  assert.deepEqual(JSON.parse(delivered.body), { ok: true, id: "alpha" });

  for (const [stage, request] of seen) {
    assert.deepEqual(Object.keys(request), ["method", "path", "params", "query"], stage);
    assert.equal(Object.isFrozen(request), true, stage);
    assert.equal(Object.isFrozen(request.params), true, stage);
    assert.equal(Object.isFrozen(request.query), true, stage);
    assert.equal(request.method, "GET", stage);
    assert.equal(request.path, "/items/alpha", stage);
    assert.equal(request.params.id, "alpha", stage);
    assert.deepEqual(request.query.tag, ["b", "a"], stage);
    assert.equal(Object.isFrozen(request.query.tag), true, stage);
    assert.equal(request.query.view, "full", stage);
    assert.equal(request.headers, undefined, stage);
    assert.equal(request.rawHeaders, undefined, stage);
    assert.equal(request.get, undefined, stage);
    assert.throws(() => {
      request.method = "POST";
    }, TypeError, stage);
  }
  assert.equal(seen.some(([, value]) => JSON.stringify(value).includes(paid.headers[X_PAYMENT_HEADER])), false);
});

test("fresh apps recover exact completed bytes before missing, stale, or changed preflight", async (t) => {
  const stateRoot = await temporaryDirectory(t, "ackrate-fulfillment-restart-");
  const redemptionStore = new FileBoundRedemptionStore(
    resolve(stateRoot, "fulfillment-redemptions.json"),
  );
  const merchant = Keypair.random().publicKey();
  const user = Keypair.random().publicKey();
  const agent = Keypair.random();
  const txHash = "3".repeat(64);
  const mandateId = "4".repeat(64);
  const challengeSecret = "r".repeat(32);
  const path = "/items/alpha";
  let firstVerifierCalls = 0;
  let firstFulfillmentCalls = 0;
  const firstMetrics = createFulfillmentMetrics();

  const firstApp = createFulfillmentApp({
    merchant,
    audience: "http://127.0.0.1:4021",
    challengeSecret,
    routePattern: "/items/:id",
    amount: "1.00",
    redemptionStore,
    stateRoot,
    metrics: firstMetrics,
    preflight(request) {
      return { id: request.params.id, priceXlm: "1.00" };
    },
    fulfill({ payment, preflight }) {
      firstFulfillmentCalls += 1;
      return { body: { ok: true, id: preflight.id, settledTx: payment.txHash } };
    },
    testVerifier: {
      async verify(candidateTxHash, requirement) {
        firstVerifierCalls += 1;
        return {
          ok: true,
          payment: verifiedPayment({
            requirement,
            txHash: candidateTxHash,
            mandateId,
            user,
            agent,
          }),
        };
      },
    },
  });
  const requirement = await challenge(firstApp, path);
  const paid = paidHeaders(requirement, { txHash, mandateId, agent });
  const delivered = await requestApp(firstApp, { path, headers: paid.headers });
  assert.equal(delivered.status, 200);
  assert.equal(firstVerifierCalls, 1);
  assert.equal(firstFulfillmentCalls, 1);
  assert.deepEqual(firstMetrics.snapshot(), {
    verificationCalls: 1,
    fulfillmentCalls: 1,
  });

  const changedPreflights = [
    () => null,
    () => rejectWithoutPayment(410, "fixture-stale"),
    () => ({ id: "alpha", priceXlm: "2.00" }),
  ];
  for (const changedPreflight of changedPreflights) {
    let preflightCalls = 0;
    let fulfillmentCalls = 0;
    let verifierCalls = 0;
    const restartMetrics = createFulfillmentMetrics();
    const restarted = createFulfillmentApp({
      merchant,
      audience: "http://127.0.0.1:4021",
      challengeSecret,
      routePattern: "/items/:id",
      amount: "2.00",
      redemptionStore: new FileBoundRedemptionStore(
        resolve(stateRoot, "fulfillment-redemptions.json"),
      ),
      stateRoot,
      metrics: restartMetrics,
      preflight(request) {
        preflightCalls += 1;
        return changedPreflight(request);
      },
      fulfill() {
        fulfillmentCalls += 1;
        return { body: { ok: false } };
      },
      testVerifier: {
        async verify() {
          verifierCalls += 1;
          throw new Error("recovery must not call the verifier");
        },
      },
    });
    const recovered = await requestApp(restarted, { path, headers: paid.headers });
    assert.equal(recovered.status, 200);
    assert.equal(recovered.body, delivered.body);
    assert.equal(recovered.headers["content-type"], delivered.headers["content-type"]);
    assert.equal(preflightCalls, 0);
    assert.equal(fulfillmentCalls, 0);
    assert.equal(verifierCalls, 0);
    assert.deepEqual(restartMetrics.snapshot(), {
      verificationCalls: 0,
      fulfillmentCalls: 0,
    });
  }

  const recoveryApp = createFulfillmentApp({
    merchant,
    audience: "http://127.0.0.1:4021",
    challengeSecret,
    routePattern: "/items/:id",
    amount: "1.00",
    redemptionStore: new FileBoundRedemptionStore(
      resolve(stateRoot, "fulfillment-redemptions.json"),
    ),
    stateRoot,
    preflight(request) {
      return { id: request.params.id, priceXlm: "1.00" };
    },
    fulfill() {
      throw new Error("recovery app must not fulfill");
    },
    testVerifier: {
      async verify() {
        throw new Error("recovery app must not verify");
      },
    },
  });

  const reboundOldProof = await requestApp(recoveryApp, {
    path: "/items/beta",
    headers: paid.headers,
  });
  assert.equal(reboundOldProof.status, 402);

  const betaRequirement = await challenge(recoveryApp, "/items/beta");
  const rebound = paidHeaders(betaRequirement, { txHash, mandateId, agent });
  const reusedTransaction = await requestApp(recoveryApp, {
    path: "/items/beta",
    headers: rebound.headers,
  });
  assert.equal(reusedTransaction.status, 409);
});

test("preflight price is mandatory and must equal the exact challenge amount", async (t) => {
  const stateRoot = await temporaryDirectory(t, "ackrate-fulfillment-price-");
  for (const preflight of [
    () => ({ id: "alpha" }),
    () => ({ id: "alpha", priceXlm: "1.0" }),
    () => ({ id: "alpha", priceXlm: "2.00" }),
  ]) {
    let verifierCalls = 0;
    const app = createFulfillmentApp({
      merchant: Keypair.random().publicKey(),
      audience: "http://127.0.0.1:4021",
      challengeSecret: "p".repeat(32),
      routePattern: "/items/:id",
      amount: "1.00",
      stateRoot,
      preflight,
      fulfill: () => ({ body: { ok: true } }),
      testVerifier: {
        async verify() {
          verifierCalls += 1;
          throw new Error("invalid price must stop before verification");
        },
      },
    });
    const response = await requestApp(app, {
      path: "/items/alpha",
      headers: CAPABILITY_HEADERS,
    });
    assert.equal(response.status, 500);
    assert.equal(verifierCalls, 0);
  }
});

test("an authenticated quote survives first-delivery price and availability changes", async (t) => {
  const merchant = Keypair.random().publicKey();
  const user = Keypair.random().publicKey();
  const agent = Keypair.random();
  const challengeSecret = "q".repeat(32);

  {
    const stateRoot = await temporaryDirectory(t, "ackrate-first-delivery-price-");
    const txHash = "c".repeat(64);
    const mandateId = "d".repeat(64);
    let price = "1.00";
    let deliveredPreflight;
    const app = createFulfillmentApp({
      merchant,
      audience: "http://127.0.0.1:4021",
      challengeSecret,
      routePattern: "/items/:id",
      amount: () => price,
      stateRoot,
      preflight: (request) => ({ id: request.params.id, priceXlm: price }),
      fulfill({ preflight }) {
        deliveredPreflight = preflight;
        return { body: { ok: true, quotedPrice: preflight.priceXlm } };
      },
      testVerifier: {
        async verify(candidateTxHash, requirement) {
          return {
            ok: true,
            payment: verifiedPayment({
              requirement,
              txHash: candidateTxHash,
              mandateId,
              user,
              agent,
            }),
          };
        },
      },
    });
    const requirement = await challenge(app, "/items/alpha");
    assert.equal(requirement.amount, "1.00");
    const paid = paidHeaders(requirement, { txHash, mandateId, agent });
    price = "2.00";
    const delivered = await requestApp(app, {
      path: "/items/alpha",
      headers: paid.headers,
    });
    assert.equal(delivered.status, 200);
    assert.deepEqual(JSON.parse(delivered.body), { ok: true, quotedPrice: "1.0000000" });
    assert.equal(deliveredPreflight.priceXlm, "1.0000000");
  }

  {
    const stateRoot = await temporaryDirectory(t, "ackrate-first-delivery-missing-");
    const txHash = "e".repeat(64);
    const mandateId = "f".repeat(64);
    let available = true;
    let verifierCalls = 0;
    let fulfillmentCalls = 0;
    const app = createFulfillmentApp({
      merchant,
      audience: "http://127.0.0.1:4021",
      challengeSecret,
      routePattern: "/items/:id",
      amount: "1.00",
      stateRoot,
      preflight: (request) => (
        available ? { id: request.params.id, priceXlm: "1.00" } : null
      ),
      fulfill() {
        fulfillmentCalls += 1;
        return { body: { ok: true } };
      },
      testVerifier: {
        async verify(candidateTxHash, requirement) {
          verifierCalls += 1;
          return {
            ok: true,
            payment: verifiedPayment({
              requirement,
              txHash: candidateTxHash,
              mandateId,
              user,
              agent,
            }),
          };
        },
      },
    });
    const requirement = await challenge(app, "/items/alpha");
    const paid = paidHeaders(requirement, { txHash, mandateId, agent });
    available = false;
    const first = await requestApp(app, { path: "/items/alpha", headers: paid.headers });
    const recovered = await requestApp(app, { path: "/items/alpha", headers: paid.headers });
    assert.equal(first.status, 200);
    assert.equal(recovered.status, 200);
    assert.equal(recovered.body, first.body);
    assert.deepEqual(JSON.parse(first.body), {
      ok: false,
      error: "paid fulfillment failed after settlement",
      deliveryState: "terminal",
    });
    assert.equal(verifierCalls, 1);
    assert.equal(fulfillmentCalls, 0);
  }
});

test("an expired proof recovers a payment time-bound to its authenticated quote", async (t) => {
  const stateRoot = await temporaryDirectory(t, "ackrate-expired-proof-recovery-");
  const merchant = Keypair.random().publicKey();
  const user = Keypair.random().publicKey();
  const agent = Keypair.random();
  const txHash = "6".repeat(64);
  const mandateId = "7".repeat(64);
  let quotedIssuedAt;
  let quotedExpiresAt;
  let verifierCalls = 0;
  let timingCalls = 0;
  const verifier = {
    async verify(candidateTxHash, requirement) {
      verifierCalls += 1;
      return {
        ok: true,
        payment: verifiedPayment({
          requirement,
          txHash: candidateTxHash,
          mandateId,
          user,
          agent,
        }),
      };
    },
    async transactionTiming(candidateTxHash) {
      timingCalls += 1;
      assert.equal(candidateTxHash, txHash);
      return {
        maxTime: quotedExpiresAt - 121,
        createdAt: quotedIssuedAt + 5,
      };
    },
  };
  const app = createFulfillmentApp({
    merchant,
    audience: "http://127.0.0.1:4021",
    challengeSecret: "x".repeat(32),
    routePattern: "/items/:id",
    amount: "1.00",
    stateRoot,
    preflight: (request) => ({ id: request.params.id, priceXlm: "1.00" }),
    fulfill: ({ preflight }) => ({ body: { ok: true, id: preflight.id } }),
    testVerifier: verifier,
  });
  const requirement = await challenge(app, "/items/alpha");
  quotedIssuedAt = requirement.challenge.issuedAt;
  quotedExpiresAt = requirement.challenge.expiresAt;
  const paid = paidHeaders(requirement, { txHash, mandateId, agent });
  const originalNow = Date.now;
  Date.now = () => (quotedExpiresAt + 1) * 1_000;
  try {
    const first = await requestApp(app, { path: "/items/alpha", headers: paid.headers });
    const recovered = await requestApp(app, { path: "/items/alpha", headers: paid.headers });
    assert.equal(first.status, 200);
    assert.equal(recovered.status, 200);
    assert.equal(recovered.body, first.body);
    assert.deepEqual(JSON.parse(first.body), { ok: true, id: "alpha" });
    assert.equal(verifierCalls, 1);
    assert.equal(timingCalls, 1);
  } finally {
    Date.now = originalNow;
  }
});

test("late recovery rejects a transaction window that outlives its quote", async (t) => {
  const stateRoot = await temporaryDirectory(t, "ackrate-expired-proof-window-");
  const merchant = Keypair.random().publicKey();
  const agent = Keypair.random();
  const txHash = "8".repeat(64);
  const mandateId = "9".repeat(64);
  let quotedIssuedAt;
  let quotedExpiresAt;
  let verifierCalls = 0;
  const app = createFulfillmentApp({
    merchant,
    audience: "http://127.0.0.1:4021",
    challengeSecret: "w".repeat(32),
    routePattern: "/items/:id",
    amount: "1.00",
    stateRoot,
    preflight: (request) => ({ id: request.params.id, priceXlm: "1.00" }),
    fulfill: () => ({ body: { ok: true } }),
    testVerifier: {
      async verify() {
        verifierCalls += 1;
        throw new Error("unsafe transaction timing must stop before chain verification");
      },
      async transactionTiming() {
        return {
          maxTime: quotedExpiresAt - 119,
          createdAt: quotedIssuedAt + 5,
        };
      },
    },
  });
  const requirement = await challenge(app, "/items/alpha");
  quotedIssuedAt = requirement.challenge.issuedAt;
  quotedExpiresAt = requirement.challenge.expiresAt;
  const paid = paidHeaders(requirement, { txHash, mandateId, agent });
  const originalNow = Date.now;
  Date.now = () => (quotedExpiresAt + 1) * 1_000;
  try {
    const response = await requestApp(app, { path: "/items/alpha", headers: paid.headers });
    assert.equal(response.status, 402);
    assert.match(JSON.parse(response.body).error, /not time-bound/);
    assert.equal(verifierCalls, 0);
  } finally {
    Date.now = originalNow;
  }
});

test("late recovery rejects a payment confirmed before its authenticated quote", async (t) => {
  const stateRoot = await temporaryDirectory(t, "ackrate-expired-proof-old-payment-");
  const merchant = Keypair.random().publicKey();
  const agent = Keypair.random();
  const txHash = "a".repeat(64);
  const mandateId = "b".repeat(64);
  let quotedIssuedAt;
  let quotedExpiresAt;
  let verifierCalls = 0;
  const app = createFulfillmentApp({
    merchant,
    audience: "http://127.0.0.1:4021",
    challengeSecret: "z".repeat(32),
    routePattern: "/items/:id",
    amount: "1.00",
    stateRoot,
    preflight: (request) => ({ id: request.params.id, priceXlm: "1.00" }),
    fulfill: () => ({ body: { ok: true } }),
    testVerifier: {
      async verify() {
        verifierCalls += 1;
        throw new Error("pre-quote payment must stop before chain verification");
      },
      async transactionTiming() {
        return {
          maxTime: quotedExpiresAt - 121,
          createdAt: quotedIssuedAt - 11,
        };
      },
    },
  });
  const requirement = await challenge(app, "/items/alpha");
  quotedIssuedAt = requirement.challenge.issuedAt;
  quotedExpiresAt = requirement.challenge.expiresAt;
  const paid = paidHeaders(requirement, { txHash, mandateId, agent });
  const originalNow = Date.now;
  Date.now = () => (quotedExpiresAt + 1) * 1_000;
  try {
    const response = await requestApp(app, { path: "/items/alpha", headers: paid.headers });
    assert.equal(response.status, 402);
    assert.match(JSON.parse(response.body).error, /not time-bound/);
    assert.equal(verifierCalls, 0);
  } finally {
    Date.now = originalNow;
  }
});

test("late recovery fails closed on corrupted claim and completion records", async (t) => {
  for (const corruption of ["claim-key", "completion-substitution"]) {
    const merchant = Keypair.random().publicKey();
    const user = Keypair.random().publicKey();
    const agent = Keypair.random();
    const txHash = corruption === "claim-key" ? "c".repeat(64) : "d".repeat(64);
    const mandateId = corruption === "claim-key" ? "e".repeat(64) : "f".repeat(64);
    let quotedIssuedAt;
    let quotedExpiresAt;
    let fulfillmentCalls = 0;
    let claimedRecord;
    const hostileStore = {
      async lookup() {
        return { kind: "missing" };
      },
      async claim(record, executionId, startedAt) {
        claimedRecord = Object.freeze({
          ...record,
          key: corruption === "claim-key" ? `${record.key}:corrupt` : record.key,
          executionId,
          startedAt,
          state: "executing",
        });
        if (corruption === "claim-key") {
          return {
            kind: "completed",
            record: Object.freeze({
              ...claimedRecord,
              state: "completed",
              response: storedJson({ forged: true }),
            }),
          };
        }
        return { kind: "claimed", record: claimedRecord };
      },
      async complete(completion) {
        assert.equal(corruption, "completion-substitution");
        return {
          kind: "completed",
          record: Object.freeze({
            ...claimedRecord,
            executionId: `${completion.executionId}:corrupt`,
            state: "completed",
            response: storedJson({ forged: true }),
          }),
        };
      },
    };
    const app = createFulfillmentApp({
      merchant,
      audience: "http://127.0.0.1:4021",
      challengeSecret: "y".repeat(32),
      routePattern: "/items/:id",
      amount: "1.00",
      redemptionStore: hostileStore,
      preflight: (request) => ({ id: request.params.id, priceXlm: "1.00" }),
      fulfill() {
        fulfillmentCalls += 1;
        return { body: { legitimate: true } };
      },
      testVerifier: {
        async verify(candidateTxHash, requirement) {
          return {
            ok: true,
            payment: verifiedPayment({
              requirement,
              txHash: candidateTxHash,
              mandateId,
              user,
              agent,
            }),
          };
        },
        async transactionTiming() {
          return {
            maxTime: quotedExpiresAt - 121,
            createdAt: quotedIssuedAt + 5,
          };
        },
      },
    });
    const requirement = await challenge(app, "/items/alpha");
    quotedIssuedAt = requirement.challenge.issuedAt;
    quotedExpiresAt = requirement.challenge.expiresAt;
    const paid = paidHeaders(requirement, { txHash, mandateId, agent });
    const originalNow = Date.now;
    Date.now = () => (quotedExpiresAt + 1) * 1_000;
    try {
      const response = await requestApp(app, { path: "/items/alpha", headers: paid.headers });
      assert.equal(response.status, 503, corruption);
      assert.deepEqual(JSON.parse(response.body), {
        error: "payment redemption store is unavailable; retry with the same proof",
        retryable: true,
      });
      assert.equal(
        fulfillmentCalls,
        corruption === "claim-key" ? 0 : 1,
        corruption,
      );
      assert.doesNotMatch(response.body, /forged|legitimate/, corruption);
    } finally {
      Date.now = originalNow;
    }
  }
});

test("paid route patterns cannot be shadowed by the free health endpoint", async (t) => {
  for (const routePattern of ["/health", "/:id"]) {
    const stateRoot = await temporaryDirectory(t, "ackrate-health-collision-");
    let preflightCalls = 0;
    const app = createFulfillmentApp({
      merchant: Keypair.random().publicKey(),
      audience: "http://127.0.0.1:4021",
      challengeSecret: "h".repeat(32),
      routePattern,
      amount: "1.00",
      stateRoot,
      preflight(request) {
        preflightCalls += 1;
        return { id: request.params.id ?? "health", priceXlm: "1.00" };
      },
      fulfill: () => ({ body: { ok: true } }),
      testVerifier: {
        async verify() {
          throw new Error("an unpaid collision check must not reach verification");
        },
      },
    });

    const response = await requestApp(app, {
      path: "/health",
      headers: CAPABILITY_HEADERS,
    });
    assert.equal(response.status, 402, routePattern);
    const requirement = await parse402(new Response(response.body, { status: 402 }));
    assert.equal(requirement.resource, "/health", routePattern);
    assert.equal(preflightCalls, 1, routePattern);
  }

  const ordinary = createFulfillmentApp({
    merchant: Keypair.random().publicKey(),
    audience: "http://127.0.0.1:4021",
    challengeSecret: "i".repeat(32),
    routePattern: "/items/:id",
    amount: "1.00",
    stateRoot: await temporaryDirectory(t, "ackrate-health-ordinary-"),
    preflight: (request) => ({ id: request.params.id, priceXlm: "1.00" }),
    fulfill: () => ({ body: { ok: true } }),
    testVerifier: { async verify() { throw new Error("not expected"); } },
  });
  const health = await requestApp(ordinary, { path: "/health" });
  assert.equal(health.status, 200);
  assert.deepEqual(JSON.parse(health.body), { ok: true, network: "stellar-testnet" });
});

test("paid fulfillment never emits 201 or 204 and recovers its terminal JSON", async (t) => {
  for (const rejectedStatus of [201, 204]) {
    const stateRoot = await temporaryDirectory(t, `ackrate-fulfillment-${rejectedStatus}-`);
    const merchant = Keypair.random().publicKey();
    const user = Keypair.random().publicKey();
    const agent = Keypair.random();
    const txHash = String(rejectedStatus % 10).repeat(64);
    const mandateId = "8".repeat(64);
    let fulfillmentCalls = 0;
    const app = createFulfillmentApp({
      merchant,
      audience: "http://127.0.0.1:4021",
      challengeSecret: "j".repeat(32),
      routePattern: "/items/:id",
      amount: "1.00",
      stateRoot,
      preflight: (request) => ({ id: request.params.id, priceXlm: "1.00" }),
      fulfill() {
        fulfillmentCalls += 1;
        return { status: rejectedStatus, body: { ok: true } };
      },
      testVerifier: {
        async verify(candidateTxHash, requirement) {
          return {
            ok: true,
            payment: verifiedPayment({
              requirement,
              txHash: candidateTxHash,
              mandateId,
              user,
              agent,
            }),
          };
        },
      },
    });
    const requirement = await challenge(app, "/items/alpha");
    const paid = paidHeaders(requirement, { txHash, mandateId, agent });
    const first = await requestApp(app, { path: "/items/alpha", headers: paid.headers });
    assert.equal(first.status, 200);
    assert.deepEqual(JSON.parse(first.body), {
      ok: false,
      error: "paid fulfillment failed after settlement",
      deliveryState: "terminal",
    });
    const recovered = await requestApp(app, { path: "/items/alpha", headers: paid.headers });
    assert.equal(recovered.status, 200);
    assert.equal(recovered.body, first.body);
    assert.equal(fulfillmentCalls, 1);
  }
});

test("verifier and redemption-store outages fail closed without fulfillment", async (t) => {
  const merchant = Keypair.random().publicKey();
  const user = Keypair.random().publicKey();
  const agent = Keypair.random();
  const mandateId = "9".repeat(64);

  {
    const stateRoot = await temporaryDirectory(t, "ackrate-verifier-outage-");
    const txHash = "a".repeat(64);
    let fulfillmentCalls = 0;
    const app = createFulfillmentApp({
      merchant,
      audience: "http://127.0.0.1:4021",
      challengeSecret: "v".repeat(32),
      routePattern: "/items/:id",
      amount: "1.00",
      stateRoot,
      preflight: (request) => ({ id: request.params.id, priceXlm: "1.00" }),
      fulfill() {
        fulfillmentCalls += 1;
        return { body: { ok: true } };
      },
      testVerifier: {
        async verify() {
          throw new Error("RPC unavailable");
        },
      },
    });
    const requirement = await challenge(app, "/items/alpha");
    const paid = paidHeaders(requirement, { txHash, mandateId, agent });
    const response = await requestApp(app, { path: "/items/alpha", headers: paid.headers });
    assert.equal(response.status, 503);
    assert.equal(fulfillmentCalls, 0);
  }

  {
    const txHash = "b".repeat(64);
    let verifierCalls = 0;
    let fulfillmentCalls = 0;
    const unavailableStore = {
      async lookup() {
        throw new Error("store unavailable");
      },
      async claim() {
        throw new Error("store unavailable");
      },
      async complete() {
        throw new Error("store unavailable");
      },
    };
    const app = createFulfillmentApp({
      merchant,
      audience: "http://127.0.0.1:4021",
      challengeSecret: "o".repeat(32),
      routePattern: "/items/:id",
      amount: "1.00",
      redemptionStore: unavailableStore,
      preflight: (request) => ({ id: request.params.id, priceXlm: "1.00" }),
      fulfill() {
        fulfillmentCalls += 1;
        return { body: { ok: true } };
      },
      testVerifier: {
        async verify(candidateTxHash, requirement) {
          verifierCalls += 1;
          return {
            ok: true,
            payment: verifiedPayment({
              requirement,
              txHash: candidateTxHash,
              mandateId,
              user,
              agent,
            }),
          };
        },
      },
    });
    const requirement = await challenge(app, "/items/alpha");
    const paid = paidHeaders(requirement, { txHash, mandateId, agent });
    const response = await requestApp(app, { path: "/items/alpha", headers: paid.headers });
    assert.equal(response.status, 503);
    assert.deepEqual(JSON.parse(response.body), {
      error: "payment redemption store is unavailable; retry with the same proof",
      retryable: true,
    });
    assert.equal(verifierCalls, 0);
    assert.equal(fulfillmentCalls, 0);
  }
});

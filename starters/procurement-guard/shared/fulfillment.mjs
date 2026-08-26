import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { Buffer } from "node:buffer";
import { resolve } from "node:path";
import express from "express";
import { rpc, TransactionBuilder } from "@stellar/stellar-sdk";
import {
  BOUND_PAYMENT_SCHEME,
  X_PAYMENT_HEADER,
  boundChallengeAuthorizationBytes,
  decodePaymentProof,
  isBoundPaymentProof,
  ackrate,
  verifyBoundPaymentProofSignature,
} from "@ackrate/core";
import {
  createBoundAckratePaidJsonRoute,
  createRedemptionKey,
  createStellarPaymentVerifier,
} from "@ackrate/express-middleware";
import {
  validateChallengeSecret,
  validateExactOrigin,
  validateMerchant,
  validatePort,
  validatePositiveAmount,
  validateRequestPath,
  validateRoutePattern,
} from "./config.mjs";
import { closeHttpServer, createIdempotentServerCloser } from "./http.mjs";
import { FileBoundRedemptionStore } from "./storage.mjs";

const PREFLIGHT = Symbol("ackrate.fulfillment.preflight");
const SAFE_REQUEST = Symbol("ackrate.fulfillment.safe-request");
const RECOVERY_PRICE = Symbol("ackrate.fulfillment.recovery-price");
const AUTHENTICATED_QUOTE = Symbol("ackrate.fulfillment.authenticated-quote");
const NON_BILLABLE_STATUSES = new Set([400, 404, 409, 410, 422]);
const MAX_REQUEST_COMPONENT_BYTES = 8_192;
const MAX_REQUEST_FIELDS = 64;
const MAX_PAYMENT_HEADER_BYTES = 8_192;
const CHALLENGE_TTL_SECONDS = 900;
const PAYMENT_DELIVERY_MARGIN_SECONDS = 120;
const SETTLEMENT_CLOCK_TOLERANCE_SECONDS = 10;
const MAX_STORED_RESPONSE_BYTES = 1_048_576;
const TERMINAL_BODY = Object.freeze({
  ok: false,
  error: "paid fulfillment failed after settlement",
  deliveryState: "terminal",
});
const fulfillmentMetricStates = new WeakMap();

export function createFulfillmentMetrics() {
  const state = { verificationCalls: 0, fulfillmentCalls: 0 };
  const metrics = Object.freeze({
    snapshot() {
      return Object.freeze({
        verificationCalls: state.verificationCalls,
        fulfillmentCalls: state.fulfillmentCalls,
      });
    },
  });
  fulfillmentMetricStates.set(metrics, state);
  return metrics;
}

function instrumentVerifier(verifier, metricsState) {
  if (!metricsState) return verifier;
  return Object.freeze({
    async verify(...args) {
      metricsState.verificationCalls += 1;
      return verifier.verify(...args);
    },
  });
}

export class NonBillableResponseError extends Error {
  constructor(status, code) {
    if (!NON_BILLABLE_STATUSES.has(status)) {
      throw new Error("non-billable status must be 400, 404, 409, 410, or 422");
    }
    if (typeof code !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code)) {
      throw new Error("non-billable error code must be a lowercase kebab-case identifier");
    }
    super(code);
    this.name = "NonBillableResponseError";
    this.status = status;
    this.code = code;
  }
}

export function rejectWithoutPayment(status, code) {
  throw new NonBillableResponseError(status, code);
}

function exactAudience(value) {
  if (typeof value === "function") {
    return (request) => validateExactOrigin(value(safeRequest(request)), "payment audience");
  }
  return validateExactOrigin(value, "payment audience");
}

function exactAmount(value) {
  if (typeof value === "function") {
    return (request) => validatePositiveAmount(value(safeRequest(request)), 7, "request price");
  }
  return validatePositiveAmount(value, 7, "request price");
}

function exactRequestText(value, label) {
  if (
    typeof value !== "string"
    || value.length === 0
    || /[\0\r\n]/.test(value)
    || Buffer.byteLength(value, "utf8") > MAX_REQUEST_COMPONENT_BYTES
  ) {
    throw new Error(`${label} is not a safe request value`);
  }
  return value;
}

function frozenParams(request) {
  const entries = Object.entries(request.params ?? {});
  if (entries.length > MAX_REQUEST_FIELDS) throw new Error("request has too many route parameters");
  const params = Object.create(null);
  for (const [rawName, rawValue] of entries) {
    const name = exactRequestText(rawName, "route parameter name");
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) {
      throw new Error("route parameter name is not supported");
    }
    Object.defineProperty(params, name, {
      value: exactRequestText(rawValue, `route parameter ${name}`),
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  return Object.freeze(params);
}

function frozenQuery(url) {
  const names = [...new Set(url.searchParams.keys())].sort();
  if (names.length > MAX_REQUEST_FIELDS) throw new Error("request has too many query parameters");
  const query = Object.create(null);
  for (const rawName of names) {
    const name = exactRequestText(rawName, "query parameter name");
    const values = url.searchParams.getAll(rawName).map((value) => (
      exactRequestText(value, `query parameter ${name}`)
    ));
    Object.defineProperty(query, name, {
      value: values.length === 1 ? values[0] : Object.freeze(values),
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  return Object.freeze(query);
}

function safeRequest(request) {
  if (Object.hasOwn(request, SAFE_REQUEST)) return request[SAFE_REQUEST];
  const requestPath = validateRequestPath(request.originalUrl);
  const parsed = new URL(requestPath, "http://127.0.0.1");
  const view = Object.freeze({
    method: exactRequestText(request.method, "request method").toUpperCase(),
    path: parsed.pathname,
    params: frozenParams(request),
    query: frozenQuery(parsed),
  });
  Object.defineProperty(request, SAFE_REQUEST, {
    value: view,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return view;
}

function oneCanonicalPaymentHeader(request) {
  const values = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() === X_PAYMENT_HEADER) {
      values.push(request.rawHeaders[index + 1]);
    }
  }
  if (values.length !== 1) return undefined;
  const header = values[0];
  if (
    typeof header !== "string"
    || header.length === 0
    || header.includes(",")
    || Buffer.byteLength(header, "utf8") > MAX_PAYMENT_HEADER_BYTES
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(header)
    || Buffer.from(header, "base64").toString("base64") !== header
  ) {
    return undefined;
  }
  return header;
}

function inspectBoundProof(request) {
  const header = oneCanonicalPaymentHeader(request);
  if (!header) return undefined;
  try {
    const proof = decodePaymentProof(header);
    if (!isBoundPaymentProof(proof)) return undefined;
    return Object.freeze({
      proof,
      proofDigest: createHash("sha256").update(JSON.stringify(proof), "utf8").digest("hex"),
    });
  } catch {
    return undefined;
  }
}

function challengeMacIsValid(challenge, challengeSecret) {
  const encoded = challenge?.authorization?.mac;
  if (
    challenge?.authorization?.algorithm !== "hmac-sha256"
    || typeof encoded !== "string"
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)
  ) {
    return false;
  }
  const actual = Buffer.from(encoded, "base64");
  if (actual.toString("base64") !== encoded) return false;
  const secret = typeof challengeSecret === "string"
    ? Buffer.from(challengeSecret, "utf8")
    : Buffer.from(challengeSecret);
  const expected = createHmac("sha256", secret)
    .update(boundChallengeAuthorizationBytes(challenge))
    .digest();
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function decimalFromStroops(value, decimals) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error("bound proof amount is invalid");
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 38) {
    throw new Error("bound proof decimals are invalid");
  }
  const padded = value.padStart(decimals + 1, "0");
  const whole = decimals === 0 ? padded : padded.slice(0, -decimals);
  const fraction = decimals === 0 ? "" : padded.slice(-decimals);
  const amount = fraction.length === 0 ? whole : `${whole}.${fraction}`;
  return validatePositiveAmount(amount, decimals, "bound proof price");
}

function sendRecoveryUnavailable(response) {
  response.status(503);
  response.set("retry-after", "1");
  response.set("cache-control", "private, no-store");
  response.json({
    error: "payment redemption store is unavailable; retry with the same proof",
    retryable: true,
  });
}

function jsonResult(result, label, { exactStatus = 200 } = {}) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error(`${label} must return an object containing body`);
  }
  const status = result.status ?? exactStatus;
  if (status !== exactStatus) throw new Error(`${label} status must be exactly ${exactStatus}`);
  if (!Object.hasOwn(result, "body")) throw new Error(`${label} must return an object containing body`);
  let json;
  try {
    json = JSON.stringify(result.body);
  } catch {
    throw new Error(`${label} body must be JSON-serializable`);
  }
  if (json === undefined) throw new Error(`${label} body must be JSON-serializable`);
  return Object.freeze({ status: exactStatus, body: JSON.parse(json) });
}

function storedJsonResponse(result) {
  const normalized = jsonResult(result, "paid fulfillment");
  const bytes = Buffer.from(JSON.stringify(normalized.body), "utf8");
  if (bytes.length > MAX_STORED_RESPONSE_BYTES) {
    throw new Error("paid fulfillment body exceeds the safe stored-response limit");
  }
  return Object.freeze({
    status: 200,
    contentType: "application/json; charset=utf-8",
    bodyBase64: bytes.toString("base64"),
    bodySha256: createHash("sha256").update(bytes).digest("hex"),
  });
}

function terminalStoredResponse() {
  return storedJsonResponse({ status: 200, body: TERMINAL_BODY });
}

function sendStoredJson(response, stored) {
  if (
    stored?.status !== 200
    || stored.contentType !== "application/json; charset=utf-8"
    || !/^[0-9a-f]{64}$/.test(stored.bodySha256)
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(stored.bodyBase64)
  ) {
    throw new Error("stored paid response schema is invalid");
  }
  const bytes = Buffer.from(stored.bodyBase64, "base64");
  if (
    bytes.length > MAX_STORED_RESPONSE_BYTES
    || bytes.toString("base64") !== stored.bodyBase64
    || createHash("sha256").update(bytes).digest("hex") !== stored.bodySha256
  ) {
    throw new Error("stored paid response integrity check failed");
  }
  response.status(200);
  response.set("content-type", stored.contentType);
  response.set("content-length", String(bytes.length));
  response.set("cache-control", "private, no-store");
  response.set("x-content-type-options", "nosniff");
  response.end(bytes);
}

function configureSanitizedFreeRoutes(app, configureFreeRoutes) {
  if (!configureFreeRoutes) return;
  let configuring = true;
  const registrar = Object.freeze({
    get(routePattern, handler) {
      if (!configuring) throw new Error("free routes can be registered only during configuration");
      const checkedPattern = validateRoutePattern(routePattern);
      if (typeof handler !== "function") throw new Error("free route handler is required");
      app.get(checkedPattern, async (request, response, next) => {
        try {
          const result = jsonResult(await handler(safeRequest(request)), "free route");
          response.status(200).json(result.body);
        } catch (error) {
          if (error instanceof NonBillableResponseError) {
            response.status(error.status).json({ error: error.code });
            return;
          }
          next(error);
        }
      });
    },
  });
  try {
    configureFreeRoutes(registrar);
  } finally {
    configuring = false;
  }
}

export function createFulfillmentApp({
  merchant,
  audience,
  challengeSecret,
  routePattern,
  amount,
  preflight,
  fulfill,
  redemptionStore,
  stateRoot = resolve(".ackrate"),
  configureFreeRoutes,
  testVerifier,
  metrics,
}) {
  const checkedMerchant = validateMerchant(merchant, "merchant");
  const checkedAudience = exactAudience(audience);
  const checkedAmount = exactAmount(amount);
  const checkedRoutePattern = validateRoutePattern(routePattern);
  validateChallengeSecret(challengeSecret);
  if (typeof preflight !== "function") throw new Error("preflight resolver is required");
  if (typeof fulfill !== "function") throw new Error("fulfillment callback is required");
  if (configureFreeRoutes !== undefined && typeof configureFreeRoutes !== "function") {
    throw new Error("configureFreeRoutes must be a function when provided");
  }
  if (
    testVerifier !== undefined
    && (!testVerifier || typeof testVerifier !== "object" || typeof testVerifier.verify !== "function")
  ) {
    throw new Error("testVerifier must implement verify(txHash, requirement)");
  }
  const metricsState = metrics === undefined ? undefined : fulfillmentMetricStates.get(metrics);
  if (metrics !== undefined && !metricsState) {
    throw new Error("metrics must be created by createFulfillmentMetrics");
  }

  const durableRedemptions = redemptionStore ?? new FileBoundRedemptionStore(
    resolve(stateRoot, "fulfillment-redemptions.json"),
  );
  const baseVerifier = testVerifier ?? createStellarPaymentVerifier({
    networkConfig: ackrate.testnet,
    sourceAccount: checkedMerchant,
    pollAttempts: 20,
    pollIntervalMs: 1_000,
  });
  const baseLateVerifier = testVerifier ?? createStellarPaymentVerifier({
    networkConfig: ackrate.testnet,
    sourceAccount: checkedMerchant,
    pollAttempts: 20,
    pollIntervalMs: 1_000,
    // Late receipt recovery is additionally pinned to the signed challenge and
    // transaction time bounds below, so ledger age alone is not authorization.
    maxProofAgeLedgers: 1_000_000,
  });
  const verifier = instrumentVerifier(baseVerifier, metricsState);
  const lateVerifier = instrumentVerifier(baseLateVerifier, metricsState);
  const timingServer = testVerifier
    ? undefined
    : new rpc.Server(ackrate.testnet.rpcUrl);
  const networkId = createHash("sha256")
    .update(ackrate.testnet.networkPassphrase, "utf8")
    .digest("hex");

  const authenticatedQuoteFor = (request, inspected = inspectBoundProof(request)) => {
    if (!inspected) return undefined;
    const { proof } = inspected;
    const { challenge } = proof;
    const expectedAudience = typeof checkedAudience === "function"
      ? checkedAudience(request)
      : checkedAudience;
    const expectedResource = validateRequestPath(request.originalUrl);
    const now = Math.floor(Date.now() / 1_000);
    const exact = proof.scheme === BOUND_PAYMENT_SCHEME
      && proof.network === "stellar-testnet"
      && challenge.proofVersion === 2
      && challenge.audience === expectedAudience
      && challenge.scheme === BOUND_PAYMENT_SCHEME
      && challenge.method === "GET"
      && challenge.resource === expectedResource
      && challenge.bodySha256 === null
      && challenge.network === "stellar-testnet"
      && challenge.networkId === networkId
      && challenge.registryId === ackrate.testnet.mandateRegistryId
      && challenge.merchant === checkedMerchant
      && challenge.asset === ackrate.testnet.nativeSac
      && challenge.decimals === 7
      && Number.isSafeInteger(challenge.issuedAt)
      && Number.isSafeInteger(challenge.expiresAt)
      && challenge.issuedAt <= now + 60
      && challenge.expiresAt - challenge.issuedAt === CHALLENGE_TTL_SECONDS
      && challengeMacIsValid(challenge, challengeSecret);
    if (!exact) return undefined;
    const price = decimalFromStroops(challenge.amountStroops, challenge.decimals);
    return Object.freeze({
      ...inspected,
      challenge,
      price,
      requirement: Object.freeze({
        scheme: BOUND_PAYMENT_SCHEME,
        network: "stellar-testnet",
        resource: expectedResource,
        merchant: checkedMerchant,
        asset: ackrate.testnet.nativeSac,
        amount: price,
        amountStroops: BigInt(challenge.amountStroops),
        registryId: ackrate.testnet.mandateRegistryId,
        decimals: 7,
      }),
    });
  };

  const loadTransactionTiming = async (txHash) => {
    if (typeof testVerifier?.transactionTiming === "function") {
      return testVerifier.transactionTiming(txHash);
    }
    if (testVerifier) {
      throw new Error("late-recovery test verifier must expose transactionTiming(txHash)");
    }
    const result = await timingServer.getTransaction(txHash);
    if (result.status !== "SUCCESS" || !result.envelopeXdr) {
      throw new Error("settlement transaction envelope is unavailable");
    }
    const parsed = TransactionBuilder.fromXDR(
      result.envelopeXdr,
      ackrate.testnet.networkPassphrase,
    );
    const transaction = parsed.innerTransaction ?? parsed;
    const maxTime = Number(transaction.timeBounds?.maxTime);
    if (
      !Number.isSafeInteger(maxTime)
      || maxTime <= 0
      || !Number.isSafeInteger(result.createdAt)
      || result.createdAt <= 0
    ) {
      throw new Error("settlement transaction lacks canonical ledger timing evidence");
    }
    return Object.freeze({ maxTime, createdAt: result.createdAt });
  };

  const resolvePreflight = async (request, quotedPrice) => {
    const resolved = await preflight(safeRequest(request));
    if (resolved === undefined || resolved === null || resolved === false) {
      throw new Error("paid resource became unavailable after its authenticated quote");
    }
    if (!resolved || typeof resolved !== "object" || Array.isArray(resolved)) {
      throw new Error("preflight must return an object or a non-billable missing result");
    }
    const currentPrice = validatePositiveAmount(resolved.priceXlm, 7, "preflight price");
    const priceXlm = quotedPrice ?? currentPrice;
    return Object.freeze({ ...resolved, priceXlm });
  };

  const executeFulfillment = async (request, payment) => {
    const quotedPrice = request[AUTHENTICATED_QUOTE]?.price;
    const checkedPreflight = Object.hasOwn(request, PREFLIGHT)
      ? request[PREFLIGHT]
      : await resolvePreflight(request, quotedPrice);
    if (metricsState) metricsState.fulfillmentCalls += 1;
    return jsonResult(await fulfill(Object.freeze({
      request: safeRequest(request),
      payment,
      preflight: checkedPreflight,
    })), "fulfillment");
  };

  const preflightBoundAmount = (request) => {
    if (Object.hasOwn(request, AUTHENTICATED_QUOTE)) {
      return request[AUTHENTICATED_QUOTE].price;
    }
    if (!Object.hasOwn(request, PREFLIGHT)) {
      throw new Error("payment price was requested before validated preflight");
    }
    const quoted = typeof checkedAmount === "function"
      ? checkedAmount(request)
      : checkedAmount;
    const preflightPrice = request[PREFLIGHT].priceXlm;
    if (validatePositiveAmount(preflightPrice, 7, "preflight price") !== quoted) {
      throw new Error("validated preflight price does not match the payment challenge price");
    }
    return quoted;
  };
  const paidRoute = createBoundAckratePaidJsonRoute({
    merchant: checkedMerchant,
    sourceAccount: checkedMerchant,
    audience: checkedAudience,
    challengeSecret,
    redemptionStore: durableRedemptions,
    amount: preflightBoundAmount,
    resource: (request) => validateRequestPath(request.originalUrl),
    networkConfig: ackrate.testnet,
    verifier,
    challengeTtlSeconds: CHALLENGE_TTL_SECONDS,
  }, async ({ request, payment }) => executeFulfillment(request, payment));

  const recoveryRoute = createBoundAckratePaidJsonRoute({
    merchant: checkedMerchant,
    sourceAccount: checkedMerchant,
    audience: checkedAudience,
    challengeSecret,
    redemptionStore: durableRedemptions,
    amount(request) {
      if (!Object.hasOwn(request, RECOVERY_PRICE)) {
        throw new Error("recovery price is unavailable");
      }
      return request[RECOVERY_PRICE];
    },
    resource: (request) => validateRequestPath(request.originalUrl),
    networkConfig: ackrate.testnet,
    verifier,
    challengeTtlSeconds: CHALLENGE_TTL_SECONDS,
  }, async () => {
    throw new Error("recovery route cannot start a new fulfillment execution");
  });

  const handleLateBoundDelivery = async (request, response, quote) => {
    const timing = await loadTransactionTiming(quote.proof.txHash);
    if (
      !timing
      || !Number.isSafeInteger(timing.maxTime)
      || !Number.isSafeInteger(timing.createdAt)
      || timing.createdAt <= 0
      || timing.maxTime <= timing.createdAt
      || timing.createdAt + SETTLEMENT_CLOCK_TOLERANCE_SECONDS < quote.challenge.issuedAt
      || timing.maxTime + PAYMENT_DELIVERY_MARGIN_SECONDS >= quote.challenge.expiresAt
    ) {
      response.status(402).json({
        error: "settlement transaction was not time-bound to the authenticated quote",
      });
      return;
    }

    let verdict;
    try {
      verdict = await lateVerifier.verify(quote.proof.txHash, quote.requirement);
    } catch {
      response.status(503).set("retry-after", "1").json({
        error: "late payment verification is temporarily unavailable",
        retryable: true,
      });
      return;
    }
    if (!verdict?.ok) {
      const unavailable = verdict?.kind === "unavailable";
      response.status(unavailable ? 503 : 402);
      if (unavailable) response.set("retry-after", "1");
      response.json({
        error: unavailable
          ? `late payment verification unavailable: ${verdict.reason}`
          : `payment not verified on-chain: ${verdict?.reason ?? "invalid payment"}`,
        ...(unavailable ? { retryable: true } : {}),
      });
      return;
    }
    const { payment } = verdict;
    const exactPayment = payment.txHash === quote.proof.txHash
      && payment.mandateId === quote.proof.mandateId
      && payment.amountStroops === quote.requirement.amountStroops
      && payment.merchant === checkedMerchant
      && payment.asset === ackrate.testnet.nativeSac
      && payment.registryId === ackrate.testnet.mandateRegistryId
      && payment.scheme === BOUND_PAYMENT_SCHEME
      && payment.network === "stellar-testnet"
      && verifyBoundPaymentProofSignature(quote.proof, payment.agent);
    if (!exactPayment) {
      response.status(402).json({
        error: "late payment authorization did not match verified chain evidence",
      });
      return;
    }

    const redemptionKey = createRedemptionKey(
      ackrate.testnet.networkPassphrase,
      ackrate.testnet.mandateRegistryId,
      quote.proof.txHash,
    );
    const recordMatchesVerifiedPayment = (record) => record?.key === redemptionKey
      && record.proofDigest === quote.proofDigest
      && record.payment?.txHash === payment.txHash
      && record.payment.mandateId === payment.mandateId
      && record.payment.ledger === payment.ledger
      && record.payment.user === payment.user
      && record.payment.agent === payment.agent
      && record.payment.amount === payment.amount
      && record.payment.amountStroops === payment.amountStroops
      && record.payment.merchant === payment.merchant
      && record.payment.asset === payment.asset
      && record.payment.registryId === payment.registryId
      && record.payment.scheme === payment.scheme
      && record.payment.network === payment.network;
    const lateExecutionId = randomUUID();
    let claimed;
    try {
      claimed = await durableRedemptions.claim(Object.freeze({
        key: redemptionKey,
        proofDigest: quote.proofDigest,
        payment: Object.freeze({ ...payment }),
      }), lateExecutionId, Math.floor(Date.now() / 1_000));
    } catch {
      sendRecoveryUnavailable(response);
      return;
    }
    if (
      !claimed
      || !["claimed", "executing", "completed", "conflict"].includes(claimed.kind)
      || (claimed.kind !== "conflict" && !recordMatchesVerifiedPayment(claimed.record))
      || (["claimed", "executing"].includes(claimed.kind)
        && claimed.record?.state !== "executing")
      || (claimed.kind === "completed" && claimed.record?.state !== "completed")
      || (claimed.kind === "claimed" && claimed.record.executionId !== lateExecutionId)
    ) {
      sendRecoveryUnavailable(response);
      return;
    }
    if (claimed.kind === "conflict") {
      response.status(409).json({
        error: "this settlement transaction is already bound to another request",
      });
      return;
    }
    if (claimed.kind === "executing") {
      response.status(503).set("retry-after", "1").json({
        error: "paid fulfillment is still pending; retry the same proof",
        retryable: true,
      });
      return;
    }
    if (claimed.kind === "completed") {
      sendStoredJson(response, claimed.record.response);
      return;
    }
    if (claimed.kind !== "claimed" || claimed.record.state !== "executing") {
      sendRecoveryUnavailable(response);
      return;
    }

    let stored;
    try {
      stored = storedJsonResponse(await executeFulfillment(request, claimed.record.payment));
    } catch {
      stored = terminalStoredResponse();
    }
    let completed;
    try {
      completed = await durableRedemptions.complete({
        key: claimed.record.key,
        proofDigest: claimed.record.proofDigest,
        executionId: claimed.record.executionId,
        response: stored,
      });
    } catch {
      sendRecoveryUnavailable(response);
      return;
    }
    if (
      completed.kind !== "completed"
      || completed.record.state !== "completed"
      || !recordMatchesVerifiedPayment(completed.record)
      || completed.record.executionId !== claimed.record.executionId
      || completed.record.response?.status !== stored.status
      || completed.record.response.contentType !== stored.contentType
      || completed.record.response.bodyBase64 !== stored.bodyBase64
      || completed.record.response.bodySha256 !== stored.bodySha256
    ) {
      sendRecoveryUnavailable(response);
      return;
    }
    sendStoredJson(response, completed.record.response);
  };

  const app = express();
  app.disable("x-powered-by");

  app.all(checkedRoutePattern, (request, response, next) => {
    if (request.method === "GET") {
      next();
      return;
    }
    response.set("allow", "GET");
    response.status(405).json({ error: "paid routes permit only GET requests" });
  });
  app.get(checkedRoutePattern, async (request, response, next) => {
    const inspected = inspectBoundProof(request);
    if (!inspected) {
      next();
      return;
    }
    const redemptionKey = createRedemptionKey(
      ackrate.testnet.networkPassphrase,
      ackrate.testnet.mandateRegistryId,
      inspected.proof.txHash,
    );
    let existing;
    try {
      existing = await durableRedemptions.lookup(redemptionKey, inspected.proofDigest);
      if (!existing || !["missing", "executing", "completed", "conflict"].includes(existing.kind)) {
        throw new Error("redemption store returned an unsupported lookup result");
      }
    } catch {
      sendRecoveryUnavailable(response);
      return;
    }
    if (existing.kind === "missing") {
      const authenticatedQuote = authenticatedQuoteFor(request, inspected);
      if (!authenticatedQuote) {
        next();
        return;
      }
      Object.defineProperty(request, AUTHENTICATED_QUOTE, {
        value: authenticatedQuote,
        enumerable: false,
        configurable: false,
        writable: false,
      });
      if (authenticatedQuote.challenge.expiresAt <= Math.floor(Date.now() / 1_000)) {
        try {
          await handleLateBoundDelivery(request, response, authenticatedQuote);
        } catch {
          response.status(503).set("retry-after", "1").json({
            error: "late payment recovery is temporarily unavailable",
            retryable: true,
          });
        }
        return;
      }
      next();
      return;
    }
    let recoveryPrice;
    try {
      recoveryPrice = existing.kind === "conflict"
        ? decimalFromStroops(
            inspected.proof.challenge.amountStroops,
            inspected.proof.challenge.decimals,
          )
        : validatePositiveAmount(existing.record.payment.amount, 7, "stored payment price");
    } catch {
      sendRecoveryUnavailable(response);
      return;
    }
    Object.defineProperty(request, RECOVERY_PRICE, {
      value: recoveryPrice,
      enumerable: false,
      configurable: false,
      writable: false,
    });
    recoveryRoute(request, response, next);
  }, async (request, response, next) => {
    if (Object.hasOwn(request, AUTHENTICATED_QUOTE)) {
      next();
      return;
    }
    try {
      const resolved = await preflight(safeRequest(request));
      if (resolved === undefined || resolved === null || resolved === false) {
        response.status(404).json({ error: "resource not found" });
        return;
      }
      if (!resolved || typeof resolved !== "object" || Array.isArray(resolved)) {
        throw new Error("preflight must return an object or a non-billable missing result");
      }
      const checkedPreflight = Object.freeze({
        ...resolved,
        priceXlm: validatePositiveAmount(resolved.priceXlm, 7, "preflight price"),
      });
      Object.defineProperty(request, PREFLIGHT, {
        value: checkedPreflight,
        enumerable: false,
        configurable: false,
        writable: false,
      });
      next();
    } catch (error) {
      if (error instanceof NonBillableResponseError) {
        response.status(error.status).json({ error: error.code });
        return;
      }
      next(error);
    }
  }, paidRoute);
  // Register operational and scenario-free routes only after the paid chain.
  // Express resolves in registration order, so a paid pattern that is exactly
  // `/health` or broad enough to match it can never be shadowed by a free route.
  app.get("/health", (_request, response) => {
    response.status(200).json({ ok: true, network: "stellar-testnet" });
  });
  configureSanitizedFreeRoutes(app, configureFreeRoutes);

  app.use((_request, response) => {
    response.status(404).json({ error: "not found" });
  });
  app.use((error, _request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    response.status(500).json({ error: "fulfillment failed closed" });
  });
  return app;
}

export async function startFulfillmentServer({
  host = "127.0.0.1",
  port = 0,
  publicOrigin,
  ...options
}) {
  if (host !== "127.0.0.1") {
    throw new Error("starter fulfillment binds only to 127.0.0.1");
  }
  const checkedPort = validatePort(port, { allowZero: true });
  let audience = publicOrigin === undefined
    ? undefined
    : validateExactOrigin(publicOrigin, "public origin");
  const app = createFulfillmentApp({
    ...options,
    audience: () => {
      if (!audience) throw new Error("payment audience is not ready");
      return audience;
    },
  });
  const server = app.listen(checkedPort, host);
  try {
    await new Promise((resolvePromise, reject) => {
      server.once("listening", resolvePromise);
      server.once("error", reject);
    });
  } catch (error) {
    await closeHttpServer(server).catch(() => undefined);
    throw error;
  }

  const address = server.address();
  if (!address || typeof address === "string") {
    await closeHttpServer(server).catch(() => undefined);
    throw new Error("fulfillment server did not expose a TCP address");
  }
  const localOrigin = `http://${host}:${address.port}`;
  if (!audience) audience = validateExactOrigin(localOrigin, "local origin");

  const closeOnce = createIdempotentServerCloser(server);
  return Object.freeze({
    server,
    app,
    origin: audience,
    localOrigin,
    endpoint(path) {
      return `${audience}${validateRequestPath(path)}`;
    },
    async close() {
      await closeOnce();
    },
  });
}

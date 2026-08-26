import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";
import express, {
  type NextFunction,
  type Request,
  type Response as ExpressResponse,
} from "express";
import { Keypair } from "@stellar/stellar-sdk";
import {
  BOUND_PAYMENT_CAPABILITY,
  DeliveryPendingError,
  ACKRATE_PAYMENT_CAPABILITIES_HEADER,
  X_PAYMENT_HEADER,
  getSettlementReceipt,
  ackrate,
  type Agent,
  type IntentMandate,
  type SettlementReceipt,
  type SettlementReceiptStore,
} from "@ackrate/core";
import {
  InMemoryBoundRedemptionStore,
  createBoundAckratePaidJsonRoute,
  createStellarPaymentVerifier,
  type PaymentRequirement,
  type PaymentVerifier,
} from "@ackrate/express-middleware";
import {
  keypairSigner,
  registryClient,
  type Client as RegistryClient,
} from "@ackrate/stellar";

const BUDGET_XLM = "3.00" as const;
const PRICE_XLM = "1.00" as const;
const EXPLORER_TX = "https://stellar.expert/explorer/testnet/tx/";
const FRIEND_BOT = "https://friendbot.stellar.org/";
const HORIZON = "https://horizon-testnet.stellar.org";
const ATTEMPT_HEADER = "x-ackrate-demo-attempt";
const SESSION_TTL_MS = 30 * 60_000;
const EXPIRED_TOMBSTONE_MS = 5 * 60_000;
const MAX_ACTIVE_SESSIONS = 4;
const FUNDING_ATTEMPTS = 5;
const ACCOUNT_POLL_ATTEMPTS = 18;
const PROCESS_CHALLENGE_SECRET = randomBytes(32);

function configuredChallengeSecret(): string | Uint8Array {
  const secret = process.env.ACKRATE_CHALLENGE_SECRET;
  if (secret === undefined || secret.length === 0) return PROCESS_CHALLENGE_SECRET;
  if (new TextEncoder().encode(secret).byteLength < 32) {
    throw new ExpressDemoError(
      "failed",
      503,
      "The bound payment service is unavailable because its challenge authority is not configured.",
    );
  }
  return secret;
}

export type DemoResourceId = "market" | "academic" | "news" | "patents";

export type DemoResourceSummary = Readonly<{
  id: DemoResourceId;
  label: string;
  attempt: number;
}>;

export type ExpressDemoEvent =
  | { type: "run_start"; contractId: string; budgetXlm: "3.00"; priceXlm: "1.00" }
  | {
      type: "funding";
      state: "start" | "ready";
      accounts?: { user: string; agent: string; merchant: string };
    }
  | {
      type: "mandate_ready";
      mandateId: string;
      registerTx: string;
      approveTx: string;
      budgetXlm: "3.00";
    }
  | { type: "fulfillment_start"; origin: "localhost"; merchant: string }
  | { type: "request"; attempt: number; resource: DemoResourceId; label: string }
  | {
      type: "challenge_402";
      attempt: number;
      resource: DemoResourceId;
      amountXlm: "1.00";
      status: 402;
    }
  | {
      type: "payment_submit";
      attempt: number;
      resource: DemoResourceId;
      amountXlm: "1.00";
    }
  | {
      type: "payment_tx";
      attempt: number;
      resource: DemoResourceId;
      hash: string;
      explorerUrl: string;
    }
  | {
      type: "proof_verified";
      attempt: number;
      resource: DemoResourceId;
      hash: string;
      ledger: number;
    }
  | {
      type: "delivery_200";
      attempt: number;
      resource: DemoResourceId;
      label: string;
      status: 200;
      hash: string;
      data: string;
    }
  | { type: "budget"; spentXlm: string; remainingXlm: string; limitXlm: "3.00" }
  | {
      type: "purchase_blocked";
      attempt: number;
      resource: DemoResourceId;
      reason: "budget exceeded";
    }
  | {
      type: "result";
      ok: true;
      served: 3;
      blocked: 1;
      spentXlm: "3.00";
      budgetXlm: "3.00";
      transactions: string[];
    }
  | { type: "reset"; sessionId: string }
  | { type: "error"; message: string };

export type BudgetSummary = Readonly<{
  spentXlm: string;
  remainingXlm: string;
  limitXlm: "3.00";
}>;

export type ExpressDemoSuccessResponse =
  | {
      ok: true;
      action: "create";
      sessionId: string;
      expiresAt: string;
      workspace: {
        contractId: string;
        mandateId: string;
        user: string;
        agent: string;
        merchant: string;
        budgetXlm: "3.00";
        priceXlm: "1.00";
        registerTx: string;
        approveTx: string;
        endpointBase: string;
        nextResource: DemoResourceSummary;
      };
      events: ExpressDemoEvent[];
    }
  | {
      ok: true;
      action: "challenge";
      sessionId: string;
      resource: DemoResourceSummary;
      status: 402;
      body: unknown;
      events: ExpressDemoEvent[];
    }
  | {
      ok: true;
      action: "purchase";
      operationId: string;
      sessionId: string;
      outcome: "delivered";
      resource: DemoResourceSummary;
      txHash: string;
      explorerUrl: string;
      data: string;
      budget: BudgetSummary;
      nextResource: DemoResourceSummary;
      events: ExpressDemoEvent[];
    }
  | {
      ok: true;
      action: "purchase";
      operationId: string;
      sessionId: string;
      outcome: "blocked";
      resource: DemoResourceSummary;
      reason: "budget exceeded";
      budget: BudgetSummary;
      nextResource: null;
      events: ExpressDemoEvent[];
    }
  | {
      ok: true;
      action: "reset";
      sessionId: string;
      events: [{ type: "reset"; sessionId: string }];
    }
  | {
      ok: true;
      action: "status";
      sessionId: string;
      expiresAt: string;
      events: ExpressDemoEvent[];
    };

export type ExpressDemoErrorCode =
  | "invalid_request"
  | "not_found"
  | "expired"
  | "busy"
  | "rate_limited"
  | "capacity"
  | "failed";

export type ExpressDemoErrorResponse = {
  ok: false;
  error: string;
  code: ExpressDemoErrorCode;
  events: [{ type: "error"; message: string }];
};

type DemoResource = Readonly<{
  id: DemoResourceId;
  label: string;
  data: string;
}>;

const RESOURCES: readonly DemoResource[] = Object.freeze([
  Object.freeze({
    id: "market" as const,
    label: "Market Data API",
    data: "Verified market prices, liquidity depth, and thirty-day volatility.",
  }),
  Object.freeze({
    id: "academic" as const,
    label: "Academic Papers",
    data: "Verified peer-reviewed evidence, methodology, and sample-size notes.",
  }),
  Object.freeze({
    id: "news" as const,
    label: "News Archive",
    data: "Verified official announcements and recent market context.",
  }),
  Object.freeze({
    id: "patents" as const,
    label: "Patent Database",
    data: "Verified worldwide filings, assignees, and technology trends.",
  }),
]);

export function isDemoResourceId(value: string): value is DemoResourceId {
  return RESOURCES.some((resource) => resource.id === value);
}

type EventSink = (event: ExpressDemoEvent) => void;
type ActiveRequest = Readonly<{ attempt: number; resource: DemoResource }>;

interface SessionHooks {
  active?: ActiveRequest;
  mode?: "hosted" | "external";
  sink?: EventSink;
}

interface DemoSession {
  id: string;
  owner: string;
  expiresAt: number;
  expiryTimer: ReturnType<typeof setTimeout>;
  busy: boolean;
  server: Server;
  origin: string;
  mandate: IntentMandate;
  consumer: Agent;
  registry: RegistryClient;
  hooks: SessionHooks;
  accounts: { user: string; agent: string; merchant: string };
  registerTx: string;
  approveTx: string;
  nextIndex: number;
  served: number;
  settledByAttempt: Map<number, string>;
  paymentTransactions: string[];
  purchaseOperations: Map<string, {
    attempt: number;
    resource: DemoResourceId;
    response: Extract<ExpressDemoSuccessResponse, { action: "purchase" }>;
  }>;
  publicEvents: ExpressDemoEvent[];
  publicServed: number;
  publicTransactions: string[];
  publicBlocked: boolean;
  publicMandateId: string | null;
}

const sessions = new Map<string, DemoSession>();
const expiredSessions = new Map<string, number>();

export class ExpressDemoError extends Error {
  constructor(
    public readonly code: ExpressDemoErrorCode,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ExpressDemoError";
  }
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error("Express demo request canceled");
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError(signal);
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(finish, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(abortError(signal));
    };
    function finish() {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function boundedFetch(
  input: string,
  init: RequestInit,
  parentSignal: AbortSignal,
  timeoutMs = 20_000,
): Promise<globalThis.Response> {
  throwIfAborted(parentSignal);
  const controller = new AbortController();
  const onAbort = () => controller.abort(parentSignal.reason);
  parentSignal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("request timed out")), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    parentSignal.removeEventListener("abort", onAbort);
  }
}

async function waitForAccount(publicKey: string, signal: AbortSignal): Promise<void> {
  let lastStatus = 0;
  for (let attempt = 1; attempt <= ACCOUNT_POLL_ATTEMPTS; attempt += 1) {
    throwIfAborted(signal);
    try {
      const response = await boundedFetch(
        `${HORIZON}/accounts/${encodeURIComponent(publicKey)}`,
        { headers: { accept: "application/json" } },
        signal,
      );
      lastStatus = response.status;
      if (response.ok) return;
      if (response.status !== 404 && response.status !== 429 && response.status < 500) break;
    } catch (error) {
      if (signal.aborted) throw error;
    }
    await wait(Math.min(500 * attempt, 2_500), signal);
  }
  throw new Error(`funded testnet account was not readable (Horizon HTTP ${lastStatus || "unavailable"})`);
}

async function fundAccount(publicKey: string, signal: AbortSignal): Promise<void> {
  let lastFailure = "Friendbot unavailable";
  for (let attempt = 1; attempt <= FUNDING_ATTEMPTS; attempt += 1) {
    throwIfAborted(signal);
    try {
      const url = new URL(FRIEND_BOT);
      url.searchParams.set("addr", publicKey);
      const response = await boundedFetch(
        url.toString(),
        { method: "GET", headers: { accept: "application/json" } },
        signal,
        30_000,
      );
      if (response.ok || response.status === 400) {
        await waitForAccount(publicKey, signal);
        return;
      }
      lastFailure = `Friendbot HTTP ${response.status}`;
      if (response.status !== 429 && response.status < 500) break;
    } catch (error) {
      if (signal.aborted) throw error;
      lastFailure = error instanceof Error ? error.message : "Friendbot request failed";
    }
    await wait(Math.min(1_000 * 2 ** (attempt - 1), 8_000), signal);
  }
  throw new Error(`could not fund fresh testnet account: ${lastFailure}`);
}

function resourceFromPath(path: string): DemoResource | undefined {
  const id = path.split(/[?#]/, 1)[0]?.split("/").filter(Boolean).at(-1);
  return RESOURCES.find((resource) => resource.id === id);
}

function resourceSummary(resource: DemoResource, attempt: number): DemoResourceSummary {
  return Object.freeze({ id: resource.id, label: resource.label, attempt });
}

function nextResource(session: DemoSession): DemoResourceSummary | null {
  const resource = RESOURCES[session.nextIndex];
  return resource ? resourceSummary(resource, session.nextIndex + 1) : null;
}

function attemptFromRequest(request: Request): number | undefined {
  const value = Number(request.header(ATTEMPT_HEADER));
  return Number.isInteger(value) && value >= 1 && value <= RESOURCES.length ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function publicErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/\bS[A-Z2-7]{55}\b/g, "[redacted secret]")
    .replace(/https?:\/\/(?:127\.0\.0\.1|localhost):\d+/gi, "localhost")
    .slice(0, 320);
}

export function normalizeExpressDemoError(error: unknown): ExpressDemoError {
  if (error instanceof ExpressDemoError) return error;
  return new ExpressDemoError("failed", 500, publicErrorMessage(error));
}

function isBudgetExceeded(error: unknown): boolean {
  return /(?:#6\b|BudgetExceeded|budget exceeded)/i.test(
    error instanceof Error ? error.message : String(error),
  );
}

function formatXlm(value: number): string {
  return `${value}.00`;
}

function budgetSummary(session: DemoSession): BudgetSummary {
  return Object.freeze({
    spentXlm: formatXlm(session.served),
    remainingXlm: formatXlm(3 - session.served),
    limitXlm: BUDGET_XLM,
  });
}

function pushPublicEvent(session: DemoSession, event: ExpressDemoEvent): void {
  session.publicEvents.push(event);
  if (session.publicEvents.length > 100) {
    session.publicEvents.splice(0, session.publicEvents.length - 100);
  }
}

function closeServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(force);
      resolve();
    };
    const force = setTimeout(() => {
      server.closeAllConnections?.();
      finish();
    }, 2_000);
    force.unref?.();
    server.close(() => finish());
    server.closeIdleConnections?.();
  });
}

async function startFulfillmentServer(
  merchant: string,
  hooks: SessionHooks,
  sessionId: string,
  publicOrigin: string,
  challengeSecret: string | Uint8Array,
): Promise<{ server: Server; origin: string }> {
  const app = express();
  app.disable("x-powered-by");

  const baseVerifier = createStellarPaymentVerifier({
    networkConfig: ackrate.testnet,
    sourceAccount: merchant,
    pollAttempts: 20,
    pollIntervalMs: 1_000,
  });
  const verifier: PaymentVerifier = {
    async verify(txHash: string, requirement: PaymentRequirement) {
      const verdict = await baseVerifier.verify(txHash, requirement);
      if (verdict.ok && hooks.active) {
        const resource = resourceFromPath(requirement.resource);
        if (resource?.id === hooks.active.resource.id) {
          // Hosted runs already retain the submitted hash inside consumer.pay.
          // External callers have no trusted local hook, so publish the hash
          // only after the verifier has derived it from the settled payment.
          if (hooks.mode === "external") {
            hooks.sink?.({
              type: "payment_tx",
              attempt: hooks.active.attempt,
              resource: resource.id,
              hash: verdict.payment.txHash,
              explorerUrl: `${EXPLORER_TX}${verdict.payment.txHash}`,
            });
          }
          hooks.sink?.({
            type: "proof_verified",
            attempt: hooks.active.attempt,
            resource: resource.id,
            hash: verdict.payment.txHash,
            ledger: verdict.payment.ledger,
          });
        }
      }
      return verdict;
    },
  };
  // Each interactive workspace is ephemeral and single-process. Production
  // fulfillment must supply a durable, shared BoundRedemptionStore instead.
  const redemptionStore = new InMemoryBoundRedemptionStore();
  let runtimeOrigin = "";
  const paidSource = createBoundAckratePaidJsonRoute({
    merchant,
    sourceAccount: merchant,
    audience: () => hooks.mode === "external" ? publicOrigin : runtimeOrigin,
    challengeSecret,
    redemptionStore,
    amount: PRICE_XLM,
    resource: (request) => {
      const resource = resourceFromPath(request.originalUrl);
      return hooks.mode === "external" && resource
        ? `/api/express/${sessionId}/source/${resource.id}`
        : request.originalUrl;
    },
    networkConfig: ackrate.testnet,
    verifier,
  }, ({ request, payment }) => {
    const resource = resourceFromPath(request.originalUrl);
    if (!resource) throw new Error("validated demo resource disappeared before fulfillment");
    return {
      body: {
        ok: true,
        resource: resource.id,
        label: resource.label,
        data: resource.data,
        settledTx: payment.txHash,
      },
    };
  });

  app.get(
    "/source/:id",
    (request: Request, response: ExpressResponse, next: NextFunction): void => {
      const resource = resourceFromPath(request.originalUrl);
      const attempt = attemptFromRequest(request);
      if (!resource || !attempt) {
        response.status(404).json({ error: "unknown demo resource" });
        return;
      }
      if (!request.header(X_PAYMENT_HEADER)) {
        response.once("finish", () => {
          if (response.statusCode === 402) {
            hooks.sink?.({
              type: "challenge_402",
              attempt,
              resource: resource.id,
              amountXlm: PRICE_XLM,
              status: 402,
            });
          }
        });
      }
      next();
    },
    paidSource,
  );
  app.use((_request: Request, response: ExpressResponse): void => {
    response.status(404).json({ error: "not found" });
  });
  app.use(
    (_error: unknown, _request: Request, response: ExpressResponse, _next: NextFunction): void => {
      response.status(500).json({ error: "fulfillment failed closed" });
    },
  );

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer(server);
    throw new Error("ephemeral fulfillment server did not bind a TCP port");
  }
  runtimeOrigin = `http://127.0.0.1:${address.port}`;
  return { server, origin: runtimeOrigin };
}

function parseDelivery(value: unknown, resource: DemoResource, expectedHash: string): {
  label: string;
  data: string;
  settledTx: string;
} {
  if (!isRecord(value)) throw new Error("fulfillment returned a non-object body");
  if (value.ok !== true) throw new Error("fulfillment returned a terminal failure result");
  if (value.resource !== resource.id) throw new Error("fulfillment returned the wrong resource");
  if (typeof value.label !== "string" || value.label.length === 0) {
    throw new Error("fulfillment response omitted its label");
  }
  if (typeof value.data !== "string" || value.data.length === 0) {
    throw new Error("fulfillment response omitted its protected data");
  }
  if (value.settledTx !== expectedHash) {
    throw new Error("fulfillment response did not match the settled transaction");
  }
  return { label: value.label, data: value.data, settledTx: expectedHash };
}

function pruneExpiredTombstones(now = Date.now()): void {
  for (const [id, expiredAt] of expiredSessions) {
    if (now - expiredAt > EXPIRED_TOMBSTONE_MS) expiredSessions.delete(id);
  }
}

function scheduleExpiry(session: DemoSession): void {
  clearTimeout(session.expiryTimer);
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  session.expiryTimer = setTimeout(() => void expireSession(session.id), SESSION_TTL_MS);
  session.expiryTimer.unref?.();
}

async function expireSession(id: string): Promise<void> {
  const session = sessions.get(id);
  if (!session) return;
  if (session.busy) {
    scheduleExpiry(session);
    return;
  }
  sessions.delete(id);
  clearTimeout(session.expiryTimer);
  expiredSessions.set(id, Date.now());
  await closeServer(session.server);
}

async function disposeSession(session: DemoSession, expired = false): Promise<void> {
  sessions.delete(session.id);
  clearTimeout(session.expiryTimer);
  if (expired) expiredSessions.set(session.id, Date.now());
  await closeServer(session.server);
}

function requireSession(id: string, owner: string): DemoSession {
  const session = requirePublicSession(id);
  if (session.owner !== owner) {
    throw new ExpressDemoError("not_found", 404, "Demo workspace not found.");
  }
  return session;
}

function requirePublicSession(id: string): DemoSession {
  pruneExpiredTombstones();
  const session = sessions.get(id);
  if (!session) {
    if (expiredSessions.has(id)) {
      throw new ExpressDemoError("expired", 410, "This demo workspace expired. Create a new one.");
    }
    throw new ExpressDemoError("not_found", 404, "Demo workspace not found.");
  }
  if (session.expiresAt <= Date.now()) {
    void disposeSession(session, true);
    throw new ExpressDemoError("expired", 410, "This demo workspace expired. Create a new one.");
  }
  return session;
}

async function withSession<T>(
  id: string,
  owner: string,
  signal: AbortSignal,
  operation: (session: DemoSession) => Promise<T>,
): Promise<T> {
  const session = requireSession(id, owner);
  if (session.busy) {
    throw new ExpressDemoError("busy", 409, "This demo workspace is already running an action.");
  }
  session.busy = true;
  scheduleExpiry(session);
  try {
    throwIfAborted(signal);
    return await operation(session);
  } finally {
    session.busy = false;
    if (sessions.has(session.id)) scheduleExpiry(session);
  }
}

async function withPublicSession<T>(
  id: string,
  signal: AbortSignal,
  operation: (session: DemoSession) => Promise<T>,
): Promise<T> {
  const session = requirePublicSession(id);
  if (session.busy) {
    throw new ExpressDemoError("busy", 409, "This demo workspace is already running an action.");
  }
  session.busy = true;
  scheduleExpiry(session);
  try {
    throwIfAborted(signal);
    return await operation(session);
  } finally {
    session.busy = false;
    if (sessions.has(session.id)) scheduleExpiry(session);
  }
}

export function activeExpressDemoSessions(): number {
  return sessions.size;
}

/**
 * Server-side public bridge used by the dynamic resource route. The UUID is the
 * capability: unlike the control actions, this deliberately does not bind to
 * the creator IP so a local Node/VS Code consumer can call the deployed URL.
 */
export async function proxyExpressDemoResource(
  id: string,
  resourceId: string,
  request: globalThis.Request,
): Promise<globalThis.Response> {
  if (!isDemoResourceId(resourceId)) {
    throw new ExpressDemoError("not_found", 404, "Demo resource not found.");
  }
  return withPublicSession(id, request.signal, async (session) => {
    const resourceIndex = RESOURCES.findIndex((resource) => resource.id === resourceId);
    const resource = RESOURCES[resourceIndex] as DemoResource;
    const attempt = resourceIndex + 1;
    const headers = new Headers();
    const accept = request.headers.get("accept");
    if (accept) headers.set("accept", accept.slice(0, 512));
    const payment = request.headers.get(X_PAYMENT_HEADER);
    if (payment) {
      if (new TextEncoder().encode(payment).byteLength > 8_192) {
        throw new ExpressDemoError("invalid_request", 400, "X-PAYMENT header is too large.");
      }
      headers.set(X_PAYMENT_HEADER, payment);
    }
    const capability = request.headers.get(ACKRATE_PAYMENT_CAPABILITIES_HEADER);
    if (capability) {
      if (new TextEncoder().encode(capability).byteLength > 256) {
        throw new ExpressDemoError("invalid_request", 400, "Payment capability header is too large.");
      }
      headers.set(ACKRATE_PAYMENT_CAPABILITIES_HEADER, capability);
    }
    headers.set(ATTEMPT_HEADER, String(resourceIndex + 1));

    session.hooks.active = { attempt, resource };
    session.hooks.mode = "external";
    session.hooks.sink = (event) => pushPublicEvent(session, event);
    pushPublicEvent(session, {
      type: "request",
      attempt,
      resource: resource.id,
      label: resource.label,
    });
    try {
      const upstream = await boundedFetch(
        `${session.origin}/source/${resourceId}`,
        { method: "GET", headers },
        request.signal,
        45_000,
      );
      const responseHeaders = new Headers();
      for (const name of [
        "content-type",
        "content-length",
        "cache-control",
        "vary",
        "retry-after",
        "etag",
        "last-modified",
      ]) {
        const value = upstream.headers.get(name);
        if (value !== null) responseHeaders.set(name, value);
      }
      const body = await upstream.arrayBuffer();
      if (upstream.status === 200) {
        try {
          const parsed = JSON.parse(new TextDecoder().decode(body)) as unknown;
          if (
            isRecord(parsed)
            && parsed.ok === true
            && typeof parsed.settledTx === "string"
            && typeof parsed.data === "string"
          ) {
            const settledTx = parsed.settledTx.toLowerCase();
            if (
              /^[0-9a-f]{64}$/.test(settledTx)
              && !session.publicTransactions.includes(settledTx)
            ) {
              session.publicTransactions.push(settledTx);
              session.publicServed += 1;
            }
            pushPublicEvent(session, {
              type: "delivery_200",
              attempt,
              resource: resource.id,
              label: resource.label,
              status: 200,
              hash: settledTx,
              data: parsed.data,
            });
          }
        } catch {
          // Return the exact upstream response; malformed delivery is visible to the caller.
        }
      }
      return new globalThis.Response(body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      });
    } finally {
      session.hooks.active = undefined;
      session.hooks.mode = undefined;
      session.hooks.sink = undefined;
    }
  });
}

export type ExpressDemoReportResponse = Readonly<{
  ok: true;
  action: "report";
  sessionId: string;
  verified: true;
}>;

/**
 * Confirm the clean-room consumer's fourth-payment rejection without trusting
 * the browser or the caller's error text. The public mandate id is resolved
 * against MandateRegistry, and the event is recorded only when the exact demo
 * merchant/asset has consumed its entire 3 XLM allowance after three deliveries.
 */
export async function reportExpressDemoBudgetRejection(
  id: string,
  resourceId: string,
  mandateId: string,
  signal: AbortSignal,
): Promise<ExpressDemoReportResponse> {
  if (resourceId !== "patents" || !/^[0-9a-f]{64}$/i.test(mandateId)) {
    throw new ExpressDemoError("invalid_request", 400, "A valid final-resource mandate id is required.");
  }

  return withPublicSession(id, signal, async (session) => {
    const normalizedMandateId = mandateId.toLowerCase();
    if (session.publicBlocked) {
      if (session.publicMandateId === normalizedMandateId) {
        return { ok: true, action: "report", sessionId: session.id, verified: true };
      }
      throw new ExpressDemoError(
        "invalid_request",
        409,
        "This workspace already recorded a different verified mandate.",
      );
    }
    if (session.publicServed !== 3 || session.publicTransactions.length !== 3) {
      throw new ExpressDemoError(
        "invalid_request",
        409,
        "Three verified deliveries are required before the final rejection can be recorded.",
      );
    }

    const transaction = await session.registry.get_mandate({
      mandate_id: Buffer.from(normalizedMandateId, "hex"),
    });
    const result = transaction.result;
    if (!result.isOk()) {
      throw new ExpressDemoError("invalid_request", 409, "The mandate is not registered on testnet.");
    }
    const mandate = result.unwrap();
    const exactLimit = 30_000_000n;
    if (
      mandate.merchant !== session.accounts.merchant
      || mandate.asset !== ackrate.testnet.nativeSac
      || mandate.max_amount !== exactLimit
      || mandate.spent !== exactLimit
      || mandate.seq !== 3
    ) {
      throw new ExpressDemoError(
        "invalid_request",
        409,
        "On-chain mandate state does not prove the expected exhausted 3 XLM demo budget.",
      );
    }

    session.publicBlocked = true;
    session.publicMandateId = normalizedMandateId;
    pushPublicEvent(session, {
      type: "purchase_blocked",
      attempt: 4,
      resource: "patents",
      reason: "budget exceeded",
    });
    pushPublicEvent(session, {
      type: "budget",
      spentXlm: BUDGET_XLM,
      remainingXlm: "0.00",
      limitXlm: BUDGET_XLM,
    });
    pushPublicEvent(session, {
      type: "result",
      ok: true,
      served: 3,
      blocked: 1,
      spentXlm: BUDGET_XLM,
      budgetXlm: BUDGET_XLM,
      transactions: [...session.publicTransactions],
    });
    return { ok: true, action: "report", sessionId: session.id, verified: true };
  });
}

export async function createExpressDemoSession(
  owner: string,
  signal: AbortSignal,
  publicOrigin: string,
): Promise<Extract<ExpressDemoSuccessResponse, { action: "create" }>> {
  if (sessions.size >= MAX_ACTIVE_SESSIONS) {
    throw new ExpressDemoError("capacity", 429, "The live testnet demo is at capacity. Try again shortly.");
  }
  const challengeSecret = configuredChallengeSecret();
  const events: ExpressDemoEvent[] = [];
  const emit: EventSink = (event) => events.push(event);
  let server: Server | undefined;
  emit({
    type: "run_start",
    contractId: ackrate.testnet.mandateRegistryId,
    budgetXlm: BUDGET_XLM,
    priceXlm: PRICE_XLM,
  });

  const user = Keypair.random();
  const agentKeypair = Keypair.random();
  const merchant = Keypair.random();
  const accounts = {
    user: user.publicKey(),
    agent: agentKeypair.publicKey(),
    merchant: merchant.publicKey(),
  };
  emit({ type: "funding", state: "start" });

  try {
    // Sequential calls avoid a burst against the public faucet. Each call has
    // bounded retries and a Horizon visibility check before setup continues.
    for (const publicKey of [accounts.user, accounts.agent, accounts.merchant]) {
      await fundAccount(publicKey, signal);
    }
    await wait(2_000, signal);
    emit({ type: "funding", state: "ready", accounts });

    const mandate = ackrate.createIntentMandate({
      user: accounts.user,
      agent: accounts.agent,
      merchant: accounts.merchant,
      asset: ackrate.testnet.nativeSac,
      maxAmount: BUDGET_XLM,
      expiry: Math.floor(Date.now() / 1_000) + 3_600,
      nonce: randomUUID(),
    });
    const registerTx = await ackrate.registerMandate(mandate, { signer: user });
    throwIfAborted(signal);
    const approveTx = await ackrate.approveBudget(mandate, { signer: user });
    emit({
      type: "mandate_ready",
      mandateId: mandate.id,
      registerTx,
      approveTx,
      budgetXlm: BUDGET_XLM,
    });
    throwIfAborted(signal);

    const id = randomUUID();
    const hooks: SessionHooks = {};
    const fulfillment = await startFulfillmentServer(
      accounts.merchant,
      hooks,
      id,
      publicOrigin,
      challengeSecret,
    );
    server = fulfillment.server;
    throwIfAborted(signal);
    emit({ type: "fulfillment_start", origin: "localhost", merchant: accounts.merchant });

    const pendingReceipts = new Map<string, Readonly<SettlementReceipt>>();
    const receiptStore: SettlementReceiptStore = {
      async savePending(receipt) { pendingReceipts.set(receipt.receiptId, receipt); },
      async clearPending(receiptId) { pendingReceipts.delete(receiptId); },
      async listPending() { return [...pendingReceipts.values()]; },
    };
    const consumer = ackrate.agent({
      mandate,
      signer: agentKeypair,
      proofPolicy: "bound-v2-only",
      receiptStore,
    });
    const registry = registryClient(
      ackrate.testnet,
      keypairSigner(merchant, ackrate.testnet.networkPassphrase),
    );
    const settledByAttempt = new Map<number, string>();
    const paymentTransactions: string[] = [];
    const contractPay = consumer.pay.bind(consumer);
    consumer.pay = async (...args: Parameters<typeof contractPay>): Promise<string> => {
      const [amount] = args;
      const active = hooks.active;
      if (!active) throw new Error("payment started outside a demo purchase");
      hooks.sink?.({
        type: "payment_submit",
        attempt: active.attempt,
        resource: active.resource.id,
        amountXlm: PRICE_XLM,
      });
      const hash = await contractPay(...args);
      settledByAttempt.set(active.attempt, hash);
      paymentTransactions.push(hash);
      hooks.sink?.({
        type: "payment_tx",
        attempt: active.attempt,
        resource: active.resource.id,
        hash,
        explorerUrl: `${EXPLORER_TX}${hash}`,
      });
      return hash;
    };

    const session: DemoSession = {
      id,
      owner,
      expiresAt: 0,
      expiryTimer: setTimeout(() => undefined, 0),
      busy: false,
      server: fulfillment.server,
      origin: fulfillment.origin,
      mandate,
      consumer,
      registry,
      hooks,
      accounts,
      registerTx,
      approveTx,
      nextIndex: 0,
      served: 0,
      settledByAttempt,
      paymentTransactions,
      purchaseOperations: new Map(),
      publicEvents: [],
      publicServed: 0,
      publicTransactions: [],
      publicBlocked: false,
      publicMandateId: null,
    };
    clearTimeout(session.expiryTimer);
    throwIfAborted(signal);
    sessions.set(id, session);
    scheduleExpiry(session);
    server = undefined; // The session owns it now.

    return {
      ok: true,
      action: "create",
      sessionId: id,
      expiresAt: new Date(session.expiresAt).toISOString(),
      workspace: {
        contractId: ackrate.testnet.mandateRegistryId,
        mandateId: mandate.id,
        user: accounts.user,
        agent: accounts.agent,
        merchant: accounts.merchant,
        budgetXlm: BUDGET_XLM,
        priceXlm: PRICE_XLM,
        registerTx,
        approveTx,
        endpointBase: `${publicOrigin}/api/express/${id}/source`,
        nextResource: resourceSummary(RESOURCES[0] as DemoResource, 1),
      },
      events,
    };
  } catch (error) {
    if (server) await closeServer(server);
    throw error;
  }
}

export async function challengeExpressDemoSession(
  id: string,
  owner: string,
  signal: AbortSignal,
): Promise<Extract<ExpressDemoSuccessResponse, { action: "challenge" }>> {
  return withSession(id, owner, signal, async (session) => {
    const resource = RESOURCES[session.nextIndex];
    if (!resource) {
      throw new ExpressDemoError("invalid_request", 409, "This demo workspace already reached its final result.");
    }
    const attempt = session.nextIndex + 1;
    const events: ExpressDemoEvent[] = [];
    session.hooks.active = { attempt, resource };
    session.hooks.mode = "hosted";
    session.hooks.sink = (event) => events.push(event);
    try {
      const response = await boundedFetch(
        `${session.origin}/source/${resource.id}`,
        {
          headers: {
            [ATTEMPT_HEADER]: String(attempt),
            [ACKRATE_PAYMENT_CAPABILITIES_HEADER]: BOUND_PAYMENT_CAPABILITY,
          },
        },
        signal,
      );
      const body = await response.json().catch(() => undefined) as unknown;
      if (response.status !== 402) {
        throw new Error(`unpaid fulfillment request returned HTTP ${response.status}, expected 402`);
      }
      if (!events.some((event) => event.type === "challenge_402")) {
        events.push({
          type: "challenge_402",
          attempt,
          resource: resource.id,
          amountXlm: PRICE_XLM,
          status: 402,
        });
      }
      return {
        ok: true,
        action: "challenge",
        sessionId: session.id,
        resource: resourceSummary(resource, attempt),
        status: 402,
        body,
        events,
      };
    } finally {
      session.hooks.active = undefined;
      session.hooks.mode = undefined;
      session.hooks.sink = undefined;
    }
  });
}

export async function purchaseExpressDemoSession(
  id: string,
  owner: string,
  signal: AbortSignal,
  operationId: string,
  expectedAttempt: number,
  expectedResource: DemoResourceId,
): Promise<Extract<ExpressDemoSuccessResponse, { action: "purchase" }>> {
  return withSession(id, owner, signal, async (session) => {
    const replay = session.purchaseOperations.get(operationId);
    if (replay) {
      if (replay.attempt !== expectedAttempt || replay.resource !== expectedResource) {
        throw new ExpressDemoError("invalid_request", 409, "Purchase operation id was reused for different inputs.");
      }
      return replay.response;
    }
    const resource = RESOURCES[session.nextIndex];
    if (!resource) {
      throw new ExpressDemoError("invalid_request", 409, "This demo workspace already reached its final result.");
    }
    const attempt = session.nextIndex + 1;
    if (attempt !== expectedAttempt || resource.id !== expectedResource) {
      throw new ExpressDemoError(
        "invalid_request",
        409,
        "Purchase expectation is stale; refresh the workspace instead of charging the next resource.",
      );
    }
    const events: ExpressDemoEvent[] = [];
    session.hooks.active = { attempt, resource };
    session.hooks.mode = "hosted";
    session.hooks.sink = (event) => events.push(event);
    events.push({ type: "request", attempt, resource: resource.id, label: resource.label });

    const completeDelivery = async (
      response: globalThis.Response,
      hash: string,
    ): Promise<Extract<ExpressDemoSuccessResponse, { action: "purchase"; outcome: "delivered" }>> => {
      if (attempt === 4) {
        throw new Error("contract accepted a fourth payment beyond the 3 XLM mandate budget");
      }
      if (response.status !== 200) throw new Error(`paid fulfillment returned HTTP ${response.status}`);
      const body = parseDelivery(await response.json(), resource, hash);
      const receipt = getSettlementReceipt(response);
      if (!receipt) throw new Error("paid fulfillment response omitted its settlement receipt");
      // This hosted workspace is deliberately ephemeral and single-process.
      // Accept its in-memory application result before acknowledging transport;
      // generated local code below demonstrates the durable production order.
      session.served += 1;
      session.nextIndex += 1;
      const budget = budgetSummary(session);
      events.push({
        type: "delivery_200",
        attempt,
        resource: resource.id,
        label: body.label,
        status: 200,
        hash: body.settledTx,
        data: body.data,
      });
      events.push({ type: "budget", ...budget });
      const next = nextResource(session);
      if (!next) throw new Error("the fourth budget-rejection step was skipped");
      const completed = Object.freeze({
        ok: true,
        action: "purchase",
        operationId,
        sessionId: session.id,
        outcome: "delivered",
        resource: resourceSummary(resource, attempt),
        txHash: hash,
        explorerUrl: `${EXPLORER_TX}${hash}`,
        data: body.data,
        budget,
        nextResource: next,
        events,
      }) satisfies Extract<ExpressDemoSuccessResponse, { action: "purchase"; outcome: "delivered" }>;
      session.purchaseOperations.set(operationId, { attempt, resource: resource.id, response: completed });
      await session.consumer.acknowledgeDelivery(receipt);
      return completed;
    };

    try {
      const response = await session.consumer.fetch(`${session.origin}/source/${resource.id}`, {
        headers: { [ATTEMPT_HEADER]: String(attempt) },
        signal,
      });
      const hash = session.settledByAttempt.get(attempt);
      if (!hash) throw new Error("settled payment hash was not retained by the consumer");
      return await completeDelivery(response, hash);
    } catch (error) {
      if (signal.aborted) {
        // The client can no longer reconcile whether settlement completed. Burn
        // the ephemeral workspace so a later request cannot accidentally repay.
        await disposeSession(session);
        throw error;
      }
      const settledHash = session.settledByAttempt.get(attempt);
      if (error instanceof DeliveryPendingError) {
        const receiptHash = error.receipt.txHash;
        try {
          const recovered = await session.consumer.retryDelivery(error.receipt, {
            headers: { [ATTEMPT_HEADER]: String(attempt) },
            signal,
          });
          if (recovered.status === 200) {
            return await completeDelivery(recovered, receiptHash);
          }
          throw new Error(`exact-proof delivery recovery returned HTTP ${recovered.status}`);
        } catch (recoveryError) {
          await disposeSession(session);
          const reason = recoveryError instanceof Error ? recoveryError.message : "delivery recovery failed";
          throw new ExpressDemoError(
            "failed",
            502,
            `Transaction ${receiptHash} is unresolved; ${reason}. The workspace was closed and no second payment was attempted.`,
          );
        }
      }
      if (settledHash) {
        // A payment exists but the protected response was not safely confirmed.
        // No reusable signed receipt reached this branch, so close the ephemeral
        // workspace rather than ever restarting the payment flow.
        await disposeSession(session);
        throw new ExpressDemoError(
          "failed",
          502,
          `Payment ${settledHash} settled, but delivery could not be confirmed. The workspace was closed to prevent a second charge.`,
        );
      }
      if (attempt !== 4 || !isBudgetExceeded(error)) throw error;
      session.nextIndex += 1;
      const budget = budgetSummary(session);
      events.push({
        type: "purchase_blocked",
        attempt,
        resource: resource.id,
        reason: "budget exceeded",
      });
      events.push({ type: "budget", ...budget });
      events.push({
        type: "result",
        ok: true,
        served: 3,
        blocked: 1,
        spentXlm: BUDGET_XLM,
        budgetXlm: BUDGET_XLM,
        transactions: [...session.paymentTransactions],
      });
      const completed = Object.freeze({
        ok: true,
        action: "purchase",
        operationId,
        sessionId: session.id,
        outcome: "blocked",
        resource: resourceSummary(resource, attempt),
        reason: "budget exceeded",
        budget,
        nextResource: null,
        events,
      }) satisfies Extract<ExpressDemoSuccessResponse, { action: "purchase"; outcome: "blocked" }>;
      session.purchaseOperations.set(operationId, { attempt, resource: resource.id, response: completed });
      return completed;
    } finally {
      session.hooks.active = undefined;
      session.hooks.mode = undefined;
      session.hooks.sink = undefined;
    }
  });
}

export async function resetExpressDemoSession(
  id: string,
  owner: string,
  signal: AbortSignal,
): Promise<Extract<ExpressDemoSuccessResponse, { action: "reset" }>> {
  return withSession(id, owner, signal, async (session) => {
    await disposeSession(session);
    return {
      ok: true,
      action: "reset",
      sessionId: id,
      events: [{ type: "reset", sessionId: id }],
    };
  });
}

export async function statusExpressDemoSession(
  id: string,
  owner: string,
  signal: AbortSignal,
): Promise<Extract<ExpressDemoSuccessResponse, { action: "status" }>> {
  return withSession(id, owner, signal, async (session) => ({
    ok: true,
    action: "status",
    sessionId: session.id,
    expiresAt: new Date(session.expiresAt).toISOString(),
    events: session.publicEvents.splice(0, session.publicEvents.length),
  }));
}

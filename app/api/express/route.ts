import {
  activeExpressDemoSessions,
  challengeExpressDemoSession,
  createExpressDemoSession,
  isDemoResourceId,
  normalizeExpressDemoError,
  purchaseExpressDemoSession,
  resetExpressDemoSession,
  statusExpressDemoSession,
  type ExpressDemoErrorCode,
  type ExpressDemoErrorResponse,
  type ExpressDemoSuccessResponse,
} from "@/lib/express-demo";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const MAX_CONCURRENT_CREATES = 2;
const MAX_ACTIVE_SESSIONS = 4;
const CREATE_COOLDOWN_MS = 60_000;
const CANONICAL_ORIGIN = "https://staging.ackrate.com";
const recentCreates = new Map<string, number>();
let activeCreates = 0;

type ActionBody =
  | { action: "create" }
  | { action: "challenge" | "reset" | "status"; sessionId: string }
  | {
      action: "purchase";
      sessionId: string;
      operationId: string;
      expectedAttempt: number;
      expectedResource: "market" | "academic" | "news" | "patents";
    };

function requestIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  const candidate = forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
  return candidate.slice(0, 96);
}

function pruneCooldowns(now: number): void {
  for (const [ip, startedAt] of recentCreates) {
    if (now - startedAt > CREATE_COOLDOWN_MS * 2) recentCreates.delete(ip);
  }
}

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function publicOrigin(request: Request): string | undefined {
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",", 1)[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim();

  if (forwardedHost && /^[a-z0-9.:-]+$/i.test(forwardedHost)) {
    try {
      const candidate = new URL(`${forwardedProto === "http" ? "http" : "https"}://${forwardedHost}`);
      if (candidate.hostname === "staging.ackrate.com") {
        return CANONICAL_ORIGIN;
      }
      if (candidate.hostname.endsWith(".up.railway.app")) return candidate.origin;
      if (isLocalHostname(candidate.hostname)) {
        if (process.env.RAILWAY_ENVIRONMENT_ID || process.env.RAILWAY_PROJECT_ID) {
          return CANONICAL_ORIGIN;
        }
        return candidate.origin;
      }
    } catch {
      return undefined;
    }
  }

  if (requestUrl.hostname === "staging.ackrate.com") {
    return CANONICAL_ORIGIN;
  }
  if (requestUrl.hostname.endsWith(".up.railway.app")) return requestUrl.origin;
  if (isLocalHostname(requestUrl.hostname)) {
    // Railway can expose the internal localhost URL to the application even
    // when the external request used the custom domain.
    if (process.env.RAILWAY_ENVIRONMENT_ID || process.env.RAILWAY_PROJECT_ID) {
      return CANONICAL_ORIGIN;
    }
    return requestUrl.origin;
  }
  return undefined;
}

function parseBody(value: unknown): ActionBody | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const body = value as Record<string, unknown>;
  if (body.action === "create") return { action: "create" };
  if (
    body.action === "purchase"
    && typeof body.sessionId === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.sessionId)
    && typeof body.operationId === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.operationId)
    && Number.isInteger(body.expectedAttempt)
    && Number(body.expectedAttempt) >= 1
    && Number(body.expectedAttempt) <= 4
    && typeof body.expectedResource === "string"
    && isDemoResourceId(body.expectedResource)
  ) {
    return {
      action: "purchase",
      sessionId: body.sessionId,
      operationId: body.operationId,
      expectedAttempt: Number(body.expectedAttempt),
      expectedResource: body.expectedResource,
    };
  }
  if (
    (body.action === "challenge"
      || body.action === "reset"
      || body.action === "status")
    && typeof body.sessionId === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.sessionId)
  ) {
    return { action: body.action, sessionId: body.sessionId };
  }
  return undefined;
}

function json(
  body: ExpressDemoSuccessResponse | ExpressDemoErrorResponse,
  status = 200,
  retryAfter?: number,
): Response {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store, no-transform",
    "x-content-type-options": "nosniff",
  });
  if (retryAfter !== undefined) headers.set("retry-after", String(retryAfter));
  return new Response(JSON.stringify(body), { status, headers });
}

function errorResponse(
  code: ExpressDemoErrorCode,
  status: number,
  message: string,
  retryAfter?: number,
): Response {
  return json(
    { ok: false, code, error: message, events: [{ type: "error", message }] },
    status,
    retryAfter,
  );
}

export async function POST(request: Request): Promise<Response> {
  const raw = await request.json().catch(() => undefined) as unknown;
  const body = parseBody(raw);
  if (!body) {
    return errorResponse(
      "invalid_request",
      400,
      "Use create, challenge, purchase, status, or reset with a valid sessionId where required.",
    );
  }

  const owner = requestIp(request);
  try {
    if (body.action === "create") {
      const now = Date.now();
      pruneCooldowns(now);
      const previous = recentCreates.get(owner);
      if (previous !== undefined && now - previous < CREATE_COOLDOWN_MS) {
        const retryAfter = Math.max(
          1,
          Math.ceil((CREATE_COOLDOWN_MS - (now - previous)) / 1_000),
        );
        return errorResponse(
          "rate_limited",
          429,
          "Please wait before creating another live testnet workspace.",
          retryAfter,
        );
      }
      if (
        activeCreates >= MAX_CONCURRENT_CREATES
        || activeExpressDemoSessions() + activeCreates >= MAX_ACTIVE_SESSIONS
      ) {
        return errorResponse(
          "capacity",
          429,
          "The live testnet demo is at capacity. Please retry shortly.",
          15,
        );
      }
      recentCreates.set(owner, now);
      activeCreates += 1;
      try {
        const origin = publicOrigin(request);
        if (!origin) {
          return errorResponse("invalid_request", 400, "The public demo URL is invalid.");
        }
        return json(await createExpressDemoSession(owner, request.signal, origin));
      } catch (error) {
        if (recentCreates.get(owner) === now) recentCreates.delete(owner);
        throw error;
      } finally {
        activeCreates = Math.max(0, activeCreates - 1);
      }
    }

    if (body.action === "challenge") {
      return json(await challengeExpressDemoSession(body.sessionId, owner, request.signal));
    }
    if (body.action === "purchase") {
      return json(await purchaseExpressDemoSession(
        body.sessionId,
        owner,
        request.signal,
        body.operationId,
        body.expectedAttempt,
        body.expectedResource,
      ));
    }
    if (body.action === "status") {
      return json(await statusExpressDemoSession(body.sessionId, owner, request.signal));
    }
    return json(await resetExpressDemoSession(body.sessionId, owner, request.signal));
  } catch (error) {
    const normalized = normalizeExpressDemoError(error);
    return errorResponse(normalized.code, normalized.status, normalized.message);
  }
}

import { rpc } from "@stellar/stellar-sdk";
import type { NetworkName } from "./types";

const RETRY_DELAYS_MS = Object.freeze([250, 750, 1_500]);
const MAX_RETRY_AFTER_MS = 2_000;
const RPC_ATTEMPT_TIMEOUT_MS = 6_000;
const runtime = globalThis as typeof globalThis & { __reappMainnetRpcRetryInstalled?: boolean };

const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function statusOf(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const response = (error as { response?: unknown }).response;
  if (typeof response !== "object" || response === null) return null;
  const status = (response as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function transportFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: string; cause?: { code?: string } }).code
    ?? (error as Error & { cause?: { code?: string } }).cause?.code;
  return error.name === "AbortError"
    || error.name === "TimeoutError"
    || error instanceof TypeError
    || code === "ECONNRESET"
    || code === "ETIMEDOUT"
    || code === "UND_ERR_CONNECT_TIMEOUT";
}

function retryAfterMs(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  return Math.min(Number(value) * 1_000, MAX_RETRY_AFTER_MS);
}

function retryAfterFromError(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const response = (error as { response?: unknown }).response;
  if (typeof response !== "object" || response === null) return null;
  const headers = (response as { headers?: unknown }).headers;
  if (typeof headers !== "object" || headers === null) return null;
  const candidate = headers as { get?: (name: string) => unknown; [key: string]: unknown };
  return retryAfterMs(candidate.get?.("retry-after") ?? candidate["retry-after"]);
}

export async function retryRateLimited<T>(
  operation: () => Promise<T>,
  wait: (milliseconds: number) => Promise<void> = sleep,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const delay = RETRY_DELAYS_MS[attempt];
      if ((statusOf(error) !== 429 && !transportFailure(error)) || delay === undefined) throw error;
      await wait(Math.max(delay, retryAfterFromError(error) ?? 0));
    }
  }
}

export async function postRpcWithRetry(
  endpoint: string | readonly string[],
  body: unknown,
  request: typeof fetch = fetch,
  wait: (milliseconds: number) => Promise<void> = sleep,
): Promise<Response> {
  const endpoints = typeof endpoint === "string" ? [endpoint] : [...new Set(endpoint)];
  if (endpoints.length === 0) throw new Error("at least one RPC endpoint is required");
  const maxAttempts = endpoints.length * 2;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const target = endpoints[attempt % endpoints.length];
    try {
      const response = await request(target, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(RPC_ATTEMPT_TIMEOUT_MS),
      });
      const retryable = response.status === 429 || response.status >= 500;
      const delay = RETRY_DELAYS_MS[Math.floor(attempt / endpoints.length)];
      if (!retryable || attempt + 1 === maxAttempts || delay === undefined) return response;
      const retryAfter = retryAfterMs(response.headers.get("retry-after"));
      await response.body?.cancel().catch(() => undefined);
      if ((attempt + 1) % endpoints.length === 0) await wait(Math.max(delay, retryAfter ?? 0));
    } catch (error) {
      const delay = RETRY_DELAYS_MS[Math.floor(attempt / endpoints.length)];
      if (!transportFailure(error) || attempt + 1 === maxAttempts || delay === undefined) throw error;
      if ((attempt + 1) % endpoints.length === 0) await wait(delay);
    }
  }
  throw new Error("RPC relay exhausted its bounded retry window");
}

/** Retry an explicit HTTP 429 against the same manifest-pinned RPC endpoint. */
export function installMainnetRpcRetry(network: NetworkName): void {
  if (network !== "mainnet" || runtime.__reappMainnetRpcRetryInstalled) return;
  const methods = [
    "getLatestLedger",
    "getLedgerEntries",
    "simulateTransaction",
    "sendTransaction",
    "getTransaction",
  ] as const;
  const prototype = rpc.Server.prototype as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
  for (const method of methods) {
    const upstream = prototype[method];
    if (!upstream) continue;
    prototype[method] = function retryingRpcMethod(...args: unknown[]): Promise<unknown> {
      return retryRateLimited(() => upstream.apply(this, args));
    };
  }
  runtime.__reappMainnetRpcRetryInstalled = true;
}

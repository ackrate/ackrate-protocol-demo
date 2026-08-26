import { rpc } from "@stellar/stellar-sdk";
import type { NetworkName } from "./types";

const RETRY_DELAYS_MS = Object.freeze([2_000, 4_000, 8_000, 12_000, 18_000]);
const MAX_RETRY_AFTER_MS = 30_000;
const runtime = globalThis as typeof globalThis & { __reappMainnetRpcRetryInstalled?: boolean };

const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function statusOf(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const response = (error as { response?: unknown }).response;
  if (typeof response !== "object" || response === null) return null;
  const status = (response as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
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
      if (statusOf(error) !== 429 || delay === undefined) throw error;
      await wait(Math.max(delay, retryAfterFromError(error) ?? 0));
    }
  }
}

export async function postRpcWithRetry(
  endpoint: string,
  body: unknown,
  request: typeof fetch = fetch,
  wait: (milliseconds: number) => Promise<void> = sleep,
): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await request(endpoint, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const delay = RETRY_DELAYS_MS[attempt];
    if (response.status !== 429 || delay === undefined) return response;
    const retryAfter = retryAfterMs(response.headers.get("retry-after"));
    await response.body?.cancel().catch(() => undefined);
    await wait(Math.max(delay, retryAfter ?? 0));
  }
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

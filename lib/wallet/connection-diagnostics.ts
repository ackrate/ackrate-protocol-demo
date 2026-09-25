// This buffer accepts only fixed event names and numeric status codes. Never pass
// wallet payloads, messages, addresses, signatures, XDR, or request/response bodies.
export type ConnectionStep = "detect" | "access" | "network" | "message" | "config" | "session" | "challenge" | "verify";
export type ConnectionOutcome = "started" | "ok" | "unavailable" | "timeout" | "rejected" | "invalid" | "mismatch" | "failed";
export interface ConnectionEvent { at: string; step: ConnectionStep; outcome: ConnectionOutcome; code?: number }
const steps: readonly string[] = ["detect", "access", "network", "message", "config", "session", "challenge", "verify"];
const outcomes: readonly string[] = ["started", "ok", "unavailable", "timeout", "rejected", "invalid", "mismatch", "failed"];
const events: ConnectionEvent[] = [];
const listeners = new Set<() => void>();
export function recordConnectionEvent(step: ConnectionStep, outcome: ConnectionOutcome, code?: unknown): void {
  if (!steps.includes(step) || !outcomes.includes(outcome)) return;
  events.push({ at: new Date().toISOString(), step, outcome,
    ...(typeof code === "number" && Number.isInteger(code) && Math.abs(code) <= 99999 ? { code } : {}) });
  if (events.length > 40) events.shift();
  for (const listener of listeners) listener();
}
export function subscribeConnectionEvents(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function isMobileBrowser(): boolean {
  return typeof navigator !== "undefined" && (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
}
export function buildConnectionReport(context: { sourceCommit?: string | null; network?: string; ready?: boolean }) {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad|iPod/i.test(ua) || (isMobileBrowser() && /Mac/i.test(ua)) ? "iOS/iPadOS"
    : /Windows/i.test(ua) ? "Windows" : /Mac/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "unknown";
  const browser = /Freighter/i.test(ua) ? "Freighter" : /Edg/i.test(ua) ? "Edge" : /Firefox|FxiOS/i.test(ua) ? "Firefox"
    : /Chrome|CriOS/i.test(ua) ? "Chrome/WebView" : /Safari/i.test(ua) ? "Safari/WebView" : "unknown";
  return {
    schemaVersion: 1, createdAt: new Date().toISOString(),
    origin: typeof location === "undefined" ? "unknown" : location.origin,
    // Fixed path avoids exporting query parameters or user-authored URLs.
    surface: "/wallet", os, browser, mobile: isMobileBrowser(),
    secureContext: typeof window !== "undefined" && window.isSecureContext,
    online: typeof navigator !== "undefined" ? navigator.onLine : null,
    transport: "freighter-extension", mobileTransportConfigured: false,
    sourceCommit: context.sourceCommit && /^[a-f0-9]{40}$/i.test(context.sourceCommit) ? context.sourceCommit : null,
    network: context.network === "mainnet" || context.network === "testnet" ? context.network : "unknown",
    serverReady: typeof context.ready === "boolean" ? context.ready : null,
    events: events.map((event) => ({ ...event })),
  };
}

export class WalletConnectionError extends Error {
  constructor(public readonly step: ConnectionStep, public readonly outcome: ConnectionOutcome, message: string) {
    super(message);
    this.name = "WalletConnectionError";
  }
}

/** Timeouts only abandon connection/offline-sign-in reads; never retry or submit a transaction. */
export async function connectionRequest<T>(step: ConnectionStep, request: () => Promise<T>, timeoutMs: number): Promise<T> {
  recordConnectionEvent(step, "started");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(request),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new WalletConnectionError(step, "timeout",
          "Freighter did not respond in time. Open and unlock the extension, dismiss any old request, then try again.")), timeoutMs);
      }),
    ]);
  } catch (cause) {
    const outcome = cause instanceof WalletConnectionError ? cause.outcome : "failed";
    recordConnectionEvent(step, outcome);
    if (cause instanceof WalletConnectionError) throw cause;
    throw new WalletConnectionError(step, outcome, "The Freighter request failed. Open the extension and try again, or share the connection report below.");
  } finally {
    clearTimeout(timer);
  }
}

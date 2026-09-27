"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import type { MarketBrief } from "../../lib/wallet/market-brief";
import { sharedReportBrief } from "../../lib/wallet/shared-report";

export type SummaryRetryState = "checking" | "eligible" | "connect" | "running" | "succeeded" | "failed" | "used" | "uncertain" | "hidden";
const copy: Record<SummaryRetryState, string> = {
  checking: "Checking summary status…",
  eligible: "Written summary unavailable. Your sources and receipt are saved.",
  connect: "Written summary unavailable. Your sources and receipt are saved. Reconnect to retry. This is not a payment.",
  running: "Retrying written summary from saved sources.",
  succeeded: "Written summary added. Shared links continue to show the original result.",
  failed: "Retry did not produce a summary. Your sources and receipt are still available. No further retry for this purchase.",
  used: "Summary retry already used for this purchase.",
  uncertain: "We could not confirm whether the retry finished. Reload to check. Sources and receipt are unchanged.",
  hidden: "",
};

/** Status-first controller: only an explicit eligible click can POST. */
export function createSummaryRetryClient(input: { mandateId: string; txHash: string }, dependencies: {
  fetcher?: typeof fetch; onState: (state: SummaryRetryState) => void;
  onResult: (brief: MarketBrief, focus: boolean) => void;
}) {
  const fetcher = dependencies.fetcher ?? fetch;
  let state: SummaryRetryState = "checking";
  let posting = false;
  let reading = false;
  let disposed = false;
  let initiated = false;
  const controller = new AbortController();
  function set(next: SummaryRetryState) { state = next; if (!disposed) dependencies.onState(next); }
  async function readResponse(response: Response, fromPost: boolean) {
    if (response.status === 401) { set("connect"); return; }
    const body = await response.json() as { ok?: boolean; status?: string; retryAllowed?: boolean; brief?: unknown };
    if (!response.ok || body.ok !== true || typeof body.retryAllowed !== "boolean"
      || body.retryAllowed !== (body.status === "eligible")) throw new Error("Status unavailable");
    if (body.status === "succeeded") {
      const brief = sharedReportBrief(body.brief);
      const passes = (body.brief as { editorialPasses?: unknown })?.editorialPasses;
      if (!brief?.summary || (passes !== 1 && passes !== 2)) throw new Error("Invalid report revision");
      if (!disposed) dependencies.onResult({ ...brief, editorialPasses: passes }, initiated);
      initiated = false;
      set("succeeded");
    } else if (body.status === "failed") set(fromPost ? "failed" : "used");
    else if (body.status === "not_needed") set("hidden");
    else if (["eligible", "running", "uncertain"].includes(body.status ?? "")) set(body.status as SummaryRetryState);
    else throw new Error("Unknown report status");
  }
  async function load() {
    if (disposed || posting || reading) return;
    reading = true;
    set("checking");
    try {
      await readResponse(await fetcher(`/api/wallet/reports/retry?${new URLSearchParams(input)}`, {
        credentials: "same-origin", cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
      }), false);
    } catch { if (!disposed) set("uncertain"); }
    finally { reading = false; }
  }
  async function retry() {
    if (disposed || posting || reading || state !== "eligible") return;
    posting = true; initiated = true; set("running");
    let reconcile = false;
    try {
      await readResponse(await fetcher("/api/wallet/reports/retry", {
        method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(100_000)]),
      }), true);
    } catch { reconcile = true; }
    finally { posting = false; }
    if (reconcile && !disposed) await load();
  }
  async function reconnect(authenticate: () => Promise<void>) {
    if (disposed || posting || reading || state !== "connect") return;
    set("checking");
    try { await authenticate(); }
    catch { if (!disposed) set("connect"); return; }
    if (!disposed) await load();
  }
  return { load, retry, reconnect, dispose() { disposed = true; controller.abort(); } };
}

export function SummaryRetry({ mandateId, txHash, onResult, onReconnect }: {
  mandateId: string; txHash: string; onResult: (brief: MarketBrief, focus: boolean) => void; onReconnect?: () => Promise<void>;
}) {
  const [state, setState] = useState<SummaryRetryState>("checking");
  const callbacks = useRef({ onResult, onReconnect });
  callbacks.current = { onResult, onReconnect };
  const client = useRef<ReturnType<typeof createSummaryRetryClient> | null>(null);
  const statusId = useId();
  const helpId = useId();
  useEffect(() => {
    const active = createSummaryRetryClient({ mandateId, txHash }, { onState: setState,
      onResult: (brief, focus) => callbacks.current.onResult(brief, focus) });
    client.current = active;
    void active.load();
    const visible = () => { if (!document.hidden) void active.load(); };
    document.addEventListener("visibilitychange", visible);
    return () => { active.dispose(); document.removeEventListener("visibilitychange", visible); };
  }, [mandateId, txHash]);
  useEffect(() => {
    if (state !== "running") return;
    const timer = window.setInterval(() => { if (!document.hidden) void client.current?.load(); }, 3_000);
    return () => window.clearInterval(timer);
  }, [state]);
  const click = async () => {
    if (state === "connect" && callbacks.current.onReconnect) {
      await client.current?.reconnect(callbacks.current.onReconnect);
    } else if (state === "eligible") await client.current?.retry();
  };
  return <SummaryRetryView state={state} canReconnect={Boolean(onReconnect)} statusId={statusId} helpId={helpId} onClick={click} />;
}

/** Shared rendering for the live controller and synthetic visual fixtures. */
export function SummaryRetryView({ state, canReconnect = false, statusId, helpId, onClick }: {
  state: SummaryRetryState; canReconnect?: boolean; statusId: string; helpId: string; onClick?: () => void;
}) {
  if (state === "hidden") return null;
  const button = state === "eligible" || state === "running" || (state === "connect" && canReconnect);
  return <div className="report-summary-retry" aria-busy={state === "running" || state === "checking"}>
    <p id={statusId} role="status" aria-live="polite" aria-atomic="true">{state === "succeeded" && <Check size={14} aria-hidden="true" />}{copy[state]}</p>
    {button && <>
      <button type="button" aria-describedby={helpId} aria-disabled={state === "running" || undefined} onClick={state === "running" ? undefined : onClick}>
        {state === "running" ? <><LoaderCircle size={16} className="spin" aria-hidden="true" />Retrying…</> : "Retry written summary"}
      </button>
      <p id={helpId}>Uses your saved sources. No new search or wallet payment. One attempt.</p>
    </>}
  </div>;
}

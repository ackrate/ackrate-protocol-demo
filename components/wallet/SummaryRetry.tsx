"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import type { MarketBrief } from "../../lib/wallet/market-brief";
import { sharedReportBrief } from "../../lib/wallet/shared-report";

export type SummaryRetryState = "checking" | "eligible" | "connect" | "connect_incomplete" | "running" | "succeeded" | "failed" | "used" | "uncertain" | "unavailable" | "wrong_wallet" | "temporarily_unavailable" | "hidden";
const copy: Record<SummaryRetryState, string> = {
  checking: "Checking summary status…",
  eligible: "Your sources and receipt are saved.",
  connect: "Written summary unavailable. Your sources and receipt are saved. Reconnect to retry. This is not a payment.",
  connect_incomplete: "Sign-in did not finish. Open your wallet and sign in with the account that paid for this report, then try again. This is not a payment.",
  running: "Retrying written summary from saved sources.",
  succeeded: "Written summary added. Download report includes it. Receipt JSON and shared links keep the original result.",
  failed: "Retry did not produce a summary. Your sources and receipt are still available. No further retry for this purchase.",
  used: "Summary retry already used for this purchase.",
  uncertain: "The retry outcome is unconfirmed. No further retry is available for this purchase. Your sources and receipt are unchanged.",
  unavailable: "Summary retry is unavailable for this report. Your sources and receipt are saved. Read Sources or use Download report and Receipt JSON.",
  wrong_wallet: "Summary retry is unavailable for this report with the signed-in wallet. Your sources and receipt are saved.",
  temporarily_unavailable: "Summary retry is temporarily unavailable. Your sources and receipt are saved. Reload the page later to try again.",
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
  let reconnecting = false;
  let postUnavailable = false;
  const controller = new AbortController();
  function set(next: SummaryRetryState) { state = next; if (!disposed) dependencies.onState(next); }
  async function readResponse(response: Response, fromPost: boolean) {
    if (response.status === 401) { set(reconnecting ? "connect_incomplete" : "connect"); return true; }
    if (response.status === 404) { set("wrong_wallet"); return true; }
    if (response.status === 400 || response.status === 403) { set("unavailable"); return true; }
    if (!response.ok) {
      if (fromPost) postUnavailable = true;
      set("temporarily_unavailable"); return false;
    }
    let body: { ok?: boolean; status?: string; retryAllowed?: boolean; brief?: unknown };
    try { body = await response.json(); }
    catch { set("unavailable"); return false; }
    if (!body || body.ok !== true || typeof body.retryAllowed !== "boolean"
      || body.retryAllowed !== (body.status === "eligible")) { set("unavailable"); return false; }
    if (body.status === "succeeded") {
      const brief = sharedReportBrief(body.brief);
      const passes = (body.brief as { editorialPasses?: unknown })?.editorialPasses;
      if (!brief?.summary || (passes !== 1 && passes !== 2)) { set("unavailable"); return false; }
      try { if (!disposed) dependencies.onResult({ ...brief, editorialPasses: passes }, initiated); }
      catch { set("unavailable"); return false; }
      initiated = false;
      set("succeeded");
    } else if (body.status === "failed") set(fromPost ? "failed" : "used");
    else if (body.status === "not_needed") set("hidden");
    else if (body.status === "eligible") set(postUnavailable ? "temporarily_unavailable" : "eligible");
    else if (["running", "uncertain"].includes(body.status ?? "")) set(body.status as SummaryRetryState);
    else { set("unavailable"); return false; }
    return true;
  }
  async function readStatus() {
    if (disposed || posting || reading) return;
    reading = true;
    if (state !== "running" && state !== "succeeded") set("checking");
    try {
      await readResponse(await fetcher(`/api/wallet/reports/retry?${new URLSearchParams(input)}`, {
        credentials: "same-origin", cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
      }), false);
    } catch { if (!disposed) set("temporarily_unavailable"); }
    finally { reading = false; }
  }
  async function load() {
    // Reconnect owns its final status read; tab-return checks must not race it.
    if (!reconnecting) await readStatus();
  }
  async function retry() {
    if (disposed || posting || reading || state !== "eligible") return;
    posting = true; initiated = true; set("running");
    let reconcile = false;
    try {
      reconcile = !await readResponse(await fetcher("/api/wallet/reports/retry", {
        method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(100_000)]),
      }), true);
    } catch { reconcile = true; }
    finally { posting = false; }
    if (reconcile && !disposed) await load();
  }
  async function reconnect(authenticate: () => Promise<void>) {
    if (disposed || posting || reading || (state !== "connect" && state !== "connect_incomplete")) return;
    reconnecting = true;
    set("checking");
    try { await authenticate(); }
    catch { if (!disposed) set("connect_incomplete"); reconnecting = false; return; }
    try { if (!disposed) await readStatus(); }
    finally { reconnecting = false; }
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
    if ((state === "connect" || state === "connect_incomplete") && callbacks.current.onReconnect) {
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
  const connectionNeeded = state === "connect" || state === "connect_incomplete";
  const button = state === "eligible" || state === "running" || (connectionNeeded && canReconnect);
  const message = connectionNeeded && !canReconnect
    ? "Summary retry requires wallet sign-in, which this view cannot start. Your sources and receipt are saved."
    : copy[state];
  return <div className="report-summary-retry" aria-busy={state === "running" || state === "checking"}>
    <p id={statusId} role="status" aria-live="polite" aria-atomic="true">{state === "succeeded" && <Check size={14} aria-hidden="true" />}<span>{message}</span></p>
    {button && <>
      <button type="button" aria-describedby={helpId} aria-disabled={state === "running" || undefined} onClick={state === "running" ? undefined : onClick}>
        {state === "running" ? <><LoaderCircle size={16} className="spin" aria-hidden="true" />Retrying…</> : "Retry written summary"}
      </button>
      <p id={helpId}>Uses your saved sources. No new search or wallet payment. One attempt.</p>
    </>}
  </div>;
}

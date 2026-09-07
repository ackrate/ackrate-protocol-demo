"use client";

import { useEffect, useState } from "react";
import CliMainnetTest from "./CliMainnetTest";

interface BurnerStatus {
  configured: boolean;
  state: string;
  error?: string;
  version?: string;
  sourceCommit?: string;
  run?: { id: string; state: string; logs: string; error?: string; fundingHash?: string; payer: string; agent: string; merchant: string; owner: string };
}

/** A public, read-only view of the single operator-funded run. No payment actions. */
export default function CliMainnetTestPanel() {
  const [status, setStatus] = useState<BurnerStatus | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const response = await fetch("/api/cli/test/burner", { cache: "no-store", signal: controller.signal });
        const result = await response.json();
        if (!response.ok || typeof result.configured !== "boolean" || typeof result.state !== "string") throw new Error("status unavailable");
        if (!disposed) { setStatus(result); setUnavailable(false); }
      } catch { if (!disposed) setUnavailable(true); }
      if (!disposed) timer = setTimeout(poll, 3000);
    };
    void poll();
    return () => { disposed = true; controller.abort(); clearTimeout(timer); };
  }, []);

  if (status?.configured === false) return <CliMainnetTest />;
  const run = status?.run;
  const state = status && ["blocked", "failed", "unavailable"].includes(status.state)
    ? status.state : run?.state ?? status?.state ?? "checking";
  const success = state === "succeeded";
  const hash = run?.fundingHash;
  const download = () => {
    if (!status) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(status, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "ackrate-mainnet-cli-evidence.json";
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-100" aria-label="Mainnet CLI test status">
      <div className="border-b border-zinc-800 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Team-funded Mainnet test</h2>
          <span role="status" className={`rounded-full border px-3 py-1 text-xs ${success ? "border-emerald-500/30 text-emerald-300" : "border-zinc-700 text-zinc-300"}`}>{state}</span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">One authorized run: three purchases at 0.01 USDC, then a budget-limit check. No Freighter interaction is needed for this team-funded test.</p>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">Account setup transfers 6 XLM for reserves and fee headroom, plus 0.03 USDC. Refreshing this page cannot fund or restart the test.</p>
        {status?.version && <p className="mt-3 font-mono text-xs text-zinc-400">CLI {status.version} · source build</p>}
      </div>
      <div className="space-y-4 p-5">
        {unavailable && <p role="alert" className="text-sm text-zinc-300">Connection interrupted. Checking the existing run; no new payment is started.</p>}
        {(run?.error || status?.error) && <p role="alert" className="rounded-lg border border-zinc-700 p-3 text-sm text-zinc-200">{run?.error || status?.error}</p>}
        {success && <p className="text-sm text-emerald-300">The CLI&apos;s payment and budget checks passed. Review the receipts below.</p>}
        {hash && /^[a-f0-9]{64}$/.test(hash) && <a className="inline-block text-sm text-zinc-200 underline underline-offset-4" href={`https://stellar.expert/explorer/public/tx/${hash}`} target="_blank" rel="noreferrer">View funding transaction ↗</a>}
        <pre aria-label="CLI test output" className="max-h-[32rem] min-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-800 bg-black p-4 font-mono text-xs leading-relaxed text-zinc-300">{run?.logs || "Waiting for the server's recorded test status. A deployment is not a completed payment test."}</pre>
        <button type="button" disabled={!run} onClick={download} className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-black disabled:opacity-40">Download test evidence</button>
      </div>
    </section>
  );
}

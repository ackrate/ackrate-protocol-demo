"use client";

import { useEffect, useState } from "react";
import CliMainnetTest from "./CliMainnetTest";
import { presentCliTestLogs } from "../lib/cli-test-presentation";

interface BurnerStatus {
  configured: boolean;
  state: string;
  error?: string;
  version?: string;
  sourceCommit?: string;
  run?: { id: string; state: string; logs: string; error?: string; fundingHash?: string; payer: string; agent: string; merchant: string; owner: string };
}

/** The interactive test is always available; prior team evidence never replaces it. */
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

  const run = status?.run;
  const state = status && ["blocked", "failed", "unavailable"].includes(status.state)
    ? status.state : run?.state ?? status?.state ?? "checking";
  const success = state === "succeeded";
  const presentation = presentCliTestLogs(run?.logs || "");
  const hash = run?.fundingHash;
  const download = () => {
    if (!status) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(status, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "ackrate-mainnet-cli-evidence.json";
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="space-y-6">
      <CliMainnetTest />
      {(status?.configured || run || unavailable) && <details className="rounded-xl border border-zinc-800 bg-zinc-950/60">
        <summary className="cursor-pointer p-4 text-sm font-medium text-zinc-400">Previous team-funded test · {success ? "passed" : "recorded evidence"}</summary>
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-100" aria-label="Mainnet CLI test status">
      <div className="border-b border-zinc-800 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Previous team-funded Mainnet test</h2>
          <span role="status" className={`rounded-full border px-3 py-1 text-xs ${success ? "border-emerald-500/30 text-emerald-300" : "border-zinc-700 text-zinc-300"}`}>{state}</span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">Saved evidence from the earlier automated run, separate from your interactive test above. This panel cannot start a new test.</p>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">Account setup transfers 6 XLM for reserves and fee headroom, plus 0.03 USDC. Refreshing this page cannot fund or restart the test.</p>
        {status?.version && <p className="mt-3 font-mono text-xs text-zinc-400">CLI {status.version} · verified published executable</p>}
      </div>
      <div className="space-y-4 p-5">
        {unavailable && <p role="alert" className="text-sm text-zinc-300">Connection interrupted. Checking the existing run; no new payment is started.</p>}
        {(run?.error || status?.error) && <p role="alert" className="rounded-lg border border-zinc-700 p-3 text-sm text-zinc-200">{run?.error || status?.error}</p>}
        {success && <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4"><h3 className="font-medium text-emerald-300">Payment test passed</h3><p className="mt-2 text-sm leading-relaxed text-zinc-300">Three research sources delivered after three 0.01-USDC payments. The contract blocked purchase four because the 0.03-USDC budget was exhausted.</p><p className="mt-2 text-xs text-zinc-400">This is the completed run. Viewing receipts or downloading evidence does not spend again.</p></div>}
        {success && presentation.receipts.length > 0 && <div className="grid gap-2 sm:grid-cols-2" aria-label="Recorded transaction receipts">{presentation.receipts.map((receipt) => <a key={receipt.label} href={`https://stellar.expert/explorer/public/tx/${receipt.hash}`} target="_blank" rel="noreferrer" className="rounded-lg border border-zinc-800 p-3 text-sm text-zinc-200 transition-colors hover:border-zinc-500"><span className="block font-medium">{receipt.label} ↗</span><span className="mt-1 block font-mono text-xs text-zinc-500">{receipt.hash.slice(0, 10)}…{receipt.hash.slice(-8)}</span></a>)}</div>}
        {hash && /^[a-f0-9]{64}$/.test(hash) && <a className="inline-block text-sm text-zinc-200 underline underline-offset-4" href={`https://stellar.expert/explorer/public/tx/${hash}`} target="_blank" rel="noreferrer">View funding transaction ↗</a>}
        <pre aria-label="CLI test output" className="max-h-[32rem] min-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-zinc-800 bg-black p-4 font-mono text-xs leading-relaxed text-zinc-300">{presentation.output || "Waiting for the server's recorded test status. A deployment is not a completed payment test."}</pre>
        {presentation.prior && <details className="rounded-lg border border-zinc-800 p-3"><summary className="cursor-pointer text-sm text-zinc-400">Earlier setup attempts · retained history</summary><pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-zinc-500">{presentation.prior}</pre></details>}
        <button type="button" disabled={!run} onClick={download} className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-black disabled:opacity-40">Download test evidence</button>
      </div>
    </section>
      </details>}
    </div>
  );
}

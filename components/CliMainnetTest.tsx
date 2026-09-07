"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAddress, getNetworkDetails, requestAccess, signTransaction } from "@stellar/freighter-api";
import { Download, ExternalLink, Loader2, WalletCards } from "lucide-react";

const PUBLIC_NETWORK = "Public Global Stellar Network ; September 2015";
const API = "/api/cli/test";
const STORAGE_PREFIX = "ackrate:cli-test:funding:v1:";
const ACCOUNT = /^G[A-Z2-7]{55}$/;
const HASH = /^[a-f0-9]{64}$/i;

type TestRun = {
  id: string;
  state: "prepared" | "funding" | "funded" | "running" | "succeeded" | "failed";
  payer: string;
  agent: string;
  merchant: string;
  owner: string;
  fundingHash?: string;
  fundingXdr?: string;
  fundingExpiresAt?: number;
  logs: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
};
type TestStatus = {
  ready: boolean;
  version: string;
  sourceCommit: string;
  publishedVersion: string;
  run?: TestRun;
  error?: string;
};
type SavedFunding = {
  version: 1;
  runId: string;
  owner: string;
  originalXdr: string;
  signedXdr: string;
  savedAt: number;
};

const stateLabels: Record<TestRun["state"], string> = {
  prepared: "Ready for funding review",
  funding: "Confirming funding transaction",
  funded: "Accounts funded · ready to run",
  running: "CLI test running",
  succeeded: "CLI test completed",
  failed: "Test needs attention",
};

function cleanLog(value: string): string {
  return value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/\r/g, "");
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "The request could not be completed. Refresh the status before retrying.";
}

async function walletAccount(expected?: string): Promise<string> {
  const access = await (expected ? getAddress() : requestAccess());
  if (access.error || !ACCOUNT.test(access.address)) {
    throw new Error("Freighter did not connect an account. Open Freighter, unlock it, and approve access.");
  }
  if (expected && access.address !== expected) {
    throw new Error(`Select the original funding account in Freighter: ${expected}`);
  }
  const network = await getNetworkDetails();
  if (network.error || network.networkPassphrase !== PUBLIC_NETWORK) {
    throw new Error("Switch Freighter to Stellar Mainnet before continuing.");
  }
  return access.address;
}

async function signForOwner(xdr: string, owner: string): Promise<string> {
  await walletAccount(owner);
  const signed = await signTransaction(xdr, { networkPassphrase: PUBLIC_NETWORK, address: owner });
  if (signed.error || !signed.signedTxXdr) throw new Error("Freighter did not sign the transaction. Nothing was submitted.");
  if (signed.signerAddress !== owner) throw new Error("Freighter returned a different signing account. Nothing was submitted.");
  const network = await getNetworkDetails();
  if (network.error || network.networkPassphrase !== PUBLIC_NETWORK) {
    throw new Error("Freighter's network changed during signing. Nothing was submitted.");
  }
  return signed.signedTxXdr;
}

function readSavedFunding(run: TestRun): SavedFunding | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${run.id}`);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<SavedFunding>;
    if (saved.version !== 1 || saved.runId !== run.id || saved.owner !== run.owner
      || saved.originalXdr !== run.fundingXdr || typeof saved.signedXdr !== "string"
      || !saved.signedXdr || saved.signedXdr.length > 512 * 1024) return null;
    return saved as SavedFunding;
  } catch { return null; }
}

export default function CliMainnetTest() {
  const [status, setStatus] = useState<TestStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [savedFunding, setSavedFunding] = useState<SavedFunding | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [runApproved, setRunApproved] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const requestId = useRef(0);
  const appliedId = useRef(0);

  const applyStatus = useCallback((next: TestStatus, id: number) => {
    if (!mounted.current || id < appliedId.current) return;
    appliedId.current = id;
    setStatus(next);
    setSavedFunding(next.run ? readSavedFunding(next.run) : null);
    setNow(Date.now());
  }, []);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    const response = await fetch(API, { credentials: "same-origin", cache: "no-store" });
    const next = await response.json() as TestStatus;
    if (!response.ok) throw new Error(next.error || "The CLI test status is temporarily unavailable.");
    applyStatus(next, id);
    return next;
  }, [applyStatus]);

  async function post(body: Record<string, unknown>): Promise<TestStatus> {
    const id = ++requestId.current;
    const response = await fetch(API, {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    const next = await response.json() as TestStatus;
    if (!response.ok) throw new Error(next.error || "The CLI test request was not accepted.");
    applyStatus(next, id);
    return next;
  }

  useEffect(() => {
    mounted.current = true;
    void refresh().catch((cause) => { if (mounted.current) setError(errorText(cause)); });
    return () => { mounted.current = false; };
  }, [refresh]);

  const run = status?.run;
  useEffect(() => {
    if (run?.state !== "funding" && run?.state !== "running") return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        if (!busyRef.current) {
          await refresh();
          if (!stopped && mounted.current) setError(null);
        }
      }
      catch (cause) { if (!stopped && mounted.current) setError(errorText(cause)); }
      if (!stopped) timer = setTimeout(poll, 2_000);
    };
    timer = setTimeout(poll, 2_000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [run?.state, refresh]);

  useEffect(() => {
    if (run?.state !== "prepared") return;
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, [run?.state]);

  useEffect(() => { setReviewed(false); setRunApproved(false); }, [run?.id]);

  async function action(label: string, work: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(label);
    setError(null);
    try { await work(); }
    catch (cause) {
      if (mounted.current) setError(errorText(cause));
      await refresh().catch(() => undefined);
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(null);
    }
  }

  async function connectAndPrepare() {
    if (!status?.ready || run) return;
    await action("Verify ownership in Freighter", async () => {
      const owner = await walletAccount();
      const response = await fetch(API, {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "challenge", owner }),
      });
      const challenge = await response.json() as { challengeToken?: string; xdr?: string; error?: string };
      if (!response.ok || !challenge.challengeToken || !challenge.xdr) {
        throw new Error(challenge.error || "The ownership check could not be prepared.");
      }
      const signedXdr = await signForOwner(challenge.xdr, owner);
      await post({ action: "prepare", owner, challengeToken: challenge.challengeToken, signedXdr });
    });
  }

  async function fund() {
    if (!status?.ready || !run || run.state !== "prepared" || !reviewed || savedFunding) return;
    await action("Approve funding in Freighter", async () => {
      const latest = await refresh();
      const current = latest.run;
      if (!latest.ready || !current || current.id !== run.id || current.state !== "prepared" || !current.fundingXdr) {
        throw new Error("The funding state changed. Review the current status before continuing.");
      }
      if (current.fundingXdr !== run.fundingXdr || current.owner !== run.owner) {
        setReviewed(false);
        throw new Error("The prepared transaction changed. Review it again before signing.");
      }
      if (current.fundingExpiresAt && current.fundingExpiresAt * 1_000 <= Date.now()) {
        throw new Error("This prepared funding transaction expired. Refresh the status; do not sign an expired transaction.");
      }
      if (readSavedFunding(current)) {
        setSavedFunding(readSavedFunding(current));
        throw new Error("This exact funding transaction is already saved. Use Resume saved transaction instead of signing again.");
      }
      const signedXdr = await signForOwner(current.fundingXdr, current.owner);
      const saved: SavedFunding = {
        version: 1, runId: current.id, owner: current.owner,
        originalXdr: current.fundingXdr, signedXdr, savedAt: Date.now(),
      };
      try {
        localStorage.setItem(`${STORAGE_PREFIX}${current.id}`, JSON.stringify(saved));
        if (readSavedFunding(current)?.signedXdr !== signedXdr) throw new Error("storage verification failed");
      } catch {
        throw new Error("This browser could not save the signed funding transaction for recovery. Nothing was submitted. Enable site storage before trying again.");
      }
      setSavedFunding(saved);
      await post({ action: "fund", signedXdr });
      await refresh();
    });
  }

  async function resumeFunding() {
    if (!status?.ready || !run || !savedFunding) return;
    await action("Resume the saved funding transaction", async () => {
      const latest = await refresh();
      const current = latest.run;
      if (current?.state === "funded" || current?.state === "running" || current?.state === "succeeded") return;
      if (!latest.ready || !current || current.id !== run.id || current.owner !== run.owner || !["prepared", "funding"].includes(current.state)) {
        throw new Error("This run cannot accept a funding retry. Check its current status before continuing.");
      }
      const saved = readSavedFunding(current);
      if (!saved) throw new Error("The saved signature does not match this exact prepared transaction. No replacement transaction was submitted.");
      await walletAccount(current.owner);
      await post({ action: "fund", signedXdr: saved.signedXdr });
      await refresh();
    });
  }

  async function runTest() {
    if (!status?.ready || !run || run.state !== "funded" || !runApproved) return;
    await action("Start the Mainnet CLI test", async () => {
      const latest = await refresh();
      if (!latest.ready || latest.run?.id !== run.id || latest.run.state !== "funded" || latest.run.owner !== run.owner) {
        throw new Error("The run state changed. Review its status before starting another action.");
      }
      await walletAccount(latest.run.owner);
      await post({ action: "run", confirmRealUsdc: true });
    });
  }

  const logs = cleanLog(typeof run?.logs === "string" ? run.logs : "");
  const txHashes = Array.from(new Set([
    ...(run?.fundingHash && HASH.test(run.fundingHash) ? [run.fundingHash.toLowerCase()] : []),
    ...Array.from(logs.matchAll(/https:\/\/stellar\.expert\/explorer\/public\/tx\/([a-f0-9]{64})\b/gi), (match) => match[1]!.toLowerCase()),
  ]));
  const fundingExpired = Boolean(run?.fundingExpiresAt && run.fundingExpiresAt * 1_000 <= now);
  const canResume = Boolean(savedFunding && run && ["prepared", "funding"].includes(run.state));
  const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40";

  function downloadLog() {
    if (!run) return;
    const text = `ACKRATE CLI Mainnet test\nRun: ${run.id}\nState: ${run.state}\nSource build: ${status?.version}\nCommit: ${status?.sourceCommit}\n\n${logs}`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `ackrate-cli-${run.id.replace(/[^a-zA-Z0-9-]/g, "")}.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  return (
    <section aria-labelledby="cli-mainnet-test-title" className="rounded-xl border border-zinc-700 bg-zinc-950 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="cli-mainnet-test-title" className="text-xl font-semibold text-zinc-100">Test the CLI with Freighter</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-400">Fund three dedicated test accounts, then run the research agent on Stellar Mainnet. The CLI buys three sources for 0.01 USDC each and checks that the next purchase is rejected by the budget limit.</p>
        </div>
        <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300">Mainnet · real funds</span>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-zinc-500">Test runner: CLI {status?.version || "0.2.1"} source build{status?.sourceCommit && /^[a-f0-9]{7,40}$/i.test(status.sourceCommit) ? ` · ${status.sourceCommit.slice(0, 8)}` : ""}. Published npm version: {status?.publishedVersion || "0.2.0"}.</p>

      {(error || status?.error || run?.error) && <p role="alert" className="mt-4 break-words rounded-lg border border-amber-800/60 bg-amber-950/20 p-3 text-sm text-amber-200">{error || run?.error || status?.error}</p>}
      {!status && !error && <p role="status" className="mt-5 flex items-center gap-2 text-sm text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" />Loading test status…</p>}
      {status && !status.ready && <p className="mt-4 text-sm text-zinc-400">The test service is not ready yet. No funding or CLI run can start until it is ready.</p>}

      {!run && <div className="mt-5 space-y-3">
        <p className="text-sm leading-relaxed text-zinc-300">Connect your Mainnet account and sign an ownership check in Freighter. That check is never broadcast and has no network fee. Funding is a separate approval after you review the amounts and addresses.</p>
        <button type="button" className={buttonClass} disabled={!status?.ready || Boolean(busy)} onClick={() => void connectAndPrepare()}><WalletCards className="h-4 w-4" />Connect and verify Freighter</button>
      </div>}

      {run && <div className="mt-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 pt-4">
          <p role="status" className="text-sm font-medium text-zinc-200">{stateLabels[run.state]}</p>
          <span className="break-all font-mono text-xs text-zinc-500">Run {run.id}</span>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <p className="text-base font-semibold text-zinc-100">6 XLM + 0.03 USDC, plus network fees</p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">This is a real transfer to three server-managed test accounts. The XLM supports account reserves and operating balances; reserves are not network fees. The payer account uses the 0.03 USDC for the three research purchases.</p>
          <dl className="mt-4 grid gap-3 text-xs">
            {[["Your funding account", run.owner], ["Test payer · server managed", run.payer], ["Test agent · server managed", run.agent], ["Test merchant · server managed", run.merchant]].map(([label, address]) => <div key={label} className="grid gap-1 sm:grid-cols-[190px_1fr]"><dt className="text-zinc-400">{label}</dt><dd className="break-all font-mono text-zinc-200">{address}</dd></div>)}
          </dl>
        </div>

        {run.state === "prepared" && !savedFunding && <div className="space-y-3">
          {fundingExpired ? <p className="text-sm text-amber-200">The prepared funding transaction has expired. Refresh the status before continuing.</p> : <label className="flex items-start gap-3 text-sm leading-relaxed text-zinc-300"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} disabled={Boolean(busy)} className="mt-1 h-4 w-4 accent-zinc-300" /><span>I reviewed the Mainnet amounts and addresses and approve funding these server-managed test accounts.</span></label>}
          <button type="button" className={buttonClass} disabled={!status?.ready || !reviewed || !run.fundingXdr || fundingExpired || Boolean(busy)} onClick={() => void fund()}>Fund test accounts in Freighter</button>
        </div>}

        {canResume && <div className="space-y-3 rounded-lg border border-zinc-700 p-4">
          <p className="text-sm leading-relaxed text-zinc-300">Your signed funding transaction is saved in this browser. Resume sends that exact transaction again; it does not create a new transfer or a second network fee. The server checks for confirmation first.</p>
          <button type="button" className={buttonClass} disabled={!status?.ready || Boolean(busy)} onClick={() => void resumeFunding()}>Resume saved transaction</button>
        </div>}

        {run.state === "funding" && <p className="text-sm text-zinc-400">Checking Mainnet confirmation every two seconds. You can refresh this page; do not create another funding transaction.</p>}
        {run.state === "funded" && <div className="space-y-3">
          <label className="flex items-start gap-3 text-sm leading-relaxed text-zinc-300"><input type="checkbox" checked={runApproved} onChange={(event) => setRunApproved(event.target.checked)} disabled={Boolean(busy)} className="mt-1 h-4 w-4 accent-zinc-300" /><span>I approve this CLI test spending up to 0.03 USDC from the funded test payer, plus its Mainnet transaction fees.</span></label>
          <button type="button" className={buttonClass} disabled={!status?.ready || !runApproved || Boolean(busy)} onClick={() => void runTest()}>Run Mainnet CLI test</button>
        </div>}
        {run.state === "running" && <p className="text-sm text-zinc-400">The server is running the CLI. Progress updates every two seconds and remains available after a page refresh.</p>}
        {run.state === "failed" && <p className="text-sm leading-relaxed text-zinc-400">Review the retained output and transaction links before taking another action. A failed run does not prove that no funds moved.</p>}

        {txHashes.length > 0 && <div className="flex flex-wrap gap-x-5 gap-y-2">{txHashes.map((hash) => <a key={hash} className="inline-flex items-center gap-1.5 font-mono text-xs text-zinc-300 underline underline-offset-4 hover:text-white" href={`https://stellar.expert/explorer/public/tx/${hash}`} target="_blank" rel="noreferrer">{hash === run.fundingHash?.toLowerCase() ? "Funding" : "Transaction"} {hash.slice(0, 8)}…{hash.slice(-6)}<ExternalLink className="h-3 w-3" /></a>)}</div>}
        {logs && <div className="overflow-hidden rounded-lg border border-zinc-800">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2"><span className="text-xs font-medium text-zinc-400">CLI output</span><button type="button" onClick={downloadLog} className="inline-flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white"><Download className="h-3.5 w-3.5" />Download log</button></div>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words bg-black p-4 text-xs leading-relaxed text-zinc-300">{logs}</pre>
        </div>}
      </div>}
      <div className="mt-5 flex flex-wrap items-center gap-4">
        {busy && <span role="status" className="inline-flex items-center gap-2 text-sm text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" />{busy}…</span>}
        <button type="button" disabled={Boolean(busy)} onClick={() => void action("Refresh status", async () => { await refresh(); })} className="text-xs text-zinc-400 underline underline-offset-4 hover:text-zinc-200 disabled:opacity-40">Refresh status</button>
      </div>
    </section>
  );
}

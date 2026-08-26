"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { txUrl, accountUrl, contractUrl } from "@/lib/explorer";
import ReactMarkdown, { type Components } from "react-markdown";

const mdComponents: Components = {
  h1: ({ node, ...p }) => <h2 className="mb-2 mt-4 text-base font-semibold text-emerald-200 first:mt-0" {...p} />,
  h2: ({ node, ...p }) => <h2 className="mb-2 mt-4 text-base font-semibold text-emerald-200 first:mt-0" {...p} />,
  h3: ({ node, ...p }) => <h3 className="mb-1.5 mt-3 text-sm font-semibold text-emerald-200/90 first:mt-0" {...p} />,
  p: ({ node, ...p }) => <p className="mb-2.5 leading-relaxed text-emerald-50/90 last:mb-0" {...p} />,
  ul: ({ node, ...p }) => <ul className="mb-2.5 list-disc space-y-1 pl-5 marker:text-emerald-400/70 last:mb-0" {...p} />,
  ol: ({ node, ...p }) => <ol className="mb-2.5 list-decimal space-y-1 pl-5 marker:text-emerald-400/70 last:mb-0" {...p} />,
  li: ({ node, ...p }) => <li className="leading-relaxed text-emerald-50/90" {...p} />,
  strong: ({ node, ...p }) => <strong className="font-semibold text-white" {...p} />,
  em: ({ node, ...p }) => <em className="italic text-emerald-100" {...p} />,
  a: ({ node, ...p }) => <a className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300" target="_blank" rel="noreferrer" {...p} />,
  hr: () => <hr className="my-3 border-emerald-400/15" />,
  code: ({ node, ...p }) => <code className="rounded bg-black/30 px-1 py-0.5 font-mono text-[12px] text-emerald-100" {...p} />,
  blockquote: ({ node, ...p }) => <blockquote className="my-2 border-l-2 border-emerald-400/30 pl-3 italic text-emerald-100/80" {...p} />,
};

type Wallet = {
  userSecret: string; userPublic: string;
  agentSecret: string; agentPublic: string;
  merchantSecret: string; merchantPublic: string;
  contractId: string; explorer: string;
};
type Inputs = Record<string, unknown>;
type Act = { id: number; label: string; hash?: string; account?: string; status: "ok" | "blocked" | "info" };

type Step =
  | { kind: "narration"; id: number; text: string }
  | { kind: "orchestrator"; id: number; engine: string; turn: number }
  | { kind: "purchase"; id: number; source: string; label: string; icon: string; reason: string; status: "pending" | "ok" | "blocked"; hash?: string; blockReason?: string; findings?: string }
  | { kind: "final"; id: number; text: string };

const PRESETS = [
  "Is the real-world-asset (RWA) tokenization market real, or hype?",
  "Should a startup build agent payments on Stellar in 2026?",
  "What's the competitive landscape for AI shopping agents?",
  "Will stablecoins disrupt cross-border B2B payments?",
];

const BUDGET = 3; // XLM — set by the mandate; the contract blocks the 4th source

export default function ResearchPage() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [inputs, setInputs] = useState<Inputs | null>(null);
  const [mandateId, setMandateId] = useState("");
  const [revoked, setRevoked] = useState(false);

  const [question, setQuestion] = useState(PRESETS[0]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [spent, setSpent] = useState(0);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [activeLLM, setActiveLLM] = useState("");

  const [bal, setBal] = useState<{ user: number; merchant: number } | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [activity, setActivity] = useState<Act[]>([]);
  const actId = useRef(0);
  const stepId = useRef(0);

  const api = async (action: string, extra: Record<string, unknown> = {}) =>
    (await fetch("/api/ackrate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...extra }) })).json();
  const short = (s: string) => (s ? `${s.slice(0, 5)}…${s.slice(-4)}` : "");
  const log = (a: Omit<Act, "id">) => setActivity((xs) => [{ id: actId.current++, ...a }, ...xs]);

  async function createWallet() {
    setBusy("Creating + funding testnet accounts…"); setErr("");
    try {
      const w: Wallet = await api("init");
      if ((w as { error?: string }).error) throw new Error((w as { error?: string }).error);
      setWallet(w);
      log({ label: "Created + funded 3 testnet accounts (Friendbot)", account: w.userPublic, status: "info" });
      setBal(await api("balances", { userPublic: w.userPublic, merchantPublic: w.merchantPublic }));
    } catch (e) { setErr(String(e)); } finally { setBusy(""); }
  }

  async function authorize() {
    if (!wallet) return;
    setBusy("Registering mandate + approving allowance…"); setErr("");
    try {
      const r = await api("setup", { userSecret: wallet.userSecret, agentPublic: wallet.agentPublic, merchantPublic: wallet.merchantPublic });
      if (r.error) throw new Error(r.error);
      setInputs(r.inputs); setMandateId(r.mandateId);
      if (r.registerTx) log({ label: `register_mandate — user authorizes a ${BUDGET} XLM research budget`, hash: r.registerTx, status: "ok" });
      if (r.approveTx) log({ label: "approve — SEP-41 allowance to the contract", hash: r.approveTx, status: "ok" });
    } catch (e) { setErr(String(e)); } finally { setBusy(""); }
  }

  async function revoke() {
    if (!wallet || !inputs) return;
    setBusy("Revoking the mandate…"); setErr("");
    try {
      const r = await api("revoke", { inputs, userSecret: wallet.userSecret });
      if (r.error) throw new Error(r.error);
      setRevoked(true);
      log({ label: "revoke_mandate — consent withdrawn", hash: r.hash, status: "ok" });
    } catch (e) { setErr(String(e)); } finally { setBusy(""); }
  }

  function patchLastPurchase(source: string, patch: Partial<Extract<Step, { kind: "purchase" }>>) {
    setSteps((xs) => {
      const next = [...xs];
      for (let i = next.length - 1; i >= 0; i--) {
        const s = next[i];
        if (s.kind === "purchase" && s.source === source && s.status === "pending") {
          next[i] = { ...s, ...patch };
          break;
        }
      }
      return next;
    });
  }

  async function runResearch() {
    if (!wallet || !inputs || !question.trim() || running) return;
    setRunning(true); setDone(false); setErr(""); setSteps([]); setSpent(0); setActiveLLM("");
    setBusy("Research agent is working — paying for sources on-chain…");
    log({ label: `Research agent started · “${question.slice(0, 60)}”`, status: "info" });
    try {
      const res = await fetch("/api/research", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, inputs, agentSecret: wallet.agentSecret }),
      });
      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const lineStr = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (lineStr) handleEvent(JSON.parse(lineStr));
        }
      }
      if (wallet) setBal(await api("balances", { userPublic: wallet.userPublic, merchantPublic: wallet.merchantPublic }));
    } catch (e) { setErr(String(e)); } finally { setRunning(false); setBusy(""); }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleEvent(ev: any) {
    switch (ev.type) {
      case "narration":
        setSteps((xs) => [...xs, { kind: "narration", id: stepId.current++, text: ev.text }]);
        break;
      case "provider_switch":
        setSteps((xs) => [...xs, { kind: "narration", id: stepId.current++, text: `⚡ ${ev.text}` }]);
        log({ label: `LLM failover · ${ev.text}`, status: "info" });
        break;
      case "llm_active":
        setActiveLLM(ev.engine);
        setSteps((xs) => [...xs, { kind: "orchestrator", id: stepId.current++, engine: ev.engine, turn: ev.turn }]);
        break;
      case "purchase_attempt":
        setSteps((xs) => [...xs, { kind: "purchase", id: stepId.current++, source: ev.source, label: ev.label, icon: ev.icon, reason: ev.reason, status: "pending" }]);
        break;
      case "purchase_ok":
        patchLastPurchase(ev.source, { status: "ok", hash: ev.hash });
        setSpent((s) => s + 1);
        log({ label: `execute_payment — agent paid 1 XLM · ${ev.label}`, hash: ev.hash, status: "ok" });
        break;
      case "purchase_blocked":
        patchLastPurchase(ev.source, { status: "blocked", blockReason: ev.reason });
        log({ label: `execute_payment BLOCKED · ${ev.label} · ${ev.reason}`, status: "blocked" });
        break;
      case "source_data":
        patchLastPurchase(ev.source, { findings: ev.text });
        break;
      case "final":
        setSteps((xs) => [...xs, { kind: "final", id: stepId.current++, text: ev.text }]);
        break;
      case "done":
        setDone(true);
        break;
      case "error":
        setErr(ev.message);
        break;
    }
  }

  const pct = Math.min(100, (spent / BUDGET) * 100);
  const ready = !!wallet && !!inputs;

  return (
    <main className="relative mx-auto w-full max-w-5xl px-4 py-10 sm:px-5">
      <div className="glow" aria-hidden />

      <motion.header
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } } }}
        className="mb-10 pt-6"
      >
        <motion.div
          variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
          className="inline-flex items-center gap-2 rounded-full glass px-3.5 py-1.5 text-[11px] font-semibold tracking-[0.18em] text-emerald-300/90"
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
          STELLAR TESTNET · @ackrate/core 0.3.1
        </motion.div>
        <motion.h1
          variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="mt-5 text-4xl font-black leading-[1.04] tracking-tight sm:text-6xl"
        >
          A research agent that{" "}
          <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-emerald-400 bg-clip-text text-transparent drop-shadow-[0_0_34px_rgba(52,211,153,0.28)]">
            pays for what it reads
          </span>
          , capped on-chain.
        </motion.h1>
        <motion.p
          variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
          className="mt-5 max-w-2xl text-base leading-relaxed text-emerald-100/70 sm:text-lg"
        >
          Give an AI agent a <b className="text-emerald-200">{BUDGET} XLM</b> budget and a question. It autonomously buys
          paid data sources (<b className="text-emerald-200">1 XLM</b> each) to answer it, every purchase a real Stellar
          payment. The <b className="text-emerald-200">MandateRegistry</b> contract enforces the cap: once the budget is
          spent it <b className="text-emerald-200">blocks</b> the next purchase, so the agent cannot overspend even when it
          wants more.
        </motion.p>
        <motion.div variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }} className="mt-6 flex flex-wrap gap-2.5 text-xs">
          {["Autonomous agent", "Budget enforced on-chain", "LLM Agnostic Agent", "Testnet payments"].map((t) => (
            <span key={t} className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-1 text-emerald-200/80">
              {t}
            </span>
          ))}
        </motion.div>
      </motion.header>

      <AnimatePresence>
        {busy && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-200">
            <span className="h-2 w-2 animate-ping rounded-full bg-emerald-400" /> {busy}
          </motion.div>
        )}
      </AnimatePresence>
      {err && <div className="mb-4 break-words rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-200">{err}</div>}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        {!wallet ? (
          <Btn onClick={createWallet} disabled={!!busy}>1 · Create + fund wallet</Btn>
        ) : !mandateId ? (
          <Btn onClick={authorize} disabled={!!busy}>2 · Authorize agent ({BUDGET} XLM)</Btn>
        ) : (
          <Btn onClick={revoke} disabled={revoked || !!busy || running} ghost>{revoked ? "Mandate revoked ✓" : "Revoke mandate"}</Btn>
        )}
        {wallet && (
          <div className="flex flex-wrap items-center gap-2">
            <a href={accountUrl(wallet.agentPublic)} target="_blank" rel="noreferrer" className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-emerald-100/75 hover:border-emerald-400/30">
              Agent <code className="text-emerald-300">{short(wallet.agentPublic)}</code> ↗
            </a>
            <a href={contractUrl(wallet.contractId)} target="_blank" rel="noreferrer" className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-sm text-emerald-300 transition hover:bg-emerald-400/20">
              Contract <code>{short(wallet.contractId)}</code> ↗
            </a>
            {bal && (
              <a href={accountUrl(wallet.merchantPublic)} target="_blank" rel="noreferrer" className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-emerald-100/75 hover:border-emerald-400/30">
                Data marketplace earned <b className="text-emerald-300">{Math.max(0, bal.merchant - 10000).toFixed(0)} XLM</b> ↗
              </a>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {mandateId && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-7">
            <div className="h-2.5 w-full max-w-md overflow-hidden rounded-full bg-black/40 ring-1 ring-white/10">
              <motion.div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300" animate={{ width: `${pct}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-emerald-100/60">
              <span>{spent} / {BUDGET} XLM spent · mandate <code>{short(mandateId)}</code></span>
              {activeLLM && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-emerald-300">
                  <span className={`h-1.5 w-1.5 rounded-full bg-emerald-400 ${running ? "animate-pulse" : ""}`} />
                  {activeLLM}
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Question + run */}
      <section className="mb-8 rounded-2xl glass p-4 sm:p-5">
        <label className="mb-2 block text-xs font-semibold tracking-wide text-emerald-100/60">RESEARCH QUESTION</label>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={running}
          rows={2}
          className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-emerald-50 outline-none placeholder:text-emerald-100/30 focus:border-emerald-400/40 disabled:opacity-60"
          placeholder="Ask the agent anything…"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p} onClick={() => setQuestion(p)} disabled={running}
              className={`rounded-full border px-3 py-1.5 text-xs transition disabled:opacity-50 ${question === p ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200" : "border-white/10 bg-white/[0.03] text-emerald-100/60 hover:border-emerald-400/30"}`}>
              {p}
            </button>
          ))}
        </div>
        <div className="mt-4">
          <Btn onClick={runResearch} disabled={!ready || running || revoked || !question.trim()}>
            {running ? "Agent researching…" : revoked ? "Mandate revoked" : "▶ Run research agent"}
          </Btn>
          {!ready && <span className="ml-3 text-xs text-emerald-100/40">Create a wallet and authorize the agent first.</span>}
        </div>
      </section>

      {/* Live LLM engine indicator — shows which provider is serving, and any failover */}
      {(running || activeLLM) && (
        <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] px-4 py-2.5 text-sm">
          <span className={`h-2 w-2 rounded-full bg-emerald-400 ${running ? "animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.9)]" : ""}`} />
          <span className="font-semibold tracking-wide text-emerald-200">LLM engine</span>
          <span className="text-emerald-100/75">{activeLLM || "starting…"}</span>
          <span className="ml-auto text-xs text-emerald-100/45">dual-provider failover</span>
        </div>
      )}

      {/* Agent trace */}
      <AnimatePresence>
        {steps.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-10 space-y-3">
            {steps.map((s) => {
              if (s.kind === "orchestrator")
                return (
                  <motion.div key={s.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/[0.07] px-3 py-1.5 text-xs">
                    <span className="text-emerald-400">⚙</span>
                    <span className="font-semibold tracking-[0.14em] text-emerald-300">ORCHESTRATOR</span>
                    <span className="text-emerald-100/55">selected</span>
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 font-semibold text-emerald-200">{s.engine}</span>
                    <span className="text-emerald-100/45">· turn {s.turn}</span>
                  </motion.div>
                );
              if (s.kind === "narration")
                return (
                  <motion.div key={s.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex gap-2.5 text-sm text-emerald-100/70">
                    <span className="mt-0.5 shrink-0 text-emerald-400/70">▸</span>
                    <span className="italic">{s.text}</span>
                  </motion.div>
                );
              if (s.kind === "final")
                return (
                  <motion.div key={s.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    className="overflow-hidden rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.06] p-4 sm:p-5">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-emerald-300">
                      <span>✦</span> AGENT&apos;S SYNTHESIZED ANSWER
                    </div>
                    <div className="text-sm leading-relaxed text-emerald-50">
                      <ReactMarkdown components={mdComponents}>{s.text}</ReactMarkdown>
                    </div>
                  </motion.div>
                );
              // purchase
              return (
                <motion.div key={s.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 26 }}
                  className={`overflow-hidden rounded-2xl border bg-white/[0.035] p-4 transition-colors ${s.status === "blocked" ? "border-red-500/30" : s.status === "ok" ? "border-emerald-400/25" : "border-white/10"}`}>
                  <div className="flex items-start gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-black/40 text-lg ring-1 ring-white/10">{s.icon}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{s.label}</span>
                        {s.status === "pending" && <span className="flex items-center gap-1 text-xs text-emerald-100/50"><span className="h-1.5 w-1.5 animate-ping rounded-full bg-emerald-400" /> paying 1 XLM…</span>}
                        {s.status === "ok" && s.hash && (
                          <a href={txUrl(s.hash)} target="_blank" rel="noreferrer" className="text-xs text-emerald-400 hover:underline">paid 1 XLM ✓ {short(s.hash)} ↗</a>
                        )}
                        {s.status === "blocked" && <span className="text-xs font-semibold text-red-300">⛔ blocked · {s.blockReason}</span>}
                      </div>
                      <div className="mt-0.5 text-xs text-emerald-100/55">{s.reason}</div>
                      {s.findings && (
                        <div className="mt-2.5 whitespace-pre-wrap rounded-lg border border-white/10 bg-black/25 p-2.5 font-mono text-[11px] leading-relaxed text-emerald-100/75">{s.findings}</div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
            {running && (
              <div className="flex items-center gap-2 px-1 text-xs text-emerald-100/40">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> agent working…
              </div>
            )}
            {done && !running && (
              <div className="px-1 text-xs text-emerald-100/40">Run complete · {spent} of {BUDGET} sources purchased on-chain.</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* On-chain activity */}
      <section className="mt-2 overflow-hidden rounded-2xl glass shadow-[0_10px_40px_-12px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between border-b border-white/10 bg-black/20 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex gap-1.5" aria-hidden>
              <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
            </span>
            <span className="ml-1.5 flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${running ? "animate-pulse bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" : "bg-emerald-400/50"}`} />
              On-chain activity
            </span>
          </div>
          <span className="text-xs text-emerald-100/40">live · click any row to open the explorer</span>
        </div>
        <div className="max-h-72 overflow-y-auto p-2 font-mono text-xs">
          {activity.length === 0 ? (
            <div className="px-2 py-6 text-center text-emerald-100/35">Nothing yet — create a wallet, authorize the agent, and run a question to see real transactions stream in.</div>
          ) : (
            <AnimatePresence initial={false}>
              {activity.map((a) => {
                const href = a.hash ? txUrl(a.hash) : a.account ? accountUrl(a.account) : undefined;
                const dot = a.status === "ok" ? "bg-emerald-400" : a.status === "blocked" ? "bg-red-400" : "bg-sky-400";
                const Row = (
                  <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/[0.04]">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
                    <span className="min-w-0 flex-1 truncate text-emerald-100/80">{a.label}</span>
                    {a.hash && <span className="shrink-0 text-emerald-400/80">{short(a.hash)} ↗</span>}
                    {!a.hash && a.account && <span className="shrink-0 text-sky-300/80">acct ↗</span>}
                  </div>
                );
                return (
                  <motion.div key={a.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
                    {href ? <a href={href} target="_blank" rel="noreferrer" className="block">{Row}</a> : Row}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </section>

      <footer className="mt-10 text-center text-xs leading-relaxed text-emerald-100/40">
        Stellar testnet · the agent is an <code>LLM</code> · every source purchase routes through <code>MandateRegistry.execute_payment</code> · the contract rejects any purchase past the budget.
      </footer>
    </main>
  );
}

function Btn({ children, onClick, disabled, ghost }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; ghost?: boolean }) {
  return (
    <motion.button whileTap={{ scale: 0.96 }} whileHover={disabled ? {} : { scale: 1.03, y: -1 }} onClick={onClick} disabled={disabled}
      className={ghost
        ? "rounded-xl border border-red-400/40 bg-red-400/[0.04] px-5 py-2.5 text-sm font-semibold text-red-300 transition hover:border-red-400/70 hover:bg-red-400/10 disabled:opacity-50"
        : "rounded-xl bg-gradient-to-r from-emerald-400 to-teal-300 px-5 py-2.5 text-sm font-bold text-[#06241a] shadow-[0_8px_30px_-6px_rgba(52,211,153,0.6)] transition hover:shadow-[0_10px_42px_-4px_rgba(52,211,153,0.85)] disabled:opacity-40 disabled:shadow-none"}>
      {children}
    </motion.button>
  );
}

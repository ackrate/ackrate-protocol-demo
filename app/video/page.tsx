"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { txUrl, accountUrl, contractUrl } from "@/lib/explorer";

type Wallet = {
  userSecret: string; userPublic: string;
  agentSecret: string; agentPublic: string;
  merchantSecret: string; merchantPublic: string;
  contractId: string; explorer: string;
};
type Inputs = Record<string, unknown>;
type Video = { id: string; title: string; channel: string; ytId: string };
type Act = { id: number; label: string; hash?: string; account?: string; status: "ok" | "blocked" | "info" };

const FEED: Video[] = [
  { id: "a", title: "Pumped Up Kicks", channel: "Foster The People", ytId: "SDTZ7iX4vTQ" },
  { id: "b", title: "A New Error", channel: "Moderat", ytId: "JWnX41TBFF4" },
  { id: "c", title: "Smells Like Teen Spirit", channel: "Nirvana", ytId: "hTWKbfoikeg" },
  { id: "d", title: "California Love", channel: "2Pac ft. Dr. Dre", ytId: "omfz62qu_Bc" },
  { id: "e", title: "Big Poppa", channel: "The Notorious B.I.G.", ytId: "phaJXp_zMYM" },
];

const PRICE = 1;
const BUDGET = 3;

export default function Page() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [inputs, setInputs] = useState<Inputs | null>(null);
  const [mandateId, setMandateId] = useState("");
  const [unlocked, setUnlocked] = useState<Record<string, string>>({});
  const [blocked, setBlocked] = useState<Record<string, string>>({});
  const [spent, setSpent] = useState(0);
  const [bal, setBal] = useState<{ user: number; merchant: number } | null>(null);
  const [revoked, setRevoked] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [activity, setActivity] = useState<Act[]>([]);
  const actId = useRef(0);

  const api = async (action: string, extra: Record<string, unknown> = {}) =>
    (await fetch("/api/ackrate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...extra }) })).json();
  const short = (s: string) => (s ? `${s.slice(0, 5)}…${s.slice(-4)}` : "");
  const log = (a: Omit<Act, "id">) => setActivity((xs) => [{ id: actId.current++, ...a }, ...xs]);
  const reason = (e: string) => (e.includes("#5") ? "mandate revoked" : e.includes("#6") ? "budget exceeded" : e.includes("#4") ? "mandate expired" : "rejected on-chain");

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
      if (r.registerTx) log({ label: "register_mandate — user signs the budget cap", hash: r.registerTx, status: "ok" });
      if (r.approveTx) log({ label: "approve — SEP-41 allowance to the contract", hash: r.approveTx, status: "ok" });
    } catch (e) { setErr(String(e)); } finally { setBusy(""); }
  }
  async function playVideo(v: Video) {
    if (!wallet || !inputs) return;
    setBusy(`Agent paying ${PRICE} XLM to unlock “${v.title}”…`); setErr("");
    try {
      const r = await api("pay", { inputs, agentSecret: wallet.agentSecret, expectedSeq: spent });
      if (r.error) {
        setBlocked((b) => ({ ...b, [v.id]: r.error }));
        log({ label: `execute_payment BLOCKED · ${v.title} · ${reason(r.error)}`, status: "blocked" });
      } else {
        setUnlocked((u) => ({ ...u, [v.id]: r.hash }));
        setSpent((s) => s + PRICE);
        log({ label: `execute_payment — agent paid ${PRICE} XLM · ${v.title}`, hash: r.hash, status: "ok" });
        setBal(await api("balances", { userPublic: wallet.userPublic, merchantPublic: wallet.merchantPublic }));
      }
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

  const pct = Math.min(100, (spent / BUDGET) * 100);

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
          Video, paid by your{" "}
          <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-emerald-400 bg-clip-text text-transparent drop-shadow-[0_0_34px_rgba(52,211,153,0.28)]">
            AI agent
          </span>
          , capped on-chain.
        </motion.h1>
        <motion.p
          variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
          className="mt-5 max-w-2xl text-base leading-relaxed text-emerald-100/70 sm:text-lg"
        >
          Give an agent a <b className="text-emerald-200">{BUDGET} XLM</b> budget and let it pay-per-play. Every unlock is a
          real Stellar payment, and the <b className="text-emerald-200">MandateRegistry</b> contract enforces the cap. After{" "}
          {BUDGET} videos it <b className="text-emerald-200">blocks</b> the next payment, and you can{" "}
          <b className="text-emerald-200">revoke</b> anytime.
        </motion.p>
        <motion.div variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }} className="mt-6 flex flex-wrap gap-2.5 text-xs">
          {["Enforced on-chain", "SDK can't overspend", "Testnet payments", "Revocable anytime"].map((t) => (
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
          <Btn onClick={revoke} disabled={revoked || !!busy} ghost>{revoked ? "Mandate revoked ✓" : "Revoke mandate"}</Btn>
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
                Creator earned <b className="text-emerald-300">{Math.max(0, bal.merchant - 10000).toFixed(0)} XLM</b> ↗
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
            <div className="mt-1.5 text-xs text-emerald-100/60">{spent} / {BUDGET} XLM spent · mandate <code>{short(mandateId)}</code></div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
        initial="hidden" animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07 } } }}
      >
        {FEED.map((v) => {
          const hash = unlocked[v.id];
          const block = blocked[v.id];
          return (
            <motion.div
              key={v.id}
              variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}
              whileHover={{ y: -5 }}
              transition={{ type: "spring", stiffness: 300, damping: 24 }}
              className="group relative overflow-hidden rounded-2xl glass sheen shadow-[0_10px_40px_-12px_rgba(0,0,0,0.6)] transition-shadow hover:shadow-[0_22px_60px_-16px_rgba(52,211,153,0.28)]"
            >
              <div className="relative aspect-video w-full overflow-hidden bg-black">
                {hash ? (
                  <iframe className="h-full w-full" src={`https://www.youtube.com/embed/${v.ytId}?autoplay=1&rel=0&modestbranding=1`} title={v.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
                ) : (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`https://img.youtube.com/vi/${v.ytId}/hqdefault.jpg`} alt="" className="h-full w-full object-cover opacity-55 transition duration-500 group-hover:scale-105 group-hover:opacity-70" />
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/70 via-black/20 to-transparent">
                      {block ? (
                        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
                          <div className="text-3xl">⛔</div>
                          <div className="mt-1 text-xs font-semibold text-red-300">blocked · {reason(block)}</div>
                        </motion.div>
                      ) : (
                        <motion.button whileTap={{ scale: 0.94 }} whileHover={{ scale: 1.04 }} onClick={() => playVideo(v)} disabled={!mandateId || !!busy}
                          className="flex items-center gap-2 rounded-full bg-emerald-400/95 px-4 py-2 text-sm font-bold text-[#06241a] shadow-lg shadow-emerald-500/30 disabled:opacity-40">
                          ▶ Unlock · {PRICE} XLM
                        </motion.button>
                      )}
                    </div>
                  </>
                )}
              </div>
              <div className="p-3.5">
                <div className="truncate font-semibold">{v.title}</div>
                <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-emerald-100/55">
                  <span>{v.channel}</span>
                  {hash && <a href={txUrl(hash)} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">paid ✓</a>}
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Behind the scenes — live on-chain activity */}
      <section className="mt-10 overflow-hidden rounded-2xl glass shadow-[0_10px_40px_-12px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between border-b border-white/10 bg-black/20 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex gap-1.5" aria-hidden>
              <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
            </span>
            <span className="ml-1.5 flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${busy ? "animate-pulse bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" : "bg-emerald-400/50"}`} />
              On-chain activity
            </span>
          </div>
          <span className="text-xs text-emerald-100/40">live · click any row to open the explorer</span>
        </div>
        <div className="max-h-72 overflow-y-auto p-2 font-mono text-xs">
          {activity.length === 0 ? (
            <div className="px-2 py-6 text-center text-emerald-100/35">Nothing yet — create a wallet and authorize the agent to see real transactions stream in.</div>
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
        Stellar testnet · payments route through <code>MandateRegistry.execute_payment</code> · the contract rejects any payment past the mandate.
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

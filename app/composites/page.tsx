"use client";

/**
 * Composite mandates demo: three buyer agents pool one group buy and the
 * MandateRegistry clearing pool settles everyone at one uniform price in a
 * single atomic transaction. Streams NDJSON from /api/composites; every
 * on-chain step links to its transaction on stellar.expert.
 */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { txUrl, accountUrl, contractUrl } from "@/lib/explorer";

type StepKey = "register" | "approve" | "commit";
const STEP_ORDER: StepKey[] = ["register", "approve", "commit"];
type Buyer = {
  addr?: string;
  steps: Partial<Record<StepKey, string>>;
  ready: boolean;
  units?: number;
  leg?: { qty: number; legXlm: number };
};
type Act = { id: number; label: string; hash?: string; account?: string; status: "ok" | "blocked" | "info" };
type Sim = {
  fires: boolean;
  priceXlm: number;
  totalQty: number;
  netXlm: number;
  legs: { buyer: number; qty: number; legXlm: number }[];
};
type Pool = {
  poolId: string;
  hash: string;
  thresholdQty: number;
  thresholdValueXlm: number;
  deadline: number;
  status: "open" | "cleared" | "failed";
};
type Cleared = { hash: string; priceXlm: number; totalQty: number; totalXlm: number };

const STEP_LABEL: Record<StepKey, string> = {
  register: "sign mandate",
  approve: "approve allowance",
  commit: "commit to pool",
};
const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;
const freshBuyers = (): Buyer[] => [0, 1, 2].map(() => ({ steps: {}, ready: false }));

function Btn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl bg-gradient-to-r from-neutral-400 to-neutral-300 px-5 py-2.5 text-sm font-bold text-[#000000] shadow-[0_8px_30px_-6px_rgba(255,255,255,0.6)] transition hover:shadow-[0_10px_42px_-4px_rgba(255,255,255,0.85)] disabled:opacity-40 disabled:shadow-none"
    >
      {children}
    </button>
  );
}

export default function CompositesPage() {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [contractId, setContractId] = useState("");
  const [merchant, setMerchant] = useState("");
  const [pool, setPool] = useState<Pool | null>(null);
  const [buyers, setBuyers] = useState<Buyer[]>(freshBuyers());
  const [sim, setSim] = useState<Sim | null>(null);
  const [cleared, setCleared] = useState<Cleared | null>(null);
  const [merchantDelta, setMerchantDelta] = useState<number | null>(null);
  const [earlyProof, setEarlyProof] = useState("");
  const [doubleProof, setDoubleProof] = useState("");
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  // Countdown anchor derived from SERVER-sent seconds-to-close, so a skewed
  // client clock cannot fight the server's countdown events.
  const [closeAtMs, setCloseAtMs] = useState<number | null>(null);
  const [activity, setActivity] = useState<Act[]>([]);
  const actId = useRef(0);

  const log = (a: Omit<Act, "id">) => setActivity((xs) => [{ id: actId.current++, ...a }, ...xs]);

  // Local 1s countdown between server ticks, once the close time is known.
  useEffect(() => {
    if (closeAtMs === null || !pool || pool.status !== "open" || !running) return;
    const t = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((closeAtMs - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(t);
  }, [closeAtMs, pool, running]);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const handleEvent = (ev: any) => {
    switch (ev.type) {
      case "status":
        setBusy(ev.text);
        break;
      case "setup":
        setContractId(ev.contractId);
        setMerchant(ev.merchant);
        setBuyers((bs) => bs.map((b, i) => ({ ...b, addr: ev.buyers[i] })));
        log({ label: "five testnet accounts funded via friendbot", status: "info" });
        break;
      case "pool":
        setPool({ ...ev, status: "open" });
        setCloseAtMs(Date.now() + ev.secondsToClose * 1000);
        setSecondsLeft(ev.secondsToClose);
        log({ label: `register_pool · minimum ${ev.thresholdQty} units + ${ev.thresholdValueXlm} XLM`, hash: ev.hash, status: "ok" });
        break;
      case "buyer_step":
        setBuyers((bs) => bs.map((b, i) => (i === ev.buyer ? { ...b, steps: { ...b.steps, [ev.step as StepKey]: ev.hash } } : b)));
        log({ label: `buyer ${ev.buyer + 1} · ${STEP_LABEL[ev.step as StepKey]}`, hash: ev.hash, status: "ok" });
        break;
      case "buyer_ready":
        setBuyers((bs) => bs.map((b, i) => (i === ev.buyer ? { ...b, ready: true, units: ev.units } : b)));
        break;
      case "simulate":
        setSim(ev);
        setBusy("");
        log({ label: `simulate_clear · fires at ${ev.priceXlm} XLM per unit`, status: "info" });
        break;
      case "early_clear_rejected":
        setEarlyProof(ev.reason);
        log({ label: "clear_pool before the close · rejected", status: "blocked" });
        break;
      case "countdown":
        setSecondsLeft(ev.secondsLeft);
        setCloseAtMs(Date.now() + ev.secondsLeft * 1000); // re-anchor on the server's clock
        break;
      case "cleared":
        setCleared(ev);
        setPool((p) => (p ? { ...p, status: "cleared" } : p));
        setBuyers((bs) => bs.map((b, i) => ({ ...b, leg: ev.legs.find((l: { buyer: number }) => l.buyer === i) })));
        setBusy("");
        log({ label: `clear_pool · ${ev.totalQty} units settled at ${ev.priceXlm} XLM per unit`, hash: ev.hash, status: "ok" });
        break;
      case "balances":
        setMerchantDelta(ev.merchantDeltaXlm);
        break;
      case "double_clear_rejected":
        setDoubleProof(ev.reason);
        log({ label: "second clear_pool · rejected", status: "blocked" });
        break;
      case "error":
        setErr(ev.message);
        setBusy("");
        setSecondsLeft(null);
        setPool((p) => (p && p.status === "open" ? { ...p, status: "failed" } : p));
        break;
      case "done":
        setDone(true);
        break;
    }
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const run = async () => {
    setRunning(true);
    setDone(false);
    setErr("");
    setBusy("Starting the group buy…");
    setPool(null);
    setBuyers(freshBuyers());
    setSim(null);
    setCleared(null);
    setMerchantDelta(null);
    setEarlyProof("");
    setDoubleProof("");
    setSecondsLeft(null);
    setActivity([]);
    try {
      const res = await fetch("/api/composites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
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
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      setBusy("");
    }
  };

  const committedUnits = sim
    ? sim.totalQty
    : buyers.reduce((sum, b) => sum + (b.ready ? (b.units ?? 0) : 0), 0);
  const pct = pool ? Math.min(100, (committedUnits / pool.thresholdQty) * 100) : 0;

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
          className="inline-flex items-center gap-2 rounded-full glass px-3.5 py-1.5 text-[11px] font-semibold tracking-[0.18em] text-neutral-300/90"
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400 shadow-[0_0_10px_rgba(255,255,255,0.9)]" />
          COMPOSITE MANDATES · CLEARING POOLS · TESTNET
        </motion.div>
        <motion.h1
          variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
          className="mt-5 text-4xl font-black leading-[1.04] tracking-tight sm:text-6xl"
        >
          A group buy,{" "}
          <span className="bg-gradient-to-r from-neutral-300 via-neutral-200 to-neutral-400 bg-clip-text text-transparent drop-shadow-[0_0_34px_rgba(255,255,255,0.28)]">
            cleared on-chain
          </span>
        </motion.h1>
        <motion.p
          variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
          className="mt-5 max-w-2xl text-base leading-relaxed text-neutral-100/70 sm:text-lg"
        >
          Three buyer agents each sign one rule: 3 units at 5 XLM, or 1 at 10 XLM. None reaches the vendor&apos;s
          9-unit minimum alone. A shared clearing pool aggregates them; at the deadline the contract computes the
          single lowest workable price and settles every leg in one transaction. The allocation is a pure function
          of on-chain state, so the organizer holds no discretion to skim.
        </motion.p>
        <motion.div
          variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
          className="mt-5 flex flex-wrap gap-2 text-xs"
        >
          {["vendor minimum · 9 units + 40.5 XLM", "uniform clearing price", "atomic capture", "deadline auction"].map((c) => (
            <span key={c} className="rounded-full border border-neutral-400/20 bg-neutral-400/[0.06] px-3 py-1 text-neutral-200/80">
              {c}
            </span>
          ))}
          {contractId && (
            <a
              href={contractUrl(contractId)}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-neutral-400/30 bg-neutral-400/10 px-3 py-1 text-neutral-300 transition hover:bg-neutral-400/20"
            >
              contract {short(contractId)} ↗
            </a>
          )}
        </motion.div>
      </motion.header>

      <AnimatePresence>
        {busy && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-4 flex items-center gap-2 rounded-xl border border-neutral-500/30 bg-neutral-500/10 px-4 py-2.5 text-sm text-neutral-200"
          >
            <span className="h-2 w-2 animate-ping rounded-full bg-neutral-400" />
            {busy}
          </motion.div>
        )}
      </AnimatePresence>
      {err && <div className="mb-4 break-words rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-200">{err}</div>}

      <div className="mb-8 flex flex-wrap items-center gap-3">
        <Btn onClick={run} disabled={running}>
          {running ? "Group buy running…" : done ? "Run it again" : "▶ Run the group buy"}
        </Btn>
        <span className="text-xs text-neutral-100/50">
          about two minutes end to end · a real deadline auction runs on testnet time
        </span>
      </div>

      {/* Clearing pool */}
      <section className="mb-6 rounded-2xl glass p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold tracking-wide text-neutral-100/90">CLEARING POOL</h2>
          {pool && (
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                pool.status === "cleared"
                  ? "border border-neutral-400/40 bg-neutral-400/10 text-neutral-300"
                  : pool.status === "failed"
                    ? "border border-amber-400/30 bg-amber-400/10 text-amber-300"
                    : "border border-neutral-400/30 bg-neutral-400/10 text-neutral-300"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  pool.status === "cleared" ? "bg-neutral-400" : pool.status === "failed" ? "bg-amber-400" : "animate-pulse bg-neutral-400"
                }`}
              />
              {pool.status === "cleared" ? "Cleared" : pool.status === "failed" ? "Interrupted" : "Open"}
            </span>
          )}
        </div>

        {!pool ? (
          <p className="mt-3 text-sm text-neutral-100/55">
            Run the demo to register a pool. The vendor minimum and the close time go on-chain; the pool id is the
            hash of those exact terms, so they cannot be swapped under the members.
          </p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <div className="text-xs text-neutral-100/50">vendor minimum</div>
              <div className="mt-1 text-lg font-bold text-neutral-100">
                {pool.thresholdQty} units <span className="text-neutral-100/50">+</span> {pool.thresholdValueXlm} XLM
              </div>
              <a href={txUrl(pool.hash)} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-neutral-400/80 hover:text-neutral-300">
                pool {short(pool.poolId)} ↗
              </a>
            </div>
            <div>
              <div className="text-xs text-neutral-100/50">committed demand</div>
              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-black/40 ring-1 ring-white/10">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-neutral-400 to-neutral-300"
                  animate={{ width: `${pct}%` }}
                  transition={{ type: "spring", stiffness: 120, damping: 20 }}
                />
              </div>
              <div className="mt-1.5 text-xs text-neutral-100/60">
                {committedUnits} / {pool.thresholdQty} units
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-100/50">auction closes</div>
              {pool.status === "cleared" ? (
                <div className="mt-1 text-lg font-bold text-neutral-300">closed · captured</div>
              ) : pool.status === "failed" ? (
                <div className="mt-1 text-lg text-amber-300/80">run interrupted</div>
              ) : secondsLeft !== null ? (
                <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-neutral-100">
                  {secondsLeft}s
                </div>
              ) : (
                <div className="mt-1 text-lg text-neutral-100/40">…</div>
              )}
              <div className="mt-1 text-xs text-neutral-100/50">capture before the close is rejected</div>
            </div>
          </div>
        )}
      </section>

      {/* Buyer agents */}
      <section className="mb-6">
        <h2 className="mb-3 text-sm font-bold tracking-wide text-neutral-100/90">BUYER AGENTS</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {buyers.map((b, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className={`rounded-2xl glass p-4 ${b.leg ? "ring-1 ring-neutral-400/30" : ""}`}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-neutral-100">Buyer agent {i + 1}</div>
                {b.addr && (
                  <a href={accountUrl(b.addr)} target="_blank" rel="noreferrer" className="text-xs text-neutral-300/80 hover:text-neutral-200">
                    {short(b.addr)} ↗
                  </a>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                <span className="rounded-full border border-white/10 bg-black/25 px-2 py-0.5 text-neutral-100/70">3 × 5 XLM</span>
                <span className="text-neutral-100/40">or</span>
                <span className="rounded-full border border-white/10 bg-black/25 px-2 py-0.5 text-neutral-100/70">1 × 10 XLM</span>
              </div>
              <ul className="mt-3 space-y-1.5">
                {STEP_ORDER.map((k) => {
                  const hash = b.steps[k];
                  // Only the step actually in flight pings: the first one
                  // without a hash, once the pool exists and work has begun.
                  const inFlight =
                    !hash && running && !!pool && !b.ready && STEP_ORDER.find((s) => !b.steps[s]) === k;
                  return (
                    <li key={k} className="flex items-center gap-2 text-xs">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${hash ? "bg-neutral-400" : inFlight ? "animate-ping bg-neutral-400" : "bg-white/15"}`} />
                      <span className={hash ? "text-neutral-100/80" : "text-neutral-100/40"}>{STEP_LABEL[k]}</span>
                      {hash && (
                        <a href={txUrl(hash)} target="_blank" rel="noreferrer" className="ml-auto shrink-0 text-neutral-400/80 hover:text-neutral-300">
                          tx ↗
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
              {b.leg && cleared && (
                <div className="mt-3 rounded-lg border border-neutral-400/25 bg-neutral-400/[0.07] px-3 py-2">
                  <div className="text-sm font-bold text-neutral-300">
                    {b.leg.qty} units · {b.leg.legXlm} XLM
                  </div>
                  <div className="text-[11px] text-neutral-100/60">at {cleared.priceXlm} XLM per unit · Captured</div>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </section>

      {/* Punchline */}
      <AnimatePresence>
        {cleared && (
          <motion.section
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-2xl border border-neutral-400/30 bg-neutral-400/[0.08] p-5"
          >
            <div className="text-lg font-bold text-neutral-200">
              {cleared.totalQty} units settled at {cleared.priceXlm} XLM per unit ·{" "}
              {cleared.totalXlm} XLM to the merchant · one transaction
            </div>
            <p className="mt-1.5 text-sm text-neutral-100/70">
              No single buyer could reach the 9-unit minimum alone; the purchase exists only because the pool
              aggregated them. Every buyer paid the same per-unit price, below both posted tiers, and if any leg had
              failed, the whole capture would have reverted and nobody would have paid.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <a href={txUrl(cleared.hash)} target="_blank" rel="noreferrer" className="rounded-full border border-neutral-400/30 bg-neutral-400/10 px-3 py-1.5 text-neutral-300 transition hover:bg-neutral-400/20">
                capture transaction ↗
              </a>
              {merchant && (
                <a href={accountUrl(merchant)} target="_blank" rel="noreferrer" className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-neutral-100/75 hover:border-neutral-400/30">
                  merchant account ↗
                </a>
              )}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* No-discretion panel + refusals */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl glass p-4 sm:p-5">
          <h2 className="text-sm font-bold tracking-wide text-neutral-100/90">THE ALLOCATION ANYONE CAN RECOMPUTE</h2>
          {!sim ? (
            <p className="mt-3 text-sm text-neutral-100/55">
              Before capture, anyone can call the read-only simulate_clear and get the exact allocation the capture
              will execute. Same builder, same pure clearing function, same ledger state.
            </p>
          ) : (
            <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3 font-mono text-xs leading-relaxed text-neutral-100/80">
              <div>fires: {String(sim.fires)}</div>
              <div>
                clearing price: <span className="font-bold text-neutral-300">{sim.priceXlm} XLM</span> per unit
                <span className="text-neutral-100/45"> · below both posted tiers (5, 10)</span>
              </div>
              <div>total: {sim.totalQty} units · {sim.netXlm} XLM to the merchant</div>
              <div className="mt-1.5 border-t border-white/10 pt-1.5">
                {sim.legs.map((l) => (
                  <div key={l.buyer}>
                    buyer {l.buyer + 1}: {l.qty} units · {l.legXlm} XLM
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="mt-3 text-xs leading-relaxed text-neutral-100/50">
            simulate_clear and clear_pool run the identical function over the identical on-chain state. Whoever
            organizes the pool picks nothing: not the price, not the quantities, not who is in. That is what makes
            strangers&apos; agents willing to pool money.
          </p>
        </section>

        <section className="rounded-2xl glass p-4 sm:p-5">
          <h2 className="text-sm font-bold tracking-wide text-neutral-100/90">WHAT THE CONTRACT REFUSES</h2>
          <div className="mt-3 space-y-3">
            <div className={`rounded-xl border px-3.5 py-2.5 ${earlyProof ? "border-red-400/30 bg-red-400/[0.06]" : "border-white/10 bg-black/20"}`}>
              <div className="flex items-center gap-2 text-sm">
                <span className={earlyProof ? "text-red-300" : "text-neutral-100/40"}>{earlyProof ? "⛔" : "·"}</span>
                <span className={earlyProof ? "font-semibold text-red-200" : "text-neutral-100/50"}>clear_pool before the close</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-neutral-100/55">
                {earlyProof
                  ? `${earlyProof}. The threshold was already met, and it still refused: firing early would hand whoever is fastest a pricing option.`
                  : "Attempted live during the run, while the threshold is already met."}
              </p>
            </div>
            <div className={`rounded-xl border px-3.5 py-2.5 ${doubleProof ? "border-red-400/30 bg-red-400/[0.06]" : "border-white/10 bg-black/20"}`}>
              <div className="flex items-center gap-2 text-sm">
                <span className={doubleProof ? "text-red-300" : "text-neutral-100/40"}>{doubleProof ? "⛔" : "·"}</span>
                <span className={doubleProof ? "font-semibold text-red-200" : "text-neutral-100/50"}>a second clear_pool after capture</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-neutral-100/55">
                {doubleProof ? `${doubleProof}. Capture is idempotent; the pool cannot settle twice.` : "Attempted live after the capture lands."}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-neutral-100/50">
            Both rejections happen in the contract&apos;s money path, on-chain. The same enforcement that caps a solo
            mandate&apos;s budget governs the pool&apos;s timing and idempotency.
          </p>
        </section>
      </div>

      {/* On-chain activity */}
      <section className="overflow-hidden rounded-2xl glass shadow-[0_10px_40px_-12px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between border-b border-white/10 bg-black/20 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex gap-1.5" aria-hidden>
              <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-neutral-400/70" />
            </span>
            <span className="ml-1.5 flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${running ? "animate-pulse bg-neutral-400 shadow-[0_0_8px_rgba(255,255,255,0.9)]" : "bg-neutral-400/50"}`} />
              On-chain activity
            </span>
          </div>
          <span className="text-xs text-neutral-100/40">stellar testnet · click any row to open the explorer</span>
        </div>
        <div className="max-h-72 overflow-y-auto p-2 font-mono text-xs">
          {activity.length === 0 && <div className="px-2 py-1.5 text-neutral-100/35">no activity yet · run the group buy</div>}
          <AnimatePresence initial={false}>
            {activity.map((a) => {
              const href = a.hash ? txUrl(a.hash) : a.account ? accountUrl(a.account) : undefined;
              const dot = a.status === "ok" ? "bg-neutral-400" : a.status === "blocked" ? "bg-red-400" : "bg-neutral-400";
              const Row = (
                <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/[0.04]">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
                  <span className="min-w-0 flex-1 truncate text-neutral-100/80">{a.label}</span>
                  {a.hash && <span className="shrink-0 text-neutral-400/80">{short(a.hash)} ↗</span>}
                </div>
              );
              return (
                <motion.div key={a.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer" className="block">
                      {Row}
                    </a>
                  ) : (
                    Row
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </section>

      <footer className="mt-10 text-center text-xs leading-relaxed text-neutral-100/40">
        Stellar testnet · ephemeral keys funded by friendbot · every step links to its transaction on stellar.expert.
        <br />
        The pool&apos;s budget, schedule, deadline, and allocation are enforced inside the contract&apos;s money path,
        not in the app.
      </footer>
    </main>
  );
}

"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Check,
  ClipboardCheck,
  Clock3,
  Code2,
  Copy,
  FileKey2,
  Fingerprint,
  GitBranch,
  LockKeyhole,
  RefreshCcw,
  ScanSearch,
  ShieldCheck,
  Store,
  TimerReset,
  WalletCards,
  X,
} from "lucide-react";

const REPO = "https://github.com/ackrate/ackrate-protocol-contracts";
const REGISTRY = "CDBTG5ZKASFA7LOYUPBOTGKAVX5MJIM4U24BYGX7VX23IHYDAHLQPAGS";
const TIMELOCK = "CD3KRQRNCW52CZHKG2GPQAEOU6UCL426YFNHYUZ7IWUUKAOTKUQX6UUX";
const VERIFY_COMMAND = "git clone https://github.com/ackrate/ackrate-protocol-contracts.git && cd ackrate-protocol-contracts && ./scripts/gatecheck-contracts.sh";

type Protection = {
  id: string;
  label: string;
  risk: string;
  outcome: string;
  control: string;
  test: string;
  source: string;
  icon: typeof ShieldCheck;
};

const protections: Protection[] = [
  {
    id: "caller",
    label: "Unauthorized caller",
    risk: "A different key tries to spend under a valid mandate.",
    outcome: "Rejected before value moves",
    control: "MandateRegistry requires the stored agent authorization for every payment.",
    test: "user_agent_and_revocation_authorizations_are_host_enforced",
    source: `${REPO}/blob/main/contracts/mainnet/mandate-registry/src/test.rs#L373`,
    icon: FileKey2,
  },
  {
    id: "expiry",
    label: "Expired mandate",
    risk: "An agent submits a request after the wallet-approved deadline.",
    outcome: "Rejected by ledger time",
    control: "Expiry is checked inside the contract during atomic validation and consumption.",
    test: "duplicate_unknown_overspend_expiry_revocation_scope_and_replay_fail",
    source: `${REPO}/blob/main/contracts/mainnet/mandate-registry/src/test.rs#L318`,
    icon: Clock3,
  },
  {
    id: "overspend",
    label: "Overspend attempt",
    risk: "The next purchase would exceed the wallet-approved cumulative budget.",
    outcome: "Rejected; budget unchanged",
    control: "The contract compares cumulative spend to the stored limit before transfer.",
    test: "duplicate_unknown_overspend_expiry_revocation_scope_and_replay_fail",
    source: `${REPO}/blob/main/contracts/mainnet/mandate-registry/src/test.rs#L318`,
    icon: WalletCards,
  },
  {
    id: "replay",
    label: "Replay attempt",
    risk: "A previously accepted sequence is submitted a second time.",
    outcome: "Rejected by exact sequence",
    control: "Expected sequence and state consumption are updated atomically with settlement.",
    test: "duplicate_unknown_overspend_expiry_revocation_scope_and_replay_fail",
    source: `${REPO}/blob/main/contracts/mainnet/mandate-registry/src/test.rs#L318`,
    icon: RefreshCcw,
  },
  {
    id: "upgrade",
    label: "Unauthorized upgrade",
    risk: "A caller attempts to change payment policy without the required authority and delay.",
    outcome: "Rejected by role + timelock",
    control: "Governance requires contract roles, signer authorization, and the canonical delayed operation.",
    test: "governance_functions_require_both_role_and_authorization",
    source: `${REPO}/blob/main/contracts/mainnet/mandate-registry/src/test.rs#L149`,
    icon: TimerReset,
  },
  {
    id: "reentry",
    label: "Re-entrant payment",
    risk: "A hostile token callback tries to trigger a second payment inside the first.",
    outcome: "Second payment cannot execute",
    control: "State is consumed before the external token call and the probe verifies one transfer path.",
    test: "reentrancy_via_evil_token",
    source: `${REPO}/blob/main/contracts/mainnet/mandate-registry/src/reentry_probe.rs#L40`,
    icon: LockKeyhole,
  },
];

const evidence = [
  {
    title: "Release threat model",
    copy: "Protected assets, trust boundaries, invariants, abuse cases, and named release gates.",
    href: `${REPO}/blob/main/docs/mainnet-roadmap.md`,
    icon: ScanSearch,
  },
  {
    title: "Mainnet deployment record",
    copy: "Contract IDs, transaction hashes, constructor values, live hashes, and read-only verification.",
    href: `${REPO}/blob/main/docs/mainnet-canary-deployment.md`,
    icon: ClipboardCheck,
  },
  {
    title: "Governed release manifest",
    copy: "Exact source commit, Circle USDC identity, roles, artifact hashes, and verification state.",
    href: `${REPO}/blob/main/contracts/mainnet/deployment-manifest.json`,
    icon: Fingerprint,
  },
  {
    title: "Continuous contract gate",
    copy: "Formatting, linting, contract tests, and exact Mainnet candidate reproduction on every change.",
    href: `${REPO}/blob/main/.github/workflows/ci.yml`,
    icon: GitBranch,
  },
];

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: "easeOut" as const },
});

const short = (value: string) => `${value.slice(0, 10)}…${value.slice(-8)}`;

export default function MerchantsPage() {
  const [selectedId, setSelectedId] = useState(protections[0]!.id);
  const [copied, setCopied] = useState(false);
  const selected = protections.find((item) => item.id === selectedId) ?? protections[0]!;
  const SelectedIcon = selected.icon;

  async function copyCommand() {
    await navigator.clipboard.writeText(VERIFY_COMMAND);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  return (
    <main className="relative mx-auto w-full max-w-7xl overflow-hidden px-4 pb-20 pt-8 sm:px-6">
      <div className="glow" aria-hidden />

      <motion.header {...fade()} className="pt-7">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-400/[0.06] px-3.5 py-1.5 text-[11px] font-semibold tracking-[0.17em] text-emerald-200/90">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.9)]" />
          MERCHANT ASSURANCE · STELLAR MAINNET · CIRCLE USDC
        </div>
        <h1 className="mt-6 max-w-5xl text-4xl font-black leading-[1.02] tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl">
          Accept agent payments.<br />
          <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300 bg-clip-text text-transparent">
            Verify every boundary.
          </span>
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-relaxed text-emerald-50/65 sm:text-lg">
          Merchants do not need to trust an agent, model, SDK, or payment header. MandateRegistry checks the caller,
          merchant, asset, budget, expiry, and sequence before Circle USDC moves. The fulfillment layer independently
          verifies the on-chain result before releasing paid work.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <a href={`https://stellar.expert/explorer/public/contract/${REGISTRY}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-[#052117] transition hover:bg-emerald-300">
            View Mainnet contract <ArrowUpRight className="h-4 w-4" />
          </a>
          <a href={`${REPO}/tree/main/contracts/mainnet`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2.5 text-sm font-semibold text-white/75 transition hover:border-emerald-300/30 hover:text-white">
            Open contract source <Code2 className="h-4 w-4" />
          </a>
        </div>
      </motion.header>

      <motion.section {...fade(0.06)} className="mt-10 grid overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025] sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["22", "Mainnet contract tests"],
          ["2", "Governed contracts"],
          ["4", "Successful deployment transactions"],
          ["1", "Atomic USDC payment path"],
        ].map(([value, label]) => (
          <div key={label} className="border-b border-white/10 p-5 last:border-0 sm:border-r lg:border-b-0">
            <strong className="text-3xl font-black tracking-tight text-emerald-200">{value}</strong>
            <span className="mt-1 block text-xs text-white/45">{label}</span>
          </div>
        ))}
      </motion.section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[0.82fr_1.18fr]">
        <motion.div {...fade(0.1)} className="glass rounded-2xl p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.17em] text-emerald-300/70">Negative-path suite</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">Choose an attack path.</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/45">Each control below links to the exact Rust test that proves the contract response.</p>
          <div className="mt-5 grid gap-2">
            {protections.map((item) => {
              const Icon = item.icon;
              const active = selected.id === item.id;
              return (
                <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${active ? "border-emerald-300/30 bg-emerald-400/[0.09]" : "border-white/[0.07] bg-black/10 hover:border-white/15"}`}>
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${active ? "bg-emerald-400 text-[#052117]" : "bg-white/[0.04] text-white/40"}`}><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><strong className={`block text-sm ${active ? "text-emerald-100" : "text-white/70"}`}>{item.label}</strong><small className="mt-0.5 block truncate text-[11px] text-white/35">{item.outcome}</small></span>
                  <ArrowRight className={`h-4 w-4 ${active ? "text-emerald-300" : "text-white/20"}`} />
                </button>
              );
            })}
          </div>
        </motion.div>

        <motion.div {...fade(0.14)} className="relative overflow-hidden rounded-2xl border border-emerald-300/15 bg-[linear-gradient(145deg,rgba(52,211,153,.075),rgba(255,255,255,.018))] p-5 sm:p-7">
          <div className="absolute -right-20 -top-20 h-52 w-52 rounded-full bg-emerald-400/10 blur-3xl" aria-hidden />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.17em] text-emerald-300/70">Published contract evidence</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">{selected.label}</h2>
            </div>
            <span className="grid h-12 w-12 place-items-center rounded-xl border border-emerald-300/20 bg-emerald-400/10 text-emerald-300"><SelectedIcon className="h-5 w-5" /></span>
          </div>

          <div className="relative mt-7 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/[0.07] bg-black/15 p-4"><span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Attempt</span><p className="mt-2 text-sm leading-relaxed text-white/65">{selected.risk}</p></div>
            <div className="rounded-xl border border-emerald-300/15 bg-emerald-400/[0.045] p-4"><span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-300/60">Contract result</span><p className="mt-2 flex items-center gap-2 text-sm font-semibold text-emerald-100"><X className="h-4 w-4 text-rose-300" /> {selected.outcome}</p></div>
          </div>

          <div className="relative mt-3 rounded-xl border border-white/[0.07] bg-black/15 p-4">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Enforcement</span>
            <p className="mt-2 text-sm leading-relaxed text-white/65">{selected.control}</p>
          </div>

          <div className="relative mt-5 rounded-xl border border-white/[0.08] bg-[#060a08] p-4 font-mono">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-emerald-300/60"><BadgeCheck className="h-4 w-4" /> Exact Rust test</div>
            <code className="mt-3 block break-words text-xs text-emerald-100/80">{selected.test}</code>
            <a href={selected.source} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300 transition hover:text-emerald-200">Inspect source and snapshots <ArrowUpRight className="h-3.5 w-3.5" /></a>
          </div>
        </motion.div>
      </section>

      <motion.section {...fade(0.18)} className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.17em] text-emerald-300/70">Independent review trail</p><h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Start with the evidence, not the pitch.</h2></div>
          <a href={`${REPO}/actions`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-300 hover:text-emerald-200">View continuous checks <ArrowUpRight className="h-4 w-4" /></a>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {evidence.map(({ title, copy, href, icon: Icon }) => (
            <a key={title} href={href} target="_blank" rel="noreferrer" className="group rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 transition hover:-translate-y-0.5 hover:border-emerald-300/25 hover:bg-emerald-400/[0.04]">
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-emerald-300/15 bg-emerald-400/[0.07] text-emerald-300"><Icon className="h-[18px] w-[18px]" /></span>
              <h3 className="mt-5 text-base font-bold text-white/85">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/40">{copy}</p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300/75 group-hover:text-emerald-200">Open evidence <ArrowUpRight className="h-3.5 w-3.5" /></span>
            </a>
          ))}
        </div>
      </motion.section>

      <section className="mt-12 grid gap-6 lg:grid-cols-[1fr_.88fr]">
        <motion.div {...fade(0.2)} className="rounded-2xl border border-white/[0.08] bg-[#070b09] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.17em] text-emerald-300/70">Reproduce locally</p><h2 className="mt-2 text-xl font-bold text-white">One command. The same repository gate.</h2></div><Code2 className="h-6 w-6 text-emerald-300/60" /></div>
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-white/[0.08] bg-black/25 p-4">
            <code className="min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-all text-xs leading-relaxed text-emerald-100/70">{VERIFY_COMMAND}</code>
            <button type="button" onClick={copyCommand} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-emerald-300/15 bg-emerald-400/[0.06] text-emerald-300 transition hover:border-emerald-300/30" aria-label="Copy verification command" title="Copy verification command">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-white/35">The gate formats, lints, tests, and builds the contract variants. The governed Mainnet release adds exact-source, toolchain, interface, artifact-hash, and provenance checks.</p>
        </motion.div>

        <motion.div {...fade(0.24)} className="rounded-2xl border border-emerald-300/15 bg-emerald-400/[0.045] p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.17em] text-emerald-300/70">Live authority</p>
          <h2 className="mt-2 text-xl font-bold text-white">Two contracts. One governed path.</h2>
          <div className="mt-5 grid gap-3">
            {[
              ["MandateRegistry", REGISTRY, "Validates, consumes, and transfers Circle USDC."],
              ["TimelockController", TIMELOCK, "Delays approved policy and upgrade operations."],
            ].map(([name, id, copy]) => (
              <a key={name} href={`https://stellar.expert/explorer/public/contract/${id}`} target="_blank" rel="noreferrer" className="rounded-xl border border-white/[0.07] bg-black/15 p-4 transition hover:border-emerald-300/25">
                <div className="flex items-center justify-between gap-3"><strong className="text-sm text-emerald-100">{name}</strong><ArrowUpRight className="h-4 w-4 text-emerald-300" /></div>
                <code className="mt-2 block text-[10px] text-white/35">{short(id)}</code><p className="mt-2 text-xs text-white/45">{copy}</p>
              </a>
            ))}
          </div>
        </motion.div>
      </section>

      <motion.section {...fade(0.28)} className="mt-12 overflow-hidden rounded-3xl border border-emerald-300/15 bg-[radial-gradient(circle_at_20%_0%,rgba(52,211,153,.14),transparent_38%),rgba(255,255,255,.02)] p-7 sm:p-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div><div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.17em] text-emerald-300/75"><Store className="h-4 w-4" /> Merchant integration</div><h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Ship the paid endpoint. Keep the proof trail.</h2><p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/50">Express middleware verifies the authenticated quote, Mainnet transaction, registry event, token transfer, and one-time redemption before your protected handler returns value.</p></div>
          <a href="https://www.npmjs.com/package/@ackrate/express-middleware" target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-[#052117] transition hover:bg-emerald-300">Open merchant SDK <ArrowUpRight className="h-4 w-4" /></a>
        </div>
      </motion.section>
    </main>
  );
}

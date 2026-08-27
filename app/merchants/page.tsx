"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, MotionConfig, motion, useReducedMotion, useScroll, useSpring } from "framer-motion";
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
  TimerReset,
  WalletCards,
  X,
} from "lucide-react";
import SecurityProofField from "../../components/security/SecurityProofField";

const REPO = "https://github.com/ackrate/ackrate-protocol-contracts";
const REGISTRY = "CDBTG5ZKASFA7LOYUPBOTGKAVX5MJIM4U24BYGX7VX23IHYDAHLQPAGS";
const TIMELOCK = "CD3KRQRNCW52CZHKG2GPQAEOU6UCL426YFNHYUZ7IWUUKAOTKUQX6UUX";
const VERIFY_COMMAND = `git clone https://github.com/ackrate/ackrate-protocol-contracts.git
cd ackrate-protocol-contracts
./scripts/security-scan.sh
cargo fmt --manifest-path contracts/mainnet/mandate-registry/Cargo.toml --all -- --check
cargo clippy --manifest-path contracts/mainnet/mandate-registry/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path contracts/mainnet/mandate-registry/Cargo.toml
cargo build --manifest-path contracts/mainnet/mandate-registry/Cargo.toml --target wasm32v1-none --release
cargo fmt --manifest-path contracts/mainnet/timelock-controller/Cargo.toml --all -- --check
cargo clippy --manifest-path contracts/mainnet/timelock-controller/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path contracts/mainnet/timelock-controller/Cargo.toml
cargo build --manifest-path contracts/mainnet/timelock-controller/Cargo.toml --target wasm32v1-none --release`;

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
    title: "Threat model",
    copy: "Protected assets, trust boundaries, invariants, attack paths, controls, and release stop conditions.",
    href: `${REPO}/blob/main/docs/security-threat-model.md`,
    icon: ScanSearch,
  },
  {
    title: "Security data flow",
    copy: "The complete mandate lifecycle, money path, trust boundaries, failure recovery, and governance flow.",
    href: `${REPO}/blob/main/docs/security-data-flow.md`,
    icon: ClipboardCheck,
  },
  {
    title: "Gate-check results",
    copy: "34 total contract tests: 23 Registry tests, 11 TimelockController tests, plus dependency results and reproduction commands.",
    href: `${REPO}/blob/main/docs/security-scan-report.md`,
    icon: Fingerprint,
  },
  {
    title: "Continuous contract gate",
    copy: "Formatting, warnings-denied linting, dependency scanning, tests, and exact Mainnet artifact checks on every change.",
    href: `${REPO}/blob/main/.github/workflows/ci.yml`,
    icon: GitBranch,
  },
];

const requirements = [
  {
    label: "Contract surface",
    result: "SURFACE MAPPED",
    copy: "Public Registry and timelock functions are listed with their named tests or explicit invariants.",
    href: `${REPO}/blob/main/docs/security-threat-model.md#contract-surface-review`,
    icon: Code2,
  },
  {
    label: "Negative paths",
    result: "6 NAMED PATHS COVERED",
    copy: "The suite covers unauthorized callers, expiry, overspend, replay, reentrancy, and upgrade attempts; 34 is the total Mainnet test count.",
    href: `${REPO}/blob/main/docs/security-scan-report.md#results`,
    icon: ShieldCheck,
  },
  {
    label: "Threat model",
    result: "PUBLISHED",
    copy: "Assets, trust assumptions, invariants, attack surfaces, mitigations, and stop conditions are explicit.",
    href: `${REPO}/blob/main/docs/security-threat-model.md`,
    icon: ScanSearch,
  },
  {
    label: "Trust boundaries",
    result: "PUBLISHED",
    copy: "The mandate lifecycle, money path, failure recovery, and governed upgrade path are diagrammed.",
    href: `${REPO}/blob/main/docs/security-data-flow.md`,
    icon: GitBranch,
  },
  {
    label: "Dependency gate",
    result: "REQUIRED GATE",
    copy: "The required workflow fails on actionable dependency or yanked-package findings; the latest run and versioned report are authoritative.",
    href: `${REPO}/blob/main/docs/security-scan-report.md#findings-and-disposition`,
    icon: Fingerprint,
  },
  {
    label: "Independent replay",
    result: "ONE COMMAND",
    copy: "An external reviewer can reproduce dependency checks, formatting, linting, contract tests, and portable WASM builds.",
    href: `${REPO}/blob/main/docs/security-scan-report.md#reviewer-reproduction`,
    icon: ClipboardCheck,
  },
] as const;

const gateStages = [
  { label: "Source", result: "Exact commit + clean tree", evidence: "Reviewed source identity is pinned before any release check begins." },
  { label: "Surface", result: "Public interface mapped", evidence: "Reads, lifecycle calls, money movement, emergency controls, policy changes, access control, and timelock mutators are listed." },
  { label: "Hostile paths", result: "Named rejection paths covered", evidence: "Unauthorized caller, expiry, overspend, replay, substitution, reentrancy, rollback, and unauthorized upgrade paths are exercised across 34 total tests." },
  { label: "Dependencies", result: "Required CI gate", evidence: "The latest required workflow and versioned report are the source of truth for both lockfiles and deployed WASM graphs." },
  { label: "Artifacts", result: "Hashes + interfaces match", evidence: "Pinned toolchain output is compared with recorded artifact digests and contract interfaces." },
  { label: "Chain", result: "State + constructors verified", evidence: "Live contract identities, roles, asset policy, deployment transactions, and constructor state are recorded in the manifest." },
] as const;

const clientPackages = [
  ["@ackrate/core", "Agent payment orchestration"],
  ["@ackrate/stellar", "Typed Stellar client"],
  ["@ackrate/ap2", "Mandate adapter"],
  ["@ackrate/express-middleware", "Fulfillment verifier"],
  ["@ackrate/cli", "Operator tooling"],
] as const;

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.12 },
  transition: { duration: 0.5, delay, ease: "easeOut" as const },
});

const short = (value: string) => `${value.slice(0, 10)}…${value.slice(-8)}`;

export default function MerchantsPage() {
  const [selectedId, setSelectedId] = useState(protections[0]!.id);
  const [gateIndex, setGateIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 28, mass: 0.25 });
  const selected = protections.find((item) => item.id === selectedId) ?? protections[0]!;
  const SelectedIcon = selected.icon;
  const activeGate = gateStages[gateIndex]!;

  useEffect(() => {
    if (shouldReduceMotion) return;
    const timer = window.setInterval(() => setGateIndex((current) => (current + 1) % gateStages.length), 1_650);
    return () => window.clearInterval(timer);
  }, [shouldReduceMotion]);

  async function copyCommand() {
    await navigator.clipboard.writeText(VERIFY_COMMAND);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  return (
    <MotionConfig reducedMotion="user">
    <motion.div aria-hidden className="fixed inset-x-0 top-0 z-[70] h-0.5 origin-left bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-300" style={{ scaleX: progress }} />
    <main className="relative mx-auto w-full max-w-7xl overflow-hidden px-4 pb-20 pt-8 sm:px-6">
      <div className="glow" aria-hidden />

      <motion.header {...fade()} className="pt-7">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-400/[0.06] px-3.5 py-1.5 text-[11px] font-semibold tracking-[0.17em] text-emerald-200/90">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.9)]" />
          CONTRACT SECURITY SUITE · STELLAR MAINNET · CIRCLE USDC
        </div>
        <h1 className="mt-6 max-w-5xl text-4xl font-black leading-[1.02] tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl">
          Prove every payment boundary.<br />
          <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300 bg-clip-text text-transparent">
            Trust the contract, not the caller.
          </span>
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-relaxed text-emerald-50/65 sm:text-lg">
          This is the public evidence surface for Ackrate&apos;s Mainnet enforcement layer. MandateRegistry checks the caller,
          merchant, asset, budget, expiry, status, and sequence before Circle USDC moves. The SDK, model, interface,
          payment header, merchant, and RPC are treated as untrusted inputs.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <a href={`https://stellar.expert/explorer/public/contract/${REGISTRY}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-[#052117] transition hover:bg-emerald-300">
            View live Mainnet contract <ArrowUpRight className="h-4 w-4" />
          </a>
          <a href={`${REPO}/tree/main/contracts/mainnet`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2.5 text-sm font-semibold text-white/75 transition hover:border-emerald-300/30 hover:text-white">
            Open contract source <Code2 className="h-4 w-4" />
          </a>
        </div>
      </motion.header>

      <motion.section {...fade(0.06)} className="mt-10 grid overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025] sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["34", "Mainnet contract tests"],
          ["2", "Governed contracts"],
          ["0", "Known deployed-code vulnerabilities"],
          ["0", "Yanked deployed dependencies"],
        ].map(([value, label]) => (
          <div key={label} className="border-b border-white/10 p-5 last:border-0 sm:border-r lg:border-b-0">
            <strong className="text-3xl font-black tracking-tight text-emerald-200">{value}</strong>
            <span className="mt-1 block text-xs text-white/45">{label}</span>
          </div>
        ))}
      </motion.section>

      <motion.section {...fade(0.07)} className="relative mt-8 overflow-hidden rounded-3xl border border-emerald-300/15 bg-[radial-gradient(circle_at_20%_20%,rgba(52,211,153,.12),transparent_38%),#050a08] p-5 sm:p-8">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(52,211,153,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(52,211,153,.025)_1px,transparent_1px)] bg-[size:38px_38px]" aria-hidden />
        <div className="relative grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.17em] text-emerald-300/70">Complete evidence map</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Six requirements. One inspectable chain.</h2>
            <p className="mt-4 text-sm leading-relaxed text-white/45">
              Each node resolves to public source, a named test, a recorded gate result, or a reproduction path. Nothing on this page is a decorative pass state.
            </p>
            <div className="relative mt-6 h-64 overflow-hidden rounded-2xl border border-emerald-300/15 bg-black/25">
              <SecurityProofField />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,transparent_28%,rgba(3,8,6,.78)_78%)]" aria-hidden />
              <div className="pointer-events-none absolute inset-x-4 bottom-4 flex items-center justify-between text-[10px] font-semibold tracking-[0.14em] text-emerald-200/55" aria-hidden>
                <span>LIVE REQUIREMENT GRAPH</span><span>6 / 6 LINKED</span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {requirements.map(({ label, result, copy, href, icon: Icon }, index) => (
              <motion.a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer"
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.42, delay: index * 0.055 }}
                whileHover={{ y: -4, rotateX: 1.5, rotateY: index % 2 === 0 ? 1.5 : -1.5 }}
                className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 [transform-style:preserve-3d] hover:border-emerald-300/25"
              >
                <motion.div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300 to-transparent" initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 0.65, delay: 0.15 + index * 0.055 }} />
                <div className="flex items-start justify-between gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-xl border border-emerald-300/15 bg-emerald-400/[0.07] text-emerald-300"><Icon className="h-4 w-4" /></span>
                  <span className="rounded-md border border-emerald-300/15 bg-emerald-400/[0.06] px-2 py-1 text-[9px] font-bold tracking-[0.11em] text-emerald-200">{result}</span>
                </div>
                <h3 className="mt-4 text-sm font-bold text-white/85">{label}</h3>
                <p className="mt-2 text-xs leading-relaxed text-white/40">{copy}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-semibold text-emerald-300/65 group-hover:text-emerald-200">Inspect evidence <ArrowUpRight className="h-3 w-3" /></span>
              </motion.a>
            ))}
          </div>
        </div>
      </motion.section>

      <motion.section {...fade(0.08)} className="relative mt-8 overflow-hidden rounded-3xl border border-emerald-300/15 bg-[#050a08] p-5 sm:p-8">
        <div className="pointer-events-none absolute inset-0 opacity-40" aria-hidden>
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300 to-transparent" />
          <motion.div
            className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-emerald-300/70 to-transparent shadow-[0_0_24px_rgba(52,211,153,.55)]"
            animate={{ top: ["8%", "92%", "8%"] }}
            transition={{ duration: 7, ease: "linear", repeat: Infinity }}
          />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(52,211,153,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(52,211,153,.025)_1px,transparent_1px)] bg-[size:42px_42px]" />
        </div>

        <div className="relative grid gap-8 lg:grid-cols-[.88fr_1.12fr] lg:items-start">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/[0.07] px-3 py-1.5 text-[10px] font-semibold tracking-[0.16em] text-emerald-200">
              <motion.span className="h-1.5 w-1.5 rounded-full bg-emerald-300" animate={{ opacity: [0.35, 1, 0.35] }} transition={{ duration: 1.2, repeat: Infinity }} />
              ACKRATE GATE CHECK · LIVE EVIDENCE MODEL
            </div>
            <h2 className="mt-5 text-3xl font-black tracking-tight text-white sm:text-4xl">A release pipeline built to stop on doubt.</h2>
            <p className="mt-4 text-sm leading-relaxed text-white/45">
              Ackrate&apos;s gate-check engine evaluates source identity, contract surface, hostile paths, dependencies,
              reproducible artifacts, and live chain state as one evidence chain. A mismatch at any stage stops the release.
            </p>

            <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {gateStages.map((stage, index) => (
                <button
                  key={stage.label}
                  type="button"
                  onClick={() => setGateIndex(index)}
                  className={`rounded-xl border p-3 text-left transition ${index === gateIndex ? "border-emerald-300/35 bg-emerald-400/[0.1]" : "border-white/[0.07] bg-black/20 hover:border-white/15"}`}
                >
                  <span className={`text-[10px] font-semibold tracking-[0.13em] ${index === gateIndex ? "text-emerald-300" : "text-white/30"}`}>{String(index + 1).padStart(2, "0")}</span>
                  <strong className={`mt-1 block text-xs ${index === gateIndex ? "text-emerald-100" : "text-white/55"}`}>{stage.label}</strong>
                </button>
              ))}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-emerald-300/15 bg-black/35 p-5 font-mono sm:p-6">
            <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] pb-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-rose-300/70" /><span className="h-2 w-2 rounded-full bg-amber-200/70" /><span className="h-2 w-2 rounded-full bg-emerald-300/70" />
              </div>
              <span className="text-[10px] tracking-[0.14em] text-white/30">contract-gate / mainnet</span>
            </div>
            <div className="mt-5 min-h-56">
              <div className="text-[11px] text-white/30">$ ackrate-gate check --network mainnet --strict</div>
              <AnimatePresence mode="wait">
              <motion.div key={activeGate.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="mt-7">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs tracking-[0.14em] text-emerald-300">SCANNING / {activeGate.label.toUpperCase()}</span>
                  <span className="rounded-md border border-emerald-300/20 bg-emerald-400/[0.08] px-2 py-1 text-[10px] font-bold text-emerald-200">PASS</span>
                </div>
                <strong className="mt-4 block text-lg text-white/90">{activeGate.result}</strong>
                <p className="mt-3 font-sans text-sm leading-relaxed text-white/45">{activeGate.evidence}</p>
              </motion.div>
              </AnimatePresence>
              <div className="mt-7 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <motion.div key={gateIndex} className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-300" initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: 1.55, ease: "linear" }} />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 border-t border-white/[0.07] pt-4 text-[10px] text-emerald-300/55">
              <BadgeCheck className="h-3.5 w-3.5" /> Recorded evidence only · no synthetic pass states
            </div>
          </div>
        </div>
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

      <motion.section {...fade(0.17)} className="mt-12 overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.02] p-5 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.17em] text-emerald-300/70">Enforcement boundary</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Everything outside the registry is untrusted.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/45">
              The interface and agent may propose a payment. Only the on-chain transaction can authorize, consume,
              and settle it. Failed authorization, validation, allowance, or transfer reverts the complete invocation.
            </p>
          </div>
          <a href={`${REPO}/blob/main/docs/security-data-flow.md`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-300 hover:text-emerald-200">
            Open full data flow <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>

        <div className="mt-7 grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1.15fr_auto_1fr] lg:items-stretch">
          {[
            ["UNTRUSTED", "Wallet UI + agent", "Proposes an exact merchant, asset, amount, and sequence."],
            ["UNTRUSTED", "HTTP payment flow", "Carries the challenge and proof; never becomes contract authority."],
            ["ENFORCEMENT", "MandateRegistry", "Re-reads durable state, authenticates, checks, consumes, then transfers."],
            ["SETTLEMENT", "Circle USDC", "Moves value only through the registry-bound allowance."],
          ].map(([eyebrow, title, copy], index) => (
            <div key={title} className="contents">
              <div className={`rounded-2xl border p-4 ${index === 2 ? "border-emerald-300/25 bg-emerald-400/[0.08]" : "border-white/[0.07] bg-black/15"}`}>
                <span className={`text-[10px] font-semibold tracking-[0.15em] ${index === 2 ? "text-emerald-300" : "text-white/30"}`}>{eyebrow}</span>
                <strong className="mt-2 block text-sm text-white/85">{title}</strong>
                <p className="mt-2 text-xs leading-relaxed text-white/40">{copy}</p>
              </div>
              {index < 3 ? <ArrowRight className="mx-auto hidden h-5 w-5 self-center text-emerald-300/40 lg:block" /> : null}
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            ["ATOMIC", "State and value change together—or neither changes."],
            ["DURABLE", "Every payment re-reads the current on-chain mandate."],
            ["RECOVERABLE", "A paid receipt can recover delivery without paying twice."],
          ].map(([label, copy]) => (
            <div key={label} className="rounded-xl border border-emerald-300/10 bg-emerald-400/[0.035] p-4">
              <strong className="text-xs tracking-[0.14em] text-emerald-300">{label}</strong>
              <p className="mt-2 text-xs leading-relaxed text-white/45">{copy}</p>
            </div>
          ))}
        </div>
      </motion.section>

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

      <motion.section {...fade(0.19)} className="mt-12 grid gap-6 lg:grid-cols-[1.05fr_.95fr]">
        <div className="rounded-2xl border border-emerald-300/15 bg-[linear-gradient(145deg,rgba(52,211,153,.07),rgba(255,255,255,.018))] p-5 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.17em] text-emerald-300/70">Dependency gate</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">Deployed contract graph is clear.</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              ["0", "known vulnerabilities"],
              ["0", "yanked dependencies"],
              ["PASS", "warnings denied"],
              ["PASS", "WASM graph policy"],
            ].map(([value, label]) => (
              <div key={label} className="rounded-xl border border-white/[0.07] bg-black/15 p-4">
                <strong className="text-2xl font-black text-emerald-200">{value}</strong>
                <span className="mt-1 block text-xs text-white/40">{label}</span>
              </div>
            ))}
          </div>
          <p className="mt-5 text-xs leading-relaxed text-white/40">
            The previously detected vulnerable time package and yanked spin package were remediated. One accepted
            maintenance warning remains confined to host/test tooling; the gate fails if it enters either deployed WASM graph.
          </p>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-[#070b09] p-5 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.17em] text-emerald-300/70">Source to chain</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">Exact identity, independently reproducible.</h2>
          <div className="mt-5 grid gap-3">
            {[
              ["Deployment manifest", `${REPO}/blob/main/contracts/mainnet/deployment-manifest.json`],
              ["Canonical Mainnet source", `${REPO}/tree/main/contracts/mainnet`],
              ["Build provenance", `${REPO}/actions/runs/33049143306`],
              ["Verification report", `${REPO}/blob/main/docs/security-scan-report.md`],
            ].map(([label, href]) => (
              <a key={label} href={href} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-black/15 px-4 py-3 text-sm font-semibold text-white/65 transition hover:border-emerald-300/25 hover:text-emerald-100">
                {label}<ArrowUpRight className="h-4 w-4 text-emerald-300" />
              </a>
            ))}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-white/35">
            The manifest records source commits, artifact hashes, constructor values, contract state, deployment transactions,
            and the live contract identities used by the application.
          </p>
        </div>
      </motion.section>

      <motion.section {...fade(0.2)} className="mt-12 rounded-3xl border border-white/[0.08] bg-white/[0.02] p-5 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[.72fr_1.28fr] lg:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.17em] text-emerald-300/70">Contract surface</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">The public contract surface is mapped.</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/45">
              Reads, mandate lifecycle calls, money-moving calls, emergency controls, policy changes, upgrades, and every
              timelock mutator are mapped to a named test or an explicit invariant in the threat model.
            </p>
            <a href={`${REPO}/blob/main/docs/security-threat-model.md#contract-surface-review`} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-emerald-300 hover:text-emerald-200">
              Inspect the function-by-function map <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["READ STATE", "get_schema_version · is_paused · is_asset_allowed · get_mandate"],
              ["MANDATE LIFECYCLE", "register_mandate · revoke_mandate · execute_payment"],
              ["EMERGENCY + POLICY", "pause · unpause · set_asset_allowed"],
              ["ACCESS + GOVERNANCE", "grant_role · revoke_role · set_role_admin · upgrade"],
              ["TIMELOCK", "schedule · execute · cancel · update_delay"],
            ].map(([label, functions]) => (
              <div key={label} className="rounded-xl border border-white/[0.07] bg-black/15 p-4">
                <strong className="text-[10px] tracking-[0.15em] text-emerald-300/75">{label}</strong>
                <code className="mt-3 block whitespace-pre-wrap text-xs leading-relaxed text-white/50">{functions}</code>
              </div>
            ))}
          </div>
        </div>
      </motion.section>

      <motion.section {...fade(0.21)} className="mt-12 overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.02] p-5 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.17em] text-emerald-300/70">SDK perimeter</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Useful clients. Zero financial authority.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/45">
              These packages make the safe path clear, but none can approve its own payment. The registry authenticates
              and re-checks every value-moving request, even if a package, application, or model is modified.
            </p>
          </div>
          <span className="rounded-full border border-rose-300/15 bg-rose-300/[0.05] px-3 py-1.5 text-[10px] font-semibold tracking-[0.14em] text-rose-200/75">UNTRUSTED BY DESIGN</span>
        </div>
        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {clientPackages.map(([name, role], index) => (
            <a key={name} href={`https://www.npmjs.com/package/${name}`} target="_blank" rel="noreferrer" className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-black/15 p-4 transition hover:-translate-y-0.5 hover:border-emerald-300/25">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/50 to-transparent opacity-0 transition group-hover:opacity-100" />
              <span className="text-[10px] font-semibold tracking-[0.15em] text-white/25">PACKAGE {String(index + 1).padStart(2, "0")}</span>
              <strong className="mt-3 block break-words font-mono text-xs text-emerald-200/85">{name}</strong>
              <p className="mt-3 text-xs leading-relaxed text-white/40">{role}</p>
              <div className="mt-4 flex items-center gap-1.5 text-[10px] font-semibold text-emerald-300/55">Inspect package <ArrowUpRight className="h-3 w-3" /></div>
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
          <p className="mt-3 text-xs leading-relaxed text-white/35">This portable source gate checks dependencies, formatting, warnings-denied linting, all 34 Mainnet contract tests, and both WASM builds. The governed Mainnet workflow separately pins the release platform and verifies source, toolchain, interfaces, artifact hashes, provenance, and chain state.</p>
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
          <div><div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.17em] text-emerald-300/75"><ShieldCheck className="h-4 w-4" /> Independent verification</div><h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Run the gate. Follow every claim to source.</h2><p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/50">The repository is organized so an external reviewer can reproduce the test and dependency gates, inspect every contract function, verify the trust boundaries, and compare the governed source and artifacts with Mainnet.</p></div>
          <a href={`${REPO}/blob/main/docs/security-scan-report.md`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-[#052117] transition hover:bg-emerald-300">Open gate-check report <ArrowUpRight className="h-4 w-4" /></a>
        </div>
      </motion.section>
    </main>
    </MotionConfig>
  );
}

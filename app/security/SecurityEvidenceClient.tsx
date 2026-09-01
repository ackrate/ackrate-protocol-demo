"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Check, ChevronDown, Code2, FileCheck2, Network, ShieldCheck } from "lucide-react";

const REPO = "https://github.com/ackrate/ackrate-protocol-contracts";
const CONTRACT = "CCLZEBJXG4YVJEPBCR5F27N733BCK5HQJWZZGB3K54JVODY3VAGP4HWR";
const WASM_HASH = "982809197d35d44c7b0fce6bd117fb2fec09b728c64c146c1f803b01faacff62";
const REPORT = `${REPO}/blob/main/docs/mainnet-v2-security-verification.md`;
const TESTS = `${REPO}/blob/main/contracts/mainnet-v2/mandate-registry/src/test.rs`;
const GATE = `${REPO}/blob/main/scripts/gatecheck-contracts.sh`;
const SCAN = `${REPO}/blob/main/scripts/security-scan.sh`;
const LIVE_CHECK = `${REPO}/blob/main/.github/workflows/verify-mainnet-canary.yml`;
const DEPLOY_CHECK = `${REPO}/blob/main/scripts/deploy-mainnet-v2.sh`;
const ACTIONS = `${REPO}/actions`;
const EXPLORER = `https://stellar.expert/explorer/public/contract/${CONTRACT}`;

type EvidenceCard = {
  id: string;
  label: string;
  result: string;
  summary: string;
  command: string;
  steps: string[];
  proves: string;
  boundary: string;
  links: Array<{ label: string; href: string }>;
  icon: typeof ShieldCheck;
};

const cards: EvidenceCard[] = [
  {
    id: "behavior",
    label: "Contract behavior",
    result: "53 / 53 PASS",
    summary: "The reviewed V2 code passes its required native and optimized-contract checks.",
    command: "cargo test --manifest-path contracts/mainnet-v2/mandate-registry/Cargo.toml --all-features",
    steps: [
      "52 native Soroban host tests passed",
      "1 exact optimized-WASM execution check passed",
      "10,001 signed amount boundaries passed",
      "512 complete mandate-state scenarios passed",
    ],
    proves: "Budget, expiry, merchant, asset, status, sequence, and atomic Circle USDC settlement are enforced by the contract.",
    boundary: "Behavior is exercised locally; the live-code check below binds that reviewed code to Mainnet.",
    links: [
      { label: "Test code", href: TESTS },
      { label: "Full gate", href: GATE },
    ],
    icon: Code2,
  },
  {
    id: "attacks",
    label: "Required attack paths",
    result: "ALL REJECTED",
    summary: "Every required hostile path has an executable negative test.",
    command: "cargo test --manifest-path contracts/mainnet-v2/mandate-registry/Cargo.toml test::",
    steps: [
      "Unauthorized callers rejected",
      "Expired mandates and overspend rejected",
      "Replay and sequence substitution rejected",
      "Unauthorized and unpaused upgrades rejected",
    ],
    proves: "Missing or wrong authority, stale state, changed payment terms, callback attempts, corrupt state, and failed token movement cannot consume value.",
    boundary: "These checks cover known and modeled paths; they are not a claim that unknown defects cannot exist.",
    links: [
      { label: "Negative tests", href: TESTS },
      { label: "Threat matrix", href: REPORT },
    ],
    icon: ShieldCheck,
  },
  {
    id: "source",
    label: "Source and dependencies",
    result: "GATES PASS",
    summary: "The release gate locks the dependency graph, interface, events, artifact shape, and canonical hash.",
    command: "./scripts/security-scan.sh && ./scripts/gatecheck-contracts.sh",
    steps: [
      "Warnings-denied Rust lint passed",
      "Dependency advisory and yanked-package scan passed",
      "18 functions and 9 runtime events matched",
      "15,510-byte artifact and canonical SHA-256 matched",
    ],
    proves: "A changed required test, dependency finding, function, event, artifact size, or canonical Linux hash stops the release gate.",
    boundary: "The canonical byte hash is Linux-defined; other platforms reproduce behavior, interface, and artifact size.",
    links: [
      { label: "Dependency check", href: SCAN },
      { label: "Gate code", href: GATE },
      { label: "Public runs", href: ACTIONS },
    ],
    icon: FileCheck2,
  },
  {
    id: "mainnet",
    label: "Live Mainnet binding",
    result: "READ-ONLY PASS",
    summary: "Mainnet was read directly to confirm code, state, asset policy, and 2-of-3 authority.",
    command: "./scripts/deploy-mainnet-v2.sh verify-deploy",
    steps: [
      "Live WASM SHA-256 matched reviewed V2",
      "Schema 2, unpaused, no successor pending",
      "Circle Mainnet USDC policy allowed",
      "Three weight-1 signers and 2/2/2 thresholds matched",
    ],
    proves: "The deployed contract is the reviewed V2 artifact and its administrator is the expected native Stellar 2-of-3 account.",
    boundary: "This check is read-only. It signs no transaction and moves no Mainnet funds. V2 has no timelock.",
    links: [
      { label: "Contract", href: EXPLORER },
      { label: "Live check", href: LIVE_CHECK },
      { label: "Verification code", href: DEPLOY_CHECK },
    ],
    icon: Network,
  },
];

export default function SecurityEvidenceClient() {
  const [openId, setOpenId] = useState(cards[0]!.id);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [visibleSteps, setVisibleSteps] = useState(0);

  useEffect(() => {
    if (!runningId) return;
    const total = cards.find((card) => card.id === runningId)?.steps.length ?? 0;
    if (visibleSteps >= total) {
      setRunningId(null);
      return;
    }
    const timer = window.setTimeout(() => setVisibleSteps((count) => count + 1), 360);
    return () => window.clearTimeout(timer);
  }, [runningId, visibleSteps]);

  function replay(card: EvidenceCard) {
    setOpenId(card.id);
    setVisibleSteps(0);
    setRunningId(card.id);
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-12 sm:px-6 lg:pt-20">
      <header className="max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">MandateRegistry V2 · Stellar Mainnet</p>
        <h1 className="mt-4 text-4xl font-black tracking-[-0.04em] text-white sm:text-6xl">Four checks. Direct evidence.</h1>
        <p className="mt-5 text-base leading-7 text-white/55 sm:text-lg">
          Open a card to replay its recorded result, inspect the exact command, and follow the proof to the contract or source code.
        </p>
      </header>

      <section className="mt-10 grid items-start gap-4 lg:grid-cols-2" aria-label="Security evidence">
        {cards.map((card) => {
          const Icon = card.icon;
          const open = openId === card.id;
          const running = runningId === card.id;
          const shown = running ? visibleSteps : card.steps.length;
          return (
            <article className={`overflow-hidden rounded-2xl border ${open ? "border-emerald-300/30 bg-emerald-300/[0.045]" : "border-white/10 bg-white/[0.02]"}`} key={card.id}>
              <button
                type="button"
                onClick={() => setOpenId(open ? "" : card.id)}
                className="flex w-full items-start gap-4 p-5 text-left sm:p-6"
                aria-expanded={open}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-200"><Icon className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-300">{card.result}</span>
                  <strong className="mt-1 block text-lg text-white">{card.label}</strong>
                  <span className="mt-2 block text-sm leading-6 text-white/50">{card.summary}</span>
                </span>
                <ChevronDown className={`mt-2 h-4 w-4 shrink-0 text-white/35 transition ${open ? "rotate-180" : ""}`} />
              </button>

              {open && (
                <div className="border-t border-white/10 px-5 pb-6 pt-5 sm:px-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">Recorded gate output</p>
                    <button type="button" onClick={() => replay(card)} disabled={running} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-white/70 hover:border-white/30 hover:text-white disabled:cursor-wait disabled:opacity-50">
                      {running ? "Replaying…" : "Replay check"}
                    </button>
                  </div>
                  <code className="mt-3 block overflow-x-auto rounded-lg bg-black/35 p-3 text-xs leading-5 text-emerald-100/70">$ {card.command}</code>
                  <ol className="mt-4 space-y-2" aria-live="polite">
                    {card.steps.slice(0, shown).map((step) => (
                      <li className="flex gap-2 text-sm leading-5 text-white/65" key={step}><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />{step}</li>
                    ))}
                  </ol>
                  <p className="mt-5 text-sm leading-6 text-white/60"><strong className="text-white/85">Proves:</strong> {card.proves}</p>
                  <p className="mt-2 text-xs leading-5 text-amber-100/55"><strong className="text-amber-100/75">Boundary:</strong> {card.boundary}</p>
                  <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2">
                    {card.links.map((link) => (
                      <a className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-300 hover:text-emerald-200" href={link.href} target="_blank" rel="noreferrer" key={link.href}>
                        {link.label} <ArrowUpRight className="h-3.5 w-3.5" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </section>

      <footer className="mt-10 border-t border-white/10 pt-6 text-sm leading-6 text-white/45">
        <p>
          Contract <a className="break-all font-mono text-emerald-300 hover:text-emerald-200" href={EXPLORER} target="_blank" rel="noreferrer">{CONTRACT}</a><br />
          Reviewed WASM <span className="break-all font-mono text-white/65">{WASM_HASH}</span>
        </p>
        <p className="mt-4 max-w-3xl">
          The replay is a readable view of recorded gate output, not a browser-side substitute for the Rust suite. Reproduce it from the public repository or inspect the public workflow history. No check on this page signs or submits a transaction.
        </p>
        <a className="mt-4 inline-flex items-center gap-1.5 font-bold text-emerald-300 hover:text-emerald-200" href={REPORT} target="_blank" rel="noreferrer">Read the concise verification record <ArrowUpRight className="h-4 w-4" /></a>
      </footer>
    </main>
  );
}

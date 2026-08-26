"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  Code2,
  Copy,
  ExternalLink,
  FileCode2,
  KeyRound,
  Layers3,
  Loader2,
  Play,
  RotateCcw,
  Search,
  Server,
  ShieldCheck,
  Terminal,
  TimerReset,
  WalletCards,
} from "lucide-react";
import { contractUrl, txUrl } from "@/lib/explorer";
import { HACKATHON_STARTER_CATALOG } from "@/lib/hackathon-starters.generated";
import { buildStarterInstallCommand } from "@/lib/starter-install";
import STARTER_MANIFEST from "@/public/starters/v1/manifest.json";

const STORAGE_KEY = "ackrate-hackathon-workspace-v1";
const STARTER_KITS = HACKATHON_STARTER_CATALOG.kits;
const STARTER_CATEGORIES = ["All", ...Array.from(new Set(STARTER_KITS.map((kit) => kit.category)))];
const STARTER_ARCHIVES = new Map(STARTER_MANIFEST.kits.map((entry) => [entry.slug, entry]));
const STARTER_ACCENTS = [
  { number: "bg-sky-400/10 text-sky-300", category: "border-sky-400/20 bg-sky-400/[0.07] text-sky-200/80" },
  { number: "bg-violet-400/10 text-violet-300", category: "border-violet-400/20 bg-violet-400/[0.07] text-violet-200/80" },
  { number: "bg-fuchsia-400/10 text-fuchsia-300", category: "border-fuchsia-400/20 bg-fuchsia-400/[0.07] text-fuchsia-200/80" },
  { number: "bg-amber-400/10 text-amber-300", category: "border-amber-400/20 bg-amber-400/[0.07] text-amber-200/80" },
  { number: "bg-cyan-400/10 text-cyan-300", category: "border-cyan-400/20 bg-cyan-400/[0.07] text-cyan-200/80" },
] as const;

type InstallerShell = "posix" | "powershell";

const starterCommand = (slug: string, shell: InstallerShell) => {
  const archive = STARTER_ARCHIVES.get(slug);
  if (!archive) throw new Error(`Missing starter archive for ${slug}`);
  return buildStarterInstallCommand(archive, { shell });
};

type ResourceSummary = { id: string; label: string; attempt: number };
type Workspace = {
  endpointBase: string;
  contractId: string;
  merchant: string;
  budgetXlm: string;
  priceXlm: string;
  nextResource: ResourceSummary;
};
type PersistedWorkspace = { sessionId: string; expiresAt: string; workspace: Workspace };
type DemoEvent = Record<string, unknown> & { type: string };
type CreateResponse = {
  ok: true;
  action: "create";
  sessionId: string;
  expiresAt: string;
  workspace: Workspace;
  events: DemoEvent[];
};
type StatusResponse = {
  ok: true;
  action: "status";
  sessionId: string;
  expiresAt: string;
  events: DemoEvent[];
};
type FailureResponse = { ok: false; code?: string; error?: string };

const LESSONS = [
  {
    id: "mandate",
    title: "Mandate",
    Icon: ShieldCheck,
    summary: "The user authorizes one agent, one merchant, one asset, one limit, and one expiry.",
    code: `const mandate = ackrate.createIntentMandate({
  user, agent, merchant, asset,
  maxAmount: "3.00",
  expiry: Math.floor(Date.now() / 1000) + 3600,
});`,
  },
  {
    id: "scope",
    title: "Merchant scope",
    Icon: KeyRound,
    summary: "A payment cannot be redirected: MandateRegistry checks the exact merchant before consuming budget.",
    code: `merchant: process.env.ACKRATE_MERCHANT
// The contract rejects any different destination.`,
  },
  {
    id: "budget",
    title: "Budget",
    Icon: WalletCards,
    summary: "Three 1 XLM calls succeed; the fourth is rejected by the contract, not by cached application state.",
    code: `maxAmount: "3.00"
// request 1: 200 · request 2: 200 · request 3: 200
// request 4: BudgetExceeded`,
  },
  {
    id: "expiry",
    title: "Expiry",
    Icon: TimerReset,
    summary: "Expired authority fails before settlement. Change the starter expiry to run the failure path.",
    code: `expiry: Math.floor(Date.now() / 1000) + 3600
// For the drill, use a short lifetime and wait before the purchase attempt.`,
  },
  {
    id: "replay",
    title: "Replay defense",
    Icon: RotateCcw,
    summary: "The proof is bound to the exact origin, method, resource, and one-time redemption claim.",
    code: `proofPolicy: "bound-v2-only"
// Reusing an accepted proof for another resource is rejected.`,
  },
  {
    id: "recovery",
    title: "Recovery",
    Icon: Server,
    summary: "Pending receipts are durable before broadcast; unresolved evidence blocks a second payment context.",
    code: `await receiptStore.savePending(receipt)
// Retry the exact receipt; never create new keys or pay again silently.`,
  },
  {
    id: "evidence",
    title: "Explorer evidence",
    Icon: ExternalLink,
    summary: "Each delivered response includes the settlement hash that the server independently verified.",
    code: `const receipt = getSettlementReceipt(response)
console.log(receipt.txHash) // open on Stellar testnet explorer`,
  },
] as const;

const HOSTED_PREVIEW = `// src/hosted.mjs
const consumer = createBoundTestnetConsumer({
  mandate: mandateEvidence.mandate,
  agent: actors.agent,
  receiptStore: stores.receiptStore,
});
const url = \`\${checkedEndpoint}/\${resource}\`;
const quote = await verifyExactBound402({
  url, merchant: checkedMerchant, amount: "1.00",
});
const delivered = await purchaseVerifiedBoundJson({
  consumer,
  mandate: mandateEvidence.mandate,
  url,
  quote,
  validateDelivery: ({ body, receipt }) =>
    validateHostedDelivery({ body, receipt, resource }),
  commitDelivery: async ({ body, value, receipt }) => {
    const bodyEvidence = createJsonEvidenceEnvelope(
      "hosted-delivery-body", body,
    );
    await stores.resultStore.commitDelivery(runId, {
      type: "delivery_accepted",
      receiptId: receipt.receiptId,
      txHash: receipt.txHash,
      bodySha256: bodyEvidence.sha256,
      evidence: { resource: value.resource, label: value.label },
    });
  },
});`;

const CONSUMER_PREVIEW = `// src/consumer.mjs
export const scenario = createScenario(
  EXPECTED_SCENARIO_METADATA,
);

export async function runDemo({
  stateRoot = resolve(".ackrate"),
  onEvent,
} = {}) {
  return runLocalTestnetDemo({
    scenario,
    stateRoot,
    onEvent,
  });
}`;

const FULFILLMENT_PREVIEW = `// src/fulfillment.mjs
return startFulfillmentServer({
  host: "127.0.0.1",
  port: checkedPort,
  publicOrigin: origin,
  merchant: checkedMerchant,
  challengeSecret: secret,
  routePattern: scenario.routePattern,
  amount: scenario.amount,
  preflight: scenario.preflight,
  fulfill: scenario.fulfill,
  configureFreeRoutes: scenario.configureFreeRoutes,
  stateRoot,
});`;

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: "easeOut" as const },
});

const valueText = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";

const hashValue = (value: unknown): string | null => {
  const candidate = valueText(value).toLowerCase();
  return /^[0-9a-f]{64}$/.test(candidate) ? candidate : null;
};

const short = (value: string, lead = 7, tail = 5) =>
  value ? `${value.slice(0, lead)}…${value.slice(-tail)}` : "";

const isWorkspace = (value: unknown): value is PersistedWorkspace => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as PersistedWorkspace;
  return /^[0-9a-f-]{36}$/i.test(candidate.sessionId)
    && typeof candidate.expiresAt === "string"
    && typeof candidate.workspace?.endpointBase === "string"
    && /^https?:\/\//.test(candidate.workspace.endpointBase)
    && /^G[A-Z2-7]{55}$/.test(candidate.workspace.merchant)
    && /^C[A-Z2-7]{55}$/.test(candidate.workspace.contractId);
};

export default function SolutionsPage() {
  const [persisted, setPersisted] = useState<PersistedWorkspace | null>(null);
  const [events, setEvents] = useState<DemoEvent[]>([]);
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [advancedTab, setAdvancedTab] = useState<"hosted" | "consumer" | "fulfillment">("hosted");
  const [openLesson, setOpenLesson] = useState<string>("mandate");
  const [starterQuery, setStarterQuery] = useState("");
  const [starterCategory, setStarterCategory] = useState("All");
  const [selectedStarterSlug, setSelectedStarterSlug] = useState("");
  const [installerShell, setInstallerShell] = useState<InstallerShell>("posix");
  const [showHostedDemo, setShowHostedDemo] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (isWorkspace(parsed)) setPersisted(parsed);
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  useEffect(() => {
    if (!persisted?.sessionId) return;
    const controller = new AbortController();
    let stopped = false;
    const poll = async () => {
      try {
        const response = await fetch("/api/express", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "status", sessionId: persisted.sessionId }),
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 409) return;
        const payload = await response.json().catch(() => null) as StatusResponse | FailureResponse | null;
        if (stopped || !payload) return;
        if (payload.ok === false) {
          if (payload.code === "expired" || payload.code === "not_found") {
            sessionStorage.removeItem(STORAGE_KEY);
            setPersisted(null);
            setError("This demo expired. Click Start again.");
          }
          return;
        }
        if (!response.ok || payload.action !== "status") return;
        setPersisted((current) => current ? { ...current, expiresAt: payload.expiresAt } : current);
        if (Array.isArray(payload.events) && payload.events.length) {
          setEvents((current) => [...current, ...payload.events].slice(-100));
        }
      } catch (cause) {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) {
          // The next poll retries; explicit actions surface actionable failures.
        }
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 1_500);
    return () => {
      stopped = true;
      clearInterval(timer);
      controller.abort();
    };
  }, [persisted?.sessionId]);

  const runCommand = persisted
    ? `npm run hosted -- --endpoint="${persisted.workspace.endpointBase.replace(/\/$/, "")}" --merchant="${persisted.workspace.merchant}"`
    : "Click Start to unlock this command.";

  const delivered = events.filter((event) => event.type === "delivery_200");
  const sawChallenge = events.some((event) => event.type === "challenge_402");
  const sawPayment = events.some((event) => event.type === "payment_tx");
  const blocked = events.some((event) => event.type === "purchase_blocked");
  const complete = delivered.length >= 3 && blocked;
  const transactions = useMemo(() => {
    const seen = new Set<string>();
    return events.flatMap((event) => {
      if (event.type !== "payment_tx" && event.type !== "delivery_200") return [];
      const hash = hashValue(event.hash);
      if (!hash || seen.has(hash)) return [];
      seen.add(hash);
      return [{ hash, resource: valueText(event.resource) || "resource" }];
    });
  }, [events]);
  const visibleStarterKits = useMemo(() => {
    const query = starterQuery.trim().toLowerCase();
    return STARTER_KITS.filter((kit) => {
      const matchesCategory = starterCategory === "All" || kit.category === starterCategory;
      const searchable = [
        kit.title,
        kit.category,
        kit.difficulty,
        kit.summary,
        kit.paidResource,
        ...kit.features,
      ].join(" ").toLowerCase();
      return matchesCategory && (!query || searchable.includes(query));
    });
  }, [starterCategory, starterQuery]);

  async function copyValue(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(""), 1_800);
    } catch {
      setError("Clipboard access was unavailable. Select and copy the command manually.");
    }
  }

  async function createWorkspace() {
    if (creating || persisted) return;
    setCreating(true);
    setError("");
    setEvents([]);
    try {
      const response = await fetch("/api/express", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create" }),
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as CreateResponse | FailureResponse | null;
      if (!payload) {
        throw new Error("The demo could not start. Try again.");
      }
      if (payload.ok === false) {
        throw new Error("The demo could not start. Try again.");
      }
      if (!response.ok || payload.action !== "create") {
        throw new Error("The demo could not start. Try again.");
      }
      const next = { sessionId: payload.sessionId, expiresAt: payload.expiresAt, workspace: payload.workspace };
      if (!isWorkspace(next)) throw new Error("The demo could not start. Try again.");
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setPersisted(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The demo could not start. Try again.");
    } finally {
      setCreating(false);
    }
  }

  async function resetWorkspace() {
    if (!persisted || resetting) return;
    setResetting(true);
    setError("");
    try {
      await fetch("/api/express", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reset", sessionId: persisted.sessionId }),
        cache: "no-store",
      });
    } finally {
      sessionStorage.removeItem(STORAGE_KEY);
      setPersisted(null);
      setEvents([]);
      setResetting(false);
    }
  }

  const visibleEvents = events.filter((event) => [
    "request",
    "challenge_402",
    "payment_submit",
    "payment_tx",
    "proof_verified",
    "delivery_200",
    "budget",
    "purchase_blocked",
    "result",
  ].includes(event.type));

  return (
    <main className="relative mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="glow" aria-hidden />

      <motion.header {...fade()} className="mx-auto max-w-4xl text-center">
        <div className="inline-flex items-center gap-2 rounded-full glass px-3.5 py-1.5 text-[11px] font-semibold tracking-[0.18em] text-emerald-300/90">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
          20 STARTER PACKS · ABOUT 60 SECONDS
        </div>
        <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-6xl">
          Pick a starter. Copy one command. <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-emerald-400 bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(52,211,153,0.25)]">Start building.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-emerald-100/70 sm:text-lg">
          Open an empty folder in VS Code. Pick one of the 20 packs below, copy its setup command, paste it into the terminal, and press Enter. Your project will be populated and ready to run.
        </p>
        <div className="mt-7 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <motion.a
            href="#starter-packs"
            whileHover={{ scale: 1.025, y: -1 }}
            whileTap={{ scale: 0.98 }}
            className="inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-r from-emerald-400 to-teal-300 px-6 py-3 text-sm font-black text-[#06241a] shadow-[0_10px_36px_-8px_rgba(52,211,153,0.75)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none"
          >
            <Layers3 className="h-4 w-4" aria-hidden /> Choose a starter
          </motion.a>
        </div>
        <p className="mt-3 text-xs text-emerald-100/40"><a href="https://nodejs.org/en/download" target="_blank" rel="noreferrer" className="font-semibold text-emerald-300/80 underline decoration-emerald-400/30 underline-offset-4 hover:text-emerald-200">Requires Node.js 20+</a> · no GitHub repo or wallet needed · testnet only · private keys stay on your computer</p>
      </motion.header>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            role="alert"
            className="mx-auto mt-6 flex max-w-3xl items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.07] px-4 py-3 text-sm text-amber-100"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.section id="starter-packs" {...fade(0.14)} className="mt-12 scroll-mt-24">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300/70">
            <Layers3 className="h-4 w-4" aria-hidden /> Choose from 20 starter packs
          </div>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-emerald-50 sm:text-4xl">Pick one. Copy one command. Done.</h2>
          <p className="mt-3 text-sm leading-relaxed text-emerald-100/55">The setup command downloads your chosen pack, fills your empty folder, and installs everything. When it finishes, run <code className="text-emerald-300">npm run demo</code>.</p>
        </div>

        <div className="mx-auto mt-6 grid max-w-4xl gap-3 sm:grid-cols-2">
          <GuideStep number="01" title="Pick a starter pack" detail="Choose the project you want below" complete={false} active={false} />
          <GuideStep number="02" title="Open an empty folder" detail="In VS Code, select Terminal → New Terminal" complete={false} active={false} />
          <GuideStep number="03" title="Copy setup command" detail="Paste it into the terminal and press Enter" complete={false} active={false} />
          <GuideStep number="04" title="Run your project" detail="Type npm run demo and press Enter" complete={false} active={false} />
        </div>

        <div className="mt-7 overflow-hidden rounded-3xl border border-emerald-300/15 bg-[#06100d]/80">
          <div className="border-b border-white/10 bg-white/[0.025] p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <label className="relative block min-w-0 flex-1 lg:max-w-md">
                <span className="sr-only">Search starter kits</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-100/35" aria-hidden />
                <input
                  type="search"
                  value={starterQuery}
                  onChange={(event) => setStarterQuery(event.target.value)}
                  placeholder="Search payments, compute, data, agents…"
                  className="min-h-11 w-full rounded-xl border border-white/10 bg-black/30 py-2.5 pl-10 pr-3 text-sm text-emerald-100 outline-none placeholder:text-emerald-100/30 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-300/15"
                />
              </label>
              <div className="flex items-center justify-between gap-3 text-xs text-emerald-100/45 lg:justify-end">
                <span><strong className="text-emerald-200">{visibleStarterKits.length}</strong> of {STARTER_KITS.length} starters</span>
                <a href="/starters/v1/manifest.json" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-emerald-300/75 hover:text-emerald-200">
                  Integrity manifest <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </div>
            </div>
            <div className="mt-3 flex max-w-full gap-2 overflow-x-auto pb-1" aria-label="Starter categories">
              {STARTER_CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setStarterCategory(category)}
                  aria-pressed={starterCategory === category}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60 ${starterCategory === category ? "border-emerald-400/35 bg-emerald-400/15 text-emerald-200" : "border-white/10 bg-black/20 text-emerald-100/45 hover:border-emerald-400/25 hover:text-emerald-100/75"}`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {visibleStarterKits.length ? (
            <div className="grid min-w-0 gap-4 p-4 sm:p-5 lg:grid-cols-2">
              {visibleStarterKits.map((kit) => {
                const starterIndex = STARTER_KITS.indexOf(kit);
                const accent = STARTER_ACCENTS[starterIndex % STARTER_ACCENTS.length];
                const selected = selectedStarterSlug === kit.slug;
                const setupCopyKey = `starter-setup-${kit.slug}`;
                const runCopyKey = `starter-run-${kit.slug}`;
                const commandPanelId = `starter-commands-${kit.slug}`;
                return (
                  <article key={kit.id} className={`flex min-w-0 flex-col overflow-hidden rounded-2xl glass transition ${selected ? "ring-1 ring-emerald-300/45" : ""}`}>
                    <div className="flex min-w-0 items-start justify-between gap-3 border-b border-white/10 bg-black/20 px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl font-mono text-xs font-black ${accent.number}`}>{String(starterIndex + 1).padStart(2, "0")}</span>
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold leading-snug text-emerald-100">{kit.title}</h3>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-100/40">
                            <span className={`rounded-full border px-1.5 py-0.5 ${accent.category}`}>{kit.category}</span><span>{kit.difficulty}</span>
                          </div>
                        </div>
                      </div>
                      <code className="shrink-0 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.06] px-2 py-1 text-[9px] text-emerald-300/70">GET only</code>
                    </div>

                    <div className="flex flex-1 flex-col p-4">
                      <p className="text-sm leading-relaxed text-emerald-100/60">{kit.summary}</p>
                      <code className="mt-3 block overflow-x-auto whitespace-nowrap rounded-xl border border-white/8 bg-black/25 px-3 py-2 text-[10px] text-emerald-200/65">{kit.paidResource}</code>
                      <div className="mt-3 rounded-xl border border-red-400/15 bg-red-400/[0.035] p-3">
                        <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-red-300/60">Enforced boundary</div>
                        <p className="mt-1.5 text-[11px] leading-relaxed text-emerald-100/50">{kit.negativePath.outcome}</p>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {kit.features.slice(0, 5).map((feature) => (
                          <span key={feature} className="rounded-full border border-white/10 bg-white/[0.025] px-2 py-1 text-[9px] font-medium text-emerald-100/40">{feature}</span>
                        ))}
                      </div>

                      <div className="mt-auto grid grid-cols-1 gap-2 pt-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <button
                          type="button"
                          onClick={() => setSelectedStarterSlug(selected ? "" : kit.slug)}
                          aria-expanded={selected}
                          aria-controls={commandPanelId}
                          className="inline-flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-300 px-3 py-2 text-xs font-black text-[#06241a] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
                        >
                          {selected ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Layers3 className="h-3.5 w-3.5" aria-hidden />}
                          <span className="truncate">{selected ? "Selected" : "Use this starter"}</span>
                        </button>
                        <a href={`https://github.com/ackrate/ackrate-protocol-demo/blob/main/starters/${kit.slug}/README.md`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-emerald-100/60 transition hover:border-emerald-400/35 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60">
                          Read the README <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        </a>
                      </div>

                      <AnimatePresence initial={false}>
                        {selected && (
                          <motion.div
                            id={commandPanelId}
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                              <p className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-3 text-xs leading-relaxed text-emerald-100/55"><strong className="text-emerald-200">Before you begin:</strong> install <a href="https://nodejs.org/en/download" target="_blank" rel="noreferrer" className="font-semibold text-emerald-300 underline decoration-emerald-400/30 underline-offset-4 hover:text-emerald-200">Node.js 20 or newer</a>, then choose your computer below.</p>
                              <InstallerShellPicker value={installerShell} onChange={setInstallerShell} />
                              <p className="text-xs leading-relaxed text-emerald-100/55"><strong className="text-emerald-100">Open an empty folder in VS Code.</strong> Open its terminal, copy command 1, paste it, and press Enter.</p>
                              <CommandBlock label="1 · Populate this empty folder" value={starterCommand(kit.slug, installerShell)} copyKey={setupCopyKey} copied={copied} onCopy={copyValue} />
                              <p className="text-[11px] leading-relaxed text-emerald-100/40">The installer verifies the download before extracting any file.</p>
                              <p className="text-xs leading-relaxed text-emerald-100/55">When command 1 finishes, your starter is installed. Copy command 2 into the same terminal and press Enter.</p>
                              <CommandBlock label="2 · Run your starter" value="npm run demo" copyKey={runCopyKey} copied={copied} onCopy={copyValue} />
                              <p className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-3 text-xs leading-relaxed text-emerald-100/55"><strong className="text-emerald-200">Then just read the screen.</strong> Six numbered steps explain the practice accounts, HTTP 402, contract payment, HTTP 200 result, Stellar proof links, and this starter&apos;s safety check.</p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="grid min-h-56 place-items-center p-6 text-center">
              <div>
                <Search className="mx-auto h-6 w-6 text-emerald-100/25" aria-hidden />
                <p className="mt-3 text-sm text-emerald-100/45">No starters match that search and category.</p>
                <button type="button" onClick={() => { setStarterQuery(""); setStarterCategory("All"); }} className="mt-3 text-xs font-semibold text-emerald-300 hover:text-emerald-200">Clear filters</button>
              </div>
            </div>
          )}
        </div>

        <div className="mx-auto mt-6 flex max-w-4xl flex-col gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <div className="text-sm font-bold text-emerald-100">Optional hosted walkthrough: Research Source Scout</div>
            <p className="mt-1 text-xs leading-relaxed text-emerald-100/45">Use the browser companion only after you have picked a starter. It shows the live 402 → payment → 200 flow, three settlements, and the contract-blocked fourth purchase.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowHostedDemo((current) => !current)}
            aria-expanded={showHostedDemo}
            aria-controls="optional-hosted-demo"
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.08] px-4 py-2.5 text-sm font-semibold text-emerald-200 transition hover:border-emerald-300/50 hover:bg-emerald-400/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
          >
            <Play className="h-4 w-4" aria-hidden /> {showHostedDemo ? "Hide walkthrough" : "Open hosted walkthrough"}
          </button>
        </div>
      </motion.section>

      {showHostedDemo && (
        <div id="optional-hosted-demo">
      <motion.section {...fade(0.08)} className="relative mt-10 overflow-hidden rounded-3xl border border-emerald-300/15 bg-[#06100d]/80 shadow-[0_24px_90px_-32px_rgba(16,185,129,0.5)] backdrop-blur-xl">
        <div className="border-b border-white/10 bg-white/[0.025] px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${complete ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" : persisted ? "animate-pulse bg-sky-400" : "bg-white/25"}`} />
                <h2 className="text-sm font-bold tracking-wide text-emerald-100">GUIDED SETUP</h2>
              </div>
              <p className="mt-2 text-xs text-emerald-100/45">One setup command, one run command, then inspect the evidence.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={createWorkspace}
                  disabled={creating || Boolean(persisted)}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-300 px-4 py-2 text-xs font-black text-[#06241a] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : persisted ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
                  {creating ? "Starting…" : persisted ? "Demo ready" : "Start demo"}
                </button>
                <button
                  type="button"
                  onClick={resetWorkspace}
                  disabled={!persisted || resetting}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-xs font-semibold text-emerald-100/70 transition hover:border-emerald-400/35 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RotateCcw className="h-3.5 w-3.5" aria-hidden />}
                  Reset
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[360px]">
              <Stat label="delivered" value={delivered.length} tone={delivered.length ? "emerald" : "muted"} />
              <Stat label="blocked" value={blocked ? 1 : 0} tone={blocked ? "red" : "muted"} />
              <Stat label="target" value="< 5 min" tone="muted" compact />
            </div>
          </div>
        </div>

        <div className="grid min-w-0 gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="min-w-0 space-y-3">
            <GuideStep number="01" title="Click Start demo" detail={persisted ? "Your demo is ready" : "Use the Start demo button in this panel"} complete={Boolean(persisted)} active={creating} />
            <GuideStep number="02" title="Copy command 1" detail="Open an empty folder in VS Code, paste it in the terminal, and press Enter" complete={copied === "setup" || Boolean(delivered.length)} active={false} />
            <GuideStep number="03" title="Copy command 2" detail="Paste it into the same terminal and press Enter" complete={delivered.length > 0} active={sawChallenge && !complete} />
            <GuideStep number="04" title="See the proof" detail="Three deliveries succeed and the fourth is blocked" complete={complete} active={delivered.length > 0 && !complete} />

            {persisted && (
              <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-black/25 p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300/60">Hosted Express endpoint</div>
                <code className="mt-2 block break-all text-[11px] leading-relaxed text-emerald-200 [overflow-wrap:anywhere]">{persisted.workspace.endpointBase}</code>
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Fact label="Price">{persisted.workspace.priceXlm} XLM / request</Fact>
                  <Fact label="Budget">{persisted.workspace.budgetXlm} XLM on-chain</Fact>
                  <Fact label="Merchant"><code>{short(persisted.workspace.merchant)}</code></Fact>
                  <Fact label="Contract">
                    <a href={contractUrl(persisted.workspace.contractId)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-300 hover:text-emerald-200">
                      <code>{short(persisted.workspace.contractId)}</code><ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  </Fact>
                </dl>
              </div>
            )}
          </div>

          <div className="min-w-0 overflow-hidden rounded-2xl glass">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-black/20 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-100">
                <Terminal className="h-4 w-4 text-emerald-400" aria-hidden />
                VS Code terminal
              </div>
              <span className="rounded-full border border-white/10 bg-black/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-100/45">blank folder</span>
            </div>
            <div className="space-y-4 p-4">
              <p className="text-xs leading-relaxed text-emerald-100/55"><strong className="text-emerald-200">Requirement:</strong> <a href="https://nodejs.org/en/download" target="_blank" rel="noreferrer" className="font-semibold text-emerald-300 underline decoration-emerald-400/30 underline-offset-4 hover:text-emerald-200">Node.js 20 or newer</a>.</p>
              <InstallerShellPicker value={installerShell} onChange={setInstallerShell} />
              <CommandBlock label="1 · Set up the project" value={starterCommand("research-source-scout", installerShell)} copyKey="setup" copied={copied} onCopy={copyValue} />
              <CommandBlock label="2 · Run the demo" value={runCommand} copyKey="run" copied={copied} onCopy={copyValue} disabled={!persisted} />
              <div className="rounded-xl border border-emerald-400/15 bg-[#020806] p-3 font-mono text-[11px] leading-relaxed text-emerald-100/65">
                <div className="text-emerald-300">$ expected output</div>
                <div className={sawChallenge ? "text-emerald-200" : "text-emerald-100/35"}>{sawChallenge ? "✓ 402 Payment Required" : "· waiting for the local consumer"}</div>
                <div className={sawPayment ? "text-emerald-200" : "text-emerald-100/35"}>{sawPayment ? "✓ contract payment confirmed" : "· settlement pending"}</div>
                <div className={delivered.length ? "text-emerald-200" : "text-emerald-100/35"}>{delivered.length ? `✓ ${delivered.length}/3 protected responses delivered` : "· protected response pending"}</div>
                <div className={blocked ? "text-red-300" : "text-emerald-100/35"}>{blocked ? "✓ fourth purchase rejected by MandateRegistry" : "· contract limit check pending"}</div>
              </div>
              <p className="text-[11px] leading-relaxed text-emerald-100/40">The scaffold contains the actual consumer and fulfillment source. Add <code className="text-emerald-300">.ackrate/</code> to no other workflow: it is already ignored and stores local recovery evidence.</p>
            </div>
          </div>
        </div>
      </motion.section>

      <motion.section {...fade(0.12)} className="mt-8 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="min-w-0 overflow-hidden rounded-2xl glass">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-black/20 px-4 py-3">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-emerald-400" aria-hidden />
              <h2 className="text-sm font-semibold text-emerald-100">Live session</h2>
            </div>
            <span className="text-[11px] text-emerald-100/35">polling hosted /express</span>
          </div>
          <div className="h-[360px] overflow-auto p-4">
            {visibleEvents.length ? (
              <div className="space-y-2">
                {visibleEvents.map((event, index) => (
                  <EventRow key={`${event.type}-${index}-${valueText(event.hash)}`} event={event} />
                ))}
              </div>
            ) : (
              <div className="grid h-full place-items-center text-center">
                <div>
                  <Server className="mx-auto h-6 w-6 text-emerald-100/25" aria-hidden />
                  <p className="mt-3 text-sm text-emerald-100/40">Your local requests will appear here.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 overflow-hidden rounded-2xl glass">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-black/20 px-4 py-3">
            <div className="flex items-center gap-2">
              <ExternalLink className="h-4 w-4 text-emerald-400" aria-hidden />
              <h2 className="text-sm font-semibold text-emerald-100">Settlement evidence</h2>
            </div>
            <span className="text-[11px] text-emerald-100/35">Stellar testnet</span>
          </div>
          <div className="h-[360px] overflow-auto p-4">
            {transactions.length ? (
              <div className="space-y-2">
                {transactions.map((transaction, index) => (
                  <a
                    key={transaction.hash}
                    href={txUrl(transaction.hash)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] px-3 py-3 transition hover:border-emerald-400/40 hover:bg-emerald-400/10"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-emerald-100">{index + 1}. {transaction.resource}</div>
                      <code className="mt-1 block truncate text-[10px] text-emerald-300/65">{transaction.hash}</code>
                    </div>
                    <ExternalLink className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden />
                  </a>
                ))}
              </div>
            ) : (
              <div className="grid h-full place-items-center text-center">
                <div>
                  <ShieldCheck className="mx-auto h-6 w-6 text-emerald-100/25" aria-hidden />
                  <p className="mt-3 text-sm text-emerald-100/40">Verified transaction links appear after settlement.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.section>
        </div>
      )}

      <motion.section {...fade(0.16)} className="mt-12">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300/70">
            <BookOpen className="h-4 w-4" aria-hidden /> Guided concepts
          </div>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-emerald-50 sm:text-4xl">Understand every enforcement boundary.</h2>
          <p className="mt-3 text-sm leading-relaxed text-emerald-100/55">Run the happy path first, then change one input at a time and observe where the request fails closed.</p>
        </div>
        <div className="mx-auto mt-7 grid max-w-4xl gap-3">
          {LESSONS.map(({ id, title, Icon, summary, code }) => {
            const open = openLesson === id;
            return (
              <div key={id} className="overflow-hidden rounded-2xl glass">
                <button
                  type="button"
                  onClick={() => setOpenLesson(open ? "" : id)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-3 px-4 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-300/60 sm:px-5"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300"><Icon className="h-4 w-4" aria-hidden /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-emerald-100">{title}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-emerald-100/50">{summary}</span>
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-emerald-100/40 transition ${open ? "rotate-180" : ""}`} aria-hidden />
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <pre className="overflow-auto border-t border-white/10 bg-black/35 p-4 font-mono text-[11px] leading-relaxed text-emerald-100/75 sm:px-5"><code>{code}</code></pre>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </motion.section>

      <motion.section {...fade(0.2)} className="mt-12 overflow-hidden rounded-3xl border border-emerald-300/15 bg-[#06100d]/80">
        <div className="flex flex-col gap-4 border-b border-white/10 bg-white/[0.025] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <div className="flex items-center gap-2">
              <FileCode2 className="h-4 w-4 text-emerald-400" aria-hidden />
              <h2 className="text-sm font-bold text-emerald-100">Reveal the implementation</h2>
            </div>
            <p className="mt-1 text-xs text-emerald-100/45">Selected excerpts from the generated files in your project—no conceptual substitute code.</p>
          </div>
          <div className="flex rounded-lg border border-white/10 bg-black/25 p-0.5" role="tablist" aria-label="Starter source preview">
            {(["hosted", "consumer", "fulfillment"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={advancedTab === tab}
                onClick={() => setAdvancedTab(tab)}
                className={`rounded-md px-3 py-1.5 text-[11px] font-semibold capitalize transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60 ${advancedTab === tab ? "bg-emerald-400/15 text-emerald-200" : "text-emerald-100/40 hover:text-emerald-100/75"}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
        <div className="grid min-w-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <pre className="min-h-[300px] overflow-auto whitespace-pre p-4 font-mono text-[11px] leading-relaxed text-emerald-100/80 sm:p-6 sm:text-xs"><code>{advancedTab === "hosted" ? HOSTED_PREVIEW : advancedTab === "consumer" ? CONSUMER_PREVIEW : FULFILLMENT_PREVIEW}</code></pre>
          <div className="border-t border-white/10 bg-black/20 p-5 lg:border-l lg:border-t-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-100"><Code2 className="h-4 w-4 text-emerald-400" aria-hidden />Advanced mode</div>
            <p className="mt-3 text-sm leading-relaxed text-emerald-100/55">The guided command runs <code className="text-emerald-300">src/hosted.mjs</code> against this page. Run <code className="text-emerald-300">npm run demo</code> for the complete local consumer-and-fulfillment flow, then edit either side directly.</p>
            <a href="https://github.com/ackrate/ackrate-protocol-demo/tree/main/starters/research-source-scout" target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-emerald-100/75 transition hover:border-emerald-400/40 hover:text-emerald-100">
              Open starter source <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </div>
        </div>
      </motion.section>
    </main>
  );
}

function GuideStep({ number, title, detail, complete, active }: { number: string; title: string; detail: string; complete: boolean; active: boolean }) {
  return (
    <div className={`flex min-w-0 items-center gap-3 rounded-xl border px-3.5 py-3 transition ${complete ? "border-emerald-400/30 bg-emerald-400/[0.07]" : active ? "border-sky-400/30 bg-sky-400/[0.05]" : "border-white/10 bg-black/20"}`}>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg font-mono text-xs font-bold ${complete ? "bg-emerald-400 text-[#06241a]" : "bg-white/[0.05] text-emerald-100/45"}`}>{complete ? <Check className="h-4 w-4" aria-hidden /> : number}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-emerald-100">{title}</div>
        <div className="mt-0.5 text-xs leading-relaxed text-emerald-100/45">{detail}</div>
      </div>
      {active && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-300" aria-hidden />}
    </div>
  );
}

function InstallerShellPicker({ value, onChange }: { value: InstallerShell; onChange: (value: InstallerShell) => void }) {
  const choices: Array<{ value: InstallerShell; label: string }> = [
    { value: "posix", label: "Mac / Linux" },
    { value: "powershell", label: "Windows PowerShell" },
  ];
  return (
    <div>
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-100/35">Choose your computer</div>
      <div className="inline-flex max-w-full rounded-lg border border-white/10 bg-black/25 p-0.5" role="tablist" aria-label="Starter installer command">
        {choices.map((choice) => (
          <button
            key={choice.value}
            type="button"
            role="tab"
            aria-selected={value === choice.value}
            onClick={() => onChange(choice.value)}
            className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60 ${value === choice.value ? "bg-emerald-400/15 text-emerald-200" : "text-emerald-100/40 hover:text-emerald-100/75"}`}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CommandBlock({ label, value, copyKey, copied, onCopy, disabled = false }: { label: string; value: string; copyKey: string; copied: string; onCopy: (value: string, key: string) => void | Promise<void>; disabled?: boolean }) {
  const didCopy = copied === copyKey;
  return (
    <div className={`overflow-hidden rounded-xl border border-white/10 bg-black/40 ${disabled ? "opacity-45" : ""}`}>
      <div className="flex items-center justify-between gap-2 border-b border-white/8 px-3 py-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-100/35">{label}</span>
        <button type="button" disabled={disabled} onClick={() => void onCopy(value, copyKey)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-emerald-100/55 transition hover:border-emerald-400/35 hover:text-emerald-200 disabled:cursor-not-allowed">
          {didCopy ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}{didCopy ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-w-full overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed text-emerald-200/80 [overflow-wrap:anywhere]"><code>{value}</code></pre>
    </div>
  );
}

function EventRow({ event }: { event: DemoEvent }) {
  const labels: Record<string, string> = {
    request: `GET /source/${valueText(event.resource)}`,
    challenge_402: "402 Payment Required",
    payment_submit: "Bound payment submitted",
    payment_tx: "Contract settlement confirmed",
    proof_verified: "Bound proof verified",
    delivery_200: "200 protected response delivered",
    budget: `${valueText(event.spentXlm)} XLM spent · ${valueText(event.remainingXlm)} remaining`,
    purchase_blocked: "Fourth purchase rejected by contract",
    result: "Live evidence complete",
  };
  const ok = ["payment_tx", "proof_verified", "delivery_200", "result"].includes(event.type);
  const warn = event.type === "challenge_402";
  const rejected = event.type === "purchase_blocked";
  const hash = hashValue(event.hash);
  return (
    <div className={`flex min-w-0 items-start gap-3 rounded-xl border px-3 py-2.5 ${rejected ? "border-red-400/20 bg-red-400/[0.05]" : ok ? "border-emerald-400/20 bg-emerald-400/[0.04]" : warn ? "border-amber-400/20 bg-amber-400/[0.04]" : "border-white/10 bg-black/20"}`}>
      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${rejected ? "bg-red-400" : ok ? "bg-emerald-400" : warn ? "bg-amber-400" : "bg-sky-400"}`} />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-emerald-100/85">{labels[event.type] || event.type}</div>
        {hash && <code className="mt-1 block truncate text-[10px] text-emerald-300/55">{hash}</code>}
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/8 bg-white/[0.025] p-3">
      <dt className="text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-100/35">{label}</dt>
      <dd className="mt-1 min-w-0 break-words text-[11px] text-emerald-100/65 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function Stat({ label, value, tone, compact = false }: { label: string; value: string | number; tone: "emerald" | "red" | "muted"; compact?: boolean }) {
  const color = tone === "emerald" ? "text-emerald-300" : tone === "red" ? "text-red-300" : "text-emerald-100/70";
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-black/25 px-2 py-2.5">
      <div className={`${compact ? "text-sm" : "text-xl"} truncate font-black tabular-nums ${color}`}>{value}</div>
      <div className="mt-0.5 truncate text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-100/35">{label}</div>
    </div>
  );
}

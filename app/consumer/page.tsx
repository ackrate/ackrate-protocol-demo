"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Clock3,
  FileSearch,
  Gauge,
  LockKeyhole,
  Pause,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  WalletCards,
  X,
} from "lucide-react";

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: "easeOut" as const },
});

const serviceOptions = [
  "Research sources",
  "Creative tools",
  "Data services",
  "Travel quotes",
] as const;

const expiryOptions = ["In 2 hours", "Today at 8:00 PM", "Tomorrow", "In 7 days"] as const;

const approvalOptions = [
  "Ask me above $5",
  "Ask before every payment",
  "No extra approval inside the limit",
] as const;

type PreviewState = "draft" | "ready" | "paused";

export default function ConsumerPage() {
  const [task, setTask] = useState(
    "Compare five home internet plans, use paid sources when useful, and deliver a cited recommendation.",
  );
  const [budget, setBudget] = useState("12");
  const [service, setService] = useState<(typeof serviceOptions)[number]>("Research sources");
  const [expiry, setExpiry] = useState<(typeof expiryOptions)[number]>("Today at 8:00 PM");
  const [approval, setApproval] = useState<(typeof approvalOptions)[number]>("Ask me above $5");
  const [previewState, setPreviewState] = useState<PreviewState>("draft");

  const safeBudget = useMemo(() => {
    const parsed = Number.parseFloat(budget);
    return Number.isFinite(parsed) && parsed > 0 ? parsed.toFixed(2) : "0.00";
  }, [budget]);

  const createPreview = () => {
    if (!task.trim() || safeBudget === "0.00") return;
    setPreviewState("ready");
  };

  const resetPreview = () => {
    setPreviewState("draft");
    setTask(
      "Compare five home internet plans, use paid sources when useful, and deliver a cited recommendation.",
    );
    setBudget("12");
    setService("Research sources");
    setExpiry("Today at 8:00 PM");
    setApproval("Ask me above $5");
  };

  return (
    <main className="relative overflow-hidden pb-8">
      <div className="glow" aria-hidden />

      <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1fr_0.92fr] lg:items-center lg:px-8 lg:pb-24 lg:pt-20">
        <motion.div {...fade()}>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-400/[0.06] px-3.5 py-1.5 text-[11px] font-semibold tracking-[0.18em] text-emerald-300/90">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
            CONSUMER PREVIEW · CONTROLLED AI SPENDING
          </div>
          <h1 className="mt-6 max-w-3xl text-4xl font-black tracking-[-0.04em] text-white sm:text-6xl lg:text-7xl">
            Give AI a job.{" "}
            <span className="bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-300 bg-clip-text text-transparent">
              Not a blank check.
            </span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-emerald-50/65 sm:text-lg">
            Describe the result you want, set a total budget, choose approved services, and add a deadline. ACKRATE turns
            those choices into spending rules checked before each supported payment.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <a
              href="#mandate-builder"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-[#06241a] shadow-[0_0_30px_rgba(52,211,153,0.3)] transition hover:bg-emerald-300"
            >
              Try the spending controls
              <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
            <a
              href="#how-it-works"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.025] px-5 py-3 text-sm font-semibold text-emerald-50/80 transition hover:border-emerald-300/30 hover:text-white"
            >
              See how it works
            </a>
          </div>

          <div className="mt-9 grid max-w-2xl gap-3 sm:grid-cols-3">
            {[
              [Gauge, "Set a hard limit", "Choose the most the agent may spend."],
              [LockKeyhole, "Choose where it can pay", "Limit purchases to approved services."],
              [Pause, "Stay in control", "Pause unused authority whenever you need."],
            ].map(([Icon, title, body]) => {
              const FeatureIcon = Icon as typeof Gauge;
              return (
                <div key={String(title)} className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                  <FeatureIcon className="h-4 w-4 text-emerald-300" aria-hidden />
                  <p className="mt-3 text-sm font-semibold text-emerald-50">{String(title)}</p>
                  <p className="mt-1 text-xs leading-relaxed text-white/45">{String(body)}</p>
                </div>
              );
            })}
          </div>
        </motion.div>

        <motion.div {...fade(0.08)} className="relative mx-auto w-full max-w-xl">
          <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-emerald-400/[0.08] blur-3xl" aria-hidden />
          <div className="overflow-hidden rounded-[2rem] border border-emerald-300/15 bg-[#07100d]/95 shadow-[0_32px_90px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-400 text-sm font-black text-[#06241a]">R</span>
                <div>
                  <p className="text-sm font-semibold text-white">ACKRATE Tasks</p>
                  <p className="text-[11px] text-white/40">Your agent · your spending rules</p>
                </div>
              </div>
              <span className="rounded-full border border-emerald-300/15 bg-emerald-400/[0.07] px-2.5 py-1 text-[10px] font-semibold text-emerald-300">
                CONTROLLED
              </span>
            </div>

            <div className="p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Your request</p>
              <p className="mt-3 text-lg font-semibold leading-snug text-emerald-50">
                Compare five home internet plans and deliver a cited recommendation.
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <PreviewStat label="Total limit" value="$12.00" Icon={WalletCards} />
                <PreviewStat label="Expires" value="Today · 8 PM" Icon={Clock3} />
                <PreviewStat label="Services" value="Research only" Icon={FileSearch} />
                <PreviewStat label="Approval" value="Ask above $5" Icon={ShieldCheck} />
              </div>

              <div className="mt-6 rounded-2xl border border-white/[0.08] bg-black/25 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-emerald-50">What the rules allow</p>
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden />
                </div>
                <div className="mt-4 space-y-3">
                  <FlowRow status="allowed" label="Provider coverage data" amount="$3.00" />
                  <FlowRow status="allowed" label="Independent pricing research" amount="$4.50" />
                  <FlowRow status="blocked" label="Unapproved entertainment purchase" amount="$275.00" />
                </div>
              </div>

              <a
                href="#mandate-builder"
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-bold text-[#06241a] transition hover:bg-emerald-300"
              >
                Try these spending controls
                <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
              <p className="mt-3 text-center text-[11px] text-white/35">Illustrative preview · no wallet or payment required</p>
            </div>
          </div>
        </motion.div>
      </section>

      <section id="mandate-builder" className="scroll-mt-24 border-y border-white/[0.07] bg-black/20">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.72fr_1.28fr] lg:px-8 lg:py-24">
          <motion.div {...fade()} className="lg:sticky lg:top-28 lg:self-start">
            <div className="grid h-12 w-12 place-items-center rounded-2xl border border-emerald-300/15 bg-emerald-400/10 text-emerald-300">
              <Sparkles className="h-5 w-5" aria-hidden />
            </div>
            <h2 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">Turn a request into clear spending rules.</h2>
            <p className="mt-4 text-sm leading-relaxed text-emerald-50/60 sm:text-base">
              You choose the job and the limits. ACKRATE prepares a plain-language summary before the agent receives any
              payment authority.
            </p>
            <div className="mt-6 space-y-3 text-sm text-emerald-50/65">
              {[
                "One hard limit across the entire job",
                "Only the services you approve",
                "An automatic end time for unused authority",
                "Your approval before exceptions",
              ].map((rule) => (
                <p key={rule} className="flex gap-2.5">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-300" aria-hidden />
                  {rule}
                </p>
              ))}
            </div>
          </motion.div>

          <motion.div {...fade(0.08)} className="rounded-[2rem] border border-white/[0.09] bg-[#08100e]/90 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.3)] sm:p-7">
            <div className="flex flex-col gap-3 border-b border-white/[0.08] pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300/75">Spending controls</p>
                <h3 className="mt-1 text-xl font-semibold text-white">Choose what the agent can spend</h3>
              </div>
              <span className="rounded-full border border-amber-300/15 bg-amber-300/[0.06] px-3 py-1.5 text-[11px] font-medium text-amber-100/70">
                Preview only · no funds move
              </span>
            </div>

            <div className="mt-6 space-y-5">
              <label className="block">
                <span className="text-sm font-medium text-emerald-50/80">What should the agent accomplish?</span>
                <textarea
                  value={task}
                  onChange={(event) => {
                    setTask(event.target.value);
                    setPreviewState("draft");
                  }}
                  rows={4}
                  className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-relaxed text-white outline-none transition placeholder:text-white/25 focus:border-emerald-300/40 focus:ring-2 focus:ring-emerald-400/10"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-emerald-50/80">Never spend more than</span>
                  <span className="mt-2 flex items-center rounded-xl border border-white/10 bg-black/30 px-4 focus-within:border-emerald-300/40 focus-within:ring-2 focus-within:ring-emerald-400/10">
                    <span className="text-sm text-white/40">$</span>
                    <input
                      value={budget}
                      onChange={(event) => {
                        setBudget(event.target.value.replace(/[^0-9.]/g, ""));
                        setPreviewState("draft");
                      }}
                      inputMode="decimal"
                      aria-label="Maximum total budget in dollars"
                      className="min-w-0 flex-1 bg-transparent px-2 py-3 text-sm text-white outline-none"
                    />
                    <span className="text-[11px] font-semibold text-white/30">USD</span>
                  </span>
                </label>

                <SelectField
                  label="Where can the agent spend?"
                  value={service}
                  options={serviceOptions}
                  onChange={(value) => {
                    setService(value);
                    setPreviewState("draft");
                  }}
                />
                <SelectField
                  label="Stop spending after"
                  value={expiry}
                  options={expiryOptions}
                  onChange={(value) => {
                    setExpiry(value);
                    setPreviewState("draft");
                  }}
                />
                <SelectField
                  label="When should it ask you?"
                  value={approval}
                  options={approvalOptions}
                  onChange={(value) => {
                    setApproval(value);
                    setPreviewState("draft");
                  }}
                />
              </div>
            </div>

            <div className="mt-7 rounded-2xl border border-white/[0.08] bg-black/25 p-4 sm:p-5" aria-live="polite">
              {previewState === "draft" ? (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex gap-3">
                    <ShieldCheck className="mt-0.5 h-5 w-5 flex-none text-emerald-300" aria-hidden />
                    <div>
                      <p className="text-sm font-semibold text-emerald-50">Ready to review</p>
                      <p className="mt-1 text-xs leading-relaxed text-white/45">
                        Prepare a plain-language summary of the authority you selected.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={createPreview}
                    disabled={!task.trim() || safeBudget === "0.00"}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-[#06241a] transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Review spending rules
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ) : (
                <div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex gap-3">
                      <span className={`grid h-9 w-9 flex-none place-items-center rounded-xl ${previewState === "paused" ? "bg-amber-300/10 text-amber-200" : "bg-emerald-400/10 text-emerald-300"}`}>
                        {previewState === "paused" ? <Pause className="h-4 w-4" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-emerald-50">
                          {previewState === "paused" ? "Spending paused" : "Your spending rules are ready"}
                        </p>
                        <p className="mt-1 text-xs text-white/40">No wallet was created and no transaction was signed.</p>
                      </div>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${previewState === "paused" ? "bg-amber-300/10 text-amber-200" : "bg-emerald-400/10 text-emerald-300"}`}>
                      {previewState === "paused" ? "PAUSED" : "READY"}
                    </span>
                  </div>

                  <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                    <SummaryItem term="Total limit" value={`$${safeBudget}`} />
                    <SummaryItem term="Approved scope" value={service} />
                    <SummaryItem term="Expiry" value={expiry} />
                    <SummaryItem term="Approval rule" value={approval} />
                  </dl>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewState((current) => current === "paused" ? "ready" : "paused")}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-emerald-50/70 transition hover:border-emerald-300/30 hover:text-white"
                    >
                      {previewState === "paused" ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <Pause className="h-3.5 w-3.5" aria-hidden />}
                      {previewState === "paused" ? "Resume simulation" : "Simulate pause"}
                    </button>
                    <button
                      type="button"
                      onClick={resetPreview}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/45 transition hover:border-white/20 hover:text-white/75"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                      Reset
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-24 mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <motion.div {...fade()} className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/75">How it works</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">One approval. Clear limits. Proof of every decision.</h2>
          <p className="mt-4 text-sm leading-relaxed text-emerald-50/60 sm:text-base">
            Inside the rules, your agent can keep moving. Outside them, the contract says no.
          </p>
        </motion.div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            ["01", Bot, "Ask", "Describe the result you want in ordinary language."],
            ["02", ShieldCheck, "Set limits", "Review budget, approved services, expiry, and exceptions."],
            ["03", Sparkles, "Let the agent keep moving", "Eligible payments can proceed without repeated wallet prompts."],
            ["04", ReceiptText, "Keep the receipts", "See what was paid, delivered, rejected, or paused."],
          ].map(([number, Icon, title, body]) => {
            const StepIcon = Icon as typeof Bot;
            return (
              <article key={String(number)} className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
                <span className="absolute right-4 top-3 text-4xl font-black text-white/[0.035]">{String(number)}</span>
                <StepIcon className="h-5 w-5 text-emerald-300" aria-hidden />
                <h3 className="mt-5 text-base font-semibold text-emerald-50">{String(title)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/45">{String(body)}</p>
              </article>
            );
          })}
        </div>

        <motion.div {...fade(0.08)} className="mt-12 grid overflow-hidden rounded-[2rem] border border-white/[0.09] bg-black/25 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="p-6 sm:p-8 lg:p-10">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-400/10 text-emerald-300">
              <LockKeyhole className="h-5 w-5" aria-hidden />
            </div>
            <h2 className="mt-5 text-2xl font-bold text-white">Your agent can act. It cannot rewrite the rules.</h2>
            <p className="mt-4 text-sm leading-relaxed text-emerald-50/60">
              The consumer signs a mandate defining the maximum amount, approved destination, asset, expiry, and
              designated agent. In ACKRATE&apos;s Stellar testnet implementation, MandateRegistry checks those terms before
              each supported payment.
            </p>
            <Link
              href="/ap2"
              className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-emerald-300 transition hover:text-emerald-200"
            >
              Inspect the mandate model
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

          <div className="border-t border-white/[0.08] bg-[#08110e] p-6 sm:p-8 lg:border-l lg:border-t-0 lg:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Illustrative policy decisions</p>
            <div className="mt-5 space-y-3">
              <DecisionRow label="Approved research source" detail="$3.00 · inside scope" allowed />
              <DecisionRow label="Second approved source" detail="$4.50 · inside remaining budget" allowed />
              <DecisionRow label="Unapproved travel merchant" detail="$275.00 · outside service scope" />
              <DecisionRow label="Repeated settlement proof" detail="Duplicate attempt" />
            </div>
          </div>
        </motion.div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 lg:px-8 lg:pb-24">
        <motion.div {...fade()} className="rounded-[2rem] border border-emerald-300/15 bg-gradient-to-br from-emerald-400/[0.11] via-[#07110e] to-cyan-400/[0.05] p-6 sm:p-9 lg:flex lg:items-center lg:justify-between lg:gap-10">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300/80">See it working</p>
            <h2 className="mt-3 text-2xl font-bold text-white sm:text-3xl">Watch a budgeted agent buy three resources—and get blocked on the fourth.</h2>
            <p className="mt-3 text-sm leading-relaxed text-emerald-50/60">
              The live research flow shows accepted payments, a contract-enforced budget limit, and explorer receipts
              on Stellar testnet.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3 lg:mt-0 lg:flex-none">
            <Link href="/express" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-[#06241a] transition hover:bg-emerald-300">
              See the live research demo
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link href="/solutions" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-emerald-50/75 transition hover:border-emerald-300/30 hover:text-white">
              Build with ACKRATE
            </Link>
          </div>
        </motion.div>
      </section>
    </main>
  );
}

function PreviewStat({ label, value, Icon }: { label: string; value: string; Icon: typeof Gauge }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3.5">
      <Icon className="h-4 w-4 text-emerald-300" aria-hidden />
      <p className="mt-3 text-[10px] uppercase tracking-[0.13em] text-white/30">{label}</p>
      <p className="mt-1 text-xs font-semibold text-emerald-50">{value}</p>
    </div>
  );
}

function FlowRow({ status, label, amount }: { status: "allowed" | "blocked"; label: string; amount: string }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className={`grid h-6 w-6 flex-none place-items-center rounded-full ${status === "allowed" ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300"}`}>
        {status === "allowed" ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1 break-words text-white/60">{label}</span>
      <span className="font-mono text-white/45">{amount}</span>
    </div>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-emerald-50/80">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="mt-2 w-full rounded-xl border border-white/10 bg-[#080d0c] px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-300/40 focus:ring-2 focus:ring-emerald-400/10"
      >
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function SummaryItem({ term, value }: { term: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3.5">
      <dt className="text-[10px] uppercase tracking-[0.13em] text-white/30">{term}</dt>
      <dd className="mt-1.5 text-xs font-semibold text-emerald-50">{value}</dd>
    </div>
  );
}

function DecisionRow({ label, detail, allowed = false }: { label: string; detail: string; allowed?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-black/20 p-3.5">
      <span className={`grid h-8 w-8 flex-none place-items-center rounded-lg ${allowed ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300"}`}>
        {allowed ? <Check className="h-4 w-4" aria-hidden /> : <X className="h-4 w-4" aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-emerald-50">{label}</p>
        <p className="mt-0.5 text-xs text-white/35">{detail}</p>
      </div>
      <span className={`text-[10px] font-semibold ${allowed ? "text-emerald-300" : "text-rose-300"}`}>
        {allowed ? "ALLOW" : "BLOCK"}
      </span>
    </div>
  );
}

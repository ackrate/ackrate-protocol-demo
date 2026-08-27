"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  Clock3,
  LockKeyhole,
  MapPin,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";

const examples = [
  {
    id: "gift",
    tab: "Birthday gift",
    task: "Find Maya a birthday gift",
    agent: "Shopping helper",
    budget: "$75 max",
    place: "Bookshop only",
    deadline: "Tonight, 8 PM",
    result: "Gift ordered",
    note: "Maya's gift is on its way. $28 stays unspent.",
  },
  {
    id: "lunch",
    tab: "Team lunch",
    task: "Book lunch for the team",
    agent: "Office helper",
    budget: "$180 max",
    place: "3 nearby restaurants",
    deadline: "Today, 12:30 PM",
    result: "Table booked",
    note: "Lunch is sorted. The permission ends after the booking.",
  },
  {
    id: "research",
    tab: "Research brief",
    task: "Find the sources I need",
    agent: "Research helper",
    budget: "$20 max",
    place: "Trusted sources only",
    deadline: "Next 30 minutes",
    result: "Brief ready",
    note: "The useful sources are ready. Nothing else was purchased.",
  },
] as const;

export default function HomePage() {
  const [activeId, setActiveId] = useState<(typeof examples)[number]["id"]>("gift");
  const active = examples.find((example) => example.id === activeId) ?? examples[0];

  return (
    <main className="relative overflow-hidden">
      <div className="glow" aria-hidden />

      <section className="relative mx-auto grid min-h-[calc(100svh-4rem)] w-full max-w-6xl items-center gap-12 px-5 py-16 sm:px-6 sm:py-20 lg:grid-cols-[0.88fr_1.12fr] lg:gap-16 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative z-10"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/[0.07] px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            Permission that ends with the job
          </div>
          <h1 className="mt-6 max-w-2xl text-5xl font-black tracking-[-0.05em] text-emerald-50 sm:text-6xl lg:text-7xl">
            Give an AI a job. <span className="text-emerald-300">Keep the final say.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-emerald-100/65 sm:text-xl sm:leading-9">
            Set the budget, choose where it can act, then let it get on with it. Ackrate makes sure the agent cannot go beyond what you allowed.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="#how-it-works"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-300 px-6 py-3 text-sm font-black text-[#06241a] shadow-[0_12px_38px_-10px_rgba(52,211,153,0.75)] transition hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
            >
              See how it feels
              <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
            <Link
              href="/express"
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-emerald-300/20 bg-black/20 px-5 py-3 text-sm font-semibold text-emerald-100/75 transition hover:border-emerald-300/40 hover:text-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
            >
              See the live demo
            </Link>
          </div>
          <p className="mt-5 flex items-center gap-2 text-sm text-emerald-100/45">
            <LockKeyhole className="h-4 w-4 text-emerald-300/70" aria-hidden />
            Your passwords and payment methods stay yours.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 22 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.55, ease: "easeOut" }}
          className="relative"
          aria-label="Examples of a small, task-specific permission"
        >
          <div className="pointer-events-none absolute -inset-12 bg-[radial-gradient(circle,rgba(52,211,153,0.16),transparent_66%)] blur-2xl" aria-hidden />
          <div className="relative overflow-hidden rounded-[2rem] border border-emerald-300/20 bg-[#07110e]/95 p-4 shadow-[0_32px_110px_-42px_rgba(16,185,129,0.72)] sm:p-6">
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Choose an everyday example">
              {examples.map((example) => (
                <button
                  key={example.id}
                  type="button"
                  role="tab"
                  aria-selected={active.id === example.id}
                  onClick={() => setActiveId(example.id)}
                  className={`relative shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                    active.id === example.id ? "text-[#06241a]" : "text-emerald-100/45 hover:text-emerald-100/75"
                  }`}
                >
                  {active.id === example.id && (
                    <motion.span
                      layoutId="example-tab"
                      className="absolute inset-0 rounded-full bg-emerald-300"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  )}
                  <span className="relative z-10">{example.tab}</span>
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={active.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22 }}
                className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-5 sm:p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300/60">Your request</p>
                    <h2 className="mt-2 text-2xl font-black tracking-tight text-emerald-50 sm:text-3xl">{active.task}</h2>
                    <p className="mt-1 text-sm text-emerald-100/45">Handled by your {active.agent.toLowerCase()}</p>
                  </div>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-400/10 text-emerald-300">
                    <Sparkles className="h-5 w-5" aria-hidden />
                  </span>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <Permission icon={WalletCards} label="Spend" value={active.budget} />
                  <Permission icon={MapPin} label="Where" value={active.place} />
                  <Permission icon={Clock3} label="Until" value={active.deadline} />
                </div>

                <div className="mt-5 rounded-2xl border border-emerald-300/20 bg-emerald-400/[0.07] p-4">
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-300 text-[#06241a]">
                      <Check className="h-4 w-4" aria-hidden />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-emerald-100">{active.result}</p>
                      <p className="mt-0.5 text-xs leading-5 text-emerald-100/50">{active.note}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 px-1 text-xs text-emerald-100/40">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-300/70" aria-hidden />
                  Anything outside these rules stays out of reach.
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      </section>

      <section id="how-it-works" className="relative mx-auto w-full max-w-6xl scroll-mt-24 px-5 py-20 sm:px-6 lg:px-8 lg:py-28">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-3xl text-center"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300/65">Enough freedom to be useful</p>
          <h2 className="mt-4 text-4xl font-black tracking-[-0.04em] text-emerald-50 sm:text-5xl">Set the edges. Let it work.</h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-emerald-100/55 sm:text-lg">
            You choose the job and the limit. Ackrate holds that line while the agent handles the rest.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ delay: 0.08, duration: 0.5 }}
          className="mt-12 grid gap-3 rounded-[2rem] border border-emerald-300/15 bg-[#07110e]/80 p-4 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-stretch sm:p-6"
        >
          <FlowStep number="1" title="Name the job" copy="One clear request, in your words." />
          <FlowArrow />
          <FlowStep number="2" title="Choose the limit" copy="A small permission that fits the job." featured />
          <FlowArrow />
          <FlowStep number="3" title="Get the result" copy="The agent works. Your rules stay put." />
        </motion.div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-6 lg:px-8 lg:pb-28">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-[2rem] border border-emerald-300/20 bg-gradient-to-br from-emerald-400/[0.12] via-[#07110e] to-[#07110e] px-6 py-10 sm:px-10 sm:py-12 lg:flex lg:items-center lg:justify-between lg:gap-12"
        >
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" aria-hidden />
          <div className="relative max-w-2xl">
            <h2 className="text-3xl font-black tracking-[-0.035em] text-emerald-50 sm:text-4xl">Your agent gets room to help. You keep the keys.</h2>
            <p className="mt-4 text-base leading-7 text-emerald-100/55">
              When the job is over, the permission is over too. See the payment flow in action, or open the technical guide when you want the details.
            </p>
          </div>
          <div className="relative mt-7 flex flex-col gap-3 sm:flex-row lg:mt-0 lg:shrink-0">
            <Link href="/express" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-300 px-5 py-3 text-sm font-black text-[#06241a] transition hover:bg-emerald-200">
              Open the live demo
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link href="/docs" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-emerald-300/20 px-5 py-3 text-sm font-semibold text-emerald-100/75 transition hover:border-emerald-300/40 hover:text-emerald-100">
              Read the docs
            </Link>
          </div>
        </motion.div>
      </section>
    </main>
  );
}

function Permission({ icon: Icon, label, value }: { icon: typeof WalletCards; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3.5">
      <Icon className="h-4 w-4 text-emerald-300/70" aria-hidden />
      <p className="mt-3 text-[9px] font-bold uppercase tracking-[0.15em] text-emerald-100/30">{label}</p>
      <p className="mt-1 text-xs font-bold leading-5 text-emerald-100/80">{value}</p>
    </div>
  );
}

function FlowStep({ number, title, copy, featured = false }: { number: string; title: string; copy: string; featured?: boolean }) {
  return (
    <div className={`rounded-2xl p-5 sm:p-6 ${featured ? "border border-emerald-300/20 bg-emerald-400/[0.08]" : "border border-white/[0.07] bg-black/15"}`}>
      <span className="font-mono text-[10px] text-emerald-300/55">{number.padStart(2, "0")}</span>
      <h3 className="mt-5 text-lg font-bold text-emerald-100">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-emerald-100/45">{copy}</p>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="grid place-items-center py-1 text-emerald-300/30 sm:px-1 sm:py-0" aria-hidden>
      <ArrowRight className="h-5 w-5 rotate-90 sm:rotate-0" />
    </div>
  );
}

"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowDown,
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  KeyRound,
  MapPin,
  ShieldCheck,
  Sparkles,
  WalletCards,
  X,
} from "lucide-react";

const permissionFacts = [
  { value: "1", label: "clear job" },
  { value: "$75", label: "spending ceiling" },
  { value: "1", label: "approved shop" },
  { value: "8 PM", label: "permission ends" },
] as const;

const freedoms = [
  { icon: WalletCards, title: "Only this much", copy: "Give the job a ceiling—not the agent your whole wallet." },
  { icon: MapPin, title: "Only in the right places", copy: "Choose the shops, services, and resources that are in bounds." },
  { icon: Clock3, title: "Only for as long as needed", copy: "When the job is over, the permission is over too." },
  { icon: KeyRound, title: "No keys handed over", copy: "Credentials and payment methods stay out of the agent's hands." },
  { icon: ShieldCheck, title: "Rules that stay put", copy: "The boundary is enforced independently of the agent itself." },
] as const;

const faqs = [
  {
    question: "What is Ackrate in plain English?",
    answer: "Ackrate lets you give an AI agent a small, temporary permission for one job instead of giving it broad access to your money, accounts, or credentials.",
  },
  {
    question: "What can I limit?",
    answer: "You can limit how much an agent can spend, where it can act, what it can access, how long the authority lasts, and whether it can pass any of that authority to another agent.",
  },
  {
    question: "Does the agent enforce its own rules?",
    answer: "No. Ackrate checks the permission independently, so an agent cannot simply decide to ignore the boundary it was given.",
  },
  {
    question: "Where can I see the technical details?",
    answer: "The live Express walkthrough shows the full payment flow, while the docs cover the protocol, packages, and integration details.",
  },
] as const;

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.55, ease: "easeOut" as const },
};

export default function HomePage() {
  return (
    <main className="ackrate-home relative overflow-hidden bg-[#f4f2ec] text-[#151914]">
      <section className="relative border-b border-[#151914]/15">
        <div className="home-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto grid min-h-[calc(100svh-4rem)] w-full max-w-[82rem] items-center gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.04fr_0.96fr] lg:gap-20 lg:px-10 lg:py-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            className="relative z-10"
          >
            <p className="home-kicker">Delegation for autonomous agents</p>
            <h1 className="home-display mt-6 max-w-4xl text-[clamp(3.2rem,7vw,7rem)] leading-[0.89] tracking-[-0.055em]">
              Ackrate is building the <em>delegation and enforcement layer for autonomous agents.</em>
            </h1>
            <p className="mt-8 max-w-2xl text-lg leading-8 text-[#283128]/70 sm:text-xl sm:leading-9">
              Give an agent the job—not the keys to everything. Set the boundary once, then let it get on with the work.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a href="#one-job" className="home-button home-button-dark">
                See how it works
                <ArrowDown className="h-4 w-4" aria-hidden />
              </a>
              <Link href="/express" className="home-button home-button-light">
                Try the live flow
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.62, ease: "easeOut" }}
            className="relative mx-auto w-full max-w-[34rem] py-6"
            aria-label="A task-specific permission for a birthday gift"
          >
            <div className="permission-orbit relative mx-auto aspect-square w-full max-w-[31rem] rounded-full border border-[#157a4b]/30 bg-[#e7f1e6]">
              <div className="absolute inset-[13%] rounded-full border border-dashed border-[#157a4b]/45" aria-hidden />
              <div className="absolute inset-[29%] grid place-items-center rounded-full bg-[#123d2c] text-center text-white shadow-[0_30px_80px_-28px_rgba(18,61,44,0.7)]">
                <div>
                  <Sparkles className="mx-auto h-6 w-6 text-[#b9f36a]" aria-hidden />
                  <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white/55">Agent&apos;s job</p>
                  <p className="mt-2 px-4 text-base font-bold leading-5 sm:text-lg">Find Maya a birthday gift</p>
                </div>
              </div>
              <OrbitChip className="left-[4%] top-[17%]" icon={WalletCards} label="$75 max" />
              <OrbitChip className="right-[-2%] top-[31%]" icon={MapPin} label="Bookshop" />
              <OrbitChip className="bottom-[15%] left-[12%]" icon={Clock3} label="Until 8 PM" />
              <div className="absolute bottom-[6%] right-[3%] rounded-full border border-[#151914]/15 bg-[#f4f2ec] px-3 py-2 text-xs font-bold text-[#151914]/45 line-through decoration-[#b44632] decoration-2">
                Your whole wallet
              </div>
              <div className="absolute right-[1%] top-[5%] grid h-14 w-14 place-items-center rounded-full bg-[#b9f36a] text-[#123d2c] shadow-lg sm:h-16 sm:w-16">
                <ShieldCheck className="h-6 w-6" aria-hidden />
              </div>
            </div>
            <p className="mx-auto mt-5 max-w-sm text-center text-sm leading-6 text-[#283128]/55">
              A useful amount of freedom, wrapped in a boundary the agent cannot move.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="border-b border-[#151914]/15 bg-[#123d2c] text-white" aria-label="One task-specific permission">
        <div className="mx-auto grid w-full max-w-[82rem] grid-cols-2 px-5 sm:px-8 lg:grid-cols-4 lg:px-10">
          {permissionFacts.map((fact, index) => (
            <motion.div
              key={fact.label}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: index * 0.04 }}
              className={`py-8 sm:py-10 ${index % 2 ? "border-l" : ""} ${index > 1 ? "border-t lg:border-t-0" : ""} ${index > 0 ? "lg:border-l" : ""} border-white/15 px-4 sm:px-6`}
            >
              <p className="home-display text-4xl tracking-[-0.04em] text-[#b9f36a] sm:text-5xl">{fact.value}</p>
              <p className="mt-2 text-xs font-bold uppercase tracking-[0.16em] text-white/55">{fact.label}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section id="one-job" className="scroll-mt-20 border-b border-[#151914]/15">
        <div className="mx-auto w-full max-w-[82rem] px-5 py-20 sm:px-8 sm:py-28 lg:px-10 lg:py-32">
          <motion.div {...fadeUp} className="grid items-end gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
            <div>
              <p className="home-kicker">One clear instruction</p>
              <h2 className="home-display mt-5 text-5xl leading-[0.96] tracking-[-0.045em] sm:text-6xl">Say what the agent may do.</h2>
            </div>
            <p className="max-w-xl text-lg leading-8 text-[#283128]/65 lg:justify-self-end">
              One job. A few clear edges. A result you can understand without learning how the machinery works.
            </p>
          </motion.div>

          <motion.div {...fadeUp} className="mt-12 overflow-hidden rounded-[2rem] border border-[#151914]/20 bg-white shadow-[0_28px_80px_-48px_rgba(18,61,44,0.55)]">
            <div className="grid lg:grid-cols-[1.18fr_0.82fr]">
              <div className="p-6 sm:p-10 lg:p-12">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#157a4b]">You ask</p>
                <blockquote className="home-display mt-6 max-w-3xl text-4xl leading-[1.05] tracking-[-0.035em] sm:text-5xl">
                  “Find Maya a birthday gift. Spend up to $75 at the bookshop before 8 PM.”
                </blockquote>
              </div>
              <div className="flex items-center border-t border-[#151914]/15 bg-[#e7f1e6] p-6 sm:p-10 lg:border-l lg:border-t-0 lg:p-12">
                <div>
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-[#157a4b] text-white"><Check className="h-5 w-5" aria-hidden /></span>
                  <p className="mt-6 text-2xl font-black tracking-tight">Gift ordered.</p>
                  <p className="mt-2 text-base leading-7 text-[#283128]/65">$28 stayed unspent. The permission is now closed.</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="border-b border-[#151914]/15 bg-[#fffdf8]">
        <div className="mx-auto grid w-full max-w-[82rem] gap-10 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20 lg:px-10 lg:py-32">
          <motion.p {...fadeUp} className="home-kicker lg:pt-3">Why Ackrate</motion.p>
          <motion.div {...fadeUp}>
            <h2 className="home-display max-w-4xl text-5xl leading-[0.98] tracking-[-0.045em] sm:text-6xl lg:text-7xl">Capable agents should not need <em>unlimited access.</em></h2>
            <p className="mt-8 max-w-3xl text-lg leading-8 text-[#283128]/68 sm:text-xl sm:leading-9">
              <strong className="font-semibold text-[#151914]">AI agents are becoming capable of spending money</strong>, buying services, calling paid APIs, and coordinating with other agents.
            </p>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-[#283128]/68 sm:text-xl sm:leading-9">The answer is not a bigger set of keys. It is a smaller permission that matches the job.</p>
          </motion.div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-20 border-b border-[#151914]/15">
        <div className="mx-auto grid w-full max-w-[82rem] items-center gap-14 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[0.92fr_1.08fr] lg:gap-20 lg:px-10 lg:py-32">
          <motion.div {...fadeUp}>
            <p className="home-kicker">Independent by design</p>
            <h2 className="home-display mt-5 text-5xl leading-[0.96] tracking-[-0.045em] sm:text-6xl lg:text-7xl">You draw the line. Ackrate holds it.</h2>
            <p className="mt-7 max-w-xl text-lg leading-8 text-[#283128]/68">Those constraints are enforced independently of the agent itself. The agent gets enough authority to help—and no more.</p>
          </motion.div>

          <motion.div {...fadeUp} className="rounded-[2rem] border border-[#151914]/20 bg-[#e7f1e6] p-5 sm:p-8">
            <div className="space-y-3">
              <EnforcementRow number="01" title="You decide" copy="The job, budget, place, and deadline." />
              <div className="grid place-items-center text-[#157a4b]" aria-hidden><ArrowDown className="h-5 w-5" /></div>
              <EnforcementRow number="02" title="Ackrate checks" copy="Every action is tested against that permission." featured />
              <div className="grid place-items-center text-[#157a4b]" aria-hidden><ArrowDown className="h-5 w-5" /></div>
              <EnforcementRow number="03" title="The agent acts" copy="Allowed work continues. Everything else stops." />
            </div>
          </motion.div>
        </div>
      </section>

      <section className="border-b border-[#151914]/15 bg-[#123d2c] text-white">
        <div className="mx-auto w-full max-w-[82rem] px-5 py-20 sm:px-8 sm:py-28 lg:px-10 lg:py-32">
          <motion.div {...fadeUp} className="max-w-5xl">
            <p className="home-kicker !text-[#b9f36a]">Useful freedom</p>
            <h2 className="home-display mt-5 text-5xl leading-[0.96] tracking-[-0.045em] sm:text-6xl lg:text-7xl">Every permission has an edge.</h2>
          </motion.div>
          <div className="mt-12 grid border-l border-t border-white/20 sm:grid-cols-2 lg:grid-cols-6">
            {freedoms.map((item, index) => (
              <motion.article
                key={item.title}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: index * 0.04 }}
                className={`border-b border-r border-white/20 p-6 sm:p-8 ${index < 2 ? "lg:col-span-3" : "lg:col-span-2"}`}
              >
                <item.icon className="h-6 w-6 text-[#b9f36a]" aria-hidden />
                <h3 className="mt-12 text-xl font-black tracking-tight sm:text-2xl">{item.title}</h3>
                <p className="mt-3 max-w-sm text-sm leading-6 text-white/60 sm:text-base sm:leading-7">{item.copy}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-[#151914]/15 bg-[#fffdf8]">
        <div className="mx-auto w-full max-w-[82rem] px-5 py-20 sm:px-8 sm:py-28 lg:px-10 lg:py-32">
          <motion.div {...fadeUp} className="max-w-5xl">
            <p className="home-kicker">A better handoff</p>
            <h2 className="home-display mt-5 text-5xl leading-[0.96] tracking-[-0.045em] sm:text-6xl lg:text-7xl">Stop handing over the master key.</h2>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[#283128]/65">Broad access makes a small task carry a very large risk. A bounded permission keeps the authority proportional to the work.</p>
          </motion.div>

          <motion.div {...fadeUp} className="mt-12 grid overflow-hidden rounded-[2rem] border border-[#151914]/20 lg:grid-cols-2">
            <ComparisonColumn
              eyebrow="The old way"
              tone="old"
              items={[
                ["Share a wallet or credential", "The agent receives more power than the job needs."],
                ["Ask the agent to behave", "The same system acting is expected to police itself."],
                ["Clean up access later", "Long-lived keys and approvals are easy to forget."],
              ]}
            />
            <ComparisonColumn
              eyebrow="With Ackrate"
              tone="new"
              items={[
                ["Name the job", "Authority begins with a specific outcome."],
                ["Draw the boundary", "Amount, place, resources, time, and delegation are explicit."],
                ["Let enforcement hold it", "The agent works; the permission stays put."],
              ]}
            />
          </motion.div>
        </div>
      </section>

      <section className="border-b border-[#151914]/15 bg-[#b9f36a]">
        <motion.div {...fadeUp} className="mx-auto flex w-full max-w-[82rem] flex-col gap-10 px-5 py-20 sm:px-8 sm:py-24 lg:flex-row lg:items-end lg:justify-between lg:gap-20 lg:px-10 lg:py-28">
          <div className="max-w-4xl">
            <p className="home-kicker">Give it room to help</p>
            <h2 className="home-display mt-5 text-5xl leading-[0.93] tracking-[-0.05em] sm:text-6xl lg:text-8xl">Give the agent a job. <em>Keep the keys.</em></h2>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col">
            <Link href="/express" className="home-button home-button-dark">Open the live demo <ArrowRight className="h-4 w-4" aria-hidden /></Link>
            <Link href="/docs" className="home-button border border-[#151914]/25 bg-transparent text-[#151914] hover:bg-white/40">Read the details</Link>
          </div>
        </motion.div>
      </section>

      <section className="bg-[#f4f2ec]">
        <div className="mx-auto grid w-full max-w-[82rem] gap-10 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[0.65fr_1.35fr] lg:gap-20 lg:px-10 lg:py-32">
          <motion.div {...fadeUp}>
            <p className="home-kicker">Questions</p>
            <h2 className="home-display mt-5 text-5xl tracking-[-0.045em] sm:text-6xl">The short version.</h2>
          </motion.div>
          <motion.div {...fadeUp} className="border-t border-[#151914]/20">
            {faqs.map((faq) => (
              <details key={faq.question} className="group border-b border-[#151914]/20 py-1">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-lg font-black tracking-tight sm:text-xl">
                  {faq.question}
                  <ChevronDown className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <p className="max-w-2xl pb-7 pr-8 text-base leading-7 text-[#283128]/65">{faq.answer}</p>
              </details>
            ))}
          </motion.div>
        </div>
      </section>
    </main>
  );
}

function OrbitChip({ className, icon: Icon, label }: { className: string; icon: typeof WalletCards; label: string }) {
  return (
    <div className={`absolute flex items-center gap-2 rounded-full border border-[#151914]/15 bg-[#fffdf8] px-3 py-2 text-xs font-black shadow-[0_12px_30px_-18px_rgba(21,25,20,0.5)] sm:px-4 sm:py-2.5 sm:text-sm ${className}`}>
      <Icon className="h-4 w-4 text-[#157a4b]" aria-hidden />
      {label}
    </div>
  );
}

function EnforcementRow({ number, title, copy, featured = false }: { number: string; title: string; copy: string; featured?: boolean }) {
  return (
    <div className={`grid grid-cols-[auto_1fr] items-center gap-4 rounded-2xl border p-5 sm:gap-6 sm:p-6 ${featured ? "border-[#157a4b] bg-[#123d2c] text-white shadow-xl" : "border-[#151914]/15 bg-[#fffdf8]"}`}>
      <span className={`home-display text-3xl ${featured ? "text-[#b9f36a]" : "text-[#157a4b]"}`}>{number}</span>
      <div>
        <h3 className="text-lg font-black tracking-tight">{title}</h3>
        <p className={`mt-1 text-sm leading-6 ${featured ? "text-white/60" : "text-[#283128]/60"}`}>{copy}</p>
      </div>
    </div>
  );
}

function ComparisonColumn({ eyebrow, tone, items }: { eyebrow: string; tone: "old" | "new"; items: readonly (readonly [string, string])[] }) {
  const fresh = tone === "new";
  return (
    <div className={`${fresh ? "bg-[#e7f1e6]" : "bg-[#eeeae2]"} p-6 sm:p-10 lg:p-12 ${fresh ? "border-t border-[#151914]/20 lg:border-l lg:border-t-0" : ""}`}>
      <p className={`text-xs font-black uppercase tracking-[0.18em] ${fresh ? "text-[#157a4b]" : "text-[#8a473a]"}`}>{eyebrow}</p>
      <div className="mt-8 space-y-8">
        {items.map(([title, copy]) => (
          <div key={title} className="grid grid-cols-[auto_1fr] gap-4">
            <span className={`mt-0.5 grid h-7 w-7 place-items-center rounded-full ${fresh ? "bg-[#157a4b] text-white" : "border border-[#8a473a]/30 text-[#8a473a]"}`}>
              {fresh ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
            </span>
            <div>
              <h3 className="text-lg font-black tracking-tight">{title}</h3>
              <p className="mt-1 text-sm leading-6 text-[#283128]/62 sm:text-base sm:leading-7">{copy}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

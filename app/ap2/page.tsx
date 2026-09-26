"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Fingerprint,
  Gauge,
  KeyRound,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Store,
  UserRoundCheck,
  XCircle,
} from "lucide-react";

type Scenario = "all" | "valid" | "signature" | "merchant" | "amount" | "expiry" | "replay";
type CheckResult = {
  id: Exclude<Scenario, "all">;
  label: string;
  passed: boolean;
  code: string;
  detail: string;
};
type ValidatorResponse = {
  ok: boolean;
  scenario: Scenario;
  package: string;
  mandateHash: string;
  signatureAlgorithm: string;
  user: string;
  merchant: string;
  durationMs: number;
  results: CheckResult[];
};

const OPTIONS: Array<{
  id: Scenario;
  label: string;
  detail: string;
  Icon: typeof ShieldCheck;
}> = [
  { id: "all", label: "Run all checks", detail: "Valid + five rejection paths", Icon: ShieldCheck },
  { id: "valid", label: "Valid mandate", detail: "Expected to be accepted", Icon: UserRoundCheck },
  { id: "signature", label: "Tampered signature", detail: "Expected INVALID_SIGNATURE", Icon: KeyRound },
  { id: "merchant", label: "Wrong merchant", detail: "Expected MERCHANT_MISMATCH", Icon: Fingerprint },
  { id: "amount", label: "Overspend", detail: "Expected AMOUNT_EXCEEDS_MANDATE", Icon: Gauge },
  { id: "expiry", label: "Expired mandate", detail: "Expected EXPIRED", Icon: Clock3 },
  { id: "replay", label: "Replayed hash", detail: "Expected REPLAYED", Icon: RefreshCw },
];

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: "easeOut" as const },
});

const short = (value: string, lead = 10, tail = 8) =>
  value ? value.slice(0, lead) + "…" + value.slice(-tail) : "—";

export default function Ap2Page() {
  const [scenario, setScenario] = useState<Scenario>("all");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ValidatorResponse | null>(null);
  const [error, setError] = useState("");

  async function runValidator() {
    if (running) return;
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/ap2", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario }),
      });
      const body = await response.json() as ValidatorResponse | { error?: string };
      if (!response.ok || !("results" in body)) {
        throw new Error("error" in body && body.error ? body.error : "Validator returned HTTP " + response.status);
      }
      setResult(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The validator request failed.");
    } finally {
      setRunning(false);
    }
  }

  const selected = OPTIONS.find((option) => option.id === scenario) ?? OPTIONS[0]!;

  return (
    <main className="relative mx-auto w-full max-w-6xl px-4 py-8 sm:px-5">
      <div className="glow" aria-hidden />

      <motion.header {...fade()} className="pt-6">
        <div className="inline-flex items-center gap-2 rounded-full glass px-3.5 py-1.5 text-xs font-semibold tracking-[0.18em] text-[var(--muted)]">
          <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 " />
          AP2 V0.1 · SIGNED ACKRATE PROFILE · PUBLIC NPM RELEASE
        </div>
        <h1 className="mt-5 max-w-4xl text-4xl font-black leading-[1.03] tracking-tight sm:text-6xl">
          Validate the mandate{" "}
          <span className="bg-gradient-to-r from-neutral-300 via-neutral-200 to-neutral-400 bg-clip-text text-transparent drop-">
            before the contract.
          </span>
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-relaxed text-[var(--muted)] sm:text-lg">
          Run the published <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-sm text-neutral-100">@ackrate/ap2</code>{" "}
          validator against a fresh signed mandate. The server returns only public keys and hashes; ephemeral signing
          keys never leave the request.
        </p>
      </motion.header>

      <section className="mt-9 grid gap-6 lg:grid-cols-[0.82fr_1.18fr]">
        <motion.div {...fade(0.06)} className="glass rounded-2xl p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.17em] text-[var(--muted)]">Choose a check</div>
              <h2 className="mt-2 text-xl font-bold text-white">AP2 validation console</h2>
            </div>
            <div className="rounded-full border border-neutral-300/20 bg-neutral-400/10 px-3 py-1 font-mono text-xs text-neutral-200">
              0.4.0
            </div>
          </div>

          <div className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1">
            {OPTIONS.map(({ id, label, detail, Icon }) => {
              const active = scenario === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setScenario(id);
                    setResult(null);
                    setError("");
                  }}
                  className={"flex min-w-0 items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition " + (
                    active
                      ? "border-neutral-300/35 bg-neutral-400/12 "
                      : "border-white/10 bg-black/20 hover:border-neutral-300/25 hover:bg-neutral-400/[0.06]"
                  )}
                >
                  <span className={"grid h-9 w-9 flex-none place-items-center rounded-lg " + (active ? "bg-neutral-400 text-[var(--on-strong)]" : "bg-white/[0.05] text-[var(--muted)]")}>
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-neutral-50">{label}</span>
                    <span className="mt-0.5 block truncate font-mono text-xs text-[var(--muted)]">{detail}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={runValidator}
            disabled={running}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl demo-primary px-5 py-3 text-sm font-bold text-[var(--on-strong)]  transition disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
            {running ? "Validating…" : selected.label}
          </button>

          <div className="mt-4 flex gap-2.5 rounded-xl border border-white/8 bg-black/20 p-3 text-xs leading-relaxed text-[var(--muted)]">
            <Store className="mt-0.5 h-4 w-4 flex-none text-[var(--muted)]" aria-hidden />
            Each run uses a fresh one-process replay store. Production integrations replace it with durable atomic storage.
          </div>
        </motion.div>

        <motion.section {...fade(0.1)} className="overflow-hidden rounded-2xl border border-neutral-300/15 bg-black/35 ">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-400/10 px-5 py-4">
            <div>
              <div className="flex items-center gap-2 font-mono text-sm text-neutral-200">
                <ShieldCheck className="h-4 w-4" aria-hidden />
                validator output
              </div>
              <div className="mt-1 text-xs text-[var(--muted)]">Server-side package validation.</div>
            </div>
            <div className={"rounded-full border px-3 py-1 font-mono text-xs " + (
              running
                ? "border-amber-300/25 bg-amber-300/10 text-amber-200"
                : result?.ok
                  ? "border-neutral-300/25 bg-neutral-400/10 text-neutral-200"
                  : error || result
                    ? "border-rose-300/25 bg-rose-400/10 text-rose-200"
                    : "border-white/10 bg-white/[0.03] text-white/45"
            )}>
              {running ? "running" : result?.ok ? "all expected" : error || result ? "attention" : "ready"}
            </div>
          </div>

          <div className="min-h-[420px] p-4 sm:p-5">
            {!running && !result && !error && (
              <div className="grid min-h-[370px] place-items-center rounded-xl border border-dashed border-neutral-300/15 bg-neutral-400/[0.025] p-8 text-center">
                <div>
                  <ShieldCheck className="mx-auto h-10 w-10 text-[var(--muted)]" aria-hidden />
                  <div className="mt-4 text-base font-semibold text-neutral-50">Ready to validate</div>
                  <p className="mt-2 max-w-sm text-sm leading-relaxed text-[var(--muted)]">
                    Select one boundary or run the complete visual suite. Every rejection must return its exact typed code.
                  </p>
                </div>
              </div>
            )}

            {running && (
              <div className="grid min-h-[370px] place-items-center text-center">
                <div>
                  <Loader2 className="mx-auto h-9 w-9 animate-spin text-neutral-300" aria-hidden />
                  <div className="mt-4 font-mono text-sm text-neutral-100">sign → bind → verify → consume</div>
                  <div className="mt-2 text-xs text-[var(--muted)]">Running {selected.label.toLowerCase()}…</div>
                </div>
              </div>
            )}

            {error && !running && (
              <div className="rounded-xl border border-rose-300/20 bg-rose-400/[0.06] p-4 text-sm text-rose-100">
                <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" aria-hidden />Validator request failed</div>
                <p className="mt-2 text-rose-100/70">{error}</p>
              </div>
            )}

            <AnimatePresence mode="wait">
              {result && !running && (
                <motion.div
                  key={result.mandateHash + ":" + result.scenario}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="space-y-3"
                >
                  {result.results.map((check, index) => (
                    <motion.div
                      key={check.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className={"rounded-xl border p-3.5 " + (check.passed ? "border-neutral-300/15 bg-neutral-400/[0.055]" : "border-rose-300/20 bg-rose-400/[0.06]")}
                    >
                      <div className="flex items-start gap-3">
                        {check.passed
                          ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-neutral-300" aria-hidden />
                          : <XCircle className="mt-0.5 h-4 w-4 flex-none text-rose-300" aria-hidden />}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-neutral-50">{check.label}</span>
                            <code className={"rounded px-2 py-0.5 text-xs " + (check.passed ? "bg-neutral-400/10 text-neutral-200" : "bg-rose-400/10 text-rose-200")}>{check.code}</code>
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{check.detail}</p>
                        </div>
                      </div>
                    </motion.div>
                  ))}

                  <div className="grid gap-2.5 pt-1 sm:grid-cols-2">
                    {[
                      ["mandate hash", short(result.mandateHash)],
                      ["signature", result.signatureAlgorithm],
                      ["user", short(result.user)],
                      ["merchant", short(result.merchant)],
                      ["package", result.package],
                      ["runtime", result.durationMs + " ms"],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg border border-white/8 bg-black/20 px-3 py-2.5">
                        <div className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">{label}</div>
                        <div className="mt-1.5 truncate font-mono text-xs text-[var(--muted)]" title={value}>{value}</div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.section>
      </section>

      <p className="mt-6 text-sm text-[var(--muted)]">
        <a className="underline underline-offset-4" href="https://github.com/ackrate/ackrate-protocol/tree/main/packages/ap2">Source and full test suite</a>
        {" · "}<a className="underline underline-offset-4" href="https://www.npmjs.com/package/@ackrate/ap2/v/0.4.0">@ackrate/ap2 0.4.0</a>
      </p>

      <motion.div {...fade(0.22)} className="mt-6 flex gap-3 rounded-xl border border-neutral-300/12 bg-neutral-400/[0.035] p-4 text-sm leading-relaxed text-[var(--muted)]">
        <ShieldCheck className="mt-0.5 h-5 w-5 flex-none text-[var(--muted)]" aria-hidden />
        <p>
          Admission replay is consumed once here. Multi-purchase budget and payment replay remain atomically enforced by{" "}
          <code className="font-mono text-[var(--muted)]">MandateRegistry.execute_payment</code> on every spend.
        </p>
      </motion.div>
    </main>
  );
}

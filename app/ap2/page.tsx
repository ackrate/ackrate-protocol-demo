"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
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
  testCount: number;
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

const TEST_GROUPS = [
  {
    title: "Binding & canonicalization",
    start: 1,
    tests: [
      "canonical JSON is independent of object key insertion order",
      "binds the supported AP2 v0.1.0 intent to a 32-byte ACKRATE vc_hash",
      "pins a canonical AP2 hash vector",
      "provided nonce makes the full binding reproducible across key order",
      "secure default nonces keep identical intents distinct",
      "fails closed for AP2 constraints MandateRegistry cannot enforce",
      "rejects ambiguous expiry and invalid Stellar authorization",
      "fails closed on unknown intent and Stellar authorization fields",
      "rejects impossible calendar expiries instead of normalizing them",
      "signer and validator share the same canonical UTC year range",
      "signer and validator share the same decimal range",
      "agent authorization requires an Ed25519 G-address",
    ],
  },
  {
    title: "Credential, signature & identity",
    start: 13,
    lastNumber: 59,
    tests: [
      "valid signed AP2 mandate succeeds",
      "returned mandate hash equals the recomputed ACKRATE id",
      "fixed seed and nonce produce a deterministic signature digest and signature",
      "exact signed maximum amount succeeds",
      "one-stroop positive amount succeeds",
      "signing key must match the payload user",
      "trusted expected user mismatch is rejected",
      "tampered natural-language intent is rejected by binding",
      "tampered merchant is rejected by binding",
      "tampered maximum amount is rejected by binding",
      "tampered decimals are rejected by the full-payload signature",
      "tampered expiry is rejected by binding",
      "tampered agent is rejected by binding",
      "tampered asset is rejected before signature verification",
      "malformed base64 signature is rejected",
      "non-canonical base64 signature is rejected",
      "signature with the wrong decoded length is rejected",
      "signature created by another Ed25519 key is rejected",
      "unsupported signature algorithm is rejected",
      "unsupported credential version is rejected",
      "unsupported AP2 version is rejected",
      "unsupported ACKRATE binding version is rejected",
      "wrong AP2 data key is rejected",
      "envelope mandate hash mismatch is rejected",
      "unknown top-level credential field fails closed",
      "unknown intent field fails closed",
      "invalid user, agent, and asset identities fail closed",
    ],
  },
  {
    title: "Scope & amount",
    start: 39,
    tests: [
      "trusted merchant outside signed scope is rejected",
      "zero amount is rejected",
      "negative amount is rejected",
      "scientific-notation amount is rejected",
      "excess fractional precision is rejected",
      "one stroop over the signed maximum is rejected as overspend",
      "amount beyond contract i128 is rejected",
    ],
  },
  {
    title: "Expiry & trusted clock",
    start: 46,
    tests: [
      "expired signed mandate is rejected",
      "expiry exactly equal to the trusted clock is rejected",
      "future expiry succeeds under the injected clock",
      "impossible calendar expiry fails closed",
    ],
  },
  {
    title: "Replay & storage isolation",
    start: 50,
    tests: [
      "replayed mandate hash is rejected on second admission",
      "100 concurrent admissions yield exactly one success",
      "replay store exception fails closed",
      "unsupported replay store result fails closed",
      "bad signature does not poison the replay store",
      "wrong merchant does not poison the replay store",
      "overspend does not poison the replay store",
      "expired credential does not poison the replay store",
      "explicit replay namespaces isolate independent registries",
    ],
  },
] as const;

const PUBLISHED_TEST_COUNT = TEST_GROUPS.reduce((total, group) => total + group.tests.length, 0);

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
        <div className="inline-flex items-center gap-2 rounded-full glass px-3.5 py-1.5 text-[11px] font-semibold tracking-[0.18em] text-emerald-300/90">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
          AP2 V0.1 · SIGNED ACKRATE PROFILE · PUBLIC NPM RELEASE
        </div>
        <h1 className="mt-5 max-w-4xl text-4xl font-black leading-[1.03] tracking-tight sm:text-6xl">
          Validate the mandate{" "}
          <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-emerald-400 bg-clip-text text-transparent drop-shadow-[0_0_34px_rgba(52,211,153,0.28)]">
            before the contract.
          </span>
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-relaxed text-emerald-100/70 sm:text-lg">
          Run the published <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-sm text-emerald-100">@ackrate/ap2</code>{" "}
          validator against a fresh signed mandate. The server returns only public keys and hashes; ephemeral signing
          keys never leave the request.
        </p>
      </motion.header>

      <section className="mt-9 grid gap-6 lg:grid-cols-[0.82fr_1.18fr]">
        <motion.div {...fade(0.06)} className="glass rounded-2xl p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.17em] text-emerald-300/70">Choose a check</div>
              <h2 className="mt-2 text-xl font-bold text-white">AP2 validation console</h2>
            </div>
            <div className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 font-mono text-[11px] text-emerald-200">
              0.3.0
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
                      ? "border-emerald-300/35 bg-emerald-400/12 shadow-[0_0_24px_rgba(52,211,153,0.08)]"
                      : "border-white/10 bg-black/20 hover:border-emerald-300/25 hover:bg-emerald-400/[0.06]"
                  )}
                >
                  <span className={"grid h-9 w-9 flex-none place-items-center rounded-lg " + (active ? "bg-emerald-400 text-[#06241a]" : "bg-white/[0.05] text-emerald-200/70")}>
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-emerald-50">{label}</span>
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-emerald-100/45">{detail}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={runValidator}
            disabled={running}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-300 px-5 py-3 text-sm font-bold text-[#06241a] shadow-[0_8px_30px_-6px_rgba(52,211,153,0.6)] transition hover:shadow-[0_10px_42px_-4px_rgba(52,211,153,0.85)] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
            {running ? "Validating…" : selected.label}
          </button>

          <div className="mt-4 flex gap-2.5 rounded-xl border border-white/8 bg-black/20 p-3 text-xs leading-relaxed text-emerald-100/55">
            <Store className="mt-0.5 h-4 w-4 flex-none text-emerald-300/70" aria-hidden />
            Each run uses a fresh one-process replay store. Production integrations replace it with durable atomic storage.
          </div>
        </motion.div>

        <motion.section {...fade(0.1)} className="overflow-hidden rounded-2xl border border-emerald-300/15 bg-black/35 shadow-[0_0_64px_rgba(16,185,129,0.14)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-400/10 px-5 py-4">
            <div>
              <div className="flex items-center gap-2 font-mono text-sm text-emerald-200">
                <ShieldCheck className="h-4 w-4" aria-hidden />
                validator output
              </div>
              <div className="mt-1 text-xs text-emerald-50/45">Real package code, server-side, no mocked decisions.</div>
            </div>
            <div className={"rounded-full border px-3 py-1 font-mono text-[11px] " + (
              running
                ? "border-amber-300/25 bg-amber-300/10 text-amber-200"
                : result?.ok
                  ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-200"
                  : error || result
                    ? "border-rose-300/25 bg-rose-400/10 text-rose-200"
                    : "border-white/10 bg-white/[0.03] text-white/45"
            )}>
              {running ? "running" : result?.ok ? "all expected" : error || result ? "attention" : "ready"}
            </div>
          </div>

          <div className="min-h-[420px] p-4 sm:p-5">
            {!running && !result && !error && (
              <div className="grid min-h-[370px] place-items-center rounded-xl border border-dashed border-emerald-300/15 bg-emerald-400/[0.025] p-8 text-center">
                <div>
                  <ShieldCheck className="mx-auto h-10 w-10 text-emerald-300/55" aria-hidden />
                  <div className="mt-4 text-base font-semibold text-emerald-50">Ready to validate</div>
                  <p className="mt-2 max-w-sm text-sm leading-relaxed text-emerald-100/50">
                    Select one boundary or run the complete visual suite. Every rejection must return its exact typed code.
                  </p>
                </div>
              </div>
            )}

            {running && (
              <div className="grid min-h-[370px] place-items-center text-center">
                <div>
                  <Loader2 className="mx-auto h-9 w-9 animate-spin text-emerald-300" aria-hidden />
                  <div className="mt-4 font-mono text-sm text-emerald-100">sign → bind → verify → consume</div>
                  <div className="mt-2 text-xs text-emerald-100/45">Running {selected.label.toLowerCase()}…</div>
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
                      className={"rounded-xl border p-3.5 " + (check.passed ? "border-emerald-300/15 bg-emerald-400/[0.055]" : "border-rose-300/20 bg-rose-400/[0.06]")}
                    >
                      <div className="flex items-start gap-3">
                        {check.passed
                          ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-300" aria-hidden />
                          : <XCircle className="mt-0.5 h-4 w-4 flex-none text-rose-300" aria-hidden />}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-emerald-50">{check.label}</span>
                            <code className={"rounded px-2 py-0.5 text-[10px] " + (check.passed ? "bg-emerald-400/10 text-emerald-200" : "bg-rose-400/10 text-rose-200")}>{check.code}</code>
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-emerald-100/50">{check.detail}</p>
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
                        <div className="text-[9px] uppercase tracking-[0.15em] text-emerald-300/50">{label}</div>
                        <div className="mt-1.5 truncate font-mono text-[11px] text-emerald-50/80" title={value}>{value}</div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.section>
      </section>

      <motion.section {...fade(0.14)} className="glass mt-6 rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.17em] text-emerald-300/70">Published package gate</div>
            <h2 className="mt-2 text-xl font-bold text-white">Complete AP2 test matrix</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-emerald-100/55">
              The console above runs six representative checks live. The published package gate runs every named case below.
            </p>
          </div>
          <div className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3.5 py-1.5 font-mono text-xs text-emerald-200">
            {PUBLISHED_TEST_COUNT} / {PUBLISHED_TEST_COUNT} PASSING
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {TEST_GROUPS.map((group) => (
            <div key={group.title} className="rounded-xl border border-white/10 bg-black/20 p-3.5 sm:p-4">
              <div className="flex items-center justify-between gap-3 border-b border-emerald-400/10 pb-3">
                <h3 className="text-sm font-semibold text-emerald-50">{group.title}</h3>
                <span className="flex-none rounded-full bg-emerald-400/10 px-2.5 py-1 font-mono text-[10px] text-emerald-200">
                  {group.tests.length} cases
                </span>
              </div>
              <ol className="mt-3 space-y-2.5" start={group.start}>
                {group.tests.map((test, index) => {
                  const number = "lastNumber" in group && index === group.tests.length - 1
                    ? group.lastNumber
                    : group.start + index;
                  return (
                    <li key={test} className="flex items-start gap-2.5 text-xs leading-relaxed text-emerald-100/60">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-none text-emerald-300/80" aria-hidden />
                      <span>
                        <span className="mr-2 font-mono text-[10px] text-emerald-300/45">
                          {String(number).padStart(2, "0")}
                        </span>
                        {test}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      </motion.section>

      <motion.section {...fade(0.18)} className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="glass rounded-xl p-4">
          <div className="text-3xl font-black text-emerald-200">59 / 59</div>
          <div className="mt-1 text-xs uppercase tracking-[0.14em] text-emerald-300/55">package tests passing</div>
          <p className="mt-3 text-xs leading-relaxed text-emerald-100/50">Valid mandates, tampering, scope, amount, expiry, replay, and concurrency.</p>
        </div>
        <a
          href="https://www.npmjs.com/package/@ackrate/ap2/v/0.3.0"
          target="_blank"
          rel="noreferrer"
          className="glass sheen relative rounded-xl p-4 transition hover:border-emerald-300/25"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="font-mono text-sm text-emerald-100">@ackrate/ap2</div>
            <ExternalLink className="h-4 w-4 text-emerald-300/60" aria-hidden />
          </div>
          <div className="mt-1 text-xs uppercase tracking-[0.14em] text-emerald-300/55">public npm package · 0.3.0</div>
          <p className="mt-3 text-xs leading-relaxed text-emerald-100/50">Installable, typed, documented, and verified from a clean project.</p>
        </a>
        <a
          href="https://github.com/ackrate/ackrate-protocol/tree/main/packages/ap2"
          target="_blank"
          rel="noreferrer"
          className="glass sheen relative rounded-xl p-4 transition hover:border-emerald-300/25"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-emerald-100">Source + test suite</div>
            <ExternalLink className="h-4 w-4 text-emerald-300/60" aria-hidden />
          </div>
          <div className="mt-1 text-xs uppercase tracking-[0.14em] text-emerald-300/55">review every check</div>
          <p className="mt-3 text-xs leading-relaxed text-emerald-100/50">The validator is an adapter. Contract enforcement remains the money boundary.</p>
        </a>
      </motion.section>

      <motion.div {...fade(0.22)} className="mt-6 flex gap-3 rounded-xl border border-emerald-300/12 bg-emerald-400/[0.035] p-4 text-sm leading-relaxed text-emerald-100/60">
        <ShieldCheck className="mt-0.5 h-5 w-5 flex-none text-emerald-300/70" aria-hidden />
        <p>
          Admission replay is consumed once here. Multi-purchase budget and payment replay remain atomically enforced by{" "}
          <code className="font-mono text-emerald-100/80">MandateRegistry.execute_payment</code> on every spend.
        </p>
      </motion.div>
    </main>
  );
}

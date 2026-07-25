"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Gauge,
  Package,
  Play,
  ShieldCheck,
  Terminal,
  WalletCards,
} from "lucide-react";
import "@xterm/xterm/css/xterm.css";

const PACKAGE = "reapp-protocol-cli";
const VERSION = "0.1.7";
const COMMAND = "reapp";
// The permanent same-address MandateRegistry the installed SDK and the
// vendored CLI actually settle against. Guarded in tests/hackathon.test.mjs.
const CONTRACT = "CCHQ5G4Y4YBMY6D3TYYJSVJVCKUM22Q6TMKCCHVAHY4X7K6QELQACZRM";

const INSTALL = `npx reapp-protocol-cli@0.1.7 demo research-agent

npm install -g reapp-protocol-cli@0.1.7
reapp --help`;

const PROJECT_FLOW = `reapp init
reapp setup
reapp mandate create
reapp pay
reapp settlement reconcile
reapp settlement acknowledge <TX_HASH>
reapp pay 10.00`;

const QUICK = [
  { label: "demo research-agent", cmd: "demo research-agent" },
  { label: "init", cmd: "init" },
  { label: "setup", cmd: "setup" },
  { label: "mandate create", cmd: "mandate create" },
  { label: "pay", cmd: "pay" },
  { label: "settlement reconcile", cmd: "settlement reconcile" },
];

const COMMANDS = [
  { name: "init", desc: "Writes a committable reapp.config.json with the live testnet contract id.", Icon: Package },
  { name: "setup", desc: "Creates user, agent, and merchant testnet accounts, then funds them.", Icon: CheckCircle2 },
  { name: "mandate create", desc: "Registers a scoped mandate and approves the allowance to the contract.", Icon: ShieldCheck },
  { name: "pay", desc: "Makes an agent-signed payment through MandateRegistry.execute_payment.", Icon: Terminal },
  { name: "settlement reconcile", desc: "Checks the exact prepared transaction hash before another payment is allowed.", Icon: ShieldCheck },
  { name: "settlement acknowledge <tx-hash>", desc: "Explicitly accepts one exact durable success before another payment is allowed.", Icon: CheckCircle2 },
  { name: "demo research-agent", desc: "Runs the complete budget-capped research-agent flow from a cold start.", Icon: Play },
];

const PROOF = [
  { label: "package", value: PACKAGE, Icon: Package },
  { label: "command", value: COMMAND, Icon: Terminal },
  { label: "network", value: "testnet", Icon: Gauge },
  { label: "custody", value: "contract", Icon: ShieldCheck },
];

const fade = (d = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay: d, ease: "easeOut" as const },
});

export default function CliPage() {
  const hostRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const termRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fitRef = useRef<any>(null);
  const sessionRef = useRef<string>("");
  const [cmd, setCmd] = useState("demo research-agent");
  const [running, setRunning] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    sessionRef.current = (globalThis.crypto?.randomUUID?.() ?? `s${Date.now()}`).replace(/[^A-Za-z0-9-]/g, "");
    (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
      if (disposed || !hostRef.current) return;
      const term = new Terminal({
        convertEol: true,
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        theme: { background: "#000000", foreground: "#d1fae5", cursor: "#34d399", selectionBackground: "#065f46" },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(hostRef.current);
      fit.fit();
      termRef.current = term;
      fitRef.current = fit;
      term.writeln(`\x1b[2m${PACKAGE}@${VERSION} · installed command: ${COMMAND} · pick a command below or type one, then Run.\x1b[0m`);
      term.writeln("\x1b[2mState (config, keys, mandate) persists across commands in this browser session.\x1b[0m\r\n");
      setReady(true);
      const onResize = () => fit.fit();
      window.addEventListener("resize", onResize);
      (term as unknown as { _onResize?: () => void })._onResize = onResize;
    })();
    return () => {
      disposed = true;
      const t = termRef.current;
      if (t?._onResize) window.removeEventListener("resize", t._onResize);
      t?.dispose?.();
    };
  }, []);

  async function run(command: string) {
    const term = termRef.current;
    if (!term || running) return;
    const args = command.trim().split(/\s+/).filter(Boolean);
    if (args.length === 0) return;
    setRunning(true);
    term.write(`\r\n\x1b[32m$\x1b[0m \x1b[1m${COMMAND} ${args.join(" ")}\x1b[0m\r\n`);
    try {
      const res = await fetch("/api/cli", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ args, sessionId: sessionRef.current }),
      });
      if (res.status === 400) {
        term.write("\x1b[31munknown command — try: demo research-agent · init · setup · mandate create · pay · settlement reconcile/acknowledge\x1b[0m\r\n");
        return;
      }
      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        term.write(dec.decode(value));
      }
    } catch (e) {
      term.write(`\r\n\x1b[31m[error ${String(e)}]\x1b[0m\r\n`);
    } finally {
      setRunning(false);
      fitRef.current?.fit?.();
    }
  }

  return (
    <main className="relative mx-auto w-full max-w-6xl px-4 py-8 sm:px-5">
      <div className="glow" aria-hidden />

      <section className="grid min-h-[calc(100vh-92px)] gap-8 py-6 lg:grid-cols-[0.86fr_1.14fr] lg:items-center">
        <motion.div {...fade()} className="flex flex-col justify-center">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3.5 py-1.5 text-[11px] font-semibold tracking-[0.18em] text-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.95)]" />
            LIVE TESTNET CLI
          </div>
          <h1 className="mt-5 max-w-3xl text-4xl font-black leading-[1.02] tracking-tight sm:text-6xl">
            Ship an agent payment from the browser terminal.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-emerald-100/70 sm:text-lg">
            <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-sm text-emerald-100">{PACKAGE}</code>
            {" "}is live on npm. Run the exact same command surface here: create testnet actors, authorize a mandate,
            and watch the contract reject payments past budget.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-2.5">
            {PROOF.map(({ label, value, Icon }) => (
              <div key={label} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-emerald-300/60">
                  <Icon className="h-3 w-3" aria-hidden />
                  {label}
                </div>
                <div className="mt-1.5 font-mono text-xs text-emerald-50">{value}</div>
              </div>
            ))}
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            <button
              onClick={() => {
                setCmd("demo research-agent");
                run("demo research-agent");
              }}
              disabled={running || !ready}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-[#06241a] shadow-[0_0_28px_rgba(52,211,153,0.35)] transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play className="h-4 w-4" aria-hidden />
              Run demo
            </button>
            <a
              href="https://www.npmjs.com/package/reapp-protocol-cli"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-emerald-100/80 transition hover:border-emerald-400/40 hover:text-emerald-100"
            >
              npm package
              <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          </div>

          <div className="mt-7 space-y-3">
            {[
              "The allowance is approved for the contract, never the agent.",
              "Every spend routes through MandateRegistry.execute_payment.",
              "The demo intentionally spends until the contract blocks the next purchase.",
            ].map((text) => (
              <div key={text} className="flex gap-3 text-sm leading-relaxed text-emerald-100/70">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-300" aria-hidden />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.section {...fade(0.08)} className="rounded-2xl border border-emerald-300/15 bg-black/35 p-3 shadow-[0_0_64px_rgba(16,185,129,0.16)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-400/10 px-3 pb-3">
            <div>
              <div className="flex items-center gap-2 font-mono text-sm text-emerald-200">
                <Terminal className="h-4 w-4" aria-hidden />
                {COMMAND} demo research-agent
              </div>
              <div className="mt-1 text-xs text-emerald-50/45">Server-side CLI bundle, per-session state, Stellar testnet.</div>
            </div>
            <div className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 font-mono text-[11px] text-emerald-200">
              {running ? "running" : ready ? "ready" : "booting"}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 px-1">
            {QUICK.map((q) => (
              <button
                key={q.cmd}
                onClick={() => {
                  setCmd(q.cmd);
                  run(q.cmd);
                }}
                disabled={running || !ready}
                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 font-mono text-[12px] text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Terminal className="h-3.5 w-3.5" aria-hidden />
                {q.label}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(cmd);
            }}
            className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-black/50 px-3 py-2 font-mono text-sm"
          >
            <span className="text-emerald-400">{COMMAND}</span>
            <input
              value={cmd}
              onChange={(e) => setCmd(e.target.value)}
              spellCheck={false}
              disabled={running}
              className="min-w-0 flex-1 bg-transparent text-emerald-50 placeholder:text-emerald-50/30 focus:outline-none"
              placeholder="demo research-agent"
            />
            <button
              type="submit"
              disabled={running || !ready}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-4 py-1.5 font-semibold text-black shadow-[0_0_20px_rgba(16,185,129,0.35)] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play className="h-4 w-4" aria-hidden />
              {running ? "Running..." : "Run"}
            </button>
          </form>

          <div className="mt-4 overflow-hidden rounded-xl border border-emerald-400/20 bg-black shadow-[0_0_44px_rgba(16,185,129,0.14)]">
            <div className="flex items-center gap-2 border-b border-emerald-400/10 px-4 py-2 font-mono text-[12px] text-emerald-300/70">
              <span className="h-3 w-3 rounded-full bg-red-400/70" />
              <span className="h-3 w-3 rounded-full bg-amber-400/70" />
              <span className="h-3 w-3 rounded-full bg-emerald-400/70" />
              <span className="ml-2">reapp-protocol-cli · testnet</span>
            </div>
            <div ref={hostRef} className="h-[520px] w-full px-3 py-2" />
          </div>

          <div className="mt-3 flex flex-col gap-2 px-1 text-xs text-emerald-50/50 sm:flex-row sm:items-center sm:justify-between">
            <span>Demo runs usually take 30-60 seconds.</span>
            <a className="inline-flex items-center gap-1 text-emerald-400 underline underline-offset-2 hover:text-emerald-300" href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT}`} target="_blank" rel="noreferrer">
              Contract {CONTRACT.slice(0, 6)}...{CONTRACT.slice(-4)}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </a>
          </div>
        </motion.section>
      </section>

      <motion.section {...fade(0.16)} className="grid gap-4 pb-12 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-xl border border-white/10 bg-black/25 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-100">
            <WalletCards className="h-4 w-4 text-emerald-300" aria-hidden />
            Install
          </div>
          <Code>{INSTALL}</Code>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/25 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-100">
            <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden />
            Commands
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {COMMANDS.map(({ name, desc, Icon }) => (
              <div key={name} className="rounded-lg border border-white/10 bg-black/30 p-3">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-emerald-300" aria-hidden />
                  <code className="text-xs text-emerald-300">reapp {name}</code>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-emerald-100/60">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </motion.section>
    </main>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-black/35 p-4 text-xs leading-relaxed text-emerald-100/90">
      <code>{children}</code>
    </pre>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import "@xterm/xterm/css/xterm.css";

const CONTRACT = "CCHQ5G4Y4YBMY6D3TYYJSVJVCKUM22Q6TMKCCHVAHY4X7K6QELQACZRM";

const QUICK = [
  { label: "demo research-agent", cmd: "demo research-agent" },
  { label: "init", cmd: "init" },
  { label: "setup", cmd: "setup" },
  { label: "mandate create", cmd: "mandate create" },
  { label: "pay", cmd: "pay" },
  { label: "settlement reconcile", cmd: "settlement reconcile" },
];

export default function ToolkitCliPage() {
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
      term.writeln("\x1b[2mreapp-protocol-cli@0.1.7 · installed command: reapp · pick a command below or type one, then Run.\x1b[0m");
      term.writeln("\x1b[2mState (config, keys, mandate) persists across commands in this session.\x1b[0m\r\n");
      setReady(true);
      const onResize = () => fit.fit();
      window.addEventListener("resize", onResize);
      // store cleanup
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
    term.write(`\r\n\x1b[32m$\x1b[0m \x1b[1mreapp ${args.join(" ")}\x1b[0m\r\n`);
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
    <main className="mx-auto max-w-4xl px-5 py-10">
      <Link href="/toolkit" className="text-sm text-emerald-400 underline underline-offset-2 hover:text-emerald-300">
        ← Toolkit preview
      </Link>
      <h1 className="mt-3 text-2xl font-semibold text-white">CLI · live terminal</h1>
      <p className="mt-2 leading-relaxed text-emerald-50/80">
        This runs the real <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[13px] text-emerald-100">reapp-protocol-cli</code> package on the server through its{" "}
        <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[13px] text-emerald-100">reapp</code> command against Stellar testnet and streams its output here. Try <span className="text-emerald-200">demo research-agent</span>: it funds ephemeral accounts, registers a
        3 XLM mandate, and the agent buys research sources on-chain until the contract caps the budget. No LLM key required.
        A successful manual <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[13px] text-emerald-100">pay</code> remains durably locked until you type the printed exact-hash <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[13px] text-emerald-100">settlement acknowledge &lt;tx-hash&gt;</code> command.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <button
            key={q.cmd}
            onClick={() => {
              setCmd(q.cmd);
              run(q.cmd);
            }}
            disabled={running || !ready}
            className="rounded-md border border-emerald-400/25 bg-emerald-500/10 px-3 py-1.5 font-mono text-[12px] text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
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
        <span className="text-emerald-400">reapp</span>
        <input
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          spellCheck={false}
          disabled={running}
          className="flex-1 bg-transparent text-emerald-50 placeholder:text-emerald-50/30 focus:outline-none"
          placeholder="demo research-agent"
        />
        <button
          type="submit"
          disabled={running || !ready}
          className="rounded-md bg-emerald-500 px-4 py-1.5 font-semibold text-black shadow-[0_0_20px_rgba(16,185,129,0.35)] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? "Running…" : "Run"}
        </button>
      </form>

      <div className="mt-4 overflow-hidden rounded-xl border border-emerald-400/20 bg-black shadow-[0_0_44px_rgba(16,185,129,0.14)]">
        <div className="flex items-center gap-2 border-b border-emerald-400/10 px-4 py-2 font-mono text-[12px] text-emerald-300/70">
          <span className="h-3 w-3 rounded-full bg-red-400/70" />
          <span className="h-3 w-3 rounded-full bg-amber-400/70" />
          <span className="h-3 w-3 rounded-full bg-emerald-400/70" />
          <span className="ml-2">reapp · testnet</span>
        </div>
        <div ref={hostRef} className="h-[460px] w-full px-3 py-2" />
      </div>

      <p className="mt-3 text-xs text-emerald-50/50">
        Enforced on-chain by the MandateRegistry contract{" "}
        <a className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300" href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT}`} target="_blank" rel="noreferrer">
          {CONTRACT.slice(0, 6)}…{CONTRACT.slice(-4)}
        </a>
        . A demo run takes roughly 30–60 seconds.
      </p>
    </main>
  );
}

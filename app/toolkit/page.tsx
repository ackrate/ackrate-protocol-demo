import Link from "next/link";
import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "REAPP Agentic Payments Toolkit Preview",
  description: "Preview the REAPP developer toolkit, research-agent runner, and composite mandate demonstrations on live Stellar testnet contracts.",
  path: "/toolkit",
  keywords: ["developer toolkit", "testnet", "composite mandates"],
});

export default function ToolkitPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <h1 className="text-2xl font-semibold text-white">Developer toolkit · testnet</h1>
      <p className="mt-2 leading-relaxed text-emerald-50/80">
        The CLI, SDK, reference agents, AP2 validation, and contract-enforced demos are collected here against the current
        live testnet contracts.
      </p>

      <div className="mt-6 grid gap-4">
        <Link
          href="/toolkit/cli"
          className="rounded-xl border border-emerald-400/15 bg-black/30 p-5 transition hover:border-emerald-400/40"
        >
          <div className="text-lg font-semibold text-emerald-100">CLI demo · research agent</div>
          <p className="mt-1 text-sm text-emerald-50/70">
            Run the reapp-protocol-cli research-agent flow live on testnet with the installed command{" "}
            <span className="font-mono">reapp</span>: the agent buys sources on-chain until the contract caps the
            budget. No LLM key required.
          </p>
        </Link>
        <Link
          href="/composites"
          className="rounded-xl border border-emerald-400/15 bg-black/30 p-5 transition hover:border-emerald-400/40"
        >
          <div className="text-lg font-semibold text-emerald-100">Composite mandates · clearing pools</div>
          <p className="mt-1 text-sm text-emerald-50/70">
            Three buyer agents pool one group buy; the contract clears everyone at one uniform price in a single
            atomic transaction. Runs on the composite MandateRegistry testnet deployment.
          </p>
        </Link>
      </div>
    </main>
  );
}

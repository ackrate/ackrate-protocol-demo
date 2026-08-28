"use client";

import { usePathname } from "next/navigation";

const links = [
  { href: "https://ackrate.network/", label: "Agentic payments research" },
  { href: "https://github.com/ackrate/ackrate-protocol", label: "Protocol source" },
  { href: "https://www.npmjs.com/package/@ackrate/core", label: "SDK on npm" },
  { href: "/llms.txt", label: "LLM context" },
];

export default function SiteFooter() {
  const path = usePathname();
  if (path.startsWith("/wallet")) return null;
  if (path === "/") {
    return (
      <footer className="border-t border-[#151914]/15 bg-[#fffdf8] text-[#151914]">
        <div className="mx-auto grid w-full max-w-[82rem] gap-10 px-5 py-12 sm:px-8 md:grid-cols-[1.2fr_0.8fr] lg:px-10 lg:py-16">
          <div>
            <p className="text-sm font-black tracking-tight">ACKRATE</p>
            <p className="home-footer-display mt-4 max-w-xl text-3xl leading-tight tracking-[-0.03em] sm:text-4xl">
              Room for the agent to help. <em className="text-[#157a4b]">A boundary that stays put.</em>
            </p>
          </div>
          <nav className="grid content-start gap-3 text-sm font-bold md:justify-self-end md:text-right" aria-label="Ackrate links">
            <a className="transition hover:text-[#157a4b]" href="/express">Live demo ↗</a>
            <a className="transition hover:text-[#157a4b]" href="/docs">Documentation ↗</a>
            <a className="transition hover:text-[#157a4b]" href="https://github.com/ackrate/ackrate-protocol">GitHub ↗</a>
          </nav>
        </div>
        <div className="border-t border-[#151914]/15 px-5 py-5 text-center text-[10px] font-bold uppercase tracking-[0.17em] text-[#151914]/45">
          Delegation and enforcement for autonomous agents
        </div>
      </footer>
    );
  }
  return (
    <footer className="mt-16 border-t border-white/10 bg-black/20">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-10 sm:grid-cols-[1.25fr_1fr] sm:px-6 lg:px-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">ACKRATE · live protocol</p>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-emerald-50/60">
            Open-source agent payment infrastructure with bounded mandates, Circle USDC settlement on Stellar Mainnet,
            and transaction evidence anyone can inspect. The independent field guide and ecosystem map live at{" "}
            <a className="text-emerald-300 underline decoration-emerald-400/40 underline-offset-4 hover:text-emerald-200" href="https://ackrate.network/">
              ackrate.network
            </a>.
          </p>
        </div>
        <nav className="grid content-start gap-2 sm:grid-cols-2" aria-label="ACKRATE ecosystem links">
          {links.map((link) => (
            <a
              className="rounded-lg px-3 py-2 text-sm text-white/55 transition hover:bg-white/[0.04] hover:text-emerald-200"
              href={link.href}
              key={link.href}
            >
              {link.label} <span aria-hidden="true">↗</span>
            </a>
          ))}
        </nav>
      </div>
      <div className="border-t border-white/[0.07] px-5 py-5 text-center text-[11px] uppercase tracking-[0.16em] text-white/30">
        ACKRATE Protocol · Stellar Mainnet · Circle USDC · Agent authority stays bounded
      </div>
    </footer>
  );
}

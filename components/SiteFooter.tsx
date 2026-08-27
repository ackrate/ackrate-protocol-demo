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
      <footer className="border-t border-white/10 bg-black/20">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-9 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>
            <p className="text-sm font-bold tracking-tight text-emerald-100">ACKRATE</p>
            <p className="mt-2 text-sm text-emerald-100/45">Agents can move quickly. Your permissions stay small.</p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-3 text-sm" aria-label="Ackrate links">
            <a className="text-emerald-100/55 transition hover:text-emerald-200" href="/express">Live demo</a>
            <a className="text-emerald-100/55 transition hover:text-emerald-200" href="/docs">Docs</a>
            <a className="text-emerald-100/55 transition hover:text-emerald-200" href="https://github.com/ackrate/ackrate-protocol">GitHub</a>
          </nav>
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

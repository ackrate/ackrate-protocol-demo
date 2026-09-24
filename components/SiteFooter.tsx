"use client";

import { usePathname } from "next/navigation";

const links = [
  { href: "https://github.com/ackrate/ackrate-protocol", label: "Protocol source" },
  { href: "https://www.npmjs.com/package/@ackrate/core", label: "SDK on npm" },
  { href: "/llms.txt", label: "LLM context" },
];

export default function SiteFooter() {
  const path = usePathname();
  if (path.startsWith("/wallet") || path.startsWith("/reports/")) return null;
  return (
    <footer className="mt-16 border-t border-white/10 bg-black/20">
      <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-6 lg:px-8">
        <nav className="flex flex-wrap gap-2" aria-label="ACKRATE ecosystem links">
          {links.map((link) => (
            <a
              className="rounded-lg px-3 py-2 text-sm text-white/55 transition hover:bg-white/[0.04] hover:text-white"
              href={link.href}
              key={link.href}
            >
              {link.label} <span aria-hidden="true">↗</span>
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}

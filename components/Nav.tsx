"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import AckrateSolarMark from "./AckrateSolarMark";

const links = [
  { href: "/", label: "Docs" },
  { href: "/cli", label: "CLI" },
  { href: "/express", label: "Express" },
  { href: "/wallet", label: "Wallet" },
  { href: "/security", label: "Security" },
  { href: "/ap2", label: "AP2" },
  { href: "/research", label: "Research" },
  { href: "/solutions", label: "Solutions" },
];

export default function Nav() {
  const path = usePathname();
  if (path.startsWith("/reports/")) return null;
  return (
    <motion.nav
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="sticky top-0 z-50 border-b border-[#1f1f1f] bg-black/85 backdrop-blur-xl"
    >
      <div className="flex h-16 w-full items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <Link href="/" className="group flex shrink-0 items-center gap-2" aria-label="ACKRATE home">
          <AckrateSolarMark size={42} />
          <span className="text-[15px] font-semibold tracking-tight text-white">
            ACKRATE
          </span>
        </Link>

        {/* Links */}
        <div className="no-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap rounded-lg border border-white/10 bg-white/[0.025] p-1">
          {links.map((l) => {
            const active = path === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`relative rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                  active
                    ? "text-white"
                    : "text-white/50 hover:text-white/90"
                }`}
              >
                {l.label}
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 -z-10 rounded-md bg-white/[0.09] ring-1 ring-white/10"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
              </Link>
            );
          })}
        </div>

        {/* CTA */}
        <a
          href="https://www.npmjs.com/package/@ackrate/cli"
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-[13px] font-semibold text-white/75 transition hover:border-white/30 hover:bg-white/[0.08] hover:text-white"
        >
          npm
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>
    </motion.nav>
  );
}

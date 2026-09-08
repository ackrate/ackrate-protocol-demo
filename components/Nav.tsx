"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
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
  const reduceMotion = useReducedMotion();
  const [hovered, setHovered] = useState<string | null>(null);
  if (path.startsWith("/reports/")) return null;
  return (
    <motion.nav
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="sticky top-0 z-50 border-b border-[#1f1f1f] bg-black/85 backdrop-blur-xl"
      style={{ paddingTop: "max(8px, env(safe-area-inset-top))" }}
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
        <motion.div
          className="no-scrollbar relative flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap rounded-xl bg-white/[0.025] p-1"
          onMouseLeave={() => setHovered(null)}
        >
          {links.map((l) => {
            const active = path === l.href;
            return (
              <motion.div
                className="relative"
                key={l.href}
                initial={false}
                animate={{ y: hovered === l.href && !active && !reduceMotion ? -1 : 0 }}
                whileTap={reduceMotion ? undefined : { scale: 0.965 }}
                transition={{ type: "spring", stiffness: 520, damping: 34, mass: 0.55 }}
              >
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  onMouseEnter={() => setHovered(l.href)}
                  onFocus={() => setHovered(l.href)}
                  onBlur={() => setHovered(null)}
                  className={`relative isolate block overflow-hidden rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-200 ${
                    active ? "text-white" : "text-white/50 hover:text-white/90"
                  }`}
                >
                  {hovered === l.href && !active && (
                    <motion.span
                      layoutId="nav-hover"
                      className="absolute inset-0 -z-10 rounded-lg bg-white/[0.045] ring-1 ring-inset ring-white/[0.055]"
                      transition={{ type: "spring", stiffness: 500, damping: 38, mass: 0.45 }}
                    />
                  )}
                  {active && (
                    <>
                      <motion.span
                        layoutId="nav-active"
                        className="absolute inset-0 -z-10 rounded-lg bg-white/[0.1] ring-1 ring-inset ring-white/[0.1]"
                        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 430, damping: 34, mass: 0.7 }}
                      />
                      <motion.span
                        layoutId="nav-active-light"
                        className="absolute inset-x-3 bottom-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent shadow-[0_0_8px_rgba(255,255,255,0.55)]"
                        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 430, damping: 34, mass: 0.7 }}
                      />
                    </>
                  )}
                  <span className="relative z-10">{l.label}</span>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>

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

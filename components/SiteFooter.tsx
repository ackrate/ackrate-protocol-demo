"use client";

import { usePathname } from "next/navigation";

export default function SiteFooter() {
  const path = usePathname();
  if (path.startsWith("/wallet")) return null;
  const isHome = path === "/";

  return (
    <footer className={`${isHome ? "border-[#151914]/15 bg-[#fffdf8] text-[#151914] dark:border-white/15 dark:bg-[#0c1611] dark:text-[#f4f2ec]" : "mt-16 border-white/10 bg-black/20 text-white"} border-t`}>
      <div className="mx-auto flex w-full max-w-[82rem] flex-col gap-8 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
        <a href="/" className="group inline-flex items-center gap-3 self-start" aria-label="Ackrate home">
          <span className={`logo-mark h-8 w-8 ${isHome ? "text-[#123d2c] dark:text-[#b9f36a]" : "text-emerald-300"}`} aria-hidden />
          <span className="text-sm font-black tracking-tight">ACKRATE</span>
        </a>
        <nav className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-bold" aria-label="Ackrate links">
          <a className={`${isHome ? "hover:text-[#157a4b] dark:hover:text-[#b9f36a]" : "text-white/60 hover:text-emerald-200"} transition`} href="mailto:consumer-contact@ackrate.com">Contact</a>
          <a className={`${isHome ? "hover:text-[#157a4b] dark:hover:text-[#b9f36a]" : "text-white/60 hover:text-emerald-200"} transition`} href="/docs">Documentation</a>
          <a className={`${isHome ? "hover:text-[#157a4b] dark:hover:text-[#b9f36a]" : "text-white/60 hover:text-emerald-200"} transition`} href="https://github.com/ackrate/ackrate-protocol">GitHub</a>
        </nav>
      </div>
      <div className={`${isHome ? "border-[#151914]/15 text-[#151914]/50 dark:border-white/15 dark:text-white/45" : "border-white/10 text-white/35"} border-t px-5 py-5 text-center text-xs`}>
        © {new Date().getFullYear()} Ackrate. All rights reserved.
      </div>
    </footer>
  );
}

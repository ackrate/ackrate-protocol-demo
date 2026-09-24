"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Docs" },
  { href: "/wallet", label: "Wallet" },
  { href: "/cli", label: "CLI" },
  { href: "/security", label: "Security" },
];
const guides = [
  { href: "/express", label: "Express" },
  { href: "/ap2", label: "AP2" },
  { href: "/research", label: "Research" },
  { href: "/solutions", label: "Solutions" },
];

export default function Nav() {
  const path = usePathname();
  if (path.startsWith("/reports/")) return null;
  return <>
    <nav aria-label="Main navigation" className="fixed inset-x-0 top-0 z-50 border-b border-[#1f1f1f] bg-black"
      style={{ paddingTop: "max(8px, env(safe-area-inset-top, 0px))" }}>
      <div className="flex h-16 items-center justify-between gap-2 px-3 sm:gap-4 sm:px-6">
        <Link href="/" className="shrink-0 py-3 text-xs font-semibold sm:text-[15px] text-white" aria-label="ACKRATE home">ACKRATE</Link>
        <div className="flex items-center gap-1">
          {links.map((link) => <Link key={link.href} href={link.href} aria-current={path === link.href ? "page" : undefined}
            className={`flex min-h-11 items-center rounded px-1.5 text-xs sm:px-3 sm:text-sm ${path === link.href ? "bg-white/10 text-white" : "text-white/60 hover:text-white"}`}>{link.label}</Link>)}
          <details key={path} className="relative">
            <summary className="flex min-h-11 cursor-pointer items-center px-1.5 text-xs text-white/60 sm:px-2 sm:text-sm">Guides</summary>
            <div className="absolute right-0 top-full min-w-36 rounded border border-white/15 bg-black p-2">
              {guides.map((link) => <Link key={link.href} href={link.href} aria-current={path === link.href ? "page" : undefined}
                className="flex min-h-11 items-center rounded px-3 text-sm text-white/70 hover:bg-white/10 hover:text-white">{link.label}</Link>)}
            </div>
          </details>
        </div>
      </div>
    </nav>
    <div aria-hidden="true" style={{ height: "calc(65px + max(8px, env(safe-area-inset-top, 0px)))" }} />
  </>;
}

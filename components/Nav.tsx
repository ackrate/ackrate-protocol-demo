"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const guides = [
  { href: "/docs", label: "Overview" },
  { href: "/docs/sdk", label: "SDK" },
  { href: "/docs/cli", label: "CLI" },
  { href: "/docs/quickstarts", label: "Quick starters" },
  { href: "/express", label: "Express" },
  { href: "/ap2", label: "AP2" },
  { href: "/security", label: "Security" },
];

export default function Nav() {
  const path = usePathname();
  if (path.startsWith("/reports/")) return null;
  return <>
    <nav aria-label="Main navigation" className="site-nav">
      <div className="site-nav-inner">
        <Link href="/" className="wordmark" aria-label="REAPP home">REAPP<span aria-hidden="true">.</span></Link>
        <div className="site-nav-links">
          <Link href="/wallet" aria-current={path === "/wallet" ? "page" : undefined}>Consumer app</Link>
          <details key={path} onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.currentTarget.open = false;
              event.currentTarget.querySelector("summary")?.focus();
            }
          }}>
            <summary>Docs <span aria-hidden="true">⌄</span></summary>
            <div className="docs-menu">
              {guides.map((link) => <Link key={link.href} href={link.href} aria-current={path === link.href ? "page" : undefined}>{link.label}</Link>)}
            </div>
          </details>
        </div>
      </div>
    </nav><div className="nav-spacer" aria-hidden="true" />
  </>;
}

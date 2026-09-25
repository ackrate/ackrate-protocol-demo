"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import AckrateArchMark from "./AckrateArchMark";

const guides = [
  { href: "/docs", label: "Overview" },
  { href: "/docs/sdk", label: "SDK" },
  { href: "/docs/cli", label: "CLI" },
  { href: "/docs/quickstarts", label: "Quick starters" },
  { href: "/docs/integrations", label: "Integrations · alpha" },
  { href: "/express", label: "Express demo" },
  { href: "/ap2", label: "AP2 demo" },
];

export default function Nav() {
  const path = usePathname();
  if (path.startsWith("/reports/")) return null;
  return <>
    <nav aria-label="Main navigation" className="site-nav">
      <div className="site-nav-inner">
        <Link href="/" className="wordmark" aria-label="REAPP home"><AckrateArchMark />REAPP</Link>
        <div className="site-nav-links">
          <Link href="/wallet" aria-current={path === "/wallet" ? "page" : undefined}>Consumer app</Link>
          <details key={path} onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.currentTarget.open = false;
              event.currentTarget.querySelector("summary")?.focus();
            }
          }}>
            <summary>Docs <ChevronDown className="docs-chevron" size={14} aria-hidden="true" /></summary>
            <div className="docs-menu">
              {guides.map((link) => <Link key={link.href} href={link.href} aria-current={path === link.href ? "page" : undefined}>{link.label}</Link>)}
            </div>
          </details>
          <ThemeToggle />
        </div>
      </div>
    </nav><div className="nav-spacer" aria-hidden="true" />
  </>;
}

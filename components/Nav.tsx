"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import AckrateArchMark from "./AckrateArchMark";
import { WALLET_NAV_SLOT_ID } from "./wallet/WalletNavPortal";

const guides = [
  { href: "/docs", label: "Overview" },
  { href: "/docs/sdk", label: "SDK" },
  { href: "/docs/cli", label: "CLI" },
  { href: "/docs/quickstarts", label: "Quick starters" },
  { href: "/docs/integrations", label: "Integrations · alpha" },
];

export default function Nav() {
  const path = usePathname() ?? "";
  const docsRef = useRef<HTMLDetailsElement>(null);
  // Close the Docs menu on pointer-down anywhere outside it. Route changes remount it closed via key.
  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const docs = docsRef.current;
      if (docs?.open && event.target instanceof Node && !docs.contains(event.target)) docs.open = false;
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
  }, []);
  if (path.startsWith("/reports/")) return null;
  const walletRoute = path === "/wallet" || path.startsWith("/wallet/");
  return (
    <nav aria-label="Main navigation" className="site-nav">
      <div className="site-nav-inner">
        <Link href="/" className="wordmark"><AckrateArchMark /><span className="wordmark-text"><span>REAPP</span>{" "}<span className="wordmark-tagline">powered by Ackrate SDK</span></span></Link>
        <div className="site-nav-links">
          <Link href="/wallet" aria-current={path === "/wallet" ? "page" : undefined}>Consumer app</Link>
          <details key={path} ref={docsRef} onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.currentTarget.open = false;
              event.currentTarget.querySelector("summary")?.focus();
            }
          }} onBlur={(event) => {
            // A null relatedTarget (e.g. Safari taps on links) is left to the pointer-down handler.
            const next = event.relatedTarget;
            if (next instanceof Node && !event.currentTarget.contains(next)) event.currentTarget.open = false;
          }}>
            <summary>Docs <ChevronDown className="docs-chevron" size={14} aria-hidden="true" /></summary>
            <div className="docs-menu">
              {guides.map((link) => <Link key={link.href} href={link.href} aria-current={path === link.href ? "page" : undefined}>{link.label}</Link>)}
            </div>
          </details>
        </div>
        {/* Context controls, theme toggle last: second row at ≤840px, in DOM order at every width. */}
        <div className={walletRoute ? "site-nav-context site-nav-context-wallet" : "site-nav-context"}>
          {walletRoute && (
            <div className="site-nav-wallet">
              {/* WalletChatApp portals its Disconnect control here; empty otherwise. */}
              <div id={WALLET_NAV_SLOT_ID} className="site-nav-wallet-slot" />
            </div>
          )}
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}

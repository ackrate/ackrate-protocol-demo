"use client";
import { usePathname } from "next/navigation";

export default function SiteFooter() {
  const path = usePathname() ?? "";
  if (!path || path.startsWith("/wallet") || path.startsWith("/reports/")) return null;
  return <footer className="site-footer"><div>
    <span>REAPP · Powered by ACKRATE SDK</span>
    <nav aria-label="Project resources"><a href="https://github.com/ackrate/ackrate-protocol">Source ↗</a><a href="/llms.txt">LLM context</a></nav>
  </div></footer>;
}

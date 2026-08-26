import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Agentic Payments Research Agent Demo",
  description: "Watch a research agent buy paid sources on Stellar testnet while an on-chain ACKRATE mandate enforces its total budget and blocks overspending.",
  path: "/research",
  keywords: ["research agent", "AI agent budget", "on-chain authorization"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

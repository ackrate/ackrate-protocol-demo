import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "ACKRATE Research Agent CLI Runner",
  description: "Run the ACKRATE research-agent CLI flow in a guided interface and inspect bounded agentic payments on Stellar testnet without an LLM key.",
  path: "/toolkit/cli",
  keywords: ["CLI runner", "research agent", "testnet demo"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

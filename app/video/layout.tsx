import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Agentic Payments Video Paywall Demo",
  description: "A live pay-per-use demo where an AI agent unlocks videos under a 3 XLM mandate and ACKRATE rejects the fourth payment when the budget is exhausted.",
  path: "/video",
  keywords: ["video paywall", "pay per use", "budget enforcement"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

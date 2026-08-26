import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "AP2 Mandates for Agentic Payments",
  description: "Test how ACKRATE binds Google AP2 intent and transaction mandates to deterministic authorization, canonical signatures, merchant scope, expiry, and replay protection.",
  path: "/ap2",
  keywords: ["AP2", "intent mandate", "transaction mandate"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

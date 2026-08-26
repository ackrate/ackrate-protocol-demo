import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Merchant Assurance for Agent Payments",
  description: "Inspect the Mainnet contract tests, trust boundaries, deployment evidence, and merchant verification controls behind REAPP payments.",
  path: "/merchants",
  keywords: ["agent payment security", "merchant verification", "Stellar USDC", "MandateRegistry"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

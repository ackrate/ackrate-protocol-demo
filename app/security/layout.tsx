import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Contract Security Suite",
  description: "Reproduce Ackrate's Mainnet contract tests, inspect trust boundaries and remediations, and follow every security claim to source and chain evidence.",
  path: "/security",
  keywords: ["contract security", "Stellar smart contracts", "Mainnet USDC", "MandateRegistry"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

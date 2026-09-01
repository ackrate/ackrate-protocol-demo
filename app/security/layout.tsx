import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Mainnet V2 Security Evidence",
  description: "Readable evidence for MandateRegistry V2 contract behavior, negative paths, source gates, and live Mainnet binding.",
  path: "/security",
  keywords: ["contract security", "Stellar smart contracts", "Mainnet USDC", "MandateRegistry V2"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

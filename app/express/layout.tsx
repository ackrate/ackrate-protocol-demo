import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Mainnet Agent Payments in Circle USDC",
  description: "A live Mainnet flow for wallet-authorized agent payments through an Express fulfillment API, settled in Circle USDC and enforced by MandateRegistry.",
  path: "/express",
  keywords: ["agent payments", "Circle USDC", "Stellar Mainnet", "Express middleware", "pay-per-use API"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

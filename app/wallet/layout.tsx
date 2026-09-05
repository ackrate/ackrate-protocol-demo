import type { Metadata } from "next";
import "./wallet.css";
import "./wallet-monochrome.css";
import "./wallet-flow.css";

export const metadata: Metadata = {
  title: "Agent Commerce Wallet",
  description: "Discover real x402 services and let AI agents pay with USDC inside contract-enforced spending rules.",
  alternates: { canonical: "/wallet" },
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
    googleBot: {
      index: false,
      follow: false,
      noarchive: true,
      nosnippet: true,
      noimageindex: true,
    },
  },
};

export default function WalletLayout({ children }: { children: React.ReactNode }) {
  return children;
}

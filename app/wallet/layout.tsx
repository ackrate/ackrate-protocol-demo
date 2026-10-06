import type { Metadata } from "next";
import "./wallet.css";
import "./wallet-monochrome.css";
import "./wallet-flow.css";
import "./wallet-flat.css";

export const metadata: Metadata = {
  title: "Agent Commerce Wallet",
  description: "Choose x402 services and set USDC spending limits for your agent.",
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

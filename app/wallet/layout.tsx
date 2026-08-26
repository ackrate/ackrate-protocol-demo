import type { Metadata } from "next";
import "./wallet.css";

export const metadata: Metadata = {
  title: "Wallet & Agent Console",
  description: "Freighter wallet signing, on-chain mandate registration, and contract-enforced agent payments.",
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

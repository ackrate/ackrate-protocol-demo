import type { Metadata } from "next";
import localFont from "next/font/local";
import "./wallet-flow.css";

/* Self-hosted OFL faces (see public/fonts/LICENSE.md); no third-party origins. */
const display = localFont({
  src: "../../public/fonts/bricolage-grotesque-latin-wght-normal.woff2",
  weight: "200 800",
  variable: "--font-display",
  display: "swap",
  preload: true,
});
const accent = localFont({
  src: [
    { path: "../../public/fonts/instrument-serif-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/instrument-serif-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-accent",
  display: "swap",
  preload: true,
});
const sans = localFont({
  src: "../../public/fonts/geist-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-sans",
  display: "swap",
  preload: true,
});
const mono = localFont({
  src: "../../public/fonts/geist-mono-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-mono",
  display: "swap",
  preload: false,
});

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
  return <div className={`hall-root ${display.variable} ${accent.variable} ${sans.variable} ${mono.variable}`}>{children}</div>;
}

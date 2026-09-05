import type { Metadata } from "next";
import localFont from "next/font/local";
import "./experimental-flow.css";

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
  title: "Experimental Agent Commerce",
  description: "Experimental ACKRATE interface for contract-enforced x402 agent payments.",
  alternates: { canonical: "/experimental" },
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

export default function ExperimentalLayout({ children }: { children: React.ReactNode }) {
  return <div className={`hall-root ${display.variable} ${accent.variable} ${sans.variable} ${mono.variable}`}>{children}</div>;
}

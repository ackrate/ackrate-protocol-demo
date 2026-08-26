import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Agentic Payments CLI",
  description: "Run ACKRATE agentic payments from the terminal: initialize actors, create bounded mandates, pay on Stellar testnet, inspect evidence, and test rejection paths.",
  path: "/cli",
  keywords: ["payment CLI", "Stellar testnet", "payment mandate"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

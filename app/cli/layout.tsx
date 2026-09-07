import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Agentic Payments CLI",
  description: "Use the published ACKRATE CLI on Stellar Mainnet: inspect commands, configure funded signers, and run the consumer and fulfillment agents with bounded USDC payments.",
  path: "/cli",
  keywords: ["payment CLI", "Stellar Mainnet", "payment mandate"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

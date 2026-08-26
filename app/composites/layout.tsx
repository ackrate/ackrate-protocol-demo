import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Composite Mandates for Multi-Agent Payments",
  description: "A live multi-agent group-buy demonstration where composite ACKRATE mandates coordinate commitments and settle a uniform clearing price atomically on Stellar testnet.",
  path: "/composites",
  keywords: ["composite mandates", "multi-agent payments", "atomic settlement"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

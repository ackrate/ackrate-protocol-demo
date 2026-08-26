import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Agentic Payment Solutions and Starter Kits",
  description: "Choose a ACKRATE starter kit, set it up from an empty folder, and run a verified 402, contract-enforced Stellar testnet payment, and protected 200 response.",
  path: "/solutions",
  keywords: ["agentic payment starter kits", "x402 SDK examples", "Stellar payment starter"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

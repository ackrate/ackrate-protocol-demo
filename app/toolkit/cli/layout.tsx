import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "ACKRATE Research Agent CLI Runner",
  description: "Open the published ACKRATE Mainnet CLI and reference consumer and fulfillment agents.",
  path: "/toolkit/cli",
  keywords: ["CLI runner", "research agent", "Mainnet"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

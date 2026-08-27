import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Developer Documentation",
  description: "Install Ackrate, run the end-to-end agent payment flow, and inspect the contract-enforced safety boundary.",
  path: "/docs",
  keywords: ["Ackrate SDK", "agent payment documentation", "Express middleware"],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

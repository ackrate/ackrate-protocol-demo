import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "Controlled AI Spending Preview",
  description:
    "See how ACKRATE lets a person give an AI agent a task while retaining explicit control over the budget, approved services, deadline, and exceptions.",
  path: "/consumer",
  keywords: [
    "consumer AI agent payments",
    "AI spending controls",
    "bounded agent wallet",
    "controlled AI spending",
  ],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/site-metadata";
export const metadata = createPageMetadata({ title: "Hosted Testnet walkthrough", description: "Connect the local research starter to the persistent Express demo runtime.", path: "/docs/hosted" });
export default function Layout({ children }: { children: ReactNode }) { return children; }

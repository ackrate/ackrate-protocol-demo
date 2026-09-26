import { createPageMetadata } from "@/lib/site-metadata";
import QuickStarters from "./QuickStarters";
export const metadata = createPageMetadata({ title: "Quick starters", description: "Twenty complete SDK examples on Stellar Testnet.", path: "/docs/quickstarts" });
export default function Page() { return <QuickStarters />; }

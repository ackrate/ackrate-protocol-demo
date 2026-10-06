import Link from "next/link";
import { createPageMetadata } from "@/lib/site-metadata";
export const metadata = createPageMetadata({ title: "Developer docs", description: "Build Stellar payments with ACKRATE SDK and CLI.", path: "/docs" });
export default function Docs() {
  return <><p className="eyebrow">Developer docs</p><h1>Build with ACKRATE.</h1>
    <p className="lead">Use the ACKRATE SDK and CLI to create mandates, authorize spending, and verify payments on Stellar.</p>
    <div className="doc-index">
      <Link href="/docs/sdk"><h2>SDK <span>→</span></h2><p>Create mandates, authorize a budget, and settle payments from TypeScript.</p></Link>
      <Link href="/docs/cli"><h2>CLI <span>→</span></h2><p>Configure signers, run the reference agents, and recover interrupted payments.</p></Link>
      <Link href="/docs/quickstarts"><h2>Quick starters <span>→</span></h2><p>Run a complete local SDK example on Stellar Testnet.</p></Link>
    </div>
    <p><Link href="/docs/integrations">x402 Gateway</Link>: run a paid Express API.</p>
    <h2>Interactive demos</h2><p><Link href="/cli">CLI demo</Link> · <Link href="/express">Express demo</Link> · <Link href="/ap2">AP2 demo</Link></p>
  </>;
}

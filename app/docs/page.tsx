import Link from "next/link";
import { createPageMetadata } from "@/lib/site-metadata";
export const metadata = createPageMetadata({ title: "Developer docs", description: "Build Stellar payments with ACKRATE SDK and CLI.", path: "/docs" });
export default function Docs() {
  return <><p className="eyebrow">Developer docs</p><h1>Build with ACKRATE.</h1>
    <p className="lead">REAPP is the consumer app. Its SDK and CLI were renamed from REAPP to ACKRATE and are published under @ackrate. The smart contract remains MandateRegistry.</p>
    <div className="doc-index">
      <Link href="/docs/sdk"><h2>SDK <span>→</span></h2><p>Create mandates, authorize a budget, and settle payments from TypeScript.</p></Link>
      <Link href="/docs/cli"><h2>CLI <span>→</span></h2><p>Configure signers, run the reference agents, and recover interrupted payments.</p></Link>
      <Link href="/docs/quickstarts"><h2>Quick starters <span>→</span></h2><p>Run a complete local SDK example on Stellar Testnet. No wallet required.</p></Link>
    </div>
    <h2>Integrations and evidence</h2><p><Link href="/express">Express payment middleware</Link> · <Link href="/ap2">AP2 mandates</Link> · <Link href="/security">Contract security evidence</Link></p>
    <p>Mainnet uses real Circle USDC and XLM fees. The downloadable starters use Testnet XLM and pinned Testnet package versions; they are not Mainnet templates.</p>
  </>;
}

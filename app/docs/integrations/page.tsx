import Link from "next/link";
import { createPageMetadata } from "@/lib/site-metadata";
export const metadata = createPageMetadata({ title: "x402 integrations · alpha", description: "Supported Stellar payment flows, hosted gateway status, and integration requests.", path: "/docs/integrations" });
export default function IntegrationsDocs() {
  return <><p className="eyebrow">Docs / Integrations · alpha</p><h1>Connect a paid service.</h1>
    <p className="lead">ACKRATE bounds an agent’s spending on Stellar. The integration layer connects that authority to a service’s payment and delivery flow.</p>
    <h2>Supported paths</h2>
    <dl className="module-list"><dt>ACKRATE Express middleware</dt><dd><code>@ackrate/express-middleware</code> verifies ACKRATE payment proofs before returning a protected resource. Run the complete merchant and consumer pair with the <Link href="/docs/quickstarts">Testnet SDK starters</Link>.</dd>
    <dt>Agent402 · Stellar x402 v2</dt><dd>The wallet adapter supports the <code>exact</code> scheme for Circle USDC on Stellar Mainnet. <a href="https://agent402.tools/stellar">Agent402</a> exposes search, extraction, rendering, PDF and research tools. The wallet checks each service’s live schema, price and settlement requirements before offering it; a marketplace listing alone does not establish compatibility.</dd></dl>
    <p>ACKRATE contract settlement and the marketplace’s x402 payment are separate steps. A MandateRegistry receipt is not a generic x402 <code>exact</code> payment. The adapter binds both settlements and preserves recovery evidence.</p>
    <h2>Hosted gateway status</h2><p>The Express companion is moving from its legacy deployment to Vercel. Hosted sessions are not available yet: durable storage and recovery must be configured first. Use the local Testnet SDK starter in the meantime.</p>
    <p>Vercel staging serves the app, docs and wallet API functions. The companion’s process-local sessions are being replaced before hosted access is enabled. The <Link href="/express">Express demo</Link> retains historical August Mainnet receipts, not evidence of current gateway availability. Wallet sign-in and payments also require deployment readiness.</p>
    <h2>More integrations are coming</h2><p>This is alpha software. Additional gateways and consumer-agent integrations are planned. <a href="mailto:consumer-contact@ackrate.com?subject=REAPP%20integration">Contact us to integrate your gateway or consumer agent</a> with your service URL, network, payment scheme and intended user flow.</p>
  </>;
}

import Link from "next/link";
import { createPageMetadata } from "@/lib/site-metadata";
export const metadata = createPageMetadata({ title: "ACKRATE SDK", description: "TypeScript SDK setup and payment lifecycle on Stellar.", path: "/docs/sdk" });
const SOURCE = "https://github.com/ackrate/ackrate-protocol/blob/a229f8d232567a4f5de812b43f72e2120e243acf";
export default function SdkDocs() {
  return <><p className="eyebrow">Docs / SDK</p><h1>Payments from TypeScript.</h1>
    <p className="lead">Use the SDK to create a mandate and submit payments. MandateRegistry remains the authority for every transfer.</p>
    <h2>Install</h2><pre><code>npm install @ackrate/core@0.4.1 @ackrate/stellar@0.3.0 @stellar/stellar-sdk@16.3.0</code></pre>
    <h2>Create a mandate</h2><p>This example only builds a mandate in memory. Supply funded user and agent addresses, the merchant, and the Circle USDC asset from the verified Mainnet configuration.</p>
    <pre><code>{`import { ackrate } from "@ackrate/core";

const mandate = ackrate.createIntentMandate({
  user, agent, merchant, asset,
  maxAmount: "3.00",
  expiry: Math.floor(Date.now() / 1000) + 3600,
});`}</code></pre>
    <h2>Authorize, then pay</h2><ol><li>Register with the user signer using <code>ackrate.registerMandate</code>.</li><li>Approve the contract allowance using <code>ackrate.approveBudget</code>.</li><li>Bind the agent signer using <code>ackrate.agent</code>.</li><li>Persist the prepared transaction before submission using <code>agent.pay</code> and its <code>onPrepared</code> callback. Keep a durable receipt store for paid HTTP delivery.</li></ol>
    <p>If submission is interrupted, reconcile the exact prepared transaction hash before retrying. A timeout does not mean payment failed.</p>
    <p><a href={`${SOURCE}/docs/mainnet-configuration.md`}>Follow the complete Mainnet signing and settlement guide →</a></p>
    <h2>Run an end-to-end example</h2><p><Link href="/docs/quickstarts">The Testnet starters</Link> include both agents, payment-bound HTTP delivery, and recovery evidence. Their scripts call the SDK directly and print concise status lines.</p>
    <h2>Published modules</h2><dl className="module-list"><dt>@ackrate/core 0.4.1</dt><dd>Mandates, payments, receipts, and reconciliation.</dd><dt>@ackrate/stellar 0.3.0</dt><dd>Network configuration and transaction signing.</dd><dt>@ackrate/express-middleware 0.3.0</dt><dd>Verify a paid request before resource delivery.</dd><dt>@ackrate/ap2 0.4.0</dt><dd>Validate AP2-style intent mandates.</dd></dl>
  </>;
}

import Link from "next/link";
import CodeBlock from "@/components/CodeBlock";
import { createPageMetadata } from "@/lib/site-metadata";

export const metadata = createPageMetadata({
  title: "x402 Gateway",
  description: "Run a Node.js Express gateway that verifies ACKRATE payments before returning JSON.",
  path: "/docs/integrations",
});

export default function IntegrationsDocs() {
  return <>
    <h1>x402 Gateway</h1>
    <p className="lead">Run a paid Express API on Stellar Testnet with the Research Source Scout starter. You need Node.js 20 or later.</p>

    <h2>1. Run the demo</h2>
    <p>Open <Link href="/docs/quickstarts">Quick starters</Link>, select Research Source Scout, and run its setup command in an empty folder. Then run:</p>
    <CodeBlock>npm run demo</CodeBlock>
    <p>The setup command verifies the download and runs <code>npm ci</code>. The demo funds Testnet accounts and starts the Express gateway. The consumer buys three resources. The contract rejects the fourth payment when the budget is exhausted.</p>

    <h2>2. Add your resource</h2>
    <p>Edit <code>scenario/scenario.mjs</code> to set the price, response, and business rules. <code>src/fulfillment.mjs</code> configures Express; <code>src/consumer.mjs</code> runs the consumer.</p>
    <p>The API returns a 402 challenge. The consumer pays through the SDK, then retries with an ACKRATE bound-v2 payment proof. <code>@ackrate/express-middleware</code> verifies the ACKRATE proof on Stellar before calling your fulfillment callback and returning its JSON.</p>

    <h2>3. Run the gateway separately</h2>
    <p>Copy <code>.env.example</code> to <code>.env</code> and set <code>ACKRATE_MERCHANT</code> to a funded Testnet public address. Then run:</p>
    <CodeBlock>npm run fulfillment</CodeBlock>
    <p>The gateway listens at <code>http://127.0.0.1:4021</code> and serves <code>GET /source/:sourceId</code>. Keep <code>.ackrate/</code>, which stores keys and payment recovery evidence.</p>

    <h2>Demos and reference</h2>
    <p><Link href="/express">Express demo</Link> · <Link href="/cli">CLI demo</Link> · <a href="https://www.npmjs.com/package/@ackrate/express-middleware">Middleware reference</a></p>
  </>;
}

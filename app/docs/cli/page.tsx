import Link from "next/link";
import { createPageMetadata } from "@/lib/site-metadata";
export const metadata = createPageMetadata({ title: "ACKRATE CLI", description: "CLI configuration, signers, payment consent, and recovery.", path: "/docs/cli" });
export default function CliDocs() {
  return <><p className="eyebrow">Docs / CLI</p><h1>One CLI for the protocol.</h1>
    <p className="lead">Use ACKRATE CLI for configuration, reference agents, and settlement recovery. Quick starters are SDK scripts and do not need a separate CLI.</p>
    <h2>Install and inspect</h2><pre><code>{`npm install -g @ackrate/cli@0.2.1
ackrate --help
ackrate demo`}</code></pre><p>With no target, <code>ackrate demo</code> lists the available reference flow without submitting a payment.</p>
    <h2>Configure Mainnet</h2><pre><code>{`ackrate init --network mainnet --user-signer USER_IDENTITY --agent-signer AGENT_IDENTITY --merchant G_ADDRESS --budget 3 --price 1
ackrate setup`}</code></pre><p>Replace the identity and address placeholders. <code>setup</code> performs read-only readiness checks on Mainnet. The user and agent need funded Stellar identities; the user also needs Circle USDC.</p>
    <h2>Authorize and pay</h2><pre><code>{`ackrate mandate create --budget 3 --expiry 3600 --confirm-real-usdc
ackrate pay 1 --confirm-real-usdc`}</code></pre><p>These commands authorize and spend real USDC. Review the recipient and amounts before running them. The confirmation flag records explicit consent.</p>
    <h2>Recover an interrupted payment</h2><pre><code>ackrate settlement reconcile</code></pre><p>Reconcile before another payment. Acknowledge a recorded successful settlement only with its exact transaction hash. Never delete pending state to force a retry.</p>
    <details><summary>Advanced options</summary><p><code>--manifest</code> validates an override against the official deployment. <code>--agent-secret-env</code> names a secret-manager variable for bound request proofs. <code>--resume-setup-registration</code> resumes an exact unused registration.</p><p><code>ops create / verify / combine</code> coordinates native 2-of-3 signing. These commands preserve independently verifiable transaction requests.</p><p><code>setup --force</code> regenerates Testnet burner keys. It is not a Mainnet key-management command.</p></details>
    <p><a href="https://github.com/ackrate/ackrate-protocol/tree/a229f8d232567a4f5de812b43f72e2120e243acf/packages/cli">Full CLI reference →</a> · <Link href="/cli">Browser reference-agent runner →</Link></p>
    <p>The funded browser CLI runner requires the persistent runtime. It is unavailable on Vercel; local CLI commands remain the supported developer path.</p>
  </>;
}

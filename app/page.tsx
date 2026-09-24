import Link from "next/link";

const CONTRACT = "CCLZEBJXG4YVJEPBCR5F27N733BCK5HQJWZZGB3K54JVODY3VAGP4HWR";
const packages = [
  ["core", "0.4.1", "Mandates and contract-enforced payments"],
  ["stellar", "0.3.0", "Stellar client, network configuration, and signing"],
  ["ap2", "0.4.0", "IntentMandate validation"],
  ["express-middleware", "0.3.0", "Payment verification before resource delivery"],
  ["cli", "0.2.1", "Consumer and fulfillment reference agents"],
];

export default function Docs() {
  return <main className="mx-auto max-w-3xl px-4 py-12 text-white sm:px-6">
    <p className="text-xs uppercase tracking-widest text-white/60">Stellar Mainnet · Circle USDC</p>
    <h1 className="mt-4 text-4xl font-semibold tracking-tight">Agent payments within your limits.</h1>
    <p className="mt-5 text-base leading-7 text-white/70">Authorize a recipient, spending cap, and expiry. The agent pays through MandateRegistry, which checks those limits before transferring funds.</p>
    <section className="mt-10 space-y-5" aria-label="Review the flow">
      <h2 className="text-xl font-semibold">Review the flow</h2>
      <p><Link className="underline underline-offset-4" href="/wallet">Open the wallet</Link><span className="text-white/60"> — choose a service, authorize its limit with Freighter, and inspect the result and receipts. Mainnet purchases use real USDC and XLM fees.</span></p>
      <p><Link className="underline underline-offset-4" href="/cli">Run the CLI reference agents</Link><span className="text-white/60"> — three purchases, then rejection at the spending limit. Review the funding amounts before signing.</span></p>
      <p><Link className="underline underline-offset-4" href="/security">Inspect security evidence</Link><span className="text-white/60"> — recorded tests, threat model, source, and Mainnet verification.</span></p>
    </section>
    <section className="mt-10 border-t border-white/15 pt-6">
      <h2 className="text-xl font-semibold">Published packages</h2>
      <ul className="mt-4 space-y-3">{packages.map(([name, version, purpose]) => <li key={name}><a className="font-mono text-sm underline underline-offset-4" href={`https://www.npmjs.com/package/@ackrate/${name}/v/${version}`}>@ackrate/{name} {version}</a><p className="mt-1 text-sm text-white/60">{purpose}</p></li>)}</ul>
      <p className="mt-5 text-sm leading-6 text-white/70">Start with the <a className="underline" href="https://github.com/ackrate/ackrate-protocol/blob/a229f8d232567a4f5de812b43f72e2120e243acf/docs/mainnet-configuration.md">Mainnet configuration guide</a> for installation, funded signing identities, and payment consent.</p>
    </section>
    <section className="mt-10 border-t border-white/15 pt-6">
      <h2 className="text-xl font-semibold">Contract and boundaries</h2>
      <a className="mt-4 block break-all font-mono text-xs underline" href={`https://stellar.expert/explorer/public/contract/${CONTRACT}`}>{CONTRACT}</a>
      <p className="mt-4 text-sm leading-6 text-white/70">The allowance belongs to the contract. Administration uses native 2-of-3 authorization; this deployment has no timelock. Wallet-to-relay and relay-to-seller payments are separate settlements.</p>
      <details className="mt-6"><summary className="cursor-pointer py-2 text-sm">Integration and Testnet guides</summary><div className="mt-3 flex flex-wrap gap-5 text-sm underline"><Link href="/express">Express</Link><Link href="/ap2">AP2</Link><Link href="/solutions">Starter projects</Link></div></details>
    </section>
  </main>;
}

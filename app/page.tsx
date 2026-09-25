import Link from "next/link";

export default function Home() {
  return <main className="editorial-page">
    <div className="editorial-wrap">
      <section className="landing-hero">
        <p className="eyebrow">REAPP · Powered by ACKRATE SDK</p>
        <h1>Agent payments.<br />Your limits.</h1>
        <p className="landing-intro">Give an agent a budget on Stellar. You choose the merchant, spending limit, and expiry. MandateRegistry enforces them on-chain.</p>
        <div className="editorial-actions"><Link className="primary-action" data-brand="action" href="/wallet">Open consumer app <span aria-hidden="true">↗</span></Link><Link href="/docs">Developer docs <span aria-hidden="true">→</span></Link></div>
        <p className="caption">Stellar Mainnet · Circle USDC · Purchases use real funds and XLM fees.</p>
      </section>
      <section className="landing-flow" aria-label="How it works">
        <div data-brand="action"><span className="eyebrow">01 / Authorize</span><h2>Set the boundary.</h2><p>Connect Freighter, choose a service, and approve its budget.</p></div>
        <div><span className="eyebrow">02 / Pay</span><h2>Let the agent work.</h2><p>The contract checks each payment against your mandate.</p></div>
        <div><span className="eyebrow">03 / Verify</span><h2>Inspect the result.</h2><p>Review the delivered output and its Stellar transaction receipts.</p></div>
      </section>
      <section className="landing-foundation"><h2>Built on Stellar.<br />Open to inspection.</h2><div><p>REAPP uses ACKRATE SDK, ACKRATE CLI, and MandateRegistry. The SDK and CLI are published under @ackrate following the REAPP SDK rename.</p><p>Release checks cover contract authorization, payment recovery, strict TypeScript, and dependency advisories.</p><a href="https://github.com/ackrate/ackrate-protocol-contracts/blob/main/docs/mainnet-v2-security-verification.md">Testing and verification on GitHub →</a></div></section>
    </div>
  </main>;
}

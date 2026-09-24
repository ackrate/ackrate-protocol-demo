"use client";
import { useState } from "react";
import { HACKATHON_STARTER_CATALOG } from "@/lib/hackathon-starters.generated";
import { buildStarterInstallCommand } from "@/lib/starter-install";
import STARTER_MANIFEST from "@/public/starters/v1/manifest.json";

export default function QuickStarters() {
  const [slug, setSlug] = useState<string>("research-source-scout");
  const [shell, setShell] = useState<"posix" | "powershell">("posix");
  const [copyState, setCopyState] = useState("");
  const kit = HACKATHON_STARTER_CATALOG.kits.find((item) => item.slug === slug)!;
  const archive = STARTER_MANIFEST.kits.find((item) => item.slug === slug)!;
  const command = buildStarterInstallCommand(archive, { shell });
  async function copy() {
    try { await navigator.clipboard.writeText(command); setCopyState("Copied"); }
    catch { setCopyState("Copy failed. Select the command below to copy it manually."); }
  }
  return <><p className="eyebrow">Docs / Quick starters</p><h1>Run the whole flow.</h1>
    <p className="lead">A consumer agent buys a protected resource from a local Express API. The SDK handles the payment; the starter verifies delivery and a failure or recovery case.</p>
    <p>Stellar Testnet · XLM demo funds · Node.js 20+ · No wallet required.</p>
    <label className="field-label" htmlFor="starter">Choose a starter</label><select id="starter" value={slug} onChange={(event) => { setSlug(event.target.value); setCopyState(""); }}>{HACKATHON_STARTER_CATALOG.kits.map((item) => <option key={item.slug} value={item.slug}>{item.title}</option>)}</select>
    <h2>{kit.title}</h2><p>{kit.summary}</p><p><strong>Verified outcome:</strong> {kit.negativePath.outcome}</p>
    <h2>1. Set up an empty folder</h2>
    <label className="field-label" htmlFor="shell">Terminal</label><select id="shell" value={shell} onChange={(event) => { setShell(event.target.value as "posix" | "powershell"); setCopyState(""); }}><option value="posix">Mac / Linux</option><option value="powershell">Windows PowerShell</option></select>
    <pre><code>{command}</code></pre><button className="secondary-action" onClick={copy}>Copy setup command</button><span className="copy-status" role="status">{copyState}</span>
    <p>The installer verifies the ZIP’s SHA-256 before extraction, then runs <code>npm ci</code>. <a href={archive.archive}>Download ZIP</a> · <a href="/starters/v1/manifest.json">Integrity manifest</a></p>
    <h2>2. Run</h2><pre><code>npm run demo</code></pre><p>The SDK script prints one-line status updates and a Stellar explorer link for each delivered payment. Structured recovery evidence stays in <code>.ackrate/</code>; do not delete it to retry an interrupted payment.</p>
    <h2>3. Adapt</h2><p>Edit <code>scenario/scenario.mjs</code> for the business rules, <code>src/consumer.mjs</code> for the SDK runner, and <code>src/fulfillment.mjs</code> for the paid resource.</p>
    <p><a href={`https://github.com/ackrate/ackrate-protocol-demo/blob/main/starters/${kit.slug}/README.md`}>Read the README →</a></p>
    <details><summary>Package versions and hosted example</summary><p>These starters intentionally pin the Testnet package family: core 0.3.1, stellar 0.2.2, AP2 0.3.0, and Express middleware 0.2.2. Use the SDK guide for Mainnet.</p><p>The Research Source Scout README also documents an <a href="/docs/hosted">optional hosted Express walkthrough</a>. Local execution is the default.</p></details>
  </>;
}

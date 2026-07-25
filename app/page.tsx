"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Package, Play, Terminal } from "lucide-react";

// The permanent same-address MandateRegistry the installed SDK and the
// vendored CLI actually settle against. Guarded in tests/hackathon.test.mjs.
const CONTRACT_ID = "CCHQ5G4Y4YBMY6D3TYYJSVJVCKUM22Q6TMKCCHVAHY4X7K6QELQACZRM";

const INSTALL = `npm install @reapp-sdk/core@0.3.1 @reapp-sdk/stellar@0.2.2 \\
  @reapp-sdk/ap2@0.3.0 @reapp-sdk/express-middleware@0.2.2 \\
  @stellar/stellar-sdk express
npm install --global reapp-protocol-cli@0.1.7`;

const CLEAN_CLONE = `git clone https://github.com/reapp-protocol/reapp-protocol.git
cd reapp-protocol
npm ci
npm run agents:testnet`;

const CONSUMER = `import { getSettlementReceipt, reapp } from "@reapp-sdk/core";

const agent = reapp.agent({
  mandate,
  signer: agentSecret,
  proofPolicy: "bound-v2-only",
  receiptStore,
});
const response = await agent.fetch(\`\${serverUrl}/source/\${id}\`);
const receipt = getSettlementReceipt(response);
const resource = await response.json();
await persistAcceptedResult(resource, receipt);
await agent.acknowledgeDelivery(receipt);`;

const FULFILLMENT = `import express from "express";
import {
  InMemoryBoundRedemptionStore,
  createBoundReappPaidJsonRoute,
} from "@reapp-sdk/express-middleware";

const app = express();
// Demo only. Use a durable, shared BoundRedemptionStore in production.
const redemptionStore = new InMemoryBoundRedemptionStore();
const paidSource = createBoundReappPaidJsonRoute({
  merchant: process.env.REAPP_MERCHANT_ADDRESS!,
  sourceAccount: process.env.REAPP_READ_SOURCE_ADDRESS!,
  audience: "https://api.example",
  challengeSecret: process.env.REAPP_CHALLENGE_SECRET!,
  redemptionStore,
  amount: "1.00",
  resource: (request) => request.originalUrl,
}, async ({ request, payment }) => ({
  body: {
    ok: true,
    resource: request.params.id,
    settledTx: payment.txHash,
    data: "protected value",
  },
}));

app.get("/source/:id", paidSource);`;

const PACKAGES: [string, string][] = [
  ["@reapp-sdk/core 0.3.1", "Mandates, contract-enforced payments, and bound-v2 agent.fetch()"],
  ["@reapp-sdk/stellar 0.2.2", "Typed contract client, testnet config, signers, and token helpers"],
  ["@reapp-sdk/ap2 0.3.0", "Signed, version-pinned AP2 IntentMandate validation"],
  ["@reapp-sdk/express-middleware 0.2.2", "Exact-request proof verification and safe same-resource recovery"],
  ["reapp-protocol-cli 0.1.7", "Terminal setup, mandate, payment, reconciliation, and demo commands"],
];

const RESULT: [string, string][] = [
  ["Sources 1–3", "Each settles 1 XLM and is served after Express verifies the payment"],
  ["Source 4", "The contract rejects it because the 3 XLM mandate budget is exhausted"],
  ["Final balance", "The merchant receives exactly 3 XLM; the fourth resource stays locked"],
];

const fade = (d = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay: d, ease: "easeOut" as const },
});

export default function Docs() {
  return (
    <main className="relative mx-auto w-full max-w-3xl px-4 py-12 sm:px-5">
      <div className="glow" aria-hidden />

      <motion.div {...fade()}>
        <div className="inline-flex items-center gap-2 rounded-full glass px-3.5 py-1.5 text-[11px] font-semibold tracking-[0.18em] text-emerald-300/90">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
          @reapp-sdk/core 0.3.1 · DOCS
        </div>
        <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-6xl">
          Agent payments,{" "}
          <span className="bg-gradient-to-r from-emerald-300 to-teal-300 bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(52,211,153,0.25)]">end to end</span>.
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-emerald-100/70 sm:text-base">
          A user signs a scoped budget, a consumer pays with <code>agent.fetch()</code>, and an Express API verifies
          the on-chain settlement before serving. MandateRegistry remains the authority for every spend.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/express" className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-[#06241a] shadow-[0_0_28px_rgba(52,211,153,0.35)] transition hover:bg-emerald-300">
            <Play className="h-4 w-4" aria-hidden />
            Run the Express flow
          </Link>
          <a href="https://www.npmjs.com/package/@reapp-sdk/core" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-emerald-100/80 transition hover:border-emerald-400/40 hover:text-emerald-100">
            <Package className="h-4 w-4" aria-hidden />
            @reapp-sdk/core 0.3.1
          </a>
        </div>
      </motion.div>

      <motion.section {...fade(0.06)} className="mt-10 rounded-2xl border border-emerald-300/15 bg-black/30 p-5 shadow-[0_0_48px_rgba(16,185,129,0.12)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <div className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-emerald-400 text-[#06241a]">
              <Terminal className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-emerald-100">Clean-clone testnet run</h2>
              <p className="mt-1 text-sm leading-relaxed text-emerald-100/65">
                Clone the protocol repository, install its locked dependencies, then run{" "}
                <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[12px] text-emerald-100">npm run agents:testnet</code>.
                No local keys or environment file are required.
              </p>
            </div>
          </div>
          <Link href="/express" className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-xl border border-emerald-400/30 px-4 py-2.5 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/10">
            Open guide
          </Link>
        </div>
      </motion.section>

      <motion.section {...fade(0.08)} className="mt-9">
        <H>Install the current toolkit</H>
        <Code>{INSTALL}</Code>
      </motion.section>

      <motion.section {...fade(0.11)} className="mt-8">
        <H>Run from a clean clone</H>
        <Code>{CLEAN_CLONE}</Code>
        <p className="mt-3 text-sm text-emerald-100/60">
          The script creates and funds fresh testnet actors, signs a 3 XLM mandate, starts the protected Express API,
          and drives four sequential purchases through <code>agent.fetch()</code>.
        </p>
      </motion.section>

      <motion.section {...fade(0.14)} className="mt-8">
        <H>Consumer: pay with agent.fetch()</H>
        <Code>{CONSUMER}</Code>
        <p className="mt-3 text-sm text-emerald-100/60">
          A 402 response carries an exact-request challenge. The SDK checks it against the mandate, settles through{" "}
          <code>MandateRegistry.execute_payment</code>, then signs the challenge and transaction with the mandate agent.
        </p>
      </motion.section>

      <motion.section {...fade(0.17)} className="mt-8">
        <H>Express: verify before serving</H>
        <Code>{FULFILLMENT}</Code>
        <p className="mt-3 text-sm text-emerald-100/60">
          The paid JSON route verifies challenge authentication, the exact origin and GET resource, the configured
          network, successful transaction, MandateRegistry event, matching SEP-41 transfer, and the chain-derived agent
          signature before the route handler runs. The redemption store prevents one transaction from authorizing a
          fresh challenge; the same signed proof may recover only the same idempotent resource. Use a durable shared
          store in production.
        </p>
      </motion.section>

      <motion.section {...fade(0.2)} className="mt-8">
        <H>What the testnet run proves</H>
        <div className="overflow-hidden rounded-xl border border-white/10">
          {RESULT.map(([step, result], i) => (
            <div key={step} className={`flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${i % 2 ? "bg-white/[0.02]" : ""}`}>
              <code className="text-xs text-emerald-300">{step}</code>
              <span className="text-xs text-emerald-100/60 sm:max-w-[55%] sm:text-right">{result}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-emerald-100/60">
          Three resources are paid for and served. The fourth payment is rejected on-chain with the budget exhausted,
          so the fourth resource is not delivered.
        </p>
      </motion.section>

      <motion.section {...fade(0.23)} className="mt-8">
        <H>Current release targets</H>
        <div className="overflow-hidden rounded-xl border border-white/10">
          {PACKAGES.map(([name, purpose], i) => (
            <div key={name} className={`flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${i % 2 ? "bg-white/[0.02]" : ""}`}>
              <code className="text-xs text-emerald-300">{name}</code>
              <span className="text-xs text-emerald-100/60 sm:max-w-[55%] sm:text-right">{purpose}</span>
            </div>
          ))}
        </div>
      </motion.section>

      <motion.section {...fade(0.26)} className="mt-8">
        <H>Current testnet contract</H>
        <a
          href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`}
          target="_blank"
          rel="noreferrer"
          className="block break-all rounded-xl border border-white/10 bg-black/25 p-4 font-mono text-xs text-emerald-300 transition hover:border-emerald-400/40"
        >
          {CONTRACT_ID}
        </a>
        <p className="mt-3 text-sm text-emerald-100/60">
          This is the current upgradeable simple MandateRegistry used by the public testnet configuration. The contract
          re-checks caller, merchant scope, asset, budget, expiry, and sequence for every payment.
        </p>
      </motion.section>

      <motion.section {...fade(0.29)} className="mt-8">
        <H>Verification boundary</H>
        <ul className="space-y-2 text-sm text-emerald-100/70">
          {[
            "The user approves the SEP-41 allowance for the contract, never for the agent or SDK.",
            "MandateRegistry validates and consumes authorization before the token transfer in one transaction.",
            "The Express middleware independently verifies contract and transfer evidence before fulfillment.",
            "Repository tests and the gate check cover allowed payments and contract-enforced rejection paths.",
          ].map((text) => (
            <li key={text} className="flex gap-2">
              <span className="mt-0.5 text-emerald-400">✓</span> {text}
            </li>
          ))}
        </ul>
      </motion.section>

      <motion.div {...fade(0.32)} className="mt-10 flex flex-wrap gap-3">
        <Link href="/express" className="rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-[#06241a] hover:bg-emerald-300">Open the Express guide →</Link>
        <a href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`} target="_blank" rel="noreferrer" className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-emerald-100/80 hover:border-emerald-400/40">View contract ↗</a>
        <a href="https://github.com/reapp-protocol/reapp-protocol" target="_blank" rel="noreferrer" className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-emerald-100/80 hover:border-emerald-400/40">Protocol repository ↗</a>
      </motion.div>
    </main>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-lg font-semibold text-emerald-100">{children}</h2>;
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl glass bg-black/25 p-4 text-xs leading-relaxed text-emerald-100/90">
      <code>{children}</code>
    </pre>
  );
}

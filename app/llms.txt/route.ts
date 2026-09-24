export const dynamic = "force-static";

export function GET() {
  const text = `# ACKRATE

> Open-source agentic payments infrastructure: bounded mandates, TypeScript SDKs, Express verification, AP2 bridging, public Stellar testnet demonstrations, and a Mainnet Circle USDC wallet canary.

ACKRATE separates adaptive agent planning from deterministic financial authority. A principal grants a scoped mandate; the contract and verification layers enforce merchant, asset, budget, expiry, sequence, and resource constraints. The live site demonstrates both permitted payments and contract-enforced rejection paths.

## Start here

- [ACKRATE SDK documentation](https://reapp.live/docs/sdk): Install the published packages and understand the end-to-end consumer and merchant flow.
- [Consumer product preview](https://reapp.live/consumer): Give an AI agent a task while retaining explicit control over its budget, approved services, deadline, and exceptions.
- [Express payment flow](https://reapp.live/express): Historical August Mainnet fulfillment using the earlier PAGS registry; current wallet prices require a fresh quote.
- [Merchant assurance](https://reapp.live/merchants): Legacy registry and timelock reference; use /security for current WR registry evidence and its no-timelock boundary.
- [Contract Security Suite](https://reapp.live/security): Reproduce the 53-check Mainnet V2 contract gate, inspect trust boundaries and dependency results, and follow every claim to source and chain evidence.
- [Quick starters](https://reapp.live/docs/quickstarts): Start from an empty folder, run a local consumer against hosted fulfillment, and inspect matching testnet evidence.
- [AP2 mandate bridge](https://reapp.live/ap2): Canonical intent and transaction mandate checks, signatures, scope, expiry, and replay protection.
- [CLI](https://reapp.live/cli): Initialize actors, create a mandate, pay, inspect evidence, and exercise rejection paths.
- [Wallet canary](https://reapp.live/wallet): Connect Freighter on Stellar Mainnet, set a Circle USDC spending limit, buy a protected report, and inspect each transaction.

## Live demonstrations

- [Research agent](https://reapp.live/research): An AI agent buys paid sources until the on-chain budget is exhausted.
- [Video paywall](https://reapp.live/video): Three permitted pay-per-use unlocks followed by a rejected fourth payment.
- [Composite mandates](https://reapp.live/composites): Multiple agents coordinate a group buy and atomic clearing result.
- [Toolkit preview](https://reapp.live/toolkit): Guided access to the CLI runner and composite-payment demonstrations.

## Published package set and source

- [@ackrate/core 0.4.1](https://www.npmjs.com/package/@ackrate/core): Mandates, contract-enforced payments, and agent.fetch().
- [@ackrate/stellar 0.3.0](https://www.npmjs.com/package/@ackrate/stellar): Typed Stellar contract client, signers, verified Mainnet manifest support, and network configuration.
- [@ackrate/ap2 0.4.0](https://www.npmjs.com/package/@ackrate/ap2): Version-pinned AP2 mandate bridge.
- [@ackrate/express-middleware 0.3.0](https://www.npmjs.com/package/@ackrate/express-middleware): Express settlement and redemption verification.
- [@ackrate/cli 0.2.1](https://www.npmjs.com/package/@ackrate/cli): Terminal workflows plus fail-closed testnet and Mainnet demonstrations.
- [Protocol repository](https://github.com/ackrate/ackrate-protocol): Contracts, SDK packages, tests, and examples.
- [Full implementation context](https://reapp.live/llms-full.txt): One plain-text technical brief for assistants working with the protocol.

These published versions target the WR Mainnet registry. Review network, signing configuration, and payment consent before execution.

## Research companion

- [ACKRATE NETWORK](https://ackrate.network/): Independent research and architecture field guide for agentic payments.
- [Agentic payments field guide](https://ackrate.network/agentic-payments): Definitions, lifecycle, protocols, controls, and implementation model.

The public research, video, composite, and starter demonstrations use Stellar testnet; the /cli page uses Stellar Mainnet. The /wallet canary uses Stellar Mainnet, the manifest-pinned MandateRegistry, Circle USDC, and Freighter authorization. Never paste a recovery phrase or private key into the site. Verify package publication, contract identifiers, and network configuration against the visible page and source repository.
`;

  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}

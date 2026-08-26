export const dynamic = "force-static";

export function GET() {
  const text = `# ACKRATE

> Open-source agentic payments infrastructure: bounded mandates, TypeScript SDKs, Express verification, AP2 bridging, and live Stellar testnet demonstrations.

ACKRATE separates adaptive agent planning from deterministic financial authority. A principal grants a scoped mandate; the contract and verification layers enforce merchant, asset, budget, expiry, sequence, and resource constraints. The live site demonstrates both permitted payments and contract-enforced rejection paths.

## Start here

- [ACKRATE SDK documentation](https://reapp.live/): Install the published packages and understand the end-to-end consumer and merchant flow.
- [Consumer product preview](https://reapp.live/consumer): Give an AI agent a task while retaining explicit control over its budget, approved services, deadline, and exceptions.
- [Express payment flow](https://reapp.live/express): Pay-per-use API fulfillment with settlement and one-time redemption verification.
- [Merchant assurance](https://reapp.live/merchants): Inspect Mainnet contract tests, deployment evidence, trust boundaries, and merchant verification controls.
- [Solutions and starter kits](https://reapp.live/solutions): Start from an empty folder, run a local consumer against hosted fulfillment, and inspect matching testnet evidence.
- [AP2 mandate bridge](https://reapp.live/ap2): Canonical intent and transaction mandate checks, signatures, scope, expiry, and replay protection.
- [CLI](https://reapp.live/cli): Initialize actors, create a mandate, pay, inspect evidence, and exercise rejection paths.

## Live demonstrations

- [Research agent](https://reapp.live/research): An AI agent buys paid sources until the on-chain budget is exhausted.
- [Video paywall](https://reapp.live/video): Three permitted pay-per-use unlocks followed by a rejected fourth payment.
- [Composite mandates](https://reapp.live/composites): Multiple agents coordinate a group buy and atomic clearing result.
- [Toolkit preview](https://reapp.live/toolkit): Guided access to the CLI runner and composite-payment demonstrations.

## Packages and source

- [@ackrate/core](https://www.npmjs.com/package/@ackrate/core/v/0.3.1): Mandates, contract-enforced payments, and agent.fetch().
- [@ackrate/stellar](https://www.npmjs.com/package/@ackrate/stellar/v/0.2.2): Typed Stellar contract client, signers, and network configuration.
- [@ackrate/ap2](https://www.npmjs.com/package/@ackrate/ap2/v/0.3.0): Version-pinned AP2 mandate bridge.
- [@ackrate/express-middleware](https://www.npmjs.com/package/@ackrate/express-middleware/v/0.2.2): Express settlement and redemption verification.
- [@ackrate/cli](https://www.npmjs.com/package/@ackrate/cli/v/0.1.9): Terminal workflows and testnet demos.
- [Protocol repository](https://github.com/ackrate/ackrate-protocol): Contracts, SDK packages, tests, and examples.
- [Full implementation context](https://reapp.live/llms-full.txt): One plain-text technical brief for assistants working with the protocol.

## Research companion

- [ACKRATE NETWORK](https://ackrate.network/): Independent research and architecture field guide for agentic payments.
- [Agentic payments field guide](https://ackrate.network/agentic-payments): Definitions, lifecycle, protocols, controls, and implementation model.

The live site uses Stellar testnet and ephemeral demonstration actors. Never use production secrets or mainnet credentials in these demos. Verify current package versions, contract identifiers, and network configuration against the visible page and source repository.
`;

  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}

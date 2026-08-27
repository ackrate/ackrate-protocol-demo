export const dynamic = "force-static";

export function GET() {
  const text = `# ACKRATE — full implementation context

> Technical context for building, testing, and explaining bounded agentic payments with ACKRATE.

Canonical site: https://reapp.live/
Source: https://github.com/ackrate/ackrate-protocol
Research companion: https://ackrate.network/
Environment: public research, video, composite, CLI, and starter demonstrations use Stellar testnet; the /wallet canary uses Stellar Mainnet, Circle USDC, and Freighter authorization.

## What ACKRATE is

ACKRATE is an open-source protocol and TypeScript SDK for agentic payments. It lets adaptive software propose and initiate payments while deterministic controls retain authority. The principal signs or establishes a mandate. The agent receives only the ability required to act within that mandate. The on-chain MandateRegistry checks the caller, merchant, asset, remaining budget, expiry, and sequence before a token transfer can complete.

The architecture is intentionally split. The model can research, compare, plan, and choose tools. It does not define its own financial permission. The policy and contract layers decide whether the exact proposed effect is allowed. Merchant middleware verifies independent settlement evidence before returning a protected resource.

## End-to-end transaction model

1. A principal's goal is normalized into a mandate with typed constraints.
2. The user authorizes the mandate and the contract receives the narrow token allowance required for its budget.
3. An agent selects a resource or merchant action and proposes an exact payment.
4. The ACKRATE SDK checks the proposal against the mandate and submits the contract call.
5. MandateRegistry validates caller, merchant, asset, amount, expiry, status, and sequence in the transaction.
6. The contract consumes the authorization and executes the SEP-41 token transfer atomically.
7. Merchant middleware checks the configured network, successful transaction, contract event, matching transfer, resource scope, and redemption state.
8. The merchant serves only after verification and records the settlement evidence used for fulfillment.

The fourth payment in a three-payment budget is not a UI simulation. The contract rejects it because the remaining authority is insufficient. Revocation and replay cases follow the same deterministic deny path.

## Current candidate package set

- @ackrate/core 0.3.3: mandate construction, registration, payment helpers, and agent.fetch().
- @ackrate/stellar 0.2.5: typed contract client, verified Mainnet manifest support, Stellar network configuration, signers, token helpers, and explorer integration.
- @ackrate/ap2 0.3.2: AP2 IntentMandate and TransactionMandate translation with pinned canonicalization and validation behavior.
- @ackrate/express-middleware 0.2.4: HTTP payment challenge, settlement verification, protected-route integration, and one-time redemption controls for Express 4 and 5.
- @ackrate/cli 0.1.10: terminal setup, mandate, payment, inspection, and fail-closed testnet and Mainnet demonstration commands.

These are the current source-repository candidate versions. Confirm publication at the npm registry before copying an installation command because publication can trail the repository candidate.

## Public routes

### Documentation — https://reapp.live/

The documentation page shows a clean-clone testnet run, published package installation, the agent.fetch() consumer flow, Express verification middleware, current testnet contract reference, and the verification boundary. It is the canonical implementation entry point.

### CLI — https://reapp.live/cli

The CLI surface demonstrates actor setup, mandate creation, payment submission, inspection, and rejection paths from the terminal. CLI output should be treated as an interface over contract and rail evidence, not as the source of truth for settlement.

### Consumer — https://reapp.live/consumer

The Consumer page previews a person-facing task flow for giving an AI agent a job without giving it a blank check. A person chooses the outcome, hard budget limit, approved services, deadline, and exception rule. The interactive spending controls translate those choices into a plain-language plan; the preview does not create a wallet, sign a transaction, or move funds.

### Express — https://reapp.live/express

The Express flow demonstrates pay-per-use API fulfillment. A 402 response describes a scoped requirement; the consumer checks it against the mandate, settles, and retries with proof. The middleware verifies the ACKRATE event and token transfer before the route handler can return the protected value. Production deployments need a shared durable redemption store across workers.

### Merchant assurance — https://reapp.live/merchants

The Merchants page maps unauthorized caller, expiry, overspend, replay, unauthorized upgrade, and reentrancy cases to the exact governed Mainnet Rust tests. It links the live MandateRegistry and TimelockController, completed deployment record, release manifest, continuous contract gate, artifact provenance, and one-command local reproduction path. The page presents repository evidence; the contract remains the payment authority.

### Contract Security Suite — https://reapp.live/security

The Contract Security Suite is the public release-gate evidence surface for Ackrate's Mainnet contracts. It maps named negative paths to exact Rust tests, documents the registry enforcement boundary and atomic USDC data flow, links dependency results and the live governed contracts, and provides a reproducible local gate command. The Mainnet suites contain 23 MandateRegistry tests and 11 TimelockController tests, for 34 total contract tests. The latest required workflow and versioned report are authoritative for dependency status.

### Mainnet wallet canary — https://reapp.live/wallet

The wallet canary connects a Freighter G-account on Stellar Mainnet. A person chooses a small Circle USDC spending limit, signs mandate registration and contract allowance transactions, and then lets the consumer agent request a protected report. MandateRegistry re-checks the caller, merchant, asset, amount, expiry, status, and sequence before every payment. The page links registration, allowance, payment, and shutdown transactions to Stellar Explorer. Disconnecting first turns off any active spending limit, then clears the browser session.

### Solutions and starter kits — https://reapp.live/solutions

The Hackathon starter creates a disposable hosted fulfillment workspace and generates two commands for a clean VS Code folder. The local consumer owns its ephemeral signers, registers a scoped testnet mandate, inspects the exact 402 challenge, submits the request-bound contract payment, and retries delivery with the stored receipt. It streams the resulting challenge, settlement, proof, delivery, budget, and rejection evidence back to the browser page. The generated project includes editable consumer and fulfillment source files plus guided examples for merchant scope, expiry, replay defense, recovery, and explorer evidence.

### AP2 — https://reapp.live/ap2

The AP2 page demonstrates canonical mandate binding and negative cases. It covers signature validity, merchant mismatch, amount limits, expiry, and replay. AP2 artifacts represent intent and transaction authority; ACKRATE maps those artifacts into enforceable payment constraints rather than treating signed text as unlimited permission.

### Research agent — https://reapp.live/research

The research agent can autonomously buy paid sources. Each purchase consumes the same bounded mandate. It may decide that another source is useful, but the contract rejects purchases after the budget is exhausted. The final answer is therefore constrained by both available evidence and financial authority.

### Video paywall — https://reapp.live/video

The video demonstration prices each unlock at 1 XLM under a 3 XLM mandate. Three items can be settled and unlocked. A fourth attempt is rejected by the contract. The flow makes budget consumption and explorer evidence visible.

### Composite mandates — https://reapp.live/composites

The composite demonstration coordinates multiple buyer agents in one group purchase. Commitments and a clearing condition are joined into an atomic settlement outcome. It is a specialized coordination example, not a replacement for principal-level authority or merchant fulfillment evidence.

## Security boundary

- The language model never receives authority merely because its output is plausible.
- User, agent, merchant, contract, asset, amount, expiry, and sequence are explicit inputs to enforcement.
- Credentials and signing operations remain outside untrusted page and model content.
- Repeated fulfillment requires durable redemption controls; process-local state is demonstration-only.
- Provider acknowledgement is not automatically settlement, and settlement is not automatically fulfillment.
- Test both allowed and denied paths against the same contract and middleware used by the application.
- Public testnet demos use disposable actors. The Mainnet wallet canary asks Freighter to sign and must never receive a recovery phrase or private key.

## Relationship to ACKRATE NETWORK

ACKRATE at https://reapp.live is the live implementation and demonstration surface. ACKRATE NETWORK at https://ackrate.network is the research and architecture publication. They share ownership and link to each other transparently. Product behavior should be verified against the ACKRATE source repository; market and protocol claims should be checked against the primary sources cited by ACKRATE NETWORK.
`;

  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "X-Robots-Tag": "noindex, follow",
    },
  });
}

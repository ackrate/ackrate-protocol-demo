# Coding Agent Purchase Hook

**The shared live consumer verifies the fixed price, settles once, retries the paid request once, and verifies the returned patch hash; an offline hook vector rejects a repeated 402 in the settled state.**

This starter protects `GET /artifacts/:issueId/patch` with a request-bound payment on Stellar testnet. The app asks; the MandateRegistry contract decides whether money moves.

## Run locally

You need Node.js 20 or newer. You do not need a wallet or a GitHub repo.

### If you used Copy setup command

The setup command on [reapp.live/docs/quickstarts](https://reapp.live/docs/quickstarts) already downloaded this starter, extracted it into your empty folder, and ran `npm ci`. Before extraction, it verified the ZIP against the exact SHA-256 in the [public integrity manifest](https://reapp.live/starters/v1/manifest.json). In the same VS Code terminal, run:

```bash
npm run demo
```

### If you downloaded the ZIP manually

Compare its SHA-256 with the [public integrity manifest](https://reapp.live/starters/v1/manifest.json), extract the ZIP, open a terminal in the extracted folder, then run:

```bash
npm ci
npm run demo
```

The demo creates disposable testnet accounts, starts the consumer and Express fulfillment service, and prints concise status lines and transaction links. It never requests a wallet or mainnet secret.

## What the run verifies

No real money is used. The consumer receives HTTP 402, pays through the contract, and receives HTTP 200 with the protected result. The SDK runner prints one-line status updates and transaction links.

The terminal shows the local fulfillment server starting, accepted Stellar testnet payment evidence with explorer transaction hashes, the protected result delivered to the consumer, and the named negative or recovery check reaching its documented outcome.

```mermaid
sequenceDiagram
    autonumber
    participant You
    participant Agent as Consumer agent
    participant API as Express API
    participant Contract as MandateRegistry
    participant Stellar as Stellar testnet

    You->>Agent: Run npm run demo
    Agent->>API: GET protected result
    API-->>Agent: 402 Payment Required
    Agent->>Contract: Request the exact payment
    Contract->>Stellar: Verify the spending rules
    Stellar-->>Agent: Confirm payment
    Agent->>API: Retry with payment proof
    API-->>Agent: 200 + protected result
    Agent->>Agent: Verify the named safety or recovery check
```

## Scenario

- Paid resource: `GET /artifacts/:issueId/patch`
- Price policy: exact decimal amounts declared by the scenario
- Safety or recovery check: `repeated-payment-challenge`
- Expected outcome: The offline hook transition rejects a repeated 402 in the settled state instead of initiating another payment.
- Fixtures: Two issue identifiers with deterministic patch artifacts and computed SHA-256 values.

Serve a patch only for the allowlisted fixture host, verify its hash after delivery, and return atomic-write metadata without writing files; the repeated-402 hook check is an offline state-transition vector.

### Capabilities

- `verified-bound-purchase`
- `price-inspection`
- `durable-recovery`
- `explorer-evidence`

## Make it yours

Start with these three files:

| File | What to change |
|---|---|
| `scenario/scenario.mjs` | Your product's rules, sample data, delivery checks, and rejection check. |
| `src/consumer.mjs` | How your app requests and pays for the protected result. |
| `src/fulfillment.mjs` | What your paid Express endpoint returns. |

The shared payment and recovery code lives in `shared/`. Leave it unchanged until your project needs advanced customization.

## Run fulfillment separately

The one-command demo starts both sides automatically. To inspect or modify the server independently:

```bash
cp .env.example .env
# Put a funded Stellar testnet public G-address in ACKRATE_MERCHANT.
npm run fulfillment
```

Keep the challenge secret private and stable. The reference file store is for one local Node process; multi-process deployments need one shared linearizable store implementing the same interface.

## Safety and recovery

- Paid work is GET-only and bound to the exact origin, method, resource, merchant, asset, amount, registry, and short-lived challenge.
- Delivery evidence is committed before the client acknowledges and clears a settlement receipt.
- Exact same-proof replay returns byte-identical recovery; an old proof on a new resource is rejected, and a freshly rebound proof reusing an old transaction conflicts.
- State under `.ackrate/` is private and ignored by Git. Run `npm run reset` only after all payment and fulfillment evidence is resolved.

Catalog identity: `coding-agent-purchase-hook` · fixture policy: `deterministic-and-clearly-labeled`.

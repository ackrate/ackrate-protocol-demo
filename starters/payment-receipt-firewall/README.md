# Payment Receipt Firewall

**A reference merchant demonstrates persistent replay admission, exact request binding, and safe recovery after restart.**

This starter protects `GET /vault/:resourceId` with a request-bound payment on Stellar testnet. The app asks; the MandateRegistry contract decides whether money moves.

## Start — two commands, no wallet

You need Node.js 20 or newer. You do not need a wallet or a GitHub repo.

### If you used Copy setup command

The setup command on [reapp.live/solutions](https://reapp.live/solutions) already downloaded this starter, extracted it into your empty folder, and ran `npm ci`. Before extraction, it verified the ZIP against the exact SHA-256 in the [public integrity manifest](https://reapp.live/starters/v1/manifest.json). In the same VS Code terminal, run:

```bash
npm run demo
```

### If you downloaded the ZIP manually

Compare its SHA-256 with the [public integrity manifest](https://reapp.live/starters/v1/manifest.json), extract the ZIP, open the extracted folder in VS Code, select **Terminal → New Terminal**, then run:

```bash
npm ci
npm run demo
```

The demo creates disposable testnet accounts, starts the consumer and Express fulfillment service, and explains every step in plain English. It never requests a wallet or mainnet secret.

```mermaid
flowchart LR
    A["① Open an empty folder"] --> B["② Copy the setup command"]
    B --> C["③ Run npm run demo"]
    C --> D["④ Read the guided result"]
    D --> E["⑤ Open the Stellar proof links"]

    style A fill:#052e2b,stroke:#14b8a6,color:#ecfdf5
    style B fill:#082f49,stroke:#0ea5e9,color:#f0f9ff
    style C fill:#312e81,stroke:#818cf8,color:#eef2ff
    style D fill:#4c1d95,stroke:#a78bfa,color:#f5f3ff
    style E fill:#064e3b,stroke:#34d399,color:#ecfdf5
```

## What the terminal will teach you

The guided output uses six numbered steps and explains the important words:

1. **Testnet accounts** are temporary practice accounts. No real money is used.
2. **HTTP 402** means the API is working and requires payment.
3. **Contract approval** means the user's exact spending rules allowed the payment.
4. **HTTP 200** means the paid result was delivered.
5. **Stellar proof links** let anyone inspect each accepted payment.
6. **The safety check** proves this starter's named boundary or recovery behavior.

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

- Paid resource: `GET /vault/:resourceId`
- Price policy: exact decimal amounts declared by the scenario
- Safety or recovery check: `durable-replay-after-restart`
- Expected outcome: After restart the exact same proof returns the byte-identical stored response without repeating verification or paid fulfillment.
- Fixtures: Two stable vault resources; the live demo purchases one and reuses its exact Stellar testnet proof after restart.

Persist used-proof claims, compare origin, method, and resource, record exact response bytes before delivery, and recover the same claim after restart.

### Capabilities

- `replay-defense`
- `durable-recovery`
- `request-binding`
- `independent-verification`

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

Catalog identity: `payment-receipt-firewall` · fixture policy: `deterministic-and-clearly-labeled`.

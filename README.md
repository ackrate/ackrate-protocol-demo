# ⚡ ackrate-protocol-demo

**The live ACKRATE developer experience: 20 production-shaped starter packs for contract-enforced agent payments on Stellar testnet. The SDK prepares the request; the MandateRegistry contract decides whether money moves.**

---

## Choose from 20 starter packs

Share the full catalog with your team at **[reapp.live/solutions](https://reapp.live/solutions)**. Each starter name below opens a standalone README you can share directly; each ZIP link downloads that exact starter.

Every pack contains editable consumer and Express fulfillment source, deterministic fixtures, exact package versions, an offline gate check, a named rejection path, and a downloadable ZIP recorded in the [public SHA-256 manifest](https://reapp.live/starters/v1/manifest.json).

| # | Starter | Category | Level | Download |
|---:|---|---|---|---|
| 01 | [**Research Source Scout**](https://github.com/ackrate/ackrate-protocol-demo/blob/main/starters/research-source-scout/README.md) | Data APIs | Beginner | [ZIP](https://reapp.live/starters/v1/research-source-scout.zip) |
| 02 | [**Page Snapshot Meter**](https://github.com/ackrate/ackrate-protocol-demo/blob/main/starters/page-snapshot-meter/README.md) | Content infrastructure | Intermediate | [ZIP](https://reapp.live/starters/v1/page-snapshot-meter.zip) |
| 03 | [**Existing API Tollgate**](https://github.com/ackrate/ackrate-protocol-demo/blob/main/starters/api-tollgate/README.md) | Infrastructure | Beginner | [ZIP](https://reapp.live/starters/v1/api-tollgate.zip) |
| 04 | [**Paid Tool Gateway**](https://github.com/ackrate/ackrate-protocol-demo/blob/main/starters/paid-tool-gateway/README.md) | Agent tooling | Intermediate | [ZIP](https://reapp.live/starters/v1/paid-tool-gateway.zip) |
| 05 | [**Coding Agent Purchase Hook**](https://github.com/ackrate/ackrate-protocol-demo/blob/main/starters/coding-agent-purchase-hook/README.md) | Developer tooling | Intermediate | [ZIP](https://reapp.live/starters/v1/coding-agent-purchase-hook.zip) |
| 06 | [**Discoverable Service Bazaar**](https://github.com/ackrate/ackrate-protocol-demo/blob/main/starters/service-bazaar/README.md) | Discovery | Advanced | [ZIP](https://reapp.live/starters/v1/service-bazaar.zip) |
| 07 | [**Agent Reputation Snapshot**](https://github.com/ackrate/ackrate-protocol-demo/blob/main/starters/agent-reputation-snapshot/README.md) | Identity | Advanced | [ZIP](https://reapp.live/starters/v1/agent-reputation-snapshot.zip) |
| 08 | [**Multi-Agent Workflow Router**](https://github.com/ackrate/ackrate-protocol-demo/blob/main/starters/multi-agent-workflow/README.md) | Orchestration | Advanced | [ZIP](https://reapp.live/starters/v1/multi-agent-workflow.zip) |
| 09 | [**Verifiable Compute Broker**](https://github.com/ackrate/ackrate-protocol-demo/blob/main/starters/compute-broker/README.md) | Compute | Intermediate | [ZIP](https://reapp.live/starters/v1/compute-broker.zip) |
| 10 | [**Private Test Runner**](https://github.com/ackrate/ackrate-protocol-demo/blob/main/starters/private-test-runner/README.md) | Developer tooling | Intermediate | [ZIP](https://reapp.live/starters/v1/private-test-runner.zip) |
| 11 | [**Build Notary**](https://github.com/ackrate/ackrate-protocol-demo/blob/main/starters/build-notary/README.md) | Software supply chain | Advanced | [ZIP](https://reapp.live/starters/v1/build-notary.zip) |
| 12 | [**Model Route Bazaar**](https://github.com/ackrate/ackrate-protocol-demo/blob/main/starters/model-route-bazaar/README.md) | AI infrastructure | Advanced | [ZIP](https://reapp.live/starters/v1/model-route-bazaar.zip) |
| 13 | [**Rights Receipt**](https://github.com/ackrate/ackrate-protocol-demo/blob/main/starters/rights-receipt/README.md) | Creative commerce | Beginner | [ZIP](https://reapp.live/starters/v1/rights-receipt.zip) |
| 14 | [**Data Owner Gateway**](https://github.com/ackrate/ackrate-protocol-demo/blob/main/starters/data-owner-gateway/README.md) | Data commerce | Intermediate | [ZIP](https://reapp.live/starters/v1/data-owner-gateway.zip) |
| 15 | [**Human Review Outbox**](https://github.com/ackrate/ackrate-protocol-demo/blob/main/starters/human-review-outbox/README.md) | Operations | Advanced | [ZIP](https://reapp.live/starters/v1/human-review-outbox.zip) |
| 16 | [**Cold-Chain Passport**](https://github.com/ackrate/ackrate-protocol-demo/blob/main/starters/cold-chain-passport/README.md) | Supply chain | Intermediate | [ZIP](https://reapp.live/starters/v1/cold-chain-passport.zip) |
| 17 | [**Carbon-Aware Run Window**](https://github.com/ackrate/ackrate-protocol-demo/blob/main/starters/carbon-aware-run-window/README.md) | Sustainability | Intermediate | [ZIP](https://reapp.live/starters/v1/carbon-aware-run-window.zip) |
| 18 | [**Fleet Corridor Authority**](https://github.com/ackrate/ackrate-protocol-demo/blob/main/starters/fleet-corridor-authority/README.md) | Operations | Intermediate | [ZIP](https://reapp.live/starters/v1/fleet-corridor-authority.zip) |
| 19 | [**Payment Receipt Firewall**](https://github.com/ackrate/ackrate-protocol-demo/blob/main/starters/payment-receipt-firewall/README.md) | Security | Advanced | [ZIP](https://reapp.live/starters/v1/payment-receipt-firewall.zip) |
| 20 | [**Procurement Guard**](https://github.com/ackrate/ackrate-protocol-demo/blob/main/starters/procurement-guard/README.md) | Small-business automation | Beginner | [ZIP](https://reapp.live/starters/v1/procurement-guard.zip) |

### Make any starter yours

Start with three files; the payment and recovery machinery can stay untouched until you need advanced customization.

| File | What you change |
|---|---|
| `scenario/scenario.mjs` | Your product rules, fixtures, delivery checks, and rejection check. |
| `src/consumer.mjs` | How your app requests and pays for the protected result. |
| `src/fulfillment.mjs` | What your paid Express endpoint returns. |

---

## Start here: empty folder to a working testnet demo

Go to **[reapp.live/solutions](https://reapp.live/solutions)** and follow five steps:

1. **Choose one** of the 20 starter packs.
2. **Open an empty folder** in VS Code, then select **Terminal → New Terminal**.
3. Click **Use this starter**, then copy the setup command displayed for that pack.
4. Paste the command into the terminal and press **Enter**. It downloads the starter into the empty folder and installs its exact dependencies.
5. Run **`npm run demo`**, then open the Stellar testnet links printed in the terminal.

That is the complete beginner path. You do **not** need a wallet or a GitHub repository. The starter creates disposable testnet actors, and private signing material stays on your computer.

```mermaid
flowchart LR
    A["① Choose a starter"] --> B["② Open an empty VS Code folder"]
    B --> C["③ Copy its displayed setup command"]
    C --> D["④ Paste once and press Enter"]
    D --> E["⑤ Run npm run demo"]
    E --> F["⑥ Inspect Stellar testnet evidence"]

    style A fill:#052e2b,stroke:#14b8a6,color:#ecfdf5
    style B fill:#082f49,stroke:#0ea5e9,color:#f0f9ff
    style C fill:#312e81,stroke:#818cf8,color:#eef2ff
    style D fill:#4c1d95,stroke:#a78bfa,color:#f5f3ff
    style E fill:#064e3b,stroke:#34d399,color:#ecfdf5
    style F fill:#0f172a,stroke:#7b73ff,color:#f8fafc
```

### What the copied setup command does

The page shows one setup command for the starter you choose. Copy it as-is; it verifies the versioned ACKRATE installer, and that installer verifies the ZIP against its exact published SHA-256 before extracting anything. It then removes the temporary files and installs the locked dependencies. A changed or incomplete download is deleted before extraction.

When the setup command finishes, run:

```bash
npm run demo
```

In a recorded clean-room run, the default starter completed setup and its full demo in about 48 seconds. Network and package-cache speed vary, so “about 60 seconds” is a measured target, not a guarantee.

### Prefer to inspect a clone first?

The ZIPs are the shortest beginner path. Security reviewers can run the same generated starter directly from the public source repository:

```bash
git clone --depth 1 https://github.com/ackrate/ackrate-protocol-demo.git
cd ackrate-protocol-demo/starters/research-source-scout
npm ci
npm run demo
```

Every starter folder is self-contained. Replace `research-source-scout` with any of the other starter slugs in the table above.

### What success looks like

The terminal uses six numbered, plain-English steps. It explains that `402 Payment Required` means the API is protected—not broken—then shows contract-controlled settlement, the retried `200` response, full clickable Stellar explorer links, and the starter's named safety or recovery result. Set `ACKRATE_VERBOSE=1` only when you also want the underlying developer event names.

```mermaid
sequenceDiagram
    autonumber
    participant A as Consumer agent
    participant F as Express fulfillment
    participant M as MandateRegistry
    participant S as Stellar testnet

    A->>F: GET protected resource
    F-->>A: 402 Payment Required + bound challenge
    A->>M: Submit the exact contract payment
    M->>S: Verify authority and settle
    S-->>A: Confirmed transaction hash
    A->>F: Retry GET with bound proof
    F-->>A: 200 + paid result
    A->>M: Attempt the named negative path
    M-->>A: Reject outside mandate authority
```

The SDK and Express middleware are untrusted clients of the contract. Merchant scope, amount, expiry, replay state, and remaining authority are verified before paid work is delivered.

---

## Live protocol surfaces

This repository powers the implementation guide and inspectable demonstrations at [reapp.live](https://reapp.live):

| Surface | What it demonstrates |
|---|---|
| [**Docs**](https://reapp.live/) | SDK installation, consumer flow, Express verification, testnet execution, and safety boundary. |
| [**CLI**](https://reapp.live/cli) | Actor setup, mandate creation, payment, and terminal rejection paths. |
| [**Consumer**](https://reapp.live/consumer) | Give an AI agent a task, budget, approved services, and deadline without granting open-ended payment authority. |
| [**Express**](https://reapp.live/express) | `402` challenge, contract settlement, one-time redemption, and `200` fulfillment. |
| [**Solutions**](https://reapp.live/solutions) | Twenty blank-folder starters plus the optional hosted Research Source Scout walkthrough. |
| [**AP2**](https://reapp.live/ap2) | Intent and transaction mandate binding, canonical signatures, scope, expiry, and replay checks. |
| [**Composite mandates**](https://reapp.live/composites) | Multiple buyer agents coordinating an atomic group purchase. |
| [**Research agent**](https://reapp.live/research) | Paid-source selection constrained by an on-chain budget. |
| [**Video paywall**](https://reapp.live/video) | Three permitted unlocks followed by a contract-rejected fourth payment. |

Machine-readable maps are available at [`/llms.txt`](https://reapp.live/llms.txt), [`/llms-full.txt`](https://reapp.live/llms-full.txt), [`/sitemap.xml`](https://reapp.live/sitemap.xml), and [`/robots.txt`](https://reapp.live/robots.txt).

ACKRATE is the live implementation companion to [ACKRATE NETWORK](https://ackrate.network), the source-linked research and architecture field guide for agentic payments.

## Run this site locally

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The public demos remain on
Stellar testnet. The unlisted `/wallet` canary is separately pinned to the
verified mainnet MandateRegistry and Circle USDC, uses Freighter, charges 0.01
USDC per purchase, and stays gated unless every production variable is present.

Run the hackathon gate check before changing the starter library:

```bash
npm run gatecheck:hackathon
```

The research agent additionally supports Anthropic and OpenAI. Add one or both variables to `.env.local` (already ignored by Git) and to the deployed environment:

```dotenv
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
```

Without an LLM key, the starter library, Express, CLI, AP2, composite, and video demonstrations remain available; the research page shows a clear notice.

## Repository map

- `app/solutions/page.tsx` — starter picker, exact setup commands, and optional hosted walkthrough.
- `starters/` — the 20 generated, inspectable starter projects.
- `starter-kit-src/` — catalog, scenarios, and shared source used to generate the starter library.
- `scripts/starters/` — deterministic materialization, ZIP generation, manifest creation, and verification.
- `app/api/express/` — hosted Express session and fulfillment routes.
- `lib/ackrate-server.ts` — server-side integration with `@ackrate/core`.
- `app/` — the documentation and demonstration surfaces listed above.
- [`docs/mainnet-roadmap.md`](docs/mainnet-roadmap.md) — hosted wallet and chat workstream in the canonical mainnet plan.

Contract and protocol source: [ackrate/ackrate-protocol](https://github.com/ackrate/ackrate-protocol)

**Verify the request. Verify the contract decision. Verify the settlement.**

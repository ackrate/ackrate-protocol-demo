# REAPP, powered by ACKRATE SDK

REAPP demonstrates bounded agent payments on Stellar. Its SDK and CLI are published under `@ackrate`, following the REAPP SDK rename. The contract remains MandateRegistry.

- [Consumer app](https://reapp.live/wallet): Freighter, Stellar Mainnet, Circle USDC. Purchases use real funds and XLM fees.
- [Developer docs](https://reapp.live/docs): [SDK](https://reapp.live/docs/sdk), [CLI](https://reapp.live/docs/cli), and [quick starters](https://reapp.live/docs/quickstarts).
- [Security evidence](docs/security-evidence.md): contract checks, receipts, and native 2-of-3 administration with no timelock.

## Choose from 20 starter packs

Share the full catalog with your team at [Quick starters](https://reapp.live/docs/quickstarts). Each downloadable project includes both agents, exact Testnet dependencies, deterministic fixtures, payment evidence, and a named failure or recovery case. The [integrity manifest](https://reapp.live/starters/v1/manifest.json) records archive hashes.

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

## Start here: empty folder to a working testnet demo

Select a starter and terminal on the [quick-starters page](https://reapp.live/docs/quickstarts). Run its setup command in an empty folder, then:

```sh
npm run demo
```

The installer verifies the ZIP's SHA-256 before extracting and runs `npm ci`. It is downloaded over HTTPS from the canonical site. No wallet is required: the SDK script creates disposable Testnet actors and logs setup, paid deliveries with explorer links, and the scenario verification result.

Edit `scenario/scenario.mjs` for business rules, `src/consumer.mjs` for the runner, and `src/fulfillment.mjs` for the protected resource. Preserve `.ackrate/` recovery evidence after an interrupted payment; resolve pending state before reset.

The [optional hosted companion](https://reapp.live/docs/hosted) needs the persistent Express runtime. Local execution is the default. Starters pin the Testnet package family; follow the SDK guide for Mainnet configuration.

## Develop this site

Use Node 22 and npm:

```sh
npm ci
npm run dev
```

For release checks, run `npm run gatecheck:t3`. Regenerate changed starter sources with `npm run generate:starters`; `npm run check:starters` checks all 20 packages, ZIPs, installers, and hashes.

Server configuration is documented in `.env.example` and [Deployment](docs/deployment.md). Mainnet readiness requires the verified manifest, database, configured signer, session secrets, and model provider. Never commit secrets or copy Mainnet signing material into previews.

## Maintainer references

- [Documentation index](docs/README.md): current guides and dated evidence.
- [Presentation conventions](docs/presentation.md): names, navigation, visual treatment, and copy.
- `starter-kit-src/` and `scripts/starters/`: canonical sources and generator; `starters/` and `public/starters/v1/` are generated.
- `app/docs/`: developer guides; `components/wallet/`: consumer flow; `app/api/`: server endpoints.
- [SDK source](https://github.com/ackrate/ackrate-protocol) and [contract source](https://github.com/ackrate/ackrate-protocol-contracts).

Deployment automation is prepared but project routing remains unresolved. A successful build does not establish deployed or paid-flow acceptance; see the deployment guide for the remaining checks.

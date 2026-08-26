// Generated from starter-kit-src/catalog.json by scripts/starters/generate.mjs.
// Run the generator after changing the catalog.

export const HACKATHON_STARTER_CATALOG = {
  "catalogId": "ackrate-hackathon-starters-v1",
  "constraints": {
    "compatibilityClaim": "ackrate-bound-v2",
    "fixturePolicy": "deterministic-and-clearly-labeled",
    "network": "stellar-testnet",
    "paidMethod": "GET",
    "proofPolicy": "bound-v2-only",
    "runtime": "local-consumer-and-fulfillment"
  },
  "kits": [
    {
      "businessLogic": "Rank sources by relevance, purchase the three planned sources sequentially, retain per-source provenance and evidence, and record the rejected fourth source without creating a paid delivery.",
      "category": "Data APIs",
      "difficulty": "Beginner",
      "features": [
        "verified-bound-purchase",
        "cumulative-budget",
        "request-binding",
        "independent-verification",
        "explorer-evidence"
      ],
      "fixtures": "Four stable JSON sources with fixed identifiers, prices, relevance scores, and per-source provenance.",
      "id": "research-source-scout",
      "inspiration": [
        "coinbase-x402",
        "cloudflare-x402",
        "coinbase-agent-winners"
      ],
      "negativePath": {
        "id": "budget-exhausted",
        "outcome": "The fourth purchase is rejected on-chain because its exact amount exceeds the mandate's remaining authority."
      },
      "paidResource": "GET /source/:sourceId",
      "slug": "research-source-scout",
      "summary": "A research agent buys ranked market, academic, and news sources, then stops when its mandate cannot fund a fourth source.",
      "title": "Research Source Scout"
    },
    {
      "businessLogic": "Reject fixture HTML containing script, style, or iframe elements, extract text metadata, and hash the normalized result; this is not a general HTML sanitizer.",
      "category": "Content infrastructure",
      "difficulty": "Intermediate",
      "features": [
        "verified-bound-purchase",
        "request-binding",
        "response-integrity",
        "explorer-evidence"
      ],
      "fixtures": "Two bundled HTML fixture pages and one deterministic normalization check covering title, links, and word count; the live result computes a content hash, and the kit makes no browser-rendering claim.",
      "id": "page-snapshot-meter",
      "inspiration": [
        "cloudflare-x402",
        "cloudflare-http"
      ],
      "negativePath": {
        "id": "snapshot-resource-rebinding",
        "outcome": "Payment for one page cannot unlock a different page because the proof is bound to the exact requested resource."
      },
      "paidResource": "GET /snapshots/:pageId",
      "slug": "page-snapshot-meter",
      "summary": "An agent buys a normalized page snapshot containing metadata, links, word count, and a content hash.",
      "title": "Page Snapshot Meter"
    },
    {
      "businessLogic": "Resolve only allowlisted bundled inventory and weather fixtures and return provenance with no forwarded headers; add real header filtering and timeouts before connecting a live backend.",
      "category": "Infrastructure",
      "difficulty": "Beginner",
      "features": [
        "merchant-scope",
        "independent-verification",
        "request-binding",
        "explorer-evidence"
      ],
      "fixtures": "Two bundled inventory and weather route fixtures with stable payloads and explicit route mappings; no live upstream is called.",
      "id": "api-tollgate",
      "inspiration": [
        "cloudflare-gateway",
        "cloudflare-http"
      ],
      "negativePath": {
        "id": "upstream-not-allowlisted",
        "outcome": "An upstream route outside the explicit allowlist is rejected before a payment challenge is issued."
      },
      "paidResource": "GET /gateway/:service/:resourceId",
      "slug": "api-tollgate",
      "summary": "Demonstrate an allowlisted fixture-gateway pattern for a read-only API boundary.",
      "title": "Existing API Tollgate"
    },
    {
      "businessLogic": "Publish free discovery metadata for two fixture tools, require a known fixture identifier, enforce the price ceiling in an offline consumer-policy check, and return result provenance from the fixed live purchase.",
      "category": "Agent tooling",
      "difficulty": "Intermediate",
      "features": [
        "price-inspection",
        "verified-bound-purchase",
        "fixture-selection",
        "request-binding"
      ],
      "fixtures": "Two deterministic supply-risk and document-classification tools with declared fixtureId schemas and fixed outputs.",
      "id": "paid-tool-gateway",
      "inspiration": [
        "cloudflare-mcp",
        "cloudflare-agents",
        "x402-foundation"
      ],
      "negativePath": {
        "id": "tool-price-ceiling",
        "outcome": "The offline consumer-policy check rejects a quoted tool price above its declared ceiling before any payment attempt."
      },
      "paidResource": "GET /tools/:toolId/results/:fixtureId",
      "slug": "paid-tool-gateway",
      "summary": "Publish free schema-described tool discovery while charging for selected tool results through a bounded HTTP integration.",
      "title": "Paid Tool Gateway"
    },
    {
      "businessLogic": "Serve a patch only for the allowlisted fixture host, verify its hash after delivery, and return atomic-write metadata without writing files; the repeated-402 hook check is an offline state-transition vector.",
      "category": "Developer tooling",
      "difficulty": "Intermediate",
      "features": [
        "verified-bound-purchase",
        "price-inspection",
        "durable-recovery",
        "explorer-evidence"
      ],
      "fixtures": "Two issue identifiers with deterministic patch artifacts and computed SHA-256 values.",
      "id": "coding-agent-purchase-hook",
      "inspiration": [
        "cloudflare-coding",
        "cloudflare-agents",
        "coinbase-code-winners"
      ],
      "negativePath": {
        "id": "repeated-payment-challenge",
        "outcome": "The offline hook transition rejects a repeated 402 in the settled state instead of initiating another payment."
      },
      "paidResource": "GET /artifacts/:issueId/patch",
      "slug": "coding-agent-purchase-hook",
      "summary": "The shared live consumer verifies the fixed price, settles once, retries the paid request once, and verifies the returned patch hash; an offline hook vector rejects a repeated 402 in the settled state.",
      "title": "Coding Agent Purchase Hook"
    },
    {
      "businessLogic": "Offline vectors rank listings by schema, price, quality, and latency; the live route accepts only the fixed merchant label and known fixture.",
      "category": "Discovery",
      "difficulty": "Advanced",
      "features": [
        "price-inspection",
        "merchant-scope",
        "request-binding",
        "independent-verification"
      ],
      "fixtures": "Three unsigned catalog fixtures with stable schemas, prices, quality signals, merchant labels, and outputs.",
      "id": "service-bazaar",
      "inspiration": [
        "coinbase-bazaar",
        "x402-foundation"
      ],
      "negativePath": {
        "id": "listing-merchant-mismatch",
        "outcome": "A wrong-merchant listing is excluded even though its declared price, quality, and latency signals would otherwise rank first."
      },
      "paidResource": "GET /services/:serviceId/results/:fixtureId",
      "slug": "service-bazaar",
      "summary": "Offline vectors rank bundled service-listing fixtures; the live plan buys the fixed alpha merchant route.",
      "title": "Discoverable Service Bazaar"
    },
    {
      "businessLogic": "Verify an issuer allowlist, exclude stale events, weight completed and failed outcomes, and return evidence references beside the score.",
      "category": "Identity",
      "difficulty": "Advanced",
      "features": [
        "merchant-scope",
        "request-binding",
        "independent-verification",
        "explorer-evidence"
      ],
      "fixtures": "Four deterministic signed events with fixed ageSeconds values produced by clearly labeled trusted and untrusted local Ed25519 fixture signers.",
      "id": "agent-reputation-snapshot",
      "inspiration": [
        "stellar-developer-meetings",
        "stellar-agentic-results"
      ],
      "negativePath": {
        "id": "untrusted-reputation-issuer",
        "outcome": "Events signed by an issuer outside the configured trust set are excluded from the reputation calculation."
      },
      "paidResource": "GET /agents/:agentAddress/reputation",
      "slug": "agent-reputation-snapshot",
      "summary": "Buy a time-bounded reputation snapshot derived from signed execution events without treating a score as payment authority.",
      "title": "Agent Reputation Snapshot"
    },
    {
      "businessLogic": "Offline vectors validate DAG dependencies, stage order, and failure blocking; the live plan purchases the clean-case stages in fixed order.",
      "category": "Orchestration",
      "difficulty": "Advanced",
      "features": [
        "verified-bound-purchase",
        "dependency-validation",
        "sequence-validation",
        "explorer-evidence"
      ],
      "fixtures": "Two deterministic case graphs with staged artifact identifiers and one intentional verification failure.",
      "id": "multi-agent-workflow",
      "inspiration": [
        "stellar-developer-meetings",
        "coinbase-agent-winners"
      ],
      "negativePath": {
        "id": "failed-stage-blocks-synthesis",
        "outcome": "A failed verification stage prevents synthesis from running."
      },
      "paidResource": "GET /workflow/:caseId/:stage",
      "slug": "multi-agent-workflow",
      "summary": "A planner purchases research, verification, and synthesis artifacts as an explicit dependency graph.",
      "title": "Multi-Agent Workflow Router"
    },
    {
      "businessLogic": "Apply fixed work tiers and iteration ceilings, execute a deterministic hash chain, and require the consumer to recompute the expected digest.",
      "category": "Compute",
      "difficulty": "Intermediate",
      "features": [
        "price-inspection",
        "resource-ceiling",
        "request-binding",
        "independent-verification"
      ],
      "fixtures": "Two fixed seeds, two work tiers, one checked deterministic digest prefix, and a maximum iteration count.",
      "id": "compute-broker",
      "inspiration": [
        "coinbase-agent-winners",
        "coinbase-x402"
      ],
      "negativePath": {
        "id": "compute-tier-over-ceiling",
        "outcome": "The deterministic hash function rejects an iteration count above 512 before hashing begins."
      },
      "paidResource": "GET /compute/sha256-chain/:tier/:seedId",
      "slug": "compute-broker",
      "summary": "Buy a bounded cryptographic workload and verify the returned digest independently on the consumer side.",
      "title": "Verifiable Compute Broker"
    },
    {
      "businessLogic": "Select one of two allowlisted patch identifiers, return its precomputed outcome fixture, omit private test sources, and hash the final pass-or-fail report; this starter does not execute user code.",
      "category": "Developer tooling",
      "difficulty": "Intermediate",
      "features": [
        "verified-bound-purchase",
        "request-binding",
        "report-integrity",
        "explorer-evidence"
      ],
      "fixtures": "Two precomputed patch-outcome fixtures with stable report hashes and no private test source.",
      "id": "private-test-runner",
      "inspiration": [
        "coinbase-agent-winners",
        "coinbase-code-winners"
      ],
      "negativePath": {
        "id": "patch-path-traversal",
        "outcome": "A patch identifier containing traversal syntax is rejected before fixture lookup."
      },
      "paidResource": "GET /checks/:patchId/report",
      "slug": "private-test-runner",
      "summary": "A coding agent buys a deterministic hidden-test-result fixture for a known patch identifier.",
      "title": "Private Test Runner"
    },
    {
      "businessLogic": "Verify a fixture artifact SHA-256, canonicalize its declared dependency and build-command metadata, sign the statement, and verify that signature offline.",
      "category": "Software supply chain",
      "difficulty": "Advanced",
      "features": [
        "request-binding",
        "independent-verification",
        "signature-verification",
        "explorer-evidence"
      ],
      "fixtures": "Two small artifact-content fixtures with declared dependency arrays, build-command strings, and a clearly identified local fixture signer.",
      "id": "build-notary",
      "inspiration": [
        "coinbase-code-winners",
        "stellar-i3"
      ],
      "negativePath": {
        "id": "artifact-hash-mismatch",
        "outcome": "A statement carrying an artifact hash different from the requested artifact fails local verification."
      },
      "paidResource": "GET /attestations/:artifactSha",
      "slug": "build-notary",
      "summary": "Buy a signed fixture statement binding an artifact hash to declared dependency and build-command metadata.",
      "title": "Build Notary"
    },
    {
      "businessLogic": "Offline checks enforce quote freshness plus merchant, quality, and latency eligibility, then choose the lowest price; the live plan serves provenance-marked output from that fixed provider.",
      "category": "AI infrastructure",
      "difficulty": "Advanced",
      "features": [
        "price-inspection",
        "merchant-scope",
        "quote-freshness",
        "request-binding"
      ],
      "fixtures": "Clearly labeled fixture providers with stable quotes, scores, and precomputed outputs; no live-model claim.",
      "id": "model-route-bazaar",
      "inspiration": [
        "coinbase-agent-winners",
        "coinbase-bazaar"
      ],
      "negativePath": {
        "id": "stale-provider-quote",
        "outcome": "A provider quote older than the configured freshness window is rejected before provider selection or payment."
      },
      "paidResource": "GET /providers/:providerId/results/:promptId",
      "slug": "model-route-bazaar",
      "summary": "Offline vectors compare fixture quotes and select the lowest-cost eligible provider; the live plan buys that fixed selected provider result.",
      "title": "Model Route Bazaar"
    },
    {
      "businessLogic": "Select text or data fixtures by asset ID and license version, hash the content and terms, record the settlement transaction hash, and verify the asset, version, content, and terms.",
      "category": "Creative commerce",
      "difficulty": "Beginner",
      "features": [
        "request-binding",
        "license-versioning",
        "explorer-evidence",
        "independent-verification"
      ],
      "fixtures": "Bundled text and CSV data assets with stable hashes and clearly labeled sample license terms.",
      "id": "rights-receipt",
      "inspiration": [
        "coinbase-agent-winners",
        "stellar-better"
      ],
      "negativePath": {
        "id": "license-version-rebinding",
        "outcome": "Payment for another asset or license version cannot unlock the requested content."
      },
      "paidResource": "GET /licenses/:assetId/:licenseVersion",
      "slug": "rights-receipt",
      "summary": "Purchase an exact asset-license version and receive content plus a receipt containing content and terms hashes and the settlement transaction hash.",
      "title": "Rights Receipt"
    },
    {
      "businessLogic": "Resolve an owner-scoped dataset fixture, return its observed-at and permitted-use metadata, and verify the content hash without claiming revenue splits.",
      "category": "Data commerce",
      "difficulty": "Intermediate",
      "features": [
        "merchant-scope",
        "request-binding",
        "independent-verification",
        "explorer-evidence"
      ],
      "fixtures": "Two owner-specific dataset fixtures with stable hashes, observed-at timestamps, and permitted-use metadata.",
      "id": "data-owner-gateway",
      "inspiration": [
        "cloudflare-gateway",
        "cloudflare-http",
        "stellar-better"
      ],
      "negativePath": {
        "id": "dataset-owner-mismatch",
        "outcome": "A dataset mapped to another owner is rejected by the endpoint's owner mapping before a payment challenge."
      },
      "paidResource": "GET /datasets/:ownerId/:datasetId",
      "slug": "data-owner-gateway",
      "summary": "The live fixture merchant serves one owner-alpha dataset endpoint and receives payment when the agent unlocks that dataset.",
      "title": "Data Owner Gateway"
    },
    {
      "businessLogic": "Serve two ready-state fixture decisions, validate a fixture HMAC signature, and demonstrate contract-mandate expiry before settlement.",
      "category": "Operations",
      "difficulty": "Advanced",
      "features": [
        "expiry",
        "durable-recovery",
        "request-binding",
        "independent-verification"
      ],
      "fixtures": "Two ready-state deterministic decisions signed by a clearly labeled fixture reviewer; one uses a queue duration beyond the example SLA.",
      "id": "human-review-outbox",
      "inspiration": [
        "cloudflare-agents",
        "stellar-developer-meetings"
      ],
      "negativePath": {
        "id": "authority-expires-in-queue",
        "outcome": "A distinct short-lived mandate expires before settlement against the ready delayed-case fixture, and the contract rejects payment."
      },
      "paidResource": "GET /reviews/:caseId/decision",
      "slug": "human-review-outbox",
      "summary": "An agent buys a signed review decision only after a case reaches a ready state and the mandate remains valid.",
      "title": "Human Review Outbox"
    },
    {
      "businessLogic": "Calculate threshold duration, detect telemetry gaps, order custody transfers, and bind the passport to one hash covering its telemetry and custody fixtures.",
      "category": "Supply chain",
      "difficulty": "Intermediate",
      "features": [
        "sensor-continuity",
        "request-binding",
        "independent-verification",
        "explorer-evidence"
      ],
      "fixtures": "Deterministic telemetry and custody records for normal, breached, and incomplete shipments.",
      "id": "cold-chain-passport",
      "inspiration": [
        "stellar-i3",
        "stellar-better"
      ],
      "negativePath": {
        "id": "incomplete-sensor-evidence",
        "outcome": "A missing sensor interval produces an explicit incomplete passport rather than an unsupported compliance pass."
      },
      "paidResource": "GET /shipments/:shipmentId/passport",
      "slug": "cold-chain-passport",
      "summary": "Buy a shipment passport summarizing custody handoffs, temperature excursions, and sensor continuity.",
      "title": "Cold-Chain Passport"
    },
    {
      "businessLogic": "Search bounded time windows, score carbon and capacity, enforce a deadline, and reject forecasts that are too old for scheduling.",
      "category": "Sustainability",
      "difficulty": "Intermediate",
      "features": [
        "forecast-freshness",
        "capacity-validation",
        "request-binding",
        "independent-verification"
      ],
      "fixtures": "Fixed hourly intensity, capacity, and workload records with one independently checked optimal window.",
      "id": "carbon-aware-run-window",
      "inspiration": [
        "stellar-i3",
        "stellar-better"
      ],
      "negativePath": {
        "id": "forecast-expired",
        "outcome": "A forecast older than the scheduling freshness limit is rejected before a run window is selected."
      },
      "paidResource": "GET /schedules/:jobId/window",
      "slug": "carbon-aware-run-window",
      "summary": "Buy the lowest-emission execution window that still meets a workload deadline and capacity requirement.",
      "title": "Carbon-Aware Run Window"
    },
    {
      "businessLogic": "Offline vectors validate segment order and weather epoch; the live plan purchases segments 1 and 2 before revocation blocks segment 3.",
      "category": "Operations",
      "difficulty": "Intermediate",
      "features": [
        "revocation",
        "sequence-validation",
        "request-binding",
        "explorer-evidence"
      ],
      "fixtures": "Three deterministic route segments with fixed order, endpoints, clearance decisions, and one route-level weather epoch.",
      "id": "fleet-corridor-authority",
      "inspiration": [
        "stellar-developer-meetings",
        "stellar-i3"
      ],
      "negativePath": {
        "id": "operator-revocation",
        "outcome": "After two accepted segments the user revokes authority and the third settlement is rejected by the contract."
      },
      "paidResource": "GET /corridors/:routeId/segments/:segmentId",
      "slug": "fleet-corridor-authority",
      "summary": "A fleet agent buys two planned route clearances; then the mandate user revokes authority and the third planned settlement fails closed.",
      "title": "Fleet Corridor Authority"
    },
    {
      "businessLogic": "Persist used-proof claims, compare origin, method, and resource, record exact response bytes before delivery, and recover the same claim after restart.",
      "category": "Security",
      "difficulty": "Advanced",
      "features": [
        "replay-defense",
        "durable-recovery",
        "request-binding",
        "independent-verification"
      ],
      "fixtures": "Two stable vault resources; the live demo purchases one and reuses its exact Stellar testnet proof after restart.",
      "id": "payment-receipt-firewall",
      "inspiration": [
        "x402-foundation",
        "coinbase-code-winners"
      ],
      "negativePath": {
        "id": "durable-replay-after-restart",
        "outcome": "After restart the exact same proof returns the byte-identical stored response without repeating verification or paid fulfillment."
      },
      "paidResource": "GET /vault/:resourceId",
      "slug": "payment-receipt-firewall",
      "summary": "A reference merchant demonstrates persistent replay admission, exact request binding, and safe recovery after restart.",
      "title": "Payment Receipt Firewall"
    },
    {
      "businessLogic": "Offline vectors rank approved fixture quotes by cost, lead time, and freshness; the live route serves one explicitly selected allowlisted quote pack.",
      "category": "Small-business automation",
      "difficulty": "Beginner",
      "features": [
        "merchant-scope",
        "vendor-allowlist",
        "quote-freshness",
        "explorer-evidence"
      ],
      "fixtures": "Three stable quote fixtures with vendor IDs, lead times, quote ages, item rows, and one checked approved-vendor selection.",
      "id": "procurement-guard",
      "inspiration": [
        "coinbase-agent-winners",
        "stellar-better"
      ],
      "negativePath": {
        "id": "unauthorized-vendor",
        "outcome": "A cheaper vendor outside the configured allowlist remains ineligible and cannot be selected for purchase."
      },
      "paidResource": "GET /vendors/:vendorId/quote-packs/:requestId",
      "slug": "procurement-guard",
      "summary": "A purchasing agent evaluates approved vendor quote fixtures offline and buys one explicitly selected allowlisted quote pack.",
      "title": "Procurement Guard"
    }
  ],
  "schemaVersion": 1,
  "sources": {
    "cloudflare-agents": {
      "title": "Cloudflare pay from Agents SDK",
      "url": "https://developers.cloudflare.com/agents/tools/payments/x402/pay-from-agents-sdk/"
    },
    "cloudflare-coding": {
      "title": "Cloudflare pay from coding tools",
      "url": "https://developers.cloudflare.com/agents/tools/payments/x402/pay-with-tool-plugins/"
    },
    "cloudflare-gateway": {
      "title": "Cloudflare Monetization Gateway",
      "url": "https://blog.cloudflare.com/monetization-gateway/"
    },
    "cloudflare-http": {
      "title": "Cloudflare charge for HTTP content",
      "url": "https://developers.cloudflare.com/agents/tools/payments/x402/charge-for-http-content/"
    },
    "cloudflare-mcp": {
      "title": "Cloudflare charge for MCP tools",
      "url": "https://developers.cloudflare.com/agents/tools/payments/x402/charge-for-mcp-tools/"
    },
    "cloudflare-x402": {
      "title": "Cloudflare x402 launch",
      "url": "https://blog.cloudflare.com/x402/"
    },
    "coinbase-agent-winners": {
      "title": "Coinbase Agents in Action winners",
      "url": "https://www.coinbase.com/en-sg/developer-platform/discover/launches/agents-in-action-winners"
    },
    "coinbase-bazaar": {
      "title": "Coinbase x402 Bazaar",
      "url": "https://docs.cdp.coinbase.com/x402/bazaar"
    },
    "coinbase-code-winners": {
      "title": "Coinbase Code NYC recap",
      "url": "https://www.coinbase.com/developer-platform/discover/launches/code-nyc-recap"
    },
    "coinbase-x402": {
      "title": "Coinbase x402 overview",
      "url": "https://docs.cdp.coinbase.com/x402/welcome"
    },
    "stellar-agentic-results": {
      "title": "Stellar Q1 2026 agentic-payments results",
      "url": "https://stellar.org/blog/foundation-news/q1-2026-execution-at-network-scale"
    },
    "stellar-better": {
      "title": "Better on Stellar results",
      "url": "https://stellar.org/blog/foundation-news/better-on-stellar-challenge-from-what-if-to-what-now"
    },
    "stellar-developer-meetings": {
      "title": "Stellar developer meetings",
      "url": "https://developers.stellar.org/meetings"
    },
    "stellar-i3": {
      "title": "Stellar i3 Awards 2025",
      "url": "https://stellar.org/blog/ecosystem/stellar-i-awards-2025"
    },
    "x402-foundation": {
      "title": "x402 Foundation repository",
      "url": "https://github.com/x402-foundation/x402"
    }
  }
} as const;

export const HACKATHON_STARTER_DEPENDENCIES = {
  "@ackrate/ap2": "0.3.0",
  "@ackrate/core": "0.3.1",
  "@ackrate/express-middleware": "0.2.2",
  "@ackrate/stellar": "0.2.2",
  "@stellar/stellar-sdk": "14.6.1",
  "express": "5.2.1"
} as const;

export type HackathonStarter = (typeof HACKATHON_STARTER_CATALOG)["kits"][number];
export type HackathonStarterId = HackathonStarter["id"];

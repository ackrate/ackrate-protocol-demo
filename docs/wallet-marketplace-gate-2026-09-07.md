# Hosted Mainnet wallet and marketplace gate check

September 7, 2026. This record covers the configured request-and-response flow
at [the hosted wallet](https://reapp.live/wallet). It is engineering evidence,
not an external endorsement or a guarantee of zero risk.

## User experience and execution path

1. Connect a personal Mainnet Freighter wallet and sign a fee-free ownership
   challenge. This does not grant spending authority.
2. Choose a marketplace service, enter its published inputs, and review the
   price, relay and downstream seller before authorization.
3. Sign the mandate registration transaction, then separately approve the
   registry's capped Circle USDC allowance. The official registry is
   [CCLZ…4HWR](https://stellar.expert/explorer/public/contract/CCLZEBJXG4YVJEPBCR5F27N733BCK5HQJWZZGB3K54JVODY3VAGP4HWR).
4. Press Run. The assistant-ui runtime appends the user's configured request;
   `/api/wallet/chat` uses Vercel AI SDK streaming and one fixed purchase tool.
   The consumer invokes the registry's payment enforcement without another
   user payment signature.
5. Receive the marketplace output and inspect both settlement receipts. Web
   research includes citations and a closing Summary. Reports can be downloaded
   or shared through a durable Postgres-backed GUID page.

This is a guided task conversation, not an unrestricted chat composer or a
human merchant chat room. The user signs an on-chain registration binding the
mandate terms; a separately signed portable AP2 credential is not produced by
this wallet flow.

## Independent historical transaction evidence

[Read-only receipt verification](wallet-mainnet-independent-receipts-2026-09-07.json)
cross-checks four successful transactions through RPC and Horizon at
**20:13:03 Bangkok on September 7**. The owner-run transactions occurred on
September 6: registration at 21:55:56, allowance at 21:56:58, contract payment
at 21:57:42 and seller settlement at 21:57:59. Exact owner signatures, returned
mandate ID, amount, asset, recipients and consumed sequence were checked.

Both settlement legs transferred **0.02 USDC**. Current historical mandate
state is Revoked, sequence 1, spent 0.02 of a 0.03-USDC cap. These are historical
receipts—not a newly initiated payment during this gate. The owner's delivered
output observation is separate evidence; blockchain receipts alone cannot prove
the AI response or its editorial quality.

The retained [What is Stellar? report](https://reapp.live/reports/ab00d5c3-30b0-4f0d-a824-7151daac2674)
loads with cited content, three Summary paragraphs and a ten-source sidebar.
Its sanitized public snapshot intentionally omits private receipt metadata;
the GUID alone is not a cryptographic binding to the four receipts above.

## Reproducible automated checks

Use Node.js 22 and the committed lockfile:

```sh
npm ci
npm run gatecheck:t3
```

The production build disables automatic funded-run startup. The following
wallet-specific regressions execute synthetic fixtures without live payments:

| Area | Executed checks |
| --- | --- |
| Production chat route | Actual handler and installed AI SDK streaming; real input/quote/session/origin checks; fixed single purchase; duplicate or injected tool arguments; model/payment failures and no post-stream paid retry. |
| Cross-request receipt recovery | Actual consumer and receipt store: merchant 503, interrupted body, failed acknowledgement, conflicting retained receipt and no additional signing or RPC submission. Three new tests fail with the old Core dependency and all four pass with the aligned release. |
| Registration persistence | Real signed fixture XDR; exact body, signature, scope and returned V2 ID; persistence before send; signing rejection/storage failure; lost confirmation; read-only recovery; complete-history expiry and unavailable/mismatched evidence. |
| Registration UI | Actual component callbacks/effects under synthetic hooks: reload, unknown/legacy attempts, explicit retry, and disconnect while Freighter signing is pending. No hidden replacement signature or deletion of the retained attempt. |
| Existing wallet protections | Allowance sequencing/polling, mandate identity/state, exact settlement verification, signed quotes, input limits, recovery, report sanitization, summaries and persistent sharing. |

The runtime dependency closure is aligned to Core 0.4.1, Stellar 0.3.0,
AP2 0.4.0 and middleware 0.3.0. Compatibility type corrections emit identical
JavaScript. The CLI executable and its locked release are unchanged.

At **20:44 Bangkok on September 7**, the complete local gate passed on
**Node.js 22.23.2**: **264 wallet tests, 173 CLI regression tests and 91 shared
tests**, strict type checking, branding/workflow-pin/starter checks, production
build and production smoke. The dependency audit reported **zero known
vulnerabilities**. Tests use synthetic financial boundaries; no new live payment
was made. Two independent review lanes rechecked recovery and registration,
and a separate requirement/evidence reviewer identified no remaining functional
blocker within the documented guided-conversation scope.

The authoritative automated result is the [CI run for the commit containing
this record](https://github.com/ackrate/ackrate-protocol-demo/actions/workflows/ci.yml).
Do not treat this document's presence alone as a passed deployment. Compare
the returned `sourceCommit` from `/api/wallet/health` with the green source
revision; health must report Mainnet-ready and connected durable state.

## Boundaries and failure behavior

- Contract enforcement covers the user's withdrawal to the disclosed relay.
  The relay separately pays the marketplace seller using x402. The two legs
  are not atomic; delivery and refunds are not guaranteed by the mandate.
- Changed payment terms fail closed. Ambiguous settlement remains a
  reconciliation state rather than permission for another payment.
- A signed registration is retained before broadcast. Recovery checks the
  original transaction; it never signs or submits a replacement automatically.
  Legacy records lacking their signed receipt remain conservatively blocked
  and may require operator assistance.
- Browser storage and RPC/provider integrity remain trust assumptions. This
  release does not claim cross-tab atomic authorization or recovery after a
  user deletes browser evidence. It prevents the verified in-tab disconnect/
  signing race.
- Discovery does not mean universal paid execution: protected execution is
  allowlisted for web search, PDF extraction and PDF metadata. The retained
  human-tested example is web search; not every service was live-paid here.
- Report sharing requires an authenticated owner and a succeeded paid result.
  Public reads omit wallet/receipt authentication data and do not initiate work.
  Live negative reads confirmed unauthenticated chat/sharing rejection,
  cross-origin rejection and an unknown GUID returning 404.

External content and AI output are untrusted. Marketplace protocol adapters
remain separate from contract enforcement; the SDK and model cannot replace
the contract's authority, budget, expiry, asset, recipient and sequence checks.
Synthetic failure tests are not described as new live Mainnet outage drills.

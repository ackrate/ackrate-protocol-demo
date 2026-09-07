# Wallet mainnet release-readiness gate check

**Historical checkpoint:** this September 6 record is retained as originally
dated. For the later wallet recovery fixes, independently verified owner-run
receipts and current execution-path checks, see the
[September 7 hosted wallet gate](wallet-marketplace-gate-2026-09-07.md).
Pending labels below describe this older checkpoint, not a fresh release verdict.

Check date: 2026-09-06. This is an engineering gate check, not an external
endorsement. It separates the SDK/CLI and hosted application release
requirements from the original governance requirement. No mainnet transaction
was signed or submitted for this check.

**Current result: automated checks passed; hosted human testing and package
publication remain.** The source-level SDK/CLI compatibility and guided chat
gaps identified in the initial check have been repaired. This is not evidence
that a human has completed the current mainnet flow. Pin the tested source to
the final commit and retain deployment evidence before marking the release
complete.

Recorded automated run on 2026-09-06: the demo gate passed with 99 wallet tests,
no reported dependency vulnerabilities, a production build, and a browser
smoke check. The protocol source gate also passed. These results do not replace
a clean install of the newly published packages or a real Freighter payment.

## 1. SDK, CLI, and reference agents on mainnet

| Gate | State | Evidence / acceptance condition |
| --- | --- | --- |
| Contract-controlled payment, not SDK-only budget checks | Implemented | The reference SDK calls `execute_payment`; V2 authenticates the stored agent, checks durable mandate state, consumes budget/sequence, and invokes USDC `transfer_from` atomically. A failed token call rolls the invocation back. |
| Current wallet deployment accepted by SDK/CLI | Source repair and source gate passed; publication pending | The protocol loader now accepts the wallet's schema-2 manifest and registry `CCLZ…4HWR`. Registration retains the original credential hash and updates the mandate to the confirmed V2 storage ID. The repaired package versions still need publication and clean-install verification. |
| Reproducible reviewer command | Source gate passed; published-release evidence pending | The repository publishes `@ackrate/cli` with the `ackrate` binary. The requested legacy command spelling is not established by repository evidence. Publish one tested, version-pinned command, including its manifest, signer prerequisites, and explicit real-USDC confirmation. Never include secret values. |
| Consumer and fulfillment agents complete a real payment | Historical evidence; fresh evidence needed | The protocol's `docs/mainnet-live-usdc-evidence.md` records three 0.01-USDC payments and budget rejection on 2026-08-26 against **legacy** registry `CDBTG…PAGS`. This does not establish the same result against the wallet's current V2 registry. |
| All advertised mainnet package/command paths | Source gate passed; distribution and mainnet evidence pending | Record the published package versions, test results, deployment manifest, supported command matrix, and a clean-install reproduction. Do not generalize one successful demo into every CLI command working. |

Protocol source checkpoints: `packages/stellar/src/release-manifest.ts`,
`packages/sdk/src/index.ts` (`createIntentMandate`, `registerMandate`, `Agent.pay`),
and `packages/cli/src/commands/demo.ts`. These are in the sibling
`ackrate-protocol` repository, not duplicated in this demo.

## 2. Hosted web wallet and consumer app

| Gate | State | Evidence / acceptance condition |
| --- | --- | --- |
| Connect, choose service, configure required inputs | Implemented and automated checks passed; human confirmation pending | The live catalog and input schema support are wired into Configure. This release enables web search, PDF extraction, and PDF metadata; other listings remain browse-only. Confirm required fields, validation, and output in the hosted human test. |
| Price and recipient are known before authorization | Implemented and rechecked | An application-signed quote binds the user, release, normalized-input hash, source, asset, relay, price, and marketplace recipient. An unpaid 402 is checked before authorization; actual terms are checked again before each payment leg. Missing quotes fail closed in the shared purchase path. This is application-level downstream binding, not a direct marketplace-recipient contract mandate. |
| User signs mandate and capped USDC allowance | Needs fresh human evidence | The UI has separate registration and allowance operations. The reported allowance failure cannot be closed by a build or mocked test alone: verify the actual Freighter popup, signed submission, confirmation, and resulting allowance. |
| Agent performs mandate-validated payment | Implemented; fresh hosted proof needed | The internal fulfillment route verifies the registry payment through the bound adapter. Complete the current hosted flow and retain the registry transaction, mandate state before/after, and expected USDC movements. |
| Real chat using Vercel AI SDK and assistant-ui | Source integration and automated checks passed; live model evidence pending | Configured Run now appends the user's message through the assistant-ui runtime, calls `/api/wallet/chat`, and renders streamed messages and tool results. The server fixes the selected inputs, forces at most one purchase for that Run, and disables additional purchase calls during the response. Verify the actual hosted stream and provider execution. |
| Useful service result and downloadable output | Automated protections passed; service-specific human evidence pending | Delivery must report success and match the registry and marketplace receipt fields before completion. Upstream JSON is bounded at 2 MiB, the stored/recovered envelope at 5 MiB, and the model receives a bounded preview of at most 32,000 characters. Verify real search/PDF output and downloads for the enabled services. |
| OpenAI / second-provider orchestration | Implemented; live execution evidence needed | The report builder has a draft/review/fallback path. Record which provider stages actually ran without exposing keys. Dependency or environment-variable presence does not prove successful model execution. |
| Retry, recovery, and failure copy | Repairs rechecked; integration evidence pending | Direct and chat requests use the same stable Run key, stored input hash, and receipt-specific recovery completion. Existing pending receipts block new purchases. A terminal HTTP-200 failure is rejected before success or receipt acknowledgement. Test interrupted responses and concurrent tabs; never describe a paid-but-failed delivery as a successful service run. |

Demo source checkpoints:
[AssistantThread](../components/wallet/AssistantThread.tsx),
[chat route](../app/api/wallet/chat/route.ts),
[mandate client](../lib/wallet/mandate-client.ts),
[purchase](../lib/wallet/purchase.ts),
[fulfillment](../lib/wallet/fulfillment.ts), and
[marketplace adapter](../lib/wallet/agent402.ts).

The experimental UI has not been migrated or redesigned in this change.
Legacy paid API callers that omit the required quote and Run ID now fail
closed; they must adopt the quoted flow before initiating another purchase.
This intentional behavior change does not modify their component layout.

## Marketplace enhancement: two distinct settlements

The current integration is a **relay**, not a direct marketplace-recipient
mandate:

1. MandateRegistry enforces the user's capped USDC withdrawal to the bound
   Ackrate relay/agent account.
2. That account separately signs a standard Stellar x402 transfer to the
   merchant named by the marketplace's 402 response.

`app-config.ts` assigns the mainnet mandate merchant to the agent address.
The registry enforces the first recipient and budget; it does **not** constrain
how the relay's own key subsequently spends its balance. The UI and proof view
must show both recipients and both transactions, and must not describe this as
contract-enforced direct payment to the marketplace merchant.

The installed `@x402/stellar@2.25.0` exact verifier rejects a top-level registry
`execute_payment` call and a token `transfer_from` call before RPC. The focused
[offline compatibility test](../tests/wallet-exact-compatibility.test.ts)
passed during this review and guards against signing or network access. This
proves the installed verifier's limitation; it is not a live settlement test
of every facilitator deployment. See the
[integration compatibility note](marketplace-settlement-compatibility.md).

Ambiguous upstream settlement remains a reconciliation state, not permission
to retry with a new payment. The marketplace journal reserves a transaction
before sending the paid request. Terminal fulfillment responses are immutable;
receipt recovery does not re-execute arbitrary paid work. Some interruptions
therefore require operator reconciliation rather than an automatic result.

## Continuous security feedback

- The protocol, demo, and contracts repositories contain push/PR workflows
  for their test and release gates. Demo and protocol source gates passed for
  this change; retain their outputs against the **final commit**, not only the
  presence of workflow files.
- The contracts repository's `docs/mainnet-v2-security-verification.md` records
  53 executable tests, negative coverage, trust-boundary diagrams, source/WASM
  linkage, and dependency results dated 2026-09-01. Re-run the applicable gates
  for changed code. Historical passing evidence is not a fresh run.
- x402 parsing and settlement adapters must remain separate from mandate
  enforcement. No adapter may skip `execute_payment` to make a marketplace
  integration appear compatible.
- Document the relay as an additional trust boundary and test its failure
  modes. The protocol's recorded testnet failure drills are valuable but do
  not by themselves prove the hosted two-settlement recovery path.

## Separate discrepancy in the original governance requirement

The original governance requirement asked for OpenZeppelin access control, 2-of-3 upgrade
governance, and a timelock. The current V2 security document explicitly states
that V2 has **no timelock and no OpenZeppelin dependency**. It instead records a
native Stellar 2-of-3 administrator and an already-paused-contract requirement
for upgrades.

That distinction does not disappear when the wallet works. Meeting the
original governance requirement needs either an explicitly accepted requirement
change or separately authorized contract/governance work and its evidence.
This review does not authorize a mainnet upgrade, threshold change, or custody
change.

## Final human-test evidence to retain

- [ ] Final Git commit, deployed app version, package versions, network,
  registry ID, and manifest/WASM identity.
- [ ] Reviewer command succeeds from a clean install against the intended
  mainnet deployment.
- [ ] User disconnects and reconnects; receives both expected Freighter
  signature requests; confirmed mandate and capped allowance are visible.
- [ ] User selects an enabled real marketplace service, supplies its required
  inputs, and confirms current price, budget, expiry, and disclosed recipients.
- [ ] One run produces the expected service result, registry receipt, upstream
  marketplace settlement receipt, and correct budget/balance changes.
- [ ] A changed quote, expired/exhausted mandate, and recoverable fulfillment
  failure are handled without misleading success or duplicate withdrawal.
- [ ] The actual user-facing chat and report/download experience works, not
  merely its standalone server route or UI shell.
- [ ] Evidence distinguishes baseline delivery, relay enhancement, and the
  remaining original governance discrepancy before approving a release.

# Maintainer documentation

Use the [SDK](https://reapp.ackrate.com/docs/sdk), [CLI](https://reapp.ackrate.com/docs/cli), and [quick-starter](https://reapp.ackrate.com/docs/quickstarts) guides for integration. This directory holds deployment and implementation references.

| Document | Purpose |
|---|---|
| [Branch reconciliation](https://github.com/ackrate/ackrate-project/blob/main/instance/artifacts/108-other-repository-artifacts/ackrate-protocol-demo/docs/branch-reconciliation.md) | Integration/production ancestry and completed branch cleanup. |
| [Deployment](deployment.md) | Production domain, native Git builds, branch routing and release checks. |
| [AP2 test reference](ap2-test-reference.md) | Recorded package test catalog; the live demo runs six representative checks. |
| [Security evidence](https://github.com/ackrate/ackrate-project/blob/main/instance/artifacts/108-other-repository-artifacts/ackrate-protocol-demo/docs/security-evidence.md) | Recorded contract checks, reproduction commands, and source links; kept off the live website. |
| [Presentation](presentation.md) | Product names, shared style, navigation, concise copy. |
| [Wallet connection](wallet-connection.md) | Desktop/mobile transport boundary and shareable connection reports. |
| [Historical wallet readiness](https://github.com/ackrate/ackrate-project/blob/main/instance/artifacts/108-other-repository-artifacts/ackrate-protocol-demo/docs/wallet-mainnet-readiness.md) | September 6 checkpoint; current runtime requirements are in Deployment and acceptance steps in Human wallet test. |
| [Human wallet test](wallet-human-test.md) | Wallet signing and transaction acceptance procedure. |
| [Settlement compatibility](marketplace-settlement-compatibility.md) | Contract and seller settlement boundaries. |
| [Provider configuration](llm-failover-brief.md) | Model-provider routing and failure behavior. |
| [Report recovery](report-recovery.md) | Bounded summary retry from saved sources, immutable receipts, and validation. |

The dated wallet reports and JSON receipts are historical evidence. Preserve their dates and identifiers; rerun acceptance for new deployments. `mainnet-roadmap.md` is a planning reference, not proof that every item is complete.

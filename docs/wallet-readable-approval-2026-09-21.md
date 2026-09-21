# Readable wallet approvals and atomic setup

The wallet's sign-in previously created a `manageData` transaction with binary
nonce bytes, then asked Freighter to sign without broadcasting. That looked like
a transaction approval and exposed unreadable data before spending setup.

Sign-in now uses Freighter `signMessage` and Stellar SEP-53 verification. The
message names ACKRATE, the website, wallet, network, issue/expiry time and a
one-time code. It explicitly states that sign-in does not move funds, approve
spending or charge a fee. The server reconstructs the exact text from its signed
challenge cookie, verifies the connected key, and atomically consumes the nonce.
Origin guards, short expiry, HttpOnly/SameSite cookies and the one-hour session
remain. There is no transaction-signing fallback. Old pending transaction-style
challenges must be requested again. This proves key possession for the browser
session; on-chain account authorization is still required for setup and payments.

## Combined setup

Soroban allows one smart-contract operation per transaction. The separate
`contracts/wallet-setup` helper in the contracts repository performs the registry
registration and token allowance as two child calls in that operation. Its
constructor fixes the existing registry and token, and it has no admin, upgrade,
generic dispatch or token-transfer method. The user signs once, for the exact
cap, agent, recipient, expiry and capped registry allowance. Failure of either
child reverts the complete setup. The live registry is not upgraded.

The client checks the helper's WASM hash and fixed targets before requesting a
signature. It retains the exact signed envelope before submitting and binds
recovery to that helper, wallet, parameters and transaction. One confirmed
receipt closes both setup steps. Signing rejection or persistence failure sends
nothing. An ambiguous result retains that same receipt and never starts a
replacement automatically. Existing separate-registration records keep their
original recovery path.

`lib/wallet/setup-release.json` is intentionally disabled (`null`) on both
networks in this revision. Enable only after recording and independently checking
a deployed helper's exact code and constructor targets. The disposable Testnet
helper points to an isolated Testnet registry and is not a production address.
The app's existing two-approval setup remains until activation; this document
does not claim Mainnet batching has already shipped.

## Verification

- Complete app gate: 173 CLI tests, 91 application/starter tests, 270 wallet
  tests, types, branding/workflow/starter checks, zero known npm vulnerabilities,
  production build and HTTP smoke passed locally.
- New handler tests exercise real challenge/verify handlers: offline text,
  valid signature, one-time consumption, foreign origins, wrong key and rejection
  of the old transaction payload.
- New client tests exercise one signature/one broadcast, exact retained receipt,
  wrong code/targets/signature/body, failed persistence and lost-response recovery.
- Helper: four native host tests against the actual V2 registry and SAC, strict
  clippy, formatting and compiled WASM build passed with the pinned lockfile.
- [Testnet evidence](wallet-atomic-setup-testnet-2026-09-21.json): exact reviewed
  V2 code deployed to an isolated instance with test XLM; one combined setup,
  three payments totaling 0.03 test XLM, fourth rejected before broadcast.
  This was SDK-driven, not a new Freighter UI or Mainnet USDC acceptance run.
- The old Express source hash was updated after proving that the diff from its
  reviewed baseline changes only `className` attributes. A brittle obsolete icon
  size check now asserts the wallet's spending-control content.
- Next.js 16.3.0 and Sharp 0.35.3 triggered current dependency advisories; updated
  to 16.3.5 and 0.35.4 respectively. Fresh npm audit reports zero findings.

Mainnet helper deployment, actual Freighter message/setup popup inspection and
funded Mainnet USDC purchase/recovery tests remain the final acceptance steps.
Do not equate a Testnet success or unit test with completion of those steps.

Sources: [Freighter API](https://github.com/stellar/freighter/blob/master/@stellar/freighter-api/src/signMessage.ts),
[SEP-53](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0053.md),
[Stellar transaction limits](https://developers.stellar.org/docs/learn/fundamentals/transactions/operations-and-transactions),
[Next.js advisory](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4),
[Sharp advisory](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c).

# vendor/ackrate-cli.mjs

A self-contained executable from the published **[@ackrate/cli 0.2.0](https://www.npmjs.com/package/@ackrate/cli/v/0.2.0)**
package, used by `/api/cli`. The hosted `/cli` selects Mainnet and the official
[MandateRegistry](https://stellar.expert/explorer/public/contract/CCLZEBJXG4YVJEPBCR5F27N733BCK5HQJWZZGB3K54JVODY3VAGP4HWR).

The file is copied unchanged from `package/dist/ackrate-cli.bundle.mjs` in the
public npm tarball. It is not rebuilt from unpublished workspace changes.
`@stellar/stellar-sdk` 16.3.0 is external and resolved from this app at runtime.

## Verify or update

The package dependency and lockfile are also pinned to 0.2.0. For a future update,
download the selected public package in a fresh temporary directory, verify its
npm integrity, copy its executable, and update the version/hash regression together.

```
npm view @ackrate/cli@0.2.0 dist.integrity
node vendor/ackrate-cli.mjs --version
shasum -a 256 vendor/ackrate-cli.mjs
```

Executable SHA-256: `b719eb1e780f85daa20a3d86c2f82d80b5789574c079e459b5fc640fb174b125`.

The anonymous terminal does not inherit server signing credentials. Mainnet paid
commands require explicit real-USDC authorization and designated funded signing
identities. Version/help success alone is not evidence of a completed payment.

## Freighter-funded CLI test

`ackrate-cli-test.mjs` is the separate **0.2.1 source build** from
[`ackrate/ackrate-protocol` commit 0be7bf8](https://github.com/ackrate/ackrate-protocol/commit/0be7bf8c9f938e5ebe42c0c35db54d8061b37333).
It exactly matches the prepared CLI archive; `cli-test-build.json` pins its SHA-256.
It is not described as a published npm 0.2.1 release. Anonymous version/help inspection
continues to use the unchanged public npm 0.2.0 executable above.

The authenticated `/api/cli/test` runner executes this CLI with its reference
consumer and fulfillment agents. A narrow external signer adapter supplies only
the generated test payer's capped registration/allowance signatures. The user
keeps their funding-account key in Freighter. Three new test-account keys are
encrypted in PostgreSQL using a purpose-derived server key; they are never sent
to the browser. Funding requires a separate explicit Freighter confirmation of
6 XLM (account reserves and fee headroom) and 0.03 USDC. Those funded accounts remain
server-managed; this interface does not promise an automatic return of their balances.

The run is claimed in PostgreSQL before execution and cannot automatically restart.
Payment receipts/outcomes are periodically copied into saved output and captured
on normal exit. An abrupt host failure can still lose the most recent local journal
write: retain the locked run and reconcile the public account/contract history manually.
Do not treat this interface as a guarantee of crash-safe exact-delivery recovery.

## One-off server-funded CLI test

An operator can configure `ACKRATE_CLI_BURNER_MNEMONIC` as a **sealed, server-only
Railway variable**. The value is the English BIP39 phrase only, not a `NAME=value`
assignment. One matching pair of surrounding quotes and extra whitespace are
accepted. The parser validates the checksum and Stellar SEP-5 derivation, checking
only account indices 0–19 against the approved account
`GCHNDR6APAMBLIAYTQRCKDHQRBI3E2V5GE6KIRUBXROLHRS46NF5YDVV`.
Any mismatch stops signing. A mnemonic controls every derived account, not merely
the selected burner; it must never belong to a primary or shared account.

`npm start` sets the runtime-only marker. It starts the fixed, one-off job
`cli-mainnet-burner-20260907-v1`; builds, development, and public status requests
cannot start it. PostgreSQL retains this job across deployments and replicas.
The signed funding transaction and session capability are encrypted before
submission. Only the winner of a durable state/version claim can submit the exact
funding transaction or launch the CLI. A maximum of three durable attempts may
submit the identical signed envelope; its hash, sequence and financial effect
cannot change. Only bounded HTTP status and transaction/operation result codes
are retained from submission responses. No reset or repeat-run endpoint exists.

One renewal of funding time bounds is permitted only after a fresh closed ledger
strictly after the original expiry and one Mainnet RPC snapshot prove that the
owner is still at the original predecessor sequence and all three actors remain
absent. The original signed envelope, hash and proof are retained encrypted before
the renewal is claimed. The replacement must preserve the same session, actors,
source sequence, operations, amounts and fee; only time bounds may differ. Any
changed or ambiguous state stops renewal. A crash during its preparation requires
manual reconciliation, not another signing attempt. Already confirmed or failed
on-chain funding is never renewed. This remains one funding effect, not another
funded test. The renewed envelope also has a three-attempt identical-hash cap.

New funding time bounds allow 30 seconds of ledger-clock lag while retaining the
same fixed 600-second lifetime (570 seconds remain at construction). This avoids
requiring a ledger to have already closed at the server's current wall-clock time.
The original discarded submission response does not prove that clock skew caused
that failure. See Stellar's [time-bound semantics](https://developers.stellar.org/docs/learn/fundamentals/transactions/operations-and-transactions)
and [submission error handling](https://developers.stellar.org/docs/data/apis/horizon/api-reference/errors/error-handling).

Funding is exactly 6 XLM to three new test accounts, 0.03 Circle USDC to the payer,
and a 0.00006 XLM funding-transaction fee. Subsequent test transaction fees come
from those funded accounts. The burner phrase is used only for this exact funding
signature; it is not persisted in PostgreSQL, passed to the CLI, logged, or sent
to a browser. Generated test-account keys remain encrypted in PostgreSQL.

The read-only `/api/cli/test/burner` response and `/cli` show progress and saved
evidence. A failed or ambiguous submitted run is retained for reconciliation,
never restarted or given another funding allocation automatically. An expired
funding envelope can only take the proof-guarded, same-actor path described above.
A completed deployment is not payment evidence;
only successful CLI checks and independently verified Mainnet receipts can close
the acceptance test. The source-build versus public-npm distinction above remains.

# Contract verification evidence

This report preserves the recorded evidence formerly displayed on the website. It is not a fresh Mainnet execution or an independent security audit. Dates and revisions belong to the linked source records.

## Contract behavior

Recorded result: **53 / 53 PASS**. The reviewed V2 code passes its required native and optimized-contract checks.

- 52 native Soroban host tests passed
- 1 exact optimized-WASM execution check passed
- 10,001 signed amount boundaries passed
- 512 complete mandate-state scenarios passed

Budget, expiry, merchant, asset, status, sequence, and atomic Circle USDC settlement are enforced by the contract.

Boundary: Run from the repository root with the pinned toolchain. The gate builds the optimized WASM before executing it; a standalone all-features test requires that artifact. The live-code check binds the reviewed bytes to Mainnet.

Reproduce from the [contract repository](https://github.com/ackrate/ackrate-protocol-contracts):

```sh
./scripts/gatecheck-contracts.sh
```

[Test code](https://github.com/ackrate/ackrate-protocol-contracts/blob/main/contracts/mainnet-v2/mandate-registry/src/test.rs) · [Full gate](https://github.com/ackrate/ackrate-protocol-contracts/blob/main/scripts/gatecheck-contracts.sh)

## Required attack paths

Recorded result: **ALL REJECTED**. Every required hostile path has an executable negative test.

- Unauthorized callers rejected
- Expired mandates and overspend rejected
- Replay and sequence substitution rejected
- Unauthorized and unpaused upgrades rejected

Missing or wrong authority, stale state, changed payment terms, callback attempts, corrupt state, and failed token movement cannot consume value.

Boundary: These checks cover known and modeled paths; they are not a claim that unknown defects cannot exist.

Reproduce from the [contract repository](https://github.com/ackrate/ackrate-protocol-contracts):

```sh
cargo test --manifest-path contracts/mainnet-v2/mandate-registry/Cargo.toml --locked test::
```

[Negative tests](https://github.com/ackrate/ackrate-protocol-contracts/blob/main/contracts/mainnet-v2/mandate-registry/src/test.rs) · [Threat model](https://github.com/ackrate/ackrate-protocol-contracts/blob/main/docs/mainnet-v2-threat-model.md) · [Data flows and trust boundaries](https://github.com/ackrate/ackrate-protocol-contracts/blob/main/docs/mainnet-v2-data-flow.md)

## Source and dependencies

Recorded result: **GATES PASS**. The release gate locks the dependency graph, interface, events, artifact shape, and canonical hash.

- Warnings-denied Rust lint passed
- Dependency advisory and yanked-package scan passed
- 18 functions and 9 runtime events matched
- 15,510-byte artifact and canonical SHA-256 matched

A changed required test, dependency finding, function, event, artifact size, or canonical Linux hash stops the release gate.

Boundary: The canonical byte hash is enforced by Linux CI; other platforms reproduce behavior, interface, and artifact size. One accepted host-only maintenance advisory is excluded from deployed WASM and checked separately; it is not described as remediated.

Reproduce from the [contract repository](https://github.com/ackrate/ackrate-protocol-contracts):

```sh
./scripts/security-scan.sh && ./scripts/gatecheck-contracts.sh
```

[Dependency check](https://github.com/ackrate/ackrate-protocol-contracts/blob/main/scripts/security-scan.sh) · [Scan results and dispositions](https://github.com/ackrate/ackrate-protocol-contracts/blob/main/docs/mainnet-v2-security-scan-report.md) · [Gate code](https://github.com/ackrate/ackrate-protocol-contracts/blob/main/scripts/gatecheck-contracts.sh) · [Public runs](https://github.com/ackrate/ackrate-protocol-contracts/actions)

## Live Mainnet binding

Recorded result: **READ-ONLY PASS**. Mainnet was read directly to confirm code, state, asset policy, and 2-of-3 authority.

- Live WASM SHA-256 matched reviewed V2
- Schema 2, unpaused, no successor pending
- Circle Mainnet USDC policy allowed
- Three weight-1 signers and 2/2/2 thresholds matched

The deployed contract is the reviewed V2 artifact and its administrator is the expected native Stellar 2-of-3 account.

Boundary: This check is read-only. It signs no transaction and moves no Mainnet funds. V2 has no timelock.

Reproduce from the [contract repository](https://github.com/ackrate/ackrate-protocol-contracts):

```sh
set -euo pipefail
./scripts/deploy-mainnet-v2.sh verify-deploy \
  --contract-id CCLZEBJXG4YVJEPBCR5F27N733BCK5HQJWZZGB3K54JVODY3VAGP4HWR \
  --source GCIURCX7JHEKQLRTW6RDZU7OJUVCDM7WWNQPIKRERIHQOHSLW7UY7TXG \
  --admin GCIURCX7JHEKQLRTW6RDZU7OJUVCDM7WWNQPIKRERIHQOHSLW7UY7TXG \
  --initial-asset CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75 \
  --rpc-url https://mainnet.sorobanrpc.com
curl --fail --silent --show-error \
  https://horizon.stellar.org/accounts/GCIURCX7JHEKQLRTW6RDZU7OJUVCDM7WWNQPIKRERIHQOHSLW7UY7TXG | \
  bash scripts/check-mainnet-v2-authority.sh
```

[Contract](https://stellar.expert/explorer/public/contract/CCLZEBJXG4YVJEPBCR5F27N733BCK5HQJWZZGB3K54JVODY3VAGP4HWR) · [Live check](https://github.com/ackrate/ackrate-protocol-contracts/blob/main/.github/workflows/verify-mainnet-canary.yml) · [Verification code](https://github.com/ackrate/ackrate-protocol-contracts/blob/main/scripts/deploy-mainnet-v2.sh) · [Exact signer check](https://github.com/ackrate/ackrate-protocol-contracts/blob/main/scripts/check-mainnet-v2-authority.sh) · [Source proof and explorer status](https://github.com/ackrate/ackrate-protocol-contracts/blob/main/docs/mainnet-v2-source-verification.md)

Source-to-chain proof is separate from an explorer verification badge. The canonical [verification report](https://github.com/ackrate/ackrate-protocol-contracts/blob/main/docs/mainnet-v2-security-verification.md) records the deployed contract and reviewed WASM hash.

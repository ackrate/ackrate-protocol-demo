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

# vendor/ackrate-cli.mjs

A self-contained bundle of the **@ackrate/cli** (`ackrate` command), used by
`/api/cli` so the hosted terminal runs the real CLI server-side.

Why bundled (not `npx`): the bundle inlines `@ackrate/core` from the
**ackrate-protocol workspace**, keeping the hosted demo pinned to the exact CLI
source used for the site. `@stellar/stellar-sdk` is left external and resolved
from this app's `node_modules` at runtime.

## Regenerate

From the `ackrate-protocol` repo:

```
npm run cli:bundle
cp packages/cli/dist/ackrate-cli.bundle.mjs ../ackrate-protocol-demo/vendor/ackrate-cli.mjs
```

Re-run whenever the CLI or the core settlement logic changes.

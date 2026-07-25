# AP2 v0.2 migration

This branch moves the site's AP2 validator from `@reapp-sdk/ap2@0.3.0` (AP2
v0.1 IntentMandate) to `0.4.0` (AP2 v0.2 Open Payment Mandate).

## Why this needed a code change, not a version bump

`0.4.0` does not accept the v0.1 authoring shape. `signAp2Mandate` takes
`{ paymentMandate, stellar }` instead of `{ intent, stellar }`, and the package
rejects unknown top-level keys, so the previous call fails immediately. The
package can still *validate* a v0.1 credential — `parseSignedAp2V01Mandate` and
`rebuildV01CredentialBinding` are exported — but it can no longer *mint* one.
Staying on the old shape was not an option; `app/api/ap2/route.ts` had to move
to the v0.2 mandate.

## What changed

| Area | Change |
|---|---|
| `app/api/ap2/route.ts` | Builds an AP2 v0.2 Open Payment Mandate: six required constraints, an Ed25519 `cnf` JWK confirming the agent key, and `exp` equal to `payment.execution_date.not_after`. |
| `app/api/ap2/route.ts` | Every admission now passes `checkoutReference`; v0.2 binds a payment to the checkout it was signed against. |
| `app/api/ap2/route.ts` | New `checkout` scenario covering `CHECKOUT_REFERENCE_MISMATCH`. |
| `app/ap2/page.tsx` | Seventh scenario card, v0.2 copy, and the 0.4.0 npm link. |
| `app/llms.txt`, `app/llms-full.txt` | Describe the v0.2 bridge rather than IntentMandate translation. |

Amounts are unchanged in effect: `payment.amount_range.max` is `500` ISO-4217
minor units and `payment.budget.max` is `5` major units, which the bridge
requires to agree exactly and which resolves to the same `5.00` ceiling the
v0.1 mandate used. The overspend scenario still probes `5.0000001`.

## Blocked on publish

`@reapp-sdk/ap2@0.4.0` is not on npm yet, so `npm ci` at the repository root
cannot resolve it. To verify this branch before publication, build the package
from `reapp-protocol` on its `ap2v0.2` branch and stage it:

```bash
cd ../reapp-protocol/packages/ap2 && npm run build && npm pack
tar -xzf reapp-sdk-ap2-0.4.0.tgz -C /tmp
rm -rf ../../../reapp-protocol-live/node_modules/@reapp-sdk/ap2
cp -R /tmp/package ../../../reapp-protocol-live/node_modules/@reapp-sdk/ap2
```

`npm run typecheck`, `npm run test:hackathon` (87 tests), and `npm run build`
all pass against that staged package.

## The 20 starter packs stay on 0.3.0 for now

None of them import `@reapp-sdk/ap2`; they only declare it. Their
`package-lock.json` files are canonical artifacts carrying registry `resolved`
URLs and `integrity` hashes, so they cannot name `0.4.0` until the tarball
exists. After publication, bump `starter-kit-src/dependency-policy.json` and
run `npm run generate:starters`, which rewrites the catalog, the generated
metadata, and all 20 lockfiles together. `npm run check:starters` verifies the
result.

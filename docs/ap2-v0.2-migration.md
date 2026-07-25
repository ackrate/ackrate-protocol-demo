# AP2 v0.2 migration

This branch moves the site's AP2 validator from `@reapp-sdk/ap2@0.3.0` (AP2
v0.1 IntentMandate) to `0.4.0`, which signs and admits **both** the v0.2 Open
Payment Mandate and the v0.1 IntentMandate.

## Why this needed a code change, not a version bump

`signAp2Mandate` changed meaning. In 0.3.0 it took `{ intent, stellar }` and
signed a v0.1 IntentMandate; in 0.4.0 it takes `{ paymentMandate, stellar }` and
signs a v0.2 Open Payment Mandate. The package rejects unknown top-level keys,
so the old call fails immediately rather than silently signing a different
protocol version — which is the behavior you want, but it does mean
`app/api/ap2/route.ts` had to be rewritten rather than repinned.

v0.1 authoring did not go away. It moved to `signAp2V01Mandate`, which produces
a credential byte-identical to 0.3.0's for the same inputs. The version is now
always explicit at the call site.

## What changed

| Area | Change |
|---|---|
| `app/api/ap2/route.ts` | Accepts a `version` of `"0.2.0"` (default) or `"0.1.0"` and mints the matching credential with `signAp2Mandate` or `signAp2V01Mandate`. |
| `app/api/ap2/route.ts` | Builds an AP2 v0.2 Open Payment Mandate: six required constraints, an Ed25519 `cnf` JWK confirming the agent key, and `exp` equal to `payment.execution_date.not_after`. |
| `app/api/ap2/route.ts` | v0.2 admissions pass `checkoutReference`; v0.2 binds a payment to the checkout it was signed against. |
| `app/api/ap2/route.ts` | New `checkout` scenario: `CHECKOUT_REFERENCE_MISMATCH` under v0.2, and under v0.1 an accepted admission showing the reference is not enforced by a profile that never carried one. |
| `app/api/ap2/route.ts` | Response now reports `version`, `ap2SpecVersion`, `ap2MandateType`, and `bindingVersion`; `checkoutReference` is `null` for v0.1. |
| `app/ap2/page.tsx` | Mandate-version toggle, seventh scenario card, corrected header badge and package chip, and a test matrix regenerated from the real 77-test suite. |
| `app/llms.txt`, `app/llms-full.txt` | Describe the dual-version bridge. |

Amounts are unchanged in effect. Under v0.2, `payment.amount_range.max` is `500`
ISO-4217 minor units and `payment.budget.max` is `5` major units, which the
bridge requires to agree exactly; under v0.1 the same ceiling is written
directly as `maxAmount: "5.00"`. Both resolve to `5.00`, and the overspend
scenario probes `5.0000001` against either.

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
all pass against that staged package. A normal `npm ci` after publication undoes
the staging.

To exercise both versions against the running route:

```bash
npm run dev
curl -s -X POST localhost:3000/api/ap2 -H 'content-type: application/json' \
  -d '{"scenario":"all","version":"0.2.0"}'
curl -s -X POST localhost:3000/api/ap2 -H 'content-type: application/json' \
  -d '{"scenario":"all","version":"0.1.0"}'
```

## The 20 starter packs stay on 0.3.0 for now

None of them import `@reapp-sdk/ap2`; they only declare it. Their
`package-lock.json` files are canonical artifacts carrying registry `resolved`
URLs and `integrity` hashes, so they cannot name `0.4.0` until the tarball
exists. After publication, bump `starter-kit-src/dependency-policy.json` and
run `npm run generate:starters`, which rewrites the catalog, the generated
metadata, and all 20 lockfiles together. `npm run check:starters` verifies the
result.

Because 0.4.0 still signs v0.1, that bump is now a routine version update: any
starter that did adopt the v0.1 API would keep working across it.

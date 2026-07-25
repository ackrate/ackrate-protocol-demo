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
| `app/api/ap2/route.ts` | New `checkout` scenario: `CHECKOUT_REFERENCE_MISMATCH` under v0.2. Under v0.1 it reports `NOT_APPLICABLE` — the IntentMandate profile never carried a checkout reference, so this is protection v0.1 lacks, not a boundary it passes, and the UI renders it neutrally rather than as a green tick. |
| `app/api/ap2/route.ts` | Response now reports `version`, `ap2SpecVersion`, `ap2MandateType`, and `bindingVersion`; `checkoutReference` is `null` for v0.1. |
| `app/ap2/page.tsx` | Mandate-version toggle, seventh scenario card, corrected header badge and package chip, and a test matrix regenerated from the real 77-test suite. |
| `app/llms.txt`, `app/llms-full.txt` | Describe the dual-version bridge. |

Amounts are unchanged in effect. Under v0.2, `payment.amount_range.max` is `500`
ISO-4217 minor units and `payment.budget.max` is `5` major units, which the
bridge requires to agree exactly; under v0.1 the same ceiling is written
directly as `maxAmount: "5.00"`. Both resolve to `5.00`, and the overspend
scenario probes `5.0000001` against either.

## Published

`@reapp-sdk/ap2@0.4.0` is on npm (published 2026-07-25, integrity
`sha512-zFV2MBANMqNQE…`). The branch installs it straight from the registry;
the local staging that this document previously described is gone.

```bash
npm ci
npm run typecheck && npm run test:hackathon && npm run build
```

To exercise both versions against the running route:

```bash
npm run dev
curl -s -X POST localhost:3000/api/ap2 -H 'content-type: application/json' \
  -d '{"scenario":"all","version":"0.2.0"}'
curl -s -X POST localhost:3000/api/ap2 -H 'content-type: application/json' \
  -d '{"scenario":"all","version":"0.1.0"}'
```

An omitted `version` defaults to `0.2.0`; an unknown version or an extra body
key is a 400.

## The 20 starter packs

All 20 are on `0.4.0`. Their `package-lock.json` files are canonical artifacts
carrying registry `resolved` URLs and `integrity` hashes, so they could not name
`0.4.0` until the tarball existed. After publication the pin was bumped in both
places that hold it — `starter-kit-src/dependency-policy.json` and the
`EXPECTED_DEPENDENCIES` copy in `scripts/starters/catalog.mjs` — and
`npm run generate:starters` rewrote the catalog, the generated metadata, and all
20 lockfiles together. `npm run check:starters` verifies the result.

Because 0.4.0 still signs v0.1, that was a routine version bump: a starter that
had adopted the v0.1 API keeps working across it.

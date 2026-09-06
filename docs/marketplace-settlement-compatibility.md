# Marketplace settlement compatibility

## Current boundary

The hosted wallet uses two payments. `MandateRegistry.execute_payment`
checks the user's mandate and transfers the exact purchase amount to the
configured relay. The relay then signs an x402 Stellar `exact` payment to
the external service's `payTo` address.

The user's withdrawal limit is enforced by the registry. The final external
recipient is currently checked by application code; it is not the merchant
registered in the on-chain mandate. These are different guarantees and must
be described separately in the wallet and payment evidence.

Relevant implementation:

- `lib/wallet/app-config.ts`: Mainnet currently uses the agent address as the
  registered merchant.
- `lib/wallet/mandate-client.ts`: registration uses that configured merchant.
- `lib/wallet/purchase.ts`: obtains an unpaid external challenge before the
  contract payment to the relay.
- `lib/wallet/fulfillment.ts`: verifies the contract payment before delivery.
- `lib/wallet/agent402.ts`: sends the separate external x402 payment.

## Observed external requirements

An unpaid request to
`https://agent402.tools/api/search?q=What%20is%20Stellar%3F&count=5`
returned HTTP 402 during the integration check on 2026-09-06. Its Stellar
option advertised:

| Field | Value |
| --- | --- |
| Scheme | `exact` |
| Network | `stellar:pubnet` |
| Asset | `CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75` |
| Amount | `200000` atomic units, or `0.02 USDC` |
| External merchant | `GDNJXCKW7ZM7GEEVP674TWPU26YJNBQ2FI4ZIPRKTPTNUEJMDHFJWWRL` |
| Fees sponsored | `true` |
| Maximum timeout | `300` seconds |

This is an observation, not a permanent price or payee configuration. A
purchase must obtain and validate fresh requirements. No paid request or
Mainnet transaction was made for this compatibility check.

## Why changing the merchant address is insufficient

The installed `@x402/stellar` 2.25.0 facilitator verifies one top-level
invocation of the advertised token's `transfer(from, to, amount)`. It
rejects a call to another contract and rejects `transfer_from`. It also
restricts authorization sub-invocations and simulated contract events.

The deployed registry's payment operation invokes `execute_payment`, then
atomically validates and consumes the mandate and calls the token's
`transfer_from`. Relabeling that transaction as an `exact` token transfer
does not make it compatible. A previously settled registry transaction
hash also is not an x402 payment authorization.

Changing only the registered merchant would send user funds to a seller
without establishing that the seller can recognize the registry payment
and deliver the purchased result. A second transfer would pay twice.

References:

- [Stellar exact payment scheme](https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_stellar.md)
- [OpenZeppelin facilitator operation validation](https://docs.openzeppelin.com/relayer/guides/stellar-x402-facilitator-guide)
- [Agent402 payment integration](https://github.com/MikeyPetrillo/Agent402/blob/main/src/payments.js)
- [Agent402 service input and output contract](https://agent402.tools/tools/search)

The package-level rejection is reproducible locally; it is not evidence
that a paid end-to-end transaction succeeded.

## Direct settlement integration needed

For the external merchant to be bound directly by the registry, the seller
or its trusted facilitator must explicitly support verifying a registry
payment and redeeming its proof. That integration must verify the registry,
network, canonical USDC asset, merchant, payer mandate, amount, successful
execution, and exact purchased resource. Proof redemption must be bound to
the request and reject replay. Delivery recovery must reuse the confirmed
payment rather than initiate a new payment.

Keep that wire-format adapter separate from mandate construction and
on-chain enforcement. Do not weaken the token allowance, bypass
`execute_payment`, modify governance, or claim direct merchant enforcement
from a relay payment to work around an unsupported external scheme.

## Acceptance evidence

A completed direct integration needs one human-approved mandate naming
the selected external merchant, one contract-enforced USDC payment to that
merchant, the merchant's successful delivery tied to that payment, and
recovery without double payment. The hosted flow should show the service
inputs and fresh quote before approval, followed by the actual returned
report or file and verifiable payment evidence.

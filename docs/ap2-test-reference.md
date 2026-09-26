# AP2 package test reference

Recorded catalog for `@ackrate/ap2` 0.4.0; not a fresh test execution. The [source tests](https://github.com/ackrate/ackrate-protocol/tree/main/packages/ap2) are authoritative. The live demo exercises the valid path plus signature, merchant, amount, expiry, and replay rejection.

## Binding & canonicalization

- canonical JSON is independent of object key insertion order
- binds the supported AP2 v0.1.0 intent to a 32-byte ACKRATE vc_hash
- pins a canonical AP2 hash vector
- provided nonce makes the full binding reproducible across key order
- secure default nonces keep identical intents distinct
- fails closed for AP2 constraints MandateRegistry cannot enforce
- rejects ambiguous expiry and invalid Stellar authorization
- fails closed on unknown intent and Stellar authorization fields
- rejects impossible calendar expiries instead of normalizing them
- signer and validator share the same canonical UTC year range
- signer and validator share the same decimal range
- agent authorization requires an Ed25519 G-address

## Credential, signature & identity

- valid signed AP2 mandate succeeds
- returned mandate hash equals the recomputed ACKRATE id
- fixed seed and nonce produce a deterministic signature digest and signature
- exact signed maximum amount succeeds
- one-stroop positive amount succeeds
- signing key must match the payload user
- trusted expected user mismatch is rejected
- tampered natural-language intent is rejected by binding
- tampered merchant is rejected by binding
- tampered maximum amount is rejected by binding
- tampered decimals are rejected by the full-payload signature
- tampered expiry is rejected by binding
- tampered agent is rejected by binding
- tampered asset is rejected before signature verification
- malformed base64 signature is rejected
- non-canonical base64 signature is rejected
- signature with the wrong decoded length is rejected
- signature created by another Ed25519 key is rejected
- unsupported signature algorithm is rejected
- unsupported credential version is rejected
- unsupported AP2 version is rejected
- unsupported ACKRATE binding version is rejected
- wrong AP2 data key is rejected
- envelope mandate hash mismatch is rejected
- unknown top-level credential field fails closed
- unknown intent field fails closed
- invalid user, agent, and asset identities fail closed

## Scope & amount

- trusted merchant outside signed scope is rejected
- zero amount is rejected
- negative amount is rejected
- scientific-notation amount is rejected
- excess fractional precision is rejected
- one stroop over the signed maximum is rejected as overspend
- amount beyond contract i128 is rejected

## Expiry & trusted clock

- expired signed mandate is rejected
- expiry exactly equal to the trusted clock is rejected
- future expiry succeeds under the injected clock
- impossible calendar expiry fails closed

## Replay & storage isolation

- replayed mandate hash is rejected on second admission
- 100 concurrent admissions yield exactly one success
- replay store exception fails closed
- unsupported replay store result fails closed
- bad signature does not poison the replay store
- wrong merchant does not poison the replay store
- overspend does not poison the replay store
- expired credential does not poison the replay store
- explicit replay namespaces isolate independent registries


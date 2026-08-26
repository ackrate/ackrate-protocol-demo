# ACKRATE Mainnet Delivery Roadmap

The canonical cross-repository roadmap is maintained in
[`ackrate-protocol/docs/mainnet-roadmap.md`](https://github.com/ackrate/ackrate-protocol/blob/992e1a70035bf324ad942ed947e83265dfb5cca8/docs/mainnet-roadmap.md).
The link is pinned to the exact planning commit so its content cannot drift.

This repository owns the hosted wallet and consumer experience described in
Work package 7 and Gate 6 of that roadmap:

- connect a user-controlled Stellar wallet through a replaceable adapter;
- review, sign, register, inspect, and revoke an IntentMandate;
- use the current Vercel AI SDK tool interface with the matching assistant-ui
  runtime;
- treat model output and tool arguments as untrusted;
- execute payments only through the contract-authoritative path;
- show receipts, transaction evidence, amount spent, and remaining budget;
- preserve tool-call state and exact recovery across disconnects;
- reject wrong-network, modified, expired, cancelled, and replayed requests;
- keep seed phrases and secret keys out of the app, server, telemetry, and
  support flow;
- fingerprint the hosted revision and runtime deployment mapping.

Implementation begins only after the authority, contract interface, and network
mapping dependencies named in the canonical roadmap are stable. A candidate may
use injected test configuration, but no production default is published before
the verified mainnet deployment manifest exists.

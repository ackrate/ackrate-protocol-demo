# Wallet connection troubleshooting

This release uses `@stellar/freighter-api` for the desktop browser extension. It does not yet establish WalletConnect sessions. Freighter Mobile uses WalletConnect even inside its Discover browser; an extension API request cannot open a mobile approval prompt. Do not interpret opening the site in Freighter Mobile as a supported connection.

## Collect a report

Open `/wallet`, attempt Connect Freighter, then expand **Troubleshoot wallet connection**. Review the JSON and choose **Share / copy report** or **Download report**. Send it with the phone OS, Freighter version and the URL used. Use the report's source commit to distinguish staging from `reapp.live`.

The report keeps the last 40 connection/sign-in events in memory. It records fixed stage/outcome names, numeric provider/HTTP codes, OS/browser family, origin, network, source commit and server readiness. It does not record addresses, raw user agents, request bodies, messages, cookies, keys, signatures, transaction envelopes or query parameters. It is not uploaded automatically and disappears on reload; export before refreshing.

Desktop checks: install/enable and initialize the extension, unlock it, select Mainnet and inspect any pending approval prompt. Detection times out after 5 seconds, access after 60 seconds, network lookup after 10 seconds and offline signing after 90 seconds. Auth/config HTTP requests stop waiting after 15 seconds. A timeout does not cancel a wallet popup: dismiss an old request before retrying. Late responses do not resume an abandoned connection/sign-in. Transaction submission and reconciliation behavior is unchanged.

## Mobile integration still required

Use a project-owned WalletConnect/Reown project ID, with the actual staging and production origins configured. No such configuration was found during this check. Follow the official Freighter sample; do not copy its demonstration project ID into a deployed app.

- Establish a `stellar:pubnet` session and require `stellar_signXDR` and `stellar_signMessage`; this app needs both. Do not request sign-and-submit authority.
- Keep the existing readable SEP-53 sign-in and exact signature verification. Freighter returns `{ signature }` for WalletConnect message signing and `{ signedXDR }` for transaction signing.
- Validate session account/network, handle expiry, disconnects and account changes, and preserve the existing transaction identity/recovery checks.
- Add only the required WalletConnect relay/metadata origins to CSP, and verify native in-app handoff on iOS and Android. Test pairing, rejection, timeout, offline sign-in, reconnection, wrong account/network and payment recovery before declaring mobile supported.

Server readiness is a separate gate: a successful wallet connection cannot supply missing server credentials, storage or activation configuration.

## Canonical references

- [Freighter's desktop/mobile connection guide](https://help.freighter.app/article/y848tzczm2-how-do-i-connect-to-dapps)
- [Freighter Mobile RPC methods and request/response examples](https://github.com/stellar/freighter-mobile/blob/main/docs/walletconnect-rpc-methods.md)
- [Freighter mobile installation and provider example](https://docs.freighter.app/mobile-walletconnect/installation)
- [Freighter Mobile source and mock-dApp sample](https://github.com/stellar/freighter-mobile/tree/main)

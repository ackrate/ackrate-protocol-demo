# Wallet connection

Desktop uses `@stellar/freighter-api`. Freighter Mobile uses WalletConnect, including inside its Discover browser. The Connect button selects the mobile transport on mobile browsers; desktop users can choose **Use Freighter Mobile / QR code**.

## Enable mobile on a deployment

1. Use an organization-owned project in [Reown Dashboard](https://dashboard.reown.com/). Allowlist the actual deployment origins, including `https://staging.ackrate.com` and the stable randomized Vercel domain. Add preview origins only when needed.
2. Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` in the corresponding Vercel project environments, then rebuild and deploy. This is a public 32-character project identifier, never a wallet key or CI token.
3. Validate the native Freighter handoff on iOS and Android. Confirm pairing approval and rejection, offline sign-in, reload, disconnect, changed account/network, and exact transaction signing before accepting mobile support.

The adapter is implemented, but staging has no configured project ID as of September 25, 2026. Reown requires a signed-in project owner. The UI reports this explicitly instead of waiting for an extension popup that cannot appear on mobile. Track activation in the private wiki task register (ACK-005).

## Signing and recovery

Only `stellar_signMessage` and `stellar_signXDR` are requested for the selected Stellar network. Approved account, methods, expiry and network are validated before signing and after each response. The shared sign-in wrapper checks the exact SEP-53 message signature. Transactions must retain the original hash and contain the connected account's valid signature. The wallet never submits transactions; existing app submission and reconciliation checks remain in control.

The provider manages WalletConnect session and pairing state in its own browser storage. That protocol state is never included in the connection report. The app stores only a transport preference. Disconnect closes the WalletConnect session; account changes and session expiry invalidate the old app sign-in. Mobile asset addition is manual: add Circle USDC in Freighter, return, then refresh the on-chain balance/trustline. A wallet's asset-add response alone does not prove a trustline exists.

## Collect a report

Open `/wallet`, attempt a connection, then expand **Troubleshoot wallet connection**. Review the JSON and choose **Share / copy report** or **Download report**. Send it with the phone OS, Freighter version and URL used. The source commit distinguishes staging from the older `reapp.live` deployment.

The report keeps the last 40 connection/signing events in memory: fixed stage/outcome names, numeric provider/HTTP codes, OS/browser family, origin, transport, network, source commit and server readiness. It excludes addresses, raw user agents, request bodies, messages, cookies, keys, signatures, envelopes and query parameters. Nothing is uploaded automatically. Export before refreshing.

Desktop detection/access/network checks stop waiting after 5/60/10 seconds. Mobile initialization/pairing stop after 20/120 seconds; offline signing after 90 seconds and mobile transaction signing after 120 seconds. Closing the modal clears pending pairings. If approval is still outstanding, dismiss the old wallet request and refresh before reconnecting; late approval is disconnected. The provider's deprecated abort method is not used. A late response never submits a transaction. App HTTP checks stop waiting after 15 seconds.

Server readiness is separate from connecting: staging also needs isolated server credentials, durable storage and activation configuration (ACK-006). A connected wallet does not make those services ready. No native phone pairing or Mainnet payment is claimed by adapter unit tests.

## References

- [Freighter's desktop/mobile connection guide](https://help.freighter.app/article/y848tzczm2-how-do-i-connect-to-dapps)
- [Canonical installation](https://docs.freighter.app/mobile-walletconnect/installation), [connecting](https://docs.freighter.app/mobile-walletconnect/connecting), and [signing](https://docs.freighter.app/mobile-walletconnect/signing)
- [Freighter RPC methods](https://github.com/stellar/freighter-mobile/blob/main/docs/walletconnect-rpc-methods.md)
- [Reown CSP requirements](https://docs.reown.com/advanced/security/content-security-policy)

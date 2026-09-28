# Wallet connection

Desktop uses `@stellar/freighter-api`. Freighter Mobile uses WalletConnect, including inside its Discover browser. The Connect button selects the mobile transport on mobile browsers; desktop users can choose **Use Freighter Mobile / QR code**.

## Enable mobile on a deployment

1. Use an organization-owned project in [Reown Dashboard](https://dashboard.reown.com/). Allowlist the production origin `https://reapp.ackrate.com`. Add an exact Preview or retained staging origin only when that environment is an intended test target.
2. Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` in the corresponding Vercel project environments, then rebuild and deploy. This is a public 32-character project identifier, never a wallet key or CI token.
3. Validate the native Freighter handoff on iOS and Android. Confirm pairing approval and rejection, offline sign-in, reload, disconnect, changed account/network, and exact transaction signing before accepting mobile support.

On September 25, 2026, the REAPP staging project was created in Reown under the REAPP team (Starter plan). Its public project ID is configured in the Vercel staging production environment. At that checkpoint, only `https://staging.ackrate.com` and `https://ackrate-ackrate-protocol-demo-a7c4d19.vercel.app` were allowlisted. Production requires `https://reapp.ackrate.com` in its configured Reown project allowlist; see [production configuration](vercel-native.md#production-runtime). Rebuild after changing this environment variable. Native iOS/Android pairing and signing require separate acceptance from server readiness.

## Available adapters

Only Freighter extension and Freighter Mobile are enabled. WalletConnect is their mobile transport; it does not establish support for every wallet advertising WalletConnect. The table distinguishes implemented adapters from upstream APIs as checked on September 27, 2026. An API or synthetic test is not live wallet/device acceptance.

| Wallet or transport | Application support and integration boundary |
|---|---|
| Freighter extension | Implemented. Uses permissioned account access, network checks, [SEP-53 message signing and signed transaction XDR](https://docs.freighter.app/extension-freighter-api/signing). |
| Freighter Mobile | Implemented through WalletConnect. Requires the native wallet's [message and transaction RPC methods](https://github.com/stellar/freighter-mobile/blob/059c83dd14972e64d7fd511cd4aef2180d5026d4/docs/walletconnect-rpc-methods.md); native financial signing, stock deep links and physical-device acceptance remain separate release checks. |
| WalletConnect | Transport only. Inspect approved accounts, network, expiry and both required methods. [Reown's Stellar reference](https://docs.reown.com/advanced/multichain/rpc-reference/stellar-rpc) does not establish compatible offline message signing for every wallet. |
| Albedo | Not enabled. Its [message verifier](https://github.com/stellar-expert/albedo/blob/c2fe8f681776dd546ef3225d504ba64565825255/signature-verification/src/index.js) uses a different signed-message domain from SEP-53. |
| Hana | Not enabled. Its [integration guide](https://support.hanawallet.io/en/articles/11045736-hana-wallet-stellar-integration-guide) exposes message/transaction APIs; an explicit Hana provider and exact signature/lifecycle verification are needed, especially with Freighter also installed. |
| Ledger | Not enabled. Stellar app [v6 adds SEP-53](https://github.com/LedgerHQ/app-stellar/blob/62018430f350537328913f2b88a0b2e93b4c338d/release-notes.md); a version-gated hardware adapter and physical-device tests are required. A generic wallet-kit entry alone is insufficient. |
| Trezor | Not enabled. The current [Stellar firmware protocol](https://github.com/trezor/trezor-firmware/blob/3227ea8110e2ca2a53439b123f3d764655e9f9ae/common/protob/messages-stellar.proto) includes Soroban signing but does not establish a compatible Stellar SEP-53 message endpoint. |
| LOBSTR | Not enabled; SDK dependency alone is not an adapter. Its [extension bridge](https://github.com/Lobstrco/lobstr-browser-extension/blob/849662d17063c0c0ddf51a7eeddef6bd734fad03/@lobstrco/signer-extension-api/README.md) needs a no-payment offline-signature proof and paired-account/network/lifecycle checks. |
| Rabet | Not enabled. Its [current signer](https://github.com/rabetofficial/rabet-extension/blob/0db628e5f772cf01e951f36955d3c27027ed6bae/src/background_script/utils/signMessage.ts) signs raw message bytes rather than the SEP-53 domain. |
| xBull | Not enabled. Its [software message signer](https://github.com/Creit-Tech/xBull-Wallet/blob/8308875557be12f25aac9b984152c822d2ff1989/src/app/shared/shared-modals/components/sign-message/sign-message.component.ts) uses the SEP-53 prefix/hash; exact encoding, connector cleanup, distribution and license checks remain. Its connector is distinct from WalletConnect. |
| HOT | Not enabled. The [official adapter](https://github.com/hot-dao/hot-sdk-js/blob/7c01c4f0b3a8eb69bd8d85f72a0dbd1ebd87c5fe/src/adapter/stellar.ts) declares Mainnet message/transaction APIs; exact proof and transport lifecycle remain unverified. |
| Klever | Not enabled. The [maintained connector](https://github.com/Creit-Tech/Stellar-Wallets-Kit/blob/7663331fd6e8d192653deb08ae93fd0c224b42a8/src/sdk/modules/klever.module.ts) exposes Stellar message/network/transaction methods; their presence does not verify the wallet's signature format or lifecycle. |
| Others / OneKey | No blanket support. OneKey's [software Stellar API](https://developer.onekey.so/en/connect-to-software/provider/stellar/api-reference/) is a candidate requiring exact proof and lifecycle tests; it does not certify hardware or every mobile route. |

All additions must preserve the readable, one-use [SEP-53 proof](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0053.md), selected G-address, expected network, transaction integrity and cancellation rules. Do not substitute transaction signing for login. Standalone Soroban auth-entry signing is not required by the current buyer flow, which signs complete transaction XDR. Record each wallet/version/platform's connect, reject, sign-in, account/network change, reload, disconnect and authorized transaction acceptance separately before declaring support.

## Signing and recovery

For mobile, only `stellar_signMessage` and `stellar_signXDR` are requested for the selected Stellar network. Approved account, methods, expiry and network are validated before signing and after each response. The shared sign-in wrapper checks the exact SEP-53 message signature. Both desktop and mobile transactions must retain the original hash and contain the connected account's valid signature under the expected network. The wallet never submits transactions; existing app submission and reconciliation checks remain in control.

Desktop signing opens the wallet immediately from the user's click, then verifies the returned envelope and rechecks account, site permission and network before any caller can retain or submit it. Changed, unsigned, wrong-key or wrong-network results fail closed. Silent session reuse checks account and network; an unavailable extension/read returns an unknown state, which is insufficient to release a signed transaction. The shared verifier is `lib/wallet/transaction-proof.ts`; desktop and mobile adapter tests cover these boundaries with synthetic keys.

The provider manages WalletConnect session and pairing state in its own browser storage. That protocol state is never included in the connection report. The app stores only a transport preference. Disconnect closes the WalletConnect session; account changes and session expiry invalidate the old app sign-in. Mobile asset addition is manual: add Circle USDC in Freighter, return, then refresh the on-chain balance/trustline. A wallet's asset-add response alone does not prove a trustline exists.

## Collect a report

Open `/wallet`, attempt a connection, then expand **Troubleshoot wallet connection**. Review the JSON and choose **Share / copy report** or **Download report**. Send it with the phone OS, Freighter version and URL used. Use the origin and source commit together to distinguish production, Preview and retained staging builds.

The report keeps the last 40 connection/signing events in memory: fixed stage/outcome names, numeric provider/HTTP codes, OS/browser family, origin, transport, network, source commit and server readiness. It excludes addresses, raw user agents, request bodies, messages, cookies, keys, signatures, envelopes and query parameters. Nothing is uploaded automatically. Export before refreshing.

Desktop detection/access/network checks stop waiting after 5/60/10 seconds; desktop session revalidation stops after 10 seconds. Mobile initialization/pairing stop after 20/120 seconds; offline signing after 90 seconds and mobile transaction signing after 120 seconds. Closing the modal clears pending pairings. If approval is still outstanding, dismiss the old wallet request and refresh before reconnecting; late approval is disconnected. The provider's deprecated abort method is not used. A late response never submits a transaction. App HTTP checks stop waiting after 15 seconds.

Server readiness is separate from connecting: staging also needs isolated server credentials, durable storage and activation configuration. A connected wallet does not make those services ready. No native phone pairing or Mainnet payment is claimed by adapter unit tests.

## References

- [Freighter's desktop/mobile connection guide](https://help.freighter.app/article/y848tzczm2-how-do-i-connect-to-dapps)
- [Canonical installation](https://docs.freighter.app/mobile-walletconnect/installation), [connecting](https://docs.freighter.app/mobile-walletconnect/connecting), and [signing](https://docs.freighter.app/mobile-walletconnect/signing)
- [Freighter RPC methods](https://github.com/stellar/freighter-mobile/blob/main/docs/walletconnect-rpc-methods.md)
- [Reown CSP requirements](https://docs.reown.com/advanced/security/content-security-policy)

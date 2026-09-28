# Hosted wallet: human test

Use [the production wallet](https://reapp.ackrate.com/wallet) in Chrome with Freighter. Record the exact origin and source revision before testing; a Preview or retained staging deployment is a separate acceptance target.
This configured acceptance deployment uses Stellar Mainnet and real USDC; a PR preview may lack payment services.
No deployment or automated check substitutes for completing this flow.

1. Refresh the page. Disconnect and reconnect your personal mainnet wallet if
   you want to demonstrate the connection from the beginning.
2. Choose **Web search**. Configure the query **What is Stellar?** and review
   the fresh service quote. The price comes from the marketplace, not this guide.
3. Set a spending limit covering the quoted price, for example **0.01 USDC** when that covers one quoted call,
   and an expiry. Approve registration and then the capped USDC allowance in
   Freighter. If submission is uncertain, **Check USDC approval — no new fee**
   checks the original transaction instead of submitting another.
4. Press **Run** once. The agent uses the selected inputs and current quote,
   makes the mandate-checked payment, and requests the marketplace service.
   The model formats the returned evidence; it does not invent a purchase.
5. Open the result and proof. Verify the usable output, downloads, amount,
   mandate, registry transaction, and separate marketplace transaction.

PDF to text and PDF information require a public PDF URL in Configure.
Their outputs are extracted text or metadata, not a generated PDF.
Other marketplace listings remain browse-only until their payment and input
adapters are supported.

## Model configuration

Check the [production runtime configuration](vercel-native.md#production-runtime)
for the tested deployment. Production currently uses
`LLM_PROVIDER_MODE=openai-gemini-failover`: OpenAI through Vercel AI Gateway,
with a direct Gemini fallback. The source default remains `openai-only` when
no mode is configured; it is not the production setting. Record the selected
mode and deployed source revision with the test result.

Model access and credit are separate from the wallet's USDC balance.
Formatting failure must not trigger another payment: a saved marketplace
result remains available, with a source-only view if model formatting fails.

## Payment and recovery boundaries

The registry enforces the capped USDC payment to the disclosed relay account.
The relay then pays the marketplace recipient from the 402 response. These are
two settlements; both must be visible in proof before calling the service run
complete.

The hosted verifier now understands the manifest-pinned V2 payment event,
including its asset and consumed sequence. Signature, transfer, freshness and
duplicate-payment checks remain required.

An old receipt that expired before fulfillment cannot be silently retried or
repaid. A reconciliation message means retain the receipt and ask the operator
to reconcile it; it does not mean the service delivered successfully.
If a payment record exists, recover or inspect it before starting another Run.

Retain the deployed commit and both transaction links with the human result.
This page does not claim all release requirements are complete.


## Mobile connection recovery

Test a fresh Freighter Mobile connection and a restored connection separately.
After approving the connection, sign the offline ownership message. Then reload
before another sign-in attempt and verify that the existing approved account,
network and methods remain valid and the native signing request still appears.
Neither sign-in step should submit an on-chain transaction or charge a fee.

A page reload can restore WalletConnect's approved session before its separate
provider routing cache has been written. The adapter rebuilds missing signing
method routing only from that approved session through the SDK's public
`updateNamespace` API. Conflicting accounts, chains or methods fail closed;
transaction and signature verification still run before results are accepted.
If a wallet session update removes a previously approved account or method,
reconnect so stale additive provider routing cannot retain that permission.

A development simulator wallet uses its own application URL scheme and may
need manual pairing. Record that separately from stock Freighter on a real
phone; a successful simulator connection does not certify native-device payment
or platform-switching behavior.

# Hosted wallet: human test

Use [the hosted wallet](https://reapp.live/wallet) in Chrome with Freighter.
No deployment or automated check substitutes for completing this flow.

1. Refresh the page. Disconnect and reconnect your personal mainnet wallet if
   you want to demonstrate the connection from the beginning.
2. Choose **Web search**. Configure the query **What is Stellar?** and review
   the fresh service quote. The price comes from the marketplace, not this guide.
3. Set a spending limit covering the quoted price, for example **0.10 USDC**,
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

`LLM_PROVIDER_MODE=openai-only` is the default for both streaming chat and
report composition. Only `OPENAI_API_KEY` is used in this mode, even when an
alternate key remains in Railway. `LLM_PRIMARY` cannot override this restriction.
The existing `OPENAI_MODEL` selection is preserved. An operator may explicitly
enable `LLM_PROVIDER_MODE=failover` later; it is not needed for this demo.

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

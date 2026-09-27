# Recovering a written summary

A completed paid Web search can retain its source evidence even when report
composition fails. `lib/wallet/marketplace-report.ts` requests provider-supported
strict JSON Schema output, then validates length, citation bounds, and paragraph
shape locally. The provider schema recursively omits `$schema`, `minLength`, and
`maxLength`; supported descriptions give the model length guidance, and the
unchanged local Zod schema enforces those bounds. Failure keeps
the deterministic source-only report. Diagnostics
contain only a fixed failure category, processing stage, elapsed time, optional
HTTP status, and bounded schema field paths. They exclude source text, model
output, provider error messages, credentials, and wallet identifiers.

The wallet offers **Retry written summary** only after reading the authenticated
status of a source-only paid report. It uses retained evidence; it never buys a
new search or asks the wallet to authorize a payment. The model-only call still
uses the configured provider's existing quota. There is no automatic provider
retry, and the manual retry skips the optional second editor.

## API and durable allowance

`GET /api/wallet/reports/retry?mandateId=…&txHash=…` reads status; `POST` accepts
exactly those two fields as JSON. Both require the existing signed wallet session.
POST also requires the existing same-origin guard. The owner comes only from the
session. The server verifies the completed tool call, marketplace delivery,
settlement identity and amount, and identical retained evidence before any model
request. `count` is the actual retained result count: `agent402.ts` normalizes it
to `results.length` after delivery, independently of the requested search limit.
The paid ledger and original brief bind the requested question. A seller-normalized
query remains part of the saved evidence without replacing that original question.

The additive `ackrate_report_revisions` table is created on the first authorized,
eligible POST using the repository's existing runtime table setup pattern. GET
does not create a table. Its primary key `(contract_tx, composer_version)` reserves
one model request atomically across concurrent requests and workers. Each row
also binds the owner, mandate, and a SHA-256 digest of the validated source packet.
There is no update to purchase, marketplace evidence, or receipt records.

Statuses are `eligible`, `not_needed`, `running`, `succeeded`, `failed`, and
`uncertain`. A running reservation older than two minutes is uncertain; it never
becomes eligible automatically. A provider failure, interrupted worker, or failed
database write cannot release the reserved attempt. Recovery reads status without
starting another model request. Changing `REPORT_COMPOSER_VERSION` deliberately
permits another attempt and requires an operator decision about provider cost.

The retry fails closed without durable database storage. Rollout needs the
existing database role to permit creation of this additive table. No existing
schema or receipt migration is needed. Removing the feature does not alter the
original paid result; keep the revision table if the feature may be reenabled,
so its request allowance remains durable.

## Presentation and verification

The derived brief is read separately from the original purchase. Successful
composition updates the displayed brief and **Download report**. **Receipt JSON**
and sharing continue to use the original saved purchase. Sources and payment
proofs stay fixed. Reload reads the derived brief again without model work.
Unreadable references, an unavailable report for the signed-in wallet, and temporary
service errors have distinct status text. Only an explicitly uncertain stored
attempt uses the unconfirmed-outcome state. POST service errors remain visible
when a follow-up GET finds no reserved attempt; refreshes never submit another POST.
Running status reads keep the focusable control mounted without a checking-state
flash. A cancelled or incomplete wallet sign-in is followed only by a status read.

Backend tests use an actual temporary PostgreSQL-compatible database and prohibit
network requests and transaction broadcasts. They cover ownership, origin,
evidence identity, concurrency, immutable receipt records, and terminal retry
states. Controller tests cover status-first reads, duplicate clicks, interrupted
responses, reconnect cancellation, and focus intent. Run `npm run gatecheck:t3`
for the repository checks.

For a synthetic visual review, run
`node --import tsx tests/fixtures/render-report-retry.tsx /tmp/reapp-report-retry-fixture`
from the repository and serve that directory locally. These static pages render
the actual report and retry views with shipped CSS, invented source text, and
dummy receipt labels. They make no API calls and do not verify interactive wallet
behavior. There is no production fixture route.

Structured-output contract references:
[OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
and [Vercel AI Gateway structured outputs](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions/structured-outputs).

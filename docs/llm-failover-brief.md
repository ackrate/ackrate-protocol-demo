# Model providers and recovery

`lib/llm-policy.ts` selects enabled providers. Keys alone do not enable failover.
The source default is `LLM_PROVIDER_MODE=openai-only`.

| Mode | Chat and research provider order | Report formatting |
| --- | --- | --- |
| `openai-only` | OpenAI | OpenAI |
| `failover` | OpenAI, then the alternate provider; `LLM_PRIMARY=anthropic` reverses the order | OpenAI |
| `openai-gemini-failover` | OpenAI-compatible endpoint, then direct Gemini | OpenAI-compatible endpoint, then direct Gemini |

Chat/research includes only configured keys. Outside Gateway/Gemini mode, reports
require `OPENAI_API_KEY`; without it, the saved source result remains available
without a model summary. With `openai-only`, the alternate provider
keys are ignored. `OPENAI_BASE_URL` can select Vercel AI Gateway for the
OpenAI-compatible endpoint. See [deployment configuration](vercel-native.md#production-runtime)
for the deployed settings; source defaults are not a record of live configuration.

## Models and credentials

- `OPENAI_API_KEY`: server-only OpenAI or Gateway credential.
- `OPENAI_BASE_URL`: optional OpenAI-compatible endpoint.
- `OPENAI_MODEL` and `OPENAI_MODEL_SUB`: chat/research and source-formatting models.
- `OPENAI_REPORT_MODEL`: report-formatting model, separate from chat/tool routing.
- `GEMINI_API_KEY` and `GEMINI_MODEL`: direct Gemini fallback.
- `GEMINI_REPORT_MODEL`: optional report override, otherwise `GEMINI_MODEL`.
- `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, and `ANTHROPIC_MODEL_SUB`: optional
  alternate provider settings used only in `failover` mode.

Keep credentials in the deployment's secret storage or a gitignored `.env.local`.
Use model identifiers supported by the selected endpoint. API access, quotas and
billing are separate from Stellar balances and wallet authorization.

## Failure behavior

The research completion wrapper in `lib/llm.ts` can advance to the next enabled
provider for quota, authentication, rate-limit, network or transient failures.
Billing/quota errors can fail over regardless of status. Other bad-request errors
such as HTTP 400, 404 and 422 stop that completion. Each
completion selects its own provider; main and sub calls need not use the same one.
The legacy research demonstration uses generated source findings and can return a
labelled degraded report when model access fails. It is separate from the wallet's
marketplace results.

Wallet chat uses `lib/wallet/chat-model.ts`. It can switch on HTTP 401, 403, 429 or 5xx only before
the response stream starts. A failure after streaming or a paid tool execution
must preserve the existing operation and receipts rather than start another purchase.

Marketplace report formatting uses `buildReportLlm()` and saved source data.
In Gateway/Gemini mode, Gemini can retry formatting without another payment.
A failed summary retains the source result and settlement evidence; report recovery
must never buy the service again. See [report recovery](report-recovery.md).

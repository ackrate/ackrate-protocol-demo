# Vercel deployment

Project: `reapp` in `agentools-projects`, connected to [ackrate/ackrate-protocol-demo](https://github.com/ackrate/ackrate-protocol-demo). The production origin is [https://reapp.ackrate.com](https://reapp.ackrate.com). Production tracks `prod`. Other branches and pull requests build as Preview deployments in this project. GitHub Actions validates source; it does not deploy. Existing older staging projects are retained unchanged and are no longer the deployment destination for this workflow.

Production and Preview variables are configured separately in Vercel. Never copy production data or signing credentials into Preview. The production custom domain stays on Production. A successful push to prod automatically assigns production domains; other branches remain Preview deployments.

Build settings and security headers remain in vercel.json. Existing branches carrying older deployment workflows must receive this migration before using them for new work.

## Production runtime

The owner explicitly approved reusing the staging Neon database and Stellar agent signer for `reapp.ackrate.com`. Production uses fresh session and challenge secrets and its exact origin; Preview does not receive these credentials. The existing Reown project allows the production domain.

For Gateway with native Gemini fallback, set `LLM_PROVIDER_MODE=openai-gemini-failover`, `OPENAI_BASE_URL=https://ai-gateway.vercel.sh/v1`, and a server-only Gateway key in `OPENAI_API_KEY`. Set the Gateway model IDs in `OPENAI_MODEL`, `OPENAI_MODEL_SUB`, and `OPENAI_REPORT_MODEL`; configure the direct fallback with `GEMINI_API_KEY` and `GEMINI_MODEL`. These are configuration instructions, not a snapshot of deployed values. See [model routing and recovery](llm-failover-brief.md) for each supported mode.

The October 4, 2026 production Testnet research run reported an authentication error from the Gateway provider on every turn and switched to direct `Gemini · gemini-3.8-flash`. The fallback delivered three purchased demo sources, rejected a fourth, and completed its generated summary. Gateway authentication needs investigation. This verifies that run's active engine; it does not establish the private Gateway configuration or the consumer wallet's report model.

Native Gemini streaming avoids compatibility differences in tool-call chunks. Consumer wallet chat can switch providers only before the stream starts, never after a paid tool runs. Reports can retry formatting through Gemini without purchasing another source.

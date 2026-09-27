# Vercel deployment

Project: `reapp` in `agentools-projects`. Production tracks `prod`. Other branches and pull requests build as Preview deployments in this project. GitHub Actions validates source; it does not deploy. Existing older staging projects are retained unchanged and are no longer the deployment destination for this workflow.

Production and Preview variables are configured separately in Vercel. Never copy production data or signing credentials into Preview. The production custom domain stays on Production. A successful push to prod automatically assigns production domains; other branches remain Preview deployments.

Build settings and security headers remain in vercel.json. Existing branches carrying older deployment workflows must receive this migration before using them for new work.

## Production runtime

The owner explicitly approved reusing the staging Neon database and Stellar agent signer for `reapp.ackrate.com`. Production uses fresh session and challenge secrets and its exact origin; Preview does not receive these credentials. The existing Reown project allows the production domain.

Production selects `LLM_PROVIDER_MODE=openai-gemini-failover`. `OPENAI_BASE_URL=https://ai-gateway.vercel.sh/v1` and the server-only Gateway key in `OPENAI_API_KEY` route chat and reports to `openai/gpt-6-luna` (`OPENAI_MODEL`, `OPENAI_MODEL_SUB`, `OPENAI_REPORT_MODEL`). `GEMINI_API_KEY` and `GEMINI_MODEL=gemini-3.8-flash` supply the direct Google fallback. Native Gemini streaming avoids compatibility differences in tool-call chunks. Chat can switch providers only before the stream starts, never after a paid tool runs. Reports can retry formatting through Gemini without purchasing another source.

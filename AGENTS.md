# AGENTS.md

Project guidance for agents working in `ackrate-protocol-demo`.

## What this is

A Next.js 16 (App Router) demo of [`@ackrate/core`](https://www.npmjs.com/package/@ackrate/core).
An AI agent makes pay-per-use payments that are enforced on-chain by the ACKRATE
MandateRegistry Soroban contract. Public demos run on Stellar testnet; the
navigation-listed `/wallet` canary uses the manifest-pinned mainnet contract and
Circle USDC with Freighter authorization. The SDK runs server-side in
Next.js API routes — the contract enforces the budget on-chain, so the SDK can't exceed the mandate.

## Run

```
npm install
npm run dev        # http://localhost:3000
```

The public research, video, composite, and starter flows run on Stellar **testnet**
with ephemeral keys. The wallet canary runs on Stellar **mainnet** with
Circle USDC and the manifest-pinned registry. The research agent
additionally needs an LLM API key in `.env.local` (gitignored).
`LLM_PROVIDER_MODE=openai-only` is the default and ignores the alternate key.
Set `OPENAI_API_KEY` for chat and report formatting. Explicitly selecting
`LLM_PROVIDER_MODE=failover` permits both configured provider keys;
`LLM_PRIMARY` (default `openai`) picks their order.
`OPENAI_MODEL` / `OPENAI_MODEL_SUB` set the model ids. See
`.env.example`. The failover layer lives in `lib/llm.ts`. Without any key the
video demo still works and the research page shows a notice.
Marketplace report composition uses its own OpenAI-only model setting,
`OPENAI_REPORT_MODEL` (default `gpt-6-astra`), without changing chat/tool routing.
New reports include a cited, three-paragraph plain-English closing summary.

## Routes

Deployment uses the GitHub Actions Vercel workflow; see `docs/deployment.md`
for branch routing, project ownership, secrets and the persistent CLI runner limit.

- `/` — REAPP landing page, focused on Stellar and linking the consumer app.
- `/docs` — SDK, CLI, and quick-starter guides under one Docs menu.
- `/consumer` — person-facing preview for giving an AI agent a task while retaining
  explicit control over its budget, approved services, deadline, and exceptions. Source:
  `app/consumer/page.tsx`.
- `/research` — research agent demo (LLM). Source: `app/research/page.tsx`.
- `/video` — video paywall demo. Source: `app/video/page.tsx`.
- `/docs/quickstarts` — choose one SDK starter and copy its setup command.
- `/docs/hosted` — optional persistent Testnet Express companion.
- `/solutions` — redirect to `/docs/quickstarts`.
- `/toolkit` — product-facing developer toolkit hub. Source:
  `app/toolkit/page.tsx`.
- `/toolkit/cli` — live **xterm.js terminal** that runs the real `ackrate` CLI on
  the server and streams its output. Source: `app/toolkit/cli/page.tsx`.
- `/composites` — composite mandates (clearing pools) demo: three buyer agents pool one
  group buy; the contract clears everyone at one uniform price in a single atomic
  transaction. Runs against the composite build of MandateRegistry (a separate
  testnet deployment; id pinned in `lib/composites-client.ts`). Source: `app/composites/page.tsx`.

Primary navigation is REAPP home, Consumer app, and Docs. The Docs dropdown
contains SDK, CLI, quick starters, Express, AP2, and Security. Legacy research,
video, consumer preview, toolkit, and composite routes remain direct-link references.
See `docs/presentation.md` for the current naming and visual conventions.

## Key files

- `lib/ackrate-server.ts` — wraps `@ackrate/core` (mandate / approve / pay / revoke).
- `app/api/ackrate/route.ts` — Node API handler for wallet / mandate / payment / revoke.
- `lib/research-agent.ts` — the LLM agentic loop; a `purchase_source` tool whose every call is a real on-chain `execute_payment`.
- `app/api/research/route.ts` — streams the research run as newline-delimited JSON.
- `vendor/ackrate-cli.mjs` — self-contained bundle of the ackrate CLI (fixed core inlined). See `vendor/README.md` to regenerate.
- `app/api/cli/route.ts` — spawns `vendor/ackrate-cli.mjs <args>` per session (cwd + ACKRATE_HOME) and streams raw stdout/stderr; allow-lists the CLI subcommands.
- `lib/composites-client.ts` — vendored typed client for the composite contract build (regenerate with `stellar contract bindings typescript` in ackrate-protocol).
- `lib/composites-server.ts` — the group-buy generator: pool, three buyers, deadline auction, atomic capture; streamed by `app/api/composites/route.ts`.

## Conventions

- **No "Claude"/Anthropic branding in user-facing surfaces.** UI copy, README prose,
  comments, and log/banner strings refer to the model generically — *agent*, *AI*, or
  *LLM*. The only allowed references are functional and required to run: the
  `@anthropic-ai/sdk` import, the `model:` strings passed to `client.messages.create(...)`
  in `lib/research-agent.ts`, and the `ANTHROPIC_API_KEY` env var name.
- **Terminology (hard rule):** public product surfaces, routes, copy,
  documentation, and commits use product and release language only. Do not
  expose program-funding language, delivery-phase labels, or internal review
  labels. Say "gate check" for verification work. Protocol authorization copy
  may still describe an allowance being given to the contract.
- **No marketing hype / AI-slop copy.** Avoid empty intensifiers ("NO MOCKS",
  "*-POWERED", "slick", "Premium", emphatic "Real …"). Keep concrete, accurate
  technical statements (the on-chain budget cap, contract-enforced limits, revocable mandate).
- Use relative paths in symlinks and imports — never absolute.

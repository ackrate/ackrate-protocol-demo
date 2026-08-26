# AGENTS.md

Project guidance for agents working in `reapp-protocol-live`.

## What this is

A Next.js 15 (App Router) demo of [`@reapp-sdk/core`](https://www.npmjs.com/package/@reapp-sdk/core).
An AI agent makes pay-per-use payments that are enforced on-chain by the REAPP
MandateRegistry Soroban contract. Public demos run on Stellar testnet; the
unlisted `/wallet` canary uses the manifest-pinned mainnet contract and Circle
USDC with Freighter authorization. The SDK runs server-side in
Next.js API routes — the contract enforces the budget on-chain, so the SDK can't exceed the mandate.

## Run

```
npm install
npm run dev        # http://localhost:3000
```

Everything runs on Stellar **testnet** with ephemeral keys. The research agent
additionally needs an LLM API key in `.env.local` (gitignored). It supports two
providers and fails over between them so a run never goes dark if one is out of
credit or rate-limited: set `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY` (either
alone works; both enable failover). `LLM_PRIMARY` (default `anthropic`) picks the
primary and `OPENAI_MODEL` / `OPENAI_MODEL_SUB` set the OpenAI model ids. See
`.env.example`. The failover layer lives in `lib/llm.ts`. Without any key the
video demo still works and the research page shows a notice.

## Routes

- `/` — **Docs** (landing page). Source: `app/page.tsx`.
- `/consumer` — person-facing preview for giving an AI agent a task while retaining
  explicit control over its budget, approved services, deadline, and exceptions. Source:
  `app/consumer/page.tsx`.
- `/research` — research agent demo (LLM). Source: `app/research/page.tsx`.
- `/video` — video paywall demo. Source: `app/video/page.tsx`.
- `/solutions` — beginner onboarding: scaffold a clean project, connect it to
  hosted Express fulfillment, and watch local `agent.fetch()` evidence arrive.
  Source: `app/solutions/page.tsx`.
- `/toolkit` — product-facing developer toolkit hub. Source:
  `app/toolkit/page.tsx`.
- `/toolkit/cli` — live **xterm.js terminal** that runs the real `reapp` CLI on
  the server and streams its output. Source: `app/toolkit/cli/page.tsx`.
- `/composites` — composite mandates (clearing pools) demo: three buyer agents pool one
  group buy; the contract clears everyone at one uniform price in a single atomic
  transaction. Runs against the composite build of MandateRegistry (a separate
  testnet deployment; id pinned in `lib/composites-client.ts`). Source: `app/composites/page.tsx`.

Nav order is defined in `components/Nav.tsx` (`links` array): Docs · CLI ·
Express · AP2 · Research · Solutions. The `/consumer` and `/video` routes remain
available by direct link. The toolkit and composite surfaces are UNLISTED (not
in the nav): `/toolkit` and `/composites` are reachable by direct link only;
the `/toolkit` hub links to `/composites`.

## Key files

- `lib/reapp-server.ts` — wraps `@reapp-sdk/core` (mandate / approve / pay / revoke).
- `app/api/reapp/route.ts` — Node API handler for wallet / mandate / payment / revoke.
- `lib/research-agent.ts` — the LLM agentic loop; a `purchase_source` tool whose every call is a real on-chain `execute_payment`.
- `app/api/research/route.ts` — streams the research run as newline-delimited JSON.
- `vendor/reapp-cli.mjs` — self-contained bundle of the reapp CLI (fixed core inlined). See `vendor/README.md` to regenerate.
- `app/api/cli/route.ts` — spawns `vendor/reapp-cli.mjs <args>` per session (cwd + REAPP_HOME) and streams raw stdout/stderr; allow-lists the CLI subcommands.
- `lib/composites-client.ts` — vendored typed client for the composite contract build (regenerate with `stellar contract bindings typescript` in reapp-protocol).
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

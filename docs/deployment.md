# Deployment

The application is a Next.js 16 project at the repository root, using npm and Node 22 in CI. The package engine pins Node 22. Vercel uses `npm ci`, `npm run build`, and the default Next.js output. Do not set an `out` directory: wallet APIs require server execution.

`.github/workflows/vercel.yml` deploys same-repository pull requests as previews and pushes to `main` or `prod` as production. Both branches target the project in `VERCEL_PROJECT_ID`. Fork and Dependabot PRs cannot use deployment secrets. Missing credentials skip previews and fail production. Concurrency cancels stale runs for the same repository/ref.

The workflow runs source/tests/dependency checks, then `vercel pull`, `vercel build` and `vercel deploy --prebuilt`, adding `--prod` for production. It pins the application source revision at runtime. Native Vercel Git deployments are disabled in `vercel.json` to avoid competing deployment paths. Follow [Vercel's GitHub Actions workflow](https://vercel.com/guides/how-can-i-use-github-actions-with-vercel).

## Target ownership — unresolved on September 24, 2026

| Observed project | State |
|---|---|
| `agentools-projects/ackrate--ackrate-protocol-demo--a7c4d19` (`prj_zhtCCH4OhG0764NYkxsJE46DfYO4`) | Existing accessible project with no native Git link or environment variables. Its domains include `staging.ackrate.com` and `ackrate-ackrate-protocol-demo-a7c4d19.vercel.app`; its latest deployment is landing-page source. Do not deploy the demo here until the staging routing is resolved. |
| `ais-projects-dc9b3903/ackrate-protocol-demo` | Produces current PR previews through native integration. The CLI account lacks access, so environment, production domains and project ID remain unverified. |

The repository already has `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` secret names. Their existence does not verify their target or validity. Select the intended existing project, update these secrets through GitHub CLI without printing values, and verify its randomized stable domain is a project domain. Preserve intentional custom domains. Do not create a duplicate project or repoint the landing domain as a shortcut.

## Runtime configuration

Configure server variables from `.env.example` in Vercel's appropriate environment. Preview must use isolated credentials and storage; do not copy Mainnet signing or burner secrets into preview. Production needs the exact HTTPS `ACKRATE_APP_ORIGIN`, persistent database, matching agent identity, session/challenge secrets and working model provider. Never use `NEXT_PUBLIC_` for secrets. The Mainnet activation phrase alone is insufficient: `/api/wallet/health` must report the deployed commit and all readiness checks.

The funded interactive CLI test currently starts a child process after returning its response and allows up to ten minutes of work. It requires a persistent runner. Vercel requests do not provide that lifecycle; the route therefore requires the persistent-server startup opt-in (`ACKRATE_CLI_RUNTIME_START=1`) and rejects Vercel explicitly. The workflow pins that flag to `0` at deployment; absence of Vercel system variables cannot enable funding. The read-only CLI inspector and previous recorded evidence are separate. Do not enable `ACKRATE_CLI_RUNTIME_START` or configure a burner mnemonic there. Restoring the funded browser path requires a durable worker integration and fresh acceptance; a higher function timeout alone is insufficient. See [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration).

The optional hosted Express API (`/docs/hosted`) allows only `reapp.live`, Railway subdomains and localhost. Arbitrary Vercel preview aliases cannot create those sessions; the API returns 400. Static starter downloads and local starter execution are separate. Validate canonical-host routing and the plan's function-duration limit before claiming hosted fulfillment works.

## Acceptance

Before production promotion, resolve the target above and verify a preview from the exact commit. Check `/api/cli/test` on the preview: it must return 503 with `ready: false` before any funding is attempted. After production deployment, verify the stable alias and every intentional custom domain, check `/api/wallet/health` revision/configuration and test browser sign-in. Full payment acceptance also requires an explicitly authorized wallet run, both settlement receipts, delivery, cancellation and recovery. Existing Railway `reapp.live` and retained CLI recovery findings remain historical/current observations until their routing and state are rechecked; they are not resolved by adding this workflow.

## Starter publication

The setup commands and installer payloads use `https://reapp.live`. Publish the generated archives, installers, manifest, and quick-starter page together on that canonical host. A local or Vercel preview can download its own ZIP, but its copied setup command still targets the currently deployed canonical release. Do not claim the new starter logger is public until canonical deployment is verified.

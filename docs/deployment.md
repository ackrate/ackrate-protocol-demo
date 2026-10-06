# Deployment and public URLs

The repository is [ackrate/ackrate-protocol-demo](https://github.com/ackrate/ackrate-protocol-demo). Vercel project `reapp` in `agentools-projects` builds its connected Git repository.

| Purpose | URL or branch |
| --- | --- |
| Production application | [reapp.ackrate.com](https://reapp.ackrate.com) |
| Wallet | [reapp.ackrate.com/wallet](https://reapp.ackrate.com/wallet) |
| Developer documentation | [reapp.ackrate.com/docs](https://reapp.ackrate.com/docs) |
| Integration branch | `main`; native Vercel Preview builds |
| Production branch | `prod`; successful builds automatically receive production domains |

Use this production origin in current documentation, tester instructions and shared app links. Historical deployment URLs in dated evidence retain their original meaning.

GitHub Actions validates source; it does not deploy. Production and Preview variables are configured separately. See [native Vercel configuration](vercel-native.md) for runtime requirements and the approved production configuration. Preview environments do not receive production signing or data credentials.

## Reconcile and release

1. Start new work from current `main`. Use a pull request with required CI and independent review.
2. If an urgent change has landed directly on `prod`, merge that history back into `main` through a reviewed pull request using a merge commit (not squash or rebase) before building on it. Verify the production tip is an ancestor of the resulting `main`. Do not overwrite either branch or reintroduce old deployment workflows.
3. Promote reviewed `main` changes to `prod` explicitly. A merge into `main` produces a Preview; it does not publish production.
4. Check the native Vercel build, served revision, configuration readiness and relevant application behavior. A successful build or homepage response alone does not establish wallet/payment acceptance.

Older staging projects are retained for historical acceptance and are not the destination of the current native Git workflow. Legacy branch decisions are recorded in [branch reconciliation](https://github.com/ackrate/ackrate-project/blob/main/instance/artifacts/108-other-repository-artifacts/ackrate-protocol-demo/docs/branch-reconciliation.md).

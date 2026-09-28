# Branch reconciliation

Reviewed September 28, 2026. `main` is the integration branch; `prod` is the native Vercel production branch for [reapp.ackrate.com](https://reapp.ackrate.com). Historical branch names are not deployment instructions.

## Production changes returned to main

At review, `main` was `6b3f79acd5e8505fce9794ea9bb4bc608b2b2239` and was an ancestor of `prod` at `40431e4b15a9acceedc29c30ed21302dbc9f74a2`. Production was nine commits ahead with changes in five files: product/footer naming, removal of legacy demo navigation, and their guidance/test updates. This reconciliation retains the full production ancestry and adds current-host documentation. Use a merge commit for this reconciliation, never squash or rebase: only a merge commit retains the production ancestry. After merging, verify `git merge-base --is-ancestor 40431e4b15a9acceedc29c30ed21302dbc9f74a2 origin/main` before retiring any branch. It does not cherry-pick or reset either release history.

Keep both branches. New changes go through reviewed pull requests into `main`; production promotion is explicit. See [deployment](deployment.md).

## Completed feature branches

These branches are already contained in the production history included by this reconciliation and are safe to retire after it merges, provided their refs have not changed and no open pull request uses them:

| Branch | Reviewed tip |
| --- | --- |
| `fix/footer-ackrate` | `54d63319b8403b7f54788be7f40718ae5c56d505` |
| `fix/hide-demo-nav` | `23e82b7e488994b5af9b9b098ba83af6fbf1658e` |
| `fix/integrations-wallet-nav` | `89e5e661dcca2ba1ab0adfcbf195db3b56d3bbf7` |
| `fix/protocol-name` | `2645b15803813420c320dab42084662fd1e84288` |
| `ops/vercel-native-git` | `0835abde2b7da66045a3f19df5fbd4813b8ccafc` |

Other branches require separate treatment: squash-equivalent work may be integrated even without ancestry, while historical branches may retain unique code or deployment dependencies. Do not bulk-merge them or infer redundancy from age. Preserve original refs until their comparison and disposition are recorded.

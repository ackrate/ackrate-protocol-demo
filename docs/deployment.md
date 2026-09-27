# Vercel deployment

Project: `reapp` in `agentools-projects`. Production tracks `prod`. Other branches and pull requests build as Preview deployments in this project. GitHub Actions validates source; it does not deploy. Existing older staging projects are retained unchanged and are no longer the deployment destination for this workflow.

Production and Preview variables are configured separately in Vercel. Never copy production data or signing credentials into Preview. The production custom domain stays on Production. A successful push to prod automatically assigns production domains; other branches remain Preview deployments.

Build settings and security headers remain in vercel.json. Existing branches carrying older deployment workflows must receive this migration before using them for new work.

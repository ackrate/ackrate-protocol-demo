# Presentation conventions

REAPP is the consumer demonstration, powered by ACKRATE SDK. The SDK and CLI were renamed from REAPP to ACKRATE and use the `@ackrate` package scope. Keep ACKRATE CLI and MandateRegistry identifiers unchanged. Do not introduce another product name in this release.

Use white or black backgrounds, a neutral gray scale, and restrained red accents for focus, primary interaction, or errors. No decorative glow, gradients, animated emblems, or multicolor category badges. Preserve explicit status labels and explorer links; color alone must not communicate transaction state.

The homepage explains the Stellar consumer path and links to `/wallet` and `/docs`. Developer pages belong under the Docs dropdown. Distinguish Mainnet USDC from Testnet XLM and recorded evidence from a fresh run. The `/consumer` route is an unlisted preview, not the delivered wallet.

Each sentence or control should help a user authorize, execute, verify, recover, or integrate. Keep required consent, diagnostics, and recovery controls. Put advanced details in the relevant guide instead of repeating them on the homepage. Quick starters call the SDK and log one-line results; they do not provide a second narrated CLI.

Canonical presentation sources are `app/globals.css`, `components/Nav.tsx`, `app/docs/`, and the wallet styles. Older landing-branch green/lime brandbooks are superseded for this REAPP surface; they are not evidence of a deployed update.

The theme switch follows the system preference until a user chooses light or dark, then remembers that choice locally. Shared tokens apply to navigation, docs, demos, and the wallet. Red marks primary actions and a few section accents. Express and AP2 are labeled demos. Security evidence belongs in GitHub reports, with a short testing statement on the homepage.

The AP2 live console runs the valid path and five rejection cases; its static 59-case catalog is kept in `docs/ap2-test-reference.md`. Demo captions use readable neutral text, and transaction controls have 40px targets.

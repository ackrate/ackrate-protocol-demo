# Presentation conventions

REAPP is the consumer demonstration, powered by ACKRATE SDK. The SDK and CLI were renamed from REAPP to ACKRATE and use the `@ackrate` package scope. Keep ACKRATE CLI and MandateRegistry identifiers unchanged. Do not introduce another product name in this release.

Use white or black backgrounds and neutral gray surfaces. Follow the functional brand palette: Ackrate green identifies infrastructure, enforcement and evidence; Allow It vermilion identifies consumer choices and intervention. No decorative glow, gradients, animated emblems, or multicolor category badges. Preserve explicit status labels and explorer links; color alone must not communicate transaction state.

The homepage explains the Stellar consumer path and links to `/wallet` and `/docs`. Developer pages belong under the Docs dropdown. Distinguish Mainnet USDC from Testnet XLM and recorded evidence from a fresh run. The `/consumer` route is an unlisted preview, not the delivered wallet.

Each sentence or control should help a user authorize, execute, verify, recover, or integrate. Keep required consent, diagnostics, and recovery controls. Put advanced details in the relevant guide instead of repeating them on the homepage. Quick starters call the SDK and log one-line results; they do not provide a second narrated CLI.

Canonical presentation sources are `app/globals.css`, `components/Nav.tsx`, `app/docs/`, and the wallet styles. The September 25 owner direction restores exact green/lime brand-book tokens for the foundation layer alongside Allow It bright/text red; this supersedes the earlier monochrome/red-only treatment. Branch source is not evidence of a deployed update.

The theme switch follows the system preference until a user chooses light or dark, then remembers that choice locally. Shared tokens apply to navigation, docs, demos, and the wallet. Bright red with ink labels marks consumer actions; readable text red marks smaller labels. Green marks developer navigation and enforcement/evidence. Express and AP2 are labeled demos. Security evidence belongs in GitHub reports, with a short testing statement on the homepage.

The AP2 live console runs the valid path and five rejection cases; its static 59-case catalog is kept in `docs/ap2-test-reference.md`. Demo captions use readable neutral text, and transaction controls have 40px targets.

The static arch replaces the animated solar mark. Its geometry is reused unchanged from `src/benchmark/Icons.tsx` in [mks044/ackrate-web at a4cd52e](https://github.com/mks044/ackrate-web/blob/a4cd52e975709cb8a2dd0522d4c5c675ba7617fa/src/benchmark/Icons.tsx). `components/AckrateArchMark.tsx` is the theme-aware site rendering; `public/ackrate-arch.svg` is the standalone vector. This is a requested site treatment, not approval of new official brand guidelines. The September 25 owner request authorizes the two-function color system; it does not change this mark's geometry or rename REAPP.

## Functional palette

See [brand-colors.md](brand-colors.md) and `app/brand-colors.css`. Keep consumer action fills at #F34632 with #111110 labels, readable red text at #BA2D22 on light surfaces, and Ackrate green roles at #157A4B / #123D2C with #B9F36A used only on sufficiently dark surfaces or with a dark foreground. Completed state labels retain checkmarks; unknown network/readiness states remain neutral.

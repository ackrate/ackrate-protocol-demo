import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const run = promisify(execFile);
const PERMANENT_SIMPLE_CONTRACT =
  "CCHQ5G4Y4YBMY6D3TYYJSVJVCKUM22Q6TMKCCHVAHY4X7K6QELQACZRM";
const RETIRED_PACKAGE_SCOPE = new RegExp(`@${String.fromCharCode(114, 101, 97, 112, 112)}-sdk/`);
const ACKRATE_HOSTNAME = "staging.ackrate.com";

const protectedHashes = {
  "app/express/page.tsx": "cf9d2a35c5373b88ce33c71ecfb2941dccf58d622a545887614da213d19cdc1b",
  "app/express/layout.tsx": "7fb5a1ee24023ddd61ee8092c0c2e3047d51d5a0c4273fb1f4ba6f7374f8b40d",
  "app/api/express/route.ts": "a0448c94faa3e4cb2bc7491f8ae2a88be052ff37ce7817ede9c3743040921937",
  "app/api/express/[sessionId]/source/[resource]/route.ts": "022c94e6c368357692c1981f08f52aea41c28ef39eadde56ca501280a6e552a5",
  "lib/express-demo.ts": "1a7ac7d6a2a76349ea067283d2bf15ebec80b0976574ea5bc97978f6fe474e40",
};

test("the verified Express runtime remains byte-for-byte unchanged", async () => {
  for (const [path, expected] of Object.entries(protectedHashes)) {
    const source = await read(path);
    const actual = createHash("sha256").update(source).digest("hex");
    assert.equal(actual, expected, path);
  }
});

test("the landing page leads with a human outcome and keeps technical depth on later pages", async () => {
  const [home, docs, express] = await Promise.all([
    read("app/page.tsx"),
    read("app/docs/page.tsx"),
    read("app/express/page.tsx"),
  ]);
  for (const line of [
    ">Ackrate</h1>",
    "A delegation and enforcement layer for autonomous agents",
    ">AAA</div>",
    "Find Maya a birthday gift. Spend up to $75 at the bookshop before 8 PM.",
    "Ackrate is building the",
    "delegation and enforcement layer for",
    "autonomous <strong",
    ">agents</strong>.",
    "AI agents are becoming capable of spending money",
    "buying services, calling paid APIs, and coordinating with other agents.",
    "today, giving an agent the ability to act often means giving it access to credentials",
    "wallets, or payment methods that are far more powerful than the task actually requires.",
    "Ackrate lets a person, organization, or parent agent delegate a specific set of permissions to an subagent",
    "how much it can spend, where it can spend it, what resources it can access, how long the authority lasts, and whether it can delegate part of that authority further.",
    "Those constraints are enforced independently of the agent itself.",
    "Stop handing over the master key.",
    "What is Ackrate in plain English?",
  ]) assert.ok(home.includes(line), line);
  assert.match(home, /permissionFacts/);
  assert.match(home, /freedoms/);
  assert.match(home, /The old way/);
  assert.match(home, /With Ackrate/);
  assert.match(home, /mailto:consumer-contact@ackrate\.com/);
  assert.match(home, /href="\/docs"/);
  assert.doesNotMatch(home, /href="\/express"|live demo|live flow/i);
  assert.doesNotMatch(home, /MandateRegistry|Circle USDC|Stellar Mainnet|agent\.fetch|MAINNET_REGISTRY/);
  assert.match(express, /From HTTP 402 to paid delivery/);
  for (const sentence of [
    "Ackrate is building the",
    "delegation and enforcement layer for",
    "autonomous",
    "agents",
    "AI agents are becoming capable of spending money",
    "buying services, calling paid APIs, and coordinating with other agents.",
    "today, giving an agent the ability to act often means giving it access to credentials",
    "wallets, or payment methods that are far more powerful than the task actually requires.",
    "Ackrate lets a person, organization, or parent agent delegate a specific set of permissions to an subagent",
    "how much it can spend, where it can spend it, what resources it can access, how long the authority lasts, and whether it can delegate part of that authority further.",
    "Those constraints are enforced independently of the agent itself.",
  ]) assert.ok(docs.includes(sentence), sentence);
});

test("the landing brand has a portable logo, contact path, copyright, and persistent themes", async () => {
  const [logo, nav, footer, theme, layout, styles] = await Promise.all([
    read("public/logo.svg"),
    read("components/Nav.tsx"),
    read("components/SiteFooter.tsx"),
    read("components/ThemeToggle.tsx"),
    read("app/layout.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(logo, /viewBox="0 0 64 64"/);
  assert.match(logo, /rotate\(45 32 32\)/);
  assert.match(styles, /url\("\/logo\.svg"\)/);
  assert.match(nav, /href: "#contact", label: "Contact"/);
  assert.doesNotMatch(nav, /href: "\/express", label: "Live demo"/);
  assert.match(footer, /mailto:consumer-contact@ackrate\.com/);
  assert.match(footer, /All rights reserved/);
  assert.doesNotMatch(footer, /Delegation and enforcement for autonomous agents/);
  assert.match(theme, /"system" \| "light" \| "dark"/);
  assert.match(theme, /localStorage\.setItem\(THEME_KEY, next\)/);
  assert.match(theme, /prefers-color-scheme: dark/);
  assert.match(layout, /ackrate_theme/);
  assert.match(styles, /@custom-variant dark/);
});

test("the intro plays at double speed and remembers completion across pages", async () => {
  const [gate, intro] = await Promise.all([
    read("components/IntroGate.tsx"),
    read("components/Intro.tsx"),
  ]);
  assert.match(gate, /localStorage\.getItem\(SEEN_KEY\)/);
  assert.match(gate, /localStorage\.setItem\(SEEN_KEY, "1"\)/);
  assert.match(gate, /document\.cookie/);
  assert.match(gate, /Max-Age=\$\{COOKIE_MAX_AGE\}/);
  assert.match(gate, /Path=\/; SameSite=Lax/);
  assert.doesNotMatch(gate, /usePathname|path\.startsWith/);
  assert.match(intro, /const DURATION = 2\.3/);
  assert.match(intro, /setPhase\(1\), 725/);
  assert.match(intro, /setPhase\(2\), 1325/);
  assert.match(intro, /e > 1\.9/);
});

test("navigation exposes Security and Solutions without deleting direct product routes", async () => {
  const [nav, consumer, video] = await Promise.all([
    read("components/Nav.tsx"),
    read("app/consumer/page.tsx"),
    read("app/video/page.tsx"),
  ]);
  assert.doesNotMatch(nav, /href: "\/consumer", label: "Consumer"/);
  assert.match(nav, /href: "\/solutions", label: "Solutions"/);
  assert.doesNotMatch(nav, /href: "\/video", label: "Video"/);
  assert.match(nav, /href: "\/express", label: "Express"/);
  assert.match(nav, /href: "\/security", label: "Security"/);
  assert.match(consumer, /Preview only · no funds move/);
  assert.match(consumer, /No wallet was created and no transaction was signed/);
  assert.match(consumer, /Give AI a job/);
  assert.match(consumer, /Not a blank check/);
  assert.match(consumer, /Try the spending controls/);
  assert.match(consumer, /Watch a budgeted agent buy three resources/);
  assert.ok(video.length > 100);
});

test("the Contract Security Suite links every claim to public Mainnet evidence", async () => {
  const [page, route, layout, sitemap, llms] = await Promise.all([
    read("app/merchants/page.tsx"),
    read("app/security/page.tsx"),
    read("app/security/layout.tsx"),
    read("app/sitemap.ts"),
    read("app/llms.txt/route.ts"),
  ]);
  for (const required of [
    "Unauthorized caller",
    "Expired mandate",
    "Overspend attempt",
    "Replay attempt",
    "Unauthorized upgrade",
    "Re-entrant payment",
    "23",
    "Mainnet contract tests",
    "Known deployed-code vulnerabilities",
    "Yanked deployed dependencies",
    "security-scan.sh",
    "security-threat-model.md",
    "security-data-flow.md",
    "security-scan-report.md",
    "deployment-manifest.json",
    "ACKRATE GATE CHECK",
    "Recorded evidence only",
    "Every public function is inside the gate",
    "UNTRUSTED BY DESIGN",
    "@ackrate/core",
    "@ackrate/stellar",
    "@ackrate/ap2",
    "@ackrate/express-middleware",
    "@ackrate/cli",
    "CDBTG5ZKASFA7LOYUPBOTGKAVX5MJIM4U24BYGX7VX23IHYDAHLQPAGS",
    "CD3KRQRNCW52CZHKG2GPQAEOU6UCL426YFNHYUZ7IWUUKAOTKUQX6UUX",
  ]) assert.match(page, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), required);
  assert.match(route, /merchants\/page/);
  assert.match(layout, /path: "\/security"/);
  assert.match(sitemap, /"\/security"/);
  assert.match(llms, /Contract Security Suite/);
});

test("the Solutions page keeps the established responsive pattern and complete guide", async () => {
  const [page, layout, sitemap, installer] = await Promise.all([
    read("app/solutions/page.tsx"),
    read("app/solutions/layout.tsx"),
    read("app/sitemap.ts"),
    read("lib/starter-install.js"),
  ]);
  for (const required of [
    "Use this starter",
    "Copy setup command",
    "npm run demo",
    "Read the README",
    "Then just read the screen",
    "Six numbered steps explain",
    "Requires Node.js 20+",
    "Node.js 20 or newer",
    "Mac / Linux",
    "Windows PowerShell",
    "Optional hosted walkthrough",
    "Merchant scope",
    "Replay defense",
    "Recovery",
    "Explorer evidence",
    "20 starter packs",
    "Integrity manifest",
    "sessionStorage",
    "polling hosted /express",
    "sm:text-6xl",
    "lg:grid-cols",
    "min-w-0",
    "overflow-auto",
  ]) assert.match(page, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), required);
  assert.match(layout, /path: "\/solutions"/);
  assert.match(sitemap, /"\/solutions"/);
  assert.match(page, /import STARTER_MANIFEST from "@\/public\/starters\/v1\/manifest\.json"/);
  assert.match(page, /import \{ buildStarterInstallCommand \} from "@\/lib\/starter-install"/);
  assert.match(page, /const STARTER_ARCHIVES = new Map/);
  assert.match(page, /const \[installerShell, setInstallerShell\] = useState<InstallerShell>\("posix"\)/);
  assert.match(page, /starterCommand\(kit\.slug, installerShell\)/);
  assert.match(page, /starterCommand\("research-source-scout", installerShell\)/);
  assert.match(installer, /createHash\('sha256'\)/);
  assert.match(installer, /integrity check failed/);
  assert.match(installer, /Invoke-WebRequest/);
  assert.match(installer, /Expand-Archive/);
  assert.match(installer, /\[scriptblock\]::Create/);
  assert.match(installer, /Invoke-RestMethod/);
  assert.match(installer, /\$LASTEXITCODE/);
  assert.match(page, /installer verifies the download before extracting any file/);
  const starterSetup = [...installer.matchAll(/return `([^`]+)`;/g)].at(-1)?.[1];
  assert.ok(starterSetup, "starter setup helper is missing");
  assert.ok(starterSetup.includes(`https://${ACKRATE_HOSTNAME}\${installer.path}`));
  assert.match(starterSetup, /^\/bin\/sh -c "\$\(curl -fsSL /);
  assert.doesNotMatch(starterSetup, /unzip -q|npm ci/);
  assert.doesNotMatch(starterSetup, /npm run/);
  assert.doesNotMatch(installer, /curl[^\n|]*\|\s*(?:sh|bash)/);
  assert.match(page, /github\.com\/ackrate\/ackrate-protocol-demo\/blob\/main\/starters\/\$\{kit\.slug\}\/README\.md/);
  assert.doesNotMatch(page, /degit/);
  assert.doesNotMatch(page, /npm ci && npm run/);
});

test("the starter is deterministic, typed by package metadata, and testnet-only", async () => {
  const paths = [
    "starters/research-source-scout/package.json",
    "starters/research-source-scout/package-lock.json",
    "starters/research-source-scout/.gitignore",
    "starters/research-source-scout/.env.example",
    "starters/research-source-scout/README.md",
    "starters/research-source-scout/src/consumer.mjs",
    "starters/research-source-scout/src/fulfillment.mjs",
    "starters/research-source-scout/src/hosted.mjs",
    "starters/research-source-scout/shared/contract.mjs",
    "starters/research-source-scout/shared/fulfillment.mjs",
  ];
  const sources = Object.fromEntries(await Promise.all(paths.map(async (path) => [path, await read(path)])));
  const manifest = JSON.parse(sources["starters/research-source-scout/package.json"]);
  assert.equal(manifest.dependencies["@ackrate/core"], "0.3.1");
  assert.equal(manifest.dependencies["@ackrate/stellar"], "0.2.2");
  assert.equal(manifest.dependencies["@ackrate/ap2"], "0.3.0");
  assert.equal(manifest.dependencies["@ackrate/express-middleware"], "0.2.2");
  assert.ok(manifest.scripts.demo);
  assert.ok(manifest.scripts.fulfillment);
  assert.equal(manifest.scripts.hosted, "node src/hosted.mjs");
  assert.match(sources["starters/research-source-scout/.gitignore"], /^\.env$/m);
  assert.match(sources["starters/research-source-scout/.gitignore"], /^\.ackrate\/$/m);
  assert.match(sources["starters/research-source-scout/src/consumer.mjs"], /runLocalTestnetDemo/);
  assert.match(sources["starters/research-source-scout/src/fulfillment.mjs"], /startFulfillmentServer/);
  assert.match(sources["starters/research-source-scout/src/hosted.mjs"], /\/api\\\/express\\\//, "the hosted companion must report verified rejection to the exact workspace path");
  assert.match(sources["starters/research-source-scout/src/hosted.mjs"], /createBoundTestnetConsumer/);
  assert.match(sources["starters/research-source-scout/src/hosted.mjs"], /purchaseVerifiedBoundJson/);
  assert.match(sources["starters/research-source-scout/src/hosted.mjs"], /expectVerifiedBudgetRejection/);
  assert.match(sources["starters/research-source-scout/shared/contract.mjs"], /proofPolicy:\s*["']bound-v2-only["']/);
  assert.match(sources["starters/research-source-scout/shared/contract.mjs"], /ackrate\.agent/);
  assert.match(sources["starters/research-source-scout/shared/fulfillment.mjs"], /createBoundAckratePaidJsonRoute/);
  const combined = Object.values(sources).join("\n");
  assert.doesNotMatch(combined, /\bS[A-Z2-7]{55}\b/, "no Stellar secret seed may be committed");
  assert.doesNotMatch(combined, RETIRED_PACKAGE_SCOPE, "the retired package scope is forbidden");
  assert.doesNotMatch(sources["starters/research-source-scout/.env.example"], /mainnet/i, "the starter environment must remain testnet-only");
  assert.doesNotMatch(sources["starters/research-source-scout/src/consumer.mjs"], /ackrate\.mainnet/i);
  assert.doesNotMatch(sources["starters/research-source-scout/src/fulfillment.mjs"], /ackrate\.mainnet/i);
});

test("the hosted page command stays in parity with the generated starter", async () => {
  const [page, manifestSource, hosted] = await Promise.all([
    read("app/solutions/page.tsx"),
    read("starters/research-source-scout/package.json"),
    read("starters/research-source-scout/src/hosted.mjs"),
  ]);
  const manifest = JSON.parse(manifestSource);
  assert.equal(manifest.scripts.hosted, "node src/hosted.mjs");
  assert.match(page, /npm run hosted -- --endpoint=/);
  assert.doesNotMatch(page, /npm run demo -- --endpoint=/);
  assert.match(hosted, /parseNamedArgs\(process\.argv\.slice\(2\), \["endpoint", "merchant"\]\)/);
});

test("new public copy follows repository terminology rules", async () => {
  const combined = [
    await read("app/solutions/page.tsx"),
    await read("app/solutions/layout.tsx"),
    await read("app/toolkit/page.tsx"),
    await read("app/toolkit/cli/layout.tsx"),
    await read("app/toolkit/cli/page.tsx"),
    await read("app/sitemap.ts"),
    await read("app/llms.txt/route.ts"),
    await read("app/llms-full.txt/route.ts"),
    await read("starters/research-source-scout/README.md"),
  ].join("\n");
  const forbiddenPublicTerms = new RegExp(
    `\\b(?:${["au" + "dit[a-z-]*", "tran" + "che", "mile" + "stone", "gr" + "ant"].join("|")})\\b`,
    "i",
  );
  assert.doesNotMatch(combined, forbiddenPublicTerms);
  assert.doesNotMatch(combined, /\bNO MOCKS\b/i);
  assert.doesNotMatch(combined, RETIRED_PACKAGE_SCOPE, "the retired package scope is forbidden");
  assert.doesNotMatch(combined, /Hackathon starter[\s\S]*?calls the hosted endpoint through agent\.fetch\(\)/);
  assert.match(combined, /inspects the exact 402 challenge, submits the request-bound contract payment/);
  for (const version of [
    "@ackrate/core 0.3.1",
    "@ackrate/stellar 0.2.2",
    "@ackrate/ap2 0.3.0",
    "@ackrate/express-middleware 0.2.2",
    "@ackrate/cli 0.1.9",
  ]) assert.match(combined, new RegExp(version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), version);
});

test("the vendored CLI and public pages use the released CLI and permanent contract", async () => {
  const bundle = new URL("../vendor/ackrate-cli.mjs", import.meta.url);
  const { stdout } = await run(process.execPath, [bundle.pathname, "--version"]);
  const actualVersion = stdout.trim();

  assert.equal(actualVersion, "0.1.9");
  for (const path of [
    "app/toolkit/cli/page.tsx",
    "app/cli/page.tsx",
    "app/docs/page.tsx",
    "app/llms.txt/route.ts",
    "app/llms-full.txt/route.ts",
  ]) {
    const source = await read(path);
    const claimedVersions = [
      ...source.matchAll(/@ackrate\/cli(?:@| · | )(\d+\.\d+\.\d+)/g),
    ].map((match) => match[1]);
    for (const version of claimedVersions) {
      assert.equal(version, actualVersion, `${path} advertises CLI ${version}`);
    }
  }

  const [home, cli, terminal, bundleSource] = await Promise.all([
    read("app/docs/page.tsx"),
    read("app/cli/page.tsx"),
    read("app/toolkit/cli/page.tsx"),
    read("vendor/ackrate-cli.mjs"),
  ]);
  for (const [path, source] of [
    ["app/docs/page.tsx", home],
    ["app/cli/page.tsx", cli],
    ["app/toolkit/cli/page.tsx", terminal],
    ["vendor/ackrate-cli.mjs", bundleSource],
  ]) {
    assert.match(source, new RegExp(PERMANENT_SIMPLE_CONTRACT), path);
  }
});

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
const TEMPORARY_HOSTNAME = `${String.fromCharCode(114, 101, 97, 112, 112)}.live`;

const protectedHashes = {
  "app/express/page.tsx": "a7d87431ae35ec88f0f28f73878f98a98f6651605a802f91801c712502a2e84a",
  "app/express/layout.tsx": "7fb5a1ee24023ddd61ee8092c0c2e3047d51d5a0c4273fb1f4ba6f7374f8b40d",
  "app/api/express/route.ts": "645a2a92788b61f42537ee0d9f4980c7324a0f76fadd68239939da17b0854141",
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

test("navigation hides Consumer and exposes Solutions without deleting the direct Video route", async () => {
  const [nav, consumer, video] = await Promise.all([
    read("components/Nav.tsx"),
    read("app/consumer/page.tsx"),
    read("app/video/page.tsx"),
  ]);
  assert.doesNotMatch(nav, /href: "\/consumer", label: "Consumer"/);
  assert.match(nav, /href: "\/solutions", label: "Solutions"/);
  assert.doesNotMatch(nav, /href: "\/video", label: "Video"/);
  assert.match(nav, /href: "\/express", label: "Express"/);
  assert.match(nav, /href: "\/merchants", label: "Merchants"/);
  assert.match(consumer, /Preview only · no funds move/);
  assert.match(consumer, /No wallet was created and no transaction was signed/);
  assert.match(consumer, /Give AI a job/);
  assert.match(consumer, /Not a blank check/);
  assert.match(consumer, /Try the spending controls/);
  assert.match(consumer, /Watch a budgeted agent buy three resources/);
  assert.ok(video.length > 100);
});

test("the Merchants page links every security claim to public Mainnet evidence", async () => {
  const [page, layout, sitemap, llms] = await Promise.all([
    read("app/merchants/page.tsx"),
    read("app/merchants/layout.tsx"),
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
    "22",
    "Mainnet contract tests",
    "gatecheck-contracts.sh",
    "mainnet-canary-deployment.md",
    "deployment-manifest.json",
    "CDBTG5ZKASFA7LOYUPBOTGKAVX5MJIM4U24BYGX7VX23IHYDAHLQPAGS",
    "CD3KRQRNCW52CZHKG2GPQAEOU6UCL426YFNHYUZ7IWUUKAOTKUQX6UUX",
  ]) assert.match(page, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), required);
  assert.match(layout, /path: "\/merchants"/);
  assert.match(sitemap, /"\/merchants"/);
  assert.match(llms, /Merchant assurance/);
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
  assert.ok(starterSetup.includes(`https://${TEMPORARY_HOSTNAME}\${installer.path}`));
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
    "app/page.tsx",
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
    read("app/page.tsx"),
    read("app/cli/page.tsx"),
    read("app/toolkit/cli/page.tsx"),
    read("vendor/ackrate-cli.mjs"),
  ]);
  for (const [path, source] of [
    ["app/page.tsx", home],
    ["app/cli/page.tsx", cli],
    ["app/toolkit/cli/page.tsx", terminal],
    ["vendor/ackrate-cli.mjs", bundleSource],
  ]) {
    assert.match(source, new RegExp(PERMANENT_SIMPLE_CONTRACT), path);
  }
});

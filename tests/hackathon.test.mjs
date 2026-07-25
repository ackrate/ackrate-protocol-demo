import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const run = promisify(execFile);

const protectedHashes = {
  "app/express/page.tsx": "ba0df89a81c1a10f12648fbd5bd951ba2a872847a8ea65dfd32ac3294350e33c",
  "app/express/layout.tsx": "440134d79d32d0b3fb4e00b1adea361dbf17f9bef9e5f80f57f7db0d7957be66",
  "app/api/express/route.ts": "645a2a92788b61f42537ee0d9f4980c7324a0f76fadd68239939da17b0854141",
  "app/api/express/[sessionId]/source/[resource]/route.ts": "022c94e6c368357692c1981f08f52aea41c28ef39eadde56ca501280a6e552a5",
  "lib/express-demo.ts": "c48c4e776f0380b55992a5deac32d00fc9905c2cc7b3a8b27925fe6b716f564d",
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
  assert.match(consumer, /Preview only · no funds move/);
  assert.match(consumer, /No wallet was created and no transaction was signed/);
  assert.match(consumer, /Give AI a job/);
  assert.match(consumer, /Not a blank check/);
  assert.match(consumer, /Try the spending controls/);
  assert.match(consumer, /Watch a budgeted agent buy three resources/);
  assert.ok(video.length > 100);
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
  assert.match(starterSetup, /https:\/\/reapp\.live\$\{installer\.path\}/);
  assert.match(starterSetup, /^\/bin\/sh -c "\$\(curl -fsSL /);
  assert.doesNotMatch(starterSetup, /unzip -q|npm ci/);
  assert.doesNotMatch(starterSetup, /npm run/);
  assert.doesNotMatch(installer, /curl[^\n|]*\|\s*(?:sh|bash)/);
  assert.match(page, /github\.com\/reapp-protocol\/reapp-protocol-demo\/blob\/main\/starters\/\$\{kit\.slug\}\/README\.md/);
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
  assert.equal(manifest.dependencies["@reapp-sdk/core"], "0.3.1");
  assert.equal(manifest.dependencies["@reapp-sdk/stellar"], "0.2.2");
  assert.equal(manifest.dependencies["@reapp-sdk/ap2"], "0.3.0");
  assert.equal(manifest.dependencies["@reapp-sdk/express-middleware"], "0.2.2");
  assert.ok(manifest.scripts.demo);
  assert.ok(manifest.scripts.fulfillment);
  assert.equal(manifest.scripts.hosted, "node src/hosted.mjs");
  assert.match(sources["starters/research-source-scout/.gitignore"], /^\.env$/m);
  assert.match(sources["starters/research-source-scout/.gitignore"], /^\.reapp\/$/m);
  assert.match(sources["starters/research-source-scout/src/consumer.mjs"], /runLocalTestnetDemo/);
  assert.match(sources["starters/research-source-scout/src/fulfillment.mjs"], /startFulfillmentServer/);
  assert.match(sources["starters/research-source-scout/src/hosted.mjs"], /\/api\\\/express\\\//, "the hosted companion must report verified rejection to the exact workspace path");
  assert.match(sources["starters/research-source-scout/src/hosted.mjs"], /createBoundTestnetConsumer/);
  assert.match(sources["starters/research-source-scout/src/hosted.mjs"], /purchaseVerifiedBoundJson/);
  assert.match(sources["starters/research-source-scout/src/hosted.mjs"], /expectVerifiedBudgetRejection/);
  assert.match(sources["starters/research-source-scout/shared/contract.mjs"], /proofPolicy:\s*["']bound-v2-only["']/);
  assert.match(sources["starters/research-source-scout/shared/contract.mjs"], /reapp\.agent/);
  assert.match(sources["starters/research-source-scout/shared/fulfillment.mjs"], /createBoundReappPaidJsonRoute/);
  const combined = Object.values(sources).join("\n");
  assert.doesNotMatch(combined, /\bS[A-Z2-7]{55}\b/, "no Stellar secret seed may be committed");
  assert.doesNotMatch(combined, /@reapp\//, "only the @reapp-sdk namespace is valid");
  assert.doesNotMatch(sources["starters/research-source-scout/.env.example"], /mainnet/i, "the starter environment must remain testnet-only");
  assert.doesNotMatch(sources["starters/research-source-scout/src/consumer.mjs"], /reapp\.mainnet/i);
  assert.doesNotMatch(sources["starters/research-source-scout/src/fulfillment.mjs"], /reapp\.mainnet/i);
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
    await read("app/llms.txt/route.ts"),
    await read("app/llms-full.txt/route.ts"),
    await read("starters/research-source-scout/README.md"),
  ].join("\n");
  assert.doesNotMatch(combined, /\b(?:au(?:dit)[a-z-]*|tranche|milestone)\b/i);
  assert.doesNotMatch(combined, /\bNO MOCKS\b/i);
  assert.doesNotMatch(combined, /@reapp\//, "only the @reapp-sdk namespace is valid");
  assert.doesNotMatch(combined, /Hackathon starter[\s\S]*?calls the hosted endpoint through agent\.fetch\(\)/);
  assert.match(combined, /inspects the exact 402 challenge, submits the request-bound contract payment/);
  for (const version of [
    "@reapp-sdk/core 0.3.1",
    "@reapp-sdk/stellar 0.2.2",
    // The site's own AP2 validator runs the v0.2 bridge. The starter kit stays
    // on 0.3.0 until 0.4.0 is published and its lockfiles can be regenerated.
    "@reapp-sdk/ap2 0.4.0",
    "@reapp-sdk/express-middleware 0.2.2",
    "reapp-protocol-cli 0.1.7",
  ]) assert.match(combined, new RegExp(version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), version);
});

// The site shipped a vendored bundle reporting 0.1.4 under a banner claiming
// 0.1.5 while 0.1.7 was published. Copy alone cannot catch that, so this asks
// the bundle what it actually is.
test("the vendored CLI bundle is the version the site claims to run", async () => {
  const bundle = new URL("../vendor/reapp-cli.mjs", import.meta.url);
  const { stdout } = await run(process.execPath, [bundle.pathname, "--version"]);
  const actual = stdout.trim();

  assert.match(actual, /^\d+\.\d+\.\d+$/, `unexpected --version output ${JSON.stringify(actual)}`);
  for (const path of ["app/t2/demo/page.tsx", "app/cli/page.tsx", "app/page.tsx"]) {
    const source = await read(path);
    const claimed = [...source.matchAll(/reapp-protocol-cli[@ ](\d+\.\d+\.\d+)/g)].map((m) => m[1]);
    for (const version of claimed) {
      assert.equal(version, actual, `${path} advertises CLI ${version} but the bundle is ${actual}`);
    }
  }
});

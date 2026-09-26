import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";
import ts from "typescript";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const run = promisify(execFile);
const PERMANENT_SIMPLE_CONTRACT =
  "CCHQ5G4Y4YBMY6D3TYYJSVJVCKUM22Q6TMKCCHVAHY4X7K6QELQACZRM";
const RETIRED_PACKAGE_SCOPE = new RegExp(`@${String.fromCharCode(114, 101, 97, 112, 112)}-sdk/`);
const TEMPORARY_HOSTNAME = `${String.fromCharCode(114, 101, 97, 112, 112)}.live`;

// 2026-09-25: owner-requested alpha status and integration documentation link.
// Runtime, recorded receipts, and gateway routes are unchanged.
const protectedHashes = {
  "app/express/page.tsx": "0e6ab1ae24add7754b5aa538051c424c1da56efd550c9068273b98a1398ac0e9",
  "app/express/layout.tsx": "7fb5a1ee24023ddd61ee8092c0c2e3047d51d5a0c4273fb1f4ba6f7374f8b40d",
  "app/api/express/route.ts": "645a2a92788b61f42537ee0d9f4980c7324a0f76fadd68239939da17b0854141",
  "app/api/express/[sessionId]/source/[resource]/route.ts": "022c94e6c368357692c1981f08f52aea41c28ef39eadde56ca501280a6e552a5",
  // 2026-09-07: narrow the registry interface to its sole used method for SDK
  // type compatibility. The historical source and identical JS are checked below.
  "lib/express-demo.ts": "78a2f7cddbfad963cc23bfef774b263061d183cef1b2915c326c6b89fd07d433",
};

test("the verified Express source remains at its reviewed baseline", async () => {
  for (const [path, expected] of Object.entries(protectedHashes)) {
    const source = await read(path);
    const actual = createHash("sha256").update(source).digest("hex");
    assert.equal(actual, expected, path);
  }
});

test("the Express registry type compatibility change preserves emitted JavaScript", async () => {
  const source = await read("lib/express-demo.ts");
  const narrowed = 'registry: Pick<RegistryClient, "get_mandate">;';
  assert.equal(source.split(narrowed).length - 1, 1, "exactly one reviewed type-only change");
  const historical = source.replace(narrowed, "registry: RegistryClient;");
  assert.equal(createHash("sha256").update(historical).digest("hex"),
    "1a7ac7d6a2a76349ea067283d2bf15ebec80b0976574ea5bc97978f6fe474e40",
    "reconstruct the exact protected source, not an arbitrary rewritten baseline");
  const compiler = ts.convertCompilerOptionsFromJson(JSON.parse(await read("tsconfig.json")).compilerOptions, ".");
  assert.deepEqual(compiler.errors, []);
  const emit = (input) => {
    const output = ts.transpileModule(input, {
      fileName: "lib/express-demo.ts",
      compilerOptions: { ...compiler.options, noEmit: false, incremental: false, sourceMap: false, inlineSourceMap: false },
      reportDiagnostics: true,
    });
    assert.deepEqual(output.diagnostics?.filter((item) => item.category === ts.DiagnosticCategory.Error), []);
    return output.outputText;
  };
  assert.equal(emit(source), emit(historical), "the reviewed type annotation must not change emitted runtime code");
});

test("navigation groups developer guides while preserving direct product routes", async () => {
  const [nav, consumer, video] = await Promise.all([
    read("components/Nav.tsx"),
    read("app/consumer/page.tsx"),
    read("app/video/page.tsx"),
  ]);
  assert.doesNotMatch(nav, /href: "\/consumer", label: "Consumer"/);
  assert.match(nav, /href: "\/docs\/quickstarts", label: "Quick starters"/);
  assert.doesNotMatch(nav, /href: "\/video", label: "Video"/);
  assert.match(nav, /href: "\/express", label: "Express demo"/);
  assert.doesNotMatch(nav, /href: "\/security"/);
  assert.match(consumer, /Preview only · no funds move/);
  assert.match(consumer, /No wallet was created and no transaction was signed/);
  assert.match(consumer, /Give AI a job/);
  assert.match(consumer, /Not a blank check/);
  assert.match(consumer, /Try the spending controls/);
  assert.match(consumer, /Watch a budgeted agent buy three resources/);
  assert.ok(video.length > 100);
});

test("security evidence stays in the repository and old website links redirect", async () => {
  const [report, route, sitemap] = await Promise.all([
    read("docs/security-evidence.md"), read("app/security/page.tsx"), read("app/sitemap.ts"),
  ]);
  assert.match(report, /53 \/ 53 PASS/);
  assert.match(report, /gatecheck-contracts.sh/);
  assert.match(route, /permanentRedirect/);
  assert.match(route, /github.com\/ackrate\/ackrate-protocol-contracts/);
  assert.doesNotMatch(sitemap, /"\/security"/);
});

test("quick starters preserve integrity-checked installers and the hosted SDK companion", async () => {
  const [page, redirect, hosted, installer] = await Promise.all([
    read("app/docs/quickstarts/QuickStarters.tsx"), read("app/solutions/page.tsx"),
    read("app/docs/hosted/page.tsx"), read("lib/starter-install.js"),
  ]);
  assert.match(redirect, /redirect\("\/docs\/quickstarts"\)/);
  for (const text of ["buildStarterInstallCommand", "Copy setup command", "npm run demo", "Read the README", "Integrity manifest", "Windows PowerShell", "Mac / Linux", "role=\"status\""]) assert.ok(page.includes(text), text);
  for (const text of ["sessionStorage", 'action: "create"', 'action: "status"', "npm run hosted", "txUrl", "hashValue"]) assert.ok(hosted.includes(text), text);
  for (const text of ["createHash('sha256')", "integrity check failed", "Invoke-WebRequest", "Expand-Archive", "$LASTEXITCODE"]) assert.ok(installer.includes(text), text);
  assert.doesNotMatch(installer, /curl[^\n|]*\|\s*(?:sh|bash)/);
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
    read("app/docs/hosted/page.tsx"),
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
    "@ackrate/core 0.4.1",
    "@ackrate/stellar 0.3.0",
    "@ackrate/ap2 0.4.0",
    "@ackrate/express-middleware 0.3.0",
    "@ackrate/cli 0.2.1",
  ]) assert.match(combined, new RegExp(version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), version);
});

test("plain-text guides distinguish testnet demos, the Mainnet wallet, and published versions", async () => {
  const [shortGuide, fullGuide] = await Promise.all([
    read("app/llms.txt/route.ts"),
    read("app/llms-full.txt/route.ts"),
  ]);
  for (const guide of [shortGuide, fullGuide]) {
    assert.match(guide, /public[\s\S]*testnet/i);
    assert.match(guide, /wallet[\s\S]*Mainnet/i);
    assert.match(guide, /Circle USDC/);
    assert.match(guide, /Freighter/);
    assert.match(guide, /published versions/i);
    for (const version of [
      "@ackrate/core 0.4.1",
      "@ackrate/stellar 0.3.0",
      "@ackrate/ap2 0.4.0",
      "@ackrate/express-middleware 0.3.0",
      "@ackrate/cli 0.2.1",
    ]) assert.match(guide, new RegExp(version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), version);
    for (const staleVersion of [
      "@ackrate/core 0.3.1",
      "@ackrate/stellar 0.2.2",
      "@ackrate/ap2 0.3.0",
      "@ackrate/express-middleware 0.2.2",
    ]) assert.doesNotMatch(guide, new RegExp(staleVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), staleVersion);
  }
});

test("the CLI and Docs use the published Mainnet release", async () => {
  const bundle = new URL("../vendor/ackrate-cli.mjs", import.meta.url);
  const { stdout } = await run(process.execPath, [bundle.pathname, "--version"]);
  const actualVersion = stdout.trim();

  assert.equal(actualVersion, "0.2.1");
  const [home, cli, terminal, bundleSource] = await Promise.all([
    Promise.all([read("app/docs/sdk/page.tsx"), read("app/docs/cli/page.tsx")]).then((pages) => pages.join("\n")),
    read("app/cli/page.tsx"),
    read("app/toolkit/cli/page.tsx"),
    read("vendor/ackrate-cli.mjs"),
  ]);
  const dependencies = JSON.parse(await read("package.json")).dependencies;
  for (const name of ["core", "stellar", "ap2", "express-middleware", "cli"]) {
    const version = dependencies[`@ackrate/${name}`];
    assert.ok(home.includes(`@ackrate/${name} ${version}`) || home.includes(`@ackrate/${name}@${version}`),
      `Docs must match the installed ${name} release`);
  }
  assert.doesNotMatch(home, /CANDIDATE DOCS|0\.1\.10|0\.3\.3/);
  assert.match(cli, /const VERSION = "0\.2\.1"/);
  assert.match(terminal, /redirect\("\/cli"\)/);
  assert.match(cli, /--network mainnet/);
  assert.doesNotMatch(cli, /testnet|0\.1\.9|0\.1\.10/i);
  const registry = "CCLZEBJXG4YVJEPBCR5F27N733BCK5HQJWZZGB3K54JVODY3VAGP4HWR";
  assert.ok(cli.includes(registry));
  assert.ok(bundleSource.includes(registry));
  assert.ok(bundleSource.includes("CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75"));
  const packageJson = JSON.parse(await read("package.json"));
  const lock = JSON.parse(await read("package-lock.json"));
  assert.equal(packageJson.dependencies["@ackrate/cli"], actualVersion);
  assert.equal(lock.packages["node_modules/@ackrate/cli"].version, actualVersion);
  assert.equal(createHash("sha256").update(bundleSource).digest("hex"), "c2e6c113a6fdcad618927c59a304da525628041c7d10626d430712c2f7e2ce69");
});

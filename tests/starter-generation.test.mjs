import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

const RETIRED_PACKAGE_SCOPE = new RegExp(`@${String.fromCharCode(114, 101, 97, 112, 112)}-sdk/`);

import {
  GENERATED_METADATA_RELATIVE_PATH,
  REPOSITORY_ROOT,
  assertSafeRelativePath,
  buildPublicCatalog,
  loadCatalogInputs,
  renderGeneratedMetadata,
  resolveRepositoryPath,
  stableStringify,
} from "../scripts/starters/catalog.mjs";
import {
  CANONICAL_LOCK_RELATIVE_PATH,
  GENERATED_ARCHIVES_RELATIVE_PATH,
  GENERATED_STARTERS_RELATIVE_PATH,
  buildStarterArtifacts,
  createStoredZip,
  extractStoredZip,
  readStoredZipEntries,
} from "../scripts/starters/materialize.mjs";

async function listFiles(root, prefix = "") {
  const entries = await readdir(prefix ? resolve(root, prefix) : root, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(root, path));
    else files.push(path);
  }
  return files;
}

test("generation is deterministic and preserves all twenty public catalog entries", async () => {
  const { catalog, dependencyPolicy } = await loadCatalogInputs();
  const first = renderGeneratedMetadata(catalog, dependencyPolicy);
  const second = renderGeneratedMetadata(structuredClone(catalog), structuredClone(dependencyPolicy));
  assert.equal(first, second);
  assert.equal(buildPublicCatalog(catalog).kits.length, 20);
  assert.deepEqual(buildPublicCatalog(catalog), JSON.parse(stableStringify(catalog)));
  assert.equal(first.match(/^\s+"slug":/gm)?.length, 20);
  assert.doesNotMatch(first, RETIRED_PACKAGE_SCOPE);
  const forbiddenPublicTerms = new RegExp(
    `\\b(?:${["au" + "dit[a-z-]*", "tran" + "che", "mile" + "stone", "gr" + "ant"].join("|")})\\b`,
    "i",
  );
  assert.doesNotMatch(first, forbiddenPublicTerms);
});

test("generated TypeScript is byte-for-byte current", async () => {
  const { catalog, dependencyPolicy } = await loadCatalogInputs();
  const generated = await readFile(resolveRepositoryPath(GENERATED_METADATA_RELATIVE_PATH), "utf8");
  assert.equal(generated, renderGeneratedMetadata(catalog, dependencyPolicy));
});

test("the main README leads with a shareable plain-text starter catalog", async () => {
  const readme = await readFile(resolveRepositoryPath("README.md"), "utf8");
  const catalog = readme.indexOf("## Choose from 20 starter packs");
  const setup = readme.indexOf("## Start here: empty folder to a working testnet demo");
  assert.ok(catalog > 0, "starter catalog is missing");
  assert.ok(setup > catalog, "starter catalog must appear before setup instructions");
  assert.match(readme, /Share the full catalog with your team/);
  assert.equal(readme.match(/^\| \d{2} \|/gm)?.length, 20);
  assert.doesNotMatch(readme, /img\.shields\.io\/badge\//);
});

test("dependency policy uses only exact approved package versions", async () => {
  const { dependencyPolicy } = await loadCatalogInputs();
  assert.equal(dependencyPolicy.installCommand, "npm ci");
  assert.deepEqual(dependencyPolicy.rules, {
    exactVersions: true,
    lockfileRequired: true,
    workspacesAllowed: false,
    localPathDependenciesAllowed: false,
    symlinksAllowed: false,
  });
  for (const [name, version] of Object.entries(dependencyPolicy.dependencies)) {
    assert.doesNotMatch(name, RETIRED_PACKAGE_SCOPE);
    assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  }
});

test("repository paths cannot escape or use ambiguous separators", () => {
  for (const unsafe of ["../escape", "nested/../../escape", "/absolute", "C:\\escape", "nested//file", ".", "safe/../escape", "safe\\file"]) {
    assert.throws(() => assertSafeRelativePath(unsafe), /must|cannot|invalid|normalized|empty/);
  }
  assert.equal(assertSafeRelativePath("starter-kit-src/catalog.json"), "starter-kit-src/catalog.json");
  assert.equal(resolveRepositoryPath("starter-kit-src/catalog.json").startsWith(`${REPOSITORY_ROOT}/`), true);
});

test("check mode is read-only, current, and rejects all other arguments", () => {
  const checked = spawnSync(process.execPath, ["scripts/starters/generate.mjs", "--check"], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
  });
  assert.equal(checked.status, 0, checked.stderr);
  assert.match(checked.stdout, /verified: 20 kits, 20 deterministic archives/);

  const rejected = spawnSync(process.execPath, ["scripts/starters/generate.mjs", "--output", "../escape"], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
  });
  assert.equal(rejected.status, 2);
  assert.match(rejected.stderr, /^Usage:/);
});

test("generation scripts use only local files and Node built-ins", async () => {
  for (const relativePath of ["scripts/starters/catalog.mjs", "scripts/starters/materialize.mjs", "scripts/starters/generate.mjs", "scripts/starters/verify.mjs"]) {
    const source = await readFile(resolveRepositoryPath(relativePath), "utf8");
    for (const match of source.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
      assert.match(match[1], /^(?:node:|\.{1,2}\/)/, `${relativePath} imports ${match[1]}`);
    }
    assert.doesNotMatch(source, /\bfetch\s*\(|node:https|node:http/);
  }
});

test("all twenty generated packages are self-contained and use one exact canonical lockfile", async () => {
  const artifacts = await buildStarterArtifacts();
  const canonicalLock = await readFile(resolveRepositoryPath(CANONICAL_LOCK_RELATIVE_PATH));
  assert.equal(artifacts.kits.length, 20);
  for (const { kit, files } of artifacts.kits) {
    assert.equal(files.get("package-lock.json").equals(canonicalLock), true, kit.id);
    const packageJson = JSON.parse(files.get("package.json").toString("utf8"));
    assert.deepEqual(packageJson.dependencies, artifacts.dependencyPolicy.dependencies);
    assert.equal(packageJson.scripts.demo, "node src/consumer.mjs");
    assert.equal(packageJson.scripts.fulfillment, "node src/fulfillment.mjs");
    assert.equal(packageJson.scripts.check, "node src/check.mjs");
    assert.equal(files.has("README.md"), true);
    const readme = files.get("README.md").toString("utf8");
    assert.match(readme, /If you used Copy setup command/);
    assert.match(readme, /already downloaded this starter, extracted it into your empty folder, and ran `npm ci`/);
    assert.match(readme, /verified the ZIP against the exact SHA-256/);
    assert.match(readme, /public integrity manifest/);
    assert.match(readme, /If you downloaded the ZIP manually/);
    assert.match(readme, /open the extracted folder in VS Code/);
    assert.match(readme, /Terminal → New Terminal/);
    assert.match(readme, /```bash\nnpm ci\nnpm run demo\n```/);
    assert.doesNotMatch(readme, /npm ci && npm run/);
    assert.match(readme, /You do not need a wallet or a GitHub repo/);
    assert.match(readme, /What the terminal will teach you/);
    assert.match(readme, /accepted Stellar testnet payment evidence with explorer transaction hashes/i);
    assert.match(readme, /named negative or recovery check reaching its documented outcome/);
    assert.match(readme, /HTTP 402/);
    assert.match(readme, /HTTP 200/);
    assert.match(readme, /no real money/i);
    assert.equal(readme.match(/^```mermaid$/gm)?.length, 2, `${kit.id} must contain two Mermaid diagrams`);
    assert.doesNotMatch(readme, /img\.shields\.io\/badge\//);
    assert.match(readme, /Make it yours/);
    assert.match(readme, /Start with these three files/);
    assert.match(readme, /`scenario\/scenario\.mjs`/);
    assert.match(readme, /`src\/consumer\.mjs`/);
    assert.match(readme, /`src\/fulfillment\.mjs`/);
    assert.doesNotMatch(readme, /Create a workspace|workspace flow/);
    if (kit.id === "research-source-scout") assert.match(readme, /Optional hosted walkthrough/);
    else assert.doesNotMatch(readme, /Optional hosted walkthrough/);
    assert.equal(files.has(".env.example"), true);
    assert.equal(files.has(".gitignore"), true);
    assert.equal(files.has("scenario/scenario.mjs"), true);
    assert.equal(files.has("scenario/support.mjs"), true);
    assert.equal(files.has("shared/local-demo.mjs"), true);
    assert.equal(files.has("shared/presenter.mjs"), true);
    assert.equal(files.has("src/consumer.mjs"), true);
    const consumer = files.get("src/consumer.mjs").toString("utf8");
    assert.match(consumer, /createBeginnerDemoPresenter/);
    assert.match(consumer, new RegExp(`"title": "${kit.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    assert.match(consumer, new RegExp(kit.negativePath.outcome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(consumer, /console\.log\(`\[\$\{event\.type\}\]/);
    assert.equal(files.has("src/fulfillment.mjs"), true);
    for (const [path, contents] of files) {
      assert.doesNotMatch(path, /(?:^|\/)\.env$/);
      if (path.endsWith(".mjs") || path.endsWith(".md") || path.endsWith(".json") || path.startsWith(".")) {
        assert.doesNotMatch(contents.toString("utf8"), RETIRED_PACKAGE_SCOPE, `${kit.id}/${path}`);
      }
    }
  }
});

test("STORE-mode archives are deterministic and extract byte-for-byte to their package trees", async (context) => {
  const artifacts = await buildStarterArtifacts();
  const temporary = await mkdtemp(resolve(tmpdir(), "ackrate-starters-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));

  for (const { kit, files, archive, sha256 } of artifacts.kits) {
    assert.equal(createStoredZip(files).equals(archive), true, `${kit.id} archive changed within one process`);
    assert.equal(createHash("sha256").update(archive).digest("hex"), sha256);
    const entries = readStoredZipEntries(archive);
    assert.deepEqual([...entries.keys()], [...files.keys()].sort((left, right) => left.localeCompare(right, "en")));
    const destination = resolve(temporary, kit.slug);
    await extractStoredZip(archive, destination);
    assert.deepEqual(await listFiles(destination), [...files.keys()].sort((left, right) => left.localeCompare(right, "en")));
    for (const [path, expected] of files) {
      assert.equal((await readFile(resolve(destination, path))).equals(expected), true, `${kit.id}/${path}`);
    }
  }
});

test("archive paths reject traversal and unapproved hidden state while retaining safe starter dotfiles", () => {
  const safe = createStoredZip(new Map([
    [".env.example", Buffer.from("example", "utf8")],
    [".gitignore", Buffer.from(".env\n", "utf8")],
    ["src/index.mjs", Buffer.from("export {};\n", "utf8")],
  ]));
  assert.deepEqual([...readStoredZipEntries(safe).keys()], [".env.example", ".gitignore", "src/index.mjs"]);
  for (const path of ["../outside", "src/../../outside", ".env", ".git/config", "src/.secret"]) {
    assert.throws(() => createStoredZip(new Map([[path, Buffer.from("x")]])), /path|dot|leave|normalized|unsupported/);
  }
  const forward = createStoredZip(new Map([["a", Buffer.from("1")], ["b", Buffer.from("2")]]));
  const reverse = createStoredZip(new Map([["b", Buffer.from("2")], ["a", Buffer.from("1")]]));
  assert.equal(forward.equals(reverse), true);
});

test("manifest hashes, sizes, paths, and generated trees match the committed archives", async () => {
  const artifacts = await buildStarterArtifacts();
  assert.equal(artifacts.manifest.kits.length, 20);
  for (const [index, entry] of artifacts.manifest.kits.entries()) {
    const built = artifacts.kits[index];
    assert.equal(entry.id, built.kit.id);
    assert.equal(entry.slug, built.kit.slug);
    assert.equal(entry.archive, `/starters/v1/${built.kit.slug}.zip`);
    assert.equal(entry.sha256, createHash("sha256").update(built.archive).digest("hex"));
    assert.equal(entry.size, built.archive.byteLength);
    assert.equal(entry.files, built.files.size);
    for (const shell of ["posix", "powershell"]) {
      const installer = built.installers[shell];
      assert.equal(entry.installers[shell].path, installer.path);
      assert.equal(entry.installers[shell].sha256, createHash("sha256").update(installer.source).digest("hex"));
      assert.equal(entry.installers[shell].size, installer.source.byteLength);
      const committedInstaller = await readFile(resolveRepositoryPath(
        `${GENERATED_ARCHIVES_RELATIVE_PATH}/${entry.slug}.${shell === "posix" ? "sh" : "ps1"}`,
      ));
      assert.equal(committedInstaller.equals(installer.source), true, `${entry.id}/${shell}`);
    }
    const committedArchive = await readFile(resolveRepositoryPath(`${GENERATED_ARCHIVES_RELATIVE_PATH}/${entry.slug}.zip`));
    assert.equal(committedArchive.equals(built.archive), true, entry.id);
    for (const [path, contents] of built.files) {
      const committed = await readFile(resolveRepositoryPath(`${GENERATED_STARTERS_RELATIVE_PATH}/${entry.slug}/${path}`));
      assert.equal(committed.equals(contents), true, `${entry.id}/${path}`);
    }
  }
  assert.equal(
    (await readFile(resolveRepositoryPath(`${GENERATED_ARCHIVES_RELATIVE_PATH}/manifest.json`))).equals(artifacts.manifestSource),
    true,
  );
});

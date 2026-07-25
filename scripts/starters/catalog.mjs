import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));

export const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "../..");
export const CATALOG_RELATIVE_PATH = "starter-kit-src/catalog.json";
export const DEPENDENCY_POLICY_RELATIVE_PATH = "starter-kit-src/dependency-policy.json";
export const GENERATED_METADATA_RELATIVE_PATH = "lib/hackathon-starters.generated.ts";

const EXPECTED_CONSTRAINTS = Object.freeze({
  network: "stellar-testnet",
  paidMethod: "GET",
  proofPolicy: "bound-v2-only",
  runtime: "local-consumer-and-fulfillment",
  fixturePolicy: "deterministic-and-clearly-labeled",
  compatibilityClaim: "reapp-bound-v2",
});

const EXPECTED_DEPENDENCIES = Object.freeze({
  "@reapp-sdk/ap2": "0.4.0",
  "@reapp-sdk/core": "0.3.1",
  "@reapp-sdk/express-middleware": "0.2.2",
  "@reapp-sdk/stellar": "0.2.2",
  "@stellar/stellar-sdk": "14.6.1",
  express: "5.2.1",
});

const EXPECTED_POLICY_RULES = Object.freeze({
  exactVersions: true,
  lockfileRequired: true,
  workspacesAllowed: false,
  localPathDependenciesAllowed: false,
  symlinksAllowed: false,
});

const KIT_KEYS = Object.freeze([
  "businessLogic",
  "category",
  "difficulty",
  "features",
  "fixtures",
  "id",
  "inspiration",
  "negativePath",
  "paidResource",
  "slug",
  "summary",
  "title",
]);

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EXACT_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const FORBIDDEN_PUBLIC_TERMS = /\b(?:au(?:dit)[a-z-]*|tranche|milestone)\b/i;
const INVALID_PACKAGE_SCOPE = /@reapp\//;

function fail(message) {
  throw new Error(message);
}

function requireCondition(condition, message) {
  if (!condition) fail(message);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requirePlainObject(value, label) {
  requireCondition(isPlainObject(value), `${label} must be an object`);
}

function requireString(value, label, minimumLength = 1) {
  requireCondition(typeof value === "string", `${label} must be a string`);
  requireCondition(value.length >= minimumLength, `${label} must be at least ${minimumLength} characters`);
}

function requireExactKeys(value, expectedKeys, label) {
  requirePlainObject(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  requireCondition(JSON.stringify(actual) === JSON.stringify(expected), `${label} fields do not match the catalog contract`);
}

function requireUnique(values, label) {
  requireCondition(new Set(values).size === values.length, `${label} must be unique`);
}

function requireExactObject(value, expected, label) {
  requirePlainObject(value, label);
  requireCondition(stableStringify(value) === stableStringify(expected), `${label} does not match the fixed policy`);
}

export function assertSafeRelativePath(candidate, label = "path") {
  requireString(candidate, label);
  requireCondition(!isAbsolute(candidate), `${label} must be relative`);
  requireCondition(!candidate.includes("\\"), `${label} must use forward slashes`);
  requireCondition(!candidate.includes("\0"), `${label} contains an invalid byte`);
  requireCondition(candidate === posix.normalize(candidate), `${label} must be normalized`);
  requireCondition(candidate !== ".", `${label} must identify a file or directory`);
  requireCondition(!candidate.startsWith("../") && candidate !== "..", `${label} cannot leave the repository`);
  requireCondition(!candidate.split("/").includes(".."), `${label} cannot contain parent traversal`);
  requireCondition(!candidate.split("/").includes(""), `${label} cannot contain empty segments`);
  return candidate;
}

export function resolveRepositoryPath(relativePath) {
  const safePath = assertSafeRelativePath(relativePath, "repository path");
  const absolutePath = resolve(REPOSITORY_ROOT, safePath);
  const repositoryRelative = relative(REPOSITORY_ROOT, absolutePath);
  requireCondition(repositoryRelative !== "" && !repositoryRelative.startsWith("..") && !isAbsolute(repositoryRelative), "resolved path leaves the repository");
  return absolutePath;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

export function stableStringify(value, indentation = 2) {
  return JSON.stringify(canonicalize(value), null, indentation);
}

async function readJson(relativePath, label) {
  const source = await readFile(resolveRepositoryPath(relativePath), "utf8");
  try {
    return JSON.parse(source);
  } catch (error) {
    fail(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function validateDependencyPolicy(policy) {
  requireExactKeys(policy, ["schemaVersion", "policyId", "packageManager", "installCommand", "nodeEngine", "dependencies", "rules"], "dependency policy");
  requireCondition(policy.schemaVersion === 1, "dependency policy schemaVersion must be 1");
  requireCondition(policy.policyId === "reapp-hackathon-starter-dependencies-v1", "dependency policy id is not supported");
  requireCondition(policy.packageManager === "npm", "dependency policy packageManager must be npm");
  requireCondition(policy.installCommand === "npm ci", "dependency policy install command must be npm ci");
  requireCondition(policy.nodeEngine === ">=20", "dependency policy Node engine must be >=20");
  requireExactObject(policy.dependencies, EXPECTED_DEPENDENCIES, "dependency pins");
  requireExactObject(policy.rules, EXPECTED_POLICY_RULES, "dependency rules");
  for (const [packageName, version] of Object.entries(policy.dependencies)) {
    requireCondition(!INVALID_PACKAGE_SCOPE.test(packageName), `dependency ${packageName} uses an invalid package scope`);
    requireCondition(EXACT_VERSION_PATTERN.test(version), `dependency ${packageName} must use an exact version`);
  }
  return policy;
}

export function validateCatalog(catalog) {
  requireExactKeys(catalog, ["schemaVersion", "catalogId", "constraints", "sources", "kits"], "catalog");
  requireCondition(catalog.schemaVersion === 1, "catalog schemaVersion must be 1");
  requireCondition(catalog.catalogId === "reapp-hackathon-starters-v1", "catalog id is not supported");
  requireExactObject(catalog.constraints, EXPECTED_CONSTRAINTS, "catalog constraints");
  requirePlainObject(catalog.sources, "catalog sources");
  requireCondition(Object.keys(catalog.sources).length > 0, "catalog must cite at least one source");

  for (const [sourceId, source] of Object.entries(catalog.sources)) {
    requireCondition(SLUG_PATTERN.test(sourceId), `source id ${sourceId} is not safe`);
    requireExactKeys(source, ["title", "url"], `source ${sourceId}`);
    requireString(source.title, `source ${sourceId} title`, 5);
    requireCondition(typeof source.url === "string" && source.url.startsWith("https://"), `source ${sourceId} must use HTTPS`);
  }

  requireCondition(Array.isArray(catalog.kits), "catalog kits must be an array");
  requireCondition(catalog.kits.length === 20, "catalog must contain exactly 20 starter kits");
  requireUnique(catalog.kits.map((kit) => kit?.id), "kit ids");
  requireUnique(catalog.kits.map((kit) => kit?.slug), "kit slugs");
  requireUnique(catalog.kits.map((kit) => kit?.title), "kit titles");
  requireUnique(catalog.kits.map((kit) => kit?.paidResource), "paid resources");
  requireUnique(catalog.kits.map((kit) => kit?.negativePath?.id), "negative path ids");
  requireCondition(
    catalog.kits[0]?.id === "research-source-scout" && catalog.kits[0]?.slug === "research-source-scout",
    "the verified starter must keep the stable research-source-scout slug",
  );

  for (const kit of catalog.kits) {
    requireExactKeys(kit, KIT_KEYS, `kit ${kit?.id ?? "unknown"}`);
    requireCondition(SLUG_PATTERN.test(kit.id), `kit id ${kit.id} is not safe`);
    requireCondition(SLUG_PATTERN.test(kit.slug), `kit slug ${kit.slug} is not safe`);
    assertSafeRelativePath(kit.slug, `kit ${kit.id} slug`);
    requireString(kit.title, `kit ${kit.id} title`, 5);
    requireString(kit.category, `kit ${kit.id} category`, 3);
    requireCondition(["Beginner", "Intermediate", "Advanced"].includes(kit.difficulty), `kit ${kit.id} difficulty is not supported`);
    requireString(kit.summary, `kit ${kit.id} summary`, 40);
    requireCondition(/^GET \/[A-Za-z0-9:/-]+$/.test(kit.paidResource), `kit ${kit.id} must expose one safe GET resource pattern`);
    requireString(kit.businessLogic, `kit ${kit.id} business logic`, 60);
    requireCondition(Array.isArray(kit.features) && kit.features.length >= 3, `kit ${kit.id} must declare at least three features`);
    requireUnique(kit.features, `kit ${kit.id} features`);
    for (const feature of kit.features) requireCondition(SLUG_PATTERN.test(feature), `kit ${kit.id} feature ${feature} is not valid`);
    requireExactKeys(kit.negativePath, ["id", "outcome"], `kit ${kit.id} negative path`);
    requireCondition(SLUG_PATTERN.test(kit.negativePath.id), `kit ${kit.id} negative path id is not valid`);
    requireString(kit.negativePath.outcome, `kit ${kit.id} negative path outcome`, 40);
    requireString(kit.fixtures, `kit ${kit.id} fixtures`, 40);
    requireCondition(Array.isArray(kit.inspiration) && kit.inspiration.length > 0, `kit ${kit.id} must cite at least one source`);
    requireUnique(kit.inspiration, `kit ${kit.id} inspiration`);
    for (const sourceId of kit.inspiration) requireCondition(Boolean(catalog.sources[sourceId]), `kit ${kit.id} cites unknown source ${sourceId}`);
  }

  const publicSource = stableStringify(catalog);
  requireCondition(!INVALID_PACKAGE_SCOPE.test(publicSource), "catalog contains an invalid package scope");
  requireCondition(!FORBIDDEN_PUBLIC_TERMS.test(publicSource), "catalog contains disallowed public terminology");
  return catalog;
}

export function buildPublicCatalog(catalog) {
  validateCatalog(catalog);
  return canonicalize(catalog);
}

export function renderGeneratedMetadata(catalog, dependencyPolicy) {
  const publicCatalog = buildPublicCatalog(catalog);
  validateDependencyPolicy(dependencyPolicy);
  const dependencies = canonicalize(dependencyPolicy.dependencies);
  return `// Generated from starter-kit-src/catalog.json by scripts/starters/generate.mjs.\n// Run the generator after changing the catalog.\n\nexport const HACKATHON_STARTER_CATALOG = ${stableStringify(publicCatalog)} as const;\n\nexport const HACKATHON_STARTER_DEPENDENCIES = ${stableStringify(dependencies)} as const;\n\nexport type HackathonStarter = (typeof HACKATHON_STARTER_CATALOG)["kits"][number];\nexport type HackathonStarterId = HackathonStarter["id"];\n`;
}

export async function loadCatalogInputs() {
  const [catalog, dependencyPolicy] = await Promise.all([
    readJson(CATALOG_RELATIVE_PATH, "starter catalog"),
    readJson(DEPENDENCY_POLICY_RELATIVE_PATH, "dependency policy"),
  ]);
  validateCatalog(catalog);
  validateDependencyPolicy(dependencyPolicy);
  return { catalog, dependencyPolicy };
}

export async function synchronizeGeneratedMetadata({ check = false } = {}) {
  requireCondition(typeof check === "boolean", "check must be a boolean");
  const { catalog, dependencyPolicy } = await loadCatalogInputs();
  const expected = renderGeneratedMetadata(catalog, dependencyPolicy);
  const outputPath = resolveRepositoryPath(GENERATED_METADATA_RELATIVE_PATH);

  if (check) {
    let actual;
    try {
      actual = await readFile(outputPath, "utf8");
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") fail(`${GENERATED_METADATA_RELATIVE_PATH} is missing; run the starter metadata generator`);
      throw error;
    }
    requireCondition(actual === expected, `${GENERATED_METADATA_RELATIVE_PATH} is stale; run the starter metadata generator`);
    return { changed: false, checked: true, kitCount: catalog.kits.length };
  }

  let current = null;
  try {
    current = await readFile(outputPath, "utf8");
  } catch (error) {
    if (!(error && typeof error === "object" && error.code === "ENOENT")) throw error;
  }
  if (current === expected) return { changed: false, checked: false, kitCount: catalog.kits.length };

  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, expected, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, outputPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
  return { changed: true, checked: false, kitCount: catalog.kits.length };
}

import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import {
  REPOSITORY_ROOT,
  assertSafeRelativePath,
  loadCatalogInputs,
  resolveRepositoryPath,
  stableStringify,
} from "./catalog.mjs";
import { buildStarterInstallerScript } from "../../lib/starter-install.js";

export const GENERATED_STARTERS_RELATIVE_PATH = "starters";
export const GENERATED_ARCHIVES_RELATIVE_PATH = "public/starters/v1";
export const STARTER_MANIFEST_RELATIVE_PATH = `${GENERATED_ARCHIVES_RELATIVE_PATH}/manifest.json`;
export const CANONICAL_LOCK_RELATIVE_PATH = "starter-kit-src/template/package-lock.json";

const SHARED_SOURCE_RELATIVE_PATH = "starter-kit-src/shared";
const SCENARIO_SOURCE_RELATIVE_PATH = "starter-kit-src/scenarios";
const FIXED_ZIP_TIME = 0;
const FIXED_ZIP_DATE = 33;
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_STORE_METHOD = 0;
const GENERATED_FILE_MODE = 0o100644;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function fail(message) {
  throw new Error(message);
}

function requireCondition(condition, message) {
  if (!condition) fail(message);
}

function text(value) {
  return Buffer.from(value, "utf8");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertGeneratedPath(candidate, label = "generated path") {
  const checked = assertSafeRelativePath(candidate, label);
  const segments = checked.split("/");
  const dotSegments = segments.filter((segment) => segment.startsWith("."));
  requireCondition(
    dotSegments.length === 0
      || (dotSegments.length === 1 && [".env.example", ".gitignore"].includes(segments.at(-1))),
    `${label} contains an unsupported dot segment`,
  );
  return checked;
}

function routePatternFromPaidResource(paidResource) {
  requireCondition(paidResource.startsWith("GET "), "paid resource must start with GET");
  return paidResource.slice(4);
}

function expectedMetadata(kit, catalog) {
  return Object.freeze({
    fixturePolicy: catalog.constraints.fixturePolicy,
    id: kit.id,
    negativePathId: kit.negativePath.id,
    routePattern: routePatternFromPaidResource(kit.paidResource),
  });
}

function renderPackageJson(dependencyPolicy, kit) {
  const scripts = {
    check: "node src/check.mjs",
    demo: "node src/consumer.mjs",
    fulfillment: "node src/fulfillment.mjs",
    reset: "node src/reset.mjs",
  };
  if (kit.id === "research-source-scout") scripts.hosted = "node src/hosted.mjs";
  return `${stableStringify({
    name: "ackrate-hackathon-starter",
    version: "0.0.0",
    private: true,
    description: "Self-contained ACKRATE bound-v2 starter for Stellar testnet.",
    type: "module",
    engines: { node: dependencyPolicy.nodeEngine },
    scripts,
    dependencies: dependencyPolicy.dependencies,
  })}\n`;
}

function validateCanonicalLock(lock, dependencyPolicy) {
  requireCondition(lock?.lockfileVersion === 3, "canonical starter lockfile must use lockfileVersion 3");
  requireCondition(lock.requires === true, "canonical starter lockfile must require dependencies");
  requireCondition(lock.name === "ackrate-hackathon-starter", "canonical starter lockfile name is not supported");
  requireCondition(lock.version === "0.0.0", "canonical starter lockfile version is not supported");
  requireCondition(lock.packages && typeof lock.packages === "object", "canonical starter lockfile packages are missing");
  const root = lock.packages[""];
  requireCondition(root?.name === lock.name && root?.version === lock.version, "canonical lockfile root identity is inconsistent");
  requireCondition(
    stableStringify(root.dependencies) === stableStringify(dependencyPolicy.dependencies),
    "canonical lockfile dependencies do not match the exact dependency policy",
  );
  requireCondition(root.engines?.node === dependencyPolicy.nodeEngine, "canonical lockfile Node engine does not match policy");
  for (const [path, entry] of Object.entries(lock.packages)) {
    requireCondition(path === "" || path.startsWith("node_modules/"), `canonical lockfile contains unsupported path ${path}`);
    requireCondition(entry?.link !== true, `canonical lockfile contains a link at ${path}`);
    if (path && entry?.resolved !== undefined) {
      requireCondition(
        typeof entry.resolved === "string" && entry.resolved.startsWith("https://registry.npmjs.org/"),
        `canonical lockfile package ${path} has a non-registry source`,
      );
      requireCondition(typeof entry.integrity === "string" && entry.integrity.startsWith("sha512-"), `canonical lockfile package ${path} lacks SHA-512 integrity`);
    }
  }
  return lock;
}

function renderMetadataModule(metadata) {
  return `// Generated from the reviewed starter catalog.\nexport const EXPECTED_SCENARIO_METADATA = Object.freeze(${stableStringify(metadata)});\n`;
}

function renderConsumerSource(kit) {
  const presentation = stableStringify({
    id: kit.id,
    negativePathId: kit.negativePath.id,
    negativePathOutcome: kit.negativePath.outcome,
    paidResource: kit.paidResource,
    summary: kit.summary,
    title: kit.title,
  });
  return `import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { runLocalTestnetDemo } from "../shared/local-demo.mjs";
import { createBeginnerDemoPresenter } from "../shared/presenter.mjs";
import { createScenario } from "../scenario/scenario.mjs";
import { EXPECTED_SCENARIO_METADATA } from "../scenario/metadata.mjs";

export const scenario = createScenario(EXPECTED_SCENARIO_METADATA);
export const starter = Object.freeze(${presentation});

function printHelp() {
  console.log(\`ACKRATE starter: \${starter.title}

Usage:
  npm run check  # deterministic offline business vectors
  npm run demo   # guided consumer + fulfillment demo on Stellar testnet

The demo explains each 402, contract payment, 200 response, and safety check in
plain English. It creates temporary testnet keys, stores private recovery data
under .ackrate/, and never requests a wallet or mainnet secret.

Advanced: ACKRATE_VERBOSE=1 npm run demo also shows developer event names.\`);
}

export async function runDemo({ stateRoot = resolve(".ackrate"), onEvent } = {}) {
  return runLocalTestnetDemo({ scenario, stateRoot, onEvent });
}

async function main() {
  const argumentsList = process.argv.slice(2);
  if (argumentsList.length === 1 && ["--help", "-h"].includes(argumentsList[0])) {
    printHelp();
    return;
  }
  if (argumentsList.length !== 0) throw new Error("demo accepts only --help");
  const presenter = createBeginnerDemoPresenter({ scenario, starter });
  const result = await runDemo({ onEvent: presenter.onEvent });
  presenter.finish(result);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error("\\nThe demo stopped safely before it could finish.");
    console.error(\`Reason: \${error instanceof Error ? error.message : String(error)}\`);
    console.error("Your recovery evidence is still in .ackrate/. Read README.md before resetting it.");
    process.exitCode = 1;
  });
}
`;
}

function renderFulfillmentSource() {
  return `import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  loadDefaultEnvFiles,
  parseNamedArgs,
  validateExactOrigin,
  validateMerchant,
  validatePort,
} from "../shared/config.mjs";
import { startFulfillmentServer } from "../shared/fulfillment.mjs";
import { loadOrCreateChallengeSecret } from "../shared/private-secret.mjs";
import { createScenario } from "../scenario/scenario.mjs";
import { EXPECTED_SCENARIO_METADATA } from "../scenario/metadata.mjs";

export const scenario = createScenario(EXPECTED_SCENARIO_METADATA);

function printHelp() {
  console.log(\`ACKRATE \${scenario.id} fulfillment

Usage:
  ACKRATE_MERCHANT=G... npm run fulfillment

Optional: PORT, ACKRATE_PUBLIC_ORIGIN, ACKRATE_CHALLENGE_SECRET, ACKRATE_STATE_ROOT.
The server binds only to 127.0.0.1 and keeps paid-delivery evidence under .ackrate/.\`);
}

export async function runFulfillment({
  merchant,
  port = 4021,
  publicOrigin,
  challengeSecret,
  stateRoot = resolve(".ackrate"),
} = {}) {
  const checkedMerchant = validateMerchant(merchant, "merchant");
  const checkedPort = validatePort(port);
  const origin = validateExactOrigin(publicOrigin ?? \`http://127.0.0.1:\${checkedPort}\`);
  const secret = challengeSecret ?? await loadOrCreateChallengeSecret(resolve(stateRoot, "challenge-secret"));
  return startFulfillmentServer({
    host: "127.0.0.1",
    port: checkedPort,
    publicOrigin: origin,
    merchant: checkedMerchant,
    challengeSecret: secret,
    routePattern: scenario.routePattern,
    amount: scenario.amount,
    preflight: scenario.preflight,
    fulfill: scenario.fulfill,
    configureFreeRoutes: scenario.configureFreeRoutes,
    stateRoot,
  });
}

async function main() {
  await loadDefaultEnvFiles();
  const flags = parseNamedArgs(process.argv.slice(2), ["merchant", "origin", "port"]);
  if (flags.help) {
    printHelp();
    return;
  }
  const handle = await runFulfillment({
    merchant: flags.merchant ?? process.env.ACKRATE_MERCHANT,
    port: flags.port ?? process.env.PORT ?? "4021",
    publicOrigin: flags.origin ?? process.env.ACKRATE_PUBLIC_ORIGIN,
    challengeSecret: process.env.ACKRATE_CHALLENGE_SECRET,
    stateRoot: resolve(process.env.ACKRATE_STATE_ROOT ?? ".ackrate"),
  });
  console.log(\`ACKRATE fulfillment listening at \${handle.origin}\`);
  console.log(\`Paid route: GET \${scenario.routePattern}\`);
  const stop = () => handle.close().finally(() => process.exit(0));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(\`ACKRATE fulfillment stopped safely: \${error instanceof Error ? error.message : String(error)}\`);
    process.exitCode = 1;
  });
}
`;
}

function renderHostedConsumerSource() {
  return `import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  assertMandateStateUnchanged,
  assertNoUnresolvedReceipts,
  createBoundTestnetConsumer,
  createRunStores,
  expectVerifiedBudgetRejection,
  purchaseVerifiedBoundJson,
  readTestnetMandateState,
  setupTestnetMandate,
  verifyExactBound402,
} from "../shared/contract.mjs";
import {
  loadDefaultEnvFiles,
  parseNamedArgs,
  validateMerchant,
} from "../shared/config.mjs";
import { createJsonEvidenceEnvelope } from "../shared/evidence.mjs";
import { fetchWithTimeout } from "../shared/http.mjs";
import {
  createDisposableTestnetActors,
  explorerTransactionUrl,
  fundTestnetAccount,
} from "../shared/testnet.mjs";

const RESOURCES = Object.freeze(["market", "academic", "news"]);
const BLOCKED_RESOURCE = "patents";

function printHelp() {
  console.log(\`ACKRATE hosted hackathon companion

Usage:
  npm run hosted -- --endpoint="https://reapp.live/api/express/WORKSPACE/source" --merchant="G..."

The endpoint and merchant come from https://reapp.live/solutions. The command
uses disposable Stellar testnet signers and never requests a wallet secret.\`);
}

function normalizeEndpoint(value) {
  if (typeof value !== "string" || !value) throw new Error("endpoint is required; copy it from /solutions");
  const endpoint = new URL(value);
  const loopback = endpoint.hostname === "127.0.0.1" || endpoint.hostname === "localhost";
  if (
    endpoint.username
    || endpoint.password
    || endpoint.search
    || endpoint.hash
    || (endpoint.protocol !== "https:" && !(loopback && endpoint.protocol === "http:"))
  ) throw new Error("endpoint must be an exact HTTPS URL (HTTP is allowed only on loopback)");
  endpoint.pathname = endpoint.pathname.replace(/\\/+$/, "");
  if (!endpoint.pathname.endsWith("/source")) throw new Error("endpoint must end with /source");
  return endpoint.toString().replace(/\\/$/, "");
}

function isHostedWorkspace(endpoint) {
  return /^\\/api\\/express\\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\/source$/i.test(new URL(endpoint).pathname);
}

function validateHostedDelivery({ body, receipt, resource }) {
  if (
    !body
    || typeof body !== "object"
    || body.ok !== true
    || body.resource !== resource
    || typeof body.label !== "string"
    || typeof body.data !== "string"
    || body.settledTx?.toLowerCase() !== receipt.txHash
  ) throw new Error("hosted paid response did not match the exact resource and settlement");
  return Object.freeze({ resource, label: body.label, data: body.data });
}

async function reportBudgetRejection(url, mandateId) {
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ event: "contract_rejected", mandateId }),
    redirect: "error",
  }, 60_000);
  const body = await response.json().catch(() => undefined);
  if (!response.ok || body?.ok !== true || body?.verified !== true) {
    throw new Error(\`hosted rejection report was not verified (HTTP \${response.status})\`);
  }
  return body;
}

export async function runHosted({ endpoint, merchant, stateRoot = resolve(".ackrate") }) {
  const checkedEndpoint = normalizeEndpoint(endpoint);
  const checkedMerchant = validateMerchant(merchant, "merchant");
  const stores = createRunStores(stateRoot);
  await assertNoUnresolvedReceipts(stores.receiptStore);
  const actors = createDisposableTestnetActors();
  const runId = await stores.resultStore.begin({
    mode: "hosted-companion",
    endpoint: checkedEndpoint,
    merchant: checkedMerchant,
    network: "stellar-testnet",
    budgetXlm: "3.00",
  });
  try {
    await Promise.all([
      fundTestnetAccount(actors.user.publicKey()),
      fundTestnetAccount(actors.agent.publicKey()),
    ]);
    await stores.resultStore.append(runId, {
      type: "accounts_funded",
      user: actors.user.publicKey(),
      agent: actors.agent.publicKey(),
    });
    const mandateEvidence = await setupTestnetMandate({
      user: actors.user,
      agent: actors.agent,
      merchant: checkedMerchant,
      budgetXlm: "3.00",
    });
    await stores.resultStore.append(runId, {
      type: "mandate_ready",
      mandateId: mandateEvidence.mandate.id,
      registerTx: mandateEvidence.registerTx,
      approveTx: mandateEvidence.approveTx,
    });
    const consumer = createBoundTestnetConsumer({
      mandate: mandateEvidence.mandate,
      agent: actors.agent,
      receiptStore: stores.receiptStore,
    });
    const transactions = [];
    for (const [index, resource] of RESOURCES.entries()) {
      const url = \`\${checkedEndpoint}/\${resource}\`;
      const quote = await verifyExactBound402({ url, merchant: checkedMerchant, amount: "1.00" });
      await stores.resultStore.append(runId, { type: "challenge_402_verified", resource, priceXlm: "1.00" });
      const delivered = await purchaseVerifiedBoundJson({
        consumer,
        mandate: mandateEvidence.mandate,
        url,
        quote,
        validateDelivery: ({ body, receipt }) => validateHostedDelivery({ body, receipt, resource }),
        commitDelivery: async ({ body, value, receipt }) => {
          const bodyEvidence = createJsonEvidenceEnvelope("hosted-delivery-body", body);
          await stores.resultStore.commitDelivery(runId, {
            type: "delivery_accepted",
            step: index + 1,
            path: new URL(url).pathname,
            receiptId: receipt.receiptId,
            txHash: receipt.txHash,
            explorer: explorerTransactionUrl(receipt.txHash),
            bodySha256: bodyEvidence.sha256,
            evidence: { resource: value.resource, label: value.label },
          });
        },
      });
      transactions.push(delivered.receipt.txHash);
      console.log(\`402 → contract payment → 200 · \${resource} · \${explorerTransactionUrl(delivered.receipt.txHash)}\`);
    }

    const blockedUrl = \`\${checkedEndpoint}/\${BLOCKED_RESOURCE}\`;
    const before = await readTestnetMandateState({ mandate: mandateEvidence.mandate, source: actors.user });
    const blockedQuote = await verifyExactBound402({ url: blockedUrl, merchant: checkedMerchant, amount: "1.00" });
    const rejection = await expectVerifiedBudgetRejection({
      consumer,
      mandate: mandateEvidence.mandate,
      url: blockedUrl,
      quote: blockedQuote,
    });
    const after = await readTestnetMandateState({ mandate: mandateEvidence.mandate, source: actors.user });
    const unchanged = assertMandateStateUnchanged(before, after);
    if (isHostedWorkspace(checkedEndpoint)) await reportBudgetRejection(blockedUrl, mandateEvidence.mandate.id);
    await stores.resultStore.append(runId, {
      type: "contract_budget_rejection_verified",
      resource: BLOCKED_RESOURCE,
      rejection,
      unchanged,
    });
    if (transactions.length !== 3 || (await stores.receiptStore.listPending()).length !== 0) {
      throw new Error("hosted flow did not finish with exactly three deliveries and zero pending receipts");
    }
    const summary = {
      mandateId: mandateEvidence.mandate.id,
      delivered: transactions.length,
      blocked: 1,
      transactions,
    };
    await stores.resultStore.finish(runId, "complete", summary);
    return Object.freeze({ runId, ...summary });
  } catch (error) {
    await stores.resultStore.finish(runId, "failed", {
      reason: error instanceof Error ? error.message : String(error),
    }).catch(() => undefined);
    throw error;
  }
}

async function main() {
  await loadDefaultEnvFiles();
  const flags = parseNamedArgs(process.argv.slice(2), ["endpoint", "merchant"]);
  if (flags.help) {
    printHelp();
    return;
  }
  const result = await runHosted({
    endpoint: flags.endpoint ?? process.env.ACKRATE_ENDPOINT,
    merchant: flags.merchant ?? process.env.ACKRATE_MERCHANT,
  });
  console.log(\`Complete: \${result.delivered} hosted deliveries verified; fourth payment rejected by the contract.\`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(\`ACKRATE hosted demo stopped safely: \${error instanceof Error ? error.message : String(error)}\`);
    process.exitCode = 1;
  });
}
`;
}

function renderCheckSource() {
  return `import { runScenarioTestVectors } from "../shared/scenario.mjs";
import { createScenario } from "../scenario/scenario.mjs";
import { EXPECTED_SCENARIO_METADATA } from "../scenario/metadata.mjs";

const scenario = createScenario(EXPECTED_SCENARIO_METADATA);
const results = await runScenarioTestVectors(scenario);
if (results.length < 4) throw new Error("scenario must include all required offline vector kinds");
console.log(\`Offline gate check passed: \${scenario.id} · \${results.length} vectors\`);
`;
}

function renderResetSource() {
  return `import { resolve } from "node:path";

import { runSafeReset } from "../shared/reset.mjs";

const result = await runSafeReset({
  stateRoot: resolve(process.env.ACKRATE_STATE_ROOT ?? ".ackrate"),
  archiveRoot: resolve(process.env.ACKRATE_ARCHIVE_ROOT ?? ".ackrate-archive"),
});
console.log(result.kind === "missing" ? "No active ACKRATE state found." : \`Archived safe ACKRATE state to \${result.destination}\`);
`;
}

function renderEnvExample() {
  return `# Advanced local fulfillment only. npm run demo needs no configuration.\nACKRATE_MERCHANT=G_REPLACE_WITH_FUNDED_TESTNET_PUBLIC_KEY\nPORT=4021\nACKRATE_PUBLIC_ORIGIN=http://127.0.0.1:4021\n# Optional: set a stable private value with at least 32 bytes. Never commit it.\n# ACKRATE_CHALLENGE_SECRET=replace-with-a-private-random-value\n`;
}

function renderGitIgnore() {
  return `node_modules/\n.env\n.env.local\n.ackrate/\n.ackrate-archive/\n*.log\n.DS_Store\n`;
}

function renderReadme(kit, metadata, dependencyPolicy) {
  const features = kit.features.map((feature) => `- \`${feature}\``).join("\n");
  const hosted = kit.id === "research-source-scout"
    ? `## Optional hosted walkthrough\n\nThe local demo above is the primary starter flow. To connect the same project to the browser companion afterward:\n\n1. Open [reapp.live/solutions](https://reapp.live/solutions).\n2. Start the optional hosted walkthrough.\n3. Copy the displayed \`npm run hosted -- --endpoint=... --merchant=...\` command into this project's VS Code terminal and press **Enter**.\n\nThe browser and terminal then show the same hosted paid flow. Your private signers and recovery evidence stay in this local folder.\n\n`
    : "";
  return `# ${kit.title}\n\n**${kit.summary}**\n\nThis starter protects \`${kit.paidResource}\` with a request-bound payment on Stellar testnet. The app asks; the MandateRegistry contract decides whether money moves.\n\n## Start — two commands, no wallet\n\nYou need Node.js 20 or newer. You do not need a wallet or a GitHub repo.\n\n### If you used Copy setup command\n\nThe setup command on [reapp.live/solutions](https://reapp.live/solutions) already downloaded this starter, extracted it into your empty folder, and ran \`npm ci\`. Before extraction, it verified the ZIP against the exact SHA-256 in the [public integrity manifest](https://reapp.live/starters/v1/manifest.json). In the same VS Code terminal, run:\n\n\`\`\`bash\nnpm run demo\n\`\`\`\n\n### If you downloaded the ZIP manually\n\nCompare its SHA-256 with the [public integrity manifest](https://reapp.live/starters/v1/manifest.json), extract the ZIP, open the extracted folder in VS Code, select **Terminal → New Terminal**, then run:\n\n\`\`\`bash\n${dependencyPolicy.installCommand}\nnpm run demo\n\`\`\`\n\nThe demo creates disposable testnet accounts, starts the consumer and Express fulfillment service, and explains every step in plain English. It never requests a wallet or mainnet secret.\n\n\`\`\`mermaid\nflowchart LR\n    A["① Open an empty folder"] --> B["② Copy the setup command"]\n    B --> C["③ Run npm run demo"]\n    C --> D["④ Read the guided result"]\n    D --> E["⑤ Open the Stellar proof links"]\n\n    style A fill:#052e2b,stroke:#14b8a6,color:#ecfdf5\n    style B fill:#082f49,stroke:#0ea5e9,color:#f0f9ff\n    style C fill:#312e81,stroke:#818cf8,color:#eef2ff\n    style D fill:#4c1d95,stroke:#a78bfa,color:#f5f3ff\n    style E fill:#064e3b,stroke:#34d399,color:#ecfdf5\n\`\`\`\n\n${hosted}## What the terminal will teach you\n\nThe guided output uses six numbered steps and explains the important words:\n\n1. **Testnet accounts** are temporary practice accounts. No real money is used.\n2. **HTTP 402** means the API is working and requires payment.\n3. **Contract approval** means the user's exact spending rules allowed the payment.\n4. **HTTP 200** means the paid result was delivered.\n5. **Stellar proof links** let anyone inspect each accepted payment.\n6. **The safety check** proves this starter's named boundary or recovery behavior.\n\nThe terminal shows the local fulfillment server starting, accepted Stellar testnet payment evidence with explorer transaction hashes, the protected result delivered to the consumer, and the named negative or recovery check reaching its documented outcome.\n\n\`\`\`mermaid\nsequenceDiagram\n    autonumber\n    participant You\n    participant Agent as Consumer agent\n    participant API as Express API\n    participant Contract as MandateRegistry\n    participant Stellar as Stellar testnet\n\n    You->>Agent: Run npm run demo\n    Agent->>API: GET protected result\n    API-->>Agent: 402 Payment Required\n    Agent->>Contract: Request the exact payment\n    Contract->>Stellar: Verify the spending rules\n    Stellar-->>Agent: Confirm payment\n    Agent->>API: Retry with payment proof\n    API-->>Agent: 200 + protected result\n    Agent->>Agent: Verify the named safety or recovery check\n\`\`\`\n\n## Scenario\n\n- Paid resource: \`${kit.paidResource}\`\n- Price policy: exact decimal amounts declared by the scenario\n- Safety or recovery check: \`${kit.negativePath.id}\`\n- Expected outcome: ${kit.negativePath.outcome}\n- Fixtures: ${kit.fixtures}\n\n${kit.businessLogic}\n\n### Capabilities\n\n${features}\n\n## Make it yours\n\nStart with these three files:\n\n| File | What to change |\n|---|---|\n| \`scenario/scenario.mjs\` | Your product's rules, sample data, delivery checks, and rejection check. |\n| \`src/consumer.mjs\` | How your app requests and pays for the protected result. |\n| \`src/fulfillment.mjs\` | What your paid Express endpoint returns. |\n\nThe shared payment and recovery code lives in \`shared/\`. Leave it unchanged until your project needs advanced customization.\n\n## Run fulfillment separately\n\nThe one-command demo starts both sides automatically. To inspect or modify the server independently:\n\n\`\`\`bash\ncp .env.example .env\n# Put a funded Stellar testnet public G-address in ACKRATE_MERCHANT.\nnpm run fulfillment\n\`\`\`\n\nKeep the challenge secret private and stable. The reference file store is for one local Node process; multi-process deployments need one shared linearizable store implementing the same interface.\n\n## Safety and recovery\n\n- Paid work is GET-only and bound to the exact origin, method, resource, merchant, asset, amount, registry, and short-lived challenge.\n- Delivery evidence is committed before the client acknowledges and clears a settlement receipt.\n- Exact same-proof replay returns byte-identical recovery; an old proof on a new resource is rejected, and a freshly rebound proof reusing an old transaction conflicts.\n- State under \`.ackrate/\` is private and ignored by Git. Run \`npm run reset\` only after all payment and fulfillment evidence is resolved.\n\nCatalog identity: \`${metadata.id}\` · fixture policy: \`${metadata.fixturePolicy}\`.\n`;
}

async function listRegularFiles(root, prefix = "") {
  const absolute = prefix ? resolve(root, prefix) : root;
  const entries = await readdir(absolute, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    assertGeneratedPath(relativePath, "source path");
    if (entry.isSymbolicLink()) fail(`source tree cannot contain symlink ${relativePath}`);
    if (entry.isDirectory()) files.push(...await listRegularFiles(root, relativePath));
    else if (entry.isFile()) files.push(relativePath);
    else fail(`source tree contains unsupported entry ${relativePath}`);
  }
  return files;
}

async function loadSharedSources() {
  const root = resolveRepositoryPath(SHARED_SOURCE_RELATIVE_PATH);
  const paths = await listRegularFiles(root);
  requireCondition(paths.length > 0, "shared starter runtime is empty");
  requireCondition(paths.every((path) => path.endsWith(".mjs")), "shared runtime may contain only .mjs source files");
  return new Map(await Promise.all(paths.map(async (path) => [path, await readFile(resolve(root, path))])));
}

async function loadScenarioSources(kit) {
  const scenarioPath = resolveRepositoryPath(`${SCENARIO_SOURCE_RELATIVE_PATH}/${kit.id}.mjs`);
  const supportPath = resolveRepositoryPath(`${SCENARIO_SOURCE_RELATIVE_PATH}/support.mjs`);
  const [scenario, support] = await Promise.all([readFile(scenarioPath), readFile(supportPath)]);
  return new Map([["scenario.mjs", scenario], ["support.mjs", support]]);
}

function appendFile(files, path, value) {
  const checked = assertGeneratedPath(path);
  requireCondition(!files.has(checked), `generated file ${checked} is duplicated`);
  files.set(checked, Buffer.isBuffer(value) ? Buffer.from(value) : text(value));
}

function buildKitFiles({ catalog, kit, dependencyPolicy, canonicalLockSource, sharedSources, scenarioSources }) {
  const metadata = expectedMetadata(kit, catalog);
  const files = new Map();
  appendFile(files, ".env.example", renderEnvExample());
  appendFile(files, ".gitignore", renderGitIgnore());
  appendFile(files, "README.md", renderReadme(kit, metadata, dependencyPolicy));
  appendFile(files, "package.json", renderPackageJson(dependencyPolicy, kit));
  appendFile(files, "package-lock.json", canonicalLockSource);
  appendFile(files, "scenario/metadata.mjs", renderMetadataModule(metadata));
  for (const [path, source] of scenarioSources) appendFile(files, `scenario/${path}`, source);
  for (const [path, source] of sharedSources) appendFile(files, `shared/${path}`, source);
  appendFile(files, "src/check.mjs", renderCheckSource());
  appendFile(files, "src/consumer.mjs", renderConsumerSource(kit));
  appendFile(files, "src/fulfillment.mjs", renderFulfillmentSource());
  if (kit.id === "research-source-scout") appendFile(files, "src/hosted.mjs", renderHostedConsumerSource());
  appendFile(files, "src/reset.mjs", renderResetSource());
  return files;
}

let crcTable;

function crc32(value) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let crc = index;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
      crcTable[index] = crc >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of value) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function createStoredZip(files) {
  requireCondition(files instanceof Map && files.size > 0, "ZIP files must be a non-empty Map");
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const sorted = [...files.entries()].sort(([left], [right]) => left.localeCompare(right, "en"));
  for (const [rawPath, rawContents] of sorted) {
    const path = assertGeneratedPath(rawPath, "ZIP entry path");
    const name = text(path);
    requireCondition(name.byteLength <= 0xffff, `ZIP entry path ${path} is too long`);
    const contents = Buffer.isBuffer(rawContents) ? rawContents : Buffer.from(rawContents);
    requireCondition(contents.byteLength <= 0xffffffff, `ZIP entry ${path} is too large`);
    const checksum = crc32(contents);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(ZIP_UTF8_FLAG, 6);
    local.writeUInt16LE(ZIP_STORE_METHOD, 8);
    local.writeUInt16LE(FIXED_ZIP_TIME, 10);
    local.writeUInt16LE(FIXED_ZIP_DATE, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(contents.byteLength, 18);
    local.writeUInt32LE(contents.byteLength, 22);
    local.writeUInt16LE(name.byteLength, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, contents);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(ZIP_UTF8_FLAG, 8);
    central.writeUInt16LE(ZIP_STORE_METHOD, 10);
    central.writeUInt16LE(FIXED_ZIP_TIME, 12);
    central.writeUInt16LE(FIXED_ZIP_DATE, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(contents.byteLength, 20);
    central.writeUInt32LE(contents.byteLength, 24);
    central.writeUInt16LE(name.byteLength, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE((GENERATED_FILE_MODE << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.byteLength + name.byteLength + contents.byteLength;
  }
  requireCondition(sorted.length <= 0xffff, "ZIP contains too many files");
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(sorted.length, 8);
  end.writeUInt16LE(sorted.length, 10);
  end.writeUInt32LE(centralDirectory.byteLength, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

export function readStoredZipEntries(archive) {
  requireCondition(Buffer.isBuffer(archive), "ZIP archive must be a Buffer");
  requireCondition(archive.byteLength >= 22, "ZIP archive is truncated");
  const endOffset = archive.byteLength - 22;
  requireCondition(archive.readUInt32LE(endOffset) === 0x06054b50, "ZIP end record is missing or commented");
  requireCondition(archive.readUInt16LE(endOffset + 4) === 0 && archive.readUInt16LE(endOffset + 6) === 0, "multi-disk ZIP is not supported");
  requireCondition(archive.readUInt16LE(endOffset + 20) === 0, "ZIP comments are not supported");
  const count = archive.readUInt16LE(endOffset + 10);
  requireCondition(archive.readUInt16LE(endOffset + 8) === count, "ZIP entry counts are inconsistent");
  const centralSize = archive.readUInt32LE(endOffset + 12);
  const centralOffset = archive.readUInt32LE(endOffset + 16);
  requireCondition(centralOffset + centralSize === endOffset, "ZIP central directory boundaries are inconsistent");
  const entries = new Map();
  const localRanges = [];
  let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    requireCondition(cursor + 46 <= endOffset && archive.readUInt32LE(cursor) === 0x02014b50, "ZIP central entry is invalid");
    const flags = archive.readUInt16LE(cursor + 8);
    const method = archive.readUInt16LE(cursor + 10);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const size = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const localOffset = archive.readUInt32LE(cursor + 42);
    requireCondition(
      archive.readUInt16LE(cursor + 4) === 0x0314
        && archive.readUInt16LE(cursor + 6) === 20
        && archive.readUInt16LE(cursor + 12) === FIXED_ZIP_TIME
        && archive.readUInt16LE(cursor + 14) === FIXED_ZIP_DATE
        && archive.readUInt16LE(cursor + 34) === 0
        && archive.readUInt16LE(cursor + 36) === 0
        && archive.readUInt32LE(cursor + 38) === ((GENERATED_FILE_MODE << 16) >>> 0),
      "ZIP central entry metadata is not canonical",
    );
    requireCondition(flags === ZIP_UTF8_FLAG && method === ZIP_STORE_METHOD && compressedSize === size, "ZIP entry is not deterministic STORE mode");
    requireCondition(extraLength === 0 && commentLength === 0, "ZIP entry contains unsupported metadata");
    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    requireCondition(nameEnd <= endOffset, "ZIP entry name is truncated");
    const path = assertGeneratedPath(archive.subarray(nameStart, nameEnd).toString("utf8"), "ZIP entry path");
    requireCondition(!entries.has(path), `ZIP entry ${path} is duplicated`);
    requireCondition(localOffset + 30 <= centralOffset && archive.readUInt32LE(localOffset) === 0x04034b50, `ZIP local entry ${path} is invalid`);
    requireCondition(
      archive.readUInt16LE(localOffset + 4) === 20
        && archive.readUInt16LE(localOffset + 6) === flags
        && archive.readUInt16LE(localOffset + 8) === method
        && archive.readUInt16LE(localOffset + 10) === FIXED_ZIP_TIME
        && archive.readUInt16LE(localOffset + 12) === FIXED_ZIP_DATE
        && archive.readUInt32LE(localOffset + 14) === archive.readUInt32LE(cursor + 16)
        && archive.readUInt32LE(localOffset + 18) === compressedSize
        && archive.readUInt32LE(localOffset + 22) === size,
      `ZIP local entry ${path} metadata differs from its central entry`,
    );
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    requireCondition(localExtraLength === 0, `ZIP local entry ${path} contains extra metadata`);
    const localNameStart = localOffset + 30;
    const localNameEnd = localNameStart + localNameLength;
    requireCondition(archive.subarray(localNameStart, localNameEnd).toString("utf8") === path, `ZIP local and central names differ for ${path}`);
    const dataStart = localNameEnd;
    const dataEnd = dataStart + size;
    requireCondition(dataEnd <= centralOffset, `ZIP entry ${path} data is truncated`);
    const contents = Buffer.from(archive.subarray(dataStart, dataEnd));
    requireCondition(crc32(contents) === archive.readUInt32LE(cursor + 16), `ZIP entry ${path} checksum is invalid`);
    entries.set(path, contents);
    localRanges.push(Object.freeze({ start: localOffset, end: dataEnd, path }));
    cursor = nameEnd + extraLength + commentLength;
  }
  requireCondition(cursor === endOffset, "ZIP central directory contains trailing data");
  localRanges.sort((left, right) => left.start - right.start);
  let expectedOffset = 0;
  for (const range of localRanges) {
    requireCondition(range.start === expectedOffset, `ZIP local entry ${range.path} is out of order or hides data`);
    expectedOffset = range.end;
  }
  requireCondition(expectedOffset === centralOffset, "ZIP contains unindexed data before its central directory");
  return entries;
}

export async function extractStoredZip(archive, destination) {
  const root = resolve(destination);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const entries = readStoredZipEntries(archive);
  for (const [path, contents] of entries) {
    const target = resolve(root, path);
    const targetRelative = relative(root, target);
    requireCondition(targetRelative && !targetRelative.startsWith(".."), `ZIP entry ${path} leaves extraction root`);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, contents, { flag: "wx", mode: 0o600 });
  }
  return Object.freeze({ destination: root, files: Object.freeze([...entries.keys()]) });
}

async function loadCanonicalLock(dependencyPolicy) {
  const source = await readFile(resolveRepositoryPath(CANONICAL_LOCK_RELATIVE_PATH));
  let lock;
  try {
    lock = JSON.parse(source.toString("utf8"));
  } catch (error) {
    fail(`canonical starter lockfile is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  validateCanonicalLock(lock, dependencyPolicy);
  return source;
}

export async function buildStarterArtifacts() {
  const { catalog, dependencyPolicy } = await loadCatalogInputs();
  const [canonicalLockSource, sharedSources] = await Promise.all([
    loadCanonicalLock(dependencyPolicy),
    loadSharedSources(),
  ]);
  const kits = [];
  for (const kit of catalog.kits) {
    const scenarioSources = await loadScenarioSources(kit);
    const files = buildKitFiles({
      catalog,
      kit,
      dependencyPolicy,
      canonicalLockSource,
      sharedSources,
      scenarioSources,
    });
    const archive = createStoredZip(files);
    const digest = sha256(archive);
    requireCondition(SHA256_PATTERN.test(digest), "archive SHA-256 is invalid");
    const installerEntry = Object.freeze({
      slug: kit.slug,
      archive: `/starters/v1/${kit.slug}.zip`,
      sha256: digest,
    });
    const posixInstaller = text(buildStarterInstallerScript(installerEntry, { shell: "posix" }));
    const powershellInstaller = text(buildStarterInstallerScript(installerEntry, { shell: "powershell" }));
    const installers = Object.freeze({
      posix: Object.freeze({
        path: `/starters/v1/${kit.slug}.sh`,
        sha256: sha256(posixInstaller),
        size: posixInstaller.byteLength,
        source: posixInstaller,
      }),
      powershell: Object.freeze({
        path: `/starters/v1/${kit.slug}.ps1`,
        sha256: sha256(powershellInstaller),
        size: powershellInstaller.byteLength,
        source: powershellInstaller,
      }),
    });
    kits.push(Object.freeze({ kit, files, archive, sha256: digest, installers }));
  }
  const manifest = Object.freeze({
    schemaVersion: 1,
    catalogId: catalog.catalogId,
    dependencyPolicyId: dependencyPolicy.policyId,
    archiveFormat: "zip-store",
    kits: Object.freeze(kits.map(({ kit, files, archive, sha256: digest, installers }) => Object.freeze({
      id: kit.id,
      slug: kit.slug,
      archive: `/starters/v1/${kit.slug}.zip`,
      sha256: digest,
      size: archive.byteLength,
      files: files.size,
      installers: Object.freeze({
        posix: Object.freeze({
          path: installers.posix.path,
          sha256: installers.posix.sha256,
          size: installers.posix.size,
        }),
        powershell: Object.freeze({
          path: installers.powershell.path,
          sha256: installers.powershell.sha256,
          size: installers.powershell.size,
        }),
      }),
    }))),
  });
  return Object.freeze({
    catalog,
    dependencyPolicy,
    canonicalLockSource,
    kits: Object.freeze(kits),
    manifest,
    manifestSource: text(`${stableStringify(manifest)}\n`),
  });
}

async function assertExactFile(path, expected) {
  let actual;
  try {
    actual = await readFile(path);
  } catch (error) {
    if (error?.code === "ENOENT") fail(`${relative(REPOSITORY_ROOT, path)} is missing; run the starter generator`);
    throw error;
  }
  requireCondition(actual.equals(expected), `${relative(REPOSITORY_ROOT, path)} is stale; run the starter generator`);
}

async function assertExactTree(root, expectedFiles, label) {
  let actualPaths;
  try {
    actualPaths = await listRegularFiles(root);
  } catch (error) {
    if (error?.code === "ENOENT") fail(`${label} is missing; run the starter generator`);
    throw error;
  }
  const expectedPaths = [...expectedFiles.keys()].sort((left, right) => left.localeCompare(right, "en"));
  requireCondition(
    JSON.stringify(actualPaths) === JSON.stringify(expectedPaths),
    `${label} contains missing or unexpected files; run the starter generator`,
  );
  for (const path of expectedPaths) await assertExactFile(resolve(root, path), expectedFiles.get(path));
}

async function writeTree(root, files) {
  for (const [path, contents] of [...files.entries()].sort(([left], [right]) => left.localeCompare(right, "en"))) {
    const target = resolve(root, path);
    await mkdir(dirname(target), { recursive: true, mode: 0o755 });
    await writeFile(target, contents, { flag: "wx", mode: 0o644 });
  }
}

async function replaceTreeAtomically(target, files) {
  const parent = dirname(target);
  const temporary = await mkdtemp(resolve(parent, `.starter-stage-`));
  const backup = `${target}.backup-${process.pid}`;
  let movedExisting = false;
  try {
    await writeTree(temporary, files);
    try {
      await rename(target, backup);
      movedExisting = true;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await rename(temporary, target);
    if (movedExisting) await rm(backup, { recursive: true, force: true });
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    if (movedExisting) {
      await rm(target, { recursive: true, force: true });
      await rename(backup, target).catch(() => undefined);
    }
    throw error;
  }
}

function expectedGeneratedTrees(artifacts) {
  const starterFiles = new Map();
  const archiveFiles = new Map();
  for (const { kit, files, archive, installers } of artifacts.kits) {
    for (const [path, contents] of files) appendFile(starterFiles, `${kit.slug}/${path}`, contents);
    appendFile(archiveFiles, `${kit.slug}.zip`, archive);
    appendFile(archiveFiles, `${kit.slug}.sh`, installers.posix.source);
    appendFile(archiveFiles, `${kit.slug}.ps1`, installers.powershell.source);
  }
  appendFile(archiveFiles, "manifest.json", artifacts.manifestSource);
  return Object.freeze({ starterFiles, archiveFiles });
}

export async function synchronizeStarterPackages({ check = false } = {}) {
  requireCondition(typeof check === "boolean", "check must be a boolean");
  const artifacts = await buildStarterArtifacts();
  const { starterFiles, archiveFiles } = expectedGeneratedTrees(artifacts);
  const starterRoot = resolveRepositoryPath(GENERATED_STARTERS_RELATIVE_PATH);
  const archiveRoot = resolveRepositoryPath(GENERATED_ARCHIVES_RELATIVE_PATH);
  if (check) {
    await assertExactTree(starterRoot, starterFiles, GENERATED_STARTERS_RELATIVE_PATH);
    await assertExactTree(archiveRoot, archiveFiles, GENERATED_ARCHIVES_RELATIVE_PATH);
    return Object.freeze({ checked: true, changed: false, kitCount: artifacts.kits.length, artifacts });
  }
  await mkdir(dirname(starterRoot), { recursive: true });
  await mkdir(dirname(archiveRoot), { recursive: true });
  await replaceTreeAtomically(starterRoot, starterFiles);
  await replaceTreeAtomically(archiveRoot, archiveFiles);
  return Object.freeze({ checked: false, changed: true, kitCount: artifacts.kits.length, artifacts });
}

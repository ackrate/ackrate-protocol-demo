import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import { runScenarioTestVectors } from "../starter-kit-src/shared/scenario.mjs";

const CATALOG_PATH = new URL("../starter-kit-src/catalog.json", import.meta.url);
const SCENARIO_ROOT = new URL("../starter-kit-src/scenarios/", import.meta.url);
const FIXTURE_POLICY = "deterministic-and-clearly-labeled";

async function catalog() {
  return JSON.parse(await readFile(CATALOG_PATH, "utf8"));
}

function expectedMetadata(kit) {
  return {
    fixturePolicy: FIXTURE_POLICY,
    id: kit.id,
    negativePathId: kit.negativePath.id,
    routePattern: kit.paidResource.slice("GET ".length),
  };
}

function requestFor(routePattern, path) {
  const routeSegments = routePattern.split("/").filter(Boolean);
  const parsed = new URL(path, "http://127.0.0.1");
  const pathSegments = parsed.pathname.split("/").filter(Boolean);
  assert.equal(pathSegments.length, routeSegments.length, `${path} route segment count`);
  const params = {};
  routeSegments.forEach((segment, index) => {
    if (segment.startsWith(":")) params[segment.slice(1)] = decodeURIComponent(pathSegments[index]);
    else assert.equal(pathSegments[index], segment, `${path} literal route segment`);
  });
  return Object.freeze({
    method: "GET",
    path: parsed.pathname,
    params: Object.freeze(params),
    query: Object.freeze(Object.fromEntries(parsed.searchParams)),
  });
}

test("every catalog kit has one loadable professional scenario module", async () => {
  const value = await catalog();
  const files = (await readdir(SCENARIO_ROOT)).filter((name) => name.endsWith(".mjs")).sort();
  assert.deepEqual(files, [...value.kits.map(({ id }) => `${id}.mjs`), "support.mjs"].sort());

  for (const kit of value.kits) {
    const module = await import(new URL(`${kit.id}.mjs`, SCENARIO_ROOT));
    assert.equal(typeof module.createScenario, "function", `${kit.id} createScenario`);
    const scenario = module.createScenario(expectedMetadata(kit));
    assert.equal(scenario.id, kit.id);
    assert.equal(scenario.negativePathId, kit.negativePath.id);
    assert.equal(scenario.routePattern, kit.paidResource.slice(4));
    assert.equal(scenario.fixtures.policy, FIXTURE_POLICY);
    assert.ok(scenario.plan.length >= 1, `${kit.id} plan`);
    assert.ok(scenario.testVectors.length >= 4, `${kit.id} vectors`);
  }
});

test("all eighty deterministic domain vectors pass with required coverage", async () => {
  const value = await catalog();
  let vectorCount = 0;
  for (const kit of value.kits) {
    const module = await import(new URL(`${kit.id}.mjs`, SCENARIO_ROOT));
    const scenario = module.createScenario(expectedMetadata(kit));
    const results = await runScenarioTestVectors(scenario);
    const repeated = await runScenarioTestVectors(scenario);
    assert.deepEqual(repeated, results, `${kit.id} vectors are repeatable in one process`);
    assert.deepEqual(new Set(results.map(({ kind }) => kind)), new Set([
      "free-route",
      "business-positive",
      "business-rejection",
      "delivery-tamper",
    ]), `${kit.id} vector kinds`);
    assert.ok(results.every(({ passed }) => passed), `${kit.id} vectors passed`);
    vectorCount += results.length;
  }
  assert.equal(vectorCount, 80);
});

test("every paid plan executes its deterministic domain hooks without network access", async () => {
  const value = await catalog();
  for (const kit of value.kits) {
    const module = await import(new URL(`${kit.id}.mjs`, SCENARIO_ROOT));
    const scenario = module.createScenario(expectedMetadata(kit));
    const registered = [];
    scenario.configureFreeRoutes(Object.freeze({
      get(pattern, handler) { registered.push({ pattern, handler }); },
    }));
    assert.equal(registered.length, 1, `${kit.id} free route count`);
    assert.equal(registered[0].pattern, "/starter-manifest");
    const freeResult = await registered[0].handler(requestFor("/starter-manifest", "/starter-manifest"));
    assert.equal(freeResult.body.scenarioId, kit.id);
    assert.equal(freeResult.body.fixture, true);

    for (const step of scenario.plan) {
      const request = requestFor(scenario.routePattern, step.path);
      const preflight = await scenario.preflight(request);
      assert.ok(preflight && typeof preflight === "object", `${kit.id} ${step.id} preflight`);
      assert.equal(preflight.priceXlm, step.price, `${kit.id} ${step.id} price`);
      const quoted = typeof scenario.amount === "function" ? scenario.amount(request) : scenario.amount;
      assert.equal(quoted, step.price, `${kit.id} ${step.id} challenge price`);
      const response = await scenario.fulfill({
        request,
        payment: Object.freeze({ txHash: "a".repeat(64) }),
        preflight: Object.freeze(preflight),
      });
      assert.deepEqual(Object.keys(response), ["body"], `${kit.id} ${step.id} exact response shape`);
      const delivered = await scenario.validateDelivery({
        body: response.body,
        receipt: Object.freeze({ txHash: "a".repeat(64) }),
        step,
      });
      assert.ok(delivered && typeof delivered === "object", `${kit.id} ${step.id} validated`);
      const evidence = await scenario.deliveryEvidence({
        value: delivered,
        receipt: Object.freeze({ txHash: "a".repeat(64) }),
        step,
      });
      assert.equal(evidence.resourceId, step.case.resourceId);
      assert.equal(evidence.resultDigest.length, 64);
    }
  }
});

test("security lessons have one canonical owner and ambiguous redemption claims are absent", async () => {
  const value = await catalog();
  const owners = (feature) => value.kits.filter((kit) => kit.features.includes(feature)).map(({ id }) => id);
  assert.deepEqual(owners("cumulative-budget"), ["research-source-scout"]);
  assert.deepEqual(owners("expiry"), ["human-review-outbox"]);
  assert.deepEqual(owners("revocation"), ["fleet-corridor-authority"]);
  assert.deepEqual(owners("replay-defense"), ["payment-receipt-firewall"]);
  assert.deepEqual(owners("one-time-redemption"), []);
  assert.equal(new Set(value.kits.map(({ negativePath }) => negativePath.id)).size, 20);
});

test("scenario sources remain deterministic, local, GET-only, and terminology-safe", async () => {
  const value = await catalog();
  const sources = await Promise.all([
    readFile(CATALOG_PATH, "utf8"),
    readFile(new URL("support.mjs", SCENARIO_ROOT), "utf8"),
    ...value.kits.map(({ id }) => readFile(new URL(`${id}.mjs`, SCENARIO_ROOT), "utf8")),
  ]);
  const combined = sources.join("\n");
  const forbiddenPublicTerms = new RegExp(
    `\\b(?:${["au" + "dit[a-z-]*", "tran" + "che", "mile" + "stone", "gr" + "ant"].join("|")})\\b`,
    "i",
  );
  assert.doesNotMatch(combined, forbiddenPublicTerms);
  assert.doesNotMatch(combined, /@reapp\//);
  assert.doesNotMatch(combined, /paid POST|body-bound payment|generic x402-v2 compatibility/i);
  assert.doesNotMatch(combined, /\b(?:fetch|setTimeout|setInterval)\s*\(|Math\.random|Date\.now/);
  assert.doesNotMatch(combined, /\b(?:POST|PUT|PATCH|DELETE)\s+\//);
  assert.doesNotMatch(combined, /schemaValidated/);
  assert.match(combined, /schemaDeclared: true, fixtureSelected: true/);
});

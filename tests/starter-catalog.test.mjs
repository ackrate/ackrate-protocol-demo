import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const RETIRED_PACKAGE_SCOPE = new RegExp(`@${String.fromCharCode(114, 101, 97, 112, 112)}-sdk/`);
const unique = (values, label) => {
  assert.equal(new Set(values).size, values.length, `${label} must be unique`);
};

test("the catalog fixes exactly twenty distinct GET-only starter contracts", async () => {
  const catalog = JSON.parse(await read("starter-kit-src/catalog.json"));
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.catalogId, "ackrate-hackathon-starters-v1");
  assert.deepEqual(catalog.constraints, {
    network: "stellar-testnet",
    paidMethod: "GET",
    proofPolicy: "bound-v2-only",
    runtime: "local-consumer-and-fulfillment",
    fixturePolicy: "deterministic-and-clearly-labeled",
    compatibilityClaim: "ackrate-bound-v2",
  });
  assert.equal(catalog.kits.length, 20);
  unique(catalog.kits.map((kit) => kit.id), "kit ids");
  unique(catalog.kits.map((kit) => kit.slug), "kit slugs");
  unique(catalog.kits.map((kit) => kit.title), "kit titles");
  unique(catalog.kits.map((kit) => kit.paidResource), "paid resources");
  unique(catalog.kits.map((kit) => kit.negativePath.id), "negative paths");
  assert.equal(catalog.kits[0].id, "research-source-scout");
  assert.equal(catalog.kits[0].slug, "research-source-scout", "the verified starter keeps its stable path");
  for (const kit of catalog.kits) {
    assert.match(kit.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.match(kit.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.match(kit.paidResource, /^GET \/[A-Za-z0-9:/-]+$/);
    assert.ok(kit.summary.length >= 40, `${kit.id} summary`);
    assert.ok(kit.businessLogic.length >= 60, `${kit.id} business logic`);
    assert.ok(kit.fixtures.length >= 40, `${kit.id} fixtures`);
    assert.ok(kit.negativePath.outcome.length >= 40, `${kit.id} negative path`);
    assert.ok(kit.features.length >= 3, `${kit.id} features`);
    unique(kit.features, `${kit.id} features`);
    assert.ok(kit.inspiration.length >= 1, `${kit.id} inspiration`);
    for (const source of kit.inspiration) {
      assert.ok(catalog.sources[source], `${kit.id} cites missing source ${source}`);
    }
  }
});

test("the catalog covers every promised contract and recovery lesson", async () => {
  const catalog = JSON.parse(await read("starter-kit-src/catalog.json"));
  const features = new Set(catalog.kits.flatMap((kit) => kit.features));
  for (const required of [
    "verified-bound-purchase",
    "cumulative-budget",
    "merchant-scope",
    "expiry",
    "revocation",
    "replay-defense",
    "durable-recovery",
    "request-binding",
    "independent-verification",
    "explorer-evidence",
  ]) assert.ok(features.has(required), `missing ${required}`);
});

test("catalog sources are public primary evidence and terminology remains valid", async () => {
  const [catalogSource, schemaSource] = await Promise.all([
    read("starter-kit-src/catalog.json"),
    read("starter-kit-src/catalog.schema.json"),
  ]);
  const catalog = JSON.parse(catalogSource);
  for (const [id, source] of Object.entries(catalog.sources)) {
    assert.match(id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.match(source.url, /^https:\/\//);
    assert.doesNotMatch(source.url, /(?:search|chatgpt|claude)\./i);
  }
  const combined = `${catalogSource}\n${schemaSource}`;
  assert.doesNotMatch(combined, RETIRED_PACKAGE_SCOPE, "the retired package scope is forbidden");
  const forbiddenPublicTerms = new RegExp(
    `\\b(?:${["au" + "dit[a-z-]*", "tran" + "che", "mile" + "stone", "gr" + "ant"].join("|")})\\b`,
    "i",
  );
  assert.doesNotMatch(combined, forbiddenPublicTerms);
  assert.doesNotMatch(combined, /paid POST|body-bound payment|generic x402-v2 compatibility/i);
});

test("catalog copy stays inside the executable fixture boundary", async () => {
  const catalog = JSON.parse(await read("starter-kit-src/catalog.json"));
  const publicCopy = catalog.kits.map((kit) => [
    kit.summary,
    kit.fixtures,
    kit.businessLogic,
    kit.negativePath.outcome,
    kit.features.join("\n"),
  ].join("\n")).join("\n");

  for (const staleClaim of [
    /merged provenance/i,
    /merge provenance-tagged results/i,
    /readability statistics/i,
    /free typed tool discovery/i,
    /propagate source provenance/i,
    /payment bindings/i,
    /every payment proof/i,
    /expires while the case waits/i,
    /three issue identifiers/i,
    /six signed catalog listings/i,
    /three deterministic case graphs/i,
    /three fixed patches/i,
    /run it against server-only tests/i,
    /CPU ceilings/i,
    /runtime ceilings/i,
    /fallback reasoning/i,
    /hashed evidence references/i,
    /three stable vault resources/i,
    /expected hashes/i,
    /even when it ranks first/i,
    /staged specialist outputs/i,
    /identifies the dependency that blocked it/i,
    /requested work tier above the server/i,
    /access any fixture path/i,
    /merchant-scoped mandate/i,
    /enforce stage order/i,
    /sequence-enforcement/i,
    /choose the lowest-cost route satisfying/i,
    /maintain route provenance/i,
    /preserve the locked status/i,
    /independently checked normalized snapshot JSON/i,
    /enforce a client price ceiling/i,
    /run-relative signed events/i,
    /independently calculated digest vectors/i,
    /a data owner operates the merchant endpoint/i,
    /independently checked optimal windows/i,
    /operator revokes its mandate/i,
    /fixed weather epochs/i,
    /stable vendor catalogs/i,
    /live plan purchases the clean-case stages in fixed order and stops/i,
    /score price-quality-latency/i,
  ]) assert.doesNotMatch(publicCopy, staleClaim);

  for (const exactBoundary of [
    /per-source provenance/i,
    /word count/i,
    /schema-described tool discovery/i,
    /settlement transaction hash/i,
    /distinct short-lived mandate expires before settlement/i,
    /reuses its exact Stellar testnet proof after restart/i,
    /computed SHA-256 values/i,
    /would otherwise rank first/i,
    /staged artifact identifiers/i,
    /iteration count above 512/i,
    /before fixture lookup/i,
    /endpoint's owner mapping before a payment challenge/i,
    /offline vectors validate DAG dependencies, stage order, and failure blocking/i,
    /sequence-validation/i,
    /offline vectors compare fixture quotes/i,
    /offline vectors validate segment order and weather epoch/i,
    /record the rejected fourth source without creating a paid delivery/i,
    /two bundled HTML fixture pages/i,
    /offline consumer-policy check/i,
    /offline hook transition rejects a repeated 402/i,
    /live plan buys the fixed alpha merchant route/i,
    /four deterministic signed events/i,
    /one checked deterministic digest prefix/i,
    /live fixture merchant serves one owner-alpha dataset endpoint/i,
    /one independently checked optimal window/i,
    /mandate user revokes authority/i,
    /one route-level weather epoch/i,
    /three stable quote fixtures/i,
    /enforce quote freshness plus merchant, quality, and latency eligibility/i,
  ]) assert.match(publicCopy, exactBoundary);
});

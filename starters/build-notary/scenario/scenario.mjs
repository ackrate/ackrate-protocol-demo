import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { defineScenario } from "../shared/scenario.mjs";
import {
  FIXTURE_POLICY,
  captureRejection,
  canonicalJson,
  codedRejection,
  deliveryEvidence,
  makeDelivery,
  ok,
  outputEvidence,
  registerManifestRoute,
  rejected,
  sha256,
  validateDelivery,
  vector,
} from "./support.mjs";

// Deterministic fixture signer for offline verification vectors; never a funded or production key.
const FIXTURE_SIGNER_SEED = Buffer.from("33".repeat(32), "hex");
const fixturePrivateKey = createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), FIXTURE_SIGNER_SEED]), format: "der", type: "pkcs8" });
const fixturePublicKey = createPublicKey(fixturePrivateKey);
const ARTIFACTS = {
  [sha256("fixture-binary-alpha")]: { contents: "fixture-binary-alpha", dependencies: ["@ackrate/core@0.3.0", "express@5.1.0"], buildCommand: "npm ci && npm run build" },
  [sha256("fixture-binary-beta")]: { contents: "fixture-binary-beta", dependencies: ["@ackrate/core@0.3.0"], buildCommand: "npm ci && npm run build" },
};
const FIRST_SHA = Object.keys(ARTIFACTS).sort()[0];

export function createAttestation(artifactSha) {
  const artifact = ARTIFACTS[artifactSha];
  if (!artifact) codedRejection("unknown-artifact");
  if (sha256(artifact.contents) !== artifactSha) codedRejection("artifact-hash-mismatch");
  const statement = { schemaVersion: 1, artifactSha, dependencies: [...artifact.dependencies].sort(), buildCommand: artifact.buildCommand, reproducibleFixture: true };
  return { statement, signature: sign(null, Buffer.from(canonicalJson(statement)), fixturePrivateKey).toString("base64"), algorithm: "ed25519" };
}

export function verifyAttestation(attestation, expectedSha) {
  if (attestation.statement.artifactSha !== expectedSha) codedRejection("artifact-hash-mismatch");
  if (!verify(null, Buffer.from(canonicalJson(attestation.statement)), fixturePublicKey, Buffer.from(attestation.signature, "base64"))) codedRejection("attestation-signature-invalid");
  return { verified: true, artifactSha: expectedSha, dependencyCount: attestation.statement.dependencies.length };
}

export function createScenario(expectedMetadata) {
  const manifest = { scenarioId: "build-notary", fixture: true, artifactShas: Object.keys(ARTIFACTS).sort(), signer: "local-fixture-ed25519" };
  return defineScenario({
    id: "build-notary",
    negativePathId: "artifact-hash-mismatch",
    fixtures: { policy: FIXTURE_POLICY, version: 1, records: ARTIFACTS },
    routePattern: "/attestations/:artifactSha",
    budgetXlm: "2.0000000",
    amount: "1.0000000",
    configureFreeRoutes(routes) { registerManifestRoute(routes, manifest); },
    preflight({ params }) { return Object.hasOwn(ARTIFACTS, params.artifactSha) ? { resourceId: params.artifactSha, priceXlm: "1.0000000" } : false; },
    fulfill({ preflight }) { return { body: makeDelivery({ scenarioId: "build-notary", resourceId: preflight.resourceId, result: createAttestation(preflight.resourceId), provenance: { fixture: true, signer: "local-fixture-ed25519" } }) }; },
    validateDelivery({ body, step }) { const value = validateDelivery(body, { scenarioId: "build-notary", resourceId: step.case.resourceId }); verifyAttestation(value, step.case.resourceId); return value; },
    deliveryEvidence,
    plan: [{ id: "buy-build-statement", path: `/attestations/${FIRST_SHA}`, price: "1.0000000", expect: "delivery", case: { resourceId: FIRST_SHA } }],
    async runNegativePath() { const attestation = createAttestation(FIRST_SHA); return { id: "artifact-hash-mismatch", verified: true, evidence: await captureRejection(() => verifyAttestation(attestation, "0".repeat(64)), "artifact-hash-mismatch") }; },
    outputEvidence,
    testVectors: [
      vector("free-artifact-index", "free-route", {}, ok({ count: 2, signer: "local-fixture-ed25519" }), () => ({ count: Object.keys(ARTIFACTS).length, signer: manifest.signer })),
      vector("verify-build-attestation", "business-positive", {}, ok({ verified: true, dependencies: 1 }), () => { const result = verifyAttestation(createAttestation(FIRST_SHA), FIRST_SHA); return { verified: result.verified, dependencies: result.dependencyCount }; }),
      vector("reject-artifact-mismatch", "business-rejection", {}, rejected("artifact-hash-mismatch"), () => verifyAttestation(createAttestation(FIRST_SHA), "0".repeat(64))),
      vector("reject-attestation-tamper", "delivery-tamper", {}, rejected("attestation-signature-invalid"), () => { const result = createAttestation(FIRST_SHA); result.statement.dependencies.push("malicious@9.9.9"); const body = makeDelivery({ scenarioId: "build-notary", resourceId: FIRST_SHA, result, provenance: { fixture: true } }); const value = validateDelivery(body, { scenarioId: "build-notary", resourceId: FIRST_SHA }); return verifyAttestation(value, FIRST_SHA); }),
    ],
  }, expectedMetadata);
}

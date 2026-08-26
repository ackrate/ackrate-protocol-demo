import { defineScenario } from "../shared/scenario.mjs";
import {
  FIXTURE_POLICY,
  assertAction,
  codedRejection,
  deliveryEvidence,
  makeDelivery,
  ok,
  outputEvidence,
  registerManifestRoute,
  rejected,
  requireRecord,
  sha256,
  validateDelivery,
  vector,
} from "./support.mjs";

const RECORDS = {
  protocol: { html: "<html><head><title>ACKRATE Protocol</title></head><body><main>Bound payments for software agents.</main><a href=\"/docs\">Docs</a></body></html>" },
  security: { html: "<html><head><title>Security Notes</title></head><body><main>Verify every payment on chain.</main><a href=\"/evidence\">Evidence</a></body></html>" },
};

export function normalizePage(html) {
  if (typeof html !== "string" || /<(?:script|style|iframe)\b/i.test(html)) codedRejection("unsafe-html");
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
  if (!title) codedRejection("missing-title");
  const links = [...html.matchAll(/<a\s+href="([^"]+)"/gi)].map((match) => match[1]).sort();
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const normalized = { title, links, wordCount: text.split(" ").filter(Boolean).length, text };
  return { ...normalized, contentSha256: sha256(JSON.stringify(normalized)) };
}

function snapshot(pageId) {
  return { pageId, ...normalizePage(requireRecord(RECORDS, pageId, "unknown-page").html) };
}

export function createScenario(expectedMetadata) {
  const manifest = { scenarioId: "page-snapshot-meter", fixture: true, pages: Object.keys(RECORDS).sort() };
  return defineScenario({
    id: "page-snapshot-meter",
    negativePathId: "snapshot-resource-rebinding",
    fixtures: { policy: FIXTURE_POLICY, version: 1, records: RECORDS },
    routePattern: "/snapshots/:pageId",
    budgetXlm: "2.0000000",
    amount: "1.0000000",
    configureFreeRoutes(routes) { registerManifestRoute(routes, manifest); },
    preflight({ params }) { return Object.hasOwn(RECORDS, params.pageId) ? { resourceId: params.pageId, priceXlm: "1.0000000" } : false; },
    fulfill({ preflight }) {
      return { body: makeDelivery({ scenarioId: "page-snapshot-meter", resourceId: preflight.resourceId, result: snapshot(preflight.resourceId), provenance: { fixture: true, renderingClaim: false } }) };
    },
    validateDelivery({ body, step }) { return validateDelivery(body, { scenarioId: "page-snapshot-meter", resourceId: step.case.resourceId }); },
    deliveryEvidence,
    plan: [{ id: "buy-protocol-snapshot", path: "/snapshots/protocol", price: "1.0000000", expect: "delivery", case: { resourceId: "protocol" } }],
    async runNegativePath({ actions }) {
      const rejectRebinding = assertAction(actions, "expectResourceRebinding");
      const evidence = await rejectRebinding({ deliveryIndex: 0, targetPath: "/snapshots/security" });
      return { id: "snapshot-resource-rebinding", verified: true, evidence };
    },
    outputEvidence,
    testVectors: [
      vector("free-page-index", "free-route", {}, ok({ pages: ["protocol", "security"] }), () => ({ pages: Object.keys(RECORDS).sort() })),
      vector("normalize-protocol-page", "business-positive", {}, ok({ title: "ACKRATE Protocol", links: ["/docs"], wordCount: 8 }), () => { const value = normalizePage(RECORDS.protocol.html); return { title: value.title, links: value.links, wordCount: value.wordCount }; }),
      vector("reject-active-content", "business-rejection", { html: "<title>Unsafe</title><script>alert(1)</script>" }, rejected("unsafe-html"), ({ html }) => normalizePage(html)),
      vector("reject-snapshot-tamper", "delivery-tamper", {}, rejected("delivery-integrity-mismatch"), () => { const body = makeDelivery({ scenarioId: "page-snapshot-meter", resourceId: "protocol", result: snapshot("protocol"), provenance: { fixture: true } }); body.result.title = "tampered"; return validateDelivery(body, { scenarioId: "page-snapshot-meter", resourceId: "protocol" }); }),
    ],
  }, expectedMetadata);
}

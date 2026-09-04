import assert from "node:assert/strict";
import test from "node:test";
import {
  FALLBACK_MARKETPLACE_SERVICES,
  parseMarketplaceFind,
  parseMarketplacePricing,
  searchMarketplaceServices,
} from "../lib/wallet/marketplace-catalog";

test("marketplace pricing accepts only a catalog that advertises Stellar", () => {
  const services = parseMarketplacePricing({
    payment: { networks: ["base", "stellar"] },
    categories: { web: "Web & documents" },
    endpoints: [{
      method: "GET",
      path: "/api/search",
      name: "Web search",
      price: "$0.02",
      category: "web",
      slug: "search",
      description: "Live web search. A second sentence should not be shown.",
      docs: "https://agent402.tools/tools/search",
    }],
  });

  assert.deepEqual(services, [{
    id: "search",
    name: "Web search",
    price: "0.02",
    category: "web",
    categoryLabel: "Web & documents",
    method: "GET",
    path: "/api/search",
    description: "Live web search.",
    docs: "https://agent402.tools/tools/search",
    inputs: FALLBACK_MARKETPLACE_SERVICES[0]!.inputs,
    schemaSource: "verified-docs",
  }]);

  assert.throws(() => parseMarketplacePricing({
    payment: { networks: ["base"] },
    categories: { web: "Web" },
    endpoints: [{
      method: "GET",
      path: "/api/search",
      name: "Web search",
      price: "$0.02",
      category: "web",
      slug: "search",
      description: "Live web search.",
      docs: "https://agent402.tools/tools/search",
    }],
  }), /Stellar/);
});

test("marketplace find data supplies the exact machine-readable service inputs", () => {
  const result = parseMarketplaceFind({
    count: 1,
    results: [{
      slug: "search",
      name: "Web search",
      route: "GET /api/search",
      price: "$0.02",
      category: "web",
      description: "Live web search.",
      docs: "https://agent402.tools/tools/search",
      inputSchema: {
        properties: {
          q: { type: "string", description: "Search query" },
          count: { type: "number", description: "Results to return" },
          freshness: { type: "string", enum: ["pd", "pw", "pm", "py"], description: "Freshness" },
        },
        required: ["q"],
      },
      example: { q: "x402", count: 5 },
    }],
  });

  assert.equal(result.totalMatches, 1);
  assert.equal(result.services[0]?.schemaSource, "agent402-find");
  assert.deepEqual(result.services[0]?.inputs, [
    { name: "q", type: "string", description: "Search query", required: true, options: [], example: "x402" },
    { name: "count", type: "number", description: "Results to return", required: false, options: [], example: 5 },
    { name: "freshness", type: "string", description: "Freshness", required: false, options: ["pd", "pw", "pm", "py"], example: null },
  ]);
});

test("marketplace search finds real service types and keeps a compact result set", () => {
  const web = searchMarketplaceServices(FALLBACK_MARKETPLACE_SERVICES, "web search");
  assert.equal(web.services[0]?.id, "search");

  const scraper = searchMarketplaceServices(FALLBACK_MARKETPLACE_SERVICES, "scraper");
  assert.ok(scraper.services.some((service) => service.id === "extract"));

  const research = searchMarketplaceServices(FALLBACK_MARKETPLACE_SERVICES, "research");
  assert.equal(research.services[0]?.id, "research");

  const featured = searchMarketplaceServices(FALLBACK_MARKETPLACE_SERVICES, "", 4);
  assert.equal(featured.services.length, 4);
  assert.equal(featured.services[0]?.id, "search");
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  FALLBACK_MARKETPLACE_SERVICES,
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

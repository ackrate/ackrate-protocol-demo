import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import { initialServiceInputValues, serializedServiceInputs, serviceInputProblem } from "../components/wallet/ServiceConfigurator";
import { preflightAgent402Research, preflightAgent402Tool } from "../lib/wallet/agent402";
import { normalizeAgent402ToolInput, SUPPORTED_AGENT402_TOOLS, type SupportedAgent402Slug, type SupportedAgent402Tool } from "../lib/wallet/agent402-tools";
import { FALLBACK_MARKETPLACE_SERVICES, sourceIdForMarketplaceService } from "../lib/wallet/marketplace-catalog";
import { safeWalletError } from "../lib/wallet/notifications";

const ASSET = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";
const seller = Keypair.random().publicKey();

function discovery(tool: SupportedAgent402Tool) {
  return { seller: "self", sellerName: "Agent402", slug: tool.slug, name: tool.name,
    method: tool.method, route: tool.path, url: tool.url, priceUsd: Number(tool.price),
    health: 1, paymentNetworksKnown: true, routerDispatchEligible: true };
}

function challenge(tool: SupportedAgent402Tool) {
  return { x402Version: 2, resource: { url: tool.url, description: tool.name, mimeType: "application/json" },
    accepts: [{ scheme: "exact", network: "stellar:pubnet", asset: ASSET,
      amount: tool.amountAtomic, payTo: seller, maxTimeoutSeconds: 60, extra: { areFeesSponsored: true } }] };
}

for (const slug of ["search", "pdf", "pdf-info"] as const) {
  test(`${slug} preserves its displayed default values through an unpaid, correctly shaped price check`, async (t) => {
    const service = FALLBACK_MARKETPLACE_SERVICES.find((candidate) => candidate.id === slug)!;
    const tool = SUPPORTED_AGENT402_TOOLS[slug];
    const values = initialServiceInputValues(service);
    assert.equal(serviceInputProblem(service, values), null);
    const parameters = serializedServiceInputs(service, values);
    assert.deepEqual(normalizeAgent402ToolInput(slug, parameters), parameters);
    if (slug !== "search") {
      assert.equal(parameters.url, service.inputs[0]!.example, "the shown URL is an actual input value, not just a placeholder");
      assert.deepEqual(Object.keys(parameters), ["url"]);
    }
    assert.equal(sourceIdForMarketplaceService(service), tool.sourceId);
    const requests: Array<{ url: URL; init: RequestInit }> = [];
    t.mock.method(globalThis, "fetch", async () => { throw new Error("fixture must never contact a live service"); });
    const fetcher: typeof fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      const headers = new Headers(init.headers);
      requests.push({ url, init });
      for (const name of ["Authorization", "X-Payment", "Payment-Signature", "Idempotency-Key"]) assert.equal(headers.has(name), false);
      assert.equal(init.redirect, "error");
      if (url.pathname === "/api/route") return Response.json({ results: [discovery(tool)] });
      assert.equal(url.origin, "https://agent402.tools");
      assert.equal(url.pathname, tool.path);
      assert.equal(init.method, tool.method);
      if (tool.method === "POST") {
        assert.equal(url.search, "");
        assert.equal(headers.get("content-type"), "application/json");
        assert.deepEqual(JSON.parse(String(init.body)), parameters);
      } else {
        assert.equal(init.body, undefined);
        assert.equal(url.searchParams.get("q"), parameters.q);
        assert.equal(url.searchParams.get("count"), String(parameters.count));
      }
      return Response.json({ error: "Payment required" }, { status: 402,
        headers: { "Payment-Required": Buffer.from(JSON.stringify(challenge(tool))).toString("base64") } });
    };
    const result = await preflightAgent402Tool(tool, parameters, ASSET, fetcher);
    assert.equal(requests.length, 2, "one discovery and one unsigned HTTP 402 request; never a paid retry");
    assert.deepEqual(result.input, parameters);
    assert.equal(result.requirement.payTo, seller);
    assert.equal(result.requirement.amount, tool.amountAtomic);
  });
}

test("PDF validation rejects absent, private, credentialed, or extra inputs before any service request", async () => {
  for (const slug of ["pdf", "pdf-info"] as const satisfies readonly SupportedAgent402Slug[]) {
    const tool = SUPPORTED_AGENT402_TOOLS[slug];
    for (const parameters of [{}, { url: "" }, { url: "https://localhost/file.pdf" },
      { url: "https://user:secret@example.com/file.pdf" }, { url: "https://bitcoin.org/bitcoin.pdf", unexpected: true }]) {
      let calls = 0;
      await assert.rejects(preflightAgent402Tool(tool, parameters, ASSET, async () => {
        calls++;
        throw new Error("invalid input must not reach discovery");
      }), /inputs are invalid/);
      assert.equal(calls, 0);
    }
  }
});

function discoveryFixture(tool: SupportedAgent402Tool, envelope: unknown) {
  const requests: URL[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    requests.push(url);
    const headers = new Headers(init?.headers);
    assert.equal(headers.has("Payment-Signature"), false);
    assert.equal(headers.has("X-Payment"), false);
    if (url.pathname === "/api/route") return Response.json(envelope);
    assert.equal(url.pathname, tool.path);
    return Response.json({ error: "Payment required" }, { status: 402,
      headers: { "Payment-Required": Buffer.from(JSON.stringify(challenge(tool))).toString("base64") } });
  };
  return { fetcher, requests };
}

const configuredInput = (slug: SupportedAgent402Slug) => slug === "search"
  ? { q: "What is Stellar?", count: 10 }
  : { url: "https://bitcoin.org/bitcoin.pdf" };

test("live-shaped PDF discovery ignores oversized unrelated names without weakening the selected seller", async () => {
  for (const [slug, unrelatedSlug, nameLength, index] of [
    ["pdf", "util_markdown_to_text", 311, 2],
    ["pdf-info", "util_pdf_header_sniff", 361, 3],
  ] as const) {
    const tool = SUPPORTED_AGENT402_TOOLS[slug];
    // September 7 unpaid discovery returned third-party names of these lengths.
    // This fixture reproduces that shape without retaining marketplace prose.
    const unrelated = { ...discovery(tool), seller: "community.example", slug: unrelatedSlug,
      name: "URL input ".repeat(50).slice(0, nameLength), url: "https://community.example/tool" };
    const rows: unknown[] = [discovery(tool)];
    while (rows.length < index) rows.push({ ...unrelated, slug: `other-${rows.length}`, name: "Unrelated service" });
    rows.push(unrelated);
    const fixture = discoveryFixture(tool, { results: rows });
    const before = JSON.stringify(rows);
    const result = await preflightAgent402Tool(tool, configuredInput(slug), ASSET, fixture.fetcher);
    assert.equal(result.seller.slug, slug);
    assert.equal(result.seller.seller, "self");
    assert.equal(result.requirement.amount, tool.amountAtomic);
    assert.equal(fixture.requests.length, 2);
    assert.equal(JSON.stringify(rows), before);
  }
});

test("unrelated malformed discovery rows cannot block configured or legacy web search", async () => {
  const tool = SUPPORTED_AGENT402_TOOLS.search;
  const envelope = { results: [null, { seller: "third-party", slug: "other", name: "x".repeat(400) }, discovery(tool)] };
  const current = discoveryFixture(tool, envelope);
  assert.equal((await preflightAgent402Tool(tool, configuredInput("search"), ASSET, current.fetcher)).seller.slug, "search");
  const legacy = discoveryFixture(tool, envelope);
  assert.equal((await preflightAgent402Research("What is Stellar?", ASSET, legacy.fetcher)).seller.slug, "search");
  assert.equal(current.requests.length, 2);
  assert.equal(legacy.requests.length, 2);
});

test("changed, malformed, absent, or duplicate selected sellers fail before requesting a payment challenge", async () => {
  for (const slug of ["search", "pdf", "pdf-info"] as const) {
    const tool = SUPPORTED_AGENT402_TOOLS[slug];
    const candidate = discovery(tool);
    for (const results of [
      [{ ...candidate, name: "x".repeat(301) }],
      [{ ...candidate, name: "Different service" }],
      [{ ...candidate, method: tool.method === "POST" ? "GET" : "POST" }],
      [{ ...candidate, route: "/api/other" }],
      [{ ...candidate, url: "https://community.example/tool" }],
      [{ ...candidate, url: null }],
      [{ ...candidate, priceUsd: 0.25 }],
      [{ ...candidate, health: 0 }],
      [{ ...candidate, paymentNetworksKnown: false }],
      [{ ...candidate, routerDispatchEligible: false }],
      [{ ...candidate, seller: "third-party" }],
      [{ ...candidate, slug: "other" }],
      [candidate, candidate],
      [candidate, { ...candidate, name: "x".repeat(301) }],
    ]) {
      const fixture = discoveryFixture(tool, { results });
      await assert.rejects(preflightAgent402Tool(tool, configuredInput(slug), ASSET, fixture.fetcher), /Agent402 discovery/);
      assert.equal(fixture.requests.length, 1);
    }
  }
});

test("discovery still bounds and validates its outer response", async () => {
  const tool = SUPPORTED_AGENT402_TOOLS.pdf;
  for (const envelope of [null, {}, { results: [] }, { results: "bad" }, { results: Array(51).fill(discovery(tool)) }]) {
    const fixture = discoveryFixture(tool, envelope);
    await assert.rejects(preflightAgent402Tool(tool, configuredInput("pdf"), ASSET, fixture.fetcher), /Agent402 discovery returned unreadable/);
    assert.equal(fixture.requests.length, 1);
  }
});

test("discovery errors are described as marketplace problems, not incorrect PDF inputs", () => {
  const text = safeWalletError(new Error("Agent402 discovery returned invalid details for the selected seller"), "Unable to check the price.");
  assert.match(text, /marketplace could not verify/);
  assert.match(text, /inputs have not changed/);
  assert.doesNotMatch(text, /required service inputs|No payment was made/);
  const upstream = safeWalletError(new Error("Agent402 discovery returned HTTP 503: unrelated URL input details"), "Unable to check the price.");
  assert.equal(upstream, text);
});

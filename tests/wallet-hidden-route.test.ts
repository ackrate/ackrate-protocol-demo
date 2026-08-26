import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("wallet route is unlisted and excluded from discovery surfaces", () => {
  const navigation = read("components/Nav.tsx");
  const sitemap = read("app/sitemap.ts");
  const robots = read("app/robots.ts");
  const layout = read("app/wallet/layout.tsx");

  assert.equal(navigation.includes('{ href: "/wallet"'), false);
  assert.equal(sitemap.includes('"/wallet"'), false);
  assert.match(robots, /disallow: \["\/api\/", "\/wallet"\]/);
  assert.match(layout, /index: false/);
  assert.match(layout, /follow: false/);
});

test("wallet browser calls stay inside the isolated API namespace", () => {
  const app = read("components/wallet/WalletChatApp.tsx");
  const thread = read("components/wallet/AssistantThread.tsx");

  assert.doesNotMatch(app, /"\/api\/(?:auth|config|mandate)/);
  assert.match(app, /"\/api\/wallet\/auth\/challenge"/);
  assert.match(app, /"\/api\/wallet\/mandate\/status"/);
  assert.match(thread, /api: "\/api\/wallet\/chat"/);
});

test("wallet transaction assembly uses authenticated same-origin Stellar relays", () => {
  const config = read("lib/wallet/app-config.ts");
  const account = read("lib/wallet/horizon-account.ts");
  const rpc = read("app/api/wallet/rpc/route.ts");

  assert.match(config, /\$\{appOrigin\}\/api\/wallet\/rpc/);
  assert.match(account, /"\/api\/wallet\/account\/sequence"/);
  assert.match(rpc, /requireSession/);
  assert.match(rpc, /config\.network\.rpcUrl/);
});

test("wallet exposes a deterministic real-payment control without an LLM dependency", () => {
  const thread = read("components/wallet/AssistantThread.tsx");
  const purchase = read("app/api/wallet/purchase/route.ts");

  assert.match(thread, /Pay \$0\.01 USDC/);
  assert.match(thread, /"\/api\/wallet\/purchase"/);
  assert.match(purchase, /purchaseCatalogItem/);
  assert.match(purchase, /requireSession/);
  assert.doesNotMatch(purchase, /openai|anthropic|streamText/i);
});

test("wallet closes an expired mandate locally and offers a fresh boundary", () => {
  const app = read("components/wallet/WalletChatApp.tsx");

  assert.match(app, /mandate\.expiry > nowSeconds/);
  assert.match(app, /setInterval\(\(\) => setNowSeconds/);
  assert.match(app, /!currentMandate/);
  assert.match(app, /Sign & activate mandate/);
});

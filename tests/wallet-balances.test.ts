import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import { NextRequest } from "next/server";
import { GET } from "../app/api/wallet/balances/route";

const CIRCLE_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

test("rejects an invalid Stellar address before calling Horizon", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("unexpected fetch");
  };
  try {
    const response = await GET(new NextRequest("http://localhost/api/wallet/balances?address=invalid"));
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("returns Mainnet XLM and Circle USDC balances without caching", async () => {
  const originalFetch = globalThis.fetch;
  const address = Keypair.random().publicKey();
  globalThis.fetch = async (input) => {
    assert.equal(String(input), `https://horizon.stellar.org/accounts/${address}`);
    return new Response(JSON.stringify({
      account_id: address,
      balances: [
        { asset_type: "native", balance: "60.2561044" },
        { asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: Keypair.random().publicKey(), balance: "999" },
        { asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: CIRCLE_ISSUER, balance: "2.6761063" },
      ],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await GET(new NextRequest(`http://localhost/api/wallet/balances?address=${address}`));
    const body = await response.json() as { ok: boolean; balances: { address: string; funded: boolean; xlm: string; usdc: string; xlmRaw: string; usdcRaw: string; hasUsdcTrustline: boolean } };
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") ?? "", /\bno-store\b/);
    assert.deepEqual(body, {
      ok: true,
      balances: {
        address,
        funded: true,
        xlm: "60.2561044",
        usdc: "2.6761063",
        xlmRaw: "60.2561044",
        usdcRaw: "2.6761063",
        hasUsdcTrustline: true,
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an unfunded account is a known balance state; provider failure is not a zero balance", async () => {
  const original = globalThis.fetch;
  const address = Keypair.random().publicKey();
  const request = () => new NextRequest(`https://example.test/api/wallet/balances?address=${address}`);
  try {
    globalThis.fetch = async () => Response.json({}, { status: 404 });
    const absent = await GET(request());
    assert.equal(absent.status, 200);
    assert.deepEqual((await absent.json()).balances, {
      address, funded: false, xlm: "0.00", usdc: "0.00", xlmRaw: "0", usdcRaw: "0", hasUsdcTrustline: false,
    });
    globalThis.fetch = async () => Response.json({}, { status: 503 });
    const unavailable = await GET(request());
    assert.equal(unavailable.status, 502);
    assert.equal((await unavailable.json()).ok, false);
  } finally { globalThis.fetch = original; }
});

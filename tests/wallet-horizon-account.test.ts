import assert from "node:assert/strict";
import test from "node:test";
import { loadAccountSequence } from "../lib/wallet/horizon-account";

const address = "GBE3PH4ZYVYUXZWZL4YJP22H5J46U6VQVF6SYNJ3GGU3RHBN4M77VNBG";

test("loads a Mainnet account sequence from Horizon", async (t) => {
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    assert.equal(String(input), `https://horizon.stellar.org/accounts/${address}`);
    return Response.json({ account_id: address, sequence: "123456789" });
  });
  assert.equal(await loadAccountSequence(address, "mainnet"), "123456789");
});

test("uses testnet Horizon for testnet accounts", async (t) => {
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    assert.equal(String(input), `https://horizon-testnet.stellar.org/accounts/${address}`);
    return Response.json({ account_id: address, sequence: "1" });
  });
  assert.equal(await loadAccountSequence(address, "testnet"), "1");
});

test("reports an unfunded account clearly", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 404 }));
  await assert.rejects(loadAccountSequence(address, "mainnet"), /account is not funded/);
});

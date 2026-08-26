import assert from "node:assert/strict";
import test from "node:test";
import { Account, Keypair } from "@stellar/stellar-sdk";
import { accountWithHorizonFallback } from "../lib/wallet/rpc-account-fallback";

test("uses Horizon sequence only for an exact RPC account-missing response", async () => {
  const address = Keypair.random().publicKey();
  const account = await accountWithHorizonFallback(
    address,
    async () => { throw new Error(`Account not found: ${address}`); },
    async (requested) => {
      assert.equal(requested, address);
      return "1234";
    },
  );

  assert.equal(account.accountId(), address);
  assert.equal(account.sequenceNumber(), "1234");
});

test("preserves a successful RPC account result", async () => {
  const address = Keypair.random().publicKey();
  const expected = new Account(address, "99");
  const account = await accountWithHorizonFallback(
    address,
    async () => expected,
    async () => { throw new Error("Horizon must not run"); },
  );

  assert.equal(account, expected);
});

test("does not hide unrelated RPC errors", async () => {
  const address = Keypair.random().publicKey();
  await assert.rejects(
    accountWithHorizonFallback(
      address,
      async () => { throw new Error("RPC unavailable"); },
      async () => "1234",
    ),
    /RPC unavailable/,
  );
});

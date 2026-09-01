import assert from "node:assert/strict";
import test from "node:test";
import { registeredMandateIdHex } from "../lib/wallet/mandate-id";

test("V2 registration preserves the exact 32-byte contract-returned mandate id", () => {
  const returned = Buffer.from(Array.from({ length: 32 }, (_, index) => index));
  assert.equal(
    registeredMandateIdHex(returned),
    "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
  );
});

test("V2 registration rejects malformed contract return values", () => {
  assert.throws(() => registeredMandateIdHex(Buffer.alloc(31)), /invalid mandate id/);
  assert.throws(() => registeredMandateIdHex(Buffer.alloc(33)), /invalid mandate id/);
});

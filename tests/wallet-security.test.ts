import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import { createChallengeToken, createSessionToken, openToken, authenticationMessage, verifySignedChallengeMessage } from "../lib/wallet/security";

const secret = "test-session-secret-with-at-least-32-bytes";

test("signed session tokens verify only for the requested kind", () => {
  const { token, payload } = createSessionToken("GTEST", "testnet", secret, 1_000);
  assert.equal(openToken(token, secret, "session", 1_001)?.jti, payload.jti);
  assert.equal(openToken(token, secret, "challenge", 1_001), null);
});

test("token tampering and expiry fail closed", () => {
  const { token } = createSessionToken("GTEST", "testnet", secret, 1_000);
  const [body, signature] = token.split(".");
  const changedFirstByte = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
  assert.equal(openToken(`${body}.${changedFirstByte}`, secret, "session", 1_001), null);
  assert.equal(openToken(token, `${secret}!`, "session", 1_001), null);
  assert.equal(openToken(token, secret, "session", 4_601), null);
});

const origin = "https://reapp.live";

test("offline sign-in is readable and bound to wallet, website, network, nonce and expiry", () => {
  const key = Keypair.random();
  const { token, payload } = createChallengeToken(key.publicKey(), "mainnet", origin, secret, 2000);
  const challenge = openToken(token, secret, "challenge", 2001)!;
  const text = authenticationMessage(challenge);
  assert.match(text, /Sign in to ACKRATE/);
  assert.match(text, /does not approve spending/);
  assert.ok(text.includes(key.publicKey()) && text.includes(origin) && text.includes("Mainnet"));
  assert.ok(text.includes(payload.jti));
  const signature = key.signMessage(text).toString("base64");
  assert.doesNotThrow(() => verifySignedChallengeMessage(signature, challenge, origin));
  for (const changed of [
    { ...challenge, address: Keypair.random().publicKey() },
    { ...challenge, network: "testnet" as const },
    { ...challenge, origin: "https://other.test" },
    { ...challenge, jti: "0".repeat(32) },
    { ...challenge, exp: challenge.exp + 1 },
  ]) assert.throws(() => verifySignedChallengeMessage(signature, changed, origin));
  assert.throws(() => verifySignedChallengeMessage(signature, challenge, "https://other.test"));
  assert.equal(openToken(token, secret, "challenge", 2300), null);
});

test("raw signatures, changed messages, rogue keys and malformed encodings fail closed", () => {
  const key = Keypair.random();
  const { payload } = createChallengeToken(key.publicKey(), "mainnet", origin, secret);
  const text = authenticationMessage(payload);
  const signatures = [
    Keypair.random().signMessage(text).toString("base64"),
    key.signMessage(text + "!").toString("base64"),
    key.sign(Buffer.alloc(32)).toString("base64"),
    key.signMessage(text).toString("base64") + "\n",
    "not-a-signature", Buffer.alloc(63).toString("base64"),
  ];
  for (const signature of signatures) assert.throws(() => verifySignedChallengeMessage(signature, payload, origin));
  assert.throws(() => authenticationMessage({ ...payload, authentication: undefined }));
});

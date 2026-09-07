import assert from "node:assert/strict";
import test from "node:test";
import { Keypair, Networks, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { cliChallenge, cliTestOrigin, verifyCliChallenge } from "../lib/cli-test-auth";

const secret = "generated-fixture-session-secret-0123456789abcdef";
const now = 1_800_000_000;
function signedChallenge(network = Networks.PUBLIC) {
  const owner = Keypair.random();
  const challenge = cliChallenge(owner.publicKey(), secret, now);
  const transaction = TransactionBuilder.fromXDR(challenge.xdr, network) as Transaction;
  transaction.sign(owner);
  return { owner, challenge, transaction };
}

test("CLI ownership proof is Mainnet-bound, sequence zero, and verifies only the exact signed challenge", () => {
  const { owner, challenge, transaction } = signedChallenge();
  assert.equal(transaction.source, owner.publicKey());
  assert.equal(transaction.sequence, "0");
  assert.equal(transaction.operations.length, 1);
  assert.equal(transaction.operations[0].type, "manageData");
  assert.deepEqual(transaction.timeBounds, { minTime: String(now - 30), maxTime: String(now + 300) });
  const result = verifyCliChallenge(owner.publicKey(), challenge.challengeToken, transaction.toXDR(), secret, now);
  assert.match(result.nonce, /^[0-9a-f]{64}$/);
  assert.equal(result.expiresAt, now + 300);
});

test("ownership proof rejects unsigned, wrong signer, wrong network, wrong owner, and altered transaction", () => {
  const { owner, challenge, transaction } = signedChallenge();
  const rogue = Keypair.random();
  const wrongSigner = TransactionBuilder.fromXDR(challenge.xdr, Networks.PUBLIC) as Transaction;
  wrongSigner.sign(rogue);
  const wrongNetwork = TransactionBuilder.fromXDR(challenge.xdr, Networks.TESTNET) as Transaction;
  wrongNetwork.sign(owner);
  const changed = TransactionBuilder.cloneFrom(transaction, { fee: "101" }).build();
  changed.sign(owner);
  for (const value of [challenge.xdr, wrongSigner.toXDR(), wrongNetwork.toXDR(), changed.toXDR()]) {
    assert.throws(() => verifyCliChallenge(owner.publicKey(), challenge.challengeToken, value, secret, now), /expected ownership check/);
  }
  assert.throws(() => verifyCliChallenge(rogue.publicKey(), challenge.challengeToken, transaction.toXDR(), secret, now), /ownership check/);
});

test("ownership proof rejects tampered or oversized tokens/XDR, stale proof, and wrong session secret", () => {
  const { owner, challenge, transaction } = signedChallenge();
  const [payload, mac] = challenge.challengeToken.split(".");
  const alteredMac = `${mac[0] === "A" ? "B" : "A"}${mac.slice(1)}`;
  for (const token of ["", `${payload}.${alteredMac}`, `${payload}.${mac}.extra`, "a".repeat(2049)]) {
    assert.throws(() => verifyCliChallenge(owner.publicKey(), token, transaction.toXDR(), secret, now), /ownership check/);
  }
  assert.throws(() => verifyCliChallenge(owner.publicKey(), challenge.challengeToken, "a".repeat(12001), secret, now), /ownership check/);
  assert.throws(() => verifyCliChallenge(owner.publicKey(), challenge.challengeToken, transaction.toXDR(), secret, now + 301), /expired/);
  assert.throws(() => verifyCliChallenge(owner.publicKey(), challenge.challengeToken, transaction.toXDR(), `${secret}changed`, now), /ownership check/);
  assert.throws(() => cliChallenge(owner.publicKey(), "short", now), /configured session secret/);
  assert.throws(() => cliChallenge("not-an-account", secret, now), /valid Mainnet account/);
});

test("CLI test requests require the exact application origin and reject cross-site requests", () => {
  const origin = "https://ackrate.example";
  const make = (headers: Record<string, string>) => new Request(`${origin}/api/cli/test`, { headers });
  assert.doesNotThrow(() => cliTestOrigin(make({ origin, "sec-fetch-site": "same-origin" }), origin));
  const invalidHeaders: Record<string, string>[] = [{}, { origin: "https://attacker.example" }, { origin, "sec-fetch-site": "cross-site" }];
  for (const headers of invalidHeaders) {
    assert.throws(() => cliTestOrigin(make(headers), origin), /own application page/);
  }
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import { CLI_TEST_BURNER_OWNER, deriveCliTestBurner, loadCliTestBurner } from "../lib/cli-test-burner";

// Public SEP-5 conformance vectors, never credentials for the hosted test.
// https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0005.md
const mnemonic = "illness spike retreat truth genius clock brain pass fit cave bargain toe";
const account0 = "GDRXE2BQUC3AZNPVFSCEZ76NJ3WWL25FYFK6RGZGIEKWE4SOOHSUJUJ6";
const account1 = "GBAW5XGWORWVFE2XTJYDTLDHXTY2Q2MO73HYCGB3XMFMQ562Q2W2GJQX";
const account9 = "GBTVYYDIYWGUQUTKX6ZMLGSZGMTESJYJKJWAATGZGITA25ZB6T5REF44";

test("burner derivation matches the official SEP-5 primary and nonzero account vectors", () => {
  for (const [index, address] of [[0, account0], [1, account1], [9, account9]] as const) {
    const key = deriveCliTestBurner(mnemonic, address, index);
    assert.equal(key.publicKey(), address);
    const message = Buffer.from("synthetic burner derivation check");
    assert.equal(Keypair.fromPublicKey(address).verify(message, key.sign(message)), true);
  }
});

test("burner derivation accepts official 15-word and 24-word BIP39 vectors", () => {
  const vectors = [
    ["resource asthma orphan phone ice canvas fire useful arch jewel impose vague theory cushion top", "GAVXVW5MCK7Q66RIBWZZKZEDQTRXWCZUP4DIIFXCCENGW2P6W4OA34RH"],
    ["bench hurt jump file august wise shallow faculty impulse spring exact slush thunder author capable act festival slice deposit sauce coconut afford frown better", "GC3MMSXBWHL6CPOAVERSJITX7BH76YU252WGLUOM5CJX3E7UCYZBTPJQ"],
  ];
  for (const [phrase, address] of vectors) assert.equal(deriveCliTestBurner(phrase, address, 0).publicKey(), address);
});

test("burner lookup finds an exact expected account without assuming the primary index", () => {
  assert.equal(deriveCliTestBurner(mnemonic, account9).publicKey(), account9);
  assert.throws(() => deriveCliTestBurner(mnemonic, account9, 0), /does not match the approved account/);
  assert.throws(() => deriveCliTestBurner(mnemonic, CLI_TEST_BURNER_OWNER), /does not match the approved account/);
});

test("burner lookup includes account 19 but never searches account 20", () => {
  // Independently cross-checked using SEP-5's linked stellar-hd-wallet 0.0.10 implementation.
  const account19 = "GCODYLFQ43GLR5ZBDVLH274NJL6FSER6ERWOREEYVOIKZJZVGMEC5B4R";
  const account20 = "GCJQ26ZS2SPUKZEXNFHWH2S2ZOKXJZ43DFSMLGE3QDQAYJJZWQ75NCDQ";
  assert.equal(deriveCliTestBurner(mnemonic, account19, 19).publicKey(), account19);
  assert.equal(deriveCliTestBurner(mnemonic, account19).publicKey(), account19);
  assert.throws(() => deriveCliTestBurner(mnemonic, account20), /does not match the approved account/);
});

test("burner parsing normalizes whitespace and one matching pair of outer quotes only", () => {
  const spaced = mnemonic.split(" ").join(" \t\n ");
  for (const phrase of [` \t${mnemonic}\n`, `"${mnemonic}"`, ` '${spaced}' `, ` \n" ${spaced} "\t`]) {
    assert.equal(deriveCliTestBurner(phrase, account0, 0).publicKey(), account0);
  }
});

test("burner parsing rejects assignments and malformed or nested quotation", () => {
  for (const phrase of [
    `ACKRATE_CLI_BURNER_MNEMONIC=${mnemonic}`, `ACKRATE_CLI_BURNER_MNEMONIC="${mnemonic}"`,
    `"${mnemonic}'`, `'${mnemonic}`, `${mnemonic}"`, `"'${mnemonic}'"`, `"${mnemonic}" extra`,
  ]) assert.throws(() => deriveCliTestBurner(phrase, account0, 0), /format is invalid/);
});

test("burner parsing requires the English word list, valid length and checksum, and original word order", () => {
  for (const phrase of [
    "abandon ".repeat(12).trim(), mnemonic.replace("toe", "unknownword"), mnemonic.toUpperCase(),
    mnemonic.split(" ").reverse().join(" "), mnemonic.split(" ").slice(1).join(" "), "a ".repeat(24).trim(),
  ]) assert.throws(() => deriveCliTestBurner(phrase, account0, 0), /valid English BIP39 mnemonic/);
});

test("burner parsing rejects oversized and non-string input without echoing it", () => {
  for (const input of [undefined, null, {}, 123, "", "a".repeat(1025)]) {
    assert.throws(() => deriveCliTestBurner(input as string, account0, 0), /format is invalid/);
  }
});

test("burner derivation rejects missing or invalid expected accounts and unbounded indices", () => {
  for (const address of [undefined, "", mnemonic, ` ${account0}`, "C".repeat(56)]) {
    assert.throws(() => deriveCliTestBurner(mnemonic, address as string, 0), /must be a Stellar G-account/);
  }
  for (const index of [-1, 20, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER, "0", null]) {
    assert.throws(() => deriveCliTestBurner(mnemonic, account0, index as number), /integer from 0 through 19/);
  }
  // The upper bound is a valid index, but cannot silently fall back to account zero.
  assert.throws(() => deriveCliTestBurner(mnemonic, account0, 19), /does not match the approved account/);
});

test("burner environment loader reads only its named secret and cannot override the approved owner", () => {
  const reads: string[] = [];
  const env = new Proxy({ ACKRATE_CLI_BURNER_MNEMONIC: mnemonic, ACKRATE_CLI_BURNER_OWNER: account0 }, {
    get(target, property) {
      reads.push(String(property));
      if (property !== "ACKRATE_CLI_BURNER_MNEMONIC") throw new Error("unexpected environment read");
      return target.ACKRATE_CLI_BURNER_MNEMONIC;
    },
  });
  assert.equal(CLI_TEST_BURNER_OWNER, "GCHNDR6APAMBLIAYTQRCKDHQRBI3E2V5GE6KIRUBXROLHRS46NF5YDVV");
  assert.throws(() => loadCliTestBurner(env), /does not match the approved account/);
  assert.deepEqual(reads, ["ACKRATE_CLI_BURNER_MNEMONIC"]);
  for (const value of [undefined, "", " \n\t "]) {
    assert.throws(() => loadCliTestBurner({ ACKRATE_CLI_BURNER_MNEMONIC: value }), /not configured/);
  }
});

test("burner errors are static and do not propagate secret-bearing environment errors or log input", (context) => {
  const logged: unknown[][] = [];
  for (const method of ["log", "warn", "error", "info", "debug"] as const) {
    context.mock.method(console, method, (...args: unknown[]) => { logged.push(args); });
  }
  const attempts = [
    () => deriveCliTestBurner(`NAME="${mnemonic}"`, account0),
    () => deriveCliTestBurner(mnemonic, CLI_TEST_BURNER_OWNER),
    () => loadCliTestBurner(new Proxy({}, { get() { throw new Error(mnemonic); } })),
  ];
  for (const attempt of attempts) {
    assert.throws(attempt, (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(String(error.stack).includes(mnemonic), false);
      assert.equal(error.cause, undefined);
      return true;
    });
  }
  assert.deepEqual(logged, []);
});

test("burner derivation replaces dependency exceptions with a static error", (context) => {
  context.mock.method(Keypair, "fromRawEd25519Seed", () => { throw new Error(mnemonic); });
  assert.throws(() => deriveCliTestBurner(mnemonic, account0, 0), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, "Burner account derivation failed.");
    assert.equal(String(error.stack).includes(mnemonic), false);
    assert.equal(error.cause, undefined);
    return true;
  });
});

test("burner module keeps a Node-only import boundary and is not marked as client code", () => {
  const source = readFileSync(new URL("../lib/cli-test-burner.ts", import.meta.url), "utf8");
  assert.match(source, /from "node:crypto"/);
  assert.doesNotMatch(source, /["']use client["']/);
});

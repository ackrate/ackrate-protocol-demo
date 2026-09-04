import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import type { PaymentRequired, PaymentRequirements } from "@x402/fetch";
import {
  AGENT402_AMOUNT_ATOMIC,
  AGENT402_NETWORK,
  AGENT402_SEARCH_URL,
  normalizeAgent402SearchInput,
  normalizeResearchQuestion,
  selectAgent402StellarRequirement,
} from "../lib/wallet/agent402";

const ASSET = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";

function requirement(overrides: Partial<PaymentRequirements> = {}): PaymentRequirements {
  return {
    scheme: "exact",
    network: AGENT402_NETWORK,
    asset: ASSET,
    amount: AGENT402_AMOUNT_ATOMIC,
    payTo: Keypair.random().publicKey(),
    maxTimeoutSeconds: 60,
    extra: { areFeesSponsored: true },
    ...overrides,
  };
}

function challenge(accepts: PaymentRequirements[]): PaymentRequired {
  return {
    x402Version: 2,
    resource: {
      url: AGENT402_SEARCH_URL,
      description: "Agent402 web search",
      mimeType: "application/json",
    },
    accepts,
  };
}

test("Agent402 research accepts only one exact sponsored Stellar Mainnet USDC option", () => {
  const expected = requirement();
  assert.equal(selectAgent402StellarRequirement(challenge([expected]), ASSET), expected);

  for (const invalid of [
    requirement({ network: "eip155:8453" }),
    requirement({ asset: "wrong-asset" }),
    requirement({ amount: "1" }),
    requirement({ extra: { areFeesSponsored: false } }),
    requirement({ payTo: "not-a-stellar-account" }),
  ]) {
    assert.throws(
      () => selectAgent402StellarRequirement(challenge([invalid]), ASSET),
      /one exact sponsored Stellar Mainnet USDC payment option/,
    );
  }

  assert.throws(
    () => selectAgent402StellarRequirement(challenge([expected, requirement()]), ASSET),
    /one exact sponsored Stellar Mainnet USDC payment option/,
  );
});

test("Agent402 research rejects a changed x402 version or resource before payment", () => {
  const expected = requirement();
  assert.throws(
    () => selectAgent402StellarRequirement({ ...challenge([expected]), x402Version: 1 }, ASSET),
    /unsupported x402 version/,
  );
  assert.throws(
    () => selectAgent402StellarRequirement({
      ...challenge([expected]),
      resource: { url: "https://agent402.tools/api/pdf", description: "wrong route", mimeType: "application/json" },
    }, ASSET),
    /unexpected resource/,
  );
});

test("research questions are normalized and strictly bounded", () => {
  assert.equal(normalizeResearchQuestion("  What   is\nSolana?  "), "What is Solana?");
  assert.throws(() => normalizeResearchQuestion("  "), /between 3 and 400/);
  assert.throws(() => normalizeResearchQuestion("x".repeat(401)), /between 3 and 400/);
});

test("Agent402 web search accepts only the published query parameters", () => {
  assert.deepEqual(normalizeAgent402SearchInput({ q: " Solana ", count: "5", freshness: "pw" }), {
    q: "Solana",
    count: 5,
    freshness: "pw",
  });
  assert.throws(() => normalizeAgent402SearchInput({ q: "Solana", count: 21 }), /inputs are invalid/);
  assert.throws(() => normalizeAgent402SearchInput({ q: "Solana", madeUp: true }), /inputs are invalid/);
});

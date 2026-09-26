import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const report = readFileSync(new URL("../docs/security-evidence.md", import.meta.url), "utf8");

const contract = "CCLZEBJXG4YVJEPBCR5F27N733BCK5HQJWZZGB3K54JVODY3VAGP4HWR";
const authority = "GCIURCX7JHEKQLRTW6RDZU7OJUVCDM7WWNQPIKRERIHQOHSLW7UY7TXG";
const usdc = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";

test("security report retains the reproducible gate and its limits", () => {
  assert.match(report, /gatecheck-contracts.sh/);
  assert.match(report, /builds the optimized WASM before executing it/);
  assert.match(report, /accepted host-only maintenance advisory/);
  assert.match(report, /not described as remediated/);
  assert.match(report, /Source-to-chain proof is separate from an explorer verification badge/);
});

test("security report preserves the canonical read-only authority check", () => {
  assert.ok(report.includes(`--contract-id ${contract}`));
  assert.ok(report.includes(`--source ${authority}`));
  assert.ok(report.includes(`--admin ${authority}`));
  assert.ok(report.includes(`--initial-asset ${usdc}`));
  assert.ok(report.includes("--rpc-url https://mainnet.sorobanrpc.com"));
  assert.ok(report.includes(`https://horizon.stellar.org/accounts/${authority}`));
  assert.ok(report.includes("bash scripts/check-mainnet-v2-authority.sh"));
  assert.doesNotMatch(report, /tx send|prepare-deploy|prepare-upload|secret-key|sign-with-key/);
});

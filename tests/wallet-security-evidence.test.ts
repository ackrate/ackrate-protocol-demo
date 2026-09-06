import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SECURITY_EVIDENCE_CARDS } from "../app/security/SecurityEvidenceClient";

const contract = "CCLZEBJXG4YVJEPBCR5F27N733BCK5HQJWZZGB3K54JVODY3VAGP4HWR";
const authority = "GCIURCX7JHEKQLRTW6RDZU7OJUVCDM7WWNQPIKRERIHQOHSLW7UY7TXG";
const usdc = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";

test("security behavior reproduction builds the optimized artifact before testing it", () => {
  const card = SECURITY_EVIDENCE_CARDS.find(({ id }) => id === "behavior")!;
  assert.equal(card.command, "./scripts/gatecheck-contracts.sh");
  assert.match(card.boundary, /builds the optimized WASM before executing it/);
});

test("security live-state reproduction includes every required public parameter", () => {
  const command = SECURITY_EVIDENCE_CARDS.find(({ id }) => id === "mainnet")!.command;
  assert.match(command, /^set -euo pipefail/);
  assert.ok(command.includes(`--contract-id ${contract}`));
  assert.ok(command.includes(`--source ${authority}`));
  assert.ok(command.includes(`--admin ${authority}`));
  assert.ok(command.includes(`--initial-asset ${usdc}`));
  assert.ok(command.includes("--rpc-url https://mainnet.sorobanrpc.com"));
  assert.ok(command.includes(`https://horizon.stellar.org/accounts/${authority}`));
  assert.ok(command.includes("(.signers | length) == 3"));
  assert.ok(command.includes('all(.signers[]; .type == "ed25519_public_key" and .weight == 1)'));
  for (const threshold of ["low", "med", "high"]) {
    assert.ok(command.includes(`.thresholds.${threshold}_threshold == 2`));
  }
  assert.doesNotMatch(command, /tx send|prepare-deploy|prepare-upload|secret-key|sign-with-key/);
});

test("security evidence distinguishes a scoped advisory exception and source proof from badges", () => {
  const source = SECURITY_EVIDENCE_CARDS.find(({ id }) => id === "source")!;
  assert.match(source.boundary, /accepted host-only maintenance advisory/);
  assert.match(source.boundary, /not described as remediated/);
  const live = SECURITY_EVIDENCE_CARDS.find(({ id }) => id === "mainnet")!;
  assert.ok(live.links.some(({ href }) => href.endsWith("/docs/mainnet-v2-source-verification.md")));
  assert.ok(live.links.some(({ href }) => href.endsWith(`/public/contract/${contract}`)));
  assert.ok(source.links.some(({ href }) => href.endsWith("/docs/mainnet-v2-security-scan-report.md")));
  const attacks = SECURITY_EVIDENCE_CARDS.find(({ id }) => id === "attacks")!;
  assert.ok(attacks.links.some(({ href }) => href.endsWith("/docs/mainnet-v2-threat-model.md")));
  assert.ok(attacks.links.some(({ href }) => href.endsWith("/docs/mainnet-v2-data-flow.md")));
});

test("security page preserves command line breaks and labels replay as recorded evidence", () => {
  const source = readFileSync(new URL("../app/security/SecurityEvidenceClient.tsx", import.meta.url), "utf8");
  assert.match(source, /<pre[^>]+><code>\{card\.command\}<\/code><\/pre>/);
  assert.match(source, /readable view of recorded gate output, not a browser-side substitute/);
  assert.match(source, /Source-to-chain proof is separate from an explorer verification badge/);
});

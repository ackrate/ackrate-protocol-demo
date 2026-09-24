import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { runLocalTestnetDemo } from "../shared/local-demo.mjs";
import { createDemoLogger } from "../shared/presenter.mjs";
import { createScenario } from "../scenario/scenario.mjs";
import { EXPECTED_SCENARIO_METADATA } from "../scenario/metadata.mjs";

export const scenario = createScenario(EXPECTED_SCENARIO_METADATA);
export const starter = Object.freeze({
  "id": "compute-broker",
  "negativePathId": "compute-tier-over-ceiling",
  "negativePathOutcome": "The deterministic hash function rejects an iteration count above 512 before hashing begins.",
  "paidResource": "GET /compute/sha256-chain/:tier/:seedId",
  "summary": "Buy a bounded cryptographic workload and verify the returned digest independently on the consumer side.",
  "title": "Verifiable Compute Broker"
});

export async function runDemo({ stateRoot = resolve(".ackrate"), onEvent } = {}) {
  return runLocalTestnetDemo({ scenario, stateRoot, onEvent });
}

async function main() {
  // Reject unexpected arguments before any setup or network action.
  if (process.argv.length > 2) throw new Error("Run npm run demo without arguments; see README.md");
  const presenter = createDemoLogger();
  const result = await runDemo({ onEvent: presenter.onEvent });
  presenter.finish(result);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Stopped: ${error instanceof Error ? error.message : String(error)}`);
    console.error("Your recovery evidence is still in .ackrate/. Read README.md before resetting it.");
    process.exitCode = 1;
  });
}

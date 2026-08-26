import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { runLocalTestnetDemo } from "../shared/local-demo.mjs";
import { createBeginnerDemoPresenter } from "../shared/presenter.mjs";
import { createScenario } from "../scenario/scenario.mjs";
import { EXPECTED_SCENARIO_METADATA } from "../scenario/metadata.mjs";

export const scenario = createScenario(EXPECTED_SCENARIO_METADATA);
export const starter = Object.freeze({
  "id": "data-owner-gateway",
  "negativePathId": "dataset-owner-mismatch",
  "negativePathOutcome": "A dataset mapped to another owner is rejected by the endpoint's owner mapping before a payment challenge.",
  "paidResource": "GET /datasets/:ownerId/:datasetId",
  "summary": "The live fixture merchant serves one owner-alpha dataset endpoint and receives payment when the agent unlocks that dataset.",
  "title": "Data Owner Gateway"
});

function printHelp() {
  console.log(`ACKRATE starter: ${starter.title}

Usage:
  npm run check  # deterministic offline business vectors
  npm run demo   # guided consumer + fulfillment demo on Stellar testnet

The demo explains each 402, contract payment, 200 response, and safety check in
plain English. It creates temporary testnet keys, stores private recovery data
under .ackrate/, and never requests a wallet or mainnet secret.

Advanced: ACKRATE_VERBOSE=1 npm run demo also shows developer event names.`);
}

export async function runDemo({ stateRoot = resolve(".ackrate"), onEvent } = {}) {
  return runLocalTestnetDemo({ scenario, stateRoot, onEvent });
}

async function main() {
  const argumentsList = process.argv.slice(2);
  if (argumentsList.length === 1 && ["--help", "-h"].includes(argumentsList[0])) {
    printHelp();
    return;
  }
  if (argumentsList.length !== 0) throw new Error("demo accepts only --help");
  const presenter = createBeginnerDemoPresenter({ scenario, starter });
  const result = await runDemo({ onEvent: presenter.onEvent });
  presenter.finish(result);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error("\nThe demo stopped safely before it could finish.");
    console.error(`Reason: ${error instanceof Error ? error.message : String(error)}`);
    console.error("Your recovery evidence is still in .ackrate/. Read README.md before resetting it.");
    process.exitCode = 1;
  });
}

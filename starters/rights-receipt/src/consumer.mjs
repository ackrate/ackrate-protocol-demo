import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { runLocalTestnetDemo } from "../shared/local-demo.mjs";
import { createBeginnerDemoPresenter } from "../shared/presenter.mjs";
import { createScenario } from "../scenario/scenario.mjs";
import { EXPECTED_SCENARIO_METADATA } from "../scenario/metadata.mjs";

export const scenario = createScenario(EXPECTED_SCENARIO_METADATA);
export const starter = Object.freeze({
  "id": "rights-receipt",
  "negativePathId": "license-version-rebinding",
  "negativePathOutcome": "Payment for another asset or license version cannot unlock the requested content.",
  "paidResource": "GET /licenses/:assetId/:licenseVersion",
  "summary": "Purchase an exact asset-license version and receive content plus a receipt containing content and terms hashes and the settlement transaction hash.",
  "title": "Rights Receipt"
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

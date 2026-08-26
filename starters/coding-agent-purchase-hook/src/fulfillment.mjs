import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  loadDefaultEnvFiles,
  parseNamedArgs,
  validateExactOrigin,
  validateMerchant,
  validatePort,
} from "../shared/config.mjs";
import { startFulfillmentServer } from "../shared/fulfillment.mjs";
import { loadOrCreateChallengeSecret } from "../shared/private-secret.mjs";
import { createScenario } from "../scenario/scenario.mjs";
import { EXPECTED_SCENARIO_METADATA } from "../scenario/metadata.mjs";

export const scenario = createScenario(EXPECTED_SCENARIO_METADATA);

function printHelp() {
  console.log(`ACKRATE ${scenario.id} fulfillment

Usage:
  ACKRATE_MERCHANT=G... npm run fulfillment

Optional: PORT, ACKRATE_PUBLIC_ORIGIN, ACKRATE_CHALLENGE_SECRET, ACKRATE_STATE_ROOT.
The server binds only to 127.0.0.1 and keeps paid-delivery evidence under .ackrate/.`);
}

export async function runFulfillment({
  merchant,
  port = 4021,
  publicOrigin,
  challengeSecret,
  stateRoot = resolve(".ackrate"),
} = {}) {
  const checkedMerchant = validateMerchant(merchant, "merchant");
  const checkedPort = validatePort(port);
  const origin = validateExactOrigin(publicOrigin ?? `http://127.0.0.1:${checkedPort}`);
  const secret = challengeSecret ?? await loadOrCreateChallengeSecret(resolve(stateRoot, "challenge-secret"));
  return startFulfillmentServer({
    host: "127.0.0.1",
    port: checkedPort,
    publicOrigin: origin,
    merchant: checkedMerchant,
    challengeSecret: secret,
    routePattern: scenario.routePattern,
    amount: scenario.amount,
    preflight: scenario.preflight,
    fulfill: scenario.fulfill,
    configureFreeRoutes: scenario.configureFreeRoutes,
    stateRoot,
  });
}

async function main() {
  await loadDefaultEnvFiles();
  const flags = parseNamedArgs(process.argv.slice(2), ["merchant", "origin", "port"]);
  if (flags.help) {
    printHelp();
    return;
  }
  const handle = await runFulfillment({
    merchant: flags.merchant ?? process.env.ACKRATE_MERCHANT,
    port: flags.port ?? process.env.PORT ?? "4021",
    publicOrigin: flags.origin ?? process.env.ACKRATE_PUBLIC_ORIGIN,
    challengeSecret: process.env.ACKRATE_CHALLENGE_SECRET,
    stateRoot: resolve(process.env.ACKRATE_STATE_ROOT ?? ".ackrate"),
  });
  console.log(`ACKRATE fulfillment listening at ${handle.origin}`);
  console.log(`Paid route: GET ${scenario.routePattern}`);
  const stop = () => handle.close().finally(() => process.exit(0));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`ACKRATE fulfillment stopped safely: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

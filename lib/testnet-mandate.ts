import { Buffer } from "node:buffer";
import { ackrate, type CreateIntentMandateInput } from "@ackrate/core";

/** Round-trip the registry's confirmed storage key with the demo's public inputs. */
export type DemoMandateInputs = CreateIntentMandateInput & { registeredMandateId: string };

export function restoreTestnetMandate(inputs: DemoMandateInputs) {
  if (!/^[0-9a-f]{64}$/.test(inputs.registeredMandateId ?? "")) {
    throw new Error("Confirmed Testnet mandate ID is required. Set up a fresh demo mandate.");
  }
  const mandate = ackrate.createIntentMandate(inputs, ackrate.testnet);
  mandate.credentialHash = mandate.id;
  mandate.id = inputs.registeredMandateId;
  mandate.idBuffer = Buffer.from(inputs.registeredMandateId, "hex");
  return mandate;
}

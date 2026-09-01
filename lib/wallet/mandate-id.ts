import { Buffer } from "buffer";

export function registeredMandateIdHex(value: Uint8Array): string {
  const bytes = Buffer.from(value);
  if (bytes.length !== 32) throw new Error("MandateRegistry returned an invalid mandate id");
  return bytes.toString("hex");
}

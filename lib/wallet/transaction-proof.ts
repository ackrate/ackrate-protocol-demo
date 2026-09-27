import { Buffer } from "buffer";
import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";

/** A wallet may add a signature, but must not alter any transaction field. */
export function validateSignedTransaction(original: string, signed: unknown, address: string, network: string): string {
  if (typeof signed !== "string" || signed.length > 200_000) throw new Error("Freighter did not return a signed transaction.");
  const expected = TransactionBuilder.fromXDR(original, network);
  const actual = TransactionBuilder.fromXDR(signed, network);
  if (!expected.hash().equals(actual.hash())) throw new Error("Freighter changed the requested transaction. Nothing was submitted.");
  const key = Keypair.fromPublicKey(address);
  if (!actual.signatures.some((signature) => {
    try { return key.verify(actual.hash(), Buffer.from(signature.signature())); } catch { return false; }
  })) throw new Error("The returned transaction was not signed by the connected account.");
  return signed;
}

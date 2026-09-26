import { Buffer } from "buffer";
import { WalletConnectionError } from "./connection-diagnostics";
import { Keypair, Networks, StrKey, TransactionBuilder } from "@stellar/stellar-sdk";

export const MOBILE_METHODS = ["stellar_signXDR", "stellar_signMessage"];
export interface StellarSession {
  expiry: number;
  namespaces: Record<string, { accounts: string[]; methods: string[] }>;
}

export function stellarChain(networkPassphrase: string): string {
  if (networkPassphrase === Networks.PUBLIC) return "stellar:pubnet";
  if (networkPassphrase === Networks.TESTNET) return "stellar:testnet";
  throw new Error("Freighter Mobile does not support this network.");
}

/** Do not assume that requested chains or methods were approved by the wallet. */
export function mobileSessionAddress(session: StellarSession | undefined, chain: string, now = Date.now()): string {
  if (!session || !Number.isFinite(session.expiry) || session.expiry * 1000 <= now) {
    throw new WalletConnectionError("session", "invalid", "The mobile wallet session has expired. Connect again.");
  }
  const namespace = session.namespaces[chain] ?? session.namespaces.stellar;
  if (!namespace || !MOBILE_METHODS.every((method) => namespace.methods.includes(method))) {
    throw new WalletConnectionError("session", "invalid", "Freighter Mobile must approve offline sign-in and transaction signing. Update the app if these methods are unavailable, then reconnect.");
  }
  const accounts = [...new Set(namespace.accounts.filter((account) => account.startsWith(`${chain}:`)))];
  const address = accounts.length === 1 ? accounts[0]!.slice(chain.length + 1) : "";
  if (!StrKey.isValidEd25519PublicKey(address)) {
    throw new WalletConnectionError("session", "mismatch", "Choose one Freighter account on the network shown here, then reconnect.");
  }
  return address;
}

/** A wallet may add a signature, but must not alter any transaction field. */
export function validateMobileTransaction(original: string, signed: unknown, address: string, network: string): string {
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

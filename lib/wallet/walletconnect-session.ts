import { WalletConnectionError } from "./connection-diagnostics";
import { Networks, StrKey } from "@stellar/stellar-sdk";

export { validateSignedTransaction as validateMobileTransaction } from "./transaction-proof";

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

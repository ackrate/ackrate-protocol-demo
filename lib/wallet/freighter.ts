"use client";

import {
  addToken,
  getAddress,
  getNetworkDetails,
  isAllowed,
  requestAccess,
  signTransaction,
} from "@stellar/freighter-api";
import { StrKey } from "@stellar/stellar-sdk";
import type { SignTransaction } from "@stellar/stellar-sdk/contract";

export interface WalletSigner {
  publicKey: string;
  signTransaction: SignTransaction;
}

function message(error: { message?: string } | undefined, fallback: string): string {
  return error?.message?.trim() || fallback;
}

export async function connectFreighter(networkPassphrase: string): Promise<string> {
  const access = await requestAccess();
  if (access.error) throw new Error(message(access.error, "Freighter connection was rejected"));
  if (!StrKey.isValidEd25519PublicKey(access.address)) {
    throw new Error("Freighter did not return a valid Stellar account");
  }
  const network = await getNetworkDetails();
  if (network.error) throw new Error(message(network.error, "Freighter network could not be read"));
  if (network.networkPassphrase !== networkPassphrase) {
    throw new Error("Switch Freighter to the network shown on this page, then connect again");
  }
  return access.address;
}

export function freighterSigner(address: string, networkPassphrase: string): WalletSigner {
  if (!StrKey.isValidEd25519PublicKey(address)) throw new Error("Freighter signer requires a valid G-address");
  return {
    publicKey: address,
    signTransaction: async (xdr, options) => {
      if (options?.address && options.address !== address) {
        return {
          signedTxXdr: "",
          signerAddress: address,
          error: { message: "Freighter account does not match the requested signer", code: -1 },
        };
      }
      if (options?.networkPassphrase && options.networkPassphrase !== networkPassphrase) {
        return {
          signedTxXdr: "",
          signerAddress: address,
          error: { message: "Freighter network does not match the configured network", code: -1 },
        };
      }
      const signed = await signTransaction(xdr, { address, networkPassphrase });
      if (signed.error) {
        return {
          signedTxXdr: "",
          signerAddress: signed.signerAddress || address,
          error: { message: message(signed.error, "Freighter signing was rejected"), code: -1 },
        };
      }
      if (!signed.signedTxXdr) {
        return {
          signedTxXdr: "",
          signerAddress: signed.signerAddress || address,
          error: { message: "Freighter did not return a signed transaction", code: -1 },
        };
      }
      return { signedTxXdr: signed.signedTxXdr, signerAddress: signed.signerAddress || address };
    },
  };
}

export async function signFreighterTransaction(
  xdr: string,
  address: string,
  networkPassphrase: string,
): Promise<string> {
  const signed = await signTransaction(xdr, { address, networkPassphrase });
  if (signed.error) throw new Error(message(signed.error, "Freighter signing was rejected"));
  if (signed.signerAddress && signed.signerAddress !== address) {
    throw new Error("Freighter returned a different signer account");
  }
  if (!signed.signedTxXdr) throw new Error("Freighter did not return a signed transaction");
  return signed.signedTxXdr;
}

export async function addTokenToFreighter(contractId: string, networkPassphrase: string): Promise<void> {
  const result = await addToken({ contractId, networkPassphrase });
  if (result.error) throw new Error(message(result.error, "Freighter could not add USDC"));
  if (result.contractId !== contractId) throw new Error("Freighter returned a different token contract");
}

/**
 * Silent check used on load: is this site still allowed in Freighter, and
 * does Freighter's selected account still match the verified session? Never
 * prompts. Returns "unknown" when Freighter is unavailable so a missing
 * extension never signs anyone out.
 */
export async function freighterSessionState(expectedAddress: string): Promise<"matches" | "disconnected" | "different" | "unknown"> {
  try {
    const allowed = await isAllowed();
    if (allowed.error) return "unknown";
    if (!allowed.isAllowed) return "disconnected";
    const current = await getAddress();
    if (current.error || !current.address) return "unknown";
    return current.address === expectedAddress ? "matches" : "different";
  } catch {
    return "unknown";
  }
}

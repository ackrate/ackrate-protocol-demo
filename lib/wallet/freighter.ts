"use client";

import {
  addToken,
  getAddress,
  getNetworkDetails,
  isAllowed,
  isConnected,
  requestAccess,
  signTransaction,
  signMessage,
} from "@stellar/freighter-api";
import { Buffer } from "buffer";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import type { SignTransaction } from "@stellar/stellar-sdk/contract";
import { connectionRequest, isMobileBrowser, recordConnectionEvent, WalletConnectionError } from "./connection-diagnostics";

export interface WalletSigner {
  publicKey: string;
  signTransaction: SignTransaction;
}

function message(error: { message?: string } | undefined, fallback: string): string {
  return error?.message?.trim() || fallback;
}

let connectionPending = false;
export async function connectFreighter(networkPassphrase: string, onStatus?: (status: string) => void): Promise<string> {
  if (connectionPending) throw new WalletConnectionError("access", "failed", "A connection request is already pending. Check Freighter before trying again.");
  connectionPending = true;
  try {
    if (isMobileBrowser()) {
      recordConnectionEvent("detect", "unavailable");
      throw new WalletConnectionError("detect", "unavailable", "Freighter Mobile needs WalletConnect. This release supports the desktop extension only; mobile connection is not configured yet.");
    }
    onStatus?.("Checking for the Freighter extension…");
    const detected = await connectionRequest("detect", isConnected, 5_000);
    if (detected.error || !detected.isConnected) {
      recordConnectionEvent("detect", "unavailable", detected.error?.code);
      throw new WalletConnectionError("detect", "unavailable", "Freighter was not detected. Install or enable its desktop extension, unlock it, then refresh this page.");
    }
    recordConnectionEvent("detect", "ok");
    onStatus?.("Approve the connection in Freighter. If no prompt appears, open the extension.");
    const access = await connectionRequest("access", requestAccess, 60_000);
    if (access.error) {
      recordConnectionEvent("access", "rejected", access.error.code);
      throw new WalletConnectionError("access", "rejected", "Freighter did not approve the connection. Open and unlock the extension, then try again.");
    }
    if (!StrKey.isValidEd25519PublicKey(access.address)) {
      recordConnectionEvent("access", "invalid");
      throw new WalletConnectionError("access", "invalid", "Freighter did not return a valid Stellar account. Open the extension and select a wallet.");
    }
    recordConnectionEvent("access", "ok");
    onStatus?.("Checking the wallet network…");
    const network = await connectionRequest("network", getNetworkDetails, 10_000);
    if (network.error) {
      recordConnectionEvent("network", "failed", network.error.code);
      throw new WalletConnectionError("network", "failed", "Freighter's network could not be read. Check the extension and try again.");
    }
    if (network.networkPassphrase !== networkPassphrase) {
      recordConnectionEvent("network", "mismatch");
      throw new WalletConnectionError("network", "mismatch", "Switch Freighter to the network shown on this page, then connect again.");
    }
    recordConnectionEvent("network", "ok");
    return access.address;
  } finally { connectionPending = false; }
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

/** Offline SEP-53 proof of key possession; deliberately no transaction-signing fallback. */
export async function signFreighterMessage(text: string, address: string, networkPassphrase: string): Promise<string> {
  const signed = await connectionRequest("message", () => signMessage(text, { address, networkPassphrase }), 90_000);
  if (signed.error) {
    recordConnectionEvent("message", "rejected", signed.error.code);
    throw new WalletConnectionError("message", "rejected", "Freighter did not sign the message. Check the extension; update Freighter if message signing is unavailable.");
  }
  if (signed.signerAddress !== address) {
    recordConnectionEvent("message", "mismatch");
    throw new Error("Freighter returned a different signer account");
  }
  if (!signed.signedMessage) {
    recordConnectionEvent("message", "invalid");
    throw new Error("Freighter did not return an offline signature");
  }
  const bytes = typeof signed.signedMessage === "string"
    ? Buffer.from(signed.signedMessage, "base64") : Buffer.from(signed.signedMessage);
  if (bytes.length !== 64 || !Keypair.fromPublicKey(address).verifyMessage(text, bytes)) {
    recordConnectionEvent("message", "invalid");
    throw new Error("Freighter did not sign the exact sign-in message");
  }
  recordConnectionEvent("message", "ok");
  return bytes.toString("base64");
}

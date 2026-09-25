"use client";

import type { UniversalProvider } from "@walletconnect/universal-provider";
import type { AppKit } from "@reown/appkit/core";
import { connectionRequest, recordConnectionEvent, WalletConnectionError } from "./connection-diagnostics";
import { MOBILE_METHODS, mobileSessionAddress, stellarChain, validateMobileTransaction } from "./walletconnect-session";

const TRANSPORT_KEY = "reapp:wallet-transport";
// Public project identifier. Reown's dashboard must allowlist the deployment origins.
export const mobileWalletConfigured = () => /^[a-f0-9]{32}$/i.test(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "");
let selected = false;
let provider: InstanceType<typeof UniversalProvider> | undefined;
let modal: AppKit | undefined;
let initialization: Promise<void> | undefined;
let disconnected = false;
let pairingAbandoned = false;

export function usesMobileWallet(): boolean {
  try { return selected || localStorage.getItem(TRANSPORT_KEY) === "walletconnect"; } catch { return selected; }
}
export function selectMobileWallet(value: boolean): void {
  selected = value;
  try { if (value) localStorage.setItem(TRANSPORT_KEY, "walletconnect"); else localStorage.removeItem(TRANSPORT_KEY); } catch { /* In-memory connection still works. */ }
}

async function initialize(): Promise<void> {
  if (!mobileWalletConfigured()) throw new WalletConnectionError("config", "unavailable",
    "Freighter Mobile is not enabled on this deployment yet. Share the connection report so the site operator can finish WalletConnect setup.");
  if (initialization) return initialization;
  initialization = (async () => {
    const [{ UniversalProvider }, { createAppKit }, { mainnet }] = await Promise.all([
      import("@walletconnect/universal-provider"), import("@reown/appkit/core"), import("@reown/appkit/networks"),
    ]);
    const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!;
    provider = await UniversalProvider.init({ projectId, telemetryEnabled: false,
      metadata: { name: "REAPP", description: "Stellar payments powered by Ackrate SDK", url: location.origin,
        icons: [`${location.origin}/ackrate-arch.svg`] },
    });
    // Freighter's canonical integration uses this required placeholder with manual
    // control: only the Stellar namespace below is requested from the wallet.
    modal = createAppKit({ projectId, networks: [mainnet], universalProvider: provider, manualWCControl: true,
      allWallets: "HIDE",
      // AppKit filters Explorer results by its placeholder EVM network. Keep the
      // Stellar wallet explicit so phones get its native handoff, not only a QR.
      // Verified against Freighter's public WalletConnect directory listing.
      customWallets: [{
        id: "freighter-mobile", name: "Freighter", homepage: "https://www.freighter.app/",
        image_url: "https://api.web3modal.org/getWalletImage/114aa875-487a-4d86-5c87-6f22f4559100",
        mobile_link: "freighterwallet://wc-redirect",
        app_store: "https://apps.apple.com/us/app/freighter/id6743947720",
        play_store: "https://play.google.com/store/apps/details?id=org.stellar.freighterwallet",
      }],
      includeWalletIds: ["997a355c8f682468706a76cff1b004a7115f505fb962dac54b6e9b442dd1c380"],
      featuredWalletIds: ["997a355c8f682468706a76cff1b004a7115f505fb962dac54b6e9b442dd1c380"],
      features: { analytics: false, email: false, socials: false, swaps: false, onramp: false },
    });
    const changed = () => window.dispatchEvent(new Event("reapp:wallet-change"));
    const deleted = () => { disconnected = true; changed(); };
    provider.on("session_delete", deleted);
    provider.on("session_expire", deleted);
    provider.on("session_update", changed);
    provider.on("accountsChanged", deleted);
    provider.on("chainChanged", deleted);
    provider.on("session_event", changed);
  })().catch((cause) => { initialization = undefined; throw cause; });
  return initialization;
}

export async function connectMobileWallet(network: string, onStatus?: (status: string) => void): Promise<string> {
  if (pairingAbandoned) throw new WalletConnectionError("access", "rejected", "The previous mobile connection was cancelled. Refresh this page before connecting again.");
  await connectionRequest("detect", initialize, 20_000);
  const chain = stellarChain(network);
  if (provider!.session) {
    if (!disconnected) {
      try {
        const address = mobileSessionAddress(provider!.session, chain);
        selectMobileWallet(true);
        return address;
      } catch { /* Close an incompatible session before requesting a new one. */ }
    }
    await connectionRequest("disconnect", () => provider!.disconnect(), 15_000);
  }
  onStatus?.("Choose Freighter, then approve the connection in the mobile app. Return here when finished.");
  let unsubscribe: (() => void) | undefined;
  let pairingPending = false;
  try {
    await modal!.open();
    const cancelled = new Promise<never>((_, reject) => {
      unsubscribe = modal!.subscribeState((state) => {
        if (!state.open && !provider!.session) reject(new WalletConnectionError("access", "rejected", "Wallet connection cancelled. Connect again when ready."));
      });
    });
    pairingPending = true;
    const pairing = provider!.connect({ namespaces: { stellar: { chains: [chain], methods: [...MOBILE_METHODS], events: ["accountsChanged"] } } })
      .then(async (approved) => {
        if (pairingAbandoned) {
          // UniversalProvider.abortPairingAttempt is a deprecated no-op. Explicitly
          // close late approvals, and require reload before another pairing.
          if (provider!.session) await provider!.disconnect().catch(() => {});
          throw new WalletConnectionError("access", "rejected", "The old connection was cancelled. Refresh before trying again.");
        }
        return approved;
      }).finally(() => { pairingPending = false; });
    const session = await connectionRequest("access", () => Promise.race([pairing, cancelled]), 120_000);
    const address = mobileSessionAddress(session, chain);
    disconnected = false;
    selectMobileWallet(true);
    recordConnectionEvent("access", "ok");
    return address;
  } catch (cause) {
    pairingAbandoned = pairingPending;
    await provider!.cleanupPendingPairings({ deletePairings: true });
    // Late pairing approvals cannot become the app's selected transport.
    selectMobileWallet(false);
    if (provider!.session) await provider!.disconnect().catch(() => {});
    if (pairingAbandoned) throw new WalletConnectionError("access", cause instanceof WalletConnectionError ? cause.outcome : "failed",
      "The mobile connection was cancelled or timed out. Dismiss the old request in Freighter, then refresh this page before reconnecting.");
    if (cause instanceof WalletConnectionError) throw cause;
    throw new WalletConnectionError("access", "invalid", "Freighter Mobile did not approve a compatible account and network. Update the app and reconnect.");
  } finally {
    unsubscribe?.();
    await modal!.close();
  }
}

export async function mobileSessionState(address: string, network: string): Promise<"matches" | "different" | "disconnected" | "unknown"> {
  try {
    await connectionRequest("session", initialize, 20_000);
    if (disconnected || !provider!.session) return "disconnected";
    return mobileSessionAddress(provider!.session, stellarChain(network)) === address ? "matches" : "different";
  } catch { return provider ? "disconnected" : "unknown"; }
}

async function assertSession(address: string, network: string): Promise<string> {
  if (await mobileSessionState(address, network) !== "matches") {
    throw new WalletConnectionError("session", "mismatch", "The mobile wallet account or network changed. Connect and sign in again.");
  }
  return stellarChain(network);
}

export async function mobileSignMessage(message: string, address: string, network: string): Promise<string> {
  if (new TextEncoder().encode(message).length > 1024) throw new Error("The sign-in message exceeds Freighter Mobile's size limit.");
  const chain = await assertSession(address, network);
  const response = await connectionRequest("message", () => provider!.request<{ signature: string }>({ method: "stellar_signMessage", params: { message } }, chain), 90_000);
  await assertSession(address, network);
  if (typeof response?.signature !== "string") throw new Error("Freighter Mobile did not return an offline signature.");
  return response.signature; // The shared Freighter wrapper verifies the exact SEP-53 message.
}

export async function mobileSignTransaction(xdr: string, address: string, network: string): Promise<string> {
  const chain = await assertSession(address, network);
  const response = await connectionRequest("transaction", () => provider!.request<{ signedXDR: string }>({ method: "stellar_signXDR", params: { xdr } }, chain), 120_000);
  await assertSession(address, network);
  return validateMobileTransaction(xdr, response?.signedXDR, address, network);
}

export async function disconnectMobileWallet(): Promise<void> {
  if (!usesMobileWallet()) return;
  await initialize();
  if (provider!.session) await connectionRequest("disconnect", () => provider!.disconnect(), 15_000);
  disconnected = true;
  selectMobileWallet(false);
}

import type { UniversalProvider } from "@walletconnect/universal-provider";
import { WalletConnectionError } from "./connection-diagnostics";
import { MOBILE_METHODS, mobileSessionAddress } from "./walletconnect-session";

type MobileProvider = Pick<InstanceType<typeof UniversalProvider>, "session" | "namespaces" | "rpcProviders">;

/** Rehydrate public request routing when a reload interrupted the provider's namespace persistence. */
export function prepareMobileSigningProvider(provider: MobileProvider, chain: string, address: string): void {
  // Only the wallet-approved live session can supply permissions. Cached provider
  // routing is not authority, including when it still contains older methods.
  if (mobileSessionAddress(provider.session, chain) !== address) {
    throw new WalletConnectionError("session", "mismatch", "The mobile wallet account or network changed. Connect and sign in again.");
  }
  const configured = Object.keys(provider.namespaces ?? {});
  const stellar = provider.rpcProviders?.stellar;
  const approved = provider.session!.namespaces[chain] ?? provider.session!.namespaces.stellar;
  if (!stellar || (configured.length > 0 && !configured.some((key) => key.split(":")[0] === "stellar"))) {
    throw new WalletConnectionError("session", "invalid", "The restored mobile connection is incomplete. Disconnect and reconnect Freighter Mobile.");
  }
  const approvedChains = new Set(approved.accounts.map((account) => account.split(":").slice(0, 2).join(":")));
  const routing = stellar.namespace;
  if (!Array.isArray(routing.accounts) || !routing.accounts.includes(`${chain}:${address}`) || routing.accounts.some((account) => !approved.accounts.includes(account))
    || !Array.isArray(routing.chains) || !routing.chains.includes(chain) || routing.chains.some((value) => !approvedChains.has(value))
    || (routing.methods !== undefined && (!Array.isArray(routing.methods) || routing.methods.some((method) => !approved.methods.includes(method))))) {
    throw new WalletConnectionError("session", "invalid", "The restored mobile connection does not match the approved wallet session. Disconnect and reconnect Freighter Mobile.");
  }
  if (!Array.isArray(stellar.namespace.methods) || MOBILE_METHODS.some((method) => !stellar.namespace.methods.includes(method))) {
    // updateNamespace is the SDK's public IProvider API; no private storage keys
    // or provider internals are rewritten, and no extra permission is requested.
    stellar.updateNamespace({ ...approved, chains: [...approvedChains] });
  }
  if (!Array.isArray(stellar.namespace.methods) || MOBILE_METHODS.some((method) => !stellar.namespace.methods.includes(method))) {
    throw new WalletConnectionError("session", "invalid", "The restored mobile connection could not prepare signing. Disconnect and reconnect Freighter Mobile.");
  }
}

export interface WalletNotification {
  kind: "notice" | "error";
  message: string;
}

/** One visible message: a new action replaces stale feedback, and clearing one kind cannot reveal another. */
export function nextWalletNotification(current: WalletNotification | null, kind: WalletNotification["kind"], message: string | null): WalletNotification | null {
  if (message === null) return current?.kind === kind ? null : current;
  return { kind, message };
}

/** Match known causes, never echo provider payloads, credentials, or arbitrary server messages into the UI. */
export function safeWalletError(cause: unknown, fallback: string): string {
  const message = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "";
  if (/Agent402 discovery/i.test(message)) return "The marketplace could not verify this service's details. Your inputs have not changed; try the price check again shortly.";
  if (/model access|agent service.*(?:unavailable|configured)|chat execution.*configured|api.?key|authentication_error|insufficient_quota/i.test(message)) {
    return "The agent service needs operator attention. Check the existing payment before retrying.";
  }
  if (/rate.?limit|too many requests|\b429\b/i.test(message)) return "The service is busy. Wait a moment, then use the action below.";
  if (/session|wallet-authenticated|\b401\b/i.test(message)) return "Your website session needs verification. Reconnect the same wallet to continue.";
  if (/different signer|different account|select the same wallet/i.test(message)) return "Freighter is using another account. Select the same wallet you connected here.";
  if (/network.*(?:mismatch|different|mainnet)|wrong network|switch.*mainnet/i.test(message)) return "Switch Freighter to Stellar Mainnet, then use the action below.";
  if (/declin|reject|cancel|closed/i.test(message) && /freighter|sign|wallet/i.test(message)) return "The wallet request was cancelled. Use the action below when you are ready.";
  if (/freighter.*(?:not installed|not available|unavailable|missing)/i.test(message)) return "Open and unlock the Freighter extension, then use the action below.";
  if (/quote|seller.*chang|recipient.*chang|price.*chang/i.test(message)) return "Review the service inputs to refresh its price and seller before continuing.";
  if (/Contract,\s*#6|BudgetExceeded|budget.*(?:exceed|remaining|enough)/i.test(message)) return "This limit cannot cover another service run. Check the existing payment before changing the limit.";
  if (/expired mandate|mandate.*expired|limit.*expired/i.test(message)) return "This spending limit expired. Existing receipts remain recoverable; a new Run needs a new limit.";
  if (/url|uri|parameter|input|required field/i.test(message)) return "Review the required service inputs, then check the price again.";
  if (/fetch|timeout|timed out|ECONNRESET|network error|connection interrupted/i.test(message)) return "The connection was interrupted. Use the status or recovery action below before trying again.";
  return fallback;
}

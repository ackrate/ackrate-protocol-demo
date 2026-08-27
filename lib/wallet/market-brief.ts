export interface MarketBrief {
  kicker: string;
  title: string;
  subtitle: string;
  opening: string;
  findings: Array<{ number: string; title: string; body: string }>;
  takeaway: string;
  sources: Array<{ publisher: string; title: string; url: string }>;
}

export const MARKET_SIGNAL_BRIEF: MarketBrief = {
  kicker: "MARKET SIGNAL · AGENT PAYMENTS",
  title: "From Access Keys to Spending Rules",
  subtitle: "Why machine payments need an authority layer, not just a faster checkout.",
  opening: "HTTP-native payments let software buy a resource at the moment it is needed. The harder problem begins one step earlier: deciding what an agent may buy, how much it may spend, and when that authority ends. The strongest emerging pattern separates the payment handshake from the spending rule that governs it.",
  findings: [
    {
      number: "01",
      title: "The request becomes the checkout",
      body: "x402 turns HTTP 402 into a machine-readable payment flow. A client requests a resource, receives payment terms, settles, and retries the same request with proof. That removes subscriptions and manual checkout from the critical path.",
    },
    {
      number: "02",
      title: "Stablecoins fit machine-sized budgets",
      body: "Stellar assets can move through ordinary accounts and smart contracts through the Stellar Asset Contract. That gives an agent a familiar unit of account while preserving on-chain settlement evidence for every paid request.",
    },
    {
      number: "03",
      title: "Authority becomes the product boundary",
      body: "A payment-capable agent should not inherit an open wallet. A mandate can bind the buyer, agent, merchant, asset, maximum amount, and expiry, then validate and consume that authority when value moves. The application proposes; the contract decides.",
    },
  ],
  takeaway: "The near-term opportunity is not a universal autonomous shopper. It is a narrow, inspectable buyer with a small budget, a known merchant set, and receipts a human can verify. That is enough to make paid research, data, and compute feel native to software without turning wallet access into unlimited authority.",
  sources: [
    { publisher: "x402", title: "Protocol specification and reference implementation", url: "https://github.com/coinbase/x402" },
    { publisher: "Stellar", title: "Stellar Asset Contract documentation", url: "https://developers.stellar.org/docs/tokens/stellar-asset-contract" },
    { publisher: "Query402", title: "Prompt-to-proof research agent reference", url: "https://github.com/futurehelp/query402-api" },
    { publisher: "Ackrate", title: "MandateRegistry source and verification", url: "https://github.com/ackrate/ackrate-protocol-contracts" },
  ],
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function attachMarketBriefToPurchaseResult(value: unknown): unknown {
  const result = record(value);
  const source = record(result?.source);
  if (!result || source?.id !== "market-brief") return value;
  const delivered = record(result.delivered) ?? {};
  return { ...result, delivered: { ...delivered, brief: MARKET_SIGNAL_BRIEF } };
}

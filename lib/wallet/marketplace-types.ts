export interface Agent402SearchResult {
  title: string;
  url: string;
  description: string;
  age: string | null;
}

export interface Agent402Evidence {
  query: string;
  count: number;
  results: Agent402SearchResult[];
  untrustedContent: true;
  discovery: {
    marketplace: "Agent402";
    marketplaceUrl: "https://agent402.tools/stellar";
    seller: string;
    sellerName: string;
    route: string;
    serviceUrl: string;
    health: number;
  };
  settlement: {
    transaction: string;
    network: "stellar:pubnet";
    amountAtomic: "200000";
    amount: "0.02";
    asset: string;
    payTo: string;
    payer: string | null;
    idempotencyKey: string;
  };
  trustlineTransaction: string | null;
}

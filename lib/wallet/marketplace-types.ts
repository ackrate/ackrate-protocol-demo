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
    amountAtomic: string;
    amount: string;
    asset: string;
    payTo: string;
    payer: string | null;
    idempotencyKey: string;
  };
  trustlineTransaction: string | null;
}

export interface Agent402ToolEvidence {
  service: {
    slug: string;
    name: string;
    method: "GET" | "POST";
    route: string;
  };
  input: Record<string, string | number>;
  output: unknown;
  discovery: Agent402Evidence["discovery"];
  settlement: Agent402Evidence["settlement"];
  trustlineTransaction: string | null;
}

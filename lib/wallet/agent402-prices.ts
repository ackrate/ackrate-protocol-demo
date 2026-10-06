// Reviewed against the live discovery and Stellar payment challenges on 2026-09-25.
// A changed seller price must be reviewed before the app signs a payment.
export const AGENT402_PRICES = {
  search: { price: "0.01", amountAtomic: "100000" },
  pdf: { price: "0.01", amountAtomic: "100000" },
  "pdf-info": { price: "0.001", amountAtomic: "10000" },
} as const;

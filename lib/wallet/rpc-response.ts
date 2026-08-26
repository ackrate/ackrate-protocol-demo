import { z } from "zod";

const JsonRpcId = z.union([z.string(), z.number(), z.null()]);
const LatestLedgerResponse = z.object({
  jsonrpc: z.literal("2.0"),
  id: JsonRpcId,
  result: z.object({
    id: z.string().min(1),
    protocolVersion: z.number().int().nonnegative(),
    sequence: z.number().int().nonnegative(),
    closeTime: z.string().regex(/^\d+$/),
  }).passthrough(),
}).passthrough();

/**
 * Stellar Gateway includes several megabytes of ledger metadata in
 * getLatestLedger. The wallet needs only the stable ledger identity and height,
 * so keep the browser response small while preserving the JSON-RPC envelope.
 */
export function compactWalletRpcResponse(method: string, status: number, value: unknown): unknown {
  if (method !== "getLatestLedger" || status < 200 || status >= 300) return value;
  const response = LatestLedgerResponse.parse(value);
  const { id, protocolVersion, sequence, closeTime } = response.result;
  return {
    jsonrpc: response.jsonrpc,
    id: response.id,
    result: { id, protocolVersion, sequence, closeTime },
  };
}

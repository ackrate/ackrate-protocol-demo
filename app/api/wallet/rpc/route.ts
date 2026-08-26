import { z } from "zod";
import { loadAppConfig } from "@/lib/wallet/app-config";
import { boundedJson, boundedResponseJson, jsonError, NO_STORE_HEADERS } from "@/lib/wallet/http";
import { postRpcWithRetry } from "@/lib/wallet/rpc-retry";
import { compactWalletRpcResponse } from "@/lib/wallet/rpc-response";
import { requireSameOrigin, requireSession } from "@/lib/wallet/security";
import { NextResponse } from "next/server";

export const maxDuration = 30;

const MAINNET_RPC_FALLBACK = "https://soroban-rpc.mainnet.stellar.gateway.fm";

const RpcRequest = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]),
  method: z.enum(["getLatestLedger", "getLedgerEntries", "simulateTransaction", "sendTransaction", "getTransaction"]),
  params: z.unknown().optional(),
}).strict();

export async function POST(request: Request) {
  try {
    await requireSameOrigin();
    const config = loadAppConfig();
    if (!config.sessionSecret) throw new Error("wallet authentication is not configured");
    await requireSession(config.sessionSecret, config.public.network);
    const body = RpcRequest.parse(await boundedJson(request, 512 * 1024));
    const endpoints = config.public.network === "mainnet"
      ? [config.network.rpcUrl, MAINNET_RPC_FALLBACK]
      : [config.network.rpcUrl];
    const upstream = await postRpcWithRetry(endpoints, body);
    const raw = await boundedResponseJson(upstream, 8 * 1024 * 1024);
    const result = compactWalletRpcResponse(body.method, upstream.status, raw);
    return NextResponse.json(result, { status: upstream.status, headers: NO_STORE_HEADERS });
  } catch (error) {
    return jsonError(error, 400);
  }
}

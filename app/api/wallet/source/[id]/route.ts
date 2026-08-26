import { proxyPaidSource } from "@/lib/wallet/fulfillment";
import { jsonError } from "@/lib/wallet/http";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    return await proxyPaidSource(request);
  } catch (error) {
    return jsonError(error, 503);
  }
}

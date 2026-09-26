import type { NextApiRequest, NextApiResponse } from "next";
import { requireReadyConfig } from "@/lib/wallet/app-config";
import { createPaidSourceApp } from "@/lib/wallet/fulfillment";
import { serveExpressRequest } from "@/lib/express-request";

export const config = { api: { bodyParser: false }, maxDuration: 300 };

/** Vercel passes native Node request/response objects directly to Express. */
export default async function paidSource(request: NextApiRequest, response: NextApiResponse) {
  response.setHeader("Cache-Control", "private, no-store, no-transform");
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ ok: false, error: "method not allowed" });
    return;
  }
  try {
    const app = createPaidSourceApp(requireReadyConfig());
    await serveExpressRequest(app, request, response);
  } catch {
    if (!response.headersSent) response.status(503).json({ ok: false, error: "paid source is not ready" });
    else if (!response.writableEnded) response.end();
  }
}

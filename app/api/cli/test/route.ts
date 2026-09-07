import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Deployment checkpoint: expose the new interface without enabling an
// incomplete paid executor. No account generation, signing or payment here.
export async function GET() {
  return NextResponse.json({
    ready: false,
    version: "0.2.1",
    sourceCommit: "0be7bf8c9f938e5ebe42c0c35db54d8061b37333",
    publishedVersion: "0.2.0",
    error: "The Freighter test interface is deployed. Its Mainnet payment runner is not enabled yet; no payment can start from this page.",
  }, { headers: { "cache-control": "no-store" } });
}

import { NextResponse } from "next/server";
import { readCliBurnerJobStatus } from "../../../../../lib/cli-test-burner-job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "cache-control": "no-store, max-age=0", "x-content-type-options": "nosniff", "x-robots-tag": "noindex, nofollow" };

/** Read-only evidence. Requests cannot create, fund, restart, or sign a test. */
export async function GET() {
  try {
    return NextResponse.json(await readCliBurnerJobStatus(), { headers });
  } catch {
    return NextResponse.json({ configured: true, state: "unavailable", error: "Test status is temporarily unavailable. No replacement run has been started." }, { status: 503, headers });
  }
}

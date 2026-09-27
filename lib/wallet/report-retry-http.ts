import { NextResponse } from "next/server";
import { boundedJson, NO_STORE_HEADERS } from "./http";
import { ReportRetryError, ReportRetryInput, type createReportRetryStore } from "./report-retry";

const headers = { ...NO_STORE_HEADERS, "X-Content-Type-Options": "nosniff" };
type Store = ReturnType<typeof createReportRetryStore>;
export function createReportRetryHandlers(dependencies: {
  requireOrigin: () => Promise<unknown>; authenticate: () => Promise<string>;
  modelConfigured: () => boolean; store: () => Store;
}) {
  const error = (message: string, status: number) => NextResponse.json({ ok: false, error: message }, { status, headers });
  async function handle(request: Request, retry: boolean) {
    if (retry) {
      try { await dependencies.requireOrigin(); }
      catch { return error("Retry the written summary from this wallet page.", 403); }
    }
    let owner: string;
    try { owner = await dependencies.authenticate(); }
    catch { return error("Sign in with the wallet that paid for this report.", 401); }
    let input;
    try {
      if (retry) input = ReportRetryInput.parse(await boundedJson(request, 4096));
      else {
        const params = new URL(request.url).searchParams;
        if ([...params].length !== 2 || params.getAll("mandateId").length !== 1 || params.getAll("txHash").length !== 1) throw new Error("invalid query");
        input = ReportRetryInput.parse(Object.fromEntries(params));
      }
    } catch { return error("The saved report reference is invalid.", 400); }
    if (retry && !dependencies.modelConfigured()) return error("Written summaries are temporarily unavailable. Your paid sources are saved.", 503);
    try {
      const result = await dependencies.store()[retry ? "retry" : "get"]({ ...input, owner });
      return NextResponse.json({ ok: true, ...result }, { status: result.status === "running" ? 202 : 200, headers });
    } catch (cause) {
      if (cause instanceof ReportRetryError && cause.code === "not_found") return error("This wallet has no completed search matching that receipt.", 404);
      return error("The summary status is unavailable. Check it again without buying another search.", 503);
    }
  }
  return { GET: (request: Request) => handle(request, false), POST: (request: Request) => handle(request, true) };
}

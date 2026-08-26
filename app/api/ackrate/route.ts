import { NextResponse } from "next/server";
import * as srv from "@/lib/ackrate-server";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action: string = body.action ?? "(none)";
  const t0 = Date.now();
  log.info("POST /api/ackrate", { action });
  try {
    let result: unknown;
    switch (action) {
      case "init":
        result = await srv.init();
        log.chain("init: funded 3 testnet accounts via friendbot");
        break;
      case "setup":
        result = await srv.setup(body);
        log.chain("setup: mandate registered + allowance approved", {
          mandate: (result as { mandateId?: string }).mandateId?.slice(0, 10),
        });
        break;
      case "pay":
        result = await srv.pay(body);
        log.chain("pay: execute_payment settled", { tx: (result as { hash?: string }).hash?.slice(0, 10) });
        break;
      case "revoke":
        result = await srv.revoke(body);
        log.chain("revoke: mandate revoked on-chain");
        break;
      case "balances":
        result = await srv.balances(body);
        break;
      default:
        log.warn("unknown action", { action });
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
    log.ok(`${action} ok`, { ms: Date.now() - t0 });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // A contract rejection (overspend, revoked, expired) lands here; it is the
    // demo's whole point, so return it as data the UI can show, not an HTTP error.
    log.warn(`${action} rejected on-chain`, { ms: Date.now() - t0, reason: msg.slice(0, 80) });
    return NextResponse.json({ error: msg });
  }
}

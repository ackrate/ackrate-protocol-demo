import { NextResponse, type NextRequest } from "next/server";

// This app intentionally uses no Server Actions. Any inbound request carrying
// a Next-Action header is illegitimate scanner traffic or a stale browser tab.
// Short-circuit it before Next attempts to resolve a nonexistent action.
export function proxy(request: NextRequest) {
  if (request.headers.has("next-action")) {
    return new NextResponse(null, { status: 204 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 300;

const BUNDLE = join(process.cwd(), "vendor", "ackrate-cli.mjs");

// Only the @ackrate/cli subcommands. spawn uses an arg array (no shell), and
// every token must be a plain identifier/flag — no shell metacharacters.
const ALLOWED_FIRST = new Set(["init", "setup", "mandate", "pay", "settlement", "demo", "--help", "--version"]);
const TOKEN = /^[A-Za-z0-9._:/-]+$/;

function sanitize(args: unknown): string[] | null {
  if (!Array.isArray(args) || args.length === 0 || args.length > 6) return null;
  if (!args.every((a) => typeof a === "string" && TOKEN.test(a))) return null;
  if (!ALLOWED_FIRST.has(args[0])) return null;
  return args as string[];
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { args?: unknown; sessionId?: unknown };
  const args = sanitize(body.args);
  if (!args) return new Response("invalid command", { status: 400 });

  // Per-session working dir so init/setup/mandate/pay share state across calls.
  const sessionId = typeof body.sessionId === "string" && /^[A-Za-z0-9-]{6,40}$/.test(body.sessionId) ? body.sessionId : "anon";
  const home = join(tmpdir(), "ackrate-cli", sessionId);
  mkdirSync(home, { recursive: true });

  log.info("POST /api/cli", { cmd: args.join(" "), session: sessionId.slice(0, 8) });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const safeClose = () => {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      };
      const child = spawn(process.execPath, [BUNDLE, ...args], {
        cwd: home,
        env: { ...process.env, ACKRATE_HOME: home, FORCE_COLOR: "1" },
      });
      child.stdout.on("data", (d: Buffer) => controller.enqueue(enc.encode(d.toString())));
      child.stderr.on("data", (d: Buffer) => controller.enqueue(enc.encode(d.toString())));
      child.on("close", (code) => {
        controller.enqueue(enc.encode(`\r\n\x1b[2m[ackrate exited ${code}]\x1b[0m\r\n`));
        safeClose();
      });
      child.on("error", (e) => {
        controller.enqueue(enc.encode(`\r\n\x1b[31m[failed to start: ${e.message}]\x1b[0m\r\n`));
        safeClose();
      });
      // Abort the child if the client disconnects.
      req.signal.addEventListener("abort", () => {
        child.kill("SIGTERM");
        safeClose();
      });
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache, no-transform" },
  });
}

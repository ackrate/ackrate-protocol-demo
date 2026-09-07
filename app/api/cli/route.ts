import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mainnetCliArguments, mainnetCliEnvironment } from "@/lib/cli-runner";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUNDLE = join(process.cwd(), "vendor", "ackrate-cli.mjs");

export async function POST(req: Request) {
  const text = await req.text();
  if (text.length > 4_096) return new Response("command too large", { status: 400 });
  let body: { args?: unknown; sessionId?: unknown };
  try { body = JSON.parse(text); } catch { return new Response("invalid command", { status: 400 }); }
  if (!body || typeof body !== "object") return new Response("invalid command", { status: 400 });
  const args = mainnetCliArguments(body.args);
  if (!args) return new Response(
    "This terminal accepts Mainnet command inspection only. Signing, funding, file paths and payment-confirmation flags require an authorized runner.",
    { status: 400 },
  );

  const sessionId = body.sessionId;
  if (typeof sessionId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(sessionId)) {
    return new Response("Reload the CLI page to create a new isolated session.", { status: 400 });
  }
  // Never load state from the previous disposable-account runner.
  const home = join(tmpdir(), "ackrate-cli-mainnet-v020", sessionId);
  mkdirSync(home, { recursive: true, mode: 0o700 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (text: string) => {
        if (!closed) try { controller.enqueue(enc.encode(text)); } catch { closed = true; }
      };
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
        env: mainnetCliEnvironment(home),
        stdio: ["ignore", "pipe", "pipe"],
      });
      const timeout = setTimeout(() => {
        send("\r\n[command timed out; no new command was started]\r\n");
        child.kill("SIGKILL");
        safeClose();
      }, 45_000);
      const abort = () => { child.kill("SIGKILL"); safeClose(); };
      req.signal.addEventListener("abort", abort, { once: true });
      if (req.signal.aborted) abort();
      child.stdout.on("data", (d: Buffer) => send(d.toString()));
      child.stderr.on("data", (d: Buffer) => send(d.toString()));
      child.on("close", (code) => {
        clearTimeout(timeout);
        req.signal.removeEventListener("abort", abort);
        send(`\r\n\x1b[2m[ackrate exited ${code ?? "interrupted"}]\x1b[0m\r\n`);
        safeClose();
      });
      child.on("error", () => {
        clearTimeout(timeout);
        req.signal.removeEventListener("abort", abort);
        send("\r\n[CLI executable could not start]\r\n");
        safeClose();
      });
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store, no-transform", "x-content-type-options": "nosniff" },
  });
}

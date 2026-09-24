import { runResearch, type ResearchEvent, type RunArgs } from "@/lib/research-agent";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Streams the research run as newline-delimited JSON (one ResearchEvent per line)
 *  so the UI can render each on-chain purchase as it happens. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<RunArgs>;

  const enc = new TextEncoder();
  const line = (ev: ResearchEvent) => enc.encode(JSON.stringify(ev) + "\n");

  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    log.err("research aborted: no LLM provider key set");
    return new Response(
      line({ type: "error", message: "No LLM provider key set on the server. Add a provider key in the server environment to run the agent." }),
      { headers: { "content-type": "application/x-ndjson; charset=utf-8" } },
    );
  }
  if (!body.question || !body.inputs || !body.agentSecret) {
    log.warn("research aborted: missing question, mandate inputs, or agent key");
    return new Response(line({ type: "error", message: "Missing question, mandate inputs, or agent key." }), {
      status: 400,
      headers: { "content-type": "application/x-ndjson; charset=utf-8" },
    });
  }

  const t0 = Date.now();
  log.info("POST /api/research", { q: body.question.slice(0, 48) });

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of runResearch(body as RunArgs)) {
          // Verbose: surface the agent's on-chain checkpoints in the server logs.
          if (ev.type === "provider_switch") log.warn(`LLM failover · ${ev.text}`);
          else if (ev.type === "purchase_attempt") log.step(`agent buying ${ev.label}`, { reason: ev.reason.slice(0, 48) });
          else if (ev.type === "purchase_ok") log.chain(`paid 1 XLM · ${ev.label}`, { tx: ev.hash.slice(0, 10) });
          else if (ev.type === "purchase_blocked") log.warn(`blocked on-chain · ${ev.label}`, { reason: ev.reason });
          else if (ev.type === "final") log.ok("agent synthesized its final answer");
          else if (ev.type === "done") log.ok("research run complete", { sources: ev.spent, ms: Date.now() - t0 });
          else if (ev.type === "error") log.err("research error", { reason: ev.message.slice(0, 80) });
          controller.enqueue(line(ev));
        }
      } catch (e) {
        log.err("research stream crashed", { reason: e instanceof Error ? e.message : String(e) });
        controller.enqueue(line({ type: "error", message: e instanceof Error ? e.message : String(e) }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
    },
  });
}

/**
 * Provider-failover LLM layer (the orchestration engine).
 *
 * The research agent must never go dark during evaluation: if the primary LLM
 * provider runs out of credit or gets rate-limited, the call transparently
 * fails over to the backup provider. Both providers are reached through one
 * neutral request/response contract so the agent loop has no provider knowledge.
 *
 * Order is configurable (LLM_PRIMARY=anthropic|openai); default primary is the
 * Anthropic SDK, backup is the OpenAI SDK. Either key alone works (no failover);
 * both keys give failover. If every provider is exhausted, complete() throws
 * AllProvidersExhausted and the caller renders a degraded, source-only report.
 *
 * Anything logged or streamed stays vendor-agnostic ("primary LLM" /
 * "backup LLM") so the UI shows WHICH LLM the orchestrator picked without naming
 * the vendor or model.
 *
 * Server-only — reads API keys from the environment.
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

// ---- neutral, provider-agnostic contract ----

export type LlmTool = {
  name: string;
  description: string;
  /** Standard JSON Schema; portable across Anthropic and OpenAI. */
  inputSchema: Record<string, unknown>;
};

export type LlmToolCall = { id: string; name: string; input: Record<string, unknown> };

export type LlmMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolCalls: LlmToolCall[] }
  | { role: "tool"; results: { toolCallId: string; content: string; isError?: boolean }[] };

export type LlmRequest = {
  system: string;
  messages: LlmMessage[];
  tools?: LlmTool[];
  maxTokens: number;
};

export type LlmResponse = {
  text: string;
  toolCalls: LlmToolCall[];
  stopReason: "tool_calls" | "end";
};

/** Which model class to use. Each provider maps these to its own model ids. */
export type Tier = "main" | "sub";

export interface LlmProvider {
  /** Internal vendor key (config only). */
  readonly id: string;
  /** Slot label ("primary LLM" / "backup LLM"). */
  readonly label: string;
  /** Vendor brand for display ("Claude" / "ChatGPT"). */
  readonly brand: string;
  /** Display name shown in the UI, e.g. "Claude · Opus 4.8". */
  engineName(tier: Tier): string;
  complete(req: LlmRequest, tier: Tier): Promise<LlmResponse>;
}

// ---- error classification (the "never go dark" triggers) ----

export type ErrKind = "exhausted" | "ratelimited" | "transient" | "auth" | "bad_request" | "network";

const KIND_LABEL: Record<ErrKind, string> = {
  exhausted: "out of credit/quota",
  ratelimited: "rate limited",
  transient: "service error",
  auth: "auth error",
  bad_request: "bad request",
  network: "network error",
};

/**
 * Decide whether an SDK error should trigger failover. Both the Anthropic and
 * OpenAI SDKs set `.status` on API errors, so we classify primarily by HTTP
 * status, with message/code heuristics for billing/quota. A genuine 4xx request
 * bug does NOT fail over (the other provider would reject it the same way).
 */
export function classifyError(err: unknown): { kind: ErrKind; failover: boolean } {
  const e = err as
    | {
        status?: number;
        code?: string;
        type?: string;
        error?: { type?: string; code?: string };
        message?: string;
      }
    | undefined;

  const status = typeof e?.status === "number" ? e.status : undefined;
  const code = e?.code ?? e?.error?.code;
  const type = e?.type ?? e?.error?.type;
  const msg = (e?.message ?? "").toLowerCase();

  const looksBilling =
    code === "insufficient_quota" ||
    type === "billing_error" ||
    msg.includes("credit balance") ||
    msg.includes("billing") ||
    msg.includes("insufficient_quota") ||
    msg.includes("quota");

  if (looksBilling) return { kind: "exhausted", failover: true };
  if (status === 429) return { kind: "ratelimited", failover: true };
  if (status === 401 || status === 403) return { kind: "auth", failover: true };
  if (status !== undefined && status >= 500) return { kind: "transient", failover: true };
  // Real request bugs / unknown model — other providers will also reject.
  if (status === 400 || status === 404 || status === 422) return { kind: "bad_request", failover: false };
  // No HTTP status at all → network / timeout / DNS → worth trying the other provider.
  if (status === undefined) return { kind: "network", failover: true };
  return { kind: "transient", failover: true };
}

export class AllProvidersExhausted extends Error {
  constructor(public readonly lastError: unknown) {
    super("All LLM providers are unavailable");
    this.name = "AllProvidersExhausted";
  }
}

/** Turn a raw model id into a short, human label: "claude-opus-4-8" → "Opus 4.8",
 *  "gpt-5.5" → "GPT-5.5". Falls back to the raw id for anything unrecognized. */
function prettyModel(id: string): string {
  const lower = id.toLowerCase();
  const v = id.match(/(\d+)[-.](\d+)/);
  const ver = v ? ` ${v[1]}.${v[2]}` : "";
  if (lower.includes("opus")) return `Opus${ver}`;
  if (lower.includes("sonnet")) return `Sonnet${ver}`;
  if (lower.includes("haiku")) return `Haiku${ver}`;
  if (lower.startsWith("gpt-")) return id.replace(/^gpt-/i, "GPT-");
  return id;
}

// ---- Anthropic adapter ----

export class AnthropicProvider implements LlmProvider {
  readonly id = "anthropic";
  readonly brand = "Claude";
  private models: Record<Tier, string>;

  constructor(
    readonly label: string,
    private client: Anthropic = new Anthropic(),
  ) {
    // Env-configurable, with the demo's tested defaults.
    const main = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
    const sub = process.env.ANTHROPIC_MODEL_SUB || "claude-sonnet-4-6";
    this.models = { main, sub };
  }

  engineName(tier: Tier): string {
    return `${this.brand} · ${prettyModel(this.models[tier])}`;
  }

  async complete(req: LlmRequest, tier: Tier): Promise<LlmResponse> {
    const messages: Anthropic.MessageParam[] = req.messages.map((m) => {
      if (m.role === "user") return { role: "user", content: m.text };
      if (m.role === "assistant") {
        const content: Anthropic.ContentBlockParam[] = [];
        if (m.text.trim()) content.push({ type: "text", text: m.text });
        for (const tc of m.toolCalls) content.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
        return { role: "assistant", content };
      }
      return {
        role: "user",
        content: m.results.map((r) => ({
          type: "tool_result" as const,
          tool_use_id: r.toolCallId,
          content: r.content,
          is_error: r.isError,
        })),
      };
    });

    const resp = await this.client.messages.create({
      model: this.models[tier],
      max_tokens: req.maxTokens,
      thinking: { type: "disabled" },
      system: req.system,
      ...(req.tools
        ? {
            tools: req.tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
            })),
          }
        : {}),
      messages,
    });

    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    const toolCalls = resp.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
      .map((b) => ({ id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> }));

    return { text, toolCalls, stopReason: resp.stop_reason === "tool_use" ? "tool_calls" : "end" };
  }
}

// ---- OpenAI adapter ----

export class OpenAIProvider implements LlmProvider {
  readonly id = "openai";
  readonly brand = "ChatGPT";
  private models: Record<Tier, string>;

  constructor(
    readonly label: string,
    private client: OpenAI = new OpenAI(),
  ) {
    // Env-configurable so the deployer points it at whatever the key supports.
    const main = process.env.OPENAI_MODEL || "gpt-5.5";
    const sub = process.env.OPENAI_MODEL_SUB || process.env.OPENAI_MODEL || "gpt-5.5";
    this.models = { main, sub };
  }

  engineName(tier: Tier): string {
    return `${this.brand} · ${prettyModel(this.models[tier])}`;
  }

  async complete(req: LlmRequest, tier: Tier): Promise<LlmResponse> {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: req.system },
    ];
    // OpenAI matches tool_call_id strictly WITHIN the submitted payload and is
    // picky about message shape. Canonicalize ids to call_* (so a history that
    // the other provider produced before a failover replays cleanly) and only
    // allow a null assistant `content` when that turn actually carries tool_calls.
    const idMap = new Map<string, string>();
    const canonical = (id: string) => {
      let mapped = idMap.get(id);
      if (!mapped) {
        mapped = `call_${idMap.size}`;
        idMap.set(id, mapped);
      }
      return mapped;
    };
    for (const m of req.messages) {
      if (m.role === "user") {
        messages.push({ role: "user", content: m.text });
      } else if (m.role === "assistant") {
        const hasTools = m.toolCalls.length > 0;
        messages.push({
          role: "assistant",
          content: m.text || (hasTools ? null : ""),
          ...(hasTools
            ? {
                tool_calls: m.toolCalls.map((tc) => ({
                  id: canonical(tc.id),
                  type: "function" as const,
                  function: { name: tc.name, arguments: JSON.stringify(tc.input) },
                })),
              }
            : {}),
        });
      } else {
        // OpenAI wants one `tool` message per result, keyed by tool_call_id.
        for (const r of m.results) {
          messages.push({
            role: "tool",
            tool_call_id: canonical(r.toolCallId),
            content: r.isError ? `ERROR: ${r.content}` : r.content,
          });
        }
      }
    }

    const resp = await this.client.chat.completions.create({
      model: this.models[tier],
      max_completion_tokens: req.maxTokens,
      ...(req.tools
        ? {
            tools: req.tools.map((t) => ({
              type: "function" as const,
              function: { name: t.name, description: t.description, parameters: t.inputSchema },
            })),
          }
        : {}),
      messages,
    });

    const choice = resp.choices[0];
    const msg = choice?.message;
    const text = (msg?.content ?? "").trim();

    const toolCalls: LlmToolCall[] = [];
    for (const tc of msg?.tool_calls ?? []) {
      if (tc.type !== "function") continue; // ignore custom-tool calls
      let input: Record<string, unknown> = {};
      try {
        input = tc.function.arguments ? (JSON.parse(tc.function.arguments) as Record<string, unknown>) : {};
      } catch {
        input = {};
      }
      toolCalls.push({ id: tc.id, name: tc.function.name, input });
    }

    return { text, toolCalls, stopReason: choice?.finish_reason === "tool_calls" ? "tool_calls" : "end" };
  }
}

// ---- failover wrapper ----

export type ProviderSwitch = { from: string; to: string; reason: string };
export type LlmCompletion = {
  response: LlmResponse;
  switches: ProviderSwitch[];
  engine: string;
  providerId: string;
};

export interface LlmCompletionOptions {
  /** Skip a provider already used for an earlier editorial pass. */
  excludeProviderId?: string;
}

export class FailoverLlm {
  constructor(private readonly providers: LlmProvider[]) {
    if (providers.length === 0) {
      throw new Error("No LLM provider configured. Set ANTHROPIC_API_KEY and/or OPENAI_API_KEY.");
    }
  }

  /**
   * Run the request through providers in order. Returns the first success, the
   * agnostic label of the provider that served it, and any switches that
   * occurred (so the caller can surface the orchestrator's pick live). On a
   * non-failover error (a real request bug) it rethrows immediately; if every
   * provider fails over, it throws AllProvidersExhausted.
   */
  async complete(
    req: LlmRequest,
    tier: Tier,
    options: LlmCompletionOptions = {},
  ): Promise<LlmCompletion> {
    const switches: ProviderSwitch[] = [];
    let lastError: unknown;
    const providers = this.providers.filter((provider) => provider.id !== options.excludeProviderId);
    if (providers.length === 0) {
      throw new AllProvidersExhausted(new Error("No distinct LLM provider is configured"));
    }

    for (let i = 0; i < providers.length; i++) {
      const provider = providers[i];
      try {
        const response = await provider.complete(req, tier);
        return { response, switches, engine: provider.engineName(tier), providerId: provider.id };
      } catch (err) {
        lastError = err;
        const { kind, failover } = classifyError(err);
        if (!failover) throw err;
        const next = providers[i + 1];
        if (next) switches.push({ from: provider.engineName(tier), to: next.engineName(tier), reason: KIND_LABEL[kind] });
      }
    }

    throw new AllProvidersExhausted(lastError);
  }
}

/**
 * Build the failover chain from the environment. Default order is Anthropic →
 * OpenAI; set LLM_PRIMARY=openai to flip. Only providers whose key is present
 * are included; the first one added is labeled "primary LLM", the second
 * "backup LLM".
 */
export function buildFailoverLlm(): FailoverLlm {
  const order =
    (process.env.LLM_PRIMARY || "anthropic").toLowerCase() === "openai"
      ? (["openai", "anthropic"] as const)
      : (["anthropic", "openai"] as const);

  const labels = ["primary LLM", "backup LLM"];
  const providers: LlmProvider[] = [];

  for (const vendor of order) {
    if (vendor === "anthropic" && process.env.ANTHROPIC_API_KEY) {
      providers.push(new AnthropicProvider(labels[providers.length]));
    } else if (vendor === "openai" && process.env.OPENAI_API_KEY) {
      providers.push(new OpenAIProvider(labels[providers.length]));
    }
  }

  return new FailoverLlm(providers);
}

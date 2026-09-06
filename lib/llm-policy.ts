export type LlmProviderId = "openai" | "anthropic";

/**
 * Explicit operator policy, shared by streaming chat and report orchestration.
 * A disabled provider is never constructed or probed, even if its key remains.
 */
export function llmProviderOrder(env: NodeJS.ProcessEnv = process.env): LlmProviderId[] {
  const mode = env.LLM_PROVIDER_MODE?.trim().toLowerCase() || "openai-only";
  if (mode === "openai-only") return ["openai"];
  if (mode !== "failover") throw new Error("LLM_PROVIDER_MODE must be openai-only or failover");
  return env.LLM_PRIMARY?.trim().toLowerCase() === "anthropic"
    ? ["anthropic", "openai"]
    : ["openai", "anthropic"];
}

export function configuredLlmProviders(env: NodeJS.ProcessEnv = process.env): LlmProviderId[] {
  return llmProviderOrder(env).filter((id) =>
    Boolean((id === "openai" ? env.OPENAI_API_KEY : env.ANTHROPIC_API_KEY)?.trim()),
  );
}

import { tool, type UIMessage } from "ai";
import { z } from "zod";
import { modelDeliverySummary } from "./delivery-result";

/** The SDK may add transport metadata, but a paid Run always binds these fields. */
export const ConfiguredChatBody = z.object({
  messages: z.array(z.custom<UIMessage>((message) => {
    if (typeof message !== "object" || message === null) return false;
    const candidate = message as Partial<UIMessage>;
    return typeof candidate.id === "string" && candidate.id.length > 0
      && ["system", "user", "assistant"].includes(candidate.role ?? "")
      && Array.isArray(candidate.parts) && candidate.parts.every((part) => typeof part === "object" && part !== null && typeof part.type === "string");
  })).min(1).max(100).refine((messages) => messages.at(-1)?.role === "user", "Start the service with an explicit Run action."),
  mandateId: z.string().regex(/^[0-9a-f]{64}$/),
  sourceId: z.string().min(1).max(48),
  parameters: z.record(z.string(), z.unknown()),
  quoteToken: z.string().min(1).max(12_000),
  requestId: z.string().uuid(),
});

/** A model supplies no payment fields and cannot execute twice within one Run. */
export function configuredPurchaseTool(purchase: () => Promise<unknown>) {
  let purchaseStarted = false;
  return tool({
    description: "Run the user's selected service once with its server-validated inputs and payment quote. No arguments are needed.",
    inputSchema: z.object({}).strict(),
    toModelOutput: ({ output }) => ({ type: "text", value: modelDeliverySummary(output) }),
    execute: async () => {
      if (purchaseStarted) throw new Error("This Run action already attempted its one purchase. Use receipt recovery; do not pay again.");
      purchaseStarted = true;
      return purchase();
    },
  });
}

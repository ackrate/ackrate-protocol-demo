import { APICallError, wrapLanguageModel } from "ai";

type ConcreteModel = Parameters<typeof wrapLanguageModel>[0]["model"];

/** Per-Run only: switch providers before a stream opens, never after a tool ran. */
export function withPreStreamFallback(primary: ConcreteModel, backup?: ConcreteModel) {
  let selected = wrapLanguageModel({ model: primary, middleware: { specificationVersion: "v4" } });
  const fallback = backup ? wrapLanguageModel({ model: backup, middleware: { specificationVersion: "v4" } }) : undefined;
  let startupAttempted = false;
  let starting = false;
  return wrapLanguageModel({
    model: selected,
    middleware: {
      specificationVersion: "v4",
      wrapStream: async ({ params }) => {
        if (starting) throw new Error("This Run is already opening its model stream.");
        if (startupAttempted) return selected.doStream(params);
        startupAttempted = true;
        starting = true;
        try {
          try {
            return await selected.doStream(params);
          } catch (error) {
            const status = APICallError.isInstance(error) ? error.statusCode : undefined;
            const unavailable = status !== undefined && ([401, 403, 429].includes(status) || status >= 500);
            if (!fallback || !unavailable || params.abortSignal?.aborted) throw error;
            selected = fallback;
            return await selected.doStream(params);
          }
        } finally {
          starting = false;
        }
      },
    },
  });
}

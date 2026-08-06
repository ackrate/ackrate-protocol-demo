/** Node-only boot diagnostics, isolated from Next.js' Edge instrumentation bundle. */
import { banner } from "./banner";
import { EXPLORER_BASE } from "./explorer";
import { log } from "./log";

export async function registerNodeInstrumentation() {
  let contract = "…";
  let rpc = "…";
  const price = "1.00";
  const budget = "3.00";

  try {
    const stellar = await import("@reapp-sdk/stellar");
    contract = stellar.TESTNET.mandateRegistryId;
    rpc = stellar.TESTNET.rpcUrl;
  } catch {
    /* SDK unavailable at boot. */
  }

  const short = (value: string) =>
    value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
  const domain = process.env.RAILWAY_PUBLIC_DOMAIN ?? `localhost:${process.env.PORT ?? 3000}`;
  const ai = process.env.ANTHROPIC_API_KEY ? "enabled" : "disabled (no LLM API key)";

  // Deferred so the boot feed lands after Next's own logs.
  setTimeout(() => {
    process.stdout.write(`\n${banner()}\n\n`);
    log.info("boot", {
      env: process.env.NODE_ENV ?? "production",
      node: process.version,
      domain,
    });
    log.info("network", { chain: "stellar-testnet", rpc: rpc.replace(/^https?:\/\//, "") });
    log.chain("registry", {
      contract: short(contract),
      explorer: EXPLORER_BASE.replace(/^https?:\/\//, ""),
    });
    log.info("pricing", { unlock: `${price} XLM`, budget: `${budget} XLM` });
    log.info("research", { agent: ai });
    log.ok("online, serving requests");
  }, 900);
}

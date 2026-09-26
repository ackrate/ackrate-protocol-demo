import { preflightAgent402Tool } from "../lib/wallet/agent402";
import { SUPPORTED_AGENT402_TOOLS } from "../lib/wallet/agent402-tools";
import manifest from "../lib/wallet/mainnet-release.json";

// Unpaid discovery and HTTP 402 challenges only; no wallet, signature or funding.
const results = await Promise.allSettled(Object.values(SUPPORTED_AGENT402_TOOLS).map(async (tool) => {
  const input = tool.slug === "search" ? { q: "Stellar payments", count: 1 }
    : { url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf" };
  const verified = await preflightAgent402Tool(tool, input, manifest.public_configuration.usdc_sac);
  console.log(`${tool.slug}: verified ${tool.price} USDC, ${verified.requirement.network}, sponsored fees`);
}));
for (const result of results) {
  if (result.status === "rejected") {
    console.error(result.reason instanceof Error ? result.reason.message : "Marketplace preflight failed");
    process.exitCode = 1;
  }
}

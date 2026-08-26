/**
 * ACKRATE boot wordmark. ONE line on purpose: Railway's log viewer orders and can
 * interleave lines, so a multi-line figlet gets fragmented and mixed into the
 * boot feed (see the regression from the original one-liner). A single colored
 * line is reorder-proof. The CLI keeps the full figlet banner — that runs in a
 * real terminal where multi-line renders fine.
 */
import { c } from "./log";

export function banner(): string {
  const word = c.cyan("R") + c.mint("E") + c.emerald("A") + c.teal("P") + c.green("P");
  return (
    c.bold(word) +
    c.dim("  ·  ") +
    c.dim("agent payments") +
    c.emerald(" · ") +
    c.dim("enforced on-chain") +
    c.emerald(" · ") +
    c.dim("stellar testnet")
  );
}

import { resolve } from "node:path";

import { runSafeReset } from "../shared/reset.mjs";

const result = await runSafeReset({
  stateRoot: resolve(process.env.ACKRATE_STATE_ROOT ?? ".ackrate"),
  archiveRoot: resolve(process.env.ACKRATE_ARCHIVE_ROOT ?? ".ackrate-archive"),
});
console.log(result.kind === "missing" ? "No active ACKRATE state found." : `Archived safe ACKRATE state to ${result.destination}`);

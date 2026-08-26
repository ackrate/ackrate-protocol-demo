import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, open, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SettlementUncertainError,
  type Agent,
} from "@ackrate/core";

const ROOT = join(tmpdir(), "ackrate-site-payment-journals");

function journalDirectory(key: string): string {
  const digest = createHash("sha256").update(key, "utf8").digest("hex");
  return join(ROOT, digest);
}

/**
 * Testnet-demo payment journal. The signed hash is fsynced before broadcast and
 * a second process cannot acquire the same mandate journal. The caller also
 * supplies the immutable contract sequence for this user-visible operation. If
 * a response is lost across a container restart, retrying that sequence either
 * completes once or is rejected on-chain before a second payment can be made.
 */
export async function journaledPay(
  agent: Agent,
  amount: string,
  key: string,
  expectedSeq: number,
): Promise<string> {
  if (!Number.isSafeInteger(expectedSeq) || expectedSeq < 0) {
    throw new Error("payment expectedSeq must be a safe non-negative integer");
  }
  await mkdir(ROOT, { recursive: true, mode: 0o700 });
  const directory = journalDirectory(key);
  try {
    await mkdir(directory, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("a payment for this mandate is already prepared or unresolved; reconcile it before paying again");
    }
    throw error;
  }

  let safeToClear = false;
  try {
    const hash = await agent.pay(amount, {
      expectedSeq,
      onPrepared: async (pending) => {
        const temporary = join(directory, `${randomUUID()}.tmp`);
        const target = join(directory, "state.json");
        const handle = await open(temporary, "wx", 0o600);
        try {
          await handle.writeFile(`${JSON.stringify({ version: 1, pending }, null, 2)}\n`, "utf8");
          await handle.sync();
        } finally {
          await handle.close();
        }
        await rename(temporary, target);
        await chmod(target, 0o600);
        const directoryHandle = await open(directory, "r");
        try {
          await directoryHandle.sync();
        } finally {
          await directoryHandle.close();
        }
      },
    });
    safeToClear = true;
    return hash;
  } catch (error) {
    safeToClear = !(error instanceof SettlementUncertainError);
    throw error;
  } finally {
    if (safeToClear) await rm(directory, { recursive: true, force: true });
  }
}

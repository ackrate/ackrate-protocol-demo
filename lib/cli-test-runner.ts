import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, symlink, mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { tmpdir } from "node:os";
import type { CliTestStore, CliTestRow, CliTestPatch } from "./cli-test-store";

export const CLI_TEST_VERSION = "0.2.1";
export const CLI_TEST_SOURCE = "0be7bf8c9f938e5ebe42c0c35db54d8061b37333";
const runtime = globalThis as typeof globalThis & { __ackrateCliTests?: Map<string, Promise<void>> };
runtime.__ackrateCliTests ??= new Map();

export function cliPaidArguments(merchant: string): string[] {
  return ["demo", "research-agent", "--network", "mainnet", "--user-signer", "cli-payer", "--agent-signer", "cli-agent",
    "--agent-secret-env", "CLI_TEST_AGENT_SECRET", "--merchant", merchant, "--budget", "0.03", "--price", "0.01", "--confirm-real-usdc"];
}

export function cliPaidEnvironment(directory: string, secrets: { payer: string; agent: string }, merchant: string): NodeJS.ProcessEnv {
  return { NODE_ENV: "production", ACKRATE_HOME: directory, ACKRATE_NETWORK: "mainnet", NO_COLOR: "1",
    PATH: `${join(directory, "bin")}:${dirname(process.execPath)}`,
    CLI_TEST_PAYER_SECRET: secrets.payer, CLI_TEST_AGENT_SECRET: secrets.agent, CLI_TEST_MERCHANT_PUBLIC_KEY: merchant };
}

export function cleanCliLog(value: string): string {
  return value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/S[A-Z2-7]{55}/g, "[redacted key]").slice(-180_000);
}

/** Stop starts a one-way drain: a delayed snapshot/store write must settle
 * before the caller writes terminal evidence, and later ticks do nothing. */
export function createCliEvidenceHeartbeat(
  snapshot: () => Promise<string>,
  save: (logs: string) => Promise<unknown>,
  onError: () => void,
) {
  let closed = false;
  let pending: Promise<void> | undefined;
  let failed = false;
  let failure: unknown;
  return {
    tick(): void {
      if (closed || pending || failed) return;
      pending = Promise.resolve().then(snapshot).then(save).then(() => undefined)
        .catch((error: unknown) => { failed = true; failure = error; onError(); })
        .finally(() => { pending = undefined; });
      // A throwing error callback must not leave an unhandled rejection while
      // the process-close path is still waiting to drain the heartbeat.
      void pending.catch(() => undefined);
    },
    async stop(): Promise<void> {
      closed = true;
      await pending;
      if (failed) throw failure;
    },
  };
}

async function receiptEvidence(directory: string): Promise<string> {
  const evidence: string[] = [];
  async function visit(path: string, depth: number) {
    if (depth > 4) return;
    for (const entry of await readdir(path, { withFileTypes: true }).catch(() => [])) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await visit(child, depth + 1);
      else if (entry.isFile() && ["receipts.json", "outcomes.json", "redemptions.json"].includes(entry.name)) {
        const text = await readFile(child, "utf8");
        if (text.length < 100_000) evidence.push(`${entry.name}\n${text}`);
      }
    }
  }
  await visit(directory, 0);
  return evidence.length ? `\n\nSaved reference-agent evidence\n${evidence.join("\n\n")}` : "";
}

/** The DB run claim precedes spawning. A browser disconnect never starts a
 * replacement process. Failed/interrupted rows cannot be reset by this API. */
export function launchCliTest(store: CliTestStore, row: CliTestRow, token: string): void {
  if (runtime.__ackrateCliTests!.has(row.id)) return;
  const job = execute(store, row, token).finally(() => runtime.__ackrateCliTests!.delete(row.id));
  runtime.__ackrateCliTests!.set(row.id, job);
  void job.catch(() => undefined);
}

async function execute(store: CliTestStore, initial: CliTestRow, token: string): Promise<void> {
  let row = initial;
  let logs = `ACKRATE CLI ${CLI_TEST_VERSION} · source ${CLI_TEST_SOURCE}\nMainnet · three purchases at 0.01 USDC · maximum 0.03 USDC\n`;
  let queue = Promise.resolve();
  const save = (patch: CliTestPatch) => {
    queue = queue.then(async () => { row = await store.update(row.id, token, row.version, patch); });
    return queue;
  };
  try {
    const directory = join(tmpdir(), "ackrate-cli-paid", row.id);
    await mkdir(join(directory, "bin"), { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    // Narrow external-signing adapter, not the Stellar CLI executable.
    const adapter = join(directory, "bin", "stellar");
    await symlink(relative(dirname(adapter), join(process.cwd(), "scripts", "cli-test-signer.mjs")), adapter);
    const bundle = join(process.cwd(), "vendor", "ackrate-cli-test.mjs");
    const manifest = JSON.parse(await readFile(join(process.cwd(), "vendor", "cli-test-build.json"), "utf8")) as { sha256: string; version: string; sourceCommit: string };
    if (manifest.version !== CLI_TEST_VERSION || manifest.sourceCommit !== CLI_TEST_SOURCE
      || createHash("sha256").update(await readFile(bundle)).digest("hex") !== manifest.sha256) throw new Error("CLI integrity check failed");
    const secrets = await store.secrets(row.id, token);
    await save({ logs });
    const child = spawn(process.execPath, [bundle, ...cliPaidArguments(row.merchant)], {
      cwd: directory, env: cliPaidEnvironment(directory, secrets, row.merchant), stdio: ["ignore", "pipe", "pipe"],
    });
    const append = (chunk: Buffer) => { logs = cleanCliLog(logs + chunk.toString()); };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    const snapshots = createCliEvidenceHeartbeat(
      async () => cleanCliLog(logs + await receiptEvidence(directory)),
      (snapshot) => save({ logs: snapshot }),
      () => { child.kill("SIGTERM"); },
    );
    const heartbeat = setInterval(() => snapshots.tick(), 2000);
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, 10 * 60_000);
    const code = await new Promise<number | null>((resolve, reject) => {
      child.on("error", reject); child.on("close", resolve);
    }).finally(async () => {
      clearInterval(heartbeat); clearTimeout(timeout);
      await snapshots.stop();
    });
    logs = cleanCliLog(logs + await receiptEvidence(directory));
    const succeeded = code === 0 && logs.includes("Verified result") && logs.includes("3 protected research sources");
    await save({ logs, state: succeeded ? "succeeded" : "failed", finishedAt: Math.floor(Date.now() / 1000),
      ...(succeeded ? {} : { error: timedOut ? "The test timed out. Saved output is retained; do not fund or run it again." : "The CLI stopped before all acceptance checks passed. Keep this run for payment reconciliation." }) });
  } catch {
    try {
      const latest = await store.read(initial.id, token);
      if (latest?.state === "running") await store.update(latest.id, token, latest.version, {
        state: "failed", logs: cleanCliLog(logs), error: "The CLI could not finish. No automatic retry will occur; keep this run for payment reconciliation.", finishedAt: Math.floor(Date.now() / 1000),
      });
    } catch { /* Durable running claim remains closed to another execution. */ }
  }
}

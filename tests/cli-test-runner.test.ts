import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import { CLI_TEST_SOURCE, CLI_TEST_VERSION, cleanCliLog, cliPaidArguments, cliPaidEnvironment, createCliEvidenceHeartbeat } from "../lib/cli-test-runner";

test("paid command fixes Mainnet, three-cent budget, price and named generated identities", () => {
  const merchant = Keypair.random().publicKey();
  assert.deepEqual(cliPaidArguments(merchant), ["demo", "research-agent", "--network", "mainnet", "--user-signer", "cli-payer", "--agent-signer", "cli-agent", "--agent-secret-env", "CLI_TEST_AGENT_SECRET", "--merchant", merchant, "--budget", "0.03", "--price", "0.01", "--confirm-real-usdc"]);
});

test("paid child gets only scoped actor credentials and a fixed signer path", () => {
  const secrets = { payer: "synthetic-payer", agent: "synthetic-agent", mnemonic: "synthetic funding mnemonic must stay in parent" };
  const env = cliPaidEnvironment("/tmp/synthetic-cli-home", secrets, "synthetic-merchant");
  assert.deepEqual(Object.keys(env).sort(), ["ACKRATE_HOME", "ACKRATE_NETWORK", "CLI_TEST_AGENT_SECRET", "CLI_TEST_MERCHANT_PUBLIC_KEY", "CLI_TEST_PAYER_SECRET", "NODE_ENV", "NO_COLOR", "PATH"]);
  assert.ok(env.PATH?.startsWith("/tmp/synthetic-cli-home/bin:"));
  assert.equal(env.CLI_TEST_PAYER_SECRET, secrets.payer);
  assert.equal(env.CLI_TEST_AGENT_SECRET, secrets.agent);
  assert.equal(env.ACKRATE_NETWORK, "mainnet");
  assert.equal(Object.values(env).includes(secrets.mnemonic), false);
  assert.equal(Object.keys(env).some((key) => /mnemonic|seed|burner/i.test(key)), false);
});

test("test bundle integrity and provenance are explicit, distinct from npm inspection", async () => {
  const manifest = JSON.parse(await readFile(new URL("../vendor/cli-test-build.json", import.meta.url), "utf8"));
  const bundle = await readFile(new URL("../vendor/ackrate-cli-test.mjs", import.meta.url));
  assert.equal(manifest.version, CLI_TEST_VERSION);
  assert.equal(manifest.sourceCommit, CLI_TEST_SOURCE);
  assert.equal(createHash("sha256").update(bundle).digest("hex"), manifest.sha256);
  assert.match(manifest.provenance, /not yet a published npm/);
});

test("logs strip terminal escape sequences and redact generated secret-key strings", () => {
  const key = Keypair.random().secret();
  assert.equal(cleanCliLog(`\x1b[32mhello\x1b[0m ${key}`), "hello [redacted key]");
  assert.equal(cleanCliLog("x".repeat(200_000)).length, 180_000);
});

test("signer runtime symlink uses a relative target", async () => {
  const source = await readFile(new URL("../lib/cli-test-runner.ts", import.meta.url), "utf8");
  assert.match(source, /await symlink\(relative\(dirname\(adapter\), join\(process\.cwd\(\), "scripts", "cli-test-signer\.mjs"\)\), adapter\)/);
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("delayed receipt snapshot drains before success/failure terminal save and cannot overwrite it", async () => {
  for (const state of ["succeeded", "failed"]) {
    const snapshot = deferred<string>();
    const writes: string[] = [];
    let snapshots = 0;
    const heartbeat = createCliEvidenceHeartbeat(
      () => { snapshots++; return snapshot.promise; },
      async (logs) => { writes.push(logs); },
      () => assert.fail("unexpected snapshot failure"),
    );
    heartbeat.tick(); heartbeat.tick();
    await Promise.resolve();
    const final = heartbeat.stop().then(() => { writes.push(`terminal:${state}`); });
    heartbeat.tick();
    await Promise.resolve();
    assert.equal(snapshots, 1);
    assert.deepEqual(writes, []);
    snapshot.resolve("heartbeat:receipts");
    await final;
    heartbeat.tick(); await Promise.resolve();
    assert.deepEqual(writes, ["heartbeat:receipts", `terminal:${state}`]);
    assert.equal(snapshots, 1);
  }
});

test("drain awaits the durable store acknowledgment as well as receipt collection", async () => {
  const acknowledgment = deferred<void>();
  let saving = false;
  let terminalSaved = false;
  const heartbeat = createCliEvidenceHeartbeat(
    async () => "synthetic receipt",
    async () => { saving = true; await acknowledgment.promise; },
    () => assert.fail("unexpected store failure"),
  );
  heartbeat.tick();
  const final = heartbeat.stop().then(() => { terminalSaved = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(saving, true);
  assert.equal(terminalSaved, false);
  acknowledgment.resolve(); await final;
  assert.equal(terminalSaved, true);
});

test("snapshot/store failures block success and stop later heartbeat writes", async () => {
  for (const stage of ["snapshot", "store"]) {
    const failure = new Error(`synthetic ${stage} failure`);
    let attempts = 0;
    let errors = 0;
    const heartbeat = createCliEvidenceHeartbeat(
      async () => { attempts++; if (stage === "snapshot") throw failure; return "receipt"; },
      async () => { throw failure; },
      () => { errors++; },
    );
    heartbeat.tick();
    await assert.rejects(heartbeat.stop(), failure);
    heartbeat.tick(); await Promise.resolve();
    assert.equal(attempts, 1);
    assert.equal(errors, 1);
  }
});

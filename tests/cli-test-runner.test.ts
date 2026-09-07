import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import { CLI_TEST_SOURCE, CLI_TEST_VERSION, cleanCliLog, cliPaidArguments, cliPaidDirectory, cliPaidEnvironment, createCliEvidenceHeartbeat, launchCliTest } from "../lib/cli-test-runner";
import type { CliTestRow, CliTestStore } from "../lib/cli-test-store";
import { CLI_VERSION } from "../lib/cli-runner";

test("paid command fixes Mainnet, three-cent budget, price and named generated identities", () => {
  const merchant = Keypair.random().publicKey();
  assert.deepEqual(cliPaidArguments(merchant), ["demo", "research-agent", "--network", "mainnet", "--user-signer", "cli-payer", "--agent-signer", "cli-agent", "--agent-secret-env", "CLI_TEST_AGENT_SECRET", "--merchant", merchant, "--budget", "0.03", "--price", "0.01", "--confirm-real-usdc"]);
});

test("registered setup resume adds only the exact receipt flag to the unchanged Mainnet command", () => {
  const merchant = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 71)).publicKey();
  const registrationHash = "a41fe8e9cbc237686ff535906caa0290e0c2468662a4e751ba251526d58a77e6";
  assert.deepEqual(cliPaidArguments(merchant, registrationHash), [...cliPaidArguments(merchant), "--resume-setup-registration", registrationHash]);
  for (const invalid of ["", registrationHash.toUpperCase(), "a".repeat(63), "a".repeat(65), "g".repeat(64), "../registration", `${registrationHash}\n`, `${registrationHash} --network testnet`]) {
    assert.throws(() => cliPaidArguments(merchant, invalid), /Invalid registration receipt/);
  }
});

test("registered setup resume uses one separate directory and rejects mismatched contexts before side effects", () => {
  const id = "9f54b4f8-554b-4e92-acfd-4dd25631cbcc";
  const hash = "a41fe8e9cbc237686ff535906caa0290e0c2468662a4e751ba251526d58a77e6";
  assert.equal(cliPaidDirectory(id, "registered-setup-repair-1"), `${cliPaidDirectory(id)}/registered-setup-repair-1`);
  assert.notEqual(cliPaidDirectory(id, "registered-setup-repair-1"), cliPaidDirectory(id, "preflight-repair-1"));
  for (const invalid of ["registered-setup-repair-2", "../registered-setup-repair-1", "/tmp/elsewhere", "registered-setup-repair-1/../original"]) {
    assert.throws(() => cliPaidDirectory(id, invalid as never), /Invalid CLI execution context/);
  }
  const store = new Proxy({} as CliTestStore, { get() { assert.fail("invalid recovery must not touch the store"); } });
  const row = { id, merchant: Keypair.fromRawEd25519Seed(Buffer.alloc(32, 72)).publicKey() } as CliTestRow;
  assert.throws(() => launchCliTest(store, row, "synthetic-token", "registered-setup-repair-1"), /Registration recovery context differs/);
  assert.throws(() => launchCliTest(store, row, "synthetic-token", undefined, hash), /Registration recovery context differs/);
  assert.throws(() => launchCliTest(store, row, "synthetic-token", "preflight-repair-1", hash), /Registration recovery context differs/);
  assert.throws(() => launchCliTest(store, row, "synthetic-token", "registered-setup-repair-1", "../elsewhere"), /Invalid registration receipt/);
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

test("paid and inspection bundles match the published CLI release and pinned source provenance", async () => {
  const manifest = JSON.parse(await readFile(new URL("../vendor/cli-test-build.json", import.meta.url), "utf8"));
  const bundle = await readFile(new URL("../vendor/ackrate-cli-test.mjs", import.meta.url));
  const inspection = await readFile(new URL("../vendor/ackrate-cli.mjs", import.meta.url));
  assert.equal(manifest.version, CLI_TEST_VERSION);
  assert.equal(manifest.sourceCommit, CLI_TEST_SOURCE);
  assert.equal(createHash("sha256").update(bundle).digest("hex"), manifest.sha256);
  assert.equal(CLI_VERSION, CLI_TEST_VERSION);
  assert.deepEqual(inspection, bundle);
  assert.equal(manifest.publishedPackage, "@ackrate/cli@0.2.1");
  assert.equal(manifest.npmIntegrity, "sha512-kVNd5oYGeXaipN3HXCyI1izktSkAbWxtbz+FUuiElpzVs5c73MG+DsXskb9bRocA5VcvQQXjh1AGFkNTzhxhfQ==");
  assert.match(manifest.provenance, /byte-for-byte verified against the public npm/);
  assert.doesNotMatch(manifest.provenance, /not yet|unpublished/);
});

test("logs strip terminal escape sequences and redact generated secret-key strings", () => {
  const key = Keypair.random().secret();
  assert.equal(cleanCliLog(`\x1b[32mhello\x1b[0m ${key}`), "hello [redacted key]");
  assert.equal(cleanCliLog("x".repeat(200_000)).length, 180_000);
  assert.equal(cleanCliLog("Command failed: stellar tx sign AAAAabcd0123+/== --quiet"), "Command failed: stellar tx sign [transaction omitted] --quiet");
});

test("a proven pre-registration repair has a separate bounded directory and preserves the original journal", async () => {
  const id = "9f54b4f8-554b-4e92-acfd-4dd25631cbcc";
  const initial = cliPaidDirectory(id);
  assert.equal(cliPaidDirectory(id, "preflight-repair-1"), `${initial}/preflight-repair-1`);
  assert.throws(() => cliPaidDirectory("../elsewhere"));
  assert.throws(() => cliPaidDirectory(id, "../elsewhere" as never));
  const source = await readFile(new URL("../lib/cli-test-runner.ts", import.meta.url), "utf8");
  assert.match(source, /initial\.logs/);
  assert.doesNotMatch(source, /\b(?:rm|unlink|rmdir)\s*\(/);
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

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { prepareMainnet, runMainnet } from "../starter-kit-src/template/mainnet.mjs";

const merchant = "GBDL5QE7JMO257DZMSZAK2G2FGDD77R54URHT3YU5GMHULAUW5LTQSUN";
const args = ["--user-signer", "user", "--agent-signer", "agent", "--agent-secret-env", "AGENT_SECRET", "--merchant", merchant, "--price", "0.01", "--budget", "0.03", "--confirm-real-usdc"];
const options = { projectRoot: "/tmp/example-starter", nodeVersion: "22.23.3", env: { ACKRATE_HOME: "/tmp/other", AGENT_SECRET: "private-test-value" } };

test("companion fixes Mainnet, forwards explicit roles/consent and isolates private state", async () => {
  const before = structuredClone(options.env);
  const command = prepareMainnet(args, options);
  assert.deepEqual(command.args, ["/tmp/example-starter/node_modules/@ackrate/cli/dist/ackrate-cli.bundle.mjs", "demo", "research-agent", "--network", "mainnet", ...args]);
  assert.equal(command.options.env.ACKRATE_HOME, "/tmp/example-starter/.ackrate-mainnet");
  assert.equal(command.options.env.AGENT_SECRET, "private-test-value");
  assert.deepEqual(options.env, before);
  assert.equal(command.options.shell, false);
  assert.equal(command.options.stdio, "inherit");
  assert.ok(!JSON.stringify(command.args).includes("private-test-value"));
  let invocations = 0;
  const result = await runMainnet(args, { ...options, launch(...actual) {
    invocations++;
    assert.deepEqual(actual, [command.executable, command.args, command.options]);
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("exit", 7, null));
    return child;
  } });
  assert.equal(invocations, 1);
  assert.equal(result.code, 7, "failed/pending CLI run must stay failed without retry");
});

test("missing consent, network/manifest overrides, duplicate and malformed flags never launch", async () => {
  const invalid = [args.slice(0, -1), [...args, "--network", "testnet"], [...args, "--network=mainnet"], [...args, "--manifest", "other.json"], [...args, "--confirm-real-usdc"], [...args, "--price", "0.02"], ["--help", ...args], args.map((value) => value === "user" ? "S" + "A".repeat(55) : value), args.map((value) => value === "AGENT_SECRET" ? "a=b" : value), args.map((value) => value === "0.01" ? "-0.01" : value), args.map((value) => value === merchant ? "not-a-public-key" : value)];
  for (const candidate of invalid) {
    await assert.rejects(runMainnet(candidate, { ...options, launch() { assert.fail("invalid arguments launched a process"); } }));
  }
  await assert.rejects(runMainnet(args, { ...options, nodeVersion: "20.0.0", launch() { assert.fail("old Node launched"); } }), /Node.js 22/);
  const help = await runMainnet(["--help"], { ...options, launch() { assert.fail("help launched"); } });
  assert.match(help.help, /separate published reference runner/);
});

test("generated Research Source Scout reset preserves Mainnet pending evidence", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "reapp-reset-isolation-"));
  try {
    await mkdir(resolve(root, ".ackrate"));
    await mkdir(resolve(root, ".ackrate-mainnet/research-agent-demo"), { recursive: true });
    const evidence = resolve(root, ".ackrate-mainnet/research-agent-demo/pending.json");
    await writeFile(evidence, '{"pending":"keep"}\n');
    const reset = resolve("starters/research-source-scout/src/reset.mjs");
    const env = { ...process.env }; delete env.ACKRATE_STATE_ROOT; delete env.ACKRATE_ARCHIVE_ROOT;
    const result = spawnSync(process.execPath, [reset], { cwd: root, env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(evidence, "utf8"), '{"pending":"keep"}\n');
    const override = spawnSync(process.execPath, [reset], { cwd: root, env: { ...env, ACKRATE_STATE_ROOT: ".ackrate-mainnet" }, encoding: "utf8" });
    assert.notEqual(override.status, 0);
    assert.equal(await readFile(evidence, "utf8"), '{"pending":"keep"}\n');
    const starter = JSON.parse(await readFile("starters/research-source-scout/package.json", "utf8"));
    assert.equal(starter.scripts["demo:mainnet"], "node src/mainnet.mjs");
    assert.equal(starter.dependencies["@ackrate/cli"], "0.2.1");
    assert.equal(await readFile("starters/research-source-scout/src/mainnet.mjs", "utf8"), await readFile("starter-kit-src/template/mainnet.mjs", "utf8"));
    assert.match(await readFile("starters/research-source-scout/.gitignore", "utf8"), /^\.ackrate-mainnet\/$/m);
  } finally { await rm(root, { recursive: true, force: true }); }
});

 test("entry point explains missing consent without implying any transaction started", () => {
  const result = spawnSync(process.execPath, [resolve("starter-kit-src/template/mainnet.mjs")], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Mainnet requires explicit --confirm-real-usdc; no transaction was started/);
  assert.doesNotMatch(result.stderr, /preserve|recovery/i);
});

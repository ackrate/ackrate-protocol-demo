import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { mainnetCliArguments, mainnetCliEnvironment } from "../lib/cli-runner.js";

test("hosted CLI accepts inspection commands and normalizes Mainnet initialization", () => {
  for (const args of [
    ["--version"],
    ["--help"],
    ["demo", "--help"],
    ["init", "--help"],
    ["init", "--network", "mainnet"],
    ["setup"],
    ["pay", "--help"],
    ["settlement", "reconcile"],
    ["ops", "combine", "--help"],
  ]) assert.deepEqual(mainnetCliArguments(args), args);

  assert.deepEqual(mainnetCliArguments(["init"]), ["init", "--network", "mainnet"]);
  assert.deepEqual(mainnetCliArguments(["demo", "research-agent"]), ["demo", "research-agent", "--network", "mainnet"]);
  assert.deepEqual(mainnetCliArguments(["demo", "research-agent", "--network", "mainnet"]), ["demo", "research-agent", "--network", "mainnet"]);
});

test("hosted CLI rejects real-value confirmation and signer configuration", () => {
  const forbidden = [
    ["pay", "--confirm-real-usdc"],
    ["demo", "research-agent", "--network", "mainnet", "--confirm-real-usdc"],
    ["--confirm-real-usdc", "demo", "research-agent"],
    ["mandate", "create", "--confirm-real-usdc"],
    ["init", "--network", "mainnet", "--user-signer", "operator"],
    ["init", "--network", "mainnet", "--agent-signer", "agent"],
    ["demo", "research-agent", "--agent-secret-env", "SYNTHETIC_KEY_NAME"],
    ["demo", "research-agent", "--manifest", "/tmp/deployment.json"],
    ["init", "--merchant", "not-an-account"],
    ["pay", "0.01"],
    ["settlement", "acknowledge", "a".repeat(64)],
  ];
  for (const args of forbidden) assert.equal(mainnetCliArguments(args), null, JSON.stringify(args));
});

test("hosted CLI permits only exact argument arrays, not paths, shell syntax, or alternate networks", () => {
  const forbidden = [
    ["init", "--network", "testnet"],
    ["demo", "research-agent", "--network", "testnet"],
    ["init", "--network=mainnet"],
    ["init", "--network", "MAINNET"],
    ["--network", "mainnet", "init"],
    ["init", "--network", "mainnet", "--network", "testnet"],
    ["--help", "--confirm-real-usdc"],
    ["--version", "unexpected"],
    ["init", "--", "--network", "mainnet"],
    ["/usr/bin/env", "node"],
    ["../../vendor/ackrate-cli.mjs", "--help"],
    ["--help; touch /tmp/never-created"],
    ["--help", ";", "echo", "synthetic"],
    ["$(echo synthetic)"],
    ["`echo synthetic`"],
    ["--help", "|", "sh"],
    [" --help"],
    ["--help\n"],
    ["--help\0"],
    ["demo research-agent"],
  ];
  for (const args of forbidden) assert.equal(mainnetCliArguments(args), null, JSON.stringify(args));
});

test("hosted CLI rejects malformed values without coercion", () => {
  const malformed: unknown[] = [
    undefined, null, true, 0, "--help", {}, { args: ["--help"] },
    [], [null], [undefined], [1], [false], [["--help"]],
    ["--help", null], new Array(1), new Uint8Array([1]),
  ];
  for (const value of malformed) assert.equal(mainnetCliArguments(value), null);
});

test("argument normalization does not mutate requests or share reusable command arrays", () => {
  const input = Object.freeze(["init"]);
  const result = mainnetCliArguments(input);
  assert.deepEqual(input, ["init"]);
  assert.deepEqual(result, ["init", "--network", "mainnet"]);
  result!.push("--confirm-real-usdc");
  assert.deepEqual(mainnetCliArguments(input), ["init", "--network", "mainnet"]);
});

test("child environment is Mainnet production configuration without inherited production secrets", (t) => {
  const syntheticSecretName = `ACKRATE_CLI_TEST_SECRET_${randomUUID().replaceAll("-", "")}`;
  process.env[syntheticSecretName] = "synthetic-test-value-not-a-credential";
  t.after(() => { delete process.env[syntheticSecretName]; });
  const child = mainnetCliEnvironment("/tmp/ackrate-cli-test-session");

  // Assert names independently so a regression cannot print inherited secret values.
  assert.deepEqual(Object.keys(child).sort(), ["ACKRATE_HOME", "ACKRATE_NETWORK", "FORCE_COLOR", "NODE_ENV"]);
  assert.equal(child.NODE_ENV, "production");
  assert.equal(child.ACKRATE_HOME, "/tmp/ackrate-cli-test-session");
  assert.equal(child.ACKRATE_NETWORK, "mainnet");
  assert.equal(child.FORCE_COLOR, "1");
  for (const name of [
    syntheticSecretName, "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "DATABASE_URL",
    "ACKRATE_AGENT_SECRET", "STELLAR_SECRET_KEY", "NODE_OPTIONS", "PATH", "HOME",
  ]) assert.equal(Object.hasOwn(child, name), false, `child must not inherit ${name}`);

  child.ACKRATE_HOME = "/tmp/changed-only-in-test";
  assert.equal(mainnetCliEnvironment("/tmp/another-test-session").ACKRATE_HOME, "/tmp/another-test-session");
});

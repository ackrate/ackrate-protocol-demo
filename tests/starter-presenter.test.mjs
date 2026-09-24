import assert from "node:assert/strict";
import test from "node:test";
import { createDemoLogger } from "../starter-kit-src/shared/presenter.mjs";

test("compact logger retains setup and payment receipts without exposing event payloads", () => {
  const lines = [];
  const logger = createDemoLogger({ write: (line) => lines.push(line) });
  logger.onEvent({ type: "run_started", secret: "do-not-print" });
  logger.onEvent({ type: "mandate_ready", registerTx: "a".repeat(64), approveTx: "b".repeat(64) });
  logger.onEvent({ type: "delivery_accepted", txHash: "c".repeat(64), explorer: "https://untrusted.example", proof: "private-proof" });
  logger.onEvent({ type: "negative_path_verified" });
  logger.finish({ delivered: 1 });
  assert.equal(lines.length, 6);
  assert.ok(lines.every((line) => !line.includes("\n")));
  for (const hash of ["a", "b", "c"]) assert.ok(lines.some((line) => line.includes(`https://stellar.expert/explorer/testnet/tx/${hash.repeat(64)}`)));
  assert.match(lines.at(-1), /1 paid result; evidence in \.ackrate\//);
  assert.doesNotMatch(lines.join("\n"), /do-not-print|private-proof|untrusted|1 paid results/);
});

test("unrecognized events and malformed hashes cannot print secrets or invented receipt links", () => {
  const lines = [];
  const logger = createDemoLogger({ write: (line) => lines.push(line) });
  for (const event of [null, undefined, { type: "secret-event", secret: "hidden" }, { type: "delivery_accepted", txHash: "not-a-hash", explorer: "https://untrusted.example" }]) {
    assert.doesNotThrow(() => logger.onEvent(event));
  }
  assert.deepEqual(lines, []);
  assert.throws(() => logger.finish({ delivered: -1 }), /invalid/);
});

test("a broken terminal cannot interrupt setup, runtime events, or completion", () => {
  const logger = createDemoLogger({ write() { throw new Error("terminal closed"); } });
  assert.doesNotThrow(() => logger.onEvent({ type: "run_started" }));
  assert.doesNotThrow(() => logger.onEvent({ type: "delivery_accepted", txHash: "a".repeat(64) }));
  assert.doesNotThrow(() => logger.finish({ delivered: 3 }));
});

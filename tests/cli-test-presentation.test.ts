import assert from "node:assert/strict";
import test from "node:test";
import { presentCliTestLogs } from "../lib/cli-test-presentation";

const link = (hash: string, host = "stellar.expert") => `\x1b]8;;https://${host}/explorer/public/tx/${hash}\x07short hash\x1b]8;;\x07`;
test("shows the latest run, retains earlier output separately and hides no downloadable evidence", () => {
  const input = `\nACKRATE CLI old\nold error\nACKRATE CLI new\nmarket delivered after verified payment tx=${link("a".repeat(64))}\nVerified result\n\nSaved reference-agent evidence\n{\"full\":true}`;
  const result = presentCliTestLogs(input);
  assert.match(result.prior, /old error/);
  assert.doesNotMatch(result.output, /old error|Saved reference|\x1b|\x07/);
  assert.match(result.output, /Verified result/);
  assert.deepEqual(result.receipts, [{ label: "Market · 0.01 USDC", hash: "a".repeat(64), payment: true }]);
  assert.match(input, /\{"full":true\}/);
});
test("labels all five receipts by their actual log fields, not URL order", () => {
  const result = presentCliTestLogs(`ACKRATE CLI new\nnews delivered after verified payment tx=${link("e".repeat(64))}\nregister=${link("a".repeat(64))} allowance=${link("b".repeat(64))}\nacademic delivered after verified payment tx=${link("d".repeat(64))}\nmarket delivered after verified payment tx=${link("c".repeat(64))}`);
  assert.deepEqual(result.receipts.map(({ hash }) => hash[0]), ["a", "b", "c", "d", "e"]);
  assert.equal(result.receipts.filter(({ payment }) => payment).length, 3);
});
test("never invents receipts or accepts other hosts, malformed hashes or stale attempt receipts", () => {
  for (const value of ["", link("a".repeat(63)), link("g".repeat(64)), link("a".repeat(64), "evil.example"), `${link("a".repeat(64))}\nACKRATE CLI new\nno receipt`]) {
    assert.deepEqual(presentCliTestLogs(`market delivered after verified payment tx=${value}`).receipts, []);
  }
});

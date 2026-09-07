import assert from "node:assert/strict";
import test from "node:test";
import { cliLogParts, cliLogText, cliReceiptLinks, shortCliHash } from "../lib/cli-test-links";

const HASH = "0123456789abcdef".repeat(4);
const SECOND = "a".repeat(64);
const THIRD = "b".repeat(64);
const url = (hash = HASH) => `https://stellar.expert/explorer/public/tx/${hash}`;
const osc = (href: string, label: string, end = "\x07") => `\x1b]8;;${href}${end}${label}\x1b]8;;${end}`;

test("official explorer plain URLs and OSC8 BEL/ST links become compact structured anchors", () => {
  assert.equal(shortCliHash(HASH), "012345…cdef");
  for (const input of [url(), osc(url(), "long untrusted label"), osc(url(), "long untrusted label", "\x1b\\")]) {
    const parts = cliLogParts(`before ${input} after`);
    const links = parts.filter((part) => part.href);
    assert.equal(links.length, 1);
    assert.deepEqual(links[0], { text: shortCliHash(HASH), hash: HASH, href: url() });
    assert.match(parts.map((part) => part.text).join(""), /^before .* after$/);
    assert.doesNotMatch(parts.map((part) => part.text).join(""), /\x1b|\x07|https:\/\//);
  }
});

test("download text retains full valid explorer addresses without terminal controls", () => {
  const value = `\x1b[32mregistered\x1b[0m ${osc(url(), "short")}\r\npaid ${osc(url(SECOND), "short", "\x1b\\")}\nplain ${url(THIRD)}`;
  const text = cliLogText(value);
  for (const hash of [HASH, SECOND, THIRD]) assert.ok(text.includes(url(hash)));
  assert.doesNotMatch(text, /\x1b|\x07|\r/);
  assert.match(text, /registered/);
});

test("only exact official HTTPS transaction targets become links, never hostile OSC8 labels or hosts", () => {
  for (const href of ["javascript:alert(1)", "data:text/html,attack", "file:///tmp/evidence", `http://stellar.expert/explorer/public/tx/${HASH}`,
    `https://stellar.expert.evil.example/explorer/public/tx/${HASH}`, `https://evil.example/explorer/public/tx/${HASH}`,
    `https://stellar.expert@evil.example/explorer/public/tx/${HASH}`, `https://stellar.expert/explorer/testnet/tx/${HASH}`,
    `https://stellar.expert/explorer/public/account/${HASH}`, `https://stellar.expert:443/explorer/public/tx/${HASH}`,
    `${url()}?redirect=evil.example`, `${url()}#fragment`, `${url()}/extra`,
    url("a".repeat(63)), url("g".repeat(64)), url(`${HASH}a`)]) {
    for (const input of [href, osc(href, "<img src=x onerror=alert(1)>"), osc(href, "misleading receipt", "\x1b\\")]) {
      assert.equal(cliLogParts(input).filter((part) => part.href).length, 0, href);
      assert.equal(cliReceiptLinks(input).length, 0, href);
      assert.doesNotMatch(cliLogParts(input).map((part) => part.text).join(""), /\x1b|\x07/);
    }
  }
});

test("parser preserves inert markup as text rather than creating HTML or arbitrary element types", () => {
  const parts = cliLogParts(`<script>alert(1)</script> ${url()} <img src=x>`);
  assert.match(parts.map((part) => part.text).join(""), /<script>alert\(1\)<\/script>/);
  for (const part of parts) {
    assert.deepEqual(Object.keys(part).sort(), part.href ? ["hash", "href", "text"] : ["text"]);
    assert.equal(typeof part.text, "string");
  }
});

test("receipt collection deduplicates repeated plain and OSC8 references including funding", () => {
  const receipts = cliReceiptLinks(`register=${osc(url(), "short")}\nrepeat ${url()}\nallowance=${url(SECOND)}\nmarket delivered after verified payment tx=${url(THIRD)}`, HASH);
  assert.deepEqual(new Set(receipts.map((receipt) => receipt.hash)), new Set([HASH, SECOND, THIRD]));
  assert.equal(receipts.length, 3);
  assert.equal(receipts.find((receipt) => receipt.hash === HASH)?.label, "Funding");
  assert.ok(receipts.every((receipt) => typeof receipt.label === "string" && receipt.label.length > 0 && receipt.label.length < 80));
  assert.deepEqual(cliReceiptLinks("no explorer receipts", "invalid-funding-hash"), []);
});

test("adjacent punctuation and multiple explorer references preserve surrounding readable text", () => {
  const parts = cliLogParts(`(${url()}) and ${url(SECOND)}.\n${url(THIRD)}`);
  assert.deepEqual(parts.filter((part) => part.hash).map((part) => part.hash), [HASH, SECOND, THIRD]);
  const text = parts.map((part) => part.text).join("");
  assert.ok(text.startsWith(`(${shortCliHash(HASH)}) and `));
  assert.ok(text.includes(`${shortCliHash(SECOND)}.\n`));
});

test("terminal title and color controls disappear without damaging line breaks or canonical hashes", () => {
  const input = `\x1b]0;terminal title\x07\x1b[32mverified\x1b[0m\t${url(HASH.toUpperCase())}\r\nnext line`;
  const parts = cliLogParts(input);
  assert.deepEqual(parts.filter((part) => part.href), [{ text: shortCliHash(HASH), hash: HASH, href: url() }]);
  assert.doesNotMatch(parts.map((part) => part.text).join(""), /terminal title|\x1b|\x07|\r/);
  assert.match(parts.map((part) => part.text).join(""), /verified\t.*\nnext line/);
});

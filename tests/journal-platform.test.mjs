import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { FileSettlementReceiptStore, FileRunResultStore, FileBoundRedemptionStore } from "../starter-kit-src/shared/storage.mjs";

test("unsupported starter stores fail at construction before network or disk work", () => {
  const path = join(tmpdir(), `ackrate-platform-${randomUUID()}`, "state.json");
  for (const Store of [FileSettlementReceiptStore, FileRunResultStore, FileBoundRedemptionStore]) {
    if (["linux", "darwin", "freebsd", "openbsd", "netbsd"].includes(process.platform)) {
      assert.doesNotThrow(() => new Store(path));
    } else {
      assert.throws(() => new Store(path), /local POSIX filesystem/);
    }
  }
  assert.equal(existsSync(path), false);
});

import assert from "node:assert/strict";
import test from "node:test";
import { compactWalletRpcResponse } from "../lib/wallet/rpc-response";

test("latest-ledger relay removes unused bulk metadata before returning to the browser", () => {
  const response = {
    jsonrpc: "2.0",
    id: 7,
    result: {
      id: "ledger-id",
      protocolVersion: 27,
      sequence: 64_137_753,
      closeTime: "1787774369",
      headerXdr: "header",
      metadataXdr: "x".repeat(4_000_000),
    },
  };

  assert.deepEqual(compactWalletRpcResponse("getLatestLedger", 200, response), {
    jsonrpc: "2.0",
    id: 7,
    result: {
      id: "ledger-id",
      protocolVersion: 27,
      sequence: 64_137_753,
      closeTime: "1787774369",
    },
  });
});

test("other RPC methods and non-success responses are unchanged", () => {
  const value = { jsonrpc: "2.0", id: 1, result: { metadataXdr: "kept" } };
  assert.equal(compactWalletRpcResponse("simulateTransaction", 200, value), value);
  assert.equal(compactWalletRpcResponse("getLatestLedger", 429, value), value);
});

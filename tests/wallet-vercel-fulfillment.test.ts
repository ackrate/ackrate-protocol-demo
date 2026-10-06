import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import express from "express";
import { serveExpressRequest } from "../lib/express-request";

test("native Vercel-style requests preserve the paid URL and await asynchronous Express completion", async () => {
  const app = express();
  let completed = 0;
  app.get("/api/wallet/source/:id", async (request, response) => {
    await new Promise(resolve => setTimeout(resolve, 15));
    response.set("cache-control", "private, no-store");
    response.status(402).json({ resource: request.originalUrl, proof: request.header("x-payment"), id: request.params.id });
  });
  const server = createServer(async (request, response) => {
    await serveExpressRequest(app, request, response);
    assert.equal(response.writableFinished, true);
    completed++;
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    const path = "/api/wallet/source/search?q=two%20words&_quote=public-test";
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { headers: { "x-payment": "opaque-proof" } });
    assert.equal(response.status, 402);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await response.json(), { resource: path, proof: "opaque-proof", id: "search" });
    assert.equal(completed, 1);
  } finally { server.closeAllConnections(); await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())); }
});

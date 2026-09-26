import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeCrypto from "node:crypto";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as stellar from "@stellar/stellar-sdk";
import { z } from "zod";
import { NextResponse } from "next/server";
import * as http from "../lib/wallet/http";

const origin = "https://reapp.live";
const secret = "synthetic-message-auth-secret-".repeat(2);
const user = stellar.Keypair.random();
const source = (path: string) => ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
function harness(authenticationReady = true) {
  const jar = new Map<string, string>();
  const used = new Set<string>();
  let incomingOrigin = origin;
  const context = { headers: async () => new Headers({ origin: incomingOrigin, host: "reapp.live" }),
    cookies: async () => ({ get: (key: string) => jar.has(key) ? { value: jar.get(key) } : undefined }) };
  const compile = (path: string, modules: Record<string, unknown>) => {
    const module = { exports: {} as any };
    vm.runInNewContext(source(path), { module, exports: module.exports, Buffer, Error, Date,
      process: { env: { NODE_ENV: "production", ACKRATE_APP_ORIGIN: origin } },
      require: (name: string) => { assert.ok(Object.hasOwn(modules, name), `Unexpected import: ${name}`); return modules[name]; },
    }); return module.exports;
  };
  const security = compile("lib/wallet/security.ts", { "node:crypto": nodeCrypto, "@stellar/stellar-sdk": stellar, "next/headers": context });
  const modules = { "@stellar/stellar-sdk": stellar, zod: { z }, "next/headers": context, "next/server": { NextResponse },
    "@/lib/wallet/security": security, "@/lib/wallet/http": http,
    "@/lib/wallet/app-config": { loadAppConfig: () => ({ sessionSecret: secret, public: { network: "mainnet", authenticationReady, ready: false } }) },
    "@/lib/wallet/journal": { consumeChallenge: async (id: string) => { if (used.has(id)) return false; used.add(id); return true; } },
  };
  const challenge = compile("app/api/wallet/auth/challenge/route.ts", modules);
  const verify = compile("app/api/wallet/auth/verify/route.ts", modules);
  const request = (body: unknown) => new Request(`${origin}/api/wallet/auth`, { method: "POST", headers: { "Content-Type": "application/json", origin: incomingOrigin }, body: JSON.stringify(body) });
  return { jar, used, security, challenge, verify, request, setOrigin: (value: string) => { incomingOrigin = value; } };
}

test("real auth handlers issue offline text without account RPC and accept its signature exactly once", async () => {
  const h = harness();
  const response = await h.challenge.POST(h.request({ address: user.publicKey() }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.transactionXdr, undefined);
  assert.match(body.message, /No network fee/);
  const cookie = response.cookies.get(h.security.challengeCookieName());
  assert.ok(cookie?.value);
  h.jar.set(cookie.name, cookie.value);
  const signature = user.signMessage(body.message).toString("base64");
  const verified = await h.verify.POST(h.request({ signature }));
  assert.equal(verified.status, 200);
  assert.equal((await verified.json()).session.address, user.publicKey());
  assert.equal((await h.verify.POST(h.request({ signature }))).status, 401);
});

test("auth handlers reject foreign origins, legacy transaction payloads and wrong-key signatures without consuming a challenge", async () => {
  const h = harness();
  h.setOrigin("https://attacker.test");
  assert.equal((await h.challenge.POST(h.request({ address: user.publicKey() }))).status, 400);
  h.setOrigin(origin);
  const response = await h.challenge.POST(h.request({ address: user.publicKey() }));
  const body = await response.json(); const cookie = response.cookies.get(h.security.challengeCookieName())!;
  h.jar.set(cookie.name, cookie.value);
  assert.equal((await h.verify.POST(h.request({ signedTransactionXdr: "legacy" }))).status, 401);
  assert.equal((await h.verify.POST(h.request({ signature: stellar.Keypair.random().signMessage(body.message).toString("base64") }))).status, 401);
  assert.equal(h.used.size, 0);
  h.setOrigin("https://attacker.test");
  assert.equal((await h.verify.POST(h.request({ signature: user.signMessage(body.message).toString("base64") }))).status, 401);
  assert.equal(h.used.size, 0);
});


test("auth endpoints fail closed when durable sign-in configuration is unavailable", async () => {
  const h = harness(false);
  const issued = await h.challenge.POST(h.request({ address: user.publicKey() }));
  assert.equal(issued.status, 400);
  assert.equal(issued.cookies.get(h.security.challengeCookieName()), undefined);
  assert.equal((await h.verify.POST(h.request({ signature: "a".repeat(88) }))).status, 401);
  assert.equal(h.used.size, 0);
});

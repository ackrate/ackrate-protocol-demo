import assert from "node:assert/strict";
import test from "node:test";
import { UniversalProvider } from "@walletconnect/universal-provider";
import { Keypair } from "@stellar/stellar-sdk";
import { prepareMobileSigningProvider } from "../lib/wallet/walletconnect-provider";

const address = Keypair.random().publicKey();
const chain = "stellar:pubnet";
const namespace = () => ({ accounts: [`${chain}:${address}`], chains: [chain],
  methods: ["stellar_signXDR", "stellar_signMessage"], events: ["accountsChanged"] });

/** Actual installed SDK with an in-memory SignClient boundary: no relay, RPC, wallet or secrets. */
async function restored(completeCache = false) {
  const approved = namespace();
  const session = { topic: "synthetic-restored-session", expiry: Math.floor(Date.now() / 1000) + 3600,
    namespaces: { stellar: approved } };
  const calls: unknown[] = [];
  const client = { core: { projectId: "1".repeat(32), storage: {
    getItem: async (key: string) => completeCache && key.includes("/namespaces") ? { stellar: approved } : {},
  } }, session: { getAll: () => [session] }, on: () => {},
  request: async (request: unknown) => { calls.push(request); return { signature: "synthetic-proof" }; } };
  const provider = await UniversalProvider.init({ projectId: "1".repeat(32), disableProviderPing: true,
    logger: "silent", client: client as unknown as InstanceType<typeof UniversalProvider>["client"] });
  return { provider, calls, approved };
}

test("restored SDK session without provider cache fails locally until approved routing is hydrated", async () => {
  const { provider, calls } = await restored();
  const request = { method: "stellar_signMessage", params: { message: "Synthetic offline challenge" } };
  await assert.rejects(provider.request(request, chain), /includes/);
  assert.equal(calls.length, 0);
  prepareMobileSigningProvider(provider, chain, address);
  assert.deepEqual(await provider.request(request, chain), { signature: "synthetic-proof" });
  assert.deepEqual(calls, [{ request, chainId: chain, topic: "synthetic-restored-session", expiry: undefined }]);
  await provider.request({ method: "stellar_signXDR", params: { xdr: "synthetic-payload" } }, chain);
  assert.equal(calls.length, 2);
});

test("complete SDK routing stays usable and preparation is idempotent", async () => {
  const { provider, calls } = await restored(true);
  const original = provider.rpcProviders.stellar.namespace;
  prepareMobileSigningProvider(provider, chain, address);
  prepareMobileSigningProvider(provider, chain, address);
  assert.equal(provider.rpcProviders.stellar.namespace, original);
  assert.equal(calls.length, 0);
});

test("routing recovery does not authorize a missing method, wrong account, wrong chain or expired session", async () => {
  for (const kind of ["method", "account", "chain", "expiry"] as const) {
    const { provider, calls } = await restored();
    if (kind === "method") provider.session!.namespaces.stellar.methods = ["stellar_signXDR"];
    if (kind === "account") provider.session!.namespaces.stellar.accounts = [`${chain}:${Keypair.random().publicKey()}`];
    if (kind === "chain") provider.session!.namespaces.stellar.accounts = [`stellar:testnet:${address}`];
    if (kind === "expiry") provider.session!.expiry = 0;
    assert.throws(() => prepareMobileSigningProvider(provider, chain, address));
    assert.equal(provider.rpcProviders.stellar.namespace.methods, undefined);
    assert.equal(calls.length, 0);
  }
});

test("missing subprovider or incompatible configured namespace fails closed", async () => {
  const missing = await restored();
  delete missing.provider.rpcProviders.stellar;
  assert.throws(() => prepareMobileSigningProvider(missing.provider, chain, address), /incomplete/);
  const mismatch = await restored();
  mismatch.provider.namespaces = { eip155: { methods: [], chains: ["eip155:1"], events: [] } };
  assert.throws(() => prepareMobileSigningProvider(mismatch.provider, chain, address), /incomplete/);
  assert.equal(missing.calls.length + mismatch.calls.length, 0);
});


test("stale routing cannot introduce an unapproved method, account or chain", async () => {
  for (const kind of ["method", "account", "chain"] as const) {
    const { provider, calls } = await restored(true);
    if (kind === "method") provider.rpcProviders.stellar.namespace.methods = ["stellar_signAndSubmitXDR"];
    if (kind === "account") provider.rpcProviders.stellar.namespace.accounts = [`${chain}:${Keypair.random().publicKey()}`];
    if (kind === "chain") provider.rpcProviders.stellar.namespace.chains = ["stellar:testnet"];
    assert.throws(() => prepareMobileSigningProvider(provider, chain, address), /does not match/);
    assert.equal(calls.length, 0);
  }
});


test("accountless approved chains do not poison the post-sign routing check", async () => {
  const { provider, calls } = await restored();
  provider.session!.namespaces.stellar.chains!.push("stellar:testnet");
  prepareMobileSigningProvider(provider, chain, address);
  await provider.request({ method: "stellar_signMessage", params: { message: "Synthetic offline challenge" } }, chain);
  prepareMobileSigningProvider(provider, chain, address);
  assert.deepEqual(provider.rpcProviders.stellar.namespace.chains, [chain]);
  assert.equal(calls.length, 1);
});

test("partial routing is hydrated before signing can fall back to HTTP RPC", async () => {
  const { provider, calls } = await restored();
  provider.rpcProviders.stellar.namespace.methods = ["stellar_signXDR"];
  let httpCalls = 0;
  const rejectHttpFallback = async () => {
    httpCalls += 1;
    throw new Error("Synthetic HTTP fallback must not receive the sign-in challenge");
  };
  provider.rpcProviders.stellar.httpProviders.pubnet.request = rejectHttpFallback;
  const request = { method: "stellar_signMessage", params: { message: "Synthetic offline challenge" } };
  await assert.rejects(provider.request(request, chain), /Synthetic HTTP fallback/);
  assert.equal(httpCalls, 1);
  assert.equal(calls.length, 0);
  prepareMobileSigningProvider(provider, chain, address);
  provider.rpcProviders.stellar.httpProviders.pubnet.request = rejectHttpFallback;
  await provider.request(request, chain);
  prepareMobileSigningProvider(provider, chain, address);
  assert.equal(httpCalls, 1);
  assert.equal(calls.length, 1);
});

test("extra wallet-approved methods remain permissions, not additional app requests", async () => {
  const { provider, calls } = await restored();
  provider.session!.namespaces.stellar.methods.push("stellar_signAndSubmitXDR");
  prepareMobileSigningProvider(provider, chain, address);
  await provider.request({ method: "stellar_signMessage", params: { message: "Synthetic offline challenge" } }, chain);
  prepareMobileSigningProvider(provider, chain, address);
  assert.equal(provider.rpcProviders.stellar.namespace.methods.includes("stellar_signAndSubmitXDR"), true);
  assert.deepEqual(calls.map((call) => (call as { request: { method: string } }).request.method), ["stellar_signMessage"]);
});

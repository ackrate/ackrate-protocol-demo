/**
 * Server-side glue around the PUBLISHED @reapp-sdk/core. Runs only in API
 * routes (Node). Ephemeral testnet keys, this is a demo, never mainnet.
 */
import { Keypair } from "@stellar/stellar-sdk";
import { reapp, type CreateIntentMandateInput } from "@reapp-sdk/core";
import { TESTNET, token } from "@reapp-sdk/stellar";
import { EXPLORER_BASE } from "./explorer";
import { log } from "./log";
import { journaledPay } from "./payment-journal";

export const EXPLORER = EXPLORER_BASE;
export const UNLOCK_PRICE = "1.00"; // XLM per content unlock
export const BUDGET = "3.00"; // mandate cap: 3 unlocks, then the contract blocks the 4th

const short = (s: string) => (s ? `${s.slice(0, 6)}…${s.slice(-4)}` : "");

const HORIZON = "https://horizon-testnet.stellar.org";
/** Every request is individually bounded so a stalled socket cannot hang the route. */
const REQUEST_TIMEOUT_MS = 8_000;
const FUNDING_DEADLINE_MS = 25_000;

async function friendbot(pub: string): Promise<void> {
  await fetch(`https://friendbot.stellar.org/?addr=${pub}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).catch(() => undefined);
}

/**
 * Friendbot failures used to be swallowed and followed by an unconditional
 * "accounts funded + settled" line, so a faucet outage was reported to the page
 * as success. Ask whether the account actually exists instead of sleeping and
 * assuming.
 *
 * Both Horizon and the Soroban RPC are polled: Horizon ingesting the account
 * does not mean the RPC the SDK is about to call can read it yet, and returning
 * on Horizon alone reintroduces that race in a different place.
 */
async function waitForAccount(pub: string, deadlineMs = FUNDING_DEADLINE_MS): Promise<void> {
  const bounded = (url: string, init?: RequestInit) =>
    fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
      .then((response) => response.ok)
      .catch(() => false);

  const giveUpAt = Date.now() + deadlineMs;
  while (Date.now() < giveUpAt) {
    if (await bounded(`${HORIZON}/accounts/${pub}`)) {
      const rpcReady = await bounded(TESTNET.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
      });
      if (rpcReady) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(
    `testnet funding did not complete for ${short(pub)} — friendbot may be rate limited or down; retry in a moment`,
  );
}

const xlm = (stroops: bigint) => Number(stroops) / 1e7;

/** Create + fund the three demo actors on testnet. */
export async function init() {
  const user = Keypair.random();
  const agent = Keypair.random();
  const merchant = Keypair.random();
  log.step("funding 3 fresh testnet accounts via friendbot", {
    user: short(user.publicKey()),
    agent: short(agent.publicKey()),
    merchant: short(merchant.publicKey()),
  });
  await Promise.all([
    friendbot(user.publicKey()),
    friendbot(agent.publicKey()),
    friendbot(merchant.publicKey()),
  ]);
  await Promise.all([
    waitForAccount(user.publicKey()),
    waitForAccount(agent.publicKey()),
    waitForAccount(merchant.publicKey()),
  ]);
  log.chain("accounts funded + settled");
  return {
    userSecret: user.secret(),
    userPublic: user.publicKey(),
    agentSecret: agent.secret(),
    agentPublic: agent.publicKey(),
    merchantSecret: merchant.secret(),
    merchantPublic: merchant.publicKey(),
    contractId: TESTNET.mandateRegistryId,
    explorer: EXPLORER,
  };
}

/** The mandate inputs the client round-trips so the server can rebuild the
 *  exact same mandate (same nonce, same id) on every action. */
export type MandateInputs = CreateIntentMandateInput;

/** Register the mandate + approve the SEP-41 allowance (user-signed). */
export async function setup(args: {
  userSecret: string;
  agentPublic: string;
  merchantPublic: string;
}) {
  const inputs: MandateInputs = {
    user: Keypair.fromSecret(args.userSecret).publicKey(),
    agent: args.agentPublic,
    merchant: args.merchantPublic,
    asset: reapp.testnet.nativeSac,
    maxAmount: BUDGET,
    expiry: Math.floor(Date.now() / 1000) + 3600,
    nonce: `${Date.now()}:${Math.random().toString(36).slice(2)}`,
  };
  const mandate = reapp.createIntentMandate(inputs);
  log.step("authorizing mandate", { budget: `${BUDGET} XLM`, merchant: short(args.merchantPublic), id: short(mandate.id) });
  const registerTx = await reapp.registerMandate(mandate, { signer: args.userSecret });
  log.chain("register_mandate confirmed", { tx: short(registerTx) });
  const approveTx = await reapp.approveBudget(mandate, { signer: args.userSecret });
  log.chain("approveBudget confirmed (SEP-41 allowance to contract)", { tx: short(approveTx) });
  return { inputs, mandateId: mandate.id, registerTx, approveTx };
}

/** Agent pays the unlock price. Returns the tx hash, or throws if the contract
 *  rejects it (overspend, revoked, expired), which is the whole point. */
export async function pay(args: { inputs: MandateInputs; agentSecret: string; amount?: string; expectedSeq: number }) {
  const amount = args.amount ?? UNLOCK_PRICE;
  const mandate = reapp.createIntentMandate(args.inputs); // same nonce, same id
  log.step("execute_payment (agent-signed)", { amount: `${amount} XLM`, mandate: short(mandate.id) });
  const hash = await journaledPay(
    reapp.agent({ mandate, signer: args.agentSecret }),
    amount,
    `server:${mandate.id}:${args.expectedSeq}`,
    args.expectedSeq,
  );
  log.chain("payment settled on-chain", { tx: short(hash) });
  return { hash };
}

/** User revokes the mandate. */
export async function revoke(args: { inputs: MandateInputs; userSecret: string }) {
  const mandate = reapp.createIntentMandate(args.inputs);
  log.step("revoke_mandate (user-signed)", { mandate: short(mandate.id) });
  const hash = await reapp.revokeMandate(mandate, { signer: args.userSecret });
  log.chain("mandate revoked on-chain", { tx: short(hash) });
  return { hash };
}

/** Read XLM balances for the demo actors. */
export async function balances(args: { userPublic: string; merchantPublic: string }) {
  const asset = reapp.testnet.nativeSac;
  const [user, merchant] = await Promise.all([
    token.balance(TESTNET, asset, args.userPublic).catch(() => 0n),
    token.balance(TESTNET, asset, args.merchantPublic).catch(() => 0n),
  ]);
  log.info("balances read", { user: xlm(user).toFixed(2), merchant: xlm(merchant).toFixed(2) });
  return { user: xlm(user), merchant: xlm(merchant) };
}

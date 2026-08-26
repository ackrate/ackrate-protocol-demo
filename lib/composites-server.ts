/**
 * Composite-mandate (clearing pool) demo orchestration. Runs only in API
 * routes (Node). Drives the full group-buy lifecycle on Stellar testnet
 * against the composite MandateRegistry deployment and yields typed
 * progress events, mirroring the research agent's generator pattern.
 *
 * The scenario, from the composite spec: a vendor minimum of 9 units and
 * 40.5 XLM order value; three independent buyers each sign the rule
 * "3 units at 5 XLM, or 1 at 10 XLM" and commit it to the pool. At the
 * deadline anyone closes the auction; the contract computes the one minimal
 * uniform price (4.5 XLM, below every posted tier) and settles all legs in a
 * single transaction. Ephemeral keys, friendbot funding, testnet only.
 */
import { randomBytes } from "node:crypto";
import { Keypair, rpc } from "@stellar/stellar-sdk";
import { keypairSigner, token, TESTNET } from "@ackrate/stellar";
import { Client, networks, type ClearOutcome, type ClearingKind } from "./composites-client";
import { log } from "./log";

export const COMPOSITES_CONTRACT_ID = networks.testnet.contractId;

// Amounts in stroops (7 decimals).
const TIER_LOW_PRICE = 50_000_000n; //  5 XLM per unit at the low tier
const TIER_LOW_QTY = 3n; // up to 3 units at the low tier
const TIER_HIGH_PRICE = 100_000_000n; // 10 XLM for a single unit
const TIER_HIGH_QTY = 1n;
const THRESHOLD_QTY = 9n;
const THRESHOLD_VALUE = 405_000_000n; // 40.5 XLM vendor minimum order value
const CHILD_MAX = 200_000_000n; // 20 XLM signed budget ceiling (worst case is 15)
const ALLOWANCE = 200_000_000n;
const BUYERS = 3;
// The auction close. Long enough for funding + three buyers' transactions
// (parallel register/approve, then sequential commits with retries) even on a
// slow testnet day, short enough that the countdown is watchable. The happy
// path takes ~40s; the margin is for congestion, and the early-clear probe
// additionally guards against overrun (see below).
const DEADLINE_SECS = 150;

const xlm = (stroops: bigint | number) => Number(stroops) / 1e7;

export type CompositeEvent =
  | { type: "status"; text: string }
  | { type: "setup"; contractId: string; merchant: string; buyers: string[] }
  | {
      type: "pool";
      poolId: string;
      hash: string;
      thresholdQty: number;
      thresholdValueXlm: number;
      deadline: number; // unix seconds, SERVER clock — display only
      secondsToClose: number; // countdown anchor, immune to client clock skew
    }
  | { type: "buyer_step"; buyer: number; step: "register" | "approve" | "commit"; hash: string }
  | { type: "buyer_ready"; buyer: number; units: number }
  | {
      type: "simulate";
      fires: boolean;
      priceXlm: number;
      totalQty: number;
      netXlm: number;
      legs: { buyer: number; qty: number; legXlm: number }[];
    }
  | { type: "early_clear_rejected"; reason: string }
  | { type: "countdown"; secondsLeft: number }
  | {
      type: "cleared";
      hash: string;
      priceXlm: number;
      totalQty: number;
      totalXlm: number;
      legs: { buyer: number; qty: number; legXlm: number }[];
    }
  | { type: "balances"; merchantDeltaXlm: number; buyerSpentXlm: number[] }
  | { type: "double_clear_rejected"; reason: string }
  | { type: "error"; message: string }
  | { type: "done" };

/** Map a Soroban contract error in a message to the demo's explanation. */
function contractReason(msg: string): string {
  if (msg.includes("#29")) return "DeadlineNotReached · capture is only valid at or after the close";
  if (msg.includes("#12")) return "PoolNotOpen · the pool is already terminal";
  if (msg.includes("#16")) return "DeadlinePassed · the auction closed before this step landed; run it again";
  if (msg.includes("#21")) return "InsufficientFunds · an account could not cover its worst-case leg";
  return "rejected on-chain";
}

/**
 * Investor-facing message for an unexpected failure: contract errors map
 * through contractReason; infrastructure noise collapses to one readable line
 * (raw Soroban simulation diagnostics mean nothing on a projector).
 */
export function humanizeError(msg: string): string {
  if (msg.includes("Error(Contract")) return contractReason(msg);
  if (/faucet|friendbot/i.test(msg)) return msg;
  if (/account not found|txNoAccount/i.test(msg)) {
    return "a demo account was not funded in time (testnet faucet); run it again in a minute";
  }
  const line = msg.split("\n")[0].trim();
  return line.length > 160 ? `${line.slice(0, 157)}…` : line;
}

function client(secret: Keypair | string): Client {
  const signer = keypairSigner(secret, TESTNET.networkPassphrase);
  return new Client({
    contractId: COMPOSITES_CONTRACT_ID,
    rpcUrl: TESTNET.rpcUrl,
    networkPassphrase: TESTNET.networkPassphrase,
    publicKey: signer.publicKey,
    signTransaction: signer.signTransaction,
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fund via friendbot with retries; a 400 means "already funded", which is fine. */
async function friendbot(pub: string): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(`https://friendbot.stellar.org/?addr=${pub}`);
      if (r.ok || r.status === 400) return;
    } catch {
      // transient network failure; retry below
    }
    await sleep(1500 * (attempt + 1));
  }
  // ensureFunded below does the authoritative check; friendbot sometimes
  // funds despite an error response.
}

/**
 * The authoritative funding check: poll the RPC until every account exists.
 * Friendbot is the demo's ONLY funding path, so a rate-limited faucet must
 * surface as a readable message, not as a raw "account not found" much later.
 */
async function ensureFunded(pubs: string[]): Promise<void> {
  const server = new rpc.Server(TESTNET.rpcUrl);
  for (const pub of pubs) {
    let found = false;
    for (let i = 0; i < 10 && !found; i++) {
      try {
        await server.getAccount(pub);
        found = true;
      } catch {
        await sleep(1500);
      }
    }
    if (!found) {
      throw new Error(
        "the testnet faucet could not fund a demo account (likely rate-limited); wait a minute and run it again",
      );
    }
  }
}

/** Send a mutating contract call and return its tx hash (result unwrapped). */
async function send<T>(at: {
  signAndSend: () => Promise<{
    result: { unwrap: () => T };
    sendTransactionResponse?: { hash: string };
  }>;
}): Promise<{ value: T; hash: string }> {
  const sent = await at.signAndSend();
  const value = sent.result.unwrap();
  return { value, hash: sent.sendTransactionResponse?.hash ?? "" };
}

export async function* runGroupBuy(): AsyncGenerator<CompositeEvent> {
  yield { type: "status", text: "Creating and funding five testnet accounts (coordinator, merchant, three buyers)…" };

  const coordinator = Keypair.random();
  const merchant = Keypair.random();
  const buyers = Array.from({ length: BUYERS }, () => Keypair.random());
  const everyone = [coordinator, merchant, ...buyers].map((k) => k.publicKey());
  await Promise.all(everyone.map((pub) => friendbot(pub)));
  await ensureFunded(everyone);
  const sac = TESTNET.nativeSac;
  yield {
    type: "setup",
    contractId: COMPOSITES_CONTRACT_ID,
    merchant: merchant.publicKey(),
    buyers: buyers.map((b) => b.publicKey()),
  };

  // 1 · The vendor minimum goes on-chain. The pool id commits to these exact
  // terms (sha256 of their XDR), and this is the last special signature the
  // pool ever requires; everything after it is permissionless.
  const deadline = Math.floor(Date.now() / 1000) + DEADLINE_SECS;
  yield { type: "status", text: "register_pool · the vendor minimum and the close time go on-chain" };
  const coordClient = client(coordinator);
  const pool = await send(
    await coordClient.register_pool(
      {
        originator: coordinator.publicKey(),
        merchant: merchant.publicKey(),
        asset: sac,
        kind: { tag: "ThresholdFloor", values: undefined } as ClearingKind,
        threshold_qty: THRESHOLD_QTY,
        threshold_value: THRESHOLD_VALUE,
        min_child_value: 0n,
        clearing_deadline: BigInt(deadline),
        nonce: randomBytes(32),
      },
      { timeoutInSeconds: 60 },
    ),
  );
  const poolId = pool.value as Buffer;
  log.chain("pool registered", { pool: poolId.toString("hex").slice(0, 10) });
  yield {
    type: "pool",
    poolId: poolId.toString("hex"),
    hash: pool.hash,
    thresholdQty: Number(THRESHOLD_QTY),
    thresholdValueXlm: xlm(THRESHOLD_VALUE),
    deadline,
    secondsToClose: deadline - Math.floor(Date.now() / 1000),
  };

  // 2 · Three independent buyers join, in parallel: each signs its mandate
  // (schedule + pool binding + budget = the entire capture authorization),
  // approves the SEP-41 allowance to the CONTRACT, then anyone commits it.
  yield { type: "status", text: "Three buyer agents sign, fund, and commit their child mandates…" };
  const vcHashes: Buffer[] = buyers.map(() => randomBytes(32));
  const queue: CompositeEvent[] = [];
  let wake: (() => void) | null = null;
  const emit = (ev: CompositeEvent) => {
    queue.push(ev);
    wake?.();
    wake = null;
  };

  // register + approve touch disjoint ledger entries, so the three buyers can
  // run them in parallel. commit_child writes the SHARED pool + member-list
  // entries, so commits must be sequential: parallel commits contend on the
  // same footprint and all but one fail at the RPC layer.
  const prepBuyer = async (i: number) => {
    const b = buyers[i];
    const c = client(b);
    const reg = await send(
      await c.register_mandate(
        {
          user: b.publicKey(),
          agent: b.publicKey(),
          merchant: merchant.publicKey(),
          asset: sac,
          max_amount: CHILD_MAX,
          expiry: BigInt(deadline + 86_400 + 3_600), // past the capture window
          vc_hash: vcHashes[i],
          pool_id: poolId,
          price_schedule: [
            { unit_price: TIER_LOW_PRICE, max_qty: TIER_LOW_QTY },
            { unit_price: TIER_HIGH_PRICE, max_qty: TIER_HIGH_QTY },
          ],
        },
        { timeoutInSeconds: 60 },
      ),
    );
    emit({ type: "buyer_step", buyer: i, step: "register", hash: reg.hash });
    const approveHash = await token.approve(
      TESTNET,
      sac,
      b,
      COMPOSITES_CONTRACT_ID,
      ALLOWANCE,
    );
    emit({ type: "buyer_step", buyer: i, step: "approve", hash: approveHash });
  };

  let joining = true;
  const joins = Promise.all(buyers.map((_, i) => prepBuyer(i))).finally(() => {
    joining = false;
    wake?.();
    wake = null;
  });
  // If the consumer tears the generator down at the drain-loop yield (viewer
  // disconnect), `await joins` below never runs — this handler keeps a buyer
  // failure from becoming an unhandled promise rejection in that window.
  joins.catch(() => {});
  while (joining || queue.length > 0) {
    if (queue.length === 0) await new Promise<void>((r) => (wake = r));
    while (queue.length > 0) yield queue.shift()!;
  }
  await joins; // surface a buyer failure as the stream error

  for (let i = 0; i < buyers.length; i++) {
    const c = client(buyers[i]);
    let commit: { hash: string } | null = null;
    for (let attempt = 0; attempt < 3 && !commit; attempt++) {
      try {
        commit = await send(await c.commit_child({ mandate_id: vcHashes[i] }, { timeoutInSeconds: 60 }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("Error(Contract")) throw e; // typed rejection: real, do not retry
        if (attempt === 2) throw e;
        await sleep(3000); // transient RPC contention; retry
      }
    }
    yield { type: "buyer_step", buyer: i, step: "commit", hash: commit!.hash };
    yield { type: "buyer_ready", buyer: i, units: Number(TIER_LOW_QTY) };
    log.chain(`buyer ${i + 1} committed`, { tx: commit!.hash.slice(0, 10) });
  }

  // 3 · The allocation anyone can recompute: simulate_clear runs the same
  // pure clearing function capture will run, over the same ledger state.
  const buyerIndexById = new Map(vcHashes.map((h, i) => [h.toString("hex"), i]));
  const outcomeLegs = (o: ClearOutcome) =>
    o.allocations.map((a) => ({
      buyer: buyerIndexById.get(Buffer.from(a.mandate_id).toString("hex")) ?? -1,
      qty: Number(a.qty),
      legXlm: xlm(o.clearing_price * a.qty),
    }));
  const sim = (await coordClient.simulate_clear({ pool_id: poolId })).result.unwrap();
  yield {
    type: "simulate",
    fires: sim.fires,
    priceXlm: xlm(sim.clearing_price),
    totalQty: Number(sim.total_qty),
    netXlm: xlm(sim.net_value),
    legs: outcomeLegs(sim),
  };

  // 4 · Feasible is not clearable: before the close, capture is refused, so
  // being first to fire earns nobody a better price. Only meaningful while
  // genuinely early — on a very slow testnet day the close may already have
  // passed, and "testing" the rejection would actually capture; skip the probe
  // rather than misreport a successful settlement as an error.
  if (Math.floor(Date.now() / 1000) < deadline - 10) {
    try {
      await send(await coordClient.clear_pool({ pool_id: poolId }, { timeoutInSeconds: 60 }));
      yield { type: "error", message: "pre-deadline clear unexpectedly succeeded" };
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      yield { type: "early_clear_rejected", reason: contractReason(msg) };
    }
  } else {
    yield {
      type: "status",
      text: "Testnet ran slow and the close is already here; skipping the early-capture rejection proof this run.",
    };
  }

  // 5 · Wait out the deadline auction.
  for (;;) {
    const left = deadline - Math.floor(Date.now() / 1000);
    if (left <= 0) break;
    yield { type: "countdown", secondsLeft: left };
    await sleep(Math.min(left, 5) * 1000);
  }
  yield { type: "countdown", secondsLeft: 0 };
  await sleep(6000); // let ledger close time pass the deadline

  // 6 · Anyone closes the auction. One transaction settles every leg; a
  // single failed leg would revert all of them.
  yield { type: "status", text: "clear_pool · closing the auction and settling every leg atomically" };
  const before = await token.balance(TESTNET, sac, merchant.publicKey()).catch(() => null);
  let clearedHash = "";
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await send(await coordClient.clear_pool({ pool_id: poolId }, { timeoutInSeconds: 60 }));
      clearedHash = r.hash;
      break;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("#29") && attempt < 3) {
        await sleep(4000); // ledger clock a step behind wall clock
        continue;
      }
      throw e;
    }
  }
  log.chain("pool cleared", { tx: clearedHash.slice(0, 10) });

  // Read the captured legs back from the chain rather than trusting our own
  // simulation: spent on each child is the leg the contract actually took.
  const legs: { buyer: number; qty: number; legXlm: number }[] = [];
  const buyerSpentXlm: number[] = [];
  for (let i = 0; i < buyers.length; i++) {
    const m = (await coordClient.get_mandate({ mandate_id: vcHashes[i] })).result.unwrap();
    buyerSpentXlm.push(xlm(m.spent));
    legs.push({
      buyer: i,
      qty: sim.clearing_price > 0n ? Number(m.spent / sim.clearing_price) : 0,
      legXlm: xlm(m.spent),
    });
  }
  const after = await token.balance(TESTNET, sac, merchant.publicKey()).catch(() => null);
  // The headline total comes from the chain's own truth (each child's spent),
  // never from balance reads that can transiently fail. The balance delta is
  // supplementary confirmation and falls back to the same truth if either
  // read failed (a 0n fallback here once produced a ±10,000 XLM "delta").
  const totalXlm = buyerSpentXlm.reduce((a, b) => a + b, 0);
  const merchantDeltaXlm = before !== null && after !== null ? xlm(after - before) : totalXlm;
  yield {
    type: "cleared",
    hash: clearedHash,
    priceXlm: xlm(sim.clearing_price),
    totalQty: Number(sim.total_qty),
    totalXlm,
    legs,
  };
  yield { type: "balances", merchantDeltaXlm, buyerSpentXlm };

  // 7 · Idempotent capture: a second clear on the terminal pool is refused.
  try {
    await send(await coordClient.clear_pool({ pool_id: poolId }, { timeoutInSeconds: 60 }));
    yield { type: "error", message: "double clear unexpectedly succeeded" };
    return;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    yield { type: "double_clear_rejected", reason: contractReason(msg) };
  }

  yield { type: "done" };
}

import { createHash, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { resolve } from "node:path";
import {
  BOUND_PAYMENT_CAPABILITY,
  BOUND_PAYMENT_SCHEME,
  DeliveryPendingError,
  PaymentRejectedError,
  ACKRATE_PAYMENT_CAPABILITIES_HEADER,
  SettlementUncertainError,
  createBoundPaymentProof,
  createSettlementReceiptId,
  parse402,
  ackrate,
  toStroops,
} from "@ackrate/core";
import { keypairSigner, registryClient } from "@ackrate/stellar";
import { fetchWithTimeout } from "./http.mjs";
import {
  FileBoundRedemptionStore,
  FileRunResultStore,
  FileSettlementReceiptStore,
} from "./storage.mjs";
import {
  validateExactOrigin,
  validateMerchant,
  validatePositiveAmount,
  validateRequestPath,
} from "./config.mjs";

const verifiedBoundQuotes = new WeakSet();
const consumedBoundQuotes = new WeakSet();
const canonicalMandates = new WeakSet();
const boundConsumerContexts = new WeakMap();
export const MINIMUM_BOUND_QUOTE_REMAINING_SECONDS = 300;
const MINIMUM_POST_SETTLEMENT_DELIVERY_SECONDS = 120;
const RESOLVED_TERMINAL_BODY = Object.freeze({
  ok: false,
  error: "paid fulfillment failed after settlement",
  deliveryState: "terminal",
});

export function canonicalMandateSnapshot(value) {
  if (canonicalMandates.has(value)) return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("mandate must be an object");
  }
  const id = typeof value.id === "string" ? value.id.toLowerCase() : "";
  let idBytes;
  try {
    idBytes = Buffer.from(value.idBuffer);
  } catch {
    throw new Error("mandate idBuffer must contain the canonical 32-byte id");
  }
  if (
    !/^[0-9a-f]{64}$/.test(id)
    || idBytes.length !== 32
    || idBytes.toString("hex") !== id
  ) {
    throw new Error("mandate id and idBuffer do not match exactly");
  }
  const user = validateMerchant(value.user, "mandate user");
  const agent = validateMerchant(value.agent, "mandate agent");
  const merchant = validateMerchant(value.merchant, "mandate merchant");
  if (typeof value.asset !== "string" || value.asset.trim() !== value.asset || !value.asset) {
    throw new Error("mandate asset must be an exact contract address");
  }
  if (typeof value.maxAmount !== "bigint" || value.maxAmount <= 0n) {
    throw new Error("mandate maxAmount must be a positive bigint");
  }
  if (!Number.isSafeInteger(value.expiry) || value.expiry <= 0) {
    throw new Error("mandate expiry must be a positive whole Unix timestamp");
  }
  if (!Number.isInteger(value.decimals) || value.decimals < 0 || value.decimals > 38) {
    throw new Error("mandate decimals must be an integer from 0 through 38");
  }
  const snapshot = {
    id,
    user,
    agent,
    merchant,
    asset: value.asset,
    maxAmount: value.maxAmount,
    expiry: value.expiry,
    decimals: value.decimals,
  };
  Object.defineProperty(snapshot, "idBuffer", {
    enumerable: true,
    configurable: false,
    get() {
      return Buffer.from(idBytes);
    },
  });
  Object.freeze(snapshot);
  canonicalMandates.add(snapshot);
  return snapshot;
}

function validatePaidTarget(url, label = "paid URL") {
  const target = new URL(url);
  if (target.username || target.password || target.hash) {
    throw new Error(`${label} cannot contain credentials or a fragment`);
  }
  validateExactOrigin(target.origin, `${label} origin`);
  validateRequestPath(`${target.pathname}${target.search}`, `${label} path`);
  return target;
}

export function createRunStores(stateRoot = resolve(".ackrate")) {
  const root = resolve(stateRoot);
  return Object.freeze({
    stateRoot: root,
    receiptStore: new FileSettlementReceiptStore(resolve(root, "pending-receipts.json")),
    resultStore: new FileRunResultStore(resolve(root, "results.json")),
    redemptionStore: new FileBoundRedemptionStore(resolve(root, "fulfillment-redemptions.json")),
  });
}

export async function assertNoUnresolvedReceipts(receiptStore) {
  const pending = await receiptStore.listPending();
  if (pending.length === 0) return;
  const hashes = pending.map((receipt) => receipt.txHash).join(", ");
  throw new Error(
    `unresolved payment evidence exists (${hashes}); reconcile the exact stored receipt before any new payment`,
  );
}

export async function setupTestnetMandate({
  user,
  agent,
  merchant,
  budgetXlm,
  expiry = Math.floor(Date.now() / 1_000) + 3_600,
  nonce = randomUUID(),
}) {
  validateMerchant(merchant, "merchant");
  validatePositiveAmount(budgetXlm, 7, "mandate budget");
  if (!Number.isSafeInteger(expiry) || expiry <= Math.floor(Date.now() / 1_000)) {
    throw new Error("mandate expiry must be a future whole Unix timestamp");
  }
  const mandate = canonicalMandateSnapshot(ackrate.createIntentMandate({
    user: user.publicKey(),
    agent: agent.publicKey(),
    merchant,
    asset: ackrate.testnet.nativeSac,
    maxAmount: budgetXlm,
    expiry,
    nonce,
  }));
  const registerTx = await ackrate.registerMandate(mandate, { signer: user });
  const approveTx = await ackrate.approveBudget(mandate, { signer: user });
  return Object.freeze({ mandate, registerTx, approveTx });
}

export function createBoundTestnetConsumer({ mandate, agent, receiptStore }) {
  if (!receiptStore) throw new Error("a durable settlement receipt store is required");
  const checkedMandate = canonicalMandateSnapshot(mandate);
  if (!agent || typeof agent.publicKey !== "function" || agent.publicKey() !== checkedMandate.agent) {
    throw new Error("consumer signer does not match the canonical mandate agent");
  }
  const sdkAgent = ackrate.agent({
    mandate: checkedMandate,
    signer: agent,
    proofPolicy: "bound-v2-only",
    receiptStore,
  });
  for (const method of [
    "pay",
    "retryDelivery",
    "acknowledgeDelivery",
    "reconcilePendingSettlement",
  ]) {
    if (typeof sdkAgent?.[method] !== "function") {
      throw new Error(`ACKRATE consumer is missing required method ${method}`);
    }
  }
  const context = Object.freeze({
    pay: sdkAgent.pay.bind(sdkAgent),
    retryDelivery: sdkAgent.retryDelivery.bind(sdkAgent),
    acknowledgeDelivery: sdkAgent.acknowledgeDelivery.bind(sdkAgent),
    reconcilePendingSettlement: sdkAgent.reconcilePendingSettlement.bind(sdkAgent),
  });
  boundConsumerContexts.set(context, Object.freeze({
    mandate: checkedMandate,
    signer: agent,
    receiptStore,
  }));
  return context;
}

export async function verifyExactBound402({
  url,
  merchant,
  amount,
  timeoutMs = 30_000,
}) {
  const target = validatePaidTarget(url);
  validateMerchant(merchant, "merchant");
  validatePositiveAmount(amount, 7, "price");
  const expectedResource = validateRequestPath(`${target.pathname}${target.search}`);
  const response = await fetchWithTimeout(target, {
    method: "GET",
    headers: {
      accept: "application/json",
      [ACKRATE_PAYMENT_CAPABILITIES_HEADER]: BOUND_PAYMENT_CAPABILITY,
    },
    redirect: "error",
  }, timeoutMs);
  if (response.status !== 402) {
    throw new Error(`unpaid GET returned HTTP ${response.status}; expected 402`);
  }

  const requirement = await parse402(response);
  const challenge = requirement.challenge;
  const now = Math.floor(Date.now() / 1_000);
  const expectedNetworkId = createHash("sha256")
    .update(ackrate.testnet.networkPassphrase, "utf8")
    .digest("hex");
  const exact = requirement.scheme === BOUND_PAYMENT_SCHEME
    && requirement.network === "stellar-testnet"
    && requirement.amount === amount
    && requirement.asset === ackrate.testnet.nativeSac
    && requirement.payTo === merchant
    && requirement.resource === expectedResource
    && requirement.contract === ackrate.testnet.mandateRegistryId
    && requirement.proofVersion === 2
    && challenge?.proofVersion === 2
    && challenge.scheme === BOUND_PAYMENT_SCHEME
    && challenge.audience === target.origin
    && challenge.method === "GET"
    && challenge.resource === expectedResource
    && challenge.bodySha256 === null
    && challenge.network === "stellar-testnet"
    && challenge.networkId === expectedNetworkId
    && challenge.registryId === ackrate.testnet.mandateRegistryId
    && challenge.merchant === merchant
    && challenge.asset === ackrate.testnet.nativeSac
    && challenge.amountStroops === toStroops(amount, 7).toString()
    && challenge.decimals === 7
    && challenge.issuedAt <= now + 60
    && challenge.expiresAt > now
    && challenge.expiresAt - challenge.issuedAt >= 30
    && challenge.expiresAt - challenge.issuedAt <= 3_600
    && challenge.authorization?.algorithm === "hmac-sha256"
    && typeof challenge.authorization.mac === "string"
    && challenge.authorization.mac.length > 0;
  if (!exact) {
    throw new Error("402 challenge did not match the exact GET, merchant, amount, asset, network, and contract");
  }
  const frozenChallenge = Object.freeze({
    ...challenge,
    authorization: Object.freeze({ ...challenge.authorization }),
  });
  const frozenRequirement = Object.freeze({ ...requirement, challenge: frozenChallenge });
  const quote = Object.freeze({ requirement: frozenRequirement, challenge: frozenChallenge });
  verifiedBoundQuotes.add(quote);
  return quote;
}

function createExactBoundReceipt({ mandate, signer, url, requirement, settlement }) {
  const proof = Object.freeze(createBoundPaymentProof({
    challenge: requirement.challenge,
    txHash: settlement.txHash,
    mandateId: mandate.id,
    signer,
  }));
  const withoutId = Object.freeze({
    proofVersion: 2,
    url,
    method: "GET",
    txHash: settlement.txHash,
    mandateId: mandate.id,
    amount: requirement.amount,
    submittedAt: settlement.submittedAt,
    validUntil: settlement.validUntil,
    proof,
  });
  return Object.freeze({
    receiptId: createSettlementReceiptId(withoutId),
    ...withoutId,
  });
}

async function submitExactBoundPayment({
  consumer,
  mandate,
  url,
  quote,
  expectedContractCode,
}) {
  if (
    expectedContractCode !== undefined
    && ![4, 5, 6].includes(expectedContractCode)
  ) {
    throw new Error("expected contract rejection code is not supported");
  }
  const binding = boundConsumerContexts.get(consumer);
  if (!binding || binding.mandate !== mandate) {
    throw new Error("exact payment requires the consumer bound to this canonical mandate");
  }
  const { signer, receiptStore } = binding;
  const target = validatePaidTarget(url);
  if (
    !quote
    || !verifiedBoundQuotes.has(quote)
    || consumedBoundQuotes.has(quote)
    || quote.requirement?.proofVersion !== 2
    || quote.challenge !== quote.requirement.challenge
    || quote.challenge?.audience !== target.origin
    || quote.challenge?.resource !== `${target.pathname}${target.search}`
  ) {
    throw new Error("an exact verified bound-v2 quote for this URL is required");
  }
  if (
    !mandate
    || typeof mandate !== "object"
    || !canonicalMandates.has(mandate)
    || typeof mandate.id !== "string"
    || !/^[0-9a-f]{64}$/.test(mandate.id)
    || typeof mandate.agent !== "string"
    || typeof mandate.merchant !== "string"
    || typeof mandate.asset !== "string"
    || !Number.isInteger(mandate.decimals)
  ) {
    throw new Error("a complete canonical mandate is required for exact payment");
  }
  if (!signer || typeof signer.publicKey !== "function" || signer.publicKey() !== mandate.agent) {
    throw new Error("exact payment signer does not match the mandate agent");
  }
  if (
    quote.requirement.payTo !== mandate.merchant
    || quote.requirement.asset !== mandate.asset
    || quote.requirement.contract !== ackrate.testnet.mandateRegistryId
    || quote.requirement.network !== "stellar-testnet"
    || quote.challenge.registryId !== ackrate.testnet.mandateRegistryId
    || quote.challenge.merchant !== mandate.merchant
    || quote.challenge.asset !== mandate.asset
    || quote.challenge.decimals !== mandate.decimals
  ) {
    throw new Error("verified quote does not match the mandate and configured testnet registry");
  }
  const now = Math.floor(Date.now() / 1_000);
  if (quote.challenge.expiresAt - now < MINIMUM_BOUND_QUOTE_REMAINING_SECONDS) {
    throw new Error(
      `verified quote needs at least ${MINIMUM_BOUND_QUOTE_REMAINING_SECONDS} seconds remaining before payment`,
    );
  }
  consumedBoundQuotes.add(quote);

  let receipt;
  const savePrepared = async (settlement) => {
    const preparedNow = Math.floor(Date.now() / 1_000);
    if (
      settlement?.mandateId !== mandate.id
      || settlement.amount !== quote.requirement.amount
      || !Number.isSafeInteger(settlement.submittedAt)
      || !Number.isSafeInteger(settlement.validUntil)
      || settlement.submittedAt < quote.challenge.issuedAt - 60
      || settlement.submittedAt > preparedNow + 60
      || settlement.validUntil <= settlement.submittedAt
      || settlement.validUntil + MINIMUM_POST_SETTLEMENT_DELIVERY_SECONDS >= quote.challenge.expiresAt
    ) {
      throw new Error("prepared settlement does not match the mandate, quote, or safe delivery window");
    }
    receipt = createExactBoundReceipt({
      mandate,
      signer,
      url,
      requirement: quote.requirement,
      settlement,
    });
    await receiptStore.savePending(receipt);
    return receipt.receiptId;
  };

  try {
    await consumer.pay(quote.requirement.amount, {
      holdUntilDelivery: true,
      onPrepared: savePrepared,
      onSubmitted: () => receipt?.receiptId,
    });
  } catch (cause) {
    if (cause instanceof SettlementUncertainError) {
      receipt ??= createExactBoundReceipt({
        mandate,
        signer,
        url,
        requirement: quote.requirement,
        settlement: cause.settlement,
      });
      throw new DeliveryPendingError(receipt, cause);
    }
    if (
      !receipt
      && expectedContractCode !== undefined
      && isExactSimulationContractRejection(cause, expectedContractCode)
    ) {
      throw new PaymentRejectedError(mandate.id, cause);
    }
    if (receipt) await receiptStore.clearPending(receipt.receiptId).catch(() => undefined);
    throw cause;
  }
  if (!receipt) {
    throw new Error("payment completed without durable exact settlement evidence");
  }
  return receipt;
}

async function commitAndAcknowledge({
  response,
  receipt,
  url,
  validateDelivery,
  commitDelivery,
  consumer,
}) {
  try {
    const body = await response.json();
    const value = await validateDelivery(Object.freeze({ body, receipt, url }));
    await commitDelivery(Object.freeze({ body, value, receipt, url }));
    await consumer.acknowledgeDelivery(receipt);
    return Object.freeze({ body, value, receipt });
  } catch (error) {
    if (error instanceof DeliveryPendingError) throw error;
    throw new DeliveryPendingError(receipt, error);
  }
}

function validateDeliveryCallbacks(validateDelivery, commitDelivery) {
  if (typeof validateDelivery !== "function") {
    throw new Error("validateDelivery must independently validate the complete paid response");
  }
  if (typeof commitDelivery !== "function") {
    throw new Error("commitDelivery must durably and idempotently store delivery before acknowledgment");
  }
}

/**
 * Pay the exact challenge that was inspected by `verifyExactBound402`. There is
 * no second 402 lookup, so a changed quote cannot silently become the paid
 * amount. The signed challenge and durable receipt are created before broadcast.
 */
export async function purchaseVerifiedBoundJson({
  consumer,
  mandate,
  url,
  quote,
  validateDelivery,
  commitDelivery,
}) {
  validateDeliveryCallbacks(validateDelivery, commitDelivery);
  const receipt = await submitExactBoundPayment({
    consumer,
    mandate,
    url,
    quote,
  });
  const response = await consumer.retryDelivery(receipt, {
    method: "GET",
    headers: { accept: "application/json" },
    redirect: "error",
  });
  if (response.status !== 200) {
    throw new DeliveryPendingError(
      receipt,
      new Error(`paid GET returned HTTP ${response.status}; expected 200`),
    );
  }
  return commitAndAcknowledge({
    response,
    receipt,
    url,
    validateDelivery,
    commitDelivery,
    consumer,
  });
}

export async function expectVerifiedBudgetRejection({
  consumer,
  mandate,
  url,
  quote,
}) {
  return expectVerifiedContractRejection({
    consumer,
    mandate,
    url,
    quote,
    contractCode: 6,
    kind: "contract-budget-rejection",
  });
}

async function expectVerifiedContractRejection({
  consumer,
  mandate,
  url,
  quote,
  contractCode,
  kind,
}) {
  try {
    const receipt = await submitExactBoundPayment({
      consumer,
      mandate,
      url,
      quote,
      expectedContractCode: contractCode,
    });
    throw new DeliveryPendingError(
      receipt,
      new Error(`payment unexpectedly settled when contract error ${contractCode} was required`),
    );
  } catch (error) {
    if (isExactContractRejection(error, mandate.id, contractCode)) {
      return Object.freeze({
        kind,
        contractCode,
        mandateId: mandate.id,
        url,
      });
    }
    throw error;
  }
}

export async function expectVerifiedExpiryRejection(options) {
  return expectVerifiedContractRejection({
    ...options,
    contractCode: 4,
    kind: "contract-expiry-rejection",
  });
}

export async function expectVerifiedRevocationRejection(options) {
  return expectVerifiedContractRejection({
    ...options,
    contractCode: 5,
    kind: "contract-revocation-rejection",
  });
}

export async function recoverBoundJson({
  consumer,
  receipt,
  validateDelivery,
  commitDelivery,
}) {
  validateDeliveryCallbacks(validateDelivery, commitDelivery);
  validatePaidTarget(receipt?.url, "recovery URL");
  const binding = boundConsumerContexts.get(consumer);
  if (!binding || binding.mandate.id !== receipt?.mandateId) {
    throw new Error("recovery requires the consumer bound to this receipt's canonical mandate");
  }
  if (receipt.proofVersion !== 2 || receipt.method !== "GET") {
    throw new Error("only an exact bound-v2 GET receipt can be recovered");
  }
  const response = await consumer.retryDelivery(receipt, {
    method: "GET",
    headers: { accept: "application/json" },
    redirect: "error",
  });
  if (response.status !== 200) {
    throw new DeliveryPendingError(
      receipt,
      new Error(`recovered GET returned HTTP ${response.status}; expected 200`),
    );
  }
  return commitAndAcknowledge({
    response,
    receipt,
    url: receipt.url,
    validateDelivery,
    commitDelivery,
    consumer,
  });
}

/**
 * After an operator resolves a genuinely stranded server execution, recover
 * and durably record the package's exact terminal JSON before releasing the
 * client's pending receipt. This never creates another payment.
 */
export async function acknowledgeResolvedTerminalBoundJson({
  consumer,
  receipt,
  commitTerminal,
}) {
  if (typeof commitTerminal !== "function") {
    throw new Error("commitTerminal must durably record the resolved terminal result");
  }
  validatePaidTarget(receipt?.url, "terminal recovery URL");
  const binding = boundConsumerContexts.get(consumer);
  if (!binding || binding.mandate.id !== receipt?.mandateId) {
    throw new Error("terminal recovery requires the consumer bound to this receipt's mandate");
  }
  if (receipt.proofVersion !== 2 || receipt.method !== "GET") {
    throw new Error("only an exact bound-v2 GET receipt can recover a terminal result");
  }
  const response = await consumer.retryDelivery(receipt, {
    method: "GET",
    headers: { accept: "application/json" },
    redirect: "error",
  });
  if (response.status !== 200) {
    throw new DeliveryPendingError(
      receipt,
      new Error(`terminal recovery returned HTTP ${response.status}; expected 200`),
    );
  }

  try {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > 1_048_576) {
      throw new Error("resolved terminal response has an invalid byte length");
    }
    const text = bytes.toString("utf8");
    const body = JSON.parse(text);
    if (
      JSON.stringify(body) !== JSON.stringify(RESOLVED_TERMINAL_BODY)
      || text !== JSON.stringify(RESOLVED_TERMINAL_BODY)
    ) {
      throw new Error("recovered response is not the exact immutable terminal result");
    }
    const evidence = Object.freeze({
      receiptId: receipt.receiptId,
      txHash: receipt.txHash,
      mandateId: receipt.mandateId,
      bodySha256: createHash("sha256").update(bytes).digest("hex"),
      deliveryState: "terminal",
    });
    await commitTerminal(evidence);
    await consumer.acknowledgeDelivery(receipt);
    return evidence;
  } catch (error) {
    if (error instanceof DeliveryPendingError) throw error;
    throw new DeliveryPendingError(receipt, error);
  }
}

function isExactSimulationContractRejection(error, contractCode) {
  if (
    !(error instanceof Error)
    || !Number.isInteger(contractCode)
    || contractCode < 1
    || !/^Transaction simulation failed:\s*["']?HostError:/i.test(error.message)
  ) return false;
  const codes = [...error.message.matchAll(/Error\(Contract,\s*#(\d+)\)/g)]
    .map((match) => Number(match[1]));
  return codes.length > 0 && codes.every((code) => code === contractCode);
}

function isExactContractRejection(error, mandateId, contractCode) {
  if (
    !(error instanceof PaymentRejectedError)
    || typeof mandateId !== "string"
    || error.mandateId !== mandateId
    || !Number.isInteger(contractCode)
    || contractCode < 1
  ) return false;
  const cause = error.cause instanceof Error ? error.cause.message : String(error.cause ?? "");
  const match = cause.match(/Error\(Contract,\s*#(\d+)\)/);
  return match !== null && Number(match[1]) === contractCode;
}

export function isBudgetRejection(error, mandateId) {
  return isExactContractRejection(error, mandateId, 6);
}

export function isExpiryRejection(error, mandateId) {
  return isExactContractRejection(error, mandateId, 4);
}

export function isRevocationRejection(error, mandateId) {
  return isExactContractRejection(error, mandateId, 5);
}

export async function readTestnetMandateState({ mandate, source, testLoadMandate }) {
  const checkedMandate = canonicalMandateSnapshot(mandate);
  if (testLoadMandate !== undefined && typeof testLoadMandate !== "function") {
    throw new Error("testLoadMandate must be a function when provided");
  }

  let stored;
  if (testLoadMandate) {
    stored = await testLoadMandate(checkedMandate.idBuffer);
  } else {
    if (!source) throw new Error("a funded read source is required");
    const signer = keypairSigner(source, ackrate.testnet.networkPassphrase);
    const client = registryClient(ackrate.testnet, signer);
    const transaction = await client.get_mandate({
      mandate_id: checkedMandate.idBuffer,
    });
    if (!transaction.result.isOk()) throw new Error("mandate is not registered on testnet");
    stored = transaction.result.unwrap();
  }

  if (
    !stored
    || !Number.isSafeInteger(stored.seq)
    || stored.seq < 0
    || typeof stored.spent !== "bigint"
    || stored.spent < 0n
    || !stored.status
    || typeof stored.status.tag !== "string"
    || !["Active", "Revoked", "Exhausted"].includes(stored.status.tag)
  ) {
    throw new Error("testnet mandate state has an invalid shape");
  }
  return Object.freeze({
    mandateId: checkedMandate.id,
    seq: stored.seq,
    spentStroops: stored.spent.toString(),
    status: stored.status.tag,
  });
}

export function assertMandateStateUnchanged(before, after) {
  for (const field of ["mandateId", "seq", "spentStroops", "status"]) {
    if (before?.[field] !== after?.[field]) {
      throw new Error(`mandate state changed unexpectedly at ${field}`);
    }
  }
  return Object.freeze({
    kind: "mandate-state-unchanged",
    mandateId: after.mandateId,
    seq: after.seq,
    spentStroops: after.spentStroops,
    status: after.status,
  });
}

import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { resolveBoundAckrateInterruptedDelivery } from "@ackrate/express-middleware";
import { FileBoundRedemptionStore } from "./storage.mjs";

export const DEFAULT_INTERRUPTED_DELIVERY_MINIMUM_AGE_SECONDS = 300;
const MAXIMUM_MINIMUM_AGE_SECONDS = 7 * 24 * 60 * 60;

export class InterruptedDeliveryResolutionRefusedError extends Error {
  constructor(reason, details = {}) {
    super(`interrupted delivery resolution refused: ${reason}`);
    this.name = "InterruptedDeliveryResolutionRefusedError";
    this.reason = reason;
    this.details = Object.freeze({ ...details });
  }
}

function captureNow(now) {
  const value = typeof now === "function" ? now() : now;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("operator recovery clock must return whole Unix seconds");
  }
  return value;
}

function validateMinimumAge(value) {
  if (
    !Number.isSafeInteger(value)
    || value < 60
    || value > MAXIMUM_MINIMUM_AGE_SECONDS
  ) {
    throw new Error(
      `minimum interrupted-delivery age must be 60 through ${MAXIMUM_MINIMUM_AGE_SECONDS} seconds`,
    );
  }
  return value;
}

function validateIdentity(identity) {
  if (
    !identity
    || typeof identity !== "object"
    || Array.isArray(identity)
    || typeof identity.key !== "string"
    || identity.key.length < 1
    || identity.key.length > 1_024
    || typeof identity.executionId !== "string"
    || identity.executionId.length < 1
    || identity.executionId.length > 1_024
    || typeof identity.proofDigest !== "string"
    || !/^[0-9a-f]{64}$/.test(identity.proofDigest)
    || typeof identity.txHash !== "string"
    || !/^[0-9a-f]{64}$/.test(identity.txHash)
  ) {
    throw new Error("interrupted delivery identity is invalid");
  }
  return Object.freeze({
    key: identity.key,
    executionId: identity.executionId,
    proofDigest: identity.proofDigest,
    txHash: identity.txHash,
  });
}

export function interruptedDeliveryConfirmation(identity) {
  const checked = validateIdentity(identity);
  const digest = createHash("sha256")
    .update([
      "ackrate-interrupted-delivery-v1",
      checked.key,
      checked.executionId,
      checked.proofDigest,
      checked.txHash,
    ].join("\n"), "utf8")
    .digest("hex");
  return `RESOLVE-INTERRUPTED-DELIVERY:${digest}`;
}

function publicInterruptedRecord(record, now, minimumAgeSeconds) {
  const ageSeconds = now - record.startedAt;
  const identity = validateIdentity({
    key: record.key,
    executionId: record.executionId,
    proofDigest: record.proofDigest,
    txHash: record.payment.txHash,
  });
  return Object.freeze({
    ...identity,
    mandateId: record.payment.mandateId,
    startedAt: record.startedAt,
    ageSeconds,
    eligible: ageSeconds >= minimumAgeSeconds,
    confirmation: interruptedDeliveryConfirmation(identity),
  });
}

export async function inspectInterruptedDeliveries({
  stateRoot = resolve(".ackrate"),
  minimumAgeSeconds = DEFAULT_INTERRUPTED_DELIVERY_MINIMUM_AGE_SECONDS,
  now = () => Math.floor(Date.now() / 1_000),
} = {}) {
  const checkedMinimumAge = validateMinimumAge(minimumAgeSeconds);
  const capturedNow = captureNow(now);
  const store = new FileBoundRedemptionStore(
    resolve(stateRoot, "fulfillment-redemptions.json"),
  );
  const records = (await store.listExecuting())
    .map((record) => publicInterruptedRecord(record, capturedNow, checkedMinimumAge))
    .sort((left, right) => left.key.localeCompare(right.key));
  return Object.freeze({
    capturedAt: capturedNow,
    minimumAgeSeconds: checkedMinimumAge,
    records: Object.freeze(records),
  });
}

export async function resolveInterruptedDelivery({
  stateRoot = resolve(".ackrate"),
  identity,
  confirmation,
  minimumAgeSeconds = DEFAULT_INTERRUPTED_DELIVERY_MINIMUM_AGE_SECONDS,
  now = () => Math.floor(Date.now() / 1_000),
} = {}) {
  const checkedIdentity = validateIdentity(identity);
  const checkedMinimumAge = validateMinimumAge(minimumAgeSeconds);
  const capturedNow = captureNow(now);
  const expectedConfirmation = interruptedDeliveryConfirmation(checkedIdentity);
  if (confirmation !== expectedConfirmation) {
    throw new InterruptedDeliveryResolutionRefusedError("explicit confirmation did not match", {
      key: checkedIdentity.key,
    });
  }

  const store = new FileBoundRedemptionStore(
    resolve(stateRoot, "fulfillment-redemptions.json"),
  );
  const record = (await store.listExecuting())
    .find((candidate) => candidate.key === checkedIdentity.key);
  if (!record) {
    throw new InterruptedDeliveryResolutionRefusedError("the exact execution is not stranded", {
      key: checkedIdentity.key,
    });
  }
  if (
    record.executionId !== checkedIdentity.executionId
    || record.proofDigest !== checkedIdentity.proofDigest
    || record.payment.txHash !== checkedIdentity.txHash
  ) {
    throw new InterruptedDeliveryResolutionRefusedError("execution identity changed", {
      key: checkedIdentity.key,
    });
  }
  const ageSeconds = capturedNow - record.startedAt;
  if (ageSeconds < checkedMinimumAge) {
    throw new InterruptedDeliveryResolutionRefusedError("execution is not old enough", {
      ageSeconds,
      key: checkedIdentity.key,
      minimumAgeSeconds: checkedMinimumAge,
    });
  }

  const completed = await resolveBoundAckrateInterruptedDelivery({
    redemptionStore: store,
    record,
  });
  const durable = await store.lookup(checkedIdentity.key, checkedIdentity.proofDigest);
  if (
    durable.kind !== "completed"
    || durable.record.executionId !== checkedIdentity.executionId
    || durable.record.payment.txHash !== checkedIdentity.txHash
    || durable.record.response.bodySha256 !== completed.response.bodySha256
  ) {
    throw new Error("interrupted delivery terminal result was not durably committed");
  }
  return Object.freeze({
    kind: "resolved-terminal",
    key: checkedIdentity.key,
    executionId: checkedIdentity.executionId,
    proofDigest: checkedIdentity.proofDigest,
    txHash: checkedIdentity.txHash,
    ageSeconds,
    response: Object.freeze({ ...durable.record.response }),
  });
}

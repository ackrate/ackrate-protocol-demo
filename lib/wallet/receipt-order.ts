import { createSettlementReceiptId, type SettlementReceipt } from "@ackrate/core";

/**
 * A settlement receipt's id is a hash over `JSON.stringify` of its payment
 * proof, so the proof's KEY ORDER is part of the receipt's identity.
 *
 * Postgres `jsonb` does not preserve key order — it stores a decomposed,
 * normalized form and returns keys sorted by length then bytes. A receipt
 * written to a `jsonb` column therefore comes back with a re-ordered proof,
 * `createSettlementReceiptId` recomputes a different hash, and the SDK
 * rejects the receipt with "settlement receipt integrity check failed" —
 * stranding a payment that already settled on-chain.
 *
 * New receipts are stored as exact JSON text (see `journal.ts`). Receipts
 * already written as `jsonb` are repaired here: the proof is rebuilt in the
 * order `@ackrate/core` creates it, and the result is accepted only when the
 * recomputed id matches the stored one — which proves the bytes are the
 * original ones.
 */

/** Key order of `createBoundPaymentProofWithSigner`'s challenge literal. */
const CHALLENGE_KEYS = [
  "proofVersion", "challengeId", "audience", "scheme", "method", "resource",
  "bodySha256", "network", "networkId", "registryId", "merchant", "asset",
  "amountStroops", "decimals", "issuedAt", "expiresAt", "authorization",
] as const;
const CHALLENGE_AUTHORIZATION_KEYS = ["algorithm", "mac"] as const;
const BOUND_PROOF_KEYS = [
  "proofVersion", "scheme", "network", "txHash", "mandateId", "challenge", "authorization",
] as const;
const BOUND_PROOF_AUTHORIZATION_KEYS = ["algorithm", "signature"] as const;
const LEGACY_PROOF_KEYS = ["scheme", "network", "txHash", "mandateId", "amount"] as const;

function ordered(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) return null;
    result[key] = source[key];
  }
  /* An unexpected key would be dropped silently; refuse instead. */
  return Object.keys(source).length === keys.length ? result : null;
}

function orderedProof(proof: unknown): Record<string, unknown> | null {
  if (typeof proof !== "object" || proof === null) return null;
  const source = proof as Record<string, unknown>;
  if (source.proofVersion !== 2) return ordered(source, LEGACY_PROOF_KEYS);

  const challenge = ordered(source.challenge, CHALLENGE_KEYS);
  if (!challenge) return null;
  const challengeAuthorization = ordered(challenge.authorization, CHALLENGE_AUTHORIZATION_KEYS);
  if (!challengeAuthorization) return null;
  challenge.authorization = challengeAuthorization;

  const authorization = ordered(source.authorization, BOUND_PROOF_AUTHORIZATION_KEYS);
  if (!authorization) return null;

  const result = ordered(source, BOUND_PROOF_KEYS);
  if (!result) return null;
  result.challenge = challenge;
  result.authorization = authorization;
  return result;
}

/**
 * Return a receipt whose proof carries its original key order, or `null` when
 * the stored value cannot be restored to something the id verifies. Receipts
 * that already verify are returned untouched.
 */
export function restoreReceiptKeyOrder(stored: unknown): SettlementReceipt | null {
  if (typeof stored !== "object" || stored === null) return null;
  const receipt = stored as SettlementReceipt;
  if (typeof receipt.receiptId !== "string" || !receipt.proof) return null;

  const identity = {
    proofVersion: receipt.proofVersion,
    url: receipt.url,
    method: receipt.method,
    txHash: receipt.txHash,
    mandateId: receipt.mandateId,
    amount: receipt.amount,
    submittedAt: receipt.submittedAt,
    validUntil: receipt.validUntil,
  };

  try {
    if (createSettlementReceiptId({ ...identity, proof: receipt.proof }) === receipt.receiptId) {
      return receipt;
    }
    const proof = orderedProof(receipt.proof);
    if (!proof) return null;
    if (createSettlementReceiptId({ ...identity, proof: proof as SettlementReceipt["proof"] }) !== receipt.receiptId) {
      return null;
    }
    /* Rebuild the receipt itself in creation order too, so a repaired record
       is byte-identical to the one the SDK produced. */
    return {
      receiptId: receipt.receiptId,
      ...identity,
      proof: proof as SettlementReceipt["proof"],
    } as SettlementReceipt;
  } catch {
    return null;
  }
}

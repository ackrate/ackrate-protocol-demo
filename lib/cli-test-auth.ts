import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Account, Keypair, Networks, Operation, StrKey, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";

export function cliTestOrigin(request: Request, configured = process.env.ACKRATE_APP_ORIGIN): void {
  const expected = configured || (process.env.NODE_ENV !== "production" ? new URL(request.url).origin : "");
  if (!expected || request.headers.get("origin") !== expected || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new Error("Open this test from its own application page.");
  }
}

export function cliChallenge(owner: string, secret: string, now = Math.floor(Date.now() / 1000)) {
  if (!StrKey.isValidEd25519PublicKey(owner) || secret.length < 32) throw new Error("A valid Mainnet account and configured session secret are required.");
  // Sequence zero cannot be submitted by an existing Stellar account. This is
  // an ownership proof only: no ManageData change or network fee is possible.
  const nonce = randomBytes(32).toString("hex");
  const tx = new TransactionBuilder(new Account(owner, "-1"), { fee: "100", networkPassphrase: Networks.PUBLIC })
    .addOperation(Operation.manageData({ name: "ackrate.cli.auth.v1", value: Buffer.from(nonce, "hex") }))
    .setTimebounds(now - 30, now + 300).build();
  const data = Buffer.from(JSON.stringify({ kind: "cli-auth-v1", owner, nonce, hash: tx.hash().toString("hex"), exp: now + 300 })).toString("base64url");
  const mac = createHmac("sha256", secret).update(`ackrate-cli-auth:${data}`).digest("base64url");
  return { challengeToken: `${data}.${mac}`, xdr: tx.toXDR() };
}

export function verifyCliChallenge(owner: string, token: string, signedXdr: string, secret: string, now = Math.floor(Date.now() / 1000)) {
  if (token.length > 2048 || signedXdr.length > 12000 || secret.length < 32) throw new Error("Invalid ownership check.");
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("Invalid ownership check.");
  const actual = Buffer.from(parts[1], "base64url");
  const expected = createHmac("sha256", secret).update(`ackrate-cli-auth:${parts[0]}`).digest();
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Invalid ownership check.");
  const data = JSON.parse(Buffer.from(parts[0], "base64url").toString()) as Record<string, unknown>;
  if (data.kind !== "cli-auth-v1" || data.owner !== owner || typeof data.exp !== "number" || data.exp < now || data.exp > now + 300
    || typeof data.nonce !== "string" || !/^[a-f0-9]{64}$/.test(data.nonce)) throw new Error("The ownership check expired. Connect again.");
  const tx = TransactionBuilder.fromXDR(signedXdr, Networks.PUBLIC);
  if (!(tx instanceof Transaction) || tx.sequence !== "0" || tx.source !== owner || tx.hash().toString("hex") !== data.hash
    || !tx.signatures.some((sig) => Keypair.fromPublicKey(owner).verify(tx.hash(), sig.signature()))) throw new Error("Freighter did not sign the expected ownership check.");
  return { nonce: data.nonce, expiresAt: data.exp };
}

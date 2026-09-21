import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { cookies, headers } from "next/headers";
import type { NetworkName, SessionView } from "./types";

const TOKEN_VERSION = 1;
export const CHALLENGE_TTL_SECONDS = 5 * 60;
export const SESSION_TTL_SECONDS = 60 * 60;

interface TokenEnvelope {
  v: 1;
  kind: "challenge" | "session";
  address: string;
  network: NetworkName;
  iat: number;
  exp: number;
  jti: string;
  origin?: string;
  authentication?: "sep53";
}

const encode = (value: string | Buffer) => Buffer.from(value).toString("base64url");

export function sealToken(payload: TokenEnvelope, secret: string): string {
  const body = encode(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function openToken(
  token: string | undefined,
  secret: string,
  expectedKind: TokenEnvelope["kind"],
  now = Math.floor(Date.now() / 1_000),
): TokenEnvelope | null {
  if (!token) return null;
  const [body, signature, extra] = token.split(".");
  if (
    !body
    || !signature
    || extra
    || !/^[A-Za-z0-9_-]+$/.test(body)
    || !/^[A-Za-z0-9_-]{43}$/.test(signature)
  ) return null;
  const expected = createHmac("sha256", secret).update(body).digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (
    encode(received) !== signature
    || received.length !== expected.length
    || !timingSafeEqual(received, expected)
  ) return null;
  try {
    const decodedBody = Buffer.from(body, "base64url");
    if (encode(decodedBody) !== body) return null;
    const payload = JSON.parse(decodedBody.toString("utf8")) as TokenEnvelope;
    if (
      payload.v !== TOKEN_VERSION
      || payload.kind !== expectedKind
      || typeof payload.address !== "string"
      || (payload.network !== "testnet" && payload.network !== "mainnet")
      || !Number.isSafeInteger(payload.iat)
      || !Number.isSafeInteger(payload.exp)
      || payload.iat > now + 30
      || payload.exp <= now
      || payload.exp - payload.iat > (expectedKind === "challenge" ? CHALLENGE_TTL_SECONDS : SESSION_TTL_SECONDS)
      || !/^[0-9a-f]{32}$/.test(payload.jti)
    ) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createChallengeToken(
  address: string,
  network: NetworkName,
  origin: string,
  secret: string,
  now = Math.floor(Date.now() / 1_000),
): { token: string; payload: TokenEnvelope } {
  const payload: TokenEnvelope = {
    v: TOKEN_VERSION,
    kind: "challenge",
    address,
    network,
    iat: now,
    exp: now + CHALLENGE_TTL_SECONDS,
    jti: randomBytes(16).toString("hex"),
    origin,
    authentication: "sep53",
  };
  return { token: sealToken(payload, secret), payload };
}

export function createSessionToken(
  address: string,
  network: NetworkName,
  secret: string,
  now = Math.floor(Date.now() / 1_000),
): { token: string; payload: TokenEnvelope } {
  const payload: TokenEnvelope = {
    v: TOKEN_VERSION,
    kind: "session",
    address,
    network,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
    jti: randomBytes(16).toString("hex"),
  };
  return { token: sealToken(payload, secret), payload };
}

/** Reconstructed from the signed cookie; the browser never chooses the text to verify. */
export function authenticationMessage(challenge: TokenEnvelope): string {
  if (challenge.kind !== "challenge" || challenge.authentication !== "sep53"
    || !StrKey.isValidEd25519PublicKey(challenge.address) || !challenge.origin
    || !/^https?:\/\/[^\s/]+$/.test(challenge.origin)) {
    throw new Error("An offline sign-in challenge is required. Request a new sign-in message.");
  }
  return [
    "Sign in to ACKRATE",
    "",
    "This signature signs you in for one hour.",
    "It does not approve spending, move funds, or send a transaction.",
    "No network fee is charged.",
    "",
    `Website: ${challenge.origin}`,
    `Wallet: ${challenge.address}`,
    `Network: Stellar ${challenge.network === "mainnet" ? "Mainnet" : "Testnet"}`,
    `Issued: ${new Date(challenge.iat * 1000).toISOString()}`,
    `Sign before: ${new Date(challenge.exp * 1000).toISOString()}`,
    `One-time code: ${challenge.jti}`,
  ].join("\n");
}

export function verifySignedChallengeMessage(signature: string, challenge: TokenEnvelope, origin: string): void {
  if (challenge.origin !== origin) throw new Error("Sign-in message belongs to a different website.");
  // Reject noncanonical encodings, arbitrary blobs and transaction envelopes.
  const bytes = Buffer.from(signature, "base64");
  if (bytes.length !== 64 || bytes.toString("base64") !== signature
    || !Keypair.fromPublicKey(challenge.address).verifyMessage(authenticationMessage(challenge), bytes)) {
    throw new Error("The offline signature could not be verified for the connected wallet.");
  }
}

function secureCookies(): boolean {
  return process.env.NODE_ENV === "production";
}

export function sessionCookieName(): string {
  return secureCookies() ? "__Host-ackrate_session" : "ackrate_session";
}

export function challengeCookieName(): string {
  return secureCookies() ? "__Host-ackrate_challenge" : "ackrate_challenge";
}

export const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: secureCookies(),
  sameSite: "strict" as const,
  path: "/",
  maxAge,
});

export async function requireSameOrigin(): Promise<string> {
  const incoming = await headers();
  const origin = incoming.get("origin");
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host");
  const proto = incoming.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");
  const expected = process.env.ACKRATE_APP_ORIGIN?.trim() || (host ? `${proto}://${host}` : null);
  if (!origin || !expected || origin !== expected) {
    throw new Error("cross-origin request rejected");
  }
  return origin;
}

export async function readSession(secret: string, network?: NetworkName): Promise<SessionView> {
  const jar = await cookies();
  const payload = openToken(jar.get(sessionCookieName())?.value, secret, "session");
  if (!payload || (network && payload.network !== network)) {
    return { authenticated: false, address: null, network: null, expiresAt: null };
  }
  return { authenticated: true, address: payload.address, network: payload.network, expiresAt: payload.exp };
}

export async function requireSession(secret: string, network: NetworkName): Promise<Required<SessionView>> {
  const session = await readSession(secret, network);
  if (!session.authenticated || !session.address || !session.network || !session.expiresAt) {
    throw new Error("wallet-authenticated session required");
  }
  return session as Required<SessionView>;
}

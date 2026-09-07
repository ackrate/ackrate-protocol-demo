import { Account, Asset, Keypair, Operation, StrKey, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";

export const CLI_MAINNET_PASSPHRASE = "Public Global Stellar Network ; September 2015";
export const CLI_MAINNET_RPC = "https://mainnet.sorobanrpc.com";
export const CLI_MAINNET_HORIZON = "https://horizon.stellar.org";
export const CLI_MAINNET_REGISTRY = "CCLZEBJXG4YVJEPBCR5F27N733BCK5HQJWZZGB3K54JVODY3VAGP4HWR";
export const CLI_USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
export const CLI_USDC_SAC = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";
export const CLI_FUNDING_SECONDS = 600;
export const CLI_FUNDING_CLOCK_ALLOWANCE_SECONDS = 30;
export const CLI_MAX_XDR_LENGTH = 131_072;

function requireAccount(address: string): void {
  if (!StrKey.isValidEd25519PublicKey(address)) throw new Error("CLI funding requires a Stellar G-account");
}

function currentSecond(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("CLI funding clock is invalid");
  return value;
}

/** Builds only the agreed funding envelope; this function makes no network calls. */
export function buildCliFunding(
  ownerAccount: Account,
  actors: { payer: Keypair; agent: Keypair; merchant: Keypair },
  nowSeconds = Math.floor(Date.now() / 1000),
): Transaction {
  const owner = ownerAccount.accountId();
  const payer = actors.payer.publicKey();
  const agent = actors.agent.publicKey();
  const merchant = actors.merchant.publicKey();
  for (const address of [owner, payer, agent, merchant]) requireAccount(address);
  if (new Set([owner, payer, agent, merchant]).size !== 4) throw new Error("CLI funding accounts must be distinct");
  const now = currentSecond(nowSeconds);
  // Stellar compares time bounds with ledger close time, not this server's
  // wall clock. Allow a small lag without extending the 600-second lifetime.
  const startsAt = now - CLI_FUNDING_CLOCK_ALLOWANCE_SECONDS;
  if (startsAt <= 0) throw new Error("CLI funding clock is invalid");
  const usdc = new Asset("USDC", CLI_USDC_ISSUER);
  // Clone the source so preparing an envelope does not advance caller state.
  const transaction = new TransactionBuilder(new Account(owner, ownerAccount.sequenceNumber()), {
    fee: "100", networkPassphrase: CLI_MAINNET_PASSPHRASE,
  })
    .addOperation(Operation.createAccount({ destination: payer, startingBalance: "2.1" }))
    .addOperation(Operation.createAccount({ destination: agent, startingBalance: "2.1" }))
    .addOperation(Operation.createAccount({ destination: merchant, startingBalance: "1.8" }))
    .addOperation(Operation.changeTrust({ source: payer, asset: usdc, limit: "0.03" }))
    .addOperation(Operation.changeTrust({ source: merchant, asset: usdc, limit: "0.03" }))
    .addOperation(Operation.payment({ destination: payer, asset: usdc, amount: "0.03" }))
    .setTimebounds(startsAt, startsAt + CLI_FUNDING_SECONDS)
    .build();
  transaction.sign(actors.payer, actors.merchant);
  return transaction;
}

function parseTransaction(value: string): Transaction {
  if (typeof value !== "string" || !value.length || value.length > CLI_MAX_XDR_LENGTH
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || Buffer.from(value, "base64").toString("base64") !== value) {
    throw new Error("CLI funding transaction encoding or size is invalid");
  }
  try {
    const transaction = TransactionBuilder.fromXDR(value, CLI_MAINNET_PASSPHRASE);
    if (!(transaction instanceof Transaction)) throw new Error("not a normal transaction");
    return transaction;
  } catch {
    throw new Error("CLI funding transaction must be a normal Stellar transaction");
  }
}

function requireSignatures(transaction: Transaction, addresses: string[]): void {
  if (transaction.signatures.length !== addresses.length) throw new Error("CLI funding signatures are incomplete or contain extras");
  const remaining = new Set(addresses);
  for (const signature of transaction.signatures) {
    const matching = [...remaining].find((address) => {
      const key = Keypair.fromPublicKey(address);
      try {
        return key.signatureHint().equals(signature.hint()) && key.verify(transaction.hash(), signature.signature());
      } catch { return false; }
    });
    if (!matching) throw new Error("CLI funding signature could not be verified");
    remaining.delete(matching);
  }
}

/** Verify the wallet preserved the server-prepared transaction and all signers. */
export function verifyCliFundingSigned(
  expectedXdr: string,
  signedXdr: string,
  owner: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Transaction {
  requireAccount(owner);
  const expected = parseTransaction(expectedXdr);
  const signed = parseTransaction(signedXdr);
  const now = currentSecond(nowSeconds);
  if (expected.source !== owner || signed.source !== owner || !expected.hash().equals(signed.hash())) {
    throw new Error("CLI funding transaction does not match the prepared transaction");
  }
  const bounds = expected.timeBounds;
  if (!bounds || BigInt(bounds.minTime) > BigInt(now) || BigInt(bounds.maxTime) <= BigInt(now)
    || BigInt(bounds.maxTime) - BigInt(bounds.minTime) !== BigInt(CLI_FUNDING_SECONDS)) {
    throw new Error("CLI funding transaction has expired or has invalid time bounds");
  }
  const [payerOp, agentOp, merchantOp, payerTrust, merchantTrust, payment] = expected.operations;
  const usdc = new Asset("USDC", CLI_USDC_ISSUER);
  if (expected.operations.length !== 6 || expected.fee !== "600" || expected.memo.type !== "none"
    || payerOp?.type !== "createAccount" || payerOp.startingBalance !== "2.1000000"
    || agentOp?.type !== "createAccount" || agentOp.startingBalance !== "2.1000000"
    || merchantOp?.type !== "createAccount" || merchantOp.startingBalance !== "1.8000000"
    || payerTrust?.type !== "changeTrust" || payerTrust.source !== payerOp.destination
    || !(payerTrust.line instanceof Asset) || !payerTrust.line.equals(usdc) || payerTrust.limit !== "0.0300000"
    || merchantTrust?.type !== "changeTrust" || merchantTrust.source !== merchantOp.destination
    || !(merchantTrust.line instanceof Asset) || !merchantTrust.line.equals(usdc) || merchantTrust.limit !== "0.0300000"
    || payment?.type !== "payment" || payment.destination !== payerOp.destination
    || !payment.asset.equals(usdc) || payment.amount !== "0.0300000"
    || [payerOp, agentOp, merchantOp, payment].some((op) => op.source && op.source !== owner)
    || new Set([owner, payerOp.destination, agentOp.destination, merchantOp.destination]).size !== 4) {
    throw new Error("CLI funding prepared transaction has unexpected operations");
  }
  requireSignatures(expected, [payerOp.destination, merchantOp.destination]);
  requireSignatures(signed, [owner, payerOp.destination, merchantOp.destination]);
  return signed;
}

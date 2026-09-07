// Node-only by design: never import this module from a client component.
import { timingSafeEqual } from "node:crypto";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { mnemonicToSeedSync, validateMnemonic, wordlists } from "bip39";
import { derivePath } from "ed25519-hd-key";

export const CLI_TEST_BURNER_OWNER = "GCHNDR6APAMBLIAYTQRCKDHQRBI3E2V5GE6KIRUBXROLHRS46NF5YDVV";
const MAX_MNEMONIC_LENGTH = 1024;
const MAX_ACCOUNT_INDEX = 19;

function normalizeMnemonic(input: string): string {
  if (typeof input !== "string" || input.length === 0 || input.length > MAX_MNEMONIC_LENGTH) {
    throw new Error("Burner recovery phrase format is invalid.");
  }
  let phrase = input.trim();
  // The environment value is the phrase, never a complete NAME=value assignment.
  if (phrase.includes("=")) throw new Error("Burner recovery phrase format is invalid.");
  if (phrase.startsWith('"') || phrase.startsWith("'")) {
    if (phrase.length < 2 || phrase.at(-1) !== phrase[0]) throw new Error("Burner recovery phrase format is invalid.");
    phrase = phrase.slice(1, -1).trim();
  }
  if (/["']/.test(phrase)) throw new Error("Burner recovery phrase format is invalid.");
  phrase = phrase.normalize("NFKD").replace(/\s+/gu, " ");
  if (!/^[a-z]+(?: [a-z]+)*$/.test(phrase) || ![12, 15, 18, 21, 24].includes(phrase.split(" ").length)
    || !validateMnemonic(phrase, wordlists.english)) {
    throw new Error("Burner recovery phrase is not a valid English BIP39 mnemonic.");
  }
  return phrase;
}

/**
 * Derive only SEP-5 m/44'/148'/index' keys with an empty BIP39 passphrase.
 * An expected public address is mandatory; without an index, try only 0..19.
 * This function has no network, logging, environment, or transaction side effects.
 * Reference: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0005.md
 */
export function deriveCliTestBurner(mnemonic: string, expectedOwner: string, index?: number): Keypair {
  if (typeof expectedOwner !== "string" || !StrKey.isValidEd25519PublicKey(expectedOwner)) {
    throw new Error("Burner expected account must be a Stellar G-account.");
  }
  if (index !== undefined && (!Number.isSafeInteger(index) || index < 0 || index > MAX_ACCOUNT_INDEX)) {
    throw new Error("Burner account index must be an integer from 0 through 19.");
  }
  const phrase = normalizeMnemonic(mnemonic);
  const expectedKey = StrKey.decodeEd25519PublicKey(expectedOwner);
  let seed: Buffer | undefined;
  let matched: Keypair | undefined;
  try {
    seed = mnemonicToSeedSync(phrase, "");
    const first = index ?? 0;
    const last = index ?? MAX_ACCOUNT_INDEX;
    for (let candidateIndex = first; candidateIndex <= last; candidateIndex += 1) {
      const derived = derivePath(`m/44'/148'/${candidateIndex}'`, seed.toString("hex"));
      try {
        const candidate = Keypair.fromRawEd25519Seed(Buffer.from(derived.key));
        if (timingSafeEqual(candidate.rawPublicKey(), expectedKey)) {
          matched = candidate;
          break;
        }
        candidate.rawSecretKey().fill(0);
      } finally {
        derived.key.fill(0);
        derived.chainCode.fill(0);
      }
    }
  } catch {
    // Never propagate dependency errors, which could contain private input.
    throw new Error("Burner account derivation failed.");
  } finally {
    // Best effort only: JavaScript strings and library-internal copies cannot be wiped.
    seed?.fill(0);
  }
  if (!matched) throw new Error("Burner recovery phrase does not match the approved account.");
  return matched;
}

/** Read only the explicitly authorized server-side secret and pin its owner. */
export function loadCliTestBurner(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Keypair {
  let mnemonic: string | undefined;
  try {
    mnemonic = env.ACKRATE_CLI_BURNER_MNEMONIC;
  } catch {
    throw new Error("Burner recovery phrase configuration could not be read.");
  }
  if (typeof mnemonic !== "string" || !mnemonic.trim()) {
    throw new Error("Burner recovery phrase is not configured.");
  }
  return deriveCliTestBurner(mnemonic, CLI_TEST_BURNER_OWNER);
}

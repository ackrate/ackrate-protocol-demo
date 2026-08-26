import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Keypair } from "@stellar/stellar-sdk";
import { canonicalPaymentOrigin, toStroops } from "@ackrate/core";

const ENVIRONMENT_NAME = /^[A-Z][A-Z0-9_]*$/;

export async function loadEnvFile(filePath, environment = process.env) {
  let contents;
  try {
    contents = await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) {
      throw new Error(`${filePath} contains an invalid environment line`);
    }
    const name = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (!ENVIRONMENT_NAME.test(name)) {
      throw new Error(`${filePath} contains an invalid environment name`);
    }
    if (
      value.length >= 2
      && ((value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (environment[name] === undefined) environment[name] = value;
  }
  return true;
}

export async function loadDefaultEnvFiles({ cwd = process.cwd(), environment = process.env } = {}) {
  await loadEnvFile(resolve(cwd, ".env"), environment);
  await loadEnvFile(resolve(cwd, ".env.local"), environment);
  return environment;
}

export function parseNamedArgs(argv, allowedNames) {
  if (!Array.isArray(argv)) throw new Error("argv must be an array");
  const allowed = new Set(allowedNames);
  const parsed = Object.create(null);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      if (parsed.help) throw new Error("--help was provided more than once");
      parsed.help = true;
      continue;
    }

    const equals = argument.match(/^--([a-z][a-z0-9-]*)=(.*)$/s);
    const name = equals?.[1] ?? (argument.startsWith("--") ? argument.slice(2) : "");
    if (!allowed.has(name)) throw new Error(`unknown option: ${argument}`);
    if (Object.hasOwn(parsed, name)) throw new Error(`--${name} was provided more than once`);

    if (equals) {
      if (!equals[2]) throw new Error(`--${name} needs a value`);
      parsed[name] = equals[2];
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`--${name} needs a value`);
    parsed[name] = value;
    index += 1;
  }
  return parsed;
}

export function validateMerchant(value, label = "merchant") {
  if (typeof value !== "string" || !value || value.trim() !== value) {
    throw new Error(`${label} must be a Stellar public G-address`);
  }
  try {
    if (Keypair.fromPublicKey(value).publicKey() !== value) throw new Error("non-canonical key");
  } catch {
    throw new Error(`${label} must be a valid Stellar public G-address`);
  }
  return value;
}

export function validateChallengeSecret(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 32 || bytes.byteLength > 4_096) {
    throw new Error("challenge secret must contain 32 through 4096 private bytes");
  }
  return value;
}

export function validatePort(value, { allowZero = false } = {}) {
  const port = Number(value);
  const minimum = allowZero ? 0 : 1;
  if (!Number.isInteger(port) || port < minimum || port > 65_535) {
    throw new Error(`port must be an integer from ${minimum} through 65535`);
  }
  return port;
}

export function validatePositiveAmount(value, decimals = 7, label = "amount") {
  if (typeof value !== "string" || value.trim() !== value) {
    throw new Error(`${label} must be an exact decimal string`);
  }
  const stroops = toStroops(value, decimals);
  if (stroops <= 0n) throw new Error(`${label} must be greater than zero`);
  return value;
}

export function validateExactOrigin(value, label = "public origin") {
  const origin = canonicalPaymentOrigin(value, label);
  const url = new URL(origin);
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
    throw new Error(`${label} must use HTTPS (HTTP is allowed only on loopback)`);
  }
  return origin;
}

export function validateRequestPath(value, label = "request path") {
  if (
    typeof value !== "string"
    || !value.startsWith("/")
    || value.startsWith("//")
    || value.includes("#")
    || /[\r\n]/.test(value)
  ) {
    throw new Error(`${label} must be an exact absolute path with an optional query`);
  }
  const url = new URL(value, "http://127.0.0.1");
  const canonical = `${url.pathname}${url.search}`;
  if (canonical !== value) throw new Error(`${label} is not canonical`);
  return canonical;
}

export function validateRoutePattern(value) {
  if (
    typeof value !== "string"
    || !value.startsWith("/")
    || value.startsWith("//")
    || value.includes("?")
    || value.includes("#")
    || /[\r\n]/.test(value)
  ) {
    throw new Error("route pattern must be an exact Express path without a query or fragment");
  }
  return value;
}

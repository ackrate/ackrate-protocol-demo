import { Address, Asset, Networks, StrKey } from "@stellar/stellar-sdk";
import type { NetworkConfig } from "@ackrate/stellar";

export const MAINNET_USDC = Object.freeze({
  code: "USDC",
  issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
});

export interface ReleaseNetworkConfig extends NetworkConfig {
  settlementAsset: {
    code: "USDC";
    issuer: string;
    contractId: string;
    decimals: number;
  };
  release: {
    sourceCommit: string;
    deploymentLedger: number;
    deploymentTransactionHash: string;
    wasmUploadTransactionHash: string;
    registryWasmSha256: string;
    registryInterfaceSha256: string;
    authorityAccount: string;
  };
}

type JsonObject = Record<string, unknown>;

function objectAt(parent: JsonObject, key: string): JsonObject {
  const value = parent[key];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`release manifest ${key} must be an object`);
  }
  return value as JsonObject;
}

function textAt(parent: JsonObject, key: string): string {
  const value = parent[key];
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new Error(`release manifest ${key} must be a non-empty string`);
  }
  return value;
}

function integerAt(parent: JsonObject, key: string): number {
  const value = parent[key];
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`release manifest ${key} must be a positive integer`);
  }
  return value as number;
}

function trueAt(parent: JsonObject, key: string): void {
  if (parent[key] !== true) throw new Error(`release manifest verification.${key} must be true`);
}

function sha256At(parent: JsonObject, key: string): string {
  const value = textAt(parent, key).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`release manifest ${key} must be a lowercase SHA-256`);
  }
  return value;
}

function transactionHashAt(parent: JsonObject, key: string): string {
  const value = textAt(parent, key).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`release manifest ${key} must be a Stellar transaction hash`);
  }
  return value;
}

function addressAt(parent: JsonObject, key: string, contractOnly = false): string {
  const value = textAt(parent, key);
  try {
    Address.fromString(value);
  } catch {
    throw new Error(`release manifest ${key} must be a Stellar address`);
  }
  if (contractOnly && !StrKey.isValidContract(value)) {
    throw new Error(`release manifest ${key} must be a Stellar contract address`);
  }
  return value;
}

function exactDateAt(parent: JsonObject, key: string): string {
  const value = textAt(parent, key);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    throw new Error(`release manifest ${key} must be a canonical ISO timestamp`);
  }
  return value;
}

/**
 * Convert the completed contracts deployment manifest into SDK configuration.
 * There is deliberately no built-in mainnet default: a partial, stale, or
 * internally inconsistent manifest fails closed before a wallet is prompted.
 */
export function mainnetNetworkFromDeploymentManifest(input: unknown): ReleaseNetworkConfig {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("release manifest must be an object");
  }
  const manifest = input as JsonObject;
  if (manifest.schema_version !== 2) throw new Error("unsupported release manifest schema_version");

  const network = objectAt(manifest, "network");
  if (textAt(network, "name") !== "mainnet") throw new Error("release manifest network must be mainnet");
  if (textAt(network, "passphrase") !== Networks.PUBLIC) {
    throw new Error("release manifest has the wrong mainnet passphrase");
  }
  const rpcUrl = textAt(network, "rpc_url");
  const parsedRpc = new URL(rpcUrl);
  if (parsedRpc.protocol !== "https:" || parsedRpc.username || parsedRpc.password) {
    throw new Error("release manifest rpc_url must be credential-free HTTPS");
  }

  const source = objectAt(manifest, "source");
  if (textAt(source, "repository") !== "https://github.com/ackrate/ackrate-protocol-contracts") {
    throw new Error("release manifest source repository is not the canonical contracts repository");
  }
  const sourceCommit = textAt(source, "commit").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sourceCommit)) throw new Error("release manifest source commit is invalid");
  if (source.dirty !== false) throw new Error("release manifest source must be clean");

  const artifacts = objectAt(manifest, "artifacts");
  const registryArtifact = objectAt(artifacts, "mandate_registry");
  const registryWasmSha256 = sha256At(registryArtifact, "sha256");
  const registryInterfaceSha256 = sha256At(registryArtifact, "interface_sha256");
  integerAt(registryArtifact, "size_bytes");

  const publicConfiguration = objectAt(manifest, "public_configuration");
  if (textAt(publicConfiguration, "usdc_asset_code") !== MAINNET_USDC.code) {
    throw new Error("release manifest asset code must be USDC");
  }
  if (textAt(publicConfiguration, "usdc_issuer") !== MAINNET_USDC.issuer) {
    throw new Error("release manifest USDC issuer is not Circle's published Stellar mainnet issuer");
  }
  const authorityAccount = addressAt(publicConfiguration, "authority_2_of_3_account");
  const deploymentSourceAccount = addressAt(publicConfiguration, "deployment_source_account");
  if (authorityAccount !== deploymentSourceAccount) {
    throw new Error("release manifest authority and deployment source must be the same 2-of-3 account");
  }
  const usdcContractId = addressAt(publicConfiguration, "usdc_sac", true);
  textAt(publicConfiguration, "usdc_derivation_evidence");
  textAt(publicConfiguration, "usdc_independent_verifier");

  const constructorArguments = objectAt(manifest, "constructor_arguments");
  if (addressAt(constructorArguments, "admin") !== authorityAccount) {
    throw new Error("release manifest constructor admin does not match the 2-of-3 authority");
  }
  if (addressAt(constructorArguments, "initial_asset", true) !== usdcContractId) {
    throw new Error("release manifest constructor asset is not canonical Mainnet USDC");
  }

  const deployment = objectAt(manifest, "deployment");
  textAt(deployment, "authorized_by");
  exactDateAt(deployment, "deployed_at");
  const deploymentLedger = integerAt(deployment, "ledger");
  const wasmUploadTransactionHash = transactionHashAt(deployment, "wasm_upload_transaction_hash");
  const deploymentTransactionHash = transactionHashAt(deployment, "registry_transaction_hash");
  const mandateRegistryId = addressAt(deployment, "registry_contract_id", true);
  if (sha256At(deployment, "registry_observed_wasm_hash") !== registryWasmSha256) {
    throw new Error("release manifest registry artifact and observed WASM hashes differ");
  }
  if (new Set([mandateRegistryId, usdcContractId]).size !== 2) {
    throw new Error("release manifest contract identities must be distinct");
  }

  const verification = objectAt(manifest, "verification");
  for (const key of [
    "artifact_hashes_match",
    "constructor_arguments_match",
    "registry_admin_is_2_of_3",
    "registry_pending_admin_is_none",
    "registry_schema_version_is_2",
    "registry_initially_unpaused",
    "registry_usdc_asset_allowed",
    "authority_has_three_weight_one_signers",
    "authority_thresholds_are_2_of_3",
  ]) trueAt(verification, key);
  textAt(verification, "independent_read_only_verifier");
  exactDateAt(verification, "verified_at");

  return Object.freeze({
    rpcUrl,
    networkPassphrase: Networks.PUBLIC,
    mandateRegistryId,
    nativeSac: Asset.native().contractId(Networks.PUBLIC),
    settlementAsset: Object.freeze({
      code: MAINNET_USDC.code,
      issuer: MAINNET_USDC.issuer,
      contractId: usdcContractId,
      decimals: 7,
    }),
    release: Object.freeze({
      sourceCommit,
      deploymentLedger,
      deploymentTransactionHash,
      wasmUploadTransactionHash,
      registryWasmSha256,
      registryInterfaceSha256,
      authorityAccount,
    }),
  });
}

import assert from "node:assert/strict";
import test from "node:test";
import { Keypair, Networks, StrKey } from "@stellar/stellar-sdk";
import {
  MAINNET_USDC,
  mainnetNetworkFromDeploymentManifest,
} from "../lib/wallet/release-manifest";

const contract = (fill: number) => StrKey.encodeContract(Buffer.alloc(32, fill));
const hash = (fill: string) => fill.repeat(64);

function validManifest() {
  const authority = Keypair.random().publicKey();
  const usdc = contract(3);
  return {
    schema_version: 2,
    network: {
      name: "mainnet",
      passphrase: Networks.PUBLIC,
      rpc_url: "https://rpc.example.test",
    },
    source: {
      repository: "https://github.com/ackrate/ackrate-protocol-contracts",
      commit: "1".repeat(40),
      dirty: false,
    },
    artifacts: {
      mandate_registry: {
        sha256: hash("a"),
        interface_sha256: hash("b"),
        size_bytes: 1,
      },
    },
    public_configuration: {
      deployment_source_account: authority,
      authority_2_of_3_account: authority,
      usdc_asset_code: MAINNET_USDC.code,
      usdc_issuer: MAINNET_USDC.issuer,
      usdc_sac: usdc,
      usdc_derivation_evidence: "independent derivation record",
      usdc_independent_verifier: "Verifier A",
    },
    constructor_arguments: {
      admin: authority,
      initial_asset: usdc,
    },
    deployment: {
      authorized_by: "2-of-3 release record",
      deployed_at: "2026-08-31T11:34:37.000Z",
      ledger: 123,
      wasm_upload_transaction_hash: hash("c"),
      registry_transaction_hash: hash("d"),
      registry_contract_id: contract(2),
      registry_observed_wasm_hash: hash("a"),
    },
    verification: {
      artifact_hashes_match: true,
      constructor_arguments_match: true,
      registry_admin_is_2_of_3: true,
      registry_pending_admin_is_none: true,
      registry_schema_version_is_2: true,
      registry_initially_unpaused: true,
      registry_usdc_asset_allowed: true,
      authority_has_three_weight_one_signers: true,
      authority_thresholds_are_2_of_3: true,
      independent_read_only_verifier: "Verifier B",
      verified_at: "2026-09-01T13:07:18.000Z",
    },
  };
}

test("creates Mainnet SDK configuration only from the complete V2 multisig manifest", () => {
  const manifest = validManifest();
  const config = mainnetNetworkFromDeploymentManifest(manifest);
  assert.equal(config.networkPassphrase, Networks.PUBLIC);
  assert.equal(config.mandateRegistryId, manifest.deployment.registry_contract_id);
  assert.equal(config.settlementAsset.contractId, manifest.public_configuration.usdc_sac);
  assert.equal(config.release.sourceCommit, manifest.source.commit);
  assert.equal(config.release.authorityAccount, manifest.public_configuration.authority_2_of_3_account);
  assert.equal(config.release.registryInterfaceSha256, manifest.artifacts.mandate_registry.interface_sha256);
});

test("rejects a legacy or incompletely verified release manifest", () => {
  const legacy = validManifest() as ReturnType<typeof validManifest> & { schema_version: number };
  legacy.schema_version = 1;
  assert.throws(() => mainnetNetworkFromDeploymentManifest(legacy), /schema_version/);

  const incomplete = validManifest();
  incomplete.verification.registry_usdc_asset_allowed = false;
  assert.throws(
    () => mainnetNetworkFromDeploymentManifest(incomplete),
    /registry_usdc_asset_allowed must be true/,
  );
});

test("rejects a conflicting authority, USDC identity, or observed artifact hash", () => {
  const wrongAuthority = validManifest();
  wrongAuthority.constructor_arguments.admin = Keypair.random().publicKey();
  assert.throws(() => mainnetNetworkFromDeploymentManifest(wrongAuthority), /constructor admin/);

  const wrongIssuer = validManifest();
  (wrongIssuer.public_configuration as { usdc_issuer: string }).usdc_issuer = Keypair.random().publicKey();
  assert.throws(() => mainnetNetworkFromDeploymentManifest(wrongIssuer), /USDC issuer/);

  const wrongHash = validManifest();
  wrongHash.deployment.registry_observed_wasm_hash = hash("e");
  assert.throws(() => mainnetNetworkFromDeploymentManifest(wrongHash), /registry artifact/);
});

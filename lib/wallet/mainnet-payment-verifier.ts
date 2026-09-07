import { Buffer } from "node:buffer";
import { Client } from "@ackrate/stellar";
import { rpc, StrKey } from "@stellar/stellar-sdk";
import {
  createStellarPaymentVerifier, extractContractEvents, interpretEvents,
  type DecodedEvent, type LoadedMandate, type LoadedTransaction, type PaymentVerifier,
} from "@ackrate/express-middleware";
import type { AppConfig } from "./app-config";
import manifest from "./mainnet-release.json";
import { mainnetNetworkFromDeploymentManifest } from "./release-manifest";

const release = mainnetNetworkFromDeploymentManifest(manifest);
const U32_MAX = 0xffff_ffff;

interface V2PaymentEvent {
  mandateId: Buffer;
  merchant: string;
  amount: bigint;
  sequence: number;
}

interface V2Mandate extends LoadedMandate {
  seq: number;
  spent: bigint;
}

interface ReadOnlyLoaders {
  loadNetworkPassphrase?: () => Promise<string>;
  loadTransaction?: (txHash: string) => Promise<LoadedTransaction>;
  loadMandate?: (mandateId: Buffer) => Promise<V2Mandate>;
}

/** Adapt only the pinned V2 event schema; leave original token evidence intact. */
export function adaptMainnetV2PaymentEvents(events: readonly DecodedEvent[]): {
  events: DecodedEvent[]; payments: V2PaymentEvent[];
} {
  const payments: V2PaymentEvent[] = [];
  const adapted = events.map((event) => {
    if (event.type !== "contract" || event.contractId !== release.mandateRegistryId
      || event.topics[0]?.type !== "scvSymbol" || event.topics[0].value !== "payment") return event;
    const fields = event.data.type === "scvVec" && Array.isArray(event.data.value) ? event.data.value : [];
    const [id, amount, sequence] = fields;
    if (event.topics.length !== 3 || event.topics[1]?.type !== "scvAddress"
      || typeof event.topics[1].value !== "string" || !StrKey.isValidEd25519PublicKey(event.topics[1].value)
      || event.topics[2]?.type !== "scvAddress" || event.topics[2].value !== release.settlementAsset.contractId
      || fields.length !== 3 || id?.type !== "scvBytes"
      || !(Buffer.isBuffer(id.value) || id.value instanceof Uint8Array) || id.value.length !== 32
      || amount?.type !== "scvI128" || typeof amount.value !== "bigint" || amount.value <= 0n
      || sequence?.type !== "scvU32" || typeof sequence.value !== "number"
      || !Number.isInteger(sequence.value) || sequence.value < 0 || sequence.value >= U32_MAX) {
      throw new Error("Pinned Mainnet registry payment does not match the V2 asset-and-sequence event schema");
    }
    payments.push({ mandateId: Buffer.from(id.value), merchant: event.topics[1].value,
      amount: amount.value, sequence: sequence.value });
    // The installed verifier accepts the legacy two-field internal view. All
    // V2-only fields have been validated above and the consumed sequence is
    // checked against current on-chain mandate state below, not discarded.
    return { ...event, topics: event.topics.slice(0, 2), data: { type: "scvVec", value: fields.slice(0, 2) } };
  });
  return { events: adapted, payments };
}

/**
 * Read-only V2 compatibility at the middleware's supported verifier boundary.
 * The existing verifier still checks confirmed transaction success, network,
 * freshness, registry, merchant, mandate, amount and the exact token transfer.
 * Bound challenge/signature verification and durable redemption remain in the
 * installed middleware; this adapter never signs, submits, or grants access.
 */
export function createMainnetV2PaymentVerifier(
  config: Pick<AppConfig, "network" | "public">,
  loaders: ReadOnlyLoaders = {},
): PaymentVerifier {
  if (config.public.network !== "mainnet" || config.network.networkPassphrase !== release.networkPassphrase
    || config.network.mandateRegistryId !== release.mandateRegistryId
    || config.public.mandateRegistryId !== release.mandateRegistryId
    || config.public.asset.contractId !== release.settlementAsset.contractId
    || config.public.asset.decimals !== release.settlementAsset.decimals
    || !config.public.merchant.address || !StrKey.isValidEd25519PublicKey(config.public.merchant.address)) {
    throw new Error("V2 payment verification requires the manifest-pinned Mainnet registry, USDC asset and relay");
  }
  const server = new rpc.Server(config.network.rpcUrl);
  const sourceAccount = config.public.merchant.address;
  const client = new Client({ contractId: release.mandateRegistryId, rpcUrl: config.network.rpcUrl,
    networkPassphrase: release.networkPassphrase, publicKey: sourceAccount,
    signTransaction: async () => { throw new Error("Payment verification is read-only and cannot sign"); } });
  const loadTransaction = loaders.loadTransaction ?? (async (txHash: string): Promise<LoadedTransaction> => {
    const transaction = await server.getTransaction(txHash);
    if (transaction.status !== "SUCCESS") return { status: transaction.status, latestLedger: transaction.latestLedger };
    return { status: transaction.status, ledger: transaction.ledger, latestLedger: transaction.latestLedger,
      events: interpretEvents(extractContractEvents(transaction.resultMetaXdr)) };
  });
  const loadMandate = loaders.loadMandate ?? (async (mandateId: Buffer): Promise<V2Mandate> => {
    const mandate = (await client.get_mandate({ mandate_id: mandateId })).result.unwrap();
    return { user: mandate.user, agent: mandate.agent, merchant: mandate.merchant,
      asset: mandate.asset, seq: Number(mandate.seq), spent: BigInt(mandate.spent) };
  });
  return {
    async verify(txHash, requirement) {
      if (requirement.registryId !== release.mandateRegistryId || requirement.asset !== release.settlementAsset.contractId
        || requirement.merchant !== sourceAccount || requirement.network !== "stellar-mainnet"
        || requirement.scheme !== "ackrate-soroban-bound" || requirement.decimals !== release.settlementAsset.decimals) {
        return { ok: false, kind: "invalid", reason: "Payment requirement does not match the pinned Mainnet deployment" };
      }
      // Per-verification state prevents concurrent requests mixing event sequences.
      let payments: V2PaymentEvent[] = [];
      let invalidReason: string | undefined;
      const verifier = createStellarPaymentVerifier({
        networkConfig: config.network, sourceAccount,
        loadNetworkPassphrase: loaders.loadNetworkPassphrase ?? (async () => (await server.getNetwork()).passphrase),
        loadTransaction: async (hash) => {
          const transaction = await loadTransaction(hash);
          if (transaction.status !== "SUCCESS") return transaction;
          try {
            const adapted = adaptMainnetV2PaymentEvents(transaction.events ?? []);
            if (adapted.payments.some((payment) => payment.merchant === requirement.merchant
              && payment.amount !== requirement.amountStroops)) {
              throw new Error("V2 payment amount does not equal this exact service price");
            }
            payments = adapted.payments;
            return { ...transaction, events: adapted.events };
          } catch (error) {
            invalidReason = error instanceof Error ? error.message : "Invalid V2 payment event";
            throw error;
          }
        },
        loadMandate: async (id) => {
          const mandate = await loadMandate(id);
          const matching = payments.filter((payment) => payment.mandateId.equals(id) && payment.merchant === requirement.merchant);
          if (matching.length !== 1 || !Number.isInteger(mandate.seq) || mandate.seq < 1 || mandate.seq > U32_MAX
            || mandate.seq <= matching[0]!.sequence || BigInt(mandate.spent) < matching[0]!.amount) {
            invalidReason = "On-chain mandate does not confirm the V2 payment amount and consumed sequence";
            throw new Error(invalidReason);
          }
          return mandate;
        },
      });
      const verdict = await verifier.verify(txHash, requirement);
      return invalidReason ? { ok: false, kind: "invalid", reason: invalidReason } : verdict;
    },
  };
}

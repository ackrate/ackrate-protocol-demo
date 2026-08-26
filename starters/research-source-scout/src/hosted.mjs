import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  assertMandateStateUnchanged,
  assertNoUnresolvedReceipts,
  createBoundTestnetConsumer,
  createRunStores,
  expectVerifiedBudgetRejection,
  purchaseVerifiedBoundJson,
  readTestnetMandateState,
  setupTestnetMandate,
  verifyExactBound402,
} from "../shared/contract.mjs";
import {
  loadDefaultEnvFiles,
  parseNamedArgs,
  validateMerchant,
} from "../shared/config.mjs";
import { createJsonEvidenceEnvelope } from "../shared/evidence.mjs";
import { fetchWithTimeout } from "../shared/http.mjs";
import {
  createDisposableTestnetActors,
  explorerTransactionUrl,
  fundTestnetAccount,
} from "../shared/testnet.mjs";

const RESOURCES = Object.freeze(["market", "academic", "news"]);
const BLOCKED_RESOURCE = "patents";

function printHelp() {
  console.log(`ACKRATE hosted hackathon companion

Usage:
  npm run hosted -- --endpoint="https://reapp.live/api/express/WORKSPACE/source" --merchant="G..."

The endpoint and merchant come from https://reapp.live/solutions. The command
uses disposable Stellar testnet signers and never requests a wallet secret.`);
}

function normalizeEndpoint(value) {
  if (typeof value !== "string" || !value) throw new Error("endpoint is required; copy it from /solutions");
  const endpoint = new URL(value);
  const loopback = endpoint.hostname === "127.0.0.1" || endpoint.hostname === "localhost";
  if (
    endpoint.username
    || endpoint.password
    || endpoint.search
    || endpoint.hash
    || (endpoint.protocol !== "https:" && !(loopback && endpoint.protocol === "http:"))
  ) throw new Error("endpoint must be an exact HTTPS URL (HTTP is allowed only on loopback)");
  endpoint.pathname = endpoint.pathname.replace(/\/+$/, "");
  if (!endpoint.pathname.endsWith("/source")) throw new Error("endpoint must end with /source");
  return endpoint.toString().replace(/\/$/, "");
}

function isHostedWorkspace(endpoint) {
  return /^\/api\/express\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/source$/i.test(new URL(endpoint).pathname);
}

function validateHostedDelivery({ body, receipt, resource }) {
  if (
    !body
    || typeof body !== "object"
    || body.ok !== true
    || body.resource !== resource
    || typeof body.label !== "string"
    || typeof body.data !== "string"
    || body.settledTx?.toLowerCase() !== receipt.txHash
  ) throw new Error("hosted paid response did not match the exact resource and settlement");
  return Object.freeze({ resource, label: body.label, data: body.data });
}

async function reportBudgetRejection(url, mandateId) {
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ event: "contract_rejected", mandateId }),
    redirect: "error",
  }, 60_000);
  const body = await response.json().catch(() => undefined);
  if (!response.ok || body?.ok !== true || body?.verified !== true) {
    throw new Error(`hosted rejection report was not verified (HTTP ${response.status})`);
  }
  return body;
}

export async function runHosted({ endpoint, merchant, stateRoot = resolve(".ackrate") }) {
  const checkedEndpoint = normalizeEndpoint(endpoint);
  const checkedMerchant = validateMerchant(merchant, "merchant");
  const stores = createRunStores(stateRoot);
  await assertNoUnresolvedReceipts(stores.receiptStore);
  const actors = createDisposableTestnetActors();
  const runId = await stores.resultStore.begin({
    mode: "hosted-companion",
    endpoint: checkedEndpoint,
    merchant: checkedMerchant,
    network: "stellar-testnet",
    budgetXlm: "3.00",
  });
  try {
    await Promise.all([
      fundTestnetAccount(actors.user.publicKey()),
      fundTestnetAccount(actors.agent.publicKey()),
    ]);
    await stores.resultStore.append(runId, {
      type: "accounts_funded",
      user: actors.user.publicKey(),
      agent: actors.agent.publicKey(),
    });
    const mandateEvidence = await setupTestnetMandate({
      user: actors.user,
      agent: actors.agent,
      merchant: checkedMerchant,
      budgetXlm: "3.00",
    });
    await stores.resultStore.append(runId, {
      type: "mandate_ready",
      mandateId: mandateEvidence.mandate.id,
      registerTx: mandateEvidence.registerTx,
      approveTx: mandateEvidence.approveTx,
    });
    const consumer = createBoundTestnetConsumer({
      mandate: mandateEvidence.mandate,
      agent: actors.agent,
      receiptStore: stores.receiptStore,
    });
    const transactions = [];
    for (const [index, resource] of RESOURCES.entries()) {
      const url = `${checkedEndpoint}/${resource}`;
      const quote = await verifyExactBound402({ url, merchant: checkedMerchant, amount: "1.00" });
      await stores.resultStore.append(runId, { type: "challenge_402_verified", resource, priceXlm: "1.00" });
      const delivered = await purchaseVerifiedBoundJson({
        consumer,
        mandate: mandateEvidence.mandate,
        url,
        quote,
        validateDelivery: ({ body, receipt }) => validateHostedDelivery({ body, receipt, resource }),
        commitDelivery: async ({ body, value, receipt }) => {
          const bodyEvidence = createJsonEvidenceEnvelope("hosted-delivery-body", body);
          await stores.resultStore.commitDelivery(runId, {
            type: "delivery_accepted",
            step: index + 1,
            path: new URL(url).pathname,
            receiptId: receipt.receiptId,
            txHash: receipt.txHash,
            explorer: explorerTransactionUrl(receipt.txHash),
            bodySha256: bodyEvidence.sha256,
            evidence: { resource: value.resource, label: value.label },
          });
        },
      });
      transactions.push(delivered.receipt.txHash);
      console.log(`402 → contract payment → 200 · ${resource} · ${explorerTransactionUrl(delivered.receipt.txHash)}`);
    }

    const blockedUrl = `${checkedEndpoint}/${BLOCKED_RESOURCE}`;
    const before = await readTestnetMandateState({ mandate: mandateEvidence.mandate, source: actors.user });
    const blockedQuote = await verifyExactBound402({ url: blockedUrl, merchant: checkedMerchant, amount: "1.00" });
    const rejection = await expectVerifiedBudgetRejection({
      consumer,
      mandate: mandateEvidence.mandate,
      url: blockedUrl,
      quote: blockedQuote,
    });
    const after = await readTestnetMandateState({ mandate: mandateEvidence.mandate, source: actors.user });
    const unchanged = assertMandateStateUnchanged(before, after);
    if (isHostedWorkspace(checkedEndpoint)) await reportBudgetRejection(blockedUrl, mandateEvidence.mandate.id);
    await stores.resultStore.append(runId, {
      type: "contract_budget_rejection_verified",
      resource: BLOCKED_RESOURCE,
      rejection,
      unchanged,
    });
    if (transactions.length !== 3 || (await stores.receiptStore.listPending()).length !== 0) {
      throw new Error("hosted flow did not finish with exactly three deliveries and zero pending receipts");
    }
    const summary = {
      mandateId: mandateEvidence.mandate.id,
      delivered: transactions.length,
      blocked: 1,
      transactions,
    };
    await stores.resultStore.finish(runId, "complete", summary);
    return Object.freeze({ runId, ...summary });
  } catch (error) {
    await stores.resultStore.finish(runId, "failed", {
      reason: error instanceof Error ? error.message : String(error),
    }).catch(() => undefined);
    throw error;
  }
}

async function main() {
  await loadDefaultEnvFiles();
  const flags = parseNamedArgs(process.argv.slice(2), ["endpoint", "merchant"]);
  if (flags.help) {
    printHelp();
    return;
  }
  const result = await runHosted({
    endpoint: flags.endpoint ?? process.env.ACKRATE_ENDPOINT,
    merchant: flags.merchant ?? process.env.ACKRATE_MERCHANT,
  });
  console.log(`Complete: ${result.delivered} hosted deliveries verified; fourth payment rejected by the contract.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`ACKRATE hosted demo stopped safely: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

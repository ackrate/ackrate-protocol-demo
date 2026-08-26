import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { resolve } from "node:path";
import {
  BOUND_PAYMENT_CAPABILITY,
  DeliveryPendingError,
  ACKRATE_PAYMENT_CAPABILITIES_HEADER,
  X_PAYMENT_HEADER,
  createBoundPaymentProof,
  encodePaymentProof,
  parse402,
  ackrate,
} from "@ackrate/core";
import {
  assertNoUnresolvedReceipts,
  assertMandateStateUnchanged,
  createBoundTestnetConsumer,
  createRunStores,
  expectVerifiedBudgetRejection,
  expectVerifiedExpiryRejection,
  expectVerifiedRevocationRejection,
  purchaseVerifiedBoundJson,
  readTestnetMandateState,
  setupTestnetMandate,
  verifyExactBound402,
} from "./contract.mjs";
import {
  validateExactOrigin,
  validatePositiveAmount,
  validateRequestPath,
} from "./config.mjs";
import {
  createJsonEvidenceEnvelope,
} from "./evidence.mjs";
import {
  createFulfillmentMetrics,
  startFulfillmentServer,
} from "./fulfillment.mjs";
import { fetchWithTimeout } from "./http.mjs";
import { loadOrCreateChallengeSecret } from "./private-secret.mjs";
import {
  createDisposableTestnetActors,
  explorerTransactionUrl,
  fundDisposableTestnetActors,
  publicActorAddresses,
  waitForTestnetLedgerTime,
} from "./testnet.mjs";
import {
  SCENARIO_HOOK_OUTPUT_LIMITS,
  assertDefinedScenario,
  toBoundedDeliveryEvidence,
  toBoundedFinalOutputEvidence,
  toBoundedNegativePathEvidence,
  toBoundedScenarioOutput,
} from "./scenario.mjs";

const MAX_NEGATIVE_EVENTS = 64;
const EXPIRY_MANDATE_LIFETIME_SECONDS = 120;
const RESERVED_RUNTIME_EVENTS = new Set([
  "accounts_funded",
  "challenge_402_verified",
  "consumer_output_verified",
  "delivery_accepted",
  "fulfillment_started",
  "mandate_ready",
  "negative_path_verified",
  "purchase_started",
  "run_complete",
  "run_started",
]);

export function validateNegativePathEvidence(value) {
  return toBoundedNegativePathEvidence(value);
}

export function validateNegativePathEvent(event) {
  const checked = toBoundedScenarioOutput(event, "negative path event", 32 * 1024);
  if (RESERVED_RUNTIME_EVENTS.has(checked.type)) {
    throw new Error(`runNegativePath cannot record reserved event ${checked.type}`);
  }
  if (typeof checked.type !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(checked.type)) {
    throw new Error("negative path event type must be a lowercase kebab-case identifier");
  }
  return checked;
}

function jsonSafeDeliveryEvidence(value) {
  return toBoundedScenarioOutput(
    value,
    "delivery value",
    SCENARIO_HOOK_OUTPUT_LIMITS.negativePathEvidenceBytes,
  );
}

function publicReceiptEvidence(receipt) {
  return Object.freeze({
    receiptId: receipt.receiptId,
    proofVersion: receipt.proofVersion,
    method: receipt.method,
    url: receipt.url,
    txHash: receipt.txHash,
    mandateId: receipt.mandateId,
    amount: receipt.amount,
    submittedAt: receipt.submittedAt,
    validUntil: receipt.validUntil,
  });
}

function validateDeliveryIndex(value, deliveries) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= deliveries.length) {
    throw new Error("deliveryIndex must identify a completed paid delivery");
  }
  return value;
}

export function validateScenarioDefinition(scenario) {
  return assertDefinedScenario(scenario);
}

export async function expectBoundProofRejected({
  receipt,
  url,
  expectedStatus = 402,
  timeoutMs = 30_000,
}) {
  if (!receipt || receipt.proofVersion !== 2 || receipt.method !== "GET") {
    throw new Error("a bound-v2 GET settlement receipt is required");
  }
  if (!Number.isInteger(expectedStatus) || expectedStatus < 400 || expectedStatus > 499) {
    throw new Error("expectedStatus must be a 4xx HTTP status");
  }
  const target = new URL(url);
  if (target.username || target.password || target.hash || target.toString() === receipt.url) {
    throw new Error("negative proof target must be a different exact URL without credentials or fragment");
  }
  validateExactOrigin(target.origin, "negative proof target origin");
  const response = await fetchWithTimeout(target, {
    method: "GET",
    headers: {
      accept: "application/json",
      [ACKRATE_PAYMENT_CAPABILITIES_HEADER]: BOUND_PAYMENT_CAPABILITY,
      [X_PAYMENT_HEADER]: encodePaymentProof(receipt.proof),
    },
    redirect: "error",
  }, timeoutMs);
  await response.arrayBuffer();
  if (response.status !== expectedStatus) {
    throw new Error(`rebound proof returned HTTP ${response.status}; expected ${expectedStatus}`);
  }
  return Object.freeze({
    kind: "bound-proof-rejected",
    status: response.status,
    receiptId: receipt.receiptId,
    txHash: receipt.txHash,
    target: target.toString(),
  });
}

export const expectResourceRebindingRejected = expectBoundProofRejected;

export async function expectReboundTransactionConflict({
  receipt,
  url,
  agent,
  timeoutMs = 30_000,
}) {
  if (!receipt || receipt.proofVersion !== 2 || receipt.method !== "GET") {
    throw new Error("a bound-v2 GET settlement receipt is required");
  }
  const target = new URL(url);
  if (target.username || target.password || target.hash || target.toString() === receipt.url) {
    throw new Error("conflict target must be a different exact URL without credentials or fragment");
  }
  validateExactOrigin(target.origin, "conflict target origin");
  const challengeResponse = await fetchWithTimeout(target, {
    method: "GET",
    headers: {
      accept: "application/json",
      [ACKRATE_PAYMENT_CAPABILITIES_HEADER]: BOUND_PAYMENT_CAPABILITY,
    },
    redirect: "error",
  }, timeoutMs);
  if (challengeResponse.status !== 402) {
    throw new Error(`fresh target returned HTTP ${challengeResponse.status}; expected 402`);
  }
  const requirement = await parse402(challengeResponse);
  if (requirement.proofVersion !== 2 || !requirement.challenge) {
    throw new Error("fresh target did not return a bound-v2 challenge");
  }
  const reboundProof = createBoundPaymentProof({
    challenge: requirement.challenge,
    txHash: receipt.txHash,
    mandateId: receipt.mandateId,
    signer: agent,
  });
  const response = await fetchWithTimeout(target, {
    method: "GET",
    headers: {
      accept: "application/json",
      [ACKRATE_PAYMENT_CAPABILITIES_HEADER]: BOUND_PAYMENT_CAPABILITY,
      [X_PAYMENT_HEADER]: encodePaymentProof(reboundProof),
    },
    redirect: "error",
  }, timeoutMs);
  await response.arrayBuffer();
  if (response.status !== 409) {
    throw new Error(`rebound transaction returned HTTP ${response.status}; expected 409`);
  }
  return Object.freeze({
    kind: "rebound-transaction-conflict",
    status: response.status,
    receiptId: receipt.receiptId,
    txHash: receipt.txHash,
    target: target.toString(),
  });
}

export async function runLocalTestnetDemo({
  scenario: rawScenario,
  stateRoot = resolve(".ackrate"),
  onEvent,
}) {
  const scenario = assertDefinedScenario(rawScenario);
  if (onEvent !== undefined && typeof onEvent !== "function") {
    throw new Error("onEvent must be a function when provided");
  }
  const stores = createRunStores(stateRoot);
  await assertNoUnresolvedReceipts(stores.receiptStore);
  const actors = createDisposableTestnetActors();
  const addresses = publicActorAddresses(actors);
  const runId = await stores.resultStore.begin({
    scenarioId: scenario.id,
    network: "stellar-testnet",
    contract: ackrate.testnet.mandateRegistryId,
    budgetXlm: scenario.budgetXlm,
    proofPolicy: "bound-v2-only",
  });
  let serverHandle;
  let runError;

  const record = async (event) => {
    await stores.resultStore.append(runId, event);
    await onEvent?.(Object.freeze({ ...event }));
  };

  try {
    await onEvent?.(Object.freeze({ type: "run_started", runId, ...addresses }));
    await fundDisposableTestnetActors(actors);
    await record({ type: "accounts_funded", ...addresses });

    const mandateEvidence = await setupTestnetMandate({
      user: actors.user,
      agent: actors.agent,
      merchant: addresses.merchant,
      budgetXlm: scenario.budgetXlm,
    });
    await record({
      type: "mandate_ready",
      mandateId: mandateEvidence.mandate.id,
      registerTx: mandateEvidence.registerTx,
      approveTx: mandateEvidence.approveTx,
      registerExplorer: explorerTransactionUrl(mandateEvidence.registerTx),
      approveExplorer: explorerTransactionUrl(mandateEvidence.approveTx),
    });

    const challengeSecret = await loadOrCreateChallengeSecret(
      resolve(stores.stateRoot, "challenge-secret"),
    );
    const startServer = ({
      port = 0,
      redemptionStore = stores.redemptionStore,
      metrics,
    } = {}) => startFulfillmentServer({
      port,
      merchant: addresses.merchant,
      challengeSecret,
      routePattern: scenario.routePattern,
      amount: scenario.amount,
      preflight: scenario.preflight,
      fulfill: scenario.fulfill,
      configureFreeRoutes: scenario.configureFreeRoutes,
      redemptionStore,
      stateRoot: stores.stateRoot,
      metrics,
    });
    serverHandle = await startServer();
    await record({ type: "fulfillment_started", origin: serverHandle.origin });

    const consumer = createBoundTestnetConsumer({
      mandate: mandateEvidence.mandate,
      agent: actors.agent,
      receiptStore: stores.receiptStore,
    });
    const transactions = [];
    const deliveries = [];

    for (const [index, step] of scenario.plan.entries()) {
      const url = serverHandle.endpoint(step.path);
      const quote = await verifyExactBound402({
        url,
        merchant: addresses.merchant,
        amount: step.price,
      });
      await record({
        type: "challenge_402_verified",
        path: step.path,
        priceXlm: step.price,
      });
      await record({ type: "purchase_started", step: index + 1, path: step.path });
      let committedEvidence;
      let committedBodyEvidence;
      const delivery = await purchaseVerifiedBoundJson({
        consumer,
        mandate: mandateEvidence.mandate,
        url,
        quote,
        validateDelivery: ({ body, receipt }) => scenario.validateDelivery({
          body,
          receipt: publicReceiptEvidence(receipt),
          step,
        }),
        commitDelivery: async ({ body, value, receipt }) => {
          const publicReceipt = publicReceiptEvidence(receipt);
          const evidence = toBoundedDeliveryEvidence(
            scenario.deliveryEvidence({ body, value, receipt: publicReceipt, step }),
          );
          const bodyEvidence = createJsonEvidenceEnvelope(
            "delivery-body",
            toBoundedScenarioOutput(body, "paid delivery body"),
          );
          committedEvidence = evidence;
          committedBodyEvidence = bodyEvidence;
          await stores.resultStore.commitDelivery(runId, {
            type: "delivery_accepted",
            step: index + 1,
            path: step.path,
            receiptId: receipt.receiptId,
            txHash: receipt.txHash,
            explorer: explorerTransactionUrl(receipt.txHash),
            bodySha256: bodyEvidence.sha256,
            evidence,
          });
        },
      });
      transactions.push(delivery.receipt.txHash);
      deliveries.push(Object.freeze({
        step,
        body: jsonSafeDeliveryEvidence(delivery.body),
        value: jsonSafeDeliveryEvidence(delivery.value),
        evidence: committedEvidence,
        bodyEvidence: committedBodyEvidence,
        receipt: publicReceiptEvidence(delivery.receipt),
        privateReceipt: delivery.receipt,
      }));
      await onEvent?.(Object.freeze({
        type: "delivery_accepted",
        step: index + 1,
        path: step.path,
        txHash: delivery.receipt.txHash,
        explorer: explorerTransactionUrl(delivery.receipt.txHash),
      }));
    }

    let negativeEventCount = 0;
    const negativeRecord = async (event) => {
      negativeEventCount += 1;
      if (negativeEventCount > MAX_NEGATIVE_EVENTS) {
        throw new Error(`runNegativePath cannot record more than ${MAX_NEGATIVE_EVENTS} events`);
      }
      const checked = validateNegativePathEvent(event);
      await record({ ...checked, phase: "negative_path" });
    };
    const publicDeliveries = Object.freeze(deliveries.map((delivery) => Object.freeze({
      step: delivery.step,
      body: delivery.body,
      value: delivery.value,
      evidence: delivery.evidence,
      bodyEvidence: delivery.bodyEvidence,
      receipt: delivery.receipt,
    })));
    const readMandateState = () => readTestnetMandateState({
      mandate: mandateEvidence.mandate,
      source: actors.user,
    });
    let expiryActionUsed = false;
    let revocationActionUsed = false;
    let durableRestartActionUsed = false;
    const negativeActions = Object.freeze({
      async expectBudgetRejection({ path, priceXlm }) {
        const checkedPath = validateRequestPath(path, "budget rejection path");
        validatePositiveAmount(priceXlm, 7, "budget rejection price");
        const url = serverHandle.endpoint(checkedPath);
        const before = await readMandateState();
        const quote = await verifyExactBound402({
          url,
          merchant: addresses.merchant,
          amount: priceXlm,
        });
        const rejection = await expectVerifiedBudgetRejection({
          consumer,
          mandate: mandateEvidence.mandate,
          url,
          quote,
        });
        const after = await readMandateState();
        return Object.freeze({
          rejection,
          unchanged: assertMandateStateUnchanged(before, after),
        });
      },
      async expectExpiryRejection({ path, priceXlm }) {
        if (expiryActionUsed) throw new Error("expiry rejection can be exercised only once per run");
        expiryActionUsed = true;
        const checkedPath = validateRequestPath(path, "expiry rejection path");
        validatePositiveAmount(priceXlm, 7, "expiry rejection price");
        const expiry = Math.floor(Date.now() / 1_000) + EXPIRY_MANDATE_LIFETIME_SECONDS;
        const expiringEvidence = await setupTestnetMandate({
          user: actors.user,
          agent: actors.agent,
          merchant: addresses.merchant,
          budgetXlm: priceXlm,
          expiry,
        });
        const expiringConsumer = createBoundTestnetConsumer({
          mandate: expiringEvidence.mandate,
          agent: actors.agent,
          receiptStore: stores.receiptStore,
        });
        const observedLedgerTime = await waitForTestnetLedgerTime(expiry);
        const before = await readTestnetMandateState({
          mandate: expiringEvidence.mandate,
          source: actors.user,
        });
        if (
          before.status !== "Active"
          || before.seq !== 0
          || before.spentStroops !== "0"
        ) {
          throw new Error("short-lived mandate changed before its expiry rejection was attempted");
        }
        const url = serverHandle.endpoint(checkedPath);
        const quote = await verifyExactBound402({
          url,
          merchant: addresses.merchant,
          amount: priceXlm,
        });
        const rejection = await expectVerifiedExpiryRejection({
          consumer: expiringConsumer,
          mandate: expiringEvidence.mandate,
          url,
          quote,
        });
        const after = await readTestnetMandateState({
          mandate: expiringEvidence.mandate,
          source: actors.user,
        });
        return Object.freeze({
          kind: "expired-mandate-rejected",
          expiry,
          observedLedgerTime,
          registerTx: expiringEvidence.registerTx,
          registerExplorer: explorerTransactionUrl(expiringEvidence.registerTx),
          approveTx: expiringEvidence.approveTx,
          approveExplorer: explorerTransactionUrl(expiringEvidence.approveTx),
          rejection,
          unchanged: assertMandateStateUnchanged(before, after),
        });
      },
      async expectRevocationRejection({ path, priceXlm }) {
        if (revocationActionUsed) {
          throw new Error("revocation rejection can be exercised only once per run");
        }
        revocationActionUsed = true;
        const checkedPath = validateRequestPath(path, "revocation rejection path");
        validatePositiveAmount(priceXlm, 7, "revocation rejection price");
        const revokeTx = await ackrate.revokeMandate(
          mandateEvidence.mandate,
          { signer: actors.user },
        );
        const before = await readMandateState();
        if (before.status !== "Revoked") {
          throw new Error("testnet did not expose the user-authorized revocation before payment");
        }
        const url = serverHandle.endpoint(checkedPath);
        const quote = await verifyExactBound402({
          url,
          merchant: addresses.merchant,
          amount: priceXlm,
        });
        const rejection = await expectVerifiedRevocationRejection({
          consumer,
          mandate: mandateEvidence.mandate,
          url,
          quote,
        });
        const after = await readMandateState();
        return Object.freeze({
          kind: "revoked-mandate-rejected",
          revokeTx,
          revokeExplorer: explorerTransactionUrl(revokeTx),
          rejection,
          unchanged: assertMandateStateUnchanged(before, after),
        });
      },
      async expectDurableReplayAfterRestart({ deliveryIndex }) {
        if (durableRestartActionUsed) {
          throw new Error("durable restart replay can be exercised only once per run");
        }
        durableRestartActionUsed = true;
        const index = validateDeliveryIndex(deliveryIndex, deliveries);
        const delivery = deliveries[index];
        const receipt = delivery.privateReceipt;
        const expectedBytes = Buffer.from(JSON.stringify(delivery.body), "utf8");
        const expectedBodySha256 = createHash("sha256").update(expectedBytes).digest("hex");
        const before = await readMandateState();
        const restartPort = Number(new URL(serverHandle.localOrigin).port);

        await serverHandle.close();
        serverHandle = undefined;
        const restartMetrics = createFulfillmentMetrics();
        const restartedStores = createRunStores(stores.stateRoot);
        serverHandle = await startServer({
          port: restartPort,
          redemptionStore: restartedStores.redemptionStore,
          metrics: restartMetrics,
        });
        if (serverHandle.endpoint(delivery.step.path) !== receipt.url) {
          throw new Error("fulfillment restart did not preserve the exact paid URL");
        }

        const response = await fetchWithTimeout(receipt.url, {
          method: "GET",
          headers: {
            accept: "application/json",
            [ACKRATE_PAYMENT_CAPABILITIES_HEADER]: BOUND_PAYMENT_CAPABILITY,
            [X_PAYMENT_HEADER]: encodePaymentProof(receipt.proof),
          },
          redirect: "error",
        }, 30_000);
        const recoveredBytes = Buffer.from(await response.arrayBuffer());
        if (response.status !== 200) {
          throw new Error(`durable replay returned HTTP ${response.status}; expected 200`);
        }
        if (!recoveredBytes.equals(expectedBytes)) {
          throw new Error("durable replay did not return the byte-identical stored response");
        }
        const metrics = restartMetrics.snapshot();
        if (metrics.verificationCalls !== 0 || metrics.fulfillmentCalls !== 0) {
          throw new Error("durable replay re-ran payment verification or paid fulfillment");
        }
        const after = await readMandateState();
        return Object.freeze({
          kind: "durable-same-proof-recovery",
          status: response.status,
          receiptId: receipt.receiptId,
          txHash: receipt.txHash,
          bodySha256: expectedBodySha256,
          byteIdentical: true,
          verificationCalls: metrics.verificationCalls,
          fulfillmentCalls: metrics.fulfillmentCalls,
          unchanged: assertMandateStateUnchanged(before, after),
        });
      },
      async expectResourceRebinding({ deliveryIndex, targetPath }) {
        const index = validateDeliveryIndex(deliveryIndex, deliveries);
        const before = await readMandateState();
        const rejection = await expectBoundProofRejected({
          receipt: deliveries[index].privateReceipt,
          url: serverHandle.endpoint(validateRequestPath(targetPath, "rebinding target path")),
        });
        const after = await readMandateState();
        return Object.freeze({
          rejection,
          unchanged: assertMandateStateUnchanged(before, after),
        });
      },
      async expectTransactionConflict({ deliveryIndex, targetPath }) {
        const index = validateDeliveryIndex(deliveryIndex, deliveries);
        const before = await readMandateState();
        const rejection = await expectReboundTransactionConflict({
          receipt: deliveries[index].privateReceipt,
          url: serverHandle.endpoint(validateRequestPath(targetPath, "conflict target path")),
          agent: actors.agent,
        });
        const after = await readMandateState();
        return Object.freeze({
          rejection,
          unchanged: assertMandateStateUnchanged(before, after),
        });
      },
      readMandateState,
      assertMandateStateUnchanged,
      record: negativeRecord,
    });
    const negativeContext = Object.freeze({
      addresses,
      contract: ackrate.testnet.mandateRegistryId,
      mandateId: mandateEvidence.mandate.id,
      network: "stellar-testnet",
      deliveries: publicDeliveries,
    });
    const negativeValue = validateNegativePathEvidence(await scenario.runNegativePath(
      Object.freeze({ context: negativeContext, actions: negativeActions }),
    ));
    const negativeEvidence = createJsonEvidenceEnvelope(
      scenario.negativePathId,
      negativeValue,
    );
    await record({
      type: "negative_path_verified",
      negativePathId: scenario.negativePathId,
      evidence: negativeEvidence,
    });

    const outputEvidence = createJsonEvidenceEnvelope(
      "consumer-output",
      toBoundedFinalOutputEvidence(await scenario.outputEvidence(Object.freeze({
        deliveries: publicDeliveries,
        negativeEvidence,
      }))),
    );
    await record({
      type: "consumer_output_verified",
      evidence: outputEvidence,
    });

    const pending = await stores.receiptStore.listPending();
    if (pending.length !== 0) {
      throw new Error("completed run still has unresolved settlement receipts");
    }
    await serverHandle.close();
    serverHandle = undefined;
    const summary = Object.freeze({
      scenarioId: scenario.id,
      mandateId: mandateEvidence.mandate.id,
      delivered: transactions.length,
      negativePathVerified: true,
      negativePathId: scenario.negativePathId,
      negativeEvidence,
      outputEvidence,
      transactions,
    });
    await stores.resultStore.finish(runId, "complete", summary);
    await onEvent?.(Object.freeze({ type: "run_complete", runId, ...summary }));
    return Object.freeze({ runId, ...summary });
  } catch (error) {
    runError = error;
    const summary = error instanceof DeliveryPendingError
      ? {
          reason: "delivery pending",
          txHash: error.receipt.txHash,
          receiptId: error.receipt.receiptId,
          explorer: explorerTransactionUrl(error.receipt.txHash),
        }
      : { reason: error instanceof Error ? error.message : String(error) };
    await stores.resultStore.finish(runId, "failed", summary).catch(() => undefined);
    throw error;
  } finally {
    try {
      await serverHandle?.close();
    } catch (closeError) {
      if (!runError) throw closeError;
    }
  }
}

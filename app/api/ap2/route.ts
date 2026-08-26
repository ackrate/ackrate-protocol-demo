import { Buffer } from "buffer";
import { Keypair } from "@stellar/stellar-sdk";
import {
  Ap2ValidationError,
  InMemoryAp2ReplayStore,
  createAp2ComplianceValidator,
  signAp2Mandate,
  type SignedAp2Mandate,
} from "@ackrate/ap2";
import { ackrate } from "@ackrate/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PACKAGE_VERSION = "0.3.0";
const TEST_COUNT = 59;
const SCENARIOS = ["all", "valid", "signature", "merchant", "amount", "expiry", "replay"] as const;
type Scenario = (typeof SCENARIOS)[number];
type IndividualScenario = Exclude<Scenario, "all">;

type CheckResult = {
  id: IndividualScenario;
  label: string;
  passed: boolean;
  code: string;
  detail: string;
};

const labels: Record<IndividualScenario, string> = {
  valid: "Valid mandate",
  signature: "Signature",
  merchant: "Merchant scope",
  amount: "Amount limit",
  expiry: "Expiry",
  replay: "Replay",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store, no-transform",
      "x-content-type-options": "nosniff",
    },
  });
}

function parseScenario(value: unknown): Scenario | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => key !== "scenario")) return undefined;
  return SCENARIOS.find((candidate) => candidate === body.scenario);
}

async function expectCode(
  id: Exclude<IndividualScenario, "valid">,
  expectedCode: Ap2ValidationError["code"],
  run: () => Promise<unknown>,
): Promise<CheckResult> {
  try {
    await run();
    return {
      id,
      label: labels[id],
      passed: false,
      code: "UNEXPECTED_ACCEPT",
      detail: `Expected ${expectedCode}, but the validator accepted the input.`,
    };
  } catch (error) {
    if (error instanceof Ap2ValidationError && error.code === expectedCode) {
      return {
        id,
        label: labels[id],
        passed: true,
        code: error.code,
        detail: `${error.code} returned exactly as expected.`,
      };
    }
    return {
      id,
      label: labels[id],
      passed: false,
      code: error instanceof Ap2ValidationError ? error.code : "UNEXPECTED_ERROR",
      detail: error instanceof Error ? error.message.slice(0, 240) : "Unexpected validator failure.",
    };
  }
}

export async function POST(request: Request): Promise<Response> {
  const scenario = parseScenario(await request.json().catch(() => undefined));
  if (!scenario) {
    return json({ ok: false, error: "Choose all, valid, signature, merchant, amount, expiry, or replay." }, 400);
  }

  const startedAt = performance.now();
  const user = Keypair.random();
  const agent = Keypair.random();
  const merchant = Keypair.random().publicKey();
  const otherMerchant = Keypair.random().publicKey();
  const expiry = Math.floor(Date.now() / 1000) + 3_600;
  const credential = signAp2Mandate({
    intent: {
      user_cart_confirmation_required: false,
      natural_language_description: "Buy one AP2 validator demonstration resource",
      merchants: [merchant],
      skus: [],
      requires_refundability: false,
      intent_expiry: new Date(expiry * 1_000).toISOString(),
    },
    stellar: {
      user: user.publicKey(),
      agent: agent.publicKey(),
      asset: ackrate.testnet.nativeSac,
      maxAmount: "5.00",
      decimals: 7,
    },
  }, user);

  const selected: IndividualScenario[] = scenario === "all"
    ? ["valid", "signature", "merchant", "amount", "expiry", "replay"]
    : [scenario];
  const results: CheckResult[] = [];

  for (const check of selected) {
    const namespace = `ackrate-live:${check}:${credential.mandateHash}`;
    if (check === "valid") {
      try {
        const accepted = await createAp2ComplianceValidator({
          replayStore: new InMemoryAp2ReplayStore(),
          replayNamespace: namespace,
        }).validateAndConsume({
          credential,
          expectedUser: user.publicKey(),
          merchant,
          amount: "1.00",
        });
        results.push({
          id: check,
          label: labels[check],
          passed: accepted.mandateHash === credential.mandateHash,
          code: "ACCEPTED",
          detail: "Signature, trusted user, binding, scope, amount, expiry, and replay admission passed.",
        });
      } catch (error) {
        results.push({
          id: check,
          label: labels[check],
          passed: false,
          code: error instanceof Ap2ValidationError ? error.code : "UNEXPECTED_ERROR",
          detail: error instanceof Error ? error.message.slice(0, 240) : "Unexpected validator failure.",
        });
      }
      continue;
    }

    if (check === "signature") {
      const tampered = structuredClone(credential) as SignedAp2Mandate;
      tampered.signature.value = Buffer.alloc(64).toString("base64");
      results.push(await expectCode(check, "INVALID_SIGNATURE", () =>
        createAp2ComplianceValidator({
          replayStore: new InMemoryAp2ReplayStore(),
          replayNamespace: namespace,
        }).validateAndConsume({
          credential: tampered,
          expectedUser: user.publicKey(),
          merchant,
          amount: "1.00",
        })));
      continue;
    }

    if (check === "merchant") {
      results.push(await expectCode(check, "MERCHANT_MISMATCH", () =>
        createAp2ComplianceValidator({
          replayStore: new InMemoryAp2ReplayStore(),
          replayNamespace: namespace,
        }).validateAndConsume({
          credential,
          expectedUser: user.publicKey(),
          merchant: otherMerchant,
          amount: "1.00",
        })));
      continue;
    }

    if (check === "amount") {
      results.push(await expectCode(check, "AMOUNT_EXCEEDS_MANDATE", () =>
        createAp2ComplianceValidator({
          replayStore: new InMemoryAp2ReplayStore(),
          replayNamespace: namespace,
        }).validateAndConsume({
          credential,
          expectedUser: user.publicKey(),
          merchant,
          amount: "5.0000001",
        })));
      continue;
    }

    if (check === "expiry") {
      results.push(await expectCode(check, "EXPIRED", () =>
        createAp2ComplianceValidator({
          replayStore: new InMemoryAp2ReplayStore(),
          replayNamespace: namespace,
          now: () => expiry,
        }).validateAndConsume({
          credential,
          expectedUser: user.publicKey(),
          merchant,
          amount: "1.00",
        })));
      continue;
    }

    const replayStore = new InMemoryAp2ReplayStore();
    const replayValidator = createAp2ComplianceValidator({ replayStore, replayNamespace: namespace });
    await replayValidator.validateAndConsume({
      credential,
      expectedUser: user.publicKey(),
      merchant,
      amount: "1.00",
    });
    results.push(await expectCode(check, "REPLAYED", () =>
      replayValidator.validateAndConsume({
        credential,
        expectedUser: user.publicKey(),
        merchant,
        amount: "1.00",
      })));
  }

  return json({
    ok: results.every((result) => result.passed),
    scenario,
    package: `@ackrate/ap2@${PACKAGE_VERSION}`,
    testCount: TEST_COUNT,
    mandateHash: credential.mandateHash,
    signatureAlgorithm: credential.signature.algorithm,
    user: user.publicKey(),
    merchant,
    durationMs: Math.max(1, Math.round(performance.now() - startedAt)),
    results,
  });
}

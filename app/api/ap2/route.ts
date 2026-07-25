import { Buffer } from "buffer";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import {
  AP2_OPEN_PAYMENT_VCT,
  Ap2ValidationError,
  InMemoryAp2ReplayStore,
  createAp2ComplianceValidator,
  signAp2Mandate,
  type BindPaymentMandateInput,
  type SignedAp2Mandate,
} from "@reapp-sdk/ap2";
import { reapp } from "@reapp-sdk/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PACKAGE_VERSION = "0.4.0";
const TEST_COUNT = 69;
const SCENARIOS = [
  "all",
  "valid",
  "signature",
  "merchant",
  "checkout",
  "amount",
  "expiry",
  "replay",
] as const;
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
  checkout: "Checkout reference",
  amount: "Amount limit",
  expiry: "Expiry",
  replay: "Replay",
};

/** Canonical UTC whole seconds — the only expiry format the profile accepts. */
function canonicalUtc(unixSeconds: number): string {
  return new Date(unixSeconds * 1_000).toISOString().replace(".000Z", "Z");
}

/** The RFC 8037 Ed25519 JWK the mandate must confirm for its agent. */
function agentJwk(agent: string) {
  return {
    kty: "OKP",
    crv: "Ed25519",
    x: Buffer.from(StrKey.decodeEd25519PublicKey(agent)).toString("base64url"),
  } as const;
}

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
  const checkoutReference = `checkout-${Buffer.from(
    crypto.getRandomValues(new Uint8Array(16)),
  ).toString("hex")}`;

  // AP2 v0.2 autonomous Open Payment Mandate. `payment.amount_range.max` is in
  // ISO-4217 minor units (500 = USD 5.00) and `payment.budget.max` is the same
  // ceiling in major units; the bridge requires them to agree exactly.
  const mandate: BindPaymentMandateInput = {
    paymentMandate: {
      vct: AP2_OPEN_PAYMENT_VCT,
      constraints: [
        {
          type: "payment.allowed_payees",
          allowed: [{ id: merchant, name: "AP2 validator demonstration merchant" }],
        },
        { type: "payment.amount_range", currency: "USD", max: 500 },
        { type: "payment.agent_recurrence", frequency: "ON_DEMAND" },
        { type: "payment.budget", currency: "USD", max: 5 },
        { type: "payment.execution_date", not_after: canonicalUtc(expiry) },
        { type: "payment.reference", conditional_transaction_id: checkoutReference },
      ],
      cnf: { jwk: agentJwk(agent.publicKey()) },
      exp: expiry,
    },
    stellar: {
      user: user.publicKey(),
      agent: agent.publicKey(),
      asset: reapp.testnet.nativeSac,
      decimals: 7,
      currencyDecimals: 2,
    },
  };
  const credential = signAp2Mandate(mandate, user);

  const selected: IndividualScenario[] = scenario === "all"
    ? ["valid", "signature", "merchant", "checkout", "amount", "expiry", "replay"]
    : [scenario];
  const results: CheckResult[] = [];

  // The admission request every scenario starts from. v0.2 additionally binds
  // the payment to the checkout it was signed against, so `checkoutReference`
  // is required rather than optional as it was under v0.1.
  const baseRequest = {
    credential,
    expectedUser: user.publicKey(),
    merchant,
    checkoutReference,
    amount: "1.00",
  };
  const admit = (
    namespace: string,
    overrides: Partial<typeof baseRequest> = {},
    now?: () => number,
  ) =>
    createAp2ComplianceValidator({
      replayStore: new InMemoryAp2ReplayStore(),
      replayNamespace: namespace,
      ...(now ? { now } : {}),
    }).validateAndConsume({ ...baseRequest, ...overrides });

  for (const check of selected) {
    const namespace = `reapp-live:${check}:${credential.mandateHash}`;
    if (check === "valid") {
      try {
        const accepted = await admit(namespace);
        results.push({
          id: check,
          label: labels[check],
          passed: accepted.mandateHash === credential.mandateHash,
          code: "ACCEPTED",
          detail:
            "Signature, trusted user, binding, scope, checkout reference, amount, expiry, and replay admission passed.",
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
        admit(namespace, { credential: tampered })));
      continue;
    }

    if (check === "merchant") {
      results.push(await expectCode(check, "MERCHANT_MISMATCH", () =>
        admit(namespace, { merchant: otherMerchant })));
      continue;
    }

    if (check === "checkout") {
      results.push(await expectCode(check, "CHECKOUT_REFERENCE_MISMATCH", () =>
        admit(namespace, { checkoutReference: "checkout-from-another-session" })));
      continue;
    }

    if (check === "amount") {
      results.push(await expectCode(check, "AMOUNT_EXCEEDS_MANDATE", () =>
        admit(namespace, { amount: "5.0000001" })));
      continue;
    }

    if (check === "expiry") {
      results.push(await expectCode(check, "EXPIRED", () =>
        admit(namespace, {}, () => expiry)));
      continue;
    }

    const replayStore = new InMemoryAp2ReplayStore();
    const replayValidator = createAp2ComplianceValidator({ replayStore, replayNamespace: namespace });
    await replayValidator.validateAndConsume(baseRequest);
    results.push(await expectCode(check, "REPLAYED", () =>
      replayValidator.validateAndConsume(baseRequest)));
  }

  return json({
    ok: results.every((result) => result.passed),
    scenario,
    package: `@reapp-sdk/ap2@${PACKAGE_VERSION}`,
    testCount: TEST_COUNT,
    mandateHash: credential.mandateHash,
    signatureAlgorithm: credential.signature.algorithm,
    ap2SpecVersion: credential.payload.ap2SpecVersion,
    ap2Vct: credential.payload.ap2Vct,
    user: user.publicKey(),
    merchant,
    checkoutReference,
    durationMs: Math.max(1, Math.round(performance.now() - startedAt)),
    results,
  });
}

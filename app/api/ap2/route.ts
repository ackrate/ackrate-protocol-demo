import { Buffer } from "buffer";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import {
  AP2_OPEN_PAYMENT_VCT,
  Ap2ValidationError,
  InMemoryAp2ReplayStore,
  createAp2ComplianceValidator,
  signAp2Mandate,
  signAp2V01Mandate,
  type SignedAp2Mandate,
  type SignedAp2V01Mandate,
  type ValidateAp2MandateInput,
} from "@reapp-sdk/ap2";
import { reapp } from "@reapp-sdk/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PACKAGE_VERSION = "0.4.0";
const TEST_COUNT = 77;
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
const VERSIONS = ["0.2.0", "0.1.0"] as const;

type Scenario = (typeof SCENARIOS)[number];
type IndividualScenario = Exclude<Scenario, "all">;
type Ap2Version = (typeof VERSIONS)[number];

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

/** Canonical UTC whole seconds — the only expiry format either profile accepts. */
function canonicalUtc(unixSeconds: number): string {
  return new Date(unixSeconds * 1_000).toISOString().replace(".000Z", "Z");
}

/** The RFC 8037 Ed25519 JWK a v0.2 mandate must confirm for its agent. */
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

function parseRequest(value: unknown): { scenario: Scenario; version: Ap2Version } | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => key !== "scenario" && key !== "version")) return undefined;
  const scenario = SCENARIOS.find((candidate) => candidate === body.scenario);
  if (!scenario) return undefined;
  // Version is optional so an older client keeps getting the current profile.
  const version = body.version === undefined
    ? "0.2.0"
    : VERSIONS.find((candidate) => candidate === body.version);
  if (!version) return undefined;
  return { scenario, version };
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

async function expectAccept(
  id: IndividualScenario,
  detail: string,
  run: () => Promise<unknown>,
  code = "ACCEPTED",
): Promise<CheckResult> {
  try {
    await run();
    return { id, label: labels[id], passed: true, code, detail };
  } catch (error) {
    return {
      id,
      label: labels[id],
      passed: false,
      code: error instanceof Ap2ValidationError ? error.code : "UNEXPECTED_ERROR",
      detail: error instanceof Error ? error.message.slice(0, 240) : "Unexpected validator failure.",
    };
  }
}

/**
 * One signed credential plus everything the checks below need to know about the
 * profile that produced it. Both AP2 versions are minted by the same published
 * package: `signAp2Mandate` for v0.2, `signAp2V01Mandate` for v0.1. The version
 * is always chosen explicitly — the package never infers it.
 */
type Profile = {
  version: Ap2Version;
  credential: SignedAp2Mandate | SignedAp2V01Mandate;
  baseRequest: ValidateAp2MandateInput;
  specVersion: string;
  /** v0.2 mandate type, or the v0.1 AP2 data key. */
  mandateType: string;
  bindingVersion: string;
  checkoutReference: string | null;
};

export async function POST(request: Request): Promise<Response> {
  const parsed = parseRequest(await request.json().catch(() => undefined));
  if (!parsed) {
    return json({
      ok: false,
      error: "Choose all, valid, signature, merchant, checkout, amount, expiry, or replay, with version 0.2.0 or 0.1.0.",
    }, 400);
  }
  const { scenario, version } = parsed;

  const startedAt = performance.now();
  const user = Keypair.random();
  const agent = Keypair.random();
  const merchant = Keypair.random().publicKey();
  const otherMerchant = Keypair.random().publicKey();
  const expiry = Math.floor(Date.now() / 1000) + 3_600;
  const checkoutReference = `checkout-${Buffer.from(
    crypto.getRandomValues(new Uint8Array(16)),
  ).toString("hex")}`;

  let profile: Profile;
  if (version === "0.2.0") {
    // AP2 v0.2 autonomous Open Payment Mandate. `payment.amount_range.max` is in
    // ISO-4217 minor units (500 = USD 5.00) and `payment.budget.max` is the same
    // ceiling in major units; the bridge requires them to agree exactly.
    const credential = signAp2Mandate({
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
    }, user);
    profile = {
      version,
      credential,
      // v0.2 binds a payment to the checkout it was signed against, so
      // `checkoutReference` is required rather than absent as it was under v0.1.
      baseRequest: {
        credential,
        expectedUser: user.publicKey(),
        merchant,
        checkoutReference,
        amount: "1.00",
      },
      specVersion: credential.payload.ap2SpecVersion,
      mandateType: credential.payload.ap2Vct,
      bindingVersion: credential.payload.bindingVersion,
      checkoutReference,
    };
  } else {
    // AP2 v0.1 IntentMandate, byte-identical to what @reapp-sdk/ap2@0.3.0 signed.
    // The ceiling is the same USD 5.00, expressed directly as a human amount.
    const credential = signAp2V01Mandate({
      intent: {
        user_cart_confirmation_required: false,
        natural_language_description: "Buy one research dataset",
        merchants: [merchant],
        intent_expiry: canonicalUtc(expiry),
      },
      stellar: {
        user: user.publicKey(),
        agent: agent.publicKey(),
        asset: reapp.testnet.nativeSac,
        maxAmount: "5.00",
        decimals: 7,
      },
    }, user);
    profile = {
      version,
      credential,
      baseRequest: {
        credential,
        expectedUser: user.publicKey(),
        merchant,
        amount: "1.00",
      },
      specVersion: credential.payload.ap2SpecVersion,
      mandateType: credential.payload.ap2DataKey,
      bindingVersion: credential.payload.bindingVersion,
      checkoutReference: null,
    };
  }

  const selected: IndividualScenario[] = scenario === "all"
    ? ["valid", "signature", "merchant", "checkout", "amount", "expiry", "replay"]
    : [scenario];
  const results: CheckResult[] = [];

  const admit = (
    namespace: string,
    overrides: Partial<ValidateAp2MandateInput> = {},
    now?: () => number,
  ) =>
    createAp2ComplianceValidator({
      replayStore: new InMemoryAp2ReplayStore(),
      replayNamespace: namespace,
      ...(now ? { now } : {}),
    }).validateAndConsume({ ...profile.baseRequest, ...overrides });

  for (const check of selected) {
    const namespace = `reapp-live:${profile.version}:${check}:${profile.credential.mandateHash}`;

    if (check === "valid") {
      results.push(await expectAccept(
        check,
        profile.version === "0.2.0"
          ? "Signature, trusted user, binding, scope, checkout reference, amount, expiry, and replay admission passed."
          : "Signature, trusted user, binding, scope, amount, expiry, and replay admission passed.",
        async () => {
          const accepted = await admit(namespace);
          if (accepted.mandateHash !== profile.credential.mandateHash) {
            throw new Error("Admitted mandate hash did not match the signed credential.");
          }
        },
      ));
      continue;
    }

    if (check === "signature") {
      const tampered = structuredClone(profile.credential);
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
      // The one place the two profiles genuinely differ. v0.2 binds the payment
      // to the checkout it was signed against. v0.1 has no such concept, so
      // this is NOT a boundary v0.1 passes — it is protection v0.1 does not
      // have, and the result says so rather than showing a green tick for a
      // check that never ran.
      results.push(profile.version === "0.2.0"
        ? await expectCode(check, "CHECKOUT_REFERENCE_MISMATCH", () =>
          admit(namespace, { checkoutReference: "checkout-from-another-session" }))
        : await expectAccept(
          check,
          "Not a boundary under v0.1: the IntentMandate profile never carried a checkout reference, so there is nothing to bind a payment to. Use v0.2 if you need this protection.",
          () => admit(namespace, { checkoutReference: "checkout-from-another-session" }),
          "NOT_APPLICABLE",
        ));
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
    await replayValidator.validateAndConsume(profile.baseRequest);
    results.push(await expectCode(check, "REPLAYED", () =>
      replayValidator.validateAndConsume(profile.baseRequest)));
  }

  return json({
    ok: results.every((result) => result.passed),
    scenario,
    version: profile.version,
    package: `@reapp-sdk/ap2@${PACKAGE_VERSION}`,
    testCount: TEST_COUNT,
    mandateHash: profile.credential.mandateHash,
    signatureAlgorithm: profile.credential.signature.algorithm,
    ap2SpecVersion: profile.specVersion,
    ap2MandateType: profile.mandateType,
    bindingVersion: profile.bindingVersion,
    user: user.publicKey(),
    merchant,
    checkoutReference: profile.checkoutReference,
    durationMs: Math.max(1, Math.round(performance.now() - startedAt)),
    results,
  });
}

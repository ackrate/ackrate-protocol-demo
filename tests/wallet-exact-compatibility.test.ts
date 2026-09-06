import assert from "node:assert/strict";
import test from "node:test";
import {
  Account,
  Contract,
  Networks,
  StrKey,
  TransactionBuilder,
  nativeToScVal,
  rpc,
} from "@stellar/stellar-sdk";
import type { PaymentRequirements } from "@x402/fetch";
import { ExactStellarScheme } from "@x402/stellar/exact/facilitator";

const ASSET = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";
// Public address fixtures only: this compatibility check never creates a signer key.
const PAYER = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 1));
const MERCHANT = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 2));
const FACILITATOR = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 3));
const REGISTRY = StrKey.encodeContract(Buffer.alloc(32, 4));

test("standard Stellar exact rejects registry settlement before RPC or signing", async (t) => {
  const forbidNetwork = async (): Promise<never> => {
    throw new Error("This offline compatibility check must never access the network");
  };
  const fetchGuard = t.mock.method(globalThis, "fetch", forbidNetwork);
  const simulationGuard = t.mock.method(rpc.Server.prototype, "simulateTransaction", forbidNetwork);
  const ledgerGuard = t.mock.method(rpc.Server.prototype, "getLatestLedger", forbidNetwork);
  const submissionGuard = t.mock.method(rpc.Server.prototype, "sendTransaction", forbidNetwork);
  const signingGuard = t.mock.fn(async (): Promise<never> => {
    throw new Error("This offline compatibility check must never sign");
  });

  const requirements: PaymentRequirements = {
    scheme: "exact",
    network: "stellar:pubnet",
    asset: ASSET,
    amount: "200000",
    payTo: MERCHANT,
    maxTimeoutSeconds: 60,
    extra: { areFeesSponsored: true },
  };
  const verifier = new ExactStellarScheme([{
    address: FACILITATOR,
    signAuthEntry: signingGuard,
    signTransaction: signingGuard,
  }], { rpcConfig: { url: "https://offline.invalid" } });

  // These are the two relevant invocation shapes. The registry's actual money
  // path is execute_payment -> USDC.transfer_from, whereas standard exact
  // requires the top-level invocation to be USDC.transfer(from, to, amount).
  // A dependency change that accepts either shape needs integration review.
  const cases = [
    {
      label: "MandateRegistry.execute_payment",
      operation: new Contract(REGISTRY).call(
        "execute_payment",
        nativeToScVal(Buffer.alloc(32, 5)),
        nativeToScVal(200000n, { type: "i128" }),
        nativeToScVal(0, { type: "u32" }),
      ),
      reason: "invalid_exact_stellar_payload_wrong_asset",
    },
    {
      label: "USDC.transfer_from",
      operation: new Contract(ASSET).call(
        "transfer_from",
        nativeToScVal(REGISTRY, { type: "address" }),
        nativeToScVal(PAYER, { type: "address" }),
        nativeToScVal(MERCHANT, { type: "address" }),
        nativeToScVal(200000n, { type: "i128" }),
      ),
      reason: "invalid_exact_stellar_payload_wrong_function_name",
    },
  ];

  for (const candidate of cases) {
    const transaction = new TransactionBuilder(new Account(PAYER, "0"), {
      fee: "100",
      networkPassphrase: Networks.PUBLIC,
    })
      .addOperation(candidate.operation)
      .setTimeout(60)
      .build();

    const result = await verifier.verify({
      x402Version: 2,
      accepted: requirements,
      payload: { transaction: transaction.toXDR() },
    }, requirements);
    assert.equal(result.isValid, false, candidate.label);
    assert.equal(result.invalidReason, candidate.reason, candidate.label);
  }

  for (const guard of [fetchGuard, simulationGuard, ledgerGuard, submissionGuard, signingGuard]) {
    assert.equal(guard.mock.callCount(), 0, "Verification must reject before network or signing");
  }
});

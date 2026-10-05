import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { ackrate, type Agent } from "@ackrate/core";
import { Keypair } from "@stellar/stellar-sdk";
import { TESTNET } from "@ackrate/stellar";
import { setup, pay, revoke } from "../lib/ackrate-server";
import { restoreTestnetMandate } from "../lib/testnet-mandate";

test("demo retains the SDK-confirmed ID across JSON round trips and pins every payment lifecycle call to Testnet", async (t) => {
  const user = Keypair.random(), agent = Keypair.random(), merchant = Keypair.random();
  const registeredId = randomBytes(32).toString("hex");
  let credentialHash = "";
  t.mock.method(ackrate, "registerMandate", async (...[mandate, _options, network]: Parameters<typeof ackrate.registerMandate>) => {
    assert.equal(network, TESTNET);
    credentialHash = mandate.id;
    assert.notEqual(credentialHash, registeredId);
    mandate.credentialHash = credentialHash;
    mandate.id = registeredId;
    mandate.idBuffer = Buffer.from(registeredId, "hex");
    return "a".repeat(64);
  });
  t.mock.method(ackrate, "approveBudget", async (...[mandate, _options, network]: Parameters<typeof ackrate.approveBudget>) => {
    assert.equal(network, TESTNET);
    assert.equal(mandate.id, registeredId);
    return "b".repeat(64);
  });
  const result = await setup({ userSecret: user.secret(), agentPublic: agent.publicKey(), merchantPublic: merchant.publicKey() });
  const inputs = JSON.parse(JSON.stringify(result.inputs));
  const restored = restoreTestnetMandate(inputs);
  assert.equal(restored.id, registeredId);
  assert.equal(restored.idBuffer.toString("hex"), registeredId);
  assert.equal(restored.credentialHash, credentialHash);
  assert.equal(restored.asset, TESTNET.nativeSac);
  t.mock.method(ackrate, "agent", (...[options, network]: Parameters<typeof ackrate.agent>) => {
    assert.equal(network, TESTNET);
    assert.equal(options.mandate.id, registeredId);
    return { pay: async (amount: string, opts: { expectedSeq: number }) => {
      assert.equal(amount, "1.00");
      assert.equal(opts.expectedSeq, 0);
      return "c".repeat(64);
    } } as unknown as Agent;
  });
  assert.equal((await pay({ inputs, agentSecret: agent.secret(), expectedSeq: 0 })).hash, "c".repeat(64));
  t.mock.method(ackrate, "revokeMandate", async (...[mandate, _options, network]: Parameters<typeof ackrate.revokeMandate>) => {
    assert.equal(network, TESTNET);
    assert.equal(mandate.id, registeredId);
    return "d".repeat(64);
  });
  assert.equal((await revoke({ inputs, userSecret: user.secret() })).hash, "d".repeat(64));
  const { registeredMandateId: _removed, ...oldInputs } = inputs;
  assert.throws(() => restoreTestnetMandate(oldInputs), /Confirmed Testnet mandate ID is required/);
  assert.throws(() => restoreTestnetMandate({ ...inputs, registeredMandateId: "invalid" }), /Confirmed Testnet mandate ID is required/);
});

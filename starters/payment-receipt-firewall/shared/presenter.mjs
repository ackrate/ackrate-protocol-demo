// Console output is observational. Durable SDK evidence remains the source of truth.
export function createDemoLogger({ write = console.log } = {}) {
  if (typeof write !== "function") throw new Error("write must be a function");
  const say = (line) => { try { write(line); } catch { /* A closed terminal must not interrupt recovery. */ } };
  const transaction = (label, hash) => {
    if (typeof hash === "string" && /^[0-9a-f]{64}$/i.test(hash)) {
      say(`${label}: https://stellar.expert/explorer/testnet/tx/${hash.toLowerCase()}`);
    }
  };
  const onEvent = (event) => {
    if (!event || typeof event !== "object") return;
    switch (event.type) {
      case "run_started": say("Stellar Testnet · demo funds only"); break;
      case "accounts_funded": say("Testnet accounts funded"); break;
      case "mandate_ready":
        transaction("Mandate registered", event.registerTx);
        transaction("Contract allowance approved", event.approveTx);
        break;
      case "fulfillment_started": say("Local paid API ready"); break;
      case "delivery_accepted": transaction("Paid resource delivered", event.txHash); break;
      case "negative_path_verified": say("Scenario failure or recovery check verified"); break;
      case "consumer_output_verified": say("Output and payment evidence verified"); break;
    }
  };
  const finish = (result) => {
    if (!Number.isSafeInteger(result?.delivered) || result.delivered < 0) throw new Error("invalid delivered count");
    say(`Complete: ${result.delivered} paid result${result.delivered === 1 ? "" : "s"}; evidence in .ackrate/`);
  };
  return Object.freeze({ onEvent, finish });
}

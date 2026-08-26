function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function formatXlm(value) {
  const checked = requireText(value, "XLM amount");
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,7})?$/.test(checked)) {
    throw new Error("XLM amount must be an exact decimal string");
  }
  const normalized = checked.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  return `${normalized} XLM`;
}

function compactPath(path) {
  const checked = requireText(path, "request path");
  return checked.length <= 64 ? checked : `${checked.slice(0, 61)}...`;
}

function transactionLink(event) {
  if (typeof event.explorer === "string" && event.explorer.startsWith("https://")) {
    return event.explorer;
  }
  if (typeof event.txHash === "string" && /^[0-9a-f]{64}$/i.test(event.txHash)) {
    return `https://stellar.expert/explorer/testnet/tx/${event.txHash.toLowerCase()}`;
  }
  return undefined;
}

function rawEventLine(event) {
  const link = transactionLink(event);
  return `[${event.type}]${link ? ` · ${link}` : ""}`;
}

const ACKRATE_BANNER = String.raw`
 ____  _____    _    ____  ____
|  _ \| ____|  / \  |  _ \|  _ \
| |_) |  _|   / _ \ | |_) | |_) |
|  _ <| |___ / ___ \|  __/|  __/
|_| \_\_____/_/   \_\_|   |_|
`;

export function createBeginnerDemoPresenter({
  scenario,
  starter,
  write = (line = "") => console.log(line),
  verbose = process.env.ACKRATE_VERBOSE === "1",
} = {}) {
  if (!scenario || typeof scenario !== "object") throw new Error("scenario is required");
  if (!starter || typeof starter !== "object") throw new Error("starter presentation is required");
  if (typeof write !== "function") throw new Error("write must be a function");

  const title = requireText(starter.title, "starter title");
  const summary = requireText(starter.summary, "starter summary");
  const negativeOutcome = requireText(starter.negativePathOutcome, "negative-path explanation");
  const budget = formatXlm(scenario.budgetXlm);
  const plannedPurchases = scenario.plan.length;
  let requestNumber = 0;
  let latestPrice;
  let finished = false;
  let deliveredCount = 0;
  let safetyStepStarted = false;

  const say = (line = "") => write(String(line));
  const step = (number, heading) => {
    say("");
    say(`${number}/6  ${heading}`);
  };

  say(ACKRATE_BANNER);
  say("============================================================");
  say(`ACKRATE STARTER: ${title}`);
  say("Stellar testnet — demo funds only, no real money");
  say("============================================================");
  say(summary);
  step(1, "Creating safe demo accounts...");

  const onEvent = (event) => {
    try {
      if (!event || typeof event !== "object" || typeof event.type !== "string") {
        if (verbose) say("  developer: [unrecognized_event]");
        return;
      }
      if (verbose) say(`  developer: ${rawEventLine(event)}`);

      switch (event.type) {
      case "run_started":
        break;
      case "accounts_funded":
        say("  ✓ Temporary user, agent, and seller accounts are ready.");
        say("  These accounts exist only on Stellar testnet.");
        step(2, "Giving the agent a spending limit...");
        break;
      case "mandate_ready":
        say(`  ✓ The user allowed this agent to spend up to ${budget}.`);
        say("  The smart contract—not the app—will enforce that limit.");
        step(3, "Starting the paid Express API...");
        break;
      case "fulfillment_started":
        say("  ✓ The seller's API is running locally and ready for requests.");
        step(4, `Buying ${plannedPurchases} protected result${plannedPurchases === 1 ? "" : "s"}...`);
        break;
      case "challenge_402_verified":
        requestNumber += 1;
        latestPrice = formatXlm(event.priceXlm);
        say("");
        say(`  Purchase ${requestNumber}: GET ${compactPath(event.path)}`);
        say("  → HTTP 402 Payment Required");
        say("    Good: the API is protected and is asking the agent to pay.");
        break;
      case "purchase_started":
        say(`  → The agent asks the contract to approve ${latestPrice ?? "the exact price"}.`);
        break;
      case "delivery_accepted": {
        deliveredCount += 1;
        say("  → HTTP 200 OK");
        say("    Success: payment was approved and the protected result arrived.");
        const link = transactionLink(event);
        if (link) say(`    View the payment on Stellar: ${link}`);
        if (deliveredCount === plannedPurchases) {
          step(5, "Testing the safety or recovery rule...");
          say(`  Expected: ${negativeOutcome}`);
          say("  This can take a little longer when Stellar must advance time.");
          safetyStepStarted = true;
        }
        break;
      }
      case "negative_path_verified":
        if (!safetyStepStarted) {
          step(5, "Testing the safety or recovery rule...");
          say(`  Expected: ${negativeOutcome}`);
          safetyStepStarted = true;
        }
        say("  ✓ Passed. The expected behavior was verified.");
        say("  The expected safety or recovery behavior happened exactly once.");
        break;
      case "consumer_output_verified":
        step(6, "Checking the final evidence...");
        say("  ✓ The delivered results, payment receipts, and safety evidence match.");
        break;
      case "run_complete":
        break;
      default:
        // Scenario-specific events remain in the durable evidence log and in
        // ACKRATE_VERBOSE=1 output. Beginners only need the verified outcome.
        break;
      }
    } catch (error) {
      // Console narration must never interrupt payment recovery or durable
      // evidence handling. The structured runtime remains the source of truth.
      void error;
    }
  };

  const finish = (result) => {
    if (finished) throw new Error("demo presenter cannot finish twice");
    finished = true;
    const delivered = Number(result?.delivered);
    if (!Number.isSafeInteger(delivered) || delivered < 0) {
      throw new Error("demo result delivered count is invalid");
    }
    say("");
    say("============================================================");
    say("DEMO COMPLETE ✓");
    say("============================================================");
    say("");
    say("What just happened:");
    say("  1. A consumer agent asked an Express API for protected data.");
    say("  2. The API replied 402, which means payment was required.");
    say("  3. The contract checked the user-approved spending rules.");
    say(`  4. ${delivered} approved payment${delivered === 1 ? "" : "s"} returned ${delivered} protected result${delivered === 1 ? "" : "s"} with HTTP 200.`);
    say("  5. The starter's safety rule was tested and verified.");
    say("");
    say(`Result: ${delivered} paid result${delivered === 1 ? "" : "s"} delivered safely.`);
    say("Next: open scenario/scenario.mjs to change the product rules and sample data.");
    say("Tip: run ACKRATE_VERBOSE=1 npm run demo to also see developer event names.");
  };

  return Object.freeze({ finish, onEvent });
}

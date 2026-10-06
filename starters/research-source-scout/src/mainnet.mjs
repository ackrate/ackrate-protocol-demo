import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export class MainnetInputError extends Error {}

const REQUIRED = ["user-signer", "agent-signer", "agent-secret-env", "merchant", "price", "budget"];
export const HELP = `Research Source Scout Mainnet companion (@ackrate/cli 0.2.1)

First run npm run demo for the local Testnet SDK scenario.
This separate published reference runner makes three Mainnet USDC payments.

npm run demo:mainnet -- --user-signer NAME --agent-signer NAME \\
  --agent-secret-env ENV_NAME --merchant G_ADDRESS \\
  --price 0.01 --budget 0.03 --confirm-real-usdc

Use distinct user/agent/merchant accounts and authorized USDC trustlines.
User and agent each need at least 0.50 spendable XLM after reserves.
Budget must cover three prices but remain below four prices; XLM fees are separate.
The named user identity signs user transactions through Stellar CLI.
The supplied agent environment key signs BOTH agent transactions and detached proofs.
The named agent identity is used to verify that key's public address matches.
Secure Store identities do not export the raw key this CLI requires. Use a dedicated
supported private identity/secret provider; never bypass Secure Store or put keys in argv.
State stays in .ackrate-mainnet/ beside package.json; do not delete pending evidence.
Testnet reset does not reset Mainnet. Network and manifest overrides are not accepted.`;

export function prepareMainnet(args, { projectRoot, env = process.env, nodeVersion = process.versions.node } = {}) {
  if (Number(nodeVersion.split(".")[0]) < 22) throw new MainnetInputError("Node.js 22 or newer is required.");
  if (args.length === 1 && args[0] === "--help") return { help: HELP };
  const values = new Map();
  let confirmed = false;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--confirm-real-usdc") {
      if (confirmed) throw new MainnetInputError("Duplicate confirmation flag.");
      confirmed = true;
      continue;
    }
    const name = flag.startsWith("--") ? flag.slice(2) : "";
    if (!REQUIRED.includes(name)) throw new MainnetInputError("Unsupported argument. Run with --help for accepted options.");
    if (values.has(name)) throw new MainnetInputError(`Duplicate --${name}.`);
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new MainnetInputError(`Missing --${name} value.`);
    values.set(name, value);
  }
  if (!confirmed) throw new MainnetInputError("Mainnet requires explicit --confirm-real-usdc; no transaction was started.");
  for (const name of REQUIRED) if (!values.has(name)) throw new MainnetInputError(`Missing --${name}.`);
  for (const name of ["user-signer", "agent-signer"]) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(values.get(name)) || /^[SG][A-Z2-7]{55}$/.test(values.get(name))) throw new MainnetInputError(`--${name} must be a named Stellar CLI identity.`);
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(values.get("agent-secret-env"))) throw new MainnetInputError("--agent-secret-env must name an environment variable, not contain a secret.");
  if (!/^G[A-Z2-7]{55}$/.test(values.get("merchant"))) throw new MainnetInputError("--merchant must be a Stellar public G-address.");
  for (const name of ["price", "budget"]) {
    if (!/^(?:0|[1-9][0-9]*)\.[0-9]{1,7}$/.test(values.get(name)) || Number(values.get(name)) <= 0) throw new MainnetInputError(`--${name} must be a positive decimal with at most seven decimal places.`);
  }
  const root = resolve(projectRoot);
  return {
    executable: process.execPath,
    args: [resolve(root, "node_modules/@ackrate/cli/dist/ackrate-cli.bundle.mjs"), "demo", "research-agent", "--network", "mainnet", ...REQUIRED.flatMap((name) => [`--${name}`, values.get(name)]), "--confirm-real-usdc"],
    options: { cwd: root, env: { ...env, ACKRATE_HOME: resolve(root, ".ackrate-mainnet") }, stdio: "inherit", shell: false },
  };
}

export async function runMainnet(args, { launch = spawn, ...options } = {}) {
  const command = prepareMainnet(args, options);
  if (command.help) return command;
  const child = launch(command.executable, command.args, command.options);
  const code = await new Promise((accept, reject) => {
    child.once("error", reject);
    child.once("exit", (status, signal) => accept(status ?? (signal === "SIGINT" ? 130 : 1)));
  });
  return { code };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  runMainnet(process.argv.slice(2), { projectRoot }).then((result) => {
    if (result.help) console.log(result.help);
    process.exitCode = result.code ?? 0;
  }).catch((error) => {
    console.error(error instanceof MainnetInputError ? error.message : "Mainnet companion stopped. Preserve .ackrate-mainnet/ and use the README recovery commands.");
    process.exitCode = 1;
  });
}

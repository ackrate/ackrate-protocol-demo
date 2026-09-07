/** Hosted inspection runs the published Mainnet CLI without deployment secrets. */
export const CLI_VERSION = "0.2.0";
export const CLI_MAINNET_CONTRACT = "CCLZEBJXG4YVJEPBCR5F27N733BCK5HQJWZZGB3K54JVODY3VAGP4HWR";
const COMMANDS = [
  ["--version"], ["--help"], ["demo"], ["demo", "--help"],
  ["demo", "research-agent", "--network", "mainnet"],
  ["init", "--network", "mainnet"], ["init", "--help"],
  ["setup"], ["setup", "--help"],
  ["mandate", "create"], ["mandate", "create", "--help"],
  ["pay"], ["pay", "--help"],
  ["settlement", "--help"], ["settlement", "reconcile"],
  ["settlement", "acknowledge", "--help"],
  ["ops", "--help"], ["ops", "create", "--help"],
  ["ops", "verify", "--help"], ["ops", "combine", "--help"],
];

export function mainnetCliArguments(input: unknown): string[] | null {
  if (!Array.isArray(input) || input.some((part) => typeof part !== "string")) return null;
  let args = input as string[];
  if (JSON.stringify(args) === '["demo","research-agent"]') args = [...args, "--network", "mainnet"];
  if (JSON.stringify(args) === '["init"]') args = [...args, "--network", "mainnet"];
  return COMMANDS.some((command) => JSON.stringify(command) === JSON.stringify(args)) ? [...args] : null;
}

export function mainnetCliEnvironment(home: string): NodeJS.ProcessEnv {
  // Do not spread process.env: it contains unrelated production secrets.
  return { NODE_ENV: "production", ACKRATE_HOME: home, FORCE_COLOR: "1", ACKRATE_NETWORK: "mainnet" };
}

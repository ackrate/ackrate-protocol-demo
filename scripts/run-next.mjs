import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const [command, ...args] = process.argv.slice(2);
if (!["dev", "build", "start"].includes(command)) {
  throw new Error("Expected dev, build, or start");
}
const env = { ...process.env, ACKRATE_CLI_RUNTIME_START: command === "start" ? "1" : "0" };
if (command === "dev") env.WATCHPACK_POLLING = "true";
if (command !== "build") {
  env.NODE_OPTIONS = [env.NODE_OPTIONS, "--disable-warning=DEP0205"].filter(Boolean).join(" ");
}
const next = createRequire(import.meta.url).resolve("next/dist/bin/next");
const child = spawn(process.execPath, [next, command, ...args], { env, stdio: "inherit" });
const signals = new Map(["SIGINT", "SIGTERM"].map(signal => [signal, () => child.kill(signal)]));
for (const [signal, forward] of signals) process.on(signal, forward);
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
child.on("exit", (code, signal) => {
  for (const [name, forward] of signals) process.off(name, forward);
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});

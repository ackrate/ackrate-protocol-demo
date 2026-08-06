export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { registerNodeInstrumentation } = await import("./lib/instrumentation-node");
  await registerNodeInstrumentation();
}

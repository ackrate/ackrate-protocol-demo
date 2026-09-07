/** Presentation only: receipts remain links to the recorded run, never payment actions. */
export function presentCliTestLogs(logs: string) {
  const start = logs.lastIndexOf("\nACKRATE CLI ");
  const latest = start >= 0 ? logs.slice(start + 1) : logs;
  const prior = start >= 0 ? logs.slice(0, start).trim() : "";
  const output = latest.split("\n\nSaved reference-agent evidence")[0];
  const clean = (value: string) => value
    .replace(/\x1b\]8;[^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
  const receipts: { label: string; hash: string; payment: boolean }[] = [];
  const markers = [
    ["register=", "Mandate registration", false],
    ["allowance=", "USDC allowance", false],
    ["market delivered after verified payment tx=", "Market · 0.01 USDC", true],
    ["academic delivered after verified payment tx=", "Academic · 0.01 USDC", true],
    ["news delivered after verified payment tx=", "News · 0.01 USDC", true],
  ] as const;
  for (const [marker, label, payment] of markers) {
    const line = output.split("\n").find((candidate) => candidate.includes(marker));
    const value = line?.slice(line.indexOf(marker) + marker.length);
    const match = value?.match(/^\x1b\]8;;https:\/\/stellar\.expert\/explorer\/public\/tx\/([a-f0-9]{64})(?:\x07|\x1b\\)/);
    if (match) receipts.push({ label, hash: match[1], payment });
  }
  return { output: clean(output).trim(), prior: clean(prior), receipts };
}

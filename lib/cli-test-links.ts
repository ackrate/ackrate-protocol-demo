import { presentCliTestLogs } from "./cli-test-presentation";

const EXPLORER = "https://stellar.expert/explorer/public/tx/";
const HASH = /^[a-f0-9]{64}$/i;
const TX_URL = /^https:\/\/stellar\.expert\/explorer\/public\/tx\/([a-f0-9]{64})$/i;
export type CliLogPart = { text: string; hash?: string; href?: string };
export type CliReceiptLink = { label: string; hash: string };

export const shortCliHash = (hash: string) => `${hash.slice(0, 6)}…${hash.slice(-4)}`;

/** Terminal hyperlinks are data, not HTML. Only exact Mainnet explorer URLs become anchors. */
export function cliLogText(raw: string): string {
  return raw
    .replace(/\x1b\]8;[^;\x07\x1b]*;([^\x07\x1b]*)(?:\x07|\x1b\\)([\s\S]*?)\x1b\]8;[^;\x07\x1b]*;(?:\x07|\x1b\\)/g,
      (_match, url: string, label: string) => TX_URL.test(url) ? url : label)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
}

export function cliLogParts(raw: string): CliLogPart[] {
  const value = cliLogText(raw);
  const parts: CliLogPart[] = [];
  let offset = 0;
  for (const match of value.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    const candidate = match[0].replace(/[.,;)\]}]+$/, "");
    const valid = TX_URL.exec(candidate);
    if (!valid) continue;
    if (match.index > offset) parts.push({ text: value.slice(offset, match.index) });
    const hash = valid[1].toLowerCase();
    parts.push({ text: shortCliHash(hash), hash, href: `${EXPLORER}${hash}` });
    offset = match.index + candidate.length;
  }
  if (offset < value.length) parts.push({ text: value.slice(offset) });
  return parts;
}

export function cliReceiptLinks(raw: string, fundingHash?: string): CliReceiptLink[] {
  const labeled = presentCliTestLogs(raw).receipts;
  const labels = new Map(labeled.map(({ hash, label }) => [hash, label]));
  const funding = fundingHash && HASH.test(fundingHash) ? fundingHash.toLowerCase() : undefined;
  const hashes = new Set<string>(funding ? [funding] : []);
  for (const part of cliLogParts(raw)) if (part.hash) hashes.add(part.hash);
  return [...hashes].map((hash) => ({ hash, label: hash === funding ? "Funding" : labels.get(hash) ?? "Transaction" }));
}

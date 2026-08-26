import { randomUUID } from "node:crypto";
import { access, chmod, mkdir, rename } from "node:fs/promises";
import { relative, resolve } from "node:path";
import {
  FileBoundRedemptionStore,
  FileRunResultStore,
  FileSettlementReceiptStore,
} from "./storage.mjs";

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function createResetStores(stateRoot) {
  return Object.freeze({
    receipts: new FileSettlementReceiptStore(resolve(stateRoot, "pending-receipts.json")),
    results: new FileRunResultStore(resolve(stateRoot, "results.json")),
    redemptions: new FileBoundRedemptionStore(
      resolve(stateRoot, "fulfillment-redemptions.json"),
    ),
  });
}

export class SafeResetRefusedError extends Error {
  constructor(report) {
    super("safe reset refused because unresolved payment or fulfillment evidence remains");
    this.name = "SafeResetRefusedError";
    this.report = report;
  }
}

export async function inspectResetSafety({ stateRoot = resolve(".ackrate") } = {}) {
  const root = resolve(stateRoot);
  const stores = createResetStores(root);
  const accepted = new Map(
    (await stores.results.acceptedReceipts()).map((entry) => [entry.receiptId, entry.txHash]),
  );
  let clearedAcceptedReceipts = 0;

  for (const receipt of await stores.receipts.listPending()) {
    if (accepted.get(receipt.receiptId) === receipt.txHash) {
      await stores.receipts.clearPending(receipt.receiptId);
      clearedAcceptedReceipts += 1;
    }
  }

  const unresolved = (await stores.receipts.listPending()).map((receipt) => Object.freeze({
    receiptId: receipt.receiptId,
    txHash: receipt.txHash,
    mandateId: receipt.mandateId,
  }));
  const executing = (await stores.redemptions.listExecuting()).map((record) => Object.freeze({
    key: record.key,
    executionId: record.executionId,
    proofDigest: record.proofDigest,
    startedAt: record.startedAt,
    txHash: record.payment.txHash,
    mandateId: record.payment.mandateId,
  }));
  return Object.freeze({
    safe: unresolved.length === 0 && executing.length === 0,
    clearedAcceptedReceipts,
    unresolved: Object.freeze(unresolved),
    executing: Object.freeze(executing),
  });
}

export async function runSafeReset({
  stateRoot = resolve(".ackrate"),
  archiveRoot = resolve(".ackrate-archive"),
  now = () => new Date(),
} = {}) {
  const source = resolve(stateRoot);
  const archive = resolve(archiveRoot);
  const archiveInsideState = relative(source, archive);
  if (source === archive || (!archiveInsideState.startsWith("..") && archiveInsideState !== "")) {
    throw new Error("archive root must be outside the active state directory");
  }
  if (!(await exists(source))) {
    return Object.freeze({ kind: "missing", stateRoot: source });
  }

  const report = await inspectResetSafety({ stateRoot: source });
  if (!report.safe) throw new SafeResetRefusedError(report);

  const captured = now();
  if (!(captured instanceof Date) || Number.isNaN(captured.getTime())) {
    throw new Error("reset clock must return a valid Date");
  }
  await mkdir(archive, { recursive: true, mode: 0o700 });
  await chmod(archive, 0o700);
  const stamp = captured.toISOString().replace(/[:.]/g, "-");
  const destination = resolve(archive, `${stamp}-${randomUUID()}`);
  await rename(source, destination);
  return Object.freeze({
    kind: "archived",
    stateRoot: source,
    destination,
    report,
  });
}

import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  createSettlementReceiptId,
  decodePaymentProof,
  encodePaymentProof,
} from "@ackrate/core";
import { toJsonSafeObject } from "./evidence.mjs";

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_RUNS = 20;
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const EVENT_TYPE = /^[a-z][a-z0-9]*(?:[_-][a-z0-9]+)*$/;
const RESERVED_APPEND_EVENT_TYPES = new Set([
  "delivery_accepted",
  "run_complete",
  "run_failed",
  "run_started",
]);
const DELIVERY_EVENT_KEYS = new Set([
  "at",
  "bodySha256",
  "evidence",
  "explorer",
  "path",
  "receiptId",
  "step",
  "txHash",
  "type",
]);
const queues = new Map();

function exactKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index]);
}

async function serialized(path, operation) {
  const previous = queues.get(path) ?? Promise.resolve();
  const current = previous.then(operation, operation);
  const tail = current.then(() => undefined, () => undefined);
  queues.set(path, tail);
  try {
    return await current;
  } finally {
    if (queues.get(path) === tail) queues.delete(path);
  }
}

async function readJson(path, fallback) {
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size > MAX_FILE_BYTES) {
      throw new Error(`${path} is not a safe ACKRATE state file`);
    }
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return structuredClone(fallback);
    throw error;
  }
}

function serializedJson(path, value) {
  let contents;
  try {
    const json = JSON.stringify(value, null, 2);
    if (json === undefined) throw new Error("state root is not JSON-serializable");
    contents = `${json}\n`;
  } catch (error) {
    throw new Error(`${path} could not be serialized as ACKRATE state`, { cause: error });
  }
  const bytes = Buffer.byteLength(contents, "utf8");
  if (bytes > MAX_FILE_BYTES) {
    throw new Error(
      `${path} would exceed the safe ACKRATE state limit of ${MAX_FILE_BYTES} bytes`,
    );
  }
  return contents;
}

async function writeJson(path, value) {
  // Serialize and bound the complete replacement before creating a temporary
  // file. A rejected update therefore cannot disturb the last durable state.
  const contents = serializedJson(path, value);
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(contents, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, path);
    await chmod(path, 0o600);
    const directoryHandle = await open(directory, "r");
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } finally {
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

function validateReceipt(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("pending receipt is not an object");
  }
  const expectedKeys = [
    "amount",
    "mandateId",
    "method",
    "proof",
    "proofVersion",
    "receiptId",
    "submittedAt",
    "txHash",
    "url",
    "validUntil",
  ];
  if (
    !exactKeys(value, expectedKeys)
    || !/^[0-9a-f]{64}$/.test(value.receiptId)
    || !/^[0-9a-f]{64}$/.test(value.txHash)
    || !/^[0-9a-f]{64}$/.test(value.mandateId)
    || (value.proofVersion !== 1 && value.proofVersion !== 2)
    || typeof value.url !== "string"
    || typeof value.method !== "string"
    || typeof value.amount !== "string"
    || !Number.isSafeInteger(value.submittedAt)
    || !Number.isSafeInteger(value.validUntil)
    || value.submittedAt <= 0
    || value.validUntil <= value.submittedAt
  ) {
    throw new Error("pending receipt envelope is invalid");
  }
  const proof = decodePaymentProof(encodePaymentProof(value.proof));
  if (proof.txHash !== value.txHash || proof.mandateId !== value.mandateId) {
    throw new Error("pending receipt proof does not match its envelope");
  }
  const expectedId = createSettlementReceiptId({
    proofVersion: value.proofVersion,
    url: value.url,
    method: value.method,
    txHash: value.txHash,
    mandateId: value.mandateId,
    amount: value.amount,
    submittedAt: value.submittedAt,
    validUntil: value.validUntil,
    proof,
  });
  if (expectedId !== value.receiptId) {
    throw new Error("pending receipt integrity id is invalid");
  }
  return Object.freeze({ ...value, proof: Object.freeze(proof) });
}

export class FileSettlementReceiptStore {
  constructor(filePath) {
    this.filePath = resolve(filePath);
  }

  async savePending(receipt) {
    return serialized(this.filePath, async () => {
      const file = await this.#load();
      const checked = validateReceipt(receipt);
      file.pending[checked.receiptId] = checked;
      await writeJson(this.filePath, file);
    });
  }

  async clearPending(receiptId) {
    return serialized(this.filePath, async () => {
      const file = await this.#load();
      delete file.pending[receiptId];
      await writeJson(this.filePath, file);
    });
  }

  async listPending() {
    return serialized(this.filePath, async () =>
      Object.values((await this.#load()).pending).map(validateReceipt));
  }

  async #load() {
    const file = await readJson(this.filePath, { version: 1, pending: {} });
    if (
      !exactKeys(file, ["version", "pending"])
      || file.version !== 1
      || !file.pending
      || typeof file.pending !== "object"
      || Array.isArray(file.pending)
    ) {
      throw new Error("pending receipt file schema is invalid");
    }
    for (const [id, receipt] of Object.entries(file.pending)) {
      if (validateReceipt(receipt).receiptId !== id) {
        throw new Error("pending receipt key does not match its integrity id");
      }
    }
    return { version: 1, pending: { ...file.pending } };
  }
}

function canonicalTimestamp(value, label) {
  if (typeof value !== "string") throw new Error(`${label} must be an ISO timestamp`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`${label} must be a canonical ISO timestamp`);
  }
  return value;
}

function validateEventType(value, label = "event type") {
  if (typeof value !== "string" || !EVENT_TYPE.test(value)) {
    throw new Error(`${label} must use lowercase words separated by hyphens or underscores`);
  }
  return value;
}

function validateCommittedDeliveryEvent(value, { stored }) {
  const checked = toJsonSafeObject(value, "committed delivery event");
  for (const key of Object.keys(checked)) {
    if (!DELIVERY_EVENT_KEYS.has(key)) {
      throw new Error(`committed delivery event contains unsupported field ${key}`);
    }
  }
  if (
    checked.type !== "delivery_accepted"
    || !/^[0-9a-f]{64}$/.test(checked.receiptId)
    || !/^[0-9a-f]{64}$/.test(checked.txHash)
  ) {
    throw new Error("committed delivery event requires canonical receipt and transaction hashes");
  }
  if (stored) canonicalTimestamp(checked.at, "committed delivery timestamp");
  else if (Object.hasOwn(checked, "at")) {
    throw new Error("committed delivery timestamp is assigned by the result store");
  }
  if (
    checked.step !== undefined
    && (!Number.isSafeInteger(checked.step) || checked.step < 1)
  ) {
    throw new Error("committed delivery step must be a positive safe integer");
  }
  if (checked.path !== undefined) {
    if (
      typeof checked.path !== "string"
      || !checked.path.startsWith("/")
      || checked.path.startsWith("//")
      || checked.path.includes("#")
      || /[\r\n]/.test(checked.path)
    ) {
      throw new Error("committed delivery path is invalid");
    }
    const parsed = new URL(checked.path, "http://127.0.0.1");
    if (`${parsed.pathname}${parsed.search}` !== checked.path) {
      throw new Error("committed delivery path is not canonical");
    }
  }
  if (
    checked.bodySha256 !== undefined
    && (typeof checked.bodySha256 !== "string" || !/^[0-9a-f]{64}$/.test(checked.bodySha256))
  ) {
    throw new Error("committed delivery body hash is invalid");
  }
  if (
    checked.explorer !== undefined
    && checked.explorer !== `https://stellar.expert/explorer/testnet/tx/${checked.txHash}`
  ) {
    throw new Error("committed delivery explorer URL does not match its transaction");
  }
  return checked;
}

function validateAppendEvent(value) {
  const checked = toJsonSafeObject(value, "run event");
  const type = validateEventType(checked.type);
  if (Object.hasOwn(checked, "at")) {
    throw new Error("run event timestamp is assigned by the result store");
  }
  if (RESERVED_APPEND_EVENT_TYPES.has(type)) {
    throw new Error(`run event type ${type} is reserved for a dedicated lifecycle operation`);
  }
  return checked;
}

function validateStoredEvent(value) {
  const checked = toJsonSafeObject(value, "stored run event");
  const type = validateEventType(checked.type, "stored run event type");
  canonicalTimestamp(checked.at, "stored run event timestamp");
  if (type === "delivery_accepted") {
    return validateCommittedDeliveryEvent(checked, { stored: true });
  }
  if (RESERVED_APPEND_EVENT_TYPES.has(type)) {
    throw new Error(`stored run event type ${type} is not valid inside an event journal`);
  }
  return checked;
}

function validateRunResultFile(value) {
  const checked = toJsonSafeObject(value, "result file");
  if (
    !exactKeys(checked, ["version", "runs"])
    || checked.version !== 1
    || !Array.isArray(checked.runs)
    || checked.runs.length > MAX_RUNS
  ) {
    throw new Error("result file schema is invalid");
  }

  const runIds = new Set();
  const receiptTransactions = new Map();
  const transactionReceipts = new Map();
  const runs = checked.runs.map((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error("result run is not an object");
    }
    const terminal = candidate.status === "complete" || candidate.status === "failed";
    const expectedKeys = terminal
      ? ["config", "events", "finishedAt", "runId", "startedAt", "status", "summary"]
      : ["config", "events", "finishedAt", "runId", "startedAt", "status"];
    if (
      !exactKeys(candidate, expectedKeys)
      || !RUN_ID.test(candidate.runId)
      || runIds.has(candidate.runId)
      || (candidate.status !== "running" && !terminal)
      || !Array.isArray(candidate.events)
    ) {
      throw new Error("result run schema is invalid");
    }
    runIds.add(candidate.runId);
    const startedAt = canonicalTimestamp(candidate.startedAt, "result run start");
    let finishedAt = null;
    if (terminal) {
      finishedAt = canonicalTimestamp(candidate.finishedAt, "result run finish");
      if (Date.parse(finishedAt) < Date.parse(startedAt)) {
        throw new Error("result run finish cannot precede its start");
      }
    } else if (candidate.finishedAt !== null) {
      throw new Error("running result must not have a finish timestamp");
    }
    const events = candidate.events.map(validateStoredEvent);
    for (const event of events) {
      if (event.type !== "delivery_accepted") continue;
      if (receiptTransactions.has(event.receiptId)) {
        throw new Error("result file contains a duplicate committed receipt");
      }
      if (transactionReceipts.has(event.txHash)) {
        throw new Error("result file binds one settlement transaction to multiple receipts");
      }
      receiptTransactions.set(event.receiptId, event.txHash);
      transactionReceipts.set(event.txHash, event.receiptId);
    }
    const result = {
      runId: candidate.runId,
      status: candidate.status,
      startedAt,
      finishedAt,
      config: toJsonSafeObject(candidate.config, "result run config"),
      events: [...events],
    };
    if (terminal) result.summary = toJsonSafeObject(candidate.summary, "result run summary");
    return result;
  });
  return { version: 1, runs };
}

export class FileRunResultStore {
  constructor(filePath) {
    this.filePath = resolve(filePath);
  }

  async begin(publicConfig) {
    const checkedConfig = toJsonSafeObject(publicConfig, "run public config");
    const runId = randomUUID();
    await serialized(this.filePath, async () => {
      const file = await this.#load();
      file.runs.push({
        runId,
        status: "running",
        startedAt: new Date().toISOString(),
        finishedAt: null,
        config: checkedConfig,
        events: [],
      });
      if (file.runs.length > MAX_RUNS) file.runs.splice(0, file.runs.length - MAX_RUNS);
      await writeJson(this.filePath, validateRunResultFile(file));
    });
    return runId;
  }

  async append(runId, event) {
    const checkedEvent = validateAppendEvent(event);
    return serialized(this.filePath, async () => {
      const file = await this.#load();
      const run = file.runs.find((candidate) => candidate.runId === runId);
      if (!run || run.status !== "running") {
        throw new Error("cannot append to a missing or finished ACKRATE run");
      }
      run.events.push(Object.freeze({ ...checkedEvent, at: new Date().toISOString() }));
      await writeJson(this.filePath, validateRunResultFile(file));
    });
  }

  async commitDelivery(runId, event) {
    const checkedEvent = validateCommittedDeliveryEvent(event, { stored: false });
    return serialized(this.filePath, async () => {
      const file = await this.#load();
      const run = file.runs.find((candidate) => candidate.runId === runId);
      if (!run || run.status !== "running") {
        throw new Error("cannot commit delivery to a missing or finished ACKRATE run");
      }
      const existing = run.events.find(
        (candidate) => candidate.type === "delivery_accepted"
          && candidate.receiptId === checkedEvent.receiptId,
      );
      if (existing) {
        const { at: _at, ...existingPayload } = existing;
        if (!isDeepStrictEqual(existingPayload, checkedEvent)) {
          throw new Error("receipt id is already bound to different delivery evidence");
        }
        return existing;
      }
      if (run.events.some(
        (candidate) => candidate.type === "delivery_accepted"
          && candidate.txHash === checkedEvent.txHash,
      )) {
        throw new Error("transaction hash is already committed to another receipt");
      }
      const committed = Object.freeze({ ...checkedEvent, at: new Date().toISOString() });
      run.events.push(committed);
      await writeJson(this.filePath, validateRunResultFile(file));
      return committed;
    });
  }

  async finish(runId, status, summary) {
    if (status !== "complete" && status !== "failed") {
      throw new Error("result status must be complete or failed");
    }
    const checkedSummary = toJsonSafeObject(summary, "run result summary");
    return serialized(this.filePath, async () => {
      const file = await this.#load();
      const run = file.runs.find((candidate) => candidate.runId === runId);
      if (!run || run.status !== "running") {
        throw new Error("cannot finish a missing or finished ACKRATE run");
      }
      run.status = status;
      run.finishedAt = new Date().toISOString();
      run.summary = checkedSummary;
      await writeJson(this.filePath, validateRunResultFile(file));
    });
  }

  async acceptedReceipts() {
    return serialized(this.filePath, async () => {
      const file = await this.#load();
      return file.runs.flatMap((run) => run.events)
        .filter((event) => event.type === "delivery_accepted")
        .map((event) => ({ receiptId: event.receiptId, txHash: event.txHash }));
    });
  }

  async #load() {
    const file = await readJson(this.filePath, { version: 1, runs: [] });
    return validateRunResultFile(file);
  }
}

function validateStoredResponse(value) {
  if (
    !value
    || typeof value !== "object"
    || !Number.isInteger(value.status)
    || value.status < 200
    || value.status > 299
    || value.contentType !== "application/json; charset=utf-8"
    || typeof value.bodyBase64 !== "string"
    || typeof value.bodySha256 !== "string"
    || !/^[0-9a-f]{64}$/.test(value.bodySha256)
  ) {
    throw new Error("stored fulfillment response is invalid");
  }
  const body = Buffer.from(value.bodyBase64, "base64");
  if (
    body.toString("base64") !== value.bodyBase64
    || createHash("sha256").update(body).digest("hex") !== value.bodySha256
  ) {
    throw new Error("stored fulfillment response failed its integrity check");
  }
  return Object.freeze({ ...value });
}

function serializeDelivery(record) {
  return {
    ...record,
    payment: {
      ...record.payment,
      amountStroops: record.payment.amountStroops.toString(),
    },
  };
}

function deserializeDelivery(value) {
  if (
    !value
    || typeof value !== "object"
    || typeof value.key !== "string"
    || !/^[0-9a-f]{64}$/.test(value.proofDigest)
    || typeof value.executionId !== "string"
    || !Number.isSafeInteger(value.startedAt)
    || value.startedAt <= 0
    || (value.state !== "executing" && value.state !== "completed")
    || !value.payment
    || typeof value.payment.amountStroops !== "string"
    || !/^[1-9]\d*$/.test(value.payment.amountStroops)
    || !/^[0-9a-f]{64}$/.test(value.payment.txHash)
    || !/^[0-9a-f]{64}$/.test(value.payment.mandateId)
  ) {
    throw new Error("fulfillment redemption record is invalid");
  }
  const common = {
    key: value.key,
    proofDigest: value.proofDigest,
    payment: Object.freeze({
      ...value.payment,
      amountStroops: BigInt(value.payment.amountStroops),
    }),
    executionId: value.executionId,
    startedAt: value.startedAt,
  };
  if (value.state === "executing") {
    if (value.response !== undefined) {
      throw new Error("executing redemption cannot contain a response");
    }
    return Object.freeze({ ...common, state: "executing" });
  }
  return Object.freeze({
    ...common,
    state: "completed",
    response: validateStoredResponse(value.response),
  });
}

function responsesEqual(left, right) {
  return left.status === right.status
    && left.contentType === right.contentType
    && left.bodyBase64 === right.bodyBase64
    && left.bodySha256 === right.bodySha256;
}

export class FileBoundRedemptionStore {
  constructor(filePath) {
    this.filePath = resolve(filePath);
  }

  async lookup(key, proofDigest) {
    return serialized(this.filePath, async () => {
      const value = (await this.#load()).records[key];
      if (!value) return { kind: "missing" };
      const record = deserializeDelivery(value);
      if (record.proofDigest !== proofDigest) return { kind: "conflict" };
      return { kind: record.state, record };
    });
  }

  async claim(record, executionId, startedAt) {
    return serialized(this.filePath, async () => {
      const file = await this.#load();
      const existing = file.records[record.key];
      if (existing) {
        const restored = deserializeDelivery(existing);
        if (restored.proofDigest !== record.proofDigest) return { kind: "conflict" };
        return { kind: restored.state, record: restored };
      }
      const checked = deserializeDelivery({
        key: record.key,
        proofDigest: record.proofDigest,
        payment: {
          ...record.payment,
          amountStroops: record.payment.amountStroops.toString(),
        },
        executionId,
        startedAt,
        state: "executing",
      });
      file.records[record.key] = serializeDelivery(checked);
      await writeJson(this.filePath, file);
      return { kind: "claimed", record: checked };
    });
  }

  async complete(completion) {
    return serialized(this.filePath, async () => {
      const file = await this.#load();
      const value = file.records[completion.key];
      if (!value) return { kind: "conflict" };
      const existing = deserializeDelivery(value);
      if (
        existing.proofDigest !== completion.proofDigest
        || existing.executionId !== completion.executionId
      ) {
        return { kind: "conflict" };
      }
      const response = validateStoredResponse(completion.response);
      if (existing.state === "completed") {
        return responsesEqual(existing.response, response)
          ? { kind: "completed", record: existing }
          : { kind: "conflict" };
      }
      const completed = Object.freeze({ ...existing, state: "completed", response });
      file.records[completion.key] = serializeDelivery(completed);
      await writeJson(this.filePath, file);
      return { kind: "completed", record: completed };
    });
  }

  async listExecuting() {
    return serialized(this.filePath, async () =>
      Object.values((await this.#load()).records)
        .map(deserializeDelivery)
        .filter((record) => record.state === "executing"));
  }

  async #load() {
    const file = await readJson(this.filePath, { version: 1, records: {} });
    if (
      !exactKeys(file, ["version", "records"])
      || file.version !== 1
      || !file.records
      || typeof file.records !== "object"
      || Array.isArray(file.records)
    ) {
      throw new Error("fulfillment redemption file schema is invalid");
    }
    for (const [key, value] of Object.entries(file.records)) {
      if (deserializeDelivery(value).key !== key) {
        throw new Error("fulfillment redemption key does not match its record");
      }
    }
    return { version: 1, records: { ...file.records } };
  }
}

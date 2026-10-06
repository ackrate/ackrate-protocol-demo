export function sleep(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    throw new Error("sleep duration must be a non-negative number");
  }
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

export async function fetchWithTimeout(input, init = {}, timeoutMs = 30_000) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error("request timeout must be a positive whole number of milliseconds");
  }
  const controller = new AbortController();
  const externalSignal = init.signal;
  const relayAbort = () => controller.abort(externalSignal.reason);
  if (externalSignal?.aborted) relayAbort();
  else externalSignal?.addEventListener("abort", relayAbort, { once: true });
  const timer = setTimeout(
    () => controller.abort(new Error(`request timed out after ${timeoutMs}ms`)),
    timeoutMs,
  );
  timer.unref?.();
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", relayAbort);
  }
}

// A restarted server can leave a stale keep-alive socket in fetch's pool.
// Retry only this GET with the exact retained proof; never create a payment.
export async function fetchExactRecoveryBytes(input, init, timeoutMs = 30_000) {
  if (init?.method !== "GET" || init?.redirect !== "error") {
    throw new Error("exact recovery requires GET with redirects disabled");
  }
  const request = { ...init, headers: new Headers(init.headers) };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchWithTimeout(input, request, timeoutMs);
      return { status: response.status, bytes: Buffer.from(await response.arrayBuffer()) };
    } catch (error) {
      if (attempt === 1 || init.signal?.aborted) throw error;
    }
  }
}

export async function closeHttpServer(server, timeoutMs = 5_000) {
  if (!server) return;
  if (!server.listening) return;

  await new Promise((resolvePromise, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      server.closeAllConnections?.();
      if (!settled) {
        settled = true;
        reject(new Error("fulfillment server did not close before timeout"));
      }
    }, timeoutMs);
    timer.unref?.();

    server.close((error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolvePromise();
    });
  });
}

export function createIdempotentServerCloser(server, timeoutMs = 5_000) {
  let closePromise;
  return async function closeServerOnce() {
    closePromise ??= closeHttpServer(server, timeoutMs);
    await closePromise;
  };
}

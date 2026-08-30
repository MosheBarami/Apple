// Transport: the single place that knows how to reach the deployed worker.
// Today it uses POST {API_BASE}/api/admin/model-test  (header X-Admin-Key,
// body {model, prompt}) which returns {ok, ms, text, usage, ...}. That endpoint
// does not accept a separate system message yet, so `system` is folded into the
// prompt. When a richer eval endpoint ships, only this file changes.

export class TransportError extends Error {
  constructor(message, { status = 0, retryable = true } = {}) {
    super(message);
    this.name = 'TransportError';
    this.status = status;
    this.retryable = retryable;
  }
}

export function buildPrompt(system, prompt) {
  if (!system) return prompt;
  return `${system}\n\n---\n\n${prompt}`;
}

/**
 * Send one single-turn prompt to a model through the worker gateway.
 * @returns {Promise<{ok: true, ms: number, text: string, usage?: object, raw: object}>}
 * @throws {TransportError} on network failure, non-JSON body, HTTP error, or {ok:false}.
 */
export async function callModel({ apiBase, adminKey, model, prompt, system, timeoutMs = 120_000, fetchImpl = fetch }) {
  const url = `${apiBase.replace(/\/+$/, '')}/api/admin/model-test`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
  let res;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey },
      body: JSON.stringify({ model, prompt: buildPrompt(system, prompt) }),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new TransportError(`network error: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    clearTimeout(timer);
  }

  let body;
  try {
    body = await res.json();
  } catch {
    throw new TransportError(`non-JSON response (HTTP ${res.status})`, { status: res.status });
  }
  if (res.status === 403) throw new TransportError('forbidden: bad or missing X-Admin-Key', { status: 403, retryable: false });
  if (!res.ok || body.ok !== true) {
    throw new TransportError(`gateway error (HTTP ${res.status}): ${body?.error ?? 'unknown'}`, { status: res.status });
  }
  return { ok: true, ms: body.ms ?? 0, text: String(body.text ?? ''), usage: body.usage, raw: body };
}

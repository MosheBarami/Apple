// ONE PLACE THAT TALKS TO WORKERS AI, so the build script and the measurement cannot drift.
//
// WHY REST AND NOT THE `AI` BINDING. The index is built on a laptop, not inside a request, so
// there is no binding to call. The REST route `/accounts/:id/ai/run/:model` and `env.AI.run(model,
// …)` are the same models on the same platform; what differs is the network hop in front of them,
// and that difference is why the latency number this repo reports is decomposed rather than
// quoted as one figure. See docs/embedding-retrieval.md.
//
// WHAT IS RECORDED WITH EVERY CALL. Workers AI returns `meta.neurons` and the billed input-token
// count. Both are kept, because "it scored better" without "and it cost this" is half a result.
import { readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(HERE, '..', '..', '..');

/** Same .env convention every other harness here uses. */
export function loadEnv() {
  try {
    for (const line of readFileSync(join(REPO, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch { /* ambient environment */ }
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !token) throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required');
  return { account, token };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Embed one batch. Returns { vectors, neurons, inputTokens, ms }.
 *
 * A transient 5xx is retried, because a provider hiccup recorded as a zero vector would poison
 * every ranking that vector takes part in and nothing downstream would say so.
 */
export async function embedBatch(texts, { model, account, token, attempts = 5 } = {}) {
  let last = null;
  for (let i = 1; i <= attempts; i += 1) {
    const t0 = Date.now();
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: texts }),
    });
    const ms = Date.now() - t0;
    const body = await res.json().catch(() => null);
    if (res.ok && body?.success && Array.isArray(body.result?.data)) {
      const meta = body.result.meta ?? {};
      return {
        vectors: body.result.data,
        neurons: Number(meta.neurons) || 0,
        inputTokens: Number(meta.cost_metric_value_1) || 0,
        ms,
      };
    }
    last = body?.errors ? JSON.stringify(body.errors).slice(0, 300) : `HTTP ${res.status}`;
    if (res.status === 400 || res.status === 403) break; // not transient
    await sleep(1500 * i);
  }
  throw new Error(`embed failed for ${model}: ${last}`);
}

/** Embed many texts, batched. Order is preserved. */
export async function embedAll(texts, { model, account, token, batch = 32, onProgress } = {}) {
  const vectors = [];
  let neurons = 0; let inputTokens = 0; let ms = 0; let calls = 0;
  for (let i = 0; i < texts.length; i += batch) {
    const slice = texts.slice(i, i + batch);
    const r = await embedBatch(slice, { model, account, token });
    vectors.push(...r.vectors);
    neurons += r.neurons; inputTokens += r.inputTokens; ms += r.ms; calls += 1;
    onProgress?.(Math.min(i + batch, texts.length), texts.length);
  }
  if (vectors.length !== texts.length) throw new Error(`embedded ${vectors.length} of ${texts.length}`);
  return { vectors, neurons, inputTokens, ms, calls };
}

/** L2-normalise so a dot product IS the cosine similarity. */
export function normalise(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

export function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += a[i] * b[i];
  return s;
}

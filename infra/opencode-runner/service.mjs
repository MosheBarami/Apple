import { createServer } from 'node:http';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { verifyRunnerRequest } from '../../packages/shared/src/runner-auth.ts';
import { invokeCli, RunnerError, MAX_INPUT_BYTES, OPENCODE_VERSION } from './cli.mjs';
import { discoverModels } from './catalog.mjs';
import { InferenceQueue } from './queue.mjs';
import { JobJournal } from './journal.mjs';

const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });
const validId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value);

/** Policy reviews + runtime proof are distinct from CLI/API discovery. Empty reviews = not ready. */
export function createRunnerService({ signingKey, executable, apiKey, reviews = [], concurrency = 2,
  capacity = 16, journal, invoke = invokeCli, discover = discoverModels, now = Date.now }) {
  if (!signingKey) throw new Error('Runner service signing key is required.');
  const queue = new InferenceQueue({ concurrency, capacity });
  const nonces = new Map(), jobs = new Map();
  const catalogs = new Map();
  let catalog = null, refreshAt = -Infinity, refreshPromise;
  const metrics = { completed: 0, failed: 0, cancelled: 0 };
  const eligibility = (model) => reviews.find((review) => review.modelId === model.id
    && review.serviceUseAllowed === true && review.runtimeVerified === true
    && ['zero-retention', 'training'].includes(review.dataUse)
    && review.source === 'https://opencode.ai/docs/zen/' && typeof review.checkedAt === 'string');
  const refresh = async (signal) => {
    if (refreshPromise) return refreshPromise;
    if (now() - refreshAt < 60_000) throw new RunnerError('refresh_limited', 'Wait a minute before refreshing models.');
    refreshAt = now();
    refreshPromise = discover({ executable, apiKey, signal }).then((result) => {
      catalog = result; catalogs.set(result.version, result); journal?.saveCatalog(result);
      for (const [version, snapshot] of catalogs) if (now() - Date.parse(snapshot.checkedAt) > 3600_000) catalogs.delete(version);
      return result;
    })
      .finally(() => { refreshPromise = null; });
    return refreshPromise;
  };
  const handler = async (request) => {
    const path = new URL(request.url).pathname;
    let body = '';
    try {
      // Bound even chunked input before signature verification, never trusting Content-Length.
      if (request.body) {
        const reader = request.body.getReader(), decoder = new TextDecoder(); let bytes = 0;
        while (true) {
          const { value, done } = await reader.read(); if (done) break;
          bytes += value.byteLength;
          if (bytes > MAX_INPUT_BYTES) { await reader.cancel(); return json({ error: 'input_limit' }, 413); }
          body += decoder.decode(value, { stream: true });
        }
        body += decoder.decode();
      }
      const auth = await verifyRunnerRequest(signingKey, request.method, path, body, request.headers, now());
      if (!auth) return json({ error: 'unauthorized' }, 401);
      for (const [nonce, at] of nonces) if (now() - at > 60_000) nonces.delete(nonce);
      if (nonces.has(auth.nonce)) return json({ error: 'replayed_request' }, 409);
      if (nonces.size >= 10_000) return json({ error: 'auth_capacity' }, 503);
      nonces.set(auth.nonce, auth.time);
      if (request.method === 'GET' && path === '/v1/health') {
        const ready = catalog && now() - Date.parse(catalog.checkedAt) < 3600_000
          && catalog.models.some((model) => eligibility(model));
        return json({ ready: Boolean(ready), cliVersion: OPENCODE_VERSION, catalogVersion: catalog?.version ?? null,
          ...queue.status(), metrics }, ready ? 200 : 503);
      }
      if ((request.method === 'GET' && path === '/v1/models')
        || (request.method === 'POST' && path === '/v1/models/refresh')) {
        if (!catalog || request.method === 'POST') await refresh(request.signal);
        return json({ ...catalog, models: catalog.models.map((model) => ({ id: model.id, name: model.name,
          api: model.api, cost: model.cost, limit: model.limit, capabilities: model.capabilities,
          status: model.status, policy: eligibility(model) ?? null, available: Boolean(eligibility(model)) })) });
      }
      if (request.method !== 'POST' || path !== '/v1/infer') return json({ error: 'not_found' }, 404);
      let input;
      try { input = JSON.parse(body); } catch { return json({ error: 'invalid_json' }, 400); }
      if (!input || typeof input !== 'object' || Array.isArray(input)
        || !validId(input.actorId) || !validId(input.requestId) || !validId(input.runId)
        || typeof input.input !== 'string' || typeof input.instructions !== 'string'
        || !Number.isInteger(input.maxTokens) || input.maxTokens < 1 || input.maxTokens > 16_384) {
        return json({ error: 'invalid_request' }, 400);
      }
      const jobKey = `${input.actorId}:${input.runId}:${input.requestId}`;
      const hash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))).toString('hex');
      const persisted = journal?.get(jobKey);
      if (persisted && persisted.hash !== hash) return json({ error: 'request_id_conflict' }, 409);
      if (persisted?.status === 'completed') {
        const result = await journal.result(jobKey, hash);
        if (result) return json(result.payload, result.status);
      }
      if (persisted?.status === 'interrupted') return json({ error: 'interrupted_by_restart', requestId: input.requestId,
        message: 'The previous process was interrupted. The worker must recover from its action ledger before issuing a new inference request.' }, 409);
      if (persisted?.status === 'running' && !jobs.has(jobKey)) return json({ error: 'already_running' }, 202);
      const jobCatalog = catalogs.get(input.catalogVersion) ?? journal?.catalog(input.catalogVersion);
      if (!jobCatalog || now() - Date.parse(jobCatalog.checkedAt) >= 3600_000) return json({ error: 'catalog_stale' }, 409);
      const model = jobCatalog.models.find((model) => model.id === input.modelId);
      const policy = model && eligibility(model);
      if (!model || !policy) return json({ error: 'model_unavailable' }, 422);
      if (policy.dataUse === 'training' && input.allowTraining !== true) return json({ error: 'privacy_consent_required' }, 422);
      for (const [key, job] of jobs) if (job.done && now() - job.at > 300_000) jobs.delete(key);
      const existing = jobs.get(jobKey);
      if (existing && existing.hash !== hash) return json({ error: 'request_id_conflict' }, 409);
      if (existing) { const result = await existing.result; return json(result.payload, result.status); }
      if (jobs.size >= 1000) return json({ error: 'job_capacity' }, 503);
      // Copy catalog record when admitted: a refresh never changes an already queued/active job.
      const pinned = structuredClone(model), catalogVersion = jobCatalog.version;
      journal?.begin(jobKey, hash);
      const job = { hash, at: now(), done: false };
      job.result = queue.submit(async () => {
        const started = now();
        try {
          const result = await invoke({ executable, apiKey, modelId: pinned.id, modelInfo: pinned,
            allowedModels: new Set([pinned.id]), input: input.input, prompt: input.instructions,
            maxTokens: input.maxTokens, timeoutMs: 120_000, signal: request.signal });
          metrics.completed++;
          return json({ ...result, requestId: input.requestId, catalogVersion, latencyMs: now() - started });
        } catch (error) {
          metrics.failed++; if (error.code === 'cancelled') metrics.cancelled++;
          return json({ error: error instanceof RunnerError ? error.code : 'runner_failed',
            message: error instanceof RunnerError ? error.message : 'The free runner could not complete inference.' },
          error.code === 'cancelled' ? 499 : error.code === 'timeout' ? 504 : 502);
        }
      }, request.signal).catch((error) => json({ error: error.code ?? 'queue_failed' }, error.code === 'queue_full' ? 429 : 499))
        .then(async (response) => {
          // Response bodies are single-use. Retain only normalized result for safe reconnect replay.
          const payload = await response.json(); job.done = true;
          const result = { payload, status: response.status };
          await journal?.finish(jobKey, hash, result);
          return result;
        });
      jobs.set(jobKey, job);
      const result = await job.result;
      return json(result.payload, result.status);
    } catch (error) {
      return json({ error: error instanceof RunnerError ? error.code : 'runner_unavailable',
        message: error instanceof RunnerError ? error.message : 'Runner service is unavailable.' },
      error.code === 'refresh_limited' ? 429 : 503);
    }
  };
  return { fetch: handler, refresh, queue };
}

export async function startRunner({ port = 8789, host = '127.0.0.1', ...options }) {
  const service = createRunnerService(options);
  const server = createServer(async (req, res) => {
    const controller = new AbortController();
    req.once('aborted', () => controller.abort());
    res.once('close', () => { if (!res.writableEnded) controller.abort(); });
    const method = req.method ?? 'GET';
    const request = new Request(`http://runner${req.url}`, { method, headers: req.headers,
      ...(method !== 'GET' && method !== 'HEAD' ? { body: req, duplex: 'half' } : {}), signal: controller.signal });
    const response = await service.fetch(request);
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text());
  });
  server.listen(port, host); await once(server, 'listening');
  return { server, service };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Deliberately does not load .env or personal auth files. Provision service credentials separately.
  const reviews = process.env.OPENCODE_REVIEWS_FILE
    ? JSON.parse(await readFile(process.env.OPENCODE_REVIEWS_FILE, 'utf8')) : [];
  const journal = process.env.RUNNER_JOURNAL_PATH ? new JobJournal(process.env.RUNNER_JOURNAL_PATH, process.env.RUNNER_JOB_KEY) : undefined;
  await startRunner({ executable: process.env.OPENCODE_EXECUTABLE ?? '/usr/local/bin/opencode', journal,
    signingKey: process.env.STUDPILOT_RUNNER_SIGNING_KEY, apiKey: process.env.OPENCODE_SERVICE_API_KEY,
    reviews, host: process.env.RUNNER_HOST ?? '127.0.0.1', port: Number(process.env.PORT ?? 8789) });
  console.log('StudPilot runner listening; refresh its catalog through the authenticated endpoint.');
}

#!/usr/bin/env node
// Read-only observation of a clean-room trial. Never submits prompts or Studio ops.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { TASKS } from './missions-cartoon-v2.mjs';

const ORIGIN = 'https://apple.moshe-barami111.workers.dev';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function summarize(manifest, info, messages, events, now = Date.now(), coverage = {}) {
  const rows = messages.filter(m => Date.parse(m.createdAt) >= Date.parse(manifest.createdAt));
  const first = rows.find(m => m.role === 'user' && m.content === manifest.prompt);
  const startedAt = manifest.startedAt ?? first?.createdAt;
  const startMs = startedAt ? Date.parse(startedAt) : NaN;
  const endMs = manifest.endedAt ? Date.parse(manifest.endedAt) : Infinity;
  if (manifest.endedAt && !Number.isFinite(endMs)) throw Error('Invalid trial end timestamp');
  const trialRows = startedAt ? rows.filter(m => Date.parse(m.createdAt) >= startMs && Date.parse(m.createdAt) <= endMs) : [];
  // Active calls can precede the persisted assistant message. Logs use epoch milliseconds.
  const provider = events.filter(e => e.projectId === manifest.projectId &&
    Number.isFinite(e.at) && e.at >= startMs && e.at <= endMs)
    .map(e => ({ runId: e.runId, at: e.at, model: e.model, neurons: e.neurons }));
  const turns = trialRows.filter(m => m.role === 'assistant').map(m => ({
    runId: m.id, createdAt: m.createdAt, creditsSpent: m.creditsSpent ?? null,
    stopReason: m.stopReason ?? null,
    tools: (m.toolTrace ?? []).map(t => ({ tool: t.tool, ok: t.ok })),
  }));
  const credits = turns.reduce((n, t) => n + (t.creditsSpent ?? 0), 0);
  const elapsedMs = startedAt ? now - Date.parse(startedAt) : 0;
  const needsStop = info.agentStatus === 'running' &&
    (credits >= manifest.bounds.credits || elapsedMs >= manifest.bounds.durationMs || coverage.messagesTruncated === true);
  return {
    observedAt: new Date(now).toISOString(), projectId: manifest.projectId,
    connected: info.pluginConnected === true, agentStatus: info.agentStatus ?? null,
    queuedOps: info.queuedOps ?? null,
    startedAt: startedAt ?? null,
    status: !startedAt ? 'not-started' : info.agentStatus === 'running' ? 'running' : !turns.length ? 'pending' : 'awaiting-independent-verification',
    // Persisted completed-turn spend is a lower bound during an active turn.
    recordedCredits: credits, activeTurnSpendAvailable: false,
    recordedNeurons: provider.reduce((n, e) => n + (e.neurons ?? 0), 0),
    // Logs may be delayed, truncated, or outside the fetched retention window.
    providerUsageLowerBound: true,
    providerCalls: provider.length, elapsedMs, needsStop, turns, provider,
    coverage: { messagesTruncated: coverage.messagesTruncated === true, providerLogsTruncated: coverage.providerLogsTruncated === true },
    acceptance: 'unmeasured',
  };
}

export async function observationGet(key, route, fetcher = fetch) {
  const r = await fetcher(ORIGIN + route, { headers: { 'x-admin-key': key }, redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw Error(`Observation HTTP ${r.status}`);
  return r.json();
}

export async function collectMessages(get, projectId, createdAt, initial) {
  let page = initial;
  const rows = new Map(initial.map(m => [m.id, m]));
  let pages = 1;
  let incomplete = false;
  while (page.length === 100 && Date.parse(page[0].createdAt) >= Date.parse(createdAt) && pages < 20) {
    const oldest = Date.parse(page[0].createdAt);
    // Overlap one millisecond, since the server cursor is strictly < timestamp.
    const next = (await get(`/api/admin/session-messages/${projectId}?limit=100&before=${oldest + 1}`)).messages ?? [];
    for (const m of next) rows.set(m.id, m);
    if (next.length === 100 && Date.parse(next[0].createdAt) >= oldest) { incomplete = true; break; }
    page = next; pages++;
  }
  return { rows: [...rows.values()].sort((a,b) => Date.parse(a.createdAt)-Date.parse(b.createdAt)),
    truncated: incomplete || (page.length === 100 && Date.parse(page[0].createdAt) >= Date.parse(createdAt)) };
}

export async function main(args) {
  const [mode, destination, projectId, baseline] = args;
  const path = resolve(destination ?? '');
  if (mode === 'init') {
    if (!UUID.test(projectId ?? '') || !baseline) throw Error('Project UUID and baseline required');
    const bytes = readFileSync(baseline);
    const task = TASKS.find(t => t.id === 'cartoon-v2-garden-farming-r1');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({
      schema: 1, createdAt: new Date().toISOString(), projectId, taskId: task.id,
      prompt: task.prompt, origin: ORIGIN,
      baseline: { path: resolve(baseline), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') },
      bounds: { credits: 300, durationMs: 600000 },
      manualInterventionsAfterStart: [], acceptance: 'unmeasured',
    }, null, 2), { flag: 'wx', mode: 0o600 });
    return { status: 'initialized', acceptance: 'unmeasured' };
  }
  if (mode !== 'observe') throw Error('Use init or observe');
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  if (manifest.origin !== ORIGIN || !UUID.test(manifest.projectId ?? '')) throw Error('Unapproved credential destination');
  const key = process.env.GOLEM_ADMIN_KEY;
  if (!key) throw Error('GOLEM_ADMIN_KEY required');
  const get = route => observationGet(key, route);
  const [info, messages, logs] = await Promise.all([
    get(`/api/admin/session-info/${manifest.projectId}`),
    get(`/api/admin/session-messages/${manifest.projectId}?limit=100`),
    get('/api/admin/logs?kind=model_call&days=1&limit=2000'),
  ]);
  const collected = await collectMessages(get, manifest.projectId, manifest.createdAt, messages.messages ?? []);
  const result = summarize(manifest, info, collected.rows, logs.events ?? [], Date.now(), {
    messagesTruncated: collected.truncated,
    providerLogsTruncated: logs.truncated === true,
  });
  if (!manifest.startedAt && result.startedAt) {
    manifest.startedAt = result.startedAt;
    writeFileSync(path, JSON.stringify(manifest, null, 2), { mode: 0o600 });
  }
  writeFileSync(resolve(dirname(path), 'observation.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
  return { ...result, turns: result.turns.map(t => ({ ...t, tools: t.tools.length })), provider: undefined };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(r => console.log(JSON.stringify(r))).catch(() => {
    console.error('Observation failed; trial state is unchanged. Inspect authentication/network locally.');
    process.exitCode = 1;
  });
}

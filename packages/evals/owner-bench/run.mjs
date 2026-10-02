#!/usr/bin/env node
/**
 * Headless runner for the owner's benchmark (README.md): the same protocol as runner.js, from Node, on any bank file.
 * Per item: reset, restore the `bench-baseline` checkpoint, every turn over the project socket (25 minutes, then
 * /stop), wait for idle, evaluate, count credits after. Results go to results/<run>.json as the ARRAY score.mjs reads.
 *
 * It spends real credits (every turn, and the judge) and needs Studio running with the project paired. Use --dry-run
 * to see the plan with no network and no sign-in, and --max-credits as a hard budget.
 *
 * Usage: node packages/evals/owner-bench/run.mjs --project <uuid> [--bank requests.json] [--run <name>]
 *          [--from <id>] [--only <id>] [--ids a,b,c] [--max-credits N] [--redo] [--dry-run] [--base <url>]
 *
 * Sign-in comes from the environment (or the repo's .env, loaded without overriding), never from flags, never printed:
 *   APPLE_BENCH_JWT (+ APPLE_BENCH_REFRESH_TOKEN to refresh it), or APPLE_E2E_EMAIL + APPLE_E2E_PASSWORD.
 * The account must OWN the project (other accounts get 404). A refresh token is rotated by Supabase on use: do not
 * share the owner's browser session with this runner; use a dedicated sign-in.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { envCompat } from '../../../scripts/lib/env-compat.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** The nine criteria (score.mjs holds the same list). */
export const CRITERIA = ['works', 'professional', 'matches', 'polished', 'noErrors', 'performance', 'sound', 'animation', 'fx'];
export const TURN_MS = 25 * 60_000;
export const IDLE_WAIT_MS = 10 * 60_000;
const IDLE_POLL_MS = 15_000;
const DEFAULT_BASE = 'https://apple.moshe-barami111.workers.dev';
const DEFAULT_SUPABASE = 'https://npqvyijsvzkuwddyhtpm.supabase.co';
/** A terminal chat refusal that every later item would hit too: the run stops instead of burning the bank. */
const FATAL_CODES = new Set(['account_not_approved', 'studio_required']);

/* ---------------------------------------------------------------- environment and sign-in */

/** The nearest ancestor of `from` (inclusive) that holds `rel`, or null. A worktree finds the shared checkout's .env. */
export function findUp(from, rel) {
  let dir = from;
  for (;;) {
    const p = join(dir, rel);
    if (existsSync(p)) return p;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** Loads KEY=VALUE lines into `env` without overriding what is set (the infra scripts' loader). Returns nothing. */
export function loadEnvFile(file, env = process.env) {
  if (!file) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !env[m[1]]) env[m[1]] = m[2];
  }
}

/** The text with every secret removed; for errors that go to the screen or the results file. */
export function scrub(text, secrets) {
  let out = String(text);
  for (const s of secrets) if (s && String(s).length >= 8) out = out.split(String(s)).join('[redacted]');
  return out;
}

function jwtExpiry(token) {
  try {
    const exp = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8')).exp;
    return Number.isFinite(exp) ? exp * 1000 : null;
  } catch { return null; }
}

/**
 * Supplies a valid access token for as long as the run lasts (the browser runner leaned on the tab's own refresh).
 * `getToken()` returns it, signing in or refreshing when it is within two minutes of expiring; `getToken(true)`
 * forces a new one (after a 401). Failures say the HTTP status only, never a response body.
 */
export function createAuth({ fetch: fetchFn, env, now = Date.now, supabaseUrl = DEFAULT_SUPABASE, anonKey }) {
  let token = envCompat('APPLE_BENCH_JWT', env) || null;
  let refresh = envCompat('APPLE_BENCH_REFRESH_TOKEN', env) || null;
  let exp = token ? jwtExpiry(token) : null;
  const email = envCompat('APPLE_E2E_EMAIL', env), password = envCompat('APPLE_E2E_PASSWORD', env);
  if (!token && !refresh && !(email && password)) {
    throw new Error('no sign-in: set APPLE_BENCH_JWT (and APPLE_BENCH_REFRESH_TOKEN), or APPLE_E2E_EMAIL and APPLE_E2E_PASSWORD');
  }
  const grant = async (type, body) => {
    const r = await fetchFn(`${supabaseUrl}/auth/v1/token?grant_type=${type}`, { method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) return { status: r.status };
    const j = await r.json().catch(() => ({}));
    if (!j.access_token) return { status: r.status };
    token = j.access_token;
    if (j.refresh_token) refresh = j.refresh_token;
    exp = jwtExpiry(token) ?? now() + (Number(j.expires_in) || 3000) * 1000;
    return { ok: true };
  };
  let inflight = null;
  const renew = async () => {
    let last = 0;
    if (refresh) { const r = await grant('refresh_token', { refresh_token: refresh }); if (r.ok) return; last = r.status; }
    if (email && password) { const r = await grant('password', { email, password }); if (r.ok) return; last = r.status; }
    throw new Error(`sign-in failed (HTTP ${last || 'no answer'}); the token cannot be refreshed`);
  };
  return async (force = false) => {
    const stale = !token || (exp !== null && now() >= exp - 120_000);
    if (!force && !stale) return token;
    inflight ??= renew().finally(() => { inflight = null; });
    await inflight;
    return token;
  };
}

/* ---------------------------------------------------------------- the project API */

/** The project's HTTP calls, each returning `{...json, status}` (or `{text, status}`); a 401 refreshes the token once. */
export function createApi({ fetch: fetchFn, base, projectId, getToken }) {
  return async (path, body, method = 'POST') => {
    let r;
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await getToken(attempt === 1);
      r = await fetchFn(`${base}/api/projects/${projectId}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (r.status !== 401) break;
    }
    const text = await r.text();
    try { return { ...JSON.parse(text), status: r.status }; } catch { return { text, status: r.status }; }
  };
}

/** Repeats a call the session refuses because a run is still going, until it is accepted or `idleWaitMs` passes. */
export async function whenIdle(call, { sleep, now, idleWaitMs = IDLE_WAIT_MS, pollMs = IDLE_POLL_MS }) {
  const until = now() + idleWaitMs;
  for (;;) {
    const r = await call();
    if (!(r.status === 409 && r.error === 'a run is in progress') || now() > until) return r;
    await sleep(pollMs);
  }
}

/**
 * One chat turn over the project socket. Resolves (never rejects) on msg_end, a terminal error, a socket error or
 * close, or `turnMs` (stopReason 'timeout'; the caller stops the run).
 */
export async function turn({ text, WebSocketImpl, base, projectId, getToken, now, turnMs = TURN_MS }) {
  const jwt = await getToken();
  return new Promise((resolve) => {
    const ws = new WebSocketImpl(`${base.replace(/^http/, 'ws')}/api/projects/${projectId}/ws`, ['golem.v1', 'golem.jwt.' + jwt]);
    let reply = '', creditsSpent, finished = false;
    const tools = [];
    const started = now();
    const done = (stopReason, error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* already closed */ }
      resolve({ reply, stopReason, error, ms: now() - started, tools, creditsSpent });
    };
    const timer = setTimeout(() => done('timeout'), turnMs);
    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type === 'hello') ws.send(JSON.stringify({ type: 'chat', text, mode: 'agent' }));
      else if (m.type === 'delta') reply += m.text;
      else if (m.type === 'tool_end') tools.push(`${m.ok ? '✓' : '✗'} ${m.summary}`);
      else if (m.type === 'error' && m.terminal) done('error', `${m.code}: ${m.message}`);
      else if (m.type === 'msg_end') { creditsSpent = m.creditsSpent; done(m.stopReason); }
    };
    ws.onerror = () => done('ws-error');
    ws.onclose = () => done('ws-closed');
  });
}

/* ---------------------------------------------------------------- photos */

export const safeName = (s) => String(s).replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 60) || 'photo';
const IMAGE_PATH = /^\/api\/projects\/[0-9a-f-]+\/images\/[0-9a-f-]+$/i;

/**
 * Saves each evaluated photo as <dir>/<name>.png (the server keeps them one hour). `images` is evaluate's
 * `[{name, path}]`. Returns `[{name, file}]` (file relative to `relTo`) or `[{name, error}]`; never throws.
 */
export async function downloadPhotos({ images, dir, relTo, base, getToken, fetch: fetchFn, write = writeFileSync }) {
  const out = [];
  for (const img of images || []) {
    const name = safeName(img?.name);
    if (!img?.path || !IMAGE_PATH.test(img.path)) { out.push({ name, error: 'no photo path' }); continue; }
    try {
      const r = await fetchFn(base + img.path, { headers: { Authorization: `Bearer ${await getToken()}` } });
      if (!r.ok) { out.push({ name, error: `HTTP ${r.status}` }); continue; }
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `${name}.png`);
      write(file, Buffer.from(await r.arrayBuffer()));
      out.push({ name, file: relative(relTo, file) });
    } catch (e) { out.push({ name, error: String(e?.message || e).slice(0, 200) }); }
  }
  return out;
}

/* ---------------------------------------------------------------- bank, results, selection */

/** Reads and checks a bank file: `{version, items:[{id, category, turns[]}]}`. */
export function loadBank(file) {
  const bank = JSON.parse(readFileSync(file, 'utf8'));
  if (!bank || !Array.isArray(bank.items) || !bank.items.length) throw new Error(`${file}: no items`);
  const seen = new Set();
  for (const it of bank.items) {
    if (!it.id || !it.category || !Array.isArray(it.turns) || !it.turns.length || !it.turns.every((t) => typeof t === 'string' && t.trim())) throw new Error(`${file}: item ${it.id ?? '?'} needs id, category and turns[]`);
    if (seen.has(it.id)) throw new Error(`${file}: duplicate id ${it.id}`);
    seen.add(it.id);
  }
  return { version: bank.version || 'bank', items: bank.items };
}

/** The results array on disk (an empty one when the file is new). */
export function readRows(file) {
  if (!existsSync(file)) return [];
  const rows = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(rows)) throw new Error(`${file} is not a results array`);
  return rows;
}

/** Writes through a temp file so an interrupted run never leaves half a results file. */
export function writeRows(file, rows) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file + '.tmp', JSON.stringify(rows, null, 2));
  renameSync(file + '.tmp', file);
}

/** The bank items this invocation covers, in bank order: from `from` on, narrowed to `ids`. Unknown ids throw. */
export function selectItems(items, { from, ids }) {
  const known = new Set(items.map((i) => i.id));
  for (const id of [from, ...(ids || [])]) if (id && !known.has(id)) throw new Error(`unknown item id "${id}" (bank has ${items[0].id}..${items[items.length - 1].id})`);
  let out = from ? items.slice(items.findIndex((i) => i.id === from)) : items;
  if (ids?.length) out = out.filter((i) => ids.includes(i.id));
  return out;
}

const spentOf = (rows) => rows.reduce((a, r) => a + (Number(r.credits) || 0), 0);

/** What would run: per selected item `run` or `skip`, plus the credits already spent in this results file. */
export function planRun({ items, rows, redo = false }) {
  const plan = items.map((item) => {
    const prev = rows.find((r) => r.id === item.id);
    if (prev?.status === 'done' && !redo) {
      if (JSON.stringify(prev.turns) !== JSON.stringify(item.turns)) throw new Error(`${item.id}: the bank's request differs from the recorded one; version the bank instead of editing it`);
      return { id: item.id, action: 'skip', why: 'done' };
    }
    return { id: item.id, action: 'run', ...(prev ? { why: `previous attempt: ${prev.status}` } : {}) };
  });
  return { plan, spent: spentOf(rows) };
}

/* ---------------------------------------------------------------- the run */

/** Credits and steps from the stored assistant messages (counted after evaluate, when the run has ended). */
function tally(msgs) {
  const assistant = (msgs.messages || []).filter((m) => m.role === 'assistant');
  return { credits: assistant.reduce((a, m) => a + (m.creditsSpent || 0), 0), steps: assistant.reduce((a, m) => a + (m.toolTrace || []).length, 0) };
}

/**
 * Runs the selected items and keeps results/<run>.json current after every step. Returns
 * `{rows, spent, ran, aborted}`; `aborted` is 'budget', or the fatal refusal that ended the run, or null.
 * Items whose row is `done` are skipped; any other earlier row is run again and its earlier credits stay counted.
 */
export async function runBench({ items, file, photosDir, api, getToken, base, projectId, WebSocketImpl, fetch: fetchFn, sleep, now = Date.now, maxCredits = null, redo = false, turnMs = TURN_MS, idleWaitMs = IDLE_WAIT_MS, idlePollMs = IDLE_POLL_MS, log = console.log, secrets = [] }) {
  const rows = readRows(file);
  const { plan } = planRun({ items, rows, redo });
  const idle = (call) => whenIdle(call, { sleep, now, idleWaitMs, pollMs: idlePollMs });
  const cps = await api('/checkpoints', null, 'GET');
  const baseline = (cps.checkpoints || []).find((c) => c.label === 'bench-baseline');
  if (!baseline) throw new Error(cps.status === 404 ? 'project not found for this sign-in (the account must own it)' : `no bench-baseline checkpoint on this project (HTTP ${cps.status})`);
  let ran = 0, aborted = null;
  const save = () => writeRows(file, rows);

  for (const step of plan) {
    if (step.action === 'skip') { log(`${step.id} skipped (done)`); continue; }
    if (maxCredits !== null && spentOf(rows) >= maxCredits) { aborted = 'budget'; log(`budget reached (${spentOf(rows)} >= ${maxCredits} credits): stopping before ${step.id}`); break; }
    const item = items.find((i) => i.id === step.id);
    const index = rows.findIndex((r) => r.id === item.id);
    const before = index >= 0 ? (Number(rows[index].credits) || 0) : 0;
    const row = { id: item.id, category: item.category, turns: item.turns, at: new Date(now()).toISOString(), status: 'running', credits: before };
    if (index >= 0) rows[index] = row; else rows.push(row);
    save();
    log(`${item.id} running`);
    let fatal = null;
    try {
      const reset = await idle(() => api('/bench/reset'));
      row.reset = reset.ok === true;
      if (!row.reset) throw new Error(`the place could not be emptied: ${JSON.stringify(reset).slice(0, 300)}`);
      const restored = await api('/restore', { checkpointId: baseline.id });
      row.restored = restored.ok === true;
      if (!row.restored) throw new Error(`the baseline could not be restored: ${JSON.stringify(restored).slice(0, 300)}`);
      await sleep(3000);
      row.turnResults = [];
      for (const t of item.turns) {
        const r = await turn({ text: t, WebSocketImpl, base, projectId, getToken, now, turnMs });
        row.turnResults.push({ text: t, stopReason: r.stopReason, ms: r.ms, error: r.error, tools: r.tools.slice(0, 40) });
        row.reply = r.reply;
        if (r.stopReason === 'timeout') await api('/stop');
        if (r.stopReason === 'quota') fatal = 'quota';
        if (r.stopReason === 'error' && FATAL_CODES.has(String(r.error).split(':')[0])) fatal = String(r.error).split(':')[0];
        if (r.stopReason !== 'done') break;
        await sleep(2000);
      }
      row.seconds = Math.round(row.turnResults.reduce((a, t) => a + t.ms, 0) / 1000);
      if (fatal) { row.status = 'error'; row.error = `run stopped: ${fatal}`; }
      else {
        const ev = await idle(() => api('/bench/evaluate', { request: item.turns.join(' → then: '), reply: row.reply || '' }));
        if (ev.ok !== true) throw new Error(`evaluate failed (HTTP ${ev.status}): ${JSON.stringify(ev.error ?? ev.text ?? '').slice(0, 200)}`);
        const { status: _status, ok: _ok, ...result } = ev;
        row.eval = result;
        row.scores = result.scores;
        row.critique = result.critique;
        row.total = result.total;
        const judged = CRITERIA.every((k) => Number.isFinite(result.scores?.[k]));
        if (judged && !Number.isFinite(row.total)) row.total = CRITERIA.reduce((a, k) => a + result.scores[k], 0);
        row.status = judged ? 'done' : 'unjudged';
        row.photos = await downloadPhotos({ images: result.images, dir: join(photosDir, item.id), relTo: dirname(file), base, getToken, fetch: fetchFn });
      }
    } catch (e) { row.status = 'error'; row.error = scrub(e?.message || e, secrets); }
    // After evaluate (or after the failure), when the run has ended; the item's cost includes earlier attempts.
    try {
      const t = tally(await api('/messages?limit=100', null, 'GET'));
      row.credits = before + t.credits; row.steps = t.steps;
    } catch { /* the cost stays at what earlier attempts recorded */ }
    ran++;
    save();
    log(`${item.id} ${row.status}${row.total !== undefined ? ` total=${row.total}` : ''} credits=${row.credits}${row.seconds !== undefined ? ` ${row.seconds}s` : ''}${row.error ? ` (${row.error.slice(0, 120)})` : ''}`);
    if (fatal) { aborted = fatal; log(`stopping the run: ${fatal}`); break; }
  }
  return { rows, spent: spentOf(rows), ran, aborted };
}

/* ---------------------------------------------------------------- CLI */

export function parseArgs(argv) {
  const o = { ids: [] };
  const val = (i, flag) => { if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) throw new Error(`${flag} needs a value`); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dryRun = true;
    else if (a === '--redo') o.redo = true;
    else if (a === '--project') o.project = val(i++, a);
    else if (a === '--bank') o.bank = val(i++, a);
    else if (a === '--run') o.run = val(i++, a);
    else if (a === '--from') o.from = val(i++, a);
    else if (a === '--only') o.ids.push(val(i++, a));
    else if (a === '--ids') o.ids.push(...val(i++, a).split(',').map((s) => s.trim()).filter(Boolean));
    else if (a === '--base') o.base = val(i++, a);
    else if (a === '--max-credits') {
      o.maxCredits = Number(val(i++, a));
      if (!Number.isFinite(o.maxCredits) || o.maxCredits <= 0) throw new Error('--max-credits must be a positive number');
    } else throw new Error(`unknown argument ${a}`);
  }
  return o;
}

export const runName = (bank, now = Date.now) => `${bank.version}-${new Date(now()).toISOString().replace(/[-:]/g, '').slice(0, 15)}`;

export async function main(argv, deps = {}) {
  const log = deps.log ?? console.log;
  const o = parseArgs(argv);
  const bankFile = o.bank ?? join(HERE, 'requests.json');
  const bank = loadBank(bankFile);
  const name = o.run ?? runName(bank);
  const resultsDir = deps.resultsDir ?? join(HERE, 'results');
  const file = join(resultsDir, `${name}.json`);
  const items = selectItems(bank.items, { from: o.from, ids: o.ids });
  const rows = readRows(file);
  const { plan, spent } = planRun({ items, rows, redo: o.redo });
  if (o.dryRun) {
    log(`DRY RUN (no network, nothing written)\nbank ${bank.version} (${bank.items.length} items), run "${name}" -> ${file}`);
    log(`credits already spent in this file: ${spent}${o.maxCredits ? `; budget ${o.maxCredits}` : '; no budget (set --max-credits)'}`);
    for (const p of plan) log(`  ${p.id}  ${p.action}${p.why ? ` (${p.why})` : ''}`);
    log(`${plan.filter((p) => p.action === 'run').length} would run, ${plan.filter((p) => p.action === 'skip').length} skipped`);
    return { plan, spent };
  }
  if (!o.project) throw new Error('--project <uuid> is required');
  if (!deps.env) {
    loadEnvFile(findUp(HERE, '.env'));
  }
  const env = deps.env ?? process.env;
  const fetchFn = deps.fetch ?? fetch;
  const wrangler = findUp(HERE, 'apps/worker/wrangler.jsonc');
  const wr = wrangler ? readFileSync(wrangler, 'utf8') : '';
  const anonKey = deps.anonKey ?? wr.match(/"SUPABASE_ANON_KEY":\s*"([^"]+)"/)?.[1];
  const supabaseUrl = wr.match(/"SUPABASE_URL":\s*"([^"]+)"/)?.[1] ?? DEFAULT_SUPABASE;
  if (!anonKey) throw new Error('SUPABASE_ANON_KEY not found in apps/worker/wrangler.jsonc');
  const base = (o.base ?? env.API_BASE ?? DEFAULT_BASE).replace(/\/$/, '');
  const now = deps.now ?? Date.now;
  const getToken = createAuth({ fetch: fetchFn, env, now, supabaseUrl, anonKey });
  const api = createApi({ fetch: fetchFn, base, projectId: o.project, getToken });
  const secrets = [envCompat('APPLE_BENCH_JWT', env), envCompat('APPLE_BENCH_REFRESH_TOKEN', env), envCompat('APPLE_E2E_PASSWORD', env), envCompat('APPLE_ADMIN_KEY', env), anonKey];
  log(`run "${name}" on project ${o.project}: ${plan.filter((p) => p.action === 'run').length} to run${o.maxCredits ? `, budget ${o.maxCredits} credits (${spent} already spent)` : ', no credit budget'}`);
  const res = await runBench({
    items, file, photosDir: join(resultsDir, name), api, getToken, base, projectId: o.project,
    WebSocketImpl: deps.WebSocketImpl ?? WebSocket, fetch: fetchFn, now, redo: o.redo, maxCredits: o.maxCredits ?? null, log, secrets,
    sleep: deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    ...(deps.turnMs ? { turnMs: deps.turnMs } : {}), ...(deps.idleWaitMs ? { idleWaitMs: deps.idleWaitMs } : {}), ...(deps.idlePollMs ? { idlePollMs: deps.idlePollMs } : {}),
  });
  log(`finished: ${res.ran} ran, ${res.spent} credits in this file${res.aborted ? `, stopped early (${res.aborted})` : ''}. Score it: node packages/evals/owner-bench/score.mjs ${file}`);
  return res;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((res) => process.exit(res?.aborted && res.aborted !== 'budget' ? 1 : 0), (e) => { console.error(`run.mjs: ${e.message}`); process.exit(2); });
}

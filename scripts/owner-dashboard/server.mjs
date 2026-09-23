// The owner's live dashboard: one page for the whole Apple project — what the agents are doing right
// now, the model and its training, the libraries, the screenshots, what 100% means, and what the run
// costs in tokens and dollars. Dependency-free; binds 127.0.0.1 only.
//
//   node scripts/owner-dashboard/server.mjs [port]      (default 4777)
//
// Token accounting reads the session transcript being watched and every subagent / workflow transcript
// under it, dedupes API calls by (message.id, requestId), and prices them at the public Claude API list
// prices (platform.claude.com/docs/en/about-claude/pricing, read 2026-09-23). The project half comes
// from collect.mjs, which reads the repository's own sources of truth.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectProject, MEDIA_ROOTS } from './collect.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const PORT = Number(process.argv[2] || 4777);
const PROJECT = '/Users/moshe/.claude/projects/-Users-moshe-Desktop-RbxAI';

// $ per million tokens: [input, 5m cache write, 1h cache write, cache read, output]
const PRICES = {
  'claude-opus-5-5': { std: [4, 5, 8, 0.2, 20], fast: [8, 10, 16, 0.4, 40], label: 'Claude Opus 5.5' },
  'claude-opus-5': { std: [5, 6.25, 10, 0.5, 25], fast: [10, 12.5, 20, 1, 50], label: 'Claude Opus 5' },
  'claude-fable-5-1': { std: [10, 12.5, 20, 0.25, 50], label: 'Claude Fable 5.1' },
  'claude-sonnet-5': { std: [2, 2.5, 4, 0.2, 10], label: 'Claude Sonnet 5' },
  'claude-haiku-4-5-20251001': { std: [1, 1.25, 2, 0.1, 5], label: 'Claude Haiku 4.5' },
};
const priceFor = (model, speed) => {
  const p = PRICES[model] || Object.entries(PRICES).find(([k]) => model?.startsWith(k))?.[1];
  if (!p) return null;
  return { rates: speed === 'fast' && p.fast ? p.fast : p.std, label: p.label };
};

// ---- Which run is being watched -------------------------------------------------------------------
// DASH_SESSION if set, otherwise the most recently written session of this project. A session idle for
// 30 minutes gives way to a newer one, so the page follows the next run without flipping between two
// sessions that are both working.
let MAIN = null, SUBDIR = null;
function newestSession() {
  if (process.env.DASH_SESSION) return path.join(PROJECT, `${process.env.DASH_SESSION}.jsonl`);
  let best = null;
  for (const n of fs.readdirSync(PROJECT)) {
    if (!n.endsWith('.jsonl')) continue;
    const p = path.join(PROJECT, n), m = fs.statSync(p).mtimeMs;
    if (!best || m > best.m) best = { p, m };
  }
  return best?.p ?? null;
}

const freshState = () => ({
  seen: new Set(), offsets: new Map(), tails: new Map(),
  calls: 0, cost: 0, startedAt: null, lastAt: null,
  tok: { input: 0, write5m: 0, write1h: 0, read: 0, output: 0 },
  costBy: { input: 0, write5m: 0, write1h: 0, read: 0, output: 0 },
  models: new Map(), agents: new Map(), minutes: new Map(), feed: [], unpriced: 0,
  says: [], saidKeys: new Set(), doing: [], doneKeys: new Set(),
});
let state = freshState();

const agentMeta = new Map();
function agentLabel(file) {
  if (file === MAIN) return { id: 'main', name: 'הסשן הראשי (מנהל המוצר)', kind: 'main' };
  const base = path.basename(file, '.jsonl');
  if (!agentMeta.has(base)) {
    let name = base, kind = file.includes('/workflows/') ? 'workflow agent' : 'subagent';
    try {
      const meta = JSON.parse(fs.readFileSync(file.replace(/\.jsonl$/, '.meta.json'), 'utf8'));
      name = meta.description || name;
    } catch {
      const wf = file.split('/workflows/')[1]?.split('/')[0];
      if (wf) name = `${wf} · ${base.replace(/^agent-/, '').slice(0, 8)}`;
    }
    agentMeta.set(base, { id: base, name, kind });
  }
  return agentMeta.get(base);
}

function listFiles() {
  const out = [MAIN];
  const walk = (d) => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.jsonl')) out.push(p);
    }
  };
  walk(SUBDIR);
  return out;
}

// What a tool call was FOR, in the words its caller gave it. Only the human description, a file's
// name or the tool's name leave this function — never a command line, which can carry anything.
function describeTool(b) {
  const i = b.input || {};
  if (typeof i.description === 'string' && i.description) return i.description;
  if (typeof i.file_path === 'string') return `${b.name} · ${path.basename(i.file_path)}`;
  const short = b.name.replace(/^mcp__/, '').replace(/^claude-in-chrome__/, 'Chrome · ').replace(/^computer-use__/, 'Desktop · ');
  return typeof i.action === 'string' ? `${short} · ${i.action}` : short;
}

function ingest(line, file) {
  if (!line.includes('"usage"')) return;
  let d;
  try { d = JSON.parse(line); } catch { return; }
  const m = d.message;
  if (!m || typeof m !== 'object' || !m.usage) return;
  if (m.model === '<synthetic>') return;
  const ts = Date.parse(d.timestamp) || Date.now();
  // A message's content blocks arrive one per line under the same id, so the narration and the tool
  // calls are read from every line — before the once-per-call dedupe that the cost needs.
  if (d.type === 'assistant' && Array.isArray(m.content)) {
    for (const b of m.content) {
      if (b.type === 'text' && file === MAIN && b.text.trim()) {
        const k = `${m.id}|${b.text.length}|${b.text.slice(0, 48)}`;
        if (!state.saidKeys.has(k)) { state.saidKeys.add(k); state.says.push({ ts, text: b.text.slice(0, 1500) }); }
      } else if (b.type === 'tool_use' && !state.doneKeys.has(b.id)) {
        state.doneKeys.add(b.id);
        state.doing.push({ ts, agent: agentLabel(file).name, what: describeTool(b), tool: b.name });
      }
    }
    if (state.says.length > 60) state.says.splice(0, state.says.length - 60);
    if (state.doing.length > 200) state.doing.splice(0, state.doing.length - 200);
  }
  const key = `${m.id}|${d.requestId}`;
  if (state.seen.has(key)) return;
  state.seen.add(key);
  const u = m.usage, cc = u.cache_creation || {};
  const t = {
    input: u.input_tokens || 0,
    write5m: cc.ephemeral_5m_input_tokens ?? (cc.ephemeral_1h_input_tokens == null ? u.cache_creation_input_tokens || 0 : 0),
    write1h: cc.ephemeral_1h_input_tokens || 0,
    read: u.cache_read_input_tokens || 0,
    output: u.output_tokens || 0,
  };
  const pr = priceFor(m.model, u.speed);
  const parts = pr ? {
    input: t.input * pr.rates[0] / 1e6, write5m: t.write5m * pr.rates[1] / 1e6,
    write1h: t.write1h * pr.rates[2] / 1e6, read: t.read * pr.rates[3] / 1e6, output: t.output * pr.rates[4] / 1e6,
  } : { input: 0, write5m: 0, write1h: 0, read: 0, output: 0 };
  if (!pr) state.unpriced++;
  const cost = Object.values(parts).reduce((a, b) => a + b, 0);
  const total = Object.values(t).reduce((a, b) => a + b, 0);
  state.calls++; state.cost += cost;
  state.startedAt = Math.min(state.startedAt ?? ts, ts); state.lastAt = Math.max(state.lastAt ?? ts, ts);
  for (const k of Object.keys(t)) { state.tok[k] += t[k]; state.costBy[k] += parts[k]; }
  const label = pr?.label || m.model;
  const mm = state.models.get(label) || { name: label, calls: 0, tokens: 0, cost: 0, fast: 0 };
  mm.calls++; mm.tokens += total; mm.cost += cost; if (u.speed === 'fast') mm.fast++;
  state.models.set(label, mm);
  const a = agentLabel(file);
  const am = state.agents.get(a.id) || { ...a, calls: 0, tokens: 0, cost: 0, last: 0 };
  am.calls++; am.tokens += total; am.cost += cost; am.last = Math.max(am.last, ts);
  state.agents.set(a.id, am);
  const min = Math.floor(ts / 60000) * 60000;
  const b = state.minutes.get(min) || { cost: 0, tokens: 0, calls: 0 };
  b.cost += cost; b.tokens += total; b.calls++;
  state.minutes.set(min, b);
  state.feed.push({ ts, agent: a.name, model: label, in: t.input + t.write5m + t.write1h + t.read, out: t.output, cost });
  if (state.feed.length > 400) state.feed.splice(0, state.feed.length - 400);
}

// ---- Plan limits -------------------------------------------------------------------------------
// The percentages are the Claude app's own readings (get_usage), appended to limits.json by
// add-reading.py. Between readings the page shows an estimate: the account's spend since the reading
// (every project's transcripts, not only this run) times the percent-per-dollar the last reading
// implies. It is labelled as an estimate and never overwrites the measured figure.
const LIMITS = path.join(HERE, 'limits.json');
const week = { seen: new Set(), offsets: new Map(), tails: new Map(), minutes: new Map() };
const ALL = '/Users/moshe/.claude/projects';
let weekFrom = 0;

function weekIngest(line) {
  if (!line.includes('"usage"')) return;
  let d; try { d = JSON.parse(line); } catch { return; }
  const m = d.message; if (!m || typeof m !== 'object' || !m.usage || m.model === '<synthetic>') return;
  const ts = Date.parse(d.timestamp); if (!(ts >= weekFrom)) return;
  const key = `${m.id}|${d.requestId}`; if (week.seen.has(key)) return; week.seen.add(key);
  const pr = priceFor(m.model, m.usage.speed); if (!pr) return;
  const u = m.usage, cc = u.cache_creation || {}, r = pr.rates;
  const w5 = cc.ephemeral_5m_input_tokens ?? (cc.ephemeral_1h_input_tokens == null ? u.cache_creation_input_tokens || 0 : 0);
  const cost = ((u.input_tokens || 0) * r[0] + w5 * r[1] + (cc.ephemeral_1h_input_tokens || 0) * r[2]
    + (u.cache_read_input_tokens || 0) * r[3] + (u.output_tokens || 0) * r[4]) / 1e6;
  const min = Math.floor(ts / 60000) * 60000;
  week.minutes.set(min, (week.minutes.get(min) || 0) + cost);
}

function readNew(file, offsets, tails, onLine) {
  let size; try { size = fs.statSync(file).size; } catch { return; }
  const off = offsets.get(file) || 0; if (size <= off) return;
  const fd = fs.openSync(file, 'r'); let pos = off;
  while (pos < size) {
    const len = Math.min(8 << 20, size - pos), buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, pos); pos += len;
    const lines = ((tails.get(file) || '') + buf.toString('utf8')).split('\n');
    tails.set(file, lines.pop()); for (const l of lines) onLine(l);
  }
  fs.closeSync(fd); offsets.set(file, size);
}

function weekScan() {
  if (!weekFrom) return;
  const files = [];
  const walk = (dir) => {
    let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.jsonl')) { try { if (fs.statSync(p).mtimeMs >= weekFrom) files.push(p); } catch {} }
    }
  };
  walk(ALL);
  for (const f of files) readNew(f, week.offsets, week.tails, weekIngest);
}

const spendBetween = (a, b) => { let s = 0; for (const [t, c] of week.minutes) if (t >= a && t < b) s += c; return s; };

function limitsSnapshot(now) {
  let hist = []; try { hist = JSON.parse(fs.readFileSync(LIMITS, 'utf8')); } catch {}
  const last = hist.at(-1); if (!last || last.plan?.status !== 'ok') return null;
  const windows = last.plan.windows.map((w) => {
    const resets = Date.parse(w.resetsAt);
    const span = /5-hour/i.test(w.label) ? 5 * 3600000 : 7 * 86400000;
    const start = resets - span;
    const spentAtReading = spendBetween(start, last.at);
    const spentNow = spendBetween(start, now + 60000);
    const perUsd = spentAtReading > 0.5 && w.percentUsed > 0 ? w.percentUsed / spentAtReading : null;
    const estimate = perUsd && now < resets ? Math.min(100, w.percentUsed + (spentNow - spentAtReading) * perUsd) : null;
    const burn = spendBetween(now - 3600000, now + 60000);           // $ in the last hour, whole account
    const pctPerHour = perUsd ? burn * perUsd : null;
    const hoursToFull = pctPerHour > 0 && estimate != null ? (100 - estimate) / pctPerHour : null;
    return { label: w.label, measured: w.percentUsed, measuredAt: last.at, resetsAt: resets, start, estimate,
      pctPerHour, fullAt: hoursToFull != null ? now + hoursToFull * 3600000 : null, spentInWindow: spentNow };
  });
  return { plan: last.plan.plan, extra: last.plan.extraUsage, readings: hist.length, windows };
}

function scan() {
  const cand = newestSession();
  if (cand && cand !== MAIN) {
    let idle = Infinity; try { idle = Date.now() - fs.statSync(MAIN).mtimeMs; } catch {}
    if (!MAIN || idle > 30 * 60000) { MAIN = cand; SUBDIR = MAIN.replace(/\.jsonl$/, ''); state = freshState(); }
  }
  if (!MAIN) return;
  for (const f of listFiles()) readNew(f, state.offsets, state.tails, (l) => ingest(l, f));
  state.feed.sort((x, y) => x.ts - y.ts);
  state.doing.sort((x, y) => x.ts - y.ts);
}

function snapshot() {
  const now = Date.now();
  const mins = [...state.minutes.entries()].sort((a, b) => a[0] - b[0]);
  const windowCost = (ms) => mins.filter(([t]) => t >= now - ms).reduce((s, [, v]) => s + v.cost, 0);
  const windowTok = (ms) => mins.filter(([t]) => t >= now - ms).reduce((s, [, v]) => s + v.tokens, 0);
  // cumulative series, bucketed to at most ~240 points
  const series = [];
  if (mins.length) {
    const span = Math.max(1, (mins.at(-1)[0] - mins[0][0]) / 60000);
    const step = Math.max(1, Math.ceil(span / 240)) * 60000;
    let acc = 0, i = 0;
    for (let t = mins[0][0]; t <= mins.at(-1)[0] + step; t += step) {
      let bucket = 0;
      while (i < mins.length && mins[i][0] < t + step) { acc += mins[i][1].cost; bucket += mins[i][1].cost; i++; }
      series.push([t, acc, bucket]);
    }
  }
  const agents = [...state.agents.values()].sort((a, b) => b.cost - a.cost)
    .map((a) => ({ ...a, active: now - a.last < 120000 }));
  return {
    now, session: MAIN ? path.basename(MAIN, '.jsonl') : null,
    startedAt: state.startedAt, lastAt: state.lastAt, calls: state.calls, cost: state.cost,
    tokens: Object.values(state.tok).reduce((a, b) => a + b, 0), tok: state.tok, costBy: state.costBy,
    perHour: windowCost(3600000), last10: windowCost(600000), tokPerMin: windowTok(600000) / 10,
    models: [...state.models.values()].sort((a, b) => b.cost - a.cost),
    agents, activeAgents: agents.filter((a) => a.active).length,
    feed: state.feed.slice(-18).reverse(), series, unpriced: state.unpriced, limits: limitsSnapshot(now),
    says: state.says.slice(-12).reverse(), doing: state.doing.slice(-14).reverse(),
  };
}

function refreshWeekFrom() {
  try {
    const last = JSON.parse(fs.readFileSync(LIMITS, 'utf8')).at(-1);
    const wk = last?.plan?.windows?.find((w) => /weekly/i.test(w.label));
    if (wk) weekFrom = Date.parse(wk.resetsAt) - 7 * 86400000;
  } catch {}
}

// ---- The project half: refreshed every minute, pushed only when it changed -----------------------
const clients = new Set();
const send = (res, event, json) => res.write(`${event ? `event: ${event}\n` : ''}data: ${json}\n\n`);
// A slow source (Hugging Face, wrangler, the code probe) that lands mid-collection asks for one more
// pass rather than waiting for the next minute.
let projectJson = null, collecting = false, again = false;
async function refreshProject() {
  if (collecting) { again = true; return; }
  collecting = true;
  try {
    const json = JSON.stringify(await collectProject(REPO, { onLate: () => refreshProject() }));
    if (json !== projectJson) { projectJson = json; for (const res of clients) send(res, 'project', json); }
  } catch (e) {
    console.error('collect failed:', e?.message || e);
  } finally {
    collecting = false;
    if (again) { again = false; refreshProject(); }
  }
}

refreshWeekFrom();
scan(); weekScan();
setInterval(scan, 2000);
setInterval(() => { refreshWeekFrom(); weekScan(); }, 10000);
refreshProject();
setInterval(refreshProject, 60000);
setInterval(() => { const j = JSON.stringify(snapshot()); for (const res of clients) send(res, null, j); }, 2000);

const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' };
const notFound = (res) => { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); };

// Images are served only from the whitelisted roots, and a path that resolves outside its root is
// refused — the page can show a screenshot, not read the disk.
function media(res, pathname) {
  const [, , root, ...rest] = pathname.split('/');
  const base = MEDIA_ROOTS[root];
  if (!base) return notFound(res);
  const dir = path.resolve(REPO, base);
  let abs; try { abs = path.resolve(dir, decodeURIComponent(rest.join('/'))); } catch { return notFound(res); }
  const type = TYPES[path.extname(abs).toLowerCase()];
  if (!type || !abs.startsWith(dir + path.sep)) return notFound(res);
  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) return notFound(res);
    res.writeHead(200, { 'content-type': type, 'content-length': st.size, 'cache-control': 'max-age=300',
      'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" });
    fs.createReadStream(abs).pipe(res);
  });
}

http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    send(res, null, JSON.stringify(snapshot()));
    if (projectJson) send(res, 'project', projectJson);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (pathname === '/api') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(snapshot())); return; }
  if (pathname === '/api/project') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(projectJson || 'null'); return; }
  if (pathname.startsWith('/media/')) return media(res, pathname);
  // Read on every request, so an edit to the page shows on reload without restarting the server.
  fs.readFile(path.join(HERE, 'index.html'), 'utf8', (err, html) => {
    if (err) return notFound(res);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
    res.end(html);
  });
}).listen(PORT, '127.0.0.1', () => console.log(`owner dashboard on http://localhost:${PORT} — ${state.calls} calls, $${state.cost.toFixed(2)}`));

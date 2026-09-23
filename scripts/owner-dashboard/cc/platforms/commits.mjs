// GET /api/cc/commits: every commit on HEAD, read-only from `git log`, filtered and paged here so the
// browser never receives the whole history. ?sha=<hex> answers one commit's full message and its
// per-file line counts instead.
//
// The list itself (author, date, message, agents) is one plain `git log`, a fraction of a second.
// Which files each commit touched and how many lines it changed need a tree diff per commit, and
// on this repository (loose objects, commits adding tens of thousands of library files) that pass
// takes minutes. So both run in the background as streaming git processes, every finished commit
// is kept per sha in the OS temp folder (a commit never changes), and later runs only walk the
// commits added since. Until a commit is counted its files and lines are null and the page says so.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { run, REPO } from '../http.mjs';

const US = '\x1f', RS = '\x1e';
const CACHE_FILE = path.join(os.tmpdir(), 'apple-hq-commit-cache-v2.json');
const git = (args, timeout = 60000) => run('git', args, { timeout });

// Which part of the product a path belongs to. First match wins.
export const AREAS = [
  ['dashboard', /^scripts\/owner-dashboard\//],
  ['worker', /^apps\/worker\//],
  ['web', /^apps\/web\//],
  ['site', /^apps\/site\//],
  ['plugin', /^apps\/(apple-plugin|plugin)\//],
  ['training', /^packages\/training\//],
  ['corpus', /^packages\/corpus\//],
  ['library', /^packages\/asset-library\//],
  ['packages', /^packages\//],
  ['infra', /^(infra|\.github)\//],
  ['graph', /^graphify-out\//],
  ['agents', /^(\.claude|\.planning|handoff)\//],
  ['docs', /^(docs\/|[^/]+\.md$)/],
  ['tests', /^tests\//],
  ['scripts', /^scripts\//],
  ['config', /^[^/]+$/],
];
export const areaOf = (f) => AREAS.find(([, re]) => re.test(f))?.[0] || 'other';
// The look of the site and the web app: style sheets, layouts, design tokens, brand files, design
// docs and the QA screenshots. Kept per commit so the design history needs no second walk.
// Screenshots anywhere outside the asset library and the synthetic pixel probes: their first commit
// is the date the galleries place them at.
export const IMAGE = /^(?!packages\/asset-library\/|docs\/evidence\/pixels\/|.*node_modules\/).+\.(png|jpe?g|webp|gif)$/i;
export const DESIGN = /^(apps\/(site|web)\/(src\/(styles|layouts|design)\/|brand\/|public\/[^/]+\.(svg|png|webp|ico)$|\.qa\/|tailwind\.config)|apps\/(site|web)\/src\/.*\.css$|docs\/(design\/|DESIGN-|FRESH-PUBLIC-DESIGN|ROBLOX-STYLE-SPEC|palette-split|THINKING-UX)|docs\/evidence\/[^/]*(browser-qa|design|landing|site|catalog)[^/]*\/.+\.(png|jpe?g|webp)$)/i;

let state = { head: null, list: [], bySha: new Map() };
// sha -> [fileCount, {area: n}, [design paths and screenshots]] and sha -> [added, deleted] (binary files count as 0).
let touched = null, stats = null;
const jobs = { files: null, stats: null };

function loadCache() {
  if (touched) return;
  touched = new Map(); stats = new Map();
  try {
    const j = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    for (const [k, v] of Object.entries(j.files || {})) touched.set(k, v);
    for (const [k, v] of Object.entries(j.stats || {})) stats.set(k, v);
  } catch { /* first run */ }
  // Line counts written by this module's first version (same meaning, one map).
  if (!stats.size) try { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'apple-hq-commit-stats.json'), 'utf8')))) stats.set(k, v); } catch { /* none */ }
}
function saveCache() {
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify({ files: Object.fromEntries(touched), stats: Object.fromEntries(stats) })); } catch { /* memory only */ }
}

// One streaming `git log` over the commits `have` lacks: each finished block goes to onBlock(sha,
// lines) at once, and the cache is written every few seconds, so a slow pass still shows progress
// and a restart keeps what was already counted.
function walk(kind, have, flag, onBlock) {
  const list = state.list;
  const missing = list.filter((c) => !have.has(c.sha));
  if (!missing.length || jobs[kind]) return;
  const args = ['-c', 'core.quotepath=off', 'log', flag, '--no-renames', `--format=${RS}%H`, missing[0].sha];
  // Everything newer than the newest counted commit, when the gap is only at the top.
  const known = list.find((c) => have.has(c.sha));
  if (known && missing.every((m) => m.at > known.at)) args.push(`^${known.sha}`);
  const child = spawn('git', args, { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] });
  let buf = '', last = Date.now();
  const flush = (block) => {
    const nl = block.indexOf('\n'); const sha = (nl < 0 ? block : block.slice(0, nl)).trim();
    if (/^[0-9a-f]{40}$/.test(sha)) onBlock(sha, nl < 0 ? [] : block.slice(nl + 1).split('\n'));
  };
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf(RS, 1)) > 0) { flush(buf.slice(buf.startsWith(RS) ? 1 : 0, i)); buf = buf.slice(i); }
    if (Date.now() - last > 5000) { last = Date.now(); saveCache(); }
  });
  const kill = setTimeout(() => child.kill(), 30 * 60000);
  jobs[kind] = new Promise((resolve) => child.on('close', () => {
    clearTimeout(kill);
    if (buf.length > 1) flush(buf.slice(buf.startsWith(RS) ? 1 : 0));
    saveCache(); jobs[kind] = null; resolve();
    if (kind === 'files') walk('stats', stats, '--numstat', countLines); // lines after files
  }));
}

function countFiles(sha, lines) {
  const areas = {}, design = []; let n = 0;
  for (const f of lines) {
    const t = f.trim(); if (!t) continue;
    n++; const a = areaOf(t); areas[a] = (areas[a] || 0) + 1;
    if (design.length < 400 && (DESIGN.test(t) || IMAGE.test(t))) design.push(t);
  }
  touched.set(sha, [n, areas, design]);
  const c = state.bySha.get(sha); if (c) setAreas(c);
}
function countLines(sha, lines) {
  let a = 0, d = 0;
  for (const line of lines) {
    const m = /^(\d+|-)\t(\d+|-)\t/.exec(line);
    if (m) { a += m[1] === '-' ? 0 : Number(m[1]); d += m[2] === '-' ? 0 : Number(m[2]); }
  }
  stats.set(sha, [a, d]);
}
function setAreas(c) {
  const t = touched.get(c.sha);
  if (!t) return;
  c.files = t[0]; c.areas = t[1];
  c.area = Object.entries(t[1]).sort((x, y) => y[1] - x[1])[0]?.[0] || 'other';
}
function background() {
  walk('files', touched, '--name-only', countFiles);
  if (!jobs.files) walk('stats', stats, '--numstat', countLines);
}

async function load() {
  loadCache();
  const head = (await git(['rev-parse', 'HEAD'])).trim();
  if (state.head === head) { background(); return state; }
  const out = await git(['log', `--format=${RS}%H${US}%an${US}%ae${US}%aI${US}%s${US}%(trailers:key=Co-authored-by,valueonly,separator=%x2c)${US}%b${US}`, 'HEAD']);
  const list = [];
  for (const block of out.split(RS)) {
    if (!block.trim()) continue;
    const parts = block.split(US);
    if (parts.length < 7) continue;
    const [sha, author, email, at, subject, co, body] = parts;
    const agents = co.split(',').map((x) => x.replace(/<[^>]*>/g, '').trim()).filter(Boolean);
    const c = { sha, author, email, at, subject, body: body.trim(), agents, files: null, areas: {}, area: null };
    list.push(c);
  }
  state = { head, list, bySha: new Map(list.map((c) => [c.sha, c])) };
  for (const c of list) setAreas(c);
  background();
  return state;
}

// The whole list, newest first, for the pages that read the history (repo health's deploy trail).
export async function history() { return (await load()).list; }

// Every commit that touched a design path, newest first, and how far the background walk has got.
export async function designTouches() {
  const { list } = await load();
  const out = [];
  for (const c of list) {
    const d = touched.get(c.sha)?.[2]?.filter((f) => DESIGN.test(f));
    if (d?.length) out.push({ sha: c.sha, at: c.at, author: c.author, subject: c.subject, body: c.body, agents: c.agents, files: d });
  }
  return { commits: out, scanned: list.filter((c) => touched.has(c.sha)).length, total: list.length };
}

// path -> {at, sha, subject} of the oldest commit that touched it, for every screenshot seen so far.
export async function firstSeen() {
  const { list } = await load();
  const seen = new Map();
  for (const c of list) for (const f of touched.get(c.sha)?.[2] || []) if (IMAGE.test(f)) seen.set(f, { at: c.at, sha: c.sha, subject: c.subject });
  return { seen, scanned: list.filter((c) => touched.has(c.sha)).length, total: list.length };
}

const dayOf = (iso) => iso.slice(0, 10);
const hourOf = (iso) => Number(iso.slice(11, 13));

function summary(list) {
  const days = new Map(), heat = new Map(), authors = new Map(), agents = new Map(), areas = {};
  let added = 0, deleted = 0, counted = 0, filesCounted = 0;
  for (const c of list) {
    const d = dayOf(c.at);
    const ar = c.area || 'pending';
    const e = days.get(d) || { day: d, n: 0, areas: {} }; e.n++; e.areas[ar] = (e.areas[ar] || 0) + 1; days.set(d, e);
    const hk = `${d}|${hourOf(c.at)}`; heat.set(hk, (heat.get(hk) || 0) + 1);
    authors.set(c.author, (authors.get(c.author) || 0) + 1);
    for (const a of c.agents.length ? c.agents : ['(ללא סוכן)']) {
      const g = agents.get(a) || { name: a, n: 0, first: c.at, last: c.at }; g.n++;
      if (c.at < g.first) g.first = c.at; if (c.at > g.last) g.last = c.at; agents.set(a, g);
    }
    areas[ar] = (areas[ar] || 0) + 1; if (c.area) filesCounted++;
    const s = stats?.get(c.sha); if (s) { added += s[0]; deleted += s[1]; counted++; }
  }
  const dayList = [...days.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
  return {
    total: list.length, first: list.at(-1)?.at ?? null, last: list[0]?.at ?? null,
    days: dayList, heat: [...heat.entries()].map(([k, n]) => { const [day, h] = k.split('|'); return { day, h: Number(h), n }; }),
    authors: [...authors.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n),
    agents: [...agents.values()].sort((a, b) => b.n - a.n),
    areas: Object.entries(areas).map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n),
    lines: { added, deleted, counted, pending: counted < list.length },
    files: { counted: filesCounted, pending: filesCounted < list.length },
    busiest: dayList.reduce((b, d) => (!b || d.n > b.n ? d : b), null),
  };
}

async function detail(sha) {
  const { bySha, list } = await load();
  const c = bySha.get(sha) || list.find((x) => x.sha.startsWith(sha));
  if (!c) return { ok: false, reason: 'הקומיט לא נמצא בהיסטוריה של הענף הנוכחי' };
  const [num, parents] = await Promise.all([
    git(['-c', 'core.quotepath=off', 'show', '--numstat', '--no-renames', '--format=', c.sha], 90000).catch(() => null),
    git(['log', '-1', '--format=%P%x1f%cI%x1f%cn', c.sha]),
  ]);
  if (num == null) return { commit: { ...c, parents: parents.trim().split(US)[0].split(' ').filter(Boolean), fileList: [], fileCount: c.files, slow: true } };
  const files = [];
  for (const line of num.split('\n')) {
    const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line);
    if (m) files.push({ path: m[3], added: m[1] === '-' ? null : Number(m[1]), deleted: m[2] === '-' ? null : Number(m[2]), area: areaOf(m[3]) });
  }
  const [p, committedAt, committer] = parents.trim().split(US);
  const added = files.reduce((s, f) => s + (f.added || 0), 0), deleted = files.reduce((s, f) => s + (f.deleted || 0), 0);
  files.sort((a, b) => (b.added || 0) + (b.deleted || 0) - (a.added || 0) - (a.deleted || 0));
  return {
    commit: { ...c, parents: p ? p.split(' ') : [], committedAt, committer, added, deleted,
      fileCount: files.length, fileList: files.slice(0, 400), truncated: files.length > 400 },
  };
}

export async function commits(q = new URLSearchParams()) {
  const sha = String(q.get('sha') || '');
  if (sha) {
    if (!/^[0-9a-f]{7,40}$/i.test(sha)) return { ok: false, reason: 'מזהה קומיט לא תקין' };
    return detail(sha.toLowerCase());
  }
  const { list, head } = await load();
  const area = q.get('area') || '', author = q.get('author') || '', agent = q.get('agent') || '', day = q.get('day') || '';
  const text = String(q.get('q') || '').trim().toLowerCase().slice(0, 200);
  const per = Math.min(100, Math.max(10, Number(q.get('per')) || 40));
  const hits = list.filter((c) => (!area || c.area === area || (q.get('touch') === '1' && c.areas[area]))
    && (!author || c.author === author)
    && (!agent || (agent === '(ללא סוכן)' ? !c.agents.length : c.agents.includes(agent)))
    && (!day || c.at.startsWith(day))
    && (!text || c.sha.startsWith(text) || c.subject.toLowerCase().includes(text) || c.body.toLowerCase().includes(text) || c.author.toLowerCase().includes(text)));
  const pages = Math.max(1, Math.ceil(hits.length / per));
  const page = Math.min(pages, Math.max(1, Number(q.get('page')) || 1));
  const items = hits.slice((page - 1) * per, page * per).map((c) => {
    const s = stats?.get(c.sha);
    return { sha: c.sha, author: c.author, at: c.at, subject: c.subject, agents: c.agents, files: c.files, area: c.area,
      areas: c.areas, added: s ? s[0] : null, deleted: s ? s[1] : null, hasBody: !!c.body };
  });
  return { head, summary: summary(list), filter: { area, author, agent, day, q: text, per }, matched: hits.length, page, pages, items };
}

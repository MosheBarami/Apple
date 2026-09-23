// "The 100+ Repos Hub": every external GitHub repository Apple depends on or learned from, DERIVED
// from the working tree (never hand-written), with health from GitHub's GraphQL API.
//
// Sources: npm (each workspace package.json -> installed node_modules/<dep>/package.json "repository"),
// corpus (packages/corpus/raw/Owner__repo checkouts + raw/manifest.json), training
// (packages/training/data/*/raw/{github,existing}/Owner__repo + packages/training/data/*/repos.jsonl),
// actions (`uses:` in .github/workflows/*.yml, comments stripped first).
// No wally/rokit/aftman/foreman/requirements.txt manifest belongs to the project itself on 2026-09-23
// (the ones under packages/corpus/raw are the dependencies of third-party checkouts, not ours).
//
// Export: repos({health = true}) -> {ok, fetchedAt, repos, counts, unresolved}.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const CACHE_DIR = '/private/tmp/claude-501/owner-dashboard-cache';
const CACHE_FILE = path.join(CACHE_DIR, 'repos-health.json');
const HOUR = 3600000;
const SAFE = /^[A-Za-z0-9_.-]+$/;
const SOURCE_RANK = { npm: 0, actions: 1, corpus: 2, training: 3 };

export function githubSlug(repo) {
  const u = String((typeof repo === 'string' ? repo : repo?.url) || '').trim();
  const m = u.match(/^github:([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:#.*)?$/i)
    || u.match(/^([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:#.*)?$/)
    || u.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/#?].*)?$/i);
  return m ? { owner: m[1], name: m[2] } : null;
}

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const dirs = (p) => { try { return fs.readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return []; } };
const rel = (p) => path.relative(REPO, p) || '.';
const splitCheckout = (dir) => {
  const i = dir.indexOf('__');
  return i > 0 && !dir.startsWith('_') ? { owner: dir.slice(0, i), name: dir.slice(i + 2) } : null;
};

function gitFiles(pattern) {
  return new Promise((resolve, reject) => execFile('git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', `:(glob)${pattern}`],
    { cwd: REPO, maxBuffer: 64 * 1024 * 1024 },
    (err, out) => (err ? reject(err) : resolve([...new Set(out.split('\0').filter(Boolean))]))));
}

export async function derive() {
  const found = new Map(), unresolved = [];
  const add = (slug, source, usedBy, extra = {}) => {
    if (!slug || !SAFE.test(slug.owner) || !SAFE.test(slug.name)) return;
    const key = `${slug.owner}/${slug.name}`.toLowerCase();
    let e = found.get(key);
    if (!e) found.set(key, (e = { owner: slug.owner, name: slug.name, url: `https://github.com/${slug.owner}/${slug.name}`, sources: [], usedBy: [] }));
    if (!e.sources.includes(source)) e.sources.push(source);
    if (!e.usedBy.includes(usedBy)) e.usedBy.push(usedBy);
    if (extra.npm) {
      e.packages ||= [];
      if (!e.packages.some((p) => p.name === extra.npm)) e.packages.push({ name: extra.npm, version: extra.version ?? null });
      e.npm ??= extra.npm;
      e.version ??= extra.version ?? null;
    }
  };

  // npm
  for (const pj of (await gitFiles('**/package.json')).filter((p) => !p.includes('node_modules/'))) {
    const pkg = readJson(path.join(REPO, pj));
    if (!pkg) continue;
    const ws = path.dirname(path.join(REPO, pj));
    const deps = { ...pkg.peerDependencies, ...pkg.optionalDependencies, ...pkg.devDependencies, ...pkg.dependencies };
    for (const [name, spec] of Object.entries(deps)) {
      if (/^(workspace|link|file):/.test(String(spec))) continue;
      const installed = [ws, REPO].map((d) => readJson(path.join(d, 'node_modules', name, 'package.json'))).find(Boolean);
      const slug = installed && (githubSlug(installed.repository) || githubSlug(installed.homepage) || githubSlug(installed.bugs));
      if (slug) add(slug, 'npm', rel(ws), { npm: name, version: installed.version });
      else unresolved.push({ npm: name, usedBy: rel(ws), reason: installed ? 'no GitHub repository field' : 'not installed' });
    }
  }

  // corpus
  const corpusRaw = path.join(REPO, 'packages/corpus/raw');
  for (const d of dirs(corpusRaw)) add(splitCheckout(d), 'corpus', rel(path.join(corpusRaw, d)));
  for (const [key, src] of Object.entries(readJson(path.join(corpusRaw, 'manifest.json'))?.sources || {})) {
    add(githubSlug(src?.url), 'corpus', rel(path.join(corpusRaw, key)));
  }

  // training
  const dataDir = path.join(REPO, 'packages/training/data');
  for (const set of dirs(dataDir)) {
    for (const kind of ['github', 'existing']) {
      const raw = path.join(dataDir, set, 'raw', kind);
      for (const d of dirs(raw)) add(splitCheckout(d), 'training', rel(path.join(dataDir, set)));
    }
    const jsonl = path.join(dataDir, set, 'repos.jsonl');
    if (!fs.existsSync(jsonl)) continue;
    for (const line of fs.readFileSync(jsonl, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { add(githubSlug(JSON.parse(line).source_url), 'training', rel(path.join(dataDir, set))); } catch { /* skip bad row */ }
    }
  }

  // GitHub Actions
  const wf = path.join(REPO, '.github/workflows');
  let wfFiles = [];
  try { wfFiles = fs.readdirSync(wf).filter((f) => /\.ya?ml$/.test(f)); } catch { /* none */ }
  for (const f of wfFiles) {
    const src = fs.readFileSync(path.join(wf, f), 'utf8').split('\n').map((l) => l.replace(/(^|\s)#.*$/, '')).join('\n');
    for (const m of src.matchAll(/^\s*(?:-\s*)?uses:\s*['"]?([^'"\s@]+)@/gm)) {
      if (m[1].startsWith('./') || m[1].startsWith('docker://')) continue;
      const [owner, name] = m[1].split('/');
      if (owner && name) add({ owner, name }, 'actions', rel(path.join(wf, f)));
    }
  }

  const repos = [...found.values()].sort((a, b) =>
    Math.min(...a.sources.map((s) => SOURCE_RANK[s] ?? 9)) - Math.min(...b.sources.map((s) => SOURCE_RANK[s] ?? 9))
    || a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  return { repos, unresolved };
}

// ---- Health (GitHub GraphQL, batched with aliases) ---------------------------------------------------
let memo = null; // {at, map: {key: health}}

function gh(query) {
  return new Promise((resolve, reject) => {
    execFile('gh', ['api', 'graphql', '-f', `query=${query}`], { maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      // A NOT_FOUND alias makes gh exit non-zero but still print the partial data.
      try {
        const body = JSON.parse(stdout);
        if (body.data) return resolve(body.data);
      } catch { /* fall through */ }
      reject(new Error(String(stderr || err?.message || 'gh failed').split('\n')[0]));
    });
  });
}

async function fetchHealth(list) {
  const map = {};
  const batches = [];
  for (let i = 0; i < list.length; i += 100) batches.push(list.slice(i, i + 100));
  const run = async (batch) => {
    const q = `query{${batch.map((r, i) => `r${i}:repository(owner:${JSON.stringify(r.owner)},name:${JSON.stringify(r.name)}){nameWithOwner stargazerCount isArchived isDisabled pushedAt description licenseInfo{spdxId name}}`).join(' ')}}`;
    const data = await gh(q);
    batch.forEach((r, i) => {
      const n = data[`r${i}`];
      map[`${r.owner}/${r.name}`.toLowerCase()] = n
        ? { stars: n.stargazerCount, archived: n.isArchived, isDisabled: n.isDisabled, pushedAt: n.pushedAt,
          license: n.licenseInfo ? (n.licenseInfo.spdxId !== 'NOASSERTION' ? n.licenseInfo.spdxId : n.licenseInfo.name) : null,
          description: n.description, nameWithOwner: n.nameWithOwner, missing: false }
        : { missing: true };
    });
  };
  for (let i = 0; i < batches.length; i += 4) await Promise.all(batches.slice(i, i + 4).map(run));
  return map;
}

async function healthFor(repos) {
  if (!memo) {
    const disk = (() => { try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { return null; } })();
    if (disk && Date.now() - disk.at < HOUR) memo = disk;
  }
  if (!memo || Date.now() - memo.at >= HOUR) memo = { at: Date.now(), map: {} };
  const todo = repos.filter((r) => !memo.map[`${r.owner}/${r.name}`.toLowerCase()]);
  if (todo.length) {
    Object.assign(memo.map, await fetchHealth(todo));
    try { fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.writeFileSync(CACHE_FILE, JSON.stringify(memo)); } catch { /* memory only */ }
  }
  return memo;
}

function statusOf(h) {
  if (!h) return 'unknown';
  if (h.missing || h.isDisabled) return 'missing';
  if (h.archived) return 'archived';
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 18);
  return h.pushedAt && Date.parse(h.pushedAt) < cutoff.getTime() ? 'stale' : 'ok';
}

export async function repos({ health = true } = {}) {
  let derived;
  try {
    derived = await derive();
  } catch (e) {
    return { ok: false, reason: `לא הצלחתי לאסוף את רשימת המאגרים מהקוד: ${String(e.message || e).split('\n')[0]}` };
  }
  let healthAt = null, healthError = null, map = {};
  if (health) {
    try { const h = await healthFor(derived.repos); map = h.map; healthAt = new Date(h.at).toISOString(); } catch (e) {
      healthError = `לא הצלחתי לבדוק את מצב המאגרים ב-GitHub (gh): ${e.message}. הרשימה עצמה מלאה.`;
    }
  }
  const list = derived.repos.map((r) => {
    const h = map[`${r.owner}/${r.name}`.toLowerCase()];
    return { ...r, ...(h || {}), status: statusOf(h) };
  });
  const counts = { total: list.length, ok: 0, stale: 0, archived: 0, missing: 0, unknown: 0, bySource: {} };
  for (const r of list) {
    counts[r.status]++;
    for (const s of r.sources) counts.bySource[s] = (counts.bySource[s] || 0) + 1;
  }
  return { ok: true, fetchedAt: new Date().toISOString(), healthAt, healthError, repos: list, counts, unresolved: derived.unresolved,
    note: 'נגזר אוטומטית מהקוד: חבילות npm, מאגרי הקורפוס, מאגרי האימון ו-GitHub Actions. "ישן" = לא עודכן יותר מ-18 חודשים.' };
}

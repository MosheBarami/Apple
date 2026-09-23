// GET /api/cc/repo-health: the owner-console view of the repository itself. Who is committing (the
// people and the agents named in Co-Authored-By), the customer findings still open, the gates ledger
// (GATES.md), the owner's own queue, CI runs (`gh run list`, read-only, gh's own login) and the deploy
// trail: what production says it is running against HEAD, and every deploy a commit message records.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { REPO, run, cached } from '../http.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const commitsModule = () => { const abs = path.join(HERE, 'commits.mjs'); return import(`${pathToFileURL(abs).href}?v=${fs.statSync(abs).mtimeMs}`); };
const readText = (p) => { try { return fs.readFileSync(path.join(REPO, p), 'utf8'); } catch { return null; } };
const demd = (s) => s.replace(/\*\*|`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim();
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const HEALTH_URL = 'https://apple.moshe-barami111.workers.dev/api/health';
const DAY = 86400000;

function agentsOf(list) {
  const now = Date.now();
  const by = new Map();
  for (const c of list) {
    const t = Date.parse(c.at);
    for (const name of c.agents.length ? c.agents : [`${c.author} (בלי סוכן)`]) {
      const a = by.get(name) || { name, human: !c.agents.length, n: 0, week: 0, day: 0, first: c.at, last: c.at, spark: Array(14).fill(0), areas: {} };
      a.n++; if (now - t < 7 * DAY) a.week++; if (now - t < DAY) a.day++;
      const ago = Math.floor((now - t) / DAY); if (ago < 14) a.spark[13 - ago]++;
      if (c.at < a.first) a.first = c.at; if (c.at > a.last) a.last = c.at;
      if (c.area) a.areas[c.area] = (a.areas[c.area] || 0) + 1;
      by.set(name, a);
    }
  }
  const authors = new Map();
  for (const c of list) { const a = authors.get(c.author) || { name: c.author, n: 0, last: c.at }; a.n++; if (c.at > a.last) a.last = c.at; authors.set(c.author, a); }
  return { agents: [...by.values()].map((a) => ({ ...a, areas: Object.entries(a.areas).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([id, n]) => ({ id, n })) })).sort((x, y) => (y.last > x.last ? 1 : -1)),
    authors: [...authors.values()].sort((x, y) => y.n - x.n) };
}

function findings() {
  const md = readText('docs/autonomy/CUSTOMER_FINDINGS.md');
  if (!md) return null;
  const re = /^- \[(open|closed)\]\[(critical|high|medium|low)\] (F-\d+): (.*)$/;
  const rank = { critical: 0, high: 1, medium: 2, low: 3 };
  const all = [];
  for (const line of md.split('\n')) {
    const m = re.exec(line); if (!m) continue;
    const [what, rest = ''] = m[4].split(' — evidence: ');
    all.push({ status: m[1], sev: m[2], id: m[3], text: clip(demd(what), 420), evidence: clip(demd(rest.split(' — closed ')[0].split(' — REOPENED')[0]), 260), reopened: /REOPENED/.test(m[4]) });
  }
  const bySev = {};
  for (const f of all) (bySev[f.sev] ||= { open: 0, closed: 0 })[f.status]++;
  return { source: 'docs/autonomy/CUSTOMER_FINDINGS.md', total: all.length, closed: all.filter((f) => f.status === 'closed').length,
    open: all.filter((f) => f.status === 'open').sort((x, y) => rank[x.sev] - rank[y.sev] || x.id.localeCompare(y.id, 'en', { numeric: true })), bySev };
}

// "- [x] G1: title" followed by CHECK / EXPECT / FALSIFIED / EVIDENCE lines, under "## section" headings.
function gates() {
  const md = readText('GATES.md');
  if (!md) return null;
  const out = []; let section = null, cur = null;
  for (const line of md.split('\n')) {
    const h = /^## (.+)$/.exec(line); if (h) { section = h[1].trim(); cur = null; continue; }
    const g = /^- \[( |x)\] (G[\w-]*): (.*)$/.exec(line);
    if (g) { out.push((cur = { id: g[2], title: demd(g[3]), checked: g[1] === 'x', section, check: null, evidence: null, falsified: false })); continue; }
    if (!cur) continue;
    const k = /^\s+(CHECK|EVIDENCE|FALSIFIED):\s*(.*)$/.exec(line);
    if (k?.[1] === 'CHECK' && !cur.check) cur.check = clip(k[2], 200);
    if (k?.[1] === 'FALSIFIED') cur.falsified = true;
    if (k?.[1] === 'EVIDENCE') {
      const f = Object.fromEntries(k[2].split('; ').map((kv) => { const i = kv.indexOf('='); return [kv.slice(0, i), kv.slice(i + 1)]; }));
      cur.evidence = { exit: f.exit ?? null, sha: f['git-sha'] ?? null, at: f.at ?? null, expect: f.EXPECT ?? null, clean: f['tree-clean'] === 'yes' };
    }
  }
  for (const g of out) g.state = !g.checked ? 'open' : g.evidence && g.evidence.exit === '0' && g.evidence.expect === 'matched' ? 'met' : 'unproven';
  const sections = [...new Set(out.map((g) => g.section))].map((s) => ({ title: s, n: out.filter((g) => g.section === s).length }));
  const last = out.map((g) => g.evidence?.at).filter(Boolean).sort().at(-1) || null;
  return { source: 'GATES.md', total: out.length, met: out.filter((g) => g.state === 'met').length, open: out.filter((g) => g.state === 'open').length,
    unproven: out.filter((g) => g.state === 'unproven').length, redFirst: out.filter((g) => g.falsified).length, lastEvidenceAt: last, sections, gates: out };
}

function ownerQueue() {
  const md = readText('docs/autonomy/OWNER_QUEUE.md');
  if (!md) return null;
  const items = [];
  for (const line of md.split('\n')) {
    const m = /^- \[(open|done)\] (Q-\d+): (.*)$/.exec(line); if (!m) continue;
    const [step, rest = ''] = m[3].split(' — why: ');
    const [why, blocks = 'none'] = rest.split(' — Blocks findings: ');
    items.push({ status: m[1], id: m[2], step: clip(demd(step), 320), why: clip(demd(why), 320), blocks: blocks.trim(), paid: /\bpaid\b|\$\d/.test(step) });
  }
  return { source: 'docs/autonomy/OWNER_QUEUE.md', open: items.filter((i) => i.status === 'open'), done: items.filter((i) => i.status === 'done').length };
}

// Five minutes per read: the GitHub API budget (5,000 an hour) is shared with every other tool.
const ci = () => cached('repo-health:ci', ciRead, 5 * 60000);
async function ciRead() {
  try {
    const out = await run('gh', ['run', 'list', '--limit', '30', '--json', 'databaseId,displayTitle,status,conclusion,workflowName,headSha,headBranch,event,createdAt,updatedAt,url'], { timeout: 20000 });
    const runs = JSON.parse(out).map((r) => ({ id: r.databaseId, title: r.displayTitle, status: r.status, conclusion: r.conclusion || null, workflow: r.workflowName,
      sha: r.headSha, branch: r.headBranch, event: r.event, at: r.createdAt, updatedAt: r.updatedAt, url: r.url }));
    const byWf = new Map();
    for (const r of runs) if (!byWf.has(r.workflow)) byWf.set(r.workflow, r);
    return { runs, latest: [...byWf.values()], lastRunAt: runs[0]?.at ?? null };
  } catch (e) {
    const msg = String(e?.stderr || e?.message || '');
    return { runs: [], latest: [], lastRunAt: null, reason: /rate limit/i.test(msg) ? 'GitHub הגביל את קצב הבקשות (5,000 בשעה לכל הכלים יחד). ננסה שוב בעוד כמה דקות.'
      : /auth|login/i.test(msg) ? 'gh לא מחובר במחשב הזה (gh auth login)' : /ENOENT/.test(msg) ? 'הכלי gh לא מותקן' : 'לא הצלחתי לקרוא את ריצות ה-CI מ-GitHub' };
  }
}

async function live(head) {
  try {
    const r = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(8000) });
    const j = await r.json().catch(() => ({}));
    const raw = typeof j.buildSha === 'string' ? j.buildSha : null;
    const sha = raw ? raw.replace(/-dirty$/, '') : null;
    let behind = null, known = false;
    if (sha && /^[0-9a-f]{7,40}$/.test(sha)) {
      known = await run('git', ['cat-file', '-e', `${sha}^{commit}`]).then(() => true, () => false);
      if (known) behind = Number((await run('git', ['rev-list', '--count', `${sha}..${head}`]).catch(() => '')).trim()) || 0;
    }
    return { url: HEALTH_URL, status: r.status, buildSha: raw, dirty: /-dirty$/.test(raw || ''), known, behind, version: j.version ?? null, time: j.time ?? null };
  } catch {
    return { url: HEALTH_URL, status: null, buildSha: null, reason: 'השרת בפרודקשן לא ענה תוך 8 שניות' };
  }
}

// "Deployed worker 9900fc61, web." / "Deployed: worker a268792c (serving 30778dc-dirty)": the deploys
// each commit message records. Lines that say a thing was NOT deployed are left out.
function deploys(list) {
  const out = [];
  for (const c of list) {
    for (const raw of `${c.subject}\n${c.body}`.split('\n')) {
      const line = raw.trim();
      if (!/\bdeploy(ed)?\b/i.test(line) || /\b(not|never|un|isn't|wasn't|without)[- ]deploy/i.test(line) || /\bnot deployed\b/i.test(line)) continue;
      if (!/\bdeployed\b|deployed with|deploy-static|deploy-worker|Deployed as/i.test(line)) continue;
      const worker = /\bworker(?: version)?\s+([0-9a-f]{8})\b/i.exec(line)?.[1] || null;
      const serving = /\bserving\s+([0-9a-f]{7,12}(?:-dirty)?)/i.exec(line)?.[1] || null;
      const targets = ['worker', 'web', 'site', 'plugin'].filter((t) => new RegExp(`\\b${t}\\b`, 'i').test(line));
      if (!targets.length && !worker) continue;
      out.push({ sha: c.sha, at: c.at, subject: c.subject, line: clip(demd(line.replace(/^[-*]\s*/, '')), 240), worker, serving, targets });
      break;
    }
  }
  return out;
}

function releases() {
  try {
    const j = JSON.parse(readText('docs/RELEASES.json') || 'null');
    return (j?.releases || []).map((r) => ({ version: r.version, date: r.date, title: r.title, lede: r.lede, changes: (r.changes || []).length }));
  } catch { return []; }
}

export async function repoHealth() {
  const cm = await commitsModule();
  const list = await cm.history();
  const head = list[0]?.sha || null;
  const [ciOut, liveOut, dirty] = await Promise.all([ci(), live(head || 'HEAD'),
    run('git', ['status', '--porcelain']).then((s) => s.split('\n').filter(Boolean).length, () => null)]);
  const { agents, authors } = agentsOf(list);
  const day = Date.now() - DAY;
  return {
    head: head ? { sha: head, at: list[0].at, subject: list[0].subject } : null,
    activity: { total: list.length, last24h: list.filter((c) => Date.parse(c.at) > day).length, last7d: list.filter((c) => Date.parse(c.at) > Date.now() - 7 * DAY).length, uncommitted: dirty },
    agents, authors,
    findings: findings(), gates: gates(), queue: ownerQueue(),
    ci: ciOut, live: liveOut, deploys: deploys(list).slice(0, 60), releases: releases(),
  };
}

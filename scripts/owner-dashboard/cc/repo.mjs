// Repo intelligence for the owner's Executive Control Center: how much of the live code the AI wrote,
// quality proxies, the owner's commit review queue, and a plain-language map of the live repository.
// "Live" = origin's default branch as last fetched. Read-only against git: this file never fetches,
// checks out, resets or rewrites history. A rejected commit becomes a line in
// docs/autonomy/OWNER_REVIEW_REJECTS.md for the autonomous agent to revert and report.
//
// Exports (lane A's server calls these): overview(), review({sha, verdict}), tree().
// Every result is {ok:true, fetchedAt, ...} or {ok:false, reason:'<Hebrew>'}.
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const REVIEW_PATH = path.join(HERE, 'review.json');
const REJECTS_PATH = path.join(REPO, 'docs/autonomy/OWNER_REVIEW_REJECTS.md');
const FOLDERS_PATH = path.join(HERE, 'folders.json');
const FINDINGS_PATH = path.join(REPO, 'docs/autonomy/CUSTOMER_FINDINGS.md');
const DAY = 86400000;

export function git(args, { maxBuffer = 512 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: REPO, maxBuffer, encoding: 'utf8' }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });
}

// `git cat-file --batch`: many blobs in one process. specs are "<rev>:<path>"; missing -> null.
function catBatch(specs) {
  if (!specs.length) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['cat-file', '--batch'], { cwd: REPO });
    const chunks = [];
    child.stdout.on('data', (c) => chunks.push(c));
    child.on('error', reject);
    child.on('close', () => {
      const buf = Buffer.concat(chunks), out = [];
      let pos = 0;
      for (let i = 0; i < specs.length && pos < buf.length; i++) {
        const nl = buf.indexOf(10, pos);
        const header = buf.toString('utf8', pos, nl);
        pos = nl + 1;
        const m = header.match(/^\S+ (\w+) (\d+)$/);
        if (!m) { out.push(null); continue; }
        const size = Number(m[2]);
        out.push(m[1] === 'blob' ? buf.toString('utf8', pos, pos + size) : null);
        pos += size + 1;
      }
      resolve(out);
    });
    child.stdin.end(specs.join('\n') + '\n');
  });
}

let liveCache = null;
export async function liveRef() {
  if (liveCache) return liveCache;
  try {
    liveCache = (await git(['rev-parse', '--abbrev-ref', 'origin/HEAD'])).trim();
  } catch {
    await git(['rev-parse', '--verify', 'origin/main']);
    liveCache = 'origin/main';
  }
  return liveCache;
}

async function originSlug() {
  const url = (await git(['remote', 'get-url', 'origin'])).trim();
  const m = url.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i);
  return m ? `${m[1]}/${m[2]}` : null;
}

const fail = (reason) => ({ ok: false, reason });
const now = () => new Date().toISOString();

// ---- Pure helpers (tested) ----------------------------------------------------------------------
const AI_TRAILER = /^co-authored-by:\s*claude\b/im;
export function isAiCommit({ message = '', author = '', committer = '' }) {
  return AI_TRAILER.test(message) || /claude/i.test(author) || /claude/i.test(committer);
}

const FINDING = /^\s*- \[(open|closed)\]\[(critical|high|medium|low)\]\s+(F-\d+):\s*(.*)$/i;
export function parseFindings(text) {
  const open = { critical: 0, high: 0, medium: 0, low: 0 }, list = [];
  let closed = 0;
  for (const line of text.split('\n')) {
    const m = line.match(FINDING);
    if (!m) continue;
    const status = m[1].toLowerCase(), severity = m[2].toLowerCase();
    if (status === 'open') open[severity]++; else closed++;
    list.push({ id: m[3], severity, status, title: m[4].trim().slice(0, 140) });
  }
  return { open, closed, list };
}

// ---- git log --------------------------------------------------------------------------------------
// `git log --numstat` over 90 days takes ~3 s here, so the parse is kept per (live sha, day).
let logMemo = null;
async function readLog(live, since, liveSha) {
  const key = `${liveSha}|${since}|${dayKey(Date.now())}`;
  if (logMemo?.key === key) return logMemo.commits;
  const out = await git(['log', live, `--since=${since}`, '--no-renames', '--numstat',
    '--format=%x1e%H%x1f%an%x1f%cn%x1f%cI%x1f%B%x1f']);
  const commits = [];
  for (const rec of out.split('\x1e').slice(1)) {
    const [sha, author, committer, date, message, rest = ''] = rec.split('\x1f');
    let additions = 0, deletions = 0;
    const files = [];
    for (const line of rest.split('\n')) {
      const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
      if (!m) continue;
      files.push(m[3]);
      if (m[1] === '-') continue; // binary
      additions += Number(m[1]);
      deletions += Number(m[2]);
    }
    commits.push({ sha, author, committer, date, t: Date.parse(date), message,
      subject: message.split('\n')[0], files, additions, deletions,
      ai: isAiCommit({ message, author, committer }) });
  }
  logMemo = { key, commits };
  return commits; // newest first
}

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const mondayOf = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

function writeJsonAtomic(p, value) {
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(tmp, p);
}

// ---- overview() -----------------------------------------------------------------------------------
const FIX_RE = /^(fix|revert)|\bfix\b/i;

export async function overview({ reviewPath = REVIEW_PATH } = {}) {
  try {
    const live = await liveRef();
    const [slug, liveSha] = await Promise.all([originSlug(), git(['rev-parse', live]).then((s) => s.trim())]);
    const commits = await readLog(live, '90.days.ago', liveSha);

    // AI share of lines added
    let aiLines = 0, allLines = 0, aiCommits = 0;
    for (const c of commits) { allLines += c.additions; if (c.ai) { aiLines += c.additions; aiCommits++; } }

    const perDayMap = new Map();
    for (let i = 29; i >= 0; i--) perDayMap.set(dayKey(Date.now() - i * DAY), { ai: 0, human: 0 });
    const weekMap = new Map();
    for (let i = 12; i >= 0; i--) weekMap.set(dayKey(mondayOf(Date.now() - i * 7 * DAY)), { ai: 0, human: 0 });
    for (const c of commits) {
      const d = perDayMap.get(dayKey(c.t));
      if (d) d[c.ai ? 'ai' : 'human']++;
      const w = weekMap.get(dayKey(mondayOf(c.t)));
      if (w) w[c.ai ? 'ai' : 'human'] += c.additions;
    }

    // Fast-fix proxy: an AI commit followed within 24 h by a fix/revert commit touching a same file.
    const asc = [...commits].sort((a, b) => a.t - b.t);
    let fastFix = 0;
    for (let i = 0; i < asc.length; i++) {
      const c = asc[i];
      if (!c.ai || !c.files.length) continue;
      const mine = new Set(c.files);
      for (let j = i + 1; j < asc.length && asc[j].t - c.t <= DAY; j++) {
        if (FIX_RE.test(asc[j].subject) && asc[j].files.some((f) => mine.has(f))) { fastFix++; break; }
      }
    }
    const reverts = commits.filter((c) => /^Revert/.test(c.subject)).length;

    let findingsText, findingsSource = 'working tree';
    try { findingsText = fs.readFileSync(FINDINGS_PATH, 'utf8'); } catch {
      findingsText = await git(['show', `${live}:docs/autonomy/CUSTOMER_FINDINGS.md`]).catch(() => '');
      findingsSource = live;
    }

    const verdicts = readJson(reviewPath, {});
    const item = (c) => ({ sha: c.sha, short: c.sha.slice(0, 7), title: c.subject, date: c.date, author: c.author,
      ai: c.ai, files: c.files.length, additions: c.additions, deletions: c.deletions,
      url: slug ? `https://github.com/${slug}/commit/${c.sha}` : null });
    const aiList = commits.filter((c) => c.ai);
    const pendingAll = aiList.filter((c) => !verdicts[c.sha]);

    return {
      ok: true, fetchedAt: now(),
      live: { ref: live, sha: liveSha, date: commits[0]?.date ?? null, lastFetchAt: lastFetchAt() },
      ai: {
        window: '90 days', share: allLines ? aiLines / allLines : 0, aiCommits, totalCommits: commits.length,
        aiLinesAdded: aiLines, totalLinesAdded: allLines,
        perDay: [...perDayMap].map(([day, v]) => ({ day, ...v })),
        perWeekLines: [...weekMap].map(([week, v]) => ({ week, ...v })),
        rule: 'קומיט של AI = יש בו שורת "Co-Authored-By: Claude", או ששם הכותב/המבצע מכיל Claude. "אנושי" = כל קומיט אחר, כולל כנראה סוכנים אחרים (למשל Codex) שלא מסמנים את עצמם.',
      },
      quality: {
        findings: { ...parseFindings(findingsText), source: findingsSource,
          note: 'ממצאים שהסוכן תיעד בעצמו כשבדק את המוצר כמו לקוח (docs/autonomy/CUSTOMER_FINDINGS.md).' },
        fastFix: { share: aiCommits ? fastFix / aiCommits : 0, count: fastFix, of: aiCommits,
          note: 'מדד עקיף בלבד: קומיט של AI שתוך 24 שעות הגיע אחריו קומיט "תיקון" שנוגע באותו קובץ. לא כל תיקון כזה הוא באג של הקומיט הקודם.' },
        reverts, revertsNote: 'מספר הקומיטים שנפתחים ב-"Revert" (ביטול קומיט קודם) ב-90 הימים האחרונים.',
      },
      review: {
        pending: pendingAll.slice(0, 25).map(item), pendingTotal: pendingAll.length,
        decided: aiList.filter((c) => verdicts[c.sha]).slice(0, 25).map((c) => ({ ...item(c), ...verdicts[c.sha] })),
      },
    };
  } catch (e) {
    return fail(`לא הצלחתי לקרוא את היסטוריית הקוד (git): ${String(e.message || e).split('\n')[0]}`);
  }
}

function lastFetchAt() {
  for (const f of ['.git/FETCH_HEAD', '.git/refs/remotes/origin/main']) {
    try { return fs.statSync(path.join(REPO, f)).mtime.toISOString(); } catch { /* next */ }
  }
  return null;
}

// ---- review() -------------------------------------------------------------------------------------
const REJECTS_HEADER = `# Owner review rejects

Written by the owner dashboard (scripts/owner-dashboard/cc/repo.mjs) when the owner rejects a commit on
the live branch. Each unticked line is a task for the autonomous agent: revert that commit on a branch,
verify, ship through the normal gates, report what changed, then tick the box. The dashboard itself
never rewrites git history.

`;

export async function review({ sha, verdict } = {}, { reviewPath = REVIEW_PATH, rejectsPath = REJECTS_PATH } = {}) {
  if (verdict !== 'approve' && verdict !== 'reject') return fail('ההחלטה חייבת להיות "אישור" או "דחייה".');
  if (typeof sha !== 'string' || !/^[0-9a-f]{7,40}$/i.test(sha)) return fail('מזהה הקומיט לא תקין (צריך 7 עד 40 תווים הקסדצימליים).');
  let full, title, live;
  try {
    live = await liveRef();
    await git(['cat-file', '-e', `${sha}^{commit}`]);
    full = (await git(['rev-parse', '--verify', '--quiet', `${sha}^{commit}`])).trim();
  } catch {
    return fail('הקומיט הזה לא נמצא במאגר.');
  }
  try {
    await git(['merge-base', '--is-ancestor', full, live]);
  } catch {
    return fail('הקומיט הזה אינו חלק מהגרסה החיה (origin), ולכן אין מה לאשר או לדחות בו.');
  }
  title = (await git(['log', '-1', '--format=%s', full])).trim().replace(/\s+/g, ' ');

  const at = now();
  const all = readJson(reviewPath, {});
  const previous = all[full]?.verdict;
  all[full] = { verdict, at };
  writeJsonAtomic(reviewPath, all);
  if (verdict === 'reject' && previous !== 'reject') {
    if (!fs.existsSync(rejectsPath)) fs.writeFileSync(rejectsPath, REJECTS_HEADER);
    fs.appendFileSync(rejectsPath, `- [ ] ${at} reject ${full} ${title} — the agent must revert this commit and report\n`);
  }
  return {
    ok: true, fetchedAt: at, sha: full, verdict,
    note: verdict === 'approve'
      ? 'אושר. הקומיט נשאר כמו שהוא ויוצא מרשימת הממתינים לבדיקה.'
      : 'נדחה. נרשמה משימה בקובץ docs/autonomy/OWNER_REVIEW_REJECTS.md: הסוכן האוטונומי יבטל את הקומיט (revert), יבדוק ויעדכן אותך. הלוח עצמו לא משנה את הקוד.',
  };
}

// ---- tree() ---------------------------------------------------------------------------------------
const MAX_DEPTH = 4, MAX_CHILDREN = 200;

export function firstParagraph(md) {
  const text = md.replace(/```[\s\S]*?```/g, '\n\n').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '');
  for (const para of text.split(/\n\s*\n/)) {
    const lines = para.split('\n').map((l) => l.trim()).filter(Boolean)
      .filter((l) => !/^(#|\||[-*_]{3,}$|!\[)/.test(l));
    if (!lines.length) continue;
    const clean = lines.join(' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^>\s*/, '').replace(/(\*\*|__|\*|`)/g, '').replace(/\s+/g, ' ').trim();
    if (!clean) continue;
    return clean.length > 300 ? `${clean.slice(0, 299)}…` : clean;
  }
  return null;
}

function npmLinks(pkgText) {
  let pkg;
  try { pkg = JSON.parse(pkgText); } catch { return []; }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  return Object.entries(deps).filter(([, v]) => !String(v).startsWith('workspace:'))
    .map(([name]) => ({ label: `npm: ${name}`, url: `https://www.npmjs.com/package/${name}` }));
}

export async function tree() {
  try {
    const live = await liveRef();
    const paths = (await git(['ls-tree', '-r', '-z', '--name-only', live])).split('\0').filter(Boolean);
    const fileSet = new Set(paths);
    const root = { name: '', path: '', files: 0, kids: new Map() };
    for (const p of paths) {
      const segs = p.split('/');
      let node = root;
      node.files++;
      for (let i = 0; i < segs.length - 1; i++) {
        let next = node.kids.get(segs[i]);
        if (!next) node.kids.set(segs[i], (next = { name: segs[i], path: segs.slice(0, i + 1).join('/'), files: 0, kids: new Map() }));
        next.files++;
        node = next;
      }
    }

    // Nodes that will be shown, so README / package.json are read only for them.
    const shown = [];
    (function walk(n, depth) {
      shown.push(n);
      if (depth >= MAX_DEPTH) return;
      [...n.kids.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_CHILDREN).forEach((k) => walk(k, depth + 1));
    })(root, 0);
    const want = [];
    for (const n of shown) for (const f of ['README.md', 'package.json']) {
      const p = n.path ? `${n.path}/${f}` : f;
      if (fileSet.has(p)) want.push(p);
    }
    const blobs = await catBatch(want.map((p) => `${live}:${p}`));
    const blob = new Map(want.map((p, i) => [p, blobs[i]]));
    const folders = readJson(FOLDERS_PATH, {});

    const build = (n, depth) => {
      const at = (f) => blob.get(n.path ? `${n.path}/${f}` : f);
      const meta = folders[n.path] || {};
      const readme = at('README.md');
      const pkg = at('package.json');
      const out = { name: n.name || 'Apple', path: n.path, files: n.files, he: meta.he ?? null, en: meta.en ?? null,
        readme: readme ? firstParagraph(readme) : null,
        docs: [...(meta.docs || []), ...(pkg ? npmLinks(pkg) : [])], dirs: [] };
      const kids = [...n.kids.values()].sort((a, b) => a.name.localeCompare(b.name));
      if (depth >= MAX_DEPTH) {
        if (kids.length) out.hiddenDirs = kids.length;
        return out;
      }
      out.dirs = kids.slice(0, MAX_CHILDREN).map((k) => build(k, depth + 1));
      if (kids.length > MAX_CHILDREN) {
        out.more = kids.length - MAX_CHILDREN;
        out.moreLabel = `ועוד ${out.more}`;
      }
      return out;
    };
    const liveSha = (await git(['rev-parse', live])).trim();
    return { ok: true, fetchedAt: now(), live: { ref: live, sha: liveSha }, totalFiles: paths.length, root: build(root, 0) };
  } catch (e) {
    return fail(`לא הצלחתי לקרוא את מבנה התיקיות של הגרסה החיה: ${String(e.message || e).split('\n')[0]}`);
  }
}

// The project half of the owner's dashboard. Every number is read at collection time from the
// repository's own source of truth: the acceptance gate, the findings and owner-queue ledgers, the
// model registry, the training runs, and the libraries' own modules (bundled and executed, so a count
// is the length of the real array, not a regex's guess). The only hand-kept file is
// docs/autonomy/vision-status.json, the ledger of the owner's vision.
//
// A source that could not be read comes back as null or { error }, and the page shows "not measured"
// for it. A failure to look must not render as a zero.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';

export const MEDIA_ROOTS = {
  gauntlet: 'docs/gauntlet/visual',
  evidence: 'docs/evidence',
  autonomy: 'docs/autonomy/evidence',
  site: 'apps/site/public',
  studioicons: 'apps/web/src/assets/studio-icons',
  library: 'packages/asset-library',
};
// A sprite pack and 500 synthetic pixel-probe fixtures: images, but not pictures of the product.
const MEDIA_SKIP = [/^evidence\/pixels\//, /^site\/assets\/wall\//];
const IMAGE = /\.(png|jpe?g|webp|gif)$/i;

const HF_AUTHOR = 'moshebarami';
const HEALTH_URL = 'https://apple.moshe-barami111.workers.dev/api/health';
const LANGFLOW = 'http://localhost:7860';

const sh = (cmd, args, opts = {}) => new Promise((resolve) => {
  execFile(cmd, args, { maxBuffer: 64 << 20, timeout: 180000, ...opts }, (err, stdout, stderr) =>
    resolve({ ok: !err, stdout: String(stdout || ''), stderr: String(stderr || '') }));
});
const readText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const statOf = (p) => fs.statSync(p, { throwIfNoEntry: false });
const clip = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);
const demd = (s) => s.replace(/\*\*|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

// ---- Slow sources: refreshed in the background, never awaited by a collection -----------------
// A collection returns whatever the last refresh produced (null before the first one), so HF or
// wrangler being slow never holds the page back; `onLate` asks the server to re-collect when one
// lands.
const slowCache = new Map();
let onLate = null;
function slow(key, ttlMs, fn) {
  let e = slowCache.get(key);
  if (!e) slowCache.set(key, (e = { value: null, at: 0, running: false }));
  if (!e.running && Date.now() - e.at > ttlMs) {
    e.running = true;
    Promise.resolve().then(fn).then(
      (v) => { e.value = v; },
      (err) => { e.value = { error: clip(String(err?.message || err), 200) }; },
    ).finally(() => { e.at = Date.now(); e.running = false; onLate?.(); });
  }
  return e.value;
}

// Line counts of big files, cached by size and mtime so a 3 GB corpus is counted once.
const lineCache = new Map();
async function lines(p) {
  const st = statOf(p);
  if (!st) return null;
  const k = `${st.size}|${st.mtimeMs}`, hit = lineCache.get(p);
  if (hit?.k === k) return hit.n;
  const r = await sh('wc', ['-l', p]);
  const n = r.ok ? Number(r.stdout.trim().split(/\s+/)[0]) : null;
  lineCache.set(p, { k, n });
  return n;
}

function walk(dir, visit, depth = 0) {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (depth < 8) walk(p, visit, depth + 1); } else visit(p);
  }
}

// ---- Acceptance ----------------------------------------------------------------------------------
const FLAG_HE = {
  deterministic_gates_green: 'כל הבדיקות האוטומטיות ירוקות',
  production_deployed: 'הגרסה עלתה לאוויר',
  production_bytes_verified: 'וידאתי שהאתר מגיש בדיוק את מה שהעליתי',
  signed_in_browser_qa: 'בדיקה כמשתמש מחובר בדפדפן',
  mobile_qa: 'בדיקה בטלפון',
  real_studio_end_to_end: 'בנייה אמיתית בסטודיו מתחילה ועד סוף',
  studio_readback_verified: 'קריאה חוזרת מהסטודיו אחרי בנייה',
  follow_up_edit_verified: 'עריכת המשך עובדת',
  failure_recovery_verified: 'התאוששות מתקלה',
  database_security_verified: 'אבטחת מסד הנתונים',
  production_error_reviewed: 'עברתי על השגיאות בייצור',
};
const MISSION_HE = {
  gameplay_loop_from_baseplate: 'משחק שלם מבייספלייט ריק',
  visually_ambitious_environment: 'סביבה מרשימה ויזואלית',
  scripts_networking_ui: 'סקריפטים, רשת וממשק',
  modify_existing_project: 'שינוי פרויקט קיים',
  debug_broken_experience: 'תיקון משחק שבור',
  follow_up_change: 'שינוי המשך',
  playtest_inspect_repair: 'בדיקת משחק, איתור ותיקון',
};

async function gate(repo) {
  const r = await sh('python3', ['scripts/autonomy-review-gate.py'], { cwd: repo });
  const out = r.stdout.split('\n');
  if (!/^ACCEPTANCE/.test(out[0] || '')) return null;
  return { met: /^ACCEPTANCE MET/.test(out[0]), headline: out[0], unmet: out.filter((l) => l.startsWith('  - ')).map((l) => l.slice(4)) };
}

function acceptance(repo, findings) {
  const a = readJson(path.join(repo, 'docs/autonomy/ACCEPTANCE.json'));
  if (!a) return null;
  const flags = Object.entries(FLAG_HE).map(([key, label]) => ({ key, label, ok: a[key] === true }));
  const missions = Object.entries(a.missions || {}).map(([key, v]) => ({ key, label: MISSION_HE[key] || key, ok: v === true }));
  const reviews = { fresh: a.fresh_reviews_without_material_blocker ?? 0, required: a.required_fresh_reviews_without_material_blocker ?? 3 };
  // Criticals and highs are counted from the findings ledger, as the gate counts them — the
  // JSON's own copies of those numbers go stale.
  const crit = findings ? findings.open.filter((f) => f.sev === 'critical').length : null;
  const high = findings ? findings.open.filter((f) => f.sev === 'high').length : null;
  const items = [
    ...flags, ...missions,
    ...Array.from({ length: reviews.required }, (_, i) => ({ key: `review${i + 1}`, label: `ביקורת חיצונית נקייה ${i + 1} מתוך ${reviews.required}`, ok: i < reviews.fresh })),
    { key: 'critical', label: 'אין תקלות קריטיות פתוחות', ok: crit === 0 },
    { key: 'high', label: 'אין תקלות חמורות פתוחות', ok: high === 0 },
  ];
  return { flags, missions, reviews, items, done: items.filter((i) => i.ok).length, total: items.length };
}

function findingsOf(repo) {
  const md = readText(path.join(repo, 'docs/autonomy/CUSTOMER_FINDINGS.md'));
  if (!md) return null;
  const re = /^- \[(open|closed)\]\[(critical|high|medium|low)\] (F-\d+): (.*)$/;
  const rank = { critical: 0, high: 1, medium: 2, low: 3 };
  const all = [];
  for (const line of md.split('\n')) {
    const m = re.exec(line);
    if (m) all.push({ status: m[1], sev: m[2], id: m[3], text: clip(demd(m[4].split(' — evidence:')[0]), 360) });
  }
  const bySev = {};
  for (const f of all) (bySev[f.sev] ||= { open: 0, closed: 0 })[f.status]++;
  const open = all.filter((f) => f.status === 'open').sort((x, y) => rank[x.sev] - rank[y.sev]);
  return { total: all.length, closed: all.length - open.length, open, bySev };
}

function ownerQueue(repo) {
  const md = readText(path.join(repo, 'docs/autonomy/OWNER_QUEUE.md'));
  if (!md) return null;
  const out = [];
  for (const line of md.split('\n')) {
    const m = /^- \[(open|done)\] (Q-\d+): (.*)$/.exec(line);
    if (!m) continue;
    const [step, rest = ''] = m[3].split(' — why: ');
    const [why, blocks = 'none'] = rest.split(' — Blocks findings: ');
    out.push({ status: m[1], id: m[2], step: clip(demd(step), 300), why: clip(demd(why), 300), blocks: blocks.trim() });
  }
  return out;
}

function nextAction(repo) {
  const md = readText(path.join(repo, 'docs/autonomy/NEXT_ACTION.md'));
  if (!md) return null;
  const headline = /\*\*(.+?)\*\*/s.exec(md)?.[1]?.replace(/\s+/g, ' ');
  const steps = [];
  let cur = null;
  for (const line of md.split('\n')) {
    const m = /^(\d+)\. (.*)$/.exec(line);
    if (m) steps.push((cur = { n: Number(m[1]), text: m[2] }));
    else if (cur && /^\s{2,}\S/.test(line)) cur.text += ` ${line.trim()}`;
    else cur = null;
  }
  return { headline, steps: steps.map((s) => ({ n: s.n, text: clip(demd(s.text), 420) })) };
}

// ---- Git and production ------------------------------------------------------------------------
async function gitOf(repo) {
  const log = await sh('git', ['log', '-80', '--format=%h%x1f%ct%x1f%s'], { cwd: repo });
  if (!log.ok) return null;
  const commits = log.stdout.trim().split('\n').filter(Boolean).map((l) => {
    const [h, t, s] = l.split('\x1f');
    return { h, t: Number(t) * 1000, s };
  });
  const st = await sh('git', ['status', '--porcelain'], { cwd: repo });
  const day = Date.now() - 86400000;
  return { head: commits[0]?.h ?? null, dirty: st.ok ? st.stdout.split('\n').filter(Boolean).length : null, last24h: commits.filter((c) => c.t > day).length, commits: commits.slice(0, 60) };
}

async function prodOf(repo) {
  const r = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(8000) });
  const j = await r.json();
  const sha = String(j.buildSha || '').replace(/-dirty$/, '');
  const behind = sha ? await sh('git', ['rev-list', '--count', `${sha}..HEAD`], { cwd: repo }) : { ok: false };
  return { ok: r.ok, buildSha: j.buildSha ?? null, dirtyBuild: /-dirty$/.test(j.buildSha || ''), behind: behind.ok ? Number(behind.stdout.trim()) : null, checkedAt: Date.now() };
}

// ---- Screenshots ---------------------------------------------------------------------------------
const GROUP_HE = {
  'gauntlet/refs': 'המשחק האמיתי (תמונות ייחוס)',
  'gauntlet/rounds': 'השוואות Apple MAX מול המשחק האמיתי',
  'evidence/ui-showcase': 'מסכי UI שנבנו בסטודיו',
  'evidence/map-showcase': 'מפות שנבנו בסטודיו',
  'evidence/2026-09-22-browser-qa': 'בדיקות האתר והאפליקציה',
  'evidence/frames': 'פריימים מהתוסף',
  'site/browser-qa': 'בדיקות האתר',
  'site/assets': 'תמונות באתר',
  studioicons: 'אייקוני סטודיו',
  library: 'ספריות UI חדשות',
};
function screenshotsOf(repo) {
  const out = [];
  for (const [root, rel] of Object.entries(MEDIA_ROOTS)) {
    const base = path.join(repo, rel);
    walk(base, (abs) => {
      const r = path.relative(base, abs).split(path.sep).join('/');
      if (!IMAGE.test(r) || MEDIA_SKIP.some((re) => re.test(`${root}/${r}`))) return;
      const st = statOf(abs);
      if (!st || st.size < 4000) return;
      const seg = r.includes('/') ? `${root}/${r.split('/')[0]}` : root;
      out.push({
        url: `/media/${root}/${r.split('/').map(encodeURIComponent).join('/')}`,
        title: path.basename(r).replace(IMAGE, '').replace(/[-_]+/g, ' '),
        group: GROUP_HE[seg] || GROUP_HE[root] || 'הוכחות',
        mtime: st.mtimeMs, bytes: st.size,
      });
    });
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return { total: out.length, items: out.slice(0, 200) };
}

function gauntletOf(repo) {
  const dir = path.join(repo, 'docs/gauntlet/visual');
  const rounds = (() => { try { return fs.readdirSync(path.join(dir, 'rounds')); } catch { return []; } })()
    .map((n) => ({ n, m: /^round-(\d+)-compare\.jpe?g$/.exec(n) })).filter((x) => x.m)
    .map((x) => ({ round: Number(x.m[1]), url: `/media/gauntlet/rounds/${x.n}`, mtime: statOf(path.join(dir, 'rounds', x.n))?.mtimeMs }))
    .sort((a, b) => a.round - b.round);
  const refs = (() => { try { return fs.readdirSync(path.join(dir, 'refs')); } catch { return []; } })()
    .filter((n) => IMAGE.test(n) && !n.startsWith('apple-max'))
    .map((n) => `/media/gauntlet/refs/${encodeURIComponent(n)}`);
  // A round passes when the blind critic cannot tell ours from the real game; the verdicts land here.
  const verdicts = readJson(path.join(dir, 'verdicts.json'));
  return { rounds, refs, passes: Array.isArray(verdicts) ? verdicts.filter((v) => v.fooled).length : 0, latest: rounds.at(-1) ?? null };
}

// ---- Facts that live inside TypeScript modules -------------------------------------------------
// Bundled with the worker's esbuild and run once, so every count is the real array's length.
async function codeFacts(repo) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'owner-dash-'));
  const abs = (p) => JSON.stringify(path.join(repo, p));
  const entry = path.join(tmp, 'probe.ts'), outfile = path.join(tmp, 'probe.mjs');
  fs.writeFileSync(entry, `
import { toolNames } from ${abs('apps/worker/src/tools.ts')};
import { CREATOR_SKILLS } from ${abs('apps/worker/src/creator-skills.ts')};
import { MECHANIC_PATTERNS } from ${abs('apps/worker/src/mechanics.ts')};
import { GENRE_KIT_IDS } from ${abs('apps/worker/src/genre-kits.ts')};
import { MODEL_REGISTRY, TIER_FOR_PLAN } from ${abs('packages/shared/src/models.ts')};
import { ICON_PATH } from ${abs('apps/web/src/components/icons.ts')};
import { STUDIO_ICON_CLASSES } from ${abs('apps/web/src/components/studio-icon-model.ts')};
const skillDomains = {};
for (const s of CREATOR_SKILLS) skillDomains[s.domain] = (skillDomains[s.domain] || 0) + 1;
console.log(JSON.stringify({
  tools: toolNames(), skills: CREATOR_SKILLS.length, skillDomains, mechanics: MECHANIC_PATTERNS.length,
  kits: [...GENRE_KIT_IDS], tierForPlan: TIER_FOR_PLAN,
  models: MODEL_REGISTRY.map((m) => ({ id: m.id, displayName: m.displayName, blurb: m.blurb, vendor: m.vendor,
    providerModelId: m.providerModelId, tier: m.tier, route: m.route, creditMultiplier: m.creditMultiplier, lora: m.lora ?? null })),
  webIcons: Object.keys(ICON_PATH).length, studioIcons: STUDIO_ICON_CLASSES.length,
}));`);
  try {
    const b = await sh(path.join(repo, 'apps/worker/node_modules/.bin/esbuild'),
      [entry, '--bundle', '--platform=node', '--format=esm', '--log-level=error', '--external:cloudflare:*', `--outfile=${outfile}`], { cwd: repo });
    if (!b.ok) throw new Error(`bundle failed: ${clip(b.stderr, 200)}`);
    const r = await sh(process.execPath, [outfile], { cwd: tmp });
    if (!r.ok) throw new Error(`probe failed: ${clip(r.stderr, 200)}`);
    return JSON.parse(r.stdout.trim().split('\n').at(-1));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Files and lines per package, from the tracked files only.
async function codeSizes(repo) {
  const r = await sh('git', ['ls-files', '-z', 'apps', 'packages'], { cwd: repo });
  if (!r.ok) return null;
  const SRC = /\.(ts|tsx|mjs|js|py|luau|lua|astro|css)$/;
  const pk = new Map();
  for (const f of r.stdout.split('\0')) {
    if (!SRC.test(f) || /\/(dist|node_modules|raw|data|adapters)\//.test(f)) continue;
    const [top, name] = f.split('/');
    const key = `${top}/${name}`;
    let n = 0;
    try { const buf = fs.readFileSync(path.join(repo, f)); for (let i = 0; i < buf.length; i++) if (buf[i] === 10) n++; } catch { continue; }
    const e = pk.get(key) || { name: key, files: 0, lines: 0 };
    e.files++; e.lines += n; pk.set(key, e);
  }
  return [...pk.values()].sort((a, b) => b.lines - a.lines);
}

function countKeys(src, open) {
  // Keys of a top-level object literal in a non-TS file (a Luau table, an Astro frontmatter object).
  const start = src.indexOf(open);
  if (start < 0) return null;
  const body = src.slice(start + open.length, src.indexOf('\n}', start));
  return (body.match(/^[\t ]+[A-Za-z_][\w]*\s*[:=]/gm) || []).length;
}

async function libraries(repo, facts) {
  const C = (p) => path.join(repo, 'packages/corpus/data', p);
  const len = (p, key) => { const j = readJson(C(p)); const v = key ? j?.[key] : j; return Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : null; };
  const files = (dir, re = /./, depth = 1) => { let n = 0; const d0 = path.join(repo, dir); walk(d0, (p) => { if (re.test(p) && path.relative(d0, p).split(path.sep).length <= depth) n++; }); return n; };
  const glyphs = countKeys(readText(path.join(repo, 'apps/site/src/components/ObjectIcon.astro')) || '', 'const GLYPHS = {');
  const handlers = countKeys(readText(path.join(repo, 'apps/apple-plugin/src/Commands.luau')) || '', '\nHANDLERS = {');
  const witness = readJson(C('chunks-witness.json'));
  const shot = (p) => `/media/evidence/${p}`;
  const f = facts && !facts.error ? facts : null;
  const newPacks = readJson(path.join(repo, 'packages/asset-library/manifest.json'));
  return [
    { id: 'tools', cat: 'סוכן', name: 'כלים של הסוכן', what: 'כל מה ש-Apple יכול לעשות בסטודיו: לקרוא, לבנות, לבדוק, להריץ ולתקן', count: f?.tools.length ?? null, unit: 'כלים', forAgent: true, sample: f?.tools.slice(0, 40), path: 'apps/worker/src/tools.ts' },
    { id: 'skills', cat: 'סוכן', name: 'מדריכי בנייה', what: 'מדריכים קצרים שהסוכן קורא לפני שהוא בונה משהו, לפי תחום', count: f?.skills ?? null, unit: 'מדריכים', forAgent: true, breakdown: f?.skillDomains, path: 'apps/worker/src/creator-skills.ts' },
    { id: 'mechanics', cat: 'סוכן', name: 'דפוסי מכניקה בדוקים', what: 'חנות, מטבעות, נקודות שמירה, לוח מובילים ועוד, כקוד שנבדק', count: f?.mechanics ?? null, unit: 'דפוסים', forAgent: true, path: 'apps/worker/src/mechanics.ts' },
    { id: 'kits', cat: 'UI', name: "ערכות UI לפי ז'אנר", what: 'צבעים, תאורה, צלילים ומסכים לכל סוג משחק', count: f?.kits.length ?? null, unit: 'ערכות', forAgent: true, sample: f?.kits, extra: `${len('kit-pins.json', 'pins') ?? '?'} צלילים נבחרים`, previews: [shot('ui-showcase/screen-hud--horror.png'), shot('ui-showcase/screen-shop--tycoon.png'), shot('map-showcase/map--racing.png')], path: 'apps/worker/src/genre-kits.ts' },
    { id: 'uiConstruction', cat: 'UI', name: 'איך בונים כל מסך', what: 'מבנה של מסכי משחק (חנות, מלאי, תפריט, HUD) לכל ז\'אנר', count: len('ui-construction.json', 'screens'), unit: 'מסכים', extra: `${len('ui-construction.json', 'genres') ?? '?'} ז'אנרים · ${files('packages/corpus/data/ui-references', /\.json$/)} קובצי ייחוס`, forAgent: true, previews: [shot('ui-showcase/screen-gacha--tycoon--opened.png')], path: 'packages/corpus/data/ui-construction.json' },
    { id: 'styles', cat: 'UI', name: 'סגנונות ויזואליים', what: 'איך נראים סגנונות אמיתיים של משחקי רובלוקס, כנתונים שהסוכן משווה אליהם', count: len('style-visual-evidence.json', 'styles'), unit: 'סגנונות', forAgent: true, path: 'packages/corpus/data/style-visual-evidence.json' },
    { id: 'showcase', cat: 'UI', name: 'מסכים ומפות שנבנו', what: 'מסכי UI ומפות אמיתיים שנבנו בסטודיו ונשמרו כתמונה', count: files('docs/evidence/ui-showcase', /\.png$/) + files('docs/evidence/map-showcase', /\.png$/), unit: 'תמונות', forSite: true, previews: [shot('ui-showcase/screen-shop--tycoon.png'), shot('map-showcase/map--fps_arena.png')], path: 'docs/evidence/ui-showcase' },
    { id: 'studioIcons', cat: 'אייקונים', name: 'אייקוני סטודיו', what: 'האייקונים של רובלוקס סטודיו לכל סוג אובייקט, בשני מצבי צבע', count: f?.studioIcons ?? null, unit: 'אייקונים × 2 ערכות צבע', forSite: true, previews: ['/media/studioicons/studio-icons-dark.png'], path: 'apps/web/src/assets/studio-icons' },
    { id: 'webIcons', cat: 'אייקונים', name: 'אייקוני האפליקציה', what: 'האייקונים של ממשק האפליקציה', count: f?.webIcons ?? null, unit: 'אייקונים', forSite: true, path: 'apps/web/src/components/icons.ts' },
    { id: 'siteGlyphs', cat: 'אייקונים', name: 'אייקוני האתר', what: 'אייקוני הקו של האתר השיווקי', count: glyphs, unit: 'אייקונים', forSite: true, path: 'apps/site/src/components/ObjectIcon.astro' },
    { id: 'components', cat: 'UI', name: 'רכיבי ממשק לאתר ולאפליקציה', what: 'כפתורים, צ\'אט, כרטיסים ועוד (כולל AI Elements של Vercel)', count: files('apps/web/src/components', /\.(tsx|ts)$/, 9), unit: 'קבצים', extra: `${files('apps/web/src/components/ai-elements', /\.tsx$/)} רכיבי AI Elements · ${files('apps/site/src/components', /./, 9)} רכיבי אתר`, forSite: true, path: 'apps/web/src/components' },
    { id: 'plugin', cat: 'סוכן', name: 'פקודות התוסף בסטודיו', what: 'הפעולות שהתוסף מבצע בתוך הסטודיו בשביל הסוכן', count: handlers, unit: 'פקודות', extra: `${files('apps/apple-plugin/src/ops', /\.luau$/)} מודולים נוספים`, forAgent: true, path: 'apps/apple-plugin/src/Commands.luau' },
    { id: 'templates', cat: 'ידע', name: 'תבניות משחק', what: 'תבניות שנאספו ממאגרי קוד פתוחים', count: len('template-seeds.json', 'templates'), unit: 'תבניות', forAgent: true, path: 'packages/corpus/data/template-seeds.json' },
    { id: 'packages', cat: 'ידע', name: 'חבילות קוד של רובלוקס', what: 'אינדקס של חבילות Luau (Wally ועוד)', count: len('registry-packages.json', 'packages'), unit: 'חבילות', forAgent: true, path: 'packages/corpus/data/registry-packages.json' },
    { id: 'modules', cat: 'ידע', name: 'מודולים מאומתים', what: 'מודולי קוד שנבדקו ומותר להכניס למשחק', count: len('verified-modules.json', 'modules'), unit: 'מודולים', forAgent: true, path: 'packages/corpus/data/verified-modules.json' },
    { id: 'mechanicLib', cat: 'ידע', name: 'ספריית מכניקות', what: 'מכניקות שנבחרו מתוך אלפי מאגרים', count: len('mechanic-library.json', 'entries'), unit: 'מכניקות', forAgent: true, path: 'packages/corpus/data/mechanic-library.json' },
    { id: 'sources', cat: 'ידע', name: 'מקורות', what: 'רישום של כל מקור ידע ומה הרישיון שלו', count: len('sources.json', 'records'), unit: 'מקורות', path: 'packages/corpus/data/sources.json' },
    { id: 'docs', cat: 'ידע', name: 'תיעוד רובלוקס לחיפוש', what: 'קטעים מתוך התיעוד הרשמי של רובלוקס, שהסוכן מחפש בהם', count: await lines(C('chunks.jsonl')), unit: 'קטעים', extra: `${witness?.documentCount ?? '?'} מסמכי מקור`, forAgent: true, path: 'packages/corpus/data/chunks.jsonl' },
    { id: 'assets3d', cat: 'נכסים', name: 'מודלים תלת-ממדיים', what: 'לא נשמרים מראש: נוצרים בזמן אמת בקוד, במחולל של רובלוקס או מחנות הנכסים', count: 0, unit: 'קבצים שמורים', forAgent: true, path: 'apps/worker/src/assets.ts' },
    ...(Array.isArray(newPacks?.packs) ? newPacks.packs.map((p) => ({ id: `pack:${p.id}`, cat: 'חבילות חדשות', name: p.name, what: p.what || p.source, count: p.files ?? null, unit: 'קבצים', license: p.license, forAgent: !!p.forAgent, forSite: !!p.forSite, previews: (p.previews || []).map((x) => `/media/library/${x}`), path: `packages/asset-library/${p.dir || p.id}` })) : []),
  ];
}

// ---- Training ------------------------------------------------------------------------------------
function adaptersOf(repo) {
  const dir = path.join(repo, 'packages/training/adapters');
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => statOf(path.join(dir, n))?.isDirectory()); } catch { return null; }
  return names.map((n) => {
    const d = path.join(dir, n), cfg = readJson(path.join(d, 'adapter_config.json')) || {};
    const fl = fs.readdirSync(d);
    const ckpts = fl.map((f) => /^(\d+)_adapters\.safetensors$/.exec(f)).filter(Boolean).map((m) => Number(m[1]));
    const ends = fl.filter((f) => f.endsWith('.safetensors')).map((f) => statOf(path.join(d, f))?.mtimeMs).filter(Boolean);
    const start = statOf(path.join(d, 'adapter_config.json'))?.mtimeMs ?? null;
    const end = ends.length ? Math.max(...ends) : null;
    const main = statOf(path.join(d, 'adapters.safetensors'));
    return {
      name: n, best: n.endsWith('-best'), base: cfg.model ?? null, rank: cfg.lora_parameters?.rank ?? null, layers: cfg.num_layers ?? null,
      itersPlanned: cfg.iters ?? null, itersReached: ckpts.length ? Math.max(...ckpts) : null, data: cfg.data ?? null,
      startedAt: start, endedAt: end, minutes: start && end && !n.endsWith('-best') ? Math.max(0, Math.round((end - start) / 60000)) : null,
      sizeMb: main ? Math.round(main.size / 1e5) / 10 : null,
    };
  }).sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
}

async function datasetsOf(repo) {
  const D = (p) => path.join(repo, 'packages/training/data', p);
  const split = async (dir) => ({ train: await lines(D(`${dir}/train.jsonl`)), val: await lines(D(`${dir}/val.jsonl`)), test: await lines(D(`${dir}/test.jsonl`)) });
  const R = 'roblox-research-v1-20260920/release';
  const sumDir = async (rel) => { let n = 0, any = false; const base = D(rel); const fl = []; walk(base, (p) => { if (p.endsWith('.jsonl')) fl.push(p); }); for (const p of fl) { const c = await lines(p); if (c != null) { n += c; any = true; } } return any ? n : null; };
  const hf = readJson(D('hf/REJECTED.json'));
  const gl = (() => { try { return fs.readdirSync(D('.')).filter((n) => n.startsWith('game-logic')); } catch { return []; } })();
  const synth = readJson(D('game-logic-synth-v1/examples.json')), rej = readJson(D('game-logic-synth-v1/rejects.json'));
  const gate = await split('.');
  return [
    { id: 'gate', name: 'סט האימון הנקי', what: 'קוד Luau מתוך מאגרים פתוחים עם רישיון שמתיר אימון', rows: (gate.train ?? 0) + (gate.val ?? 0) + (gate.test ?? 0), split: gate, source: 'GitHub', usedIn: 'v1–v4' },
    { id: 'trajectories', name: 'הדגמות שימוש בכלים', what: 'איך סוכן טוב משתמש בכלים צעד אחרי צעד', ...(await (async () => { const s = await split('tool-trajectories-v1'); return { rows: (s.train ?? 0) + (s.val ?? 0) + (s.test ?? 0), split: s }; })()), source: 'מקומי', usedIn: 'v4' },
    { id: 'gameLogic', name: 'לוגיקת משחק', what: 'בעיות לוגיקה (מטבעות, מלאי, זמנים) עם בדיקות שמריצות את הקוד', rows: gl.length, unit: 'אוספים', extra: synth ? `${Array.isArray(synth) ? synth.length : synth.examples?.length ?? '?'} דוגמאות סינתטיות שעברו בדיקה, ${Array.isArray(rej) ? rej.length : rej?.rejects?.length ?? '?'} נדחו` : null, source: 'מקומי', usedIn: 'v5 (מתוכנן)' },
    { id: 'github', name: 'מאגר GitHub הגדול', what: 'קוד רובלוקס מ-1,035 מאגרים', rows: await lines(D('roblox-github-v1/rows.jsonl')), extra: `${(await lines(D('roblox-github-v1/repos.jsonl'))) ?? '?'} מאגרים`, source: 'GitHub', usedIn: 'עוד לא' },
    { id: 'research', name: 'מאגר המחקר', what: 'קוד, דוגמאות אימון וידע מ-6 מקורות', rows: null, parts: { code: await sumDir(`${R}/code_candidates`), sft: await sumDir(`${R}/sft_candidates`), knowledge: await lines(D(`${R}/../release/knowledge/references.jsonl`)) }, source: 'GitHub, תיעוד, Hugging Face', usedIn: 'עוד לא (מחכה לאישור רישיונות)' },
    { id: 'hf', name: 'מאגרים מ-Hugging Face', what: 'מאגרים ציבוריים שנבדקו לרישיון ולאיכות', rows: Array.isArray(hf?.admitted) ? hf.admitted.length : null, unit: 'אושרו', extra: Array.isArray(hf?.rejected) ? `${hf.rejected.length} נדחו` : null, source: 'Hugging Face', usedIn: 'מבחנים' },
  ];
}

function frontierOf(repo) {
  const dir = path.join(repo, 'packages/training/runs');
  let fl = [];
  try { fl = fs.readdirSync(dir).filter((n) => /^roblox-frontier-.*\.json$/.test(n) && !/probe/.test(n)); } catch { return null; }
  const arms = new Map();
  for (const n of fl) {
    const j = readJson(path.join(dir, n));
    if (!j || typeof j.passed !== 'number') continue;
    const id = j.arm?.id || 'unknown';
    const a = arms.get(id) || { id, what: j.arm?.what ?? null, runs: 0, passed: 0, measured: 0, axes: {}, first: null, last: null };
    a.runs++; a.passed += j.passed; a.measured += j.measured;
    const t = Date.parse(j.measuredAt); if (t) { a.first = Math.min(a.first ?? t, t); a.last = Math.max(a.last ?? t, t); }
    for (const [ax, v] of Object.entries(j.byAxis || {})) {
      const e = (a.axes[ax] ||= { passed: 0, measured: 0 });
      e.passed += v.passed; e.measured += v.measured;
    }
    arms.set(id, a);
  }
  const list = [...arms.values()].map((a) => ({ ...a, pct: a.measured ? a.passed / a.measured : null })).sort((x, y) => (y.pct ?? 0) - (x.pct ?? 0));
  return { arms: list, best: list[0] ?? null };
}

function evalsOf(repo) {
  const R = (p) => readJson(path.join(repo, 'packages/training/runs', p));
  const prod = R('eval-production-SUMMARY.json'), v4 = R('eval-v4-scored.json'), cov = R('failure-coverage.json'), lib = R('library-yield.json');
  const frac = (s) => { const m = /(\d+)\s*\/\s*(\d+)/.exec(String(s || '')); return m ? { ok: Number(m[1]), n: Number(m[2]) } : null; };
  const tally = (side, dom) => { const t = v4?.tally?.[side]?.[dom]; return t ? { ok: t.ok, n: t.n } : null; };
  return {
    production: prod ? { at: prod.measuredAt ?? null, free1: frac(prod.headline?.freeLaneAgentPrompts1to24), free2: frac(prod.headline?.freeLaneAgentPrompts25to48), max: frac(prod.headline?.maxSuperAgentPrompts25to48) } : null,
    v4: v4 ? { trajectory: { base: tally('base', 'trajectory'), adapter: tally('adapter', 'trajectory') }, gameLogic: { base: tally('base', 'game-logic'), adapter: tally('adapter', 'game-logic') } } : null,
    failureCoverage: cov ? { pct: cov.coverage_percent, cited: cov.failures_cited_by_a_test, total: cov.documented_failures } : null,
    library: lib ? { modules: lib.moduleCount, honesty: lib.honesty } : null,
  };
}

function v5Of(repo) {
  const T = (p) => path.join(repo, 'packages/training', p);
  const y = readText(T('lora-apple-v5.yaml'));
  if (!y) return null;
  const get = (k) => new RegExp(`^${k}:\\s*"?([^"\\n#]+)"?`, 'm').exec(y)?.[1]?.trim() ?? null;
  const data = get('data'), adapter = get('adapter_path');
  return { base: get('model'), data, iters: Number(get('iters')) || null, dataReady: !!(data && statOf(T(data))), trained: !!(adapter && statOf(T(`${adapter}/adapters.safetensors`))) };
}

async function hfOf() {
  const py = `
import json
from huggingface_hub import HfApi
api = HfApi()
out = []
for kind, fn in (("model", api.list_models), ("dataset", api.list_datasets), ("space", api.list_spaces)):
    for r in fn(author=${JSON.stringify(HF_AUTHOR)}):
        lm = getattr(r, "last_modified", None) or getattr(r, "lastModified", None)
        out.append({"kind": kind, "id": r.id, "private": bool(getattr(r, "private", False)), "modified": str(lm) if lm else None, "downloads": getattr(r, "downloads", None), "likes": getattr(r, "likes", None)})
print(json.dumps(out))`;
  const r = await sh('python3', ['-c', py], { timeout: 60000 });
  if (!r.ok) throw new Error('Hugging Face did not answer');
  return JSON.parse(r.stdout.trim().split('\n').at(-1));
}

async function langflowOf(repo) {
  const get = async (p) => { try { const r = await fetch(LANGFLOW + p, { signal: AbortSignal.timeout(2500) }); return r.ok ? r.json() : null; } catch { return null; } };
  const version = await get('/api/v1/version'), health = await get('/health');
  let flows = 0;
  walk(path.join(repo, 'packages'), (p) => { if (/langflow/i.test(p) && p.endsWith('.json')) flows++; });
  return { running: !!health, version: version?.version ?? null, flowsInRepo: flows };
}

async function vectorizeOf(repo) {
  const r = await sh('npx', ['wrangler', 'vectorize', 'info', 'golem-docs', '--config', 'wrangler.apple.jsonc', '--json'], { cwd: path.join(repo, 'apps/worker'), timeout: 90000 });
  const json = /\{[\s\S]*\}/.exec(r.stdout)?.[0];
  const j = json ? JSON.parse(json) : null;
  if (typeof j?.vectorCount !== 'number') throw new Error('wrangler did not report the index');
  return { vectors: j.vectorCount, dimensions: j.dimensions ?? null, updated: j.processedUpToDatetime ?? null };
}

// ---- The whole snapshot ----------------------------------------------------------------------------
export async function collectProject(repo, hooks = {}) {
  onLate = hooks.onLate ?? onLate;
  const findings = findingsOf(repo);
  const facts = slow('codeFacts', 30 * 60000, () => codeFacts(repo));
  const [gateR, git, datasets, libs] = await Promise.all([gate(repo), gitOf(repo), datasetsOf(repo), libraries(repo, facts)]);
  const vision = readJson(path.join(repo, 'docs/autonomy/vision-status.json'));
  if (vision?.items && findings) {
    const f = vision.items.find((i) => i.status === 'live' && i.id === 'findings');
    if (f) { f.status = findings.open.length ? 'partial' : 'done'; f.detail = `${findings.closed} מתוך ${findings.total} תקלות נסגרו, ${findings.open.length} פתוחות`; }
  }
  return {
    collectedAt: Date.now(),
    gate: gateR,
    acceptance: acceptance(repo, findings),
    findings,
    queue: ownerQueue(repo),
    next: nextAction(repo),
    vision,
    git,
    prod: slow('prod', 2 * 60000, () => prodOf(repo)),
    screenshots: screenshotsOf(repo),
    gauntlet: gauntletOf(repo),
    code: { facts, sizes: slow('codeSizes', 60 * 60000, () => codeSizes(repo)) },
    libraries: libs,
    training: {
      adapters: adaptersOf(repo), datasets, frontier: frontierOf(repo), evals: evalsOf(repo), v5: v5Of(repo),
      hf: slow('hf', 10 * 60000, hfOf),
      langflow: slow('langflow', 60000, () => langflowOf(repo)),
      vectorize: slow('vectorize', 30 * 60000, () => vectorizeOf(repo)),
    },
  };
}

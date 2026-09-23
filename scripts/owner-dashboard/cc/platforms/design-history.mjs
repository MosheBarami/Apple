// GET /api/cc/design-history: how the site and the web app looked, from the first commit (when the
// product was Golem) to today. Three real sources: the commits that touched a style sheet, layout,
// design token, brand file or design doc (from the commits page's background walk, so no second
// pass over the history); every design screenshot on disk, placed at the commit that first added
// it; and the design entries of the two decision logs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { REPO } from '../http.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// The same URL the router's lazy loader uses, so this is the one commits module and its one walk.
const commitsModule = () => { const abs = path.join(HERE, 'commits.mjs'); return import(`${pathToFileURL(abs).href}?v=${fs.statSync(abs).mtimeMs}`); };
const readText = (p) => { try { return fs.readFileSync(path.join(REPO, p), 'utf8'); } catch { return null; } };
const mediaUrl = (p) => `/api/cc/media?p=${encodeURIComponent(p)}`;
const IMG = /\.(png|jpe?g|webp|gif|svg)$/i;

// Where design screenshots live, each with the folder's meaning.
const SHOT_DIRS = [
  { dir: 'apps/site/.qa', app: 'site', title: 'בדיקות QA של האתר' },
  { dir: 'apps/web/.qa', app: 'web', title: 'בדיקות QA של אפליקציית הווב' },
  { dir: 'docs/evidence/2026-09-22-browser-qa', app: 'both', title: 'סבב QA בדפדפן, 22.9' },
  { dir: 'apps/site/brand', app: 'site', title: 'קבצי המותג' },
  { dir: 'apps/site/public', app: 'site', title: 'נכסים ציבוריים של האתר', flat: true },
  { dir: 'apps/site/public/assets', app: 'site', title: 'תמונות שמוצגות באתר' },
  { dir: 'apps/web/src/assets', app: 'web', title: 'נכסי אפליקציית הווב' },
  { dir: 'docs/evidence', app: 'web', title: 'קטלוג באפליקציה', flat: true, match: /^catalog-/ },
  { dir: '.', app: 'site', title: 'צילומי מסך זמניים של האתר', flat: true, match: /^\.tmp-site-/ },
];

function listImages(dir, flat, match) {
  const abs = path.join(REPO, dir);
  let names;
  try { names = flat ? fs.readdirSync(abs) : fs.readdirSync(abs, { recursive: true }).map(String); } catch { return []; }
  return names.filter((n) => IMG.test(n) && (!match || match.test(path.basename(n))) && !/node_modules/.test(n)).map((n) => path.posix.join(dir === '.' ? '' : dir, n.split(path.sep).join('/')));
}

const dateInPath = (p) => /(20\d\d-\d\d-\d\d)/.exec(p)?.[1] || null;

// "## ADR-001 — Brand: "Golem"" / "## D-UI-GREEN-1 — ... (2026-09-23, ...)": the entries whose title
// is about the look of the product.
const DESIGN_TITLE = /\b(brand|design|visual direction|palette|colou?r|font|typeface|typography|logo|landing|layout|theme|mascot|green means|look)\b|עיצוב|מותג/i;
function decisions(file) {
  const s = readText(file);
  if (s == null) return [];
  const out = [];
  const parts = s.split(/^## /m).slice(1);
  let i = 0;
  for (const part of parts) {
    i++;
    const nl = part.indexOf('\n');
    const title = part.slice(0, nl < 0 ? undefined : nl).trim();
    const body = nl < 0 ? '' : part.slice(nl + 1).trim();
    if (!DESIGN_TITLE.test(title)) continue;
    out.push({ file, order: i, id: /^([A-Z]+-[A-Z0-9-]*\d+|ADR-\d+)/.exec(title)?.[1] || null, title, date: dateInPath(title) || dateInPath(body.slice(0, 200)),
      text: body.replace(/\n{3,}/g, '\n\n').slice(0, 900), long: body.length > 900 });
  }
  return out;
}

function designDocs() {
  const names = [];
  try { for (const n of fs.readdirSync(path.join(REPO, 'docs'))) if (/^(DESIGN-|FRESH-PUBLIC-DESIGN|ROBLOX-STYLE-SPEC|THINKING-UX|palette-split)/.test(n) && n.endsWith('.md')) names.push(`docs/${n}`); } catch { /* none */ }
  try { for (const n of fs.readdirSync(path.join(REPO, 'docs/design'))) if (n.endsWith('.md')) names.push(`docs/design/${n}`); } catch { /* none */ }
  return names.map((p) => {
    const s = readText(p) || '';
    const lead = s.split('\n\n').map((x) => x.trim()).find((x) => x && !x.startsWith('#') && !x.startsWith('|') && !x.startsWith('```') && !x.startsWith('>')) || '';
    return { path: p, title: /^#\s+(.+)$/m.exec(s)?.[1]?.trim() || path.basename(p), lead: lead.replace(/\s+/g, ' ').slice(0, 360) };
  });
}

// What kind of design change a path is.
const kindOf = (f) => (IMG.test(f) && /\.qa\/|browser-qa|catalog-|\.tmp-/.test(f) ? 'shot'
  : /\.css$|tailwind|\/design\//.test(f) ? 'style' : /layouts\//.test(f) ? 'layout' : /brand\/|public\//.test(f) ? 'brand' : /^docs\//.test(f) ? 'doc' : 'style');

export async function designHistory() {
  const cm = await commitsModule();
  const [{ commits, scanned, total }, seen] = await Promise.all([cm.designTouches(), cm.firstSeen()]);
  const list = (await cm.commits(new URLSearchParams('per=10&page=999999'))).items; // the oldest page: the first commit
  const first = list.at(-1) || null;
  const rename = (await cm.commits(new URLSearchParams('q=rename the product to apple&per=10'))).items.at(-1) || null;
  const eraOf = (at) => (rename && at < rename.at ? 'golem' : 'apple');

  const timeline = commits.map((c) => {
    const kinds = {};
    for (const f of c.files) { const k = kindOf(f); kinds[k] = (kinds[k] || 0) + 1; }
    const apps = [...new Set(c.files.map((f) => (/^apps\/site\//.test(f) ? 'site' : /^apps\/web\//.test(f) ? 'web' : 'docs')))];
    return { sha: c.sha, at: c.at, subject: c.subject, author: c.author, agents: c.agents, era: eraOf(c.at), kinds, apps,
      files: c.files.slice(0, 14), more: Math.max(0, c.files.length - 14), shots: c.files.filter((f) => IMG.test(f) && kindOf(f) === 'shot').slice(0, 8).map((p) => ({ path: p, url: mediaUrl(p) })) };
  });

  const shots = [];
  const taken = new Set();
  for (const g of SHOT_DIRS) {
    for (const p of listImages(g.dir, g.flat, g.match)) {
      if (taken.has(p)) continue; taken.add(p);
      let st; try { st = fs.statSync(path.join(REPO, p)); } catch { continue; }
      const git = seen.seen.get(p);
      const inPath = dateInPath(p);
      const at = git?.at || (inPath ? `${inPath}T12:00:00` : st.mtime.toISOString());
      shots.push({ path: p, url: mediaUrl(p), group: g.title, app: g.app, folder: path.posix.dirname(p), name: path.basename(p),
        at, dateFrom: git ? 'git' : inPath ? 'name' : 'mtime', commit: git ? { sha: git.sha, subject: git.subject } : null, era: eraOf(at), kb: Math.round(st.size / 1024) });
    }
  }
  shots.sort((a, b) => (a.at < b.at ? 1 : -1));

  return {
    era: {
      golem: first ? { from: first.at, to: rename?.at ?? null, firstCommit: { sha: first.sha, subject: first.subject } } : null,
      apple: rename ? { from: rename.at, commit: { sha: rename.sha, subject: rename.subject } } : null,
    },
    progress: { scanned, total, complete: scanned >= total },
    timeline, shots,
    decisions: [...decisions('docs/DECISIONS.md'), ...decisions('docs/autonomy/DECISIONS.md')],
    docs: designDocs(),
    counts: { commits: timeline.length, shots: shots.length, shotsDatedByGit: shots.filter((s) => s.dateFrom === 'git').length },
  };
}

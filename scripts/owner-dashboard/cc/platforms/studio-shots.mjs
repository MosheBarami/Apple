// GET /api/cc/studio-shots: every Roblox Studio screenshot in the repository, grouped by the round,
// test or folder it belongs to. Captions come from the notes beside the images (a README or report
// line that names the file), else from the file name. Each group says honestly what its images are:
// a real Studio capture, a geometry render made without Studio, or a reference from another game.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { REPO } from '../http.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const commitsModule = () => { const abs = path.join(HERE, 'commits.mjs'); return import(`${pathToFileURL(abs).href}?v=${fs.statSync(abs).mtimeMs}`); };
const readText = (p) => { try { return fs.readFileSync(path.join(REPO, p), 'utf8'); } catch { return null; } };
const mediaUrl = (p) => `/api/cc/media?p=${encodeURIComponent(p)}`;
const IMG = /\.(png|jpe?g|webp|gif)$/i;

export const KIND_HE = {
  studio: 'צילום אמיתי מתוך Roblox Studio',
  render: 'רינדור גאומטרי שנבנה בלי Studio',
  reference: 'תמונת ייחוס ממשחק אחר, לא שלנו',
  other: 'צילום מסך של כלי אחר',
};

// First match wins; `flat` = only the folder itself, `match` = a file-name filter.
const GROUPS = [
  { id: 'rounds', dir: 'docs/gauntlet/visual/rounds', title: 'סבבי הגאונטלט החזותי', kind: 'studio', notes: ['docs/gauntlet/visual/GAUNTLET.md'] },
  { id: 'refs', dir: 'docs/gauntlet/visual/refs', title: 'תמונות ייחוס שהסבבים נמדדו מולן', kind: 'reference', notes: ['docs/gauntlet/visual/GAUNTLET.md'] },
  { id: 'ui-library', dir: 'docs/gauntlet/visual/ui-library', title: 'ספריית ה-UI, כפי שנבנתה ב-Studio', kind: 'studio', notes: ['docs/gauntlet/README.md'] },
  { id: 'fx-library', dir: 'docs/gauntlet/visual/fx-library', title: 'ספריית האפקטים והצלילים ב-Studio', kind: 'studio', notes: ['docs/gauntlet/visual/fx-library/studio-log.txt'] },
  { id: 'model-library', dir: 'docs/gauntlet/visual/model-library', title: 'ספריית המודלים התלת-ממדיים ב-Studio', kind: 'studio', notes: ['docs/gauntlet/visual/model-library/studio-log.txt'] },
  { id: 'gauntlet-other', dir: 'docs/gauntlet/visual', title: 'גאונטלט חזותי, שונות', kind: 'studio', notes: ['docs/gauntlet/visual/GAUNTLET.md'] },
  { id: 'langflow', dir: 'docs/gauntlet/langflow', title: 'Langflow (לא Studio)', kind: 'other', notes: [] },
  { id: 'lumen-isles', dir: 'docs/evidence/lumen-isles-2026-09-19', title: 'Lumen Isles, 19.9', kind: 'studio', notes: [] },
  { id: 'frames', dir: 'docs/evidence/frames', title: 'פריימים מבדיקות משחק', kind: 'studio', notes: [] },
  { id: 'evidence', dir: 'docs/evidence', flat: true, match: /^(?!catalog-)/, title: 'ראיות מבדיקות Studio', kind: 'studio', notes: [] },
  { id: 'ui-showcase', dir: 'docs/evidence/ui-showcase', title: 'תצוגת UI לפי ז\'אנר', kind: 'render', manifest: 'docs/evidence/ui-showcase/manifest.json' },
  { id: 'map-showcase', dir: 'docs/evidence/map-showcase', title: 'תצוגת מפות לפי ז\'אנר', kind: 'render', manifest: 'docs/evidence/map-showcase/manifest.json' },
  { id: 'eval-regression', dir: 'packages/evals/tasks-visual/regression', title: 'מבחן הרגרסיה החזותי', kind: 'render', notes: ['packages/evals/tasks-visual/regression/README.md', 'packages/evals/tasks-visual/regression/RESULTS.md'] },
  { id: 'eval-composition', dir: 'packages/evals/tasks-visual', title: 'מבחני הקומפוזיציה', kind: 'render', notes: ['packages/evals/tasks-visual/composition/generalization/REPORT.md'] },
  { id: 'root', dir: '.', flat: true, match: /^\.tmp-(studio|apple|manage)-/, title: 'צילומים זמניים מ-Studio בשורש הריפו', kind: 'studio', notes: [] },
];

function listImages(g) {
  const abs = path.join(REPO, g.dir);
  let names;
  try { names = g.flat ? fs.readdirSync(abs) : fs.readdirSync(abs, { recursive: true }).map(String); } catch { return []; }
  return names.filter((n) => IMG.test(n) && !/node_modules/.test(n) && (!g.match || g.match.test(path.basename(n))))
    .map((n) => path.posix.join(g.dir === '.' ? '' : g.dir, n.split(path.sep).join('/')));
}

// The markdown and text files in the image's folder and up to the group's folder, plus the group's notes.
function notesFor(p, g, memo) {
  const files = new Set(g.notes || []);
  for (let d = path.posix.dirname(p); d.length >= g.dir.length && d !== '.'; d = path.posix.dirname(d)) {
    try { for (const n of fs.readdirSync(path.join(REPO, d))) if (/\.(md|txt)$/i.test(n)) files.add(`${d}/${n}`); } catch { /* none */ }
    if (d === g.dir) break;
  }
  return [...files].map((f) => { if (!memo.has(f)) memo.set(f, readText(f) || ''); return [f, memo.get(f)]; });
}
const clean = (s) => s.replace(/\*\*|`|\[|\]\([^)]*\)/g, '').replace(/^\s*[-*>#]+\s*/, '').replace(/\s*\|\s*/g, ' · ').replace(/^ · | · $/g, '').replace(/\s+/g, ' ').trim();

function captionOf(p, g, memo) {
  const base = path.basename(p);
  const rel = p.slice(g.dir.length + 1);
  // "01-coin_burst.jpg" / "emit-coin_burst.jpg" is the preset a Studio log line names.
  const key = base.replace(IMG, '').replace(/^(\d+-|emit-|trail-|play-|sound-)/, '');
  const keyRe = key.length >= 4 ? new RegExp(`\\b(PRESET|MLTEST|UITEST)\\s+${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`) : null;
  const notes = notesFor(p, g, memo);
  for (const [file, text] of notes) {
    for (const line of text.split('\n')) {
      const byName = line.includes(base) || line.includes(rel);
      if (!byName && !(keyRe && file.endsWith('.txt') && keyRe.test(line))) continue;
      if (/[│└├┌]/.test(line)) continue;
      let c = byName ? clean(line.split(base).join('').split(rel).join('')) : line.replace(/^\S+Z\s+\S+\s+/, '').trim();
      c = c.replace(/^[·:,.\s—-]+|[·:,\s—-]+$/g, '');
      if (c.length < 6) continue;
      if (c.length > 240) c = `${c.slice(0, 237)}…`;
      return { text: c, from: file };
    }
  }
  const name = base.replace(IMG, '').replace(/^\.tmp-/, '').replace(/20\d\d-\d\d-\d\d/, '').replace(/[-_]+/g, ' ').trim();
  return { text: name, from: null };
}

// ui-showcase / map-showcase: the manifest names each render's genre and outcome.
function manifestCaptions(g) {
  const out = new Map();
  if (!g.manifest) return { out, meta: null };
  let j; try { j = JSON.parse(readText(g.manifest) || 'null'); } catch { j = null; }
  if (!j) return { out, meta: null };
  for (const r of j.results || []) {
    for (const f of Object.values(r.files || {})) {
      const stem = String(f).replace(/\.(svg|luau)$/, '');
      out.set(stem, [r.target || r.id, r.genre, r.outcome, r.parts != null ? `${r.parts} חלקים` : null, r.guiNodes != null ? `${r.guiNodes} רכיבי UI` : null].filter(Boolean).join(' · '));
    }
  }
  return { out, meta: { generatedAt: j.generatedAt ?? null, lane: j.lane ?? null, model: j.model ?? null, renderer: j.renderer ?? null } };
}

// The first paragraph of the folder's README (or the group's first note): what these images are.
function aboutOf(g) {
  for (const f of [g.dir === '.' ? null : `${g.dir}/README.md`, ...(g.notes || [])]) {
    const t = f && f.endsWith('.md') ? readText(f) : null; if (!t) continue;
    const para = t.split('\n\n').map((x) => x.trim()).find((x) => x && !/^(#|\||```|<)/.test(x) && x.length > 40);
    if (para) return { text: clean(para.replace(/\n/g, ' ')).slice(0, 420), from: f };
  }
  return null;
}

const dateInPath = (p) => /(20\d\d-\d\d-\d\d)/.exec(p)?.[1] || null;

export async function studioShots(q = new URLSearchParams()) {
  const cm = await commitsModule();
  const seen = await cm.firstSeen();
  const memo = new Map();
  const taken = new Set();
  const groups = [];
  for (const g of GROUPS) {
    const { out: man, meta } = manifestCaptions(g);
    const shots = [];
    for (const p of listImages(g)) {
      if (taken.has(p)) continue; taken.add(p);
      let st; try { st = fs.statSync(path.join(REPO, p)); } catch { continue; }
      const git = seen.seen.get(p);
      const inPath = dateInPath(p);
      const stem = path.basename(p).replace(IMG, '').replace(/--opened$/, '');
      const cap = man.get(stem) ? { text: `${man.get(stem)}${/--opened/.test(p) ? ' · פתוח' : ''}`, from: g.manifest } : captionOf(p, g, memo);
      shots.push({ path: p, url: mediaUrl(p), name: path.basename(p), sub: path.posix.dirname(p).slice(g.dir.length + 1) || null,
        caption: cap.text, captionFrom: cap.from, at: git?.at || (inPath ? `${inPath}T12:00:00` : st.mtime.toISOString()),
        dateFrom: git ? 'git' : inPath ? 'name' : 'mtime', commit: git ? { sha: git.sha, subject: git.subject } : null, kb: Math.round(st.size / 1024) });
    }
    if (!shots.length) continue;
    shots.sort((a, b) => (a.sub || '').localeCompare(b.sub || '') || a.name.localeCompare(b.name, 'en', { numeric: true }));
    const dates = shots.map((s) => s.at).sort();
    groups.push({ id: g.id, title: g.title, dir: g.dir, kind: g.kind, kindHe: KIND_HE[g.kind], meta,
      about: aboutOf(g) || (meta?.renderer ? { text: `${meta.lane || ''} · ${meta.renderer}`.replace(/^ · /, ''), from: g.manifest } : null), count: shots.length, from: dates[0], to: dates.at(-1), shots });
  }
  groups.sort((a, b) => (a.to < b.to ? 1 : -1));
  const kind = q.get('kind');
  const shown = kind ? groups.filter((g) => g.kind === kind) : groups;
  const all = groups.flatMap((g) => g.shots);
  return {
    groups: shown,
    counts: { total: all.length, groups: groups.length, byKind: Object.fromEntries(Object.keys(KIND_HE).map((k) => [k, groups.filter((g) => g.kind === k).reduce((s, g) => s + g.count, 0)])),
      captioned: all.filter((s) => s.captionFrom).length, datedByGit: all.filter((s) => s.dateFrom === 'git').length },
    progress: { scanned: seen.scanned, total: seen.total },
    kinds: KIND_HE,
  };
}

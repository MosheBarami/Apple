// The Libraries page (הספריות): the catalogues in packages/asset-library, read from disk at request
// time and cached per file (mtime + size), never copied. Other agents keep adding rows, so every
// count here is whatever the files say right now. Long lists are paged here (?off=&limit=), the
// browser never receives a whole catalogue. Media go through /api/cc/media?p=<repo path>.
//
// GET /api/cc/library?tab=summary|ui|assets|models|sfx|vfx [&q=&off=&limit=&<filters>]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { REPO, cached, fetchJson } from '../http.mjs';

const LIB_REL = 'packages/asset-library';
const LIB = path.join(REPO, LIB_REL);
const UI_DOCS = 'docs/gauntlet/visual/ui-library';
const media = (rel) => (rel ? `${LIB_REL}/${rel}` : null); // repo path for /api/cc/media
const arr = (x) => (Array.isArray(x) ? x : []);

// ---------------------------------------------------------------- reading, cached per file version
const memo = new Map();
function load(rel, parse, tag = 'raw') {
  const abs = path.join(LIB, rel);
  let st; try { st = fs.statSync(abs); } catch { return null; }
  const key = `${st.mtimeMs}:${st.size}`; const hit = memo.get(`${tag}|${rel}`);
  if (hit?.key === key) return hit.v;
  try {
    const v = parse(fs.readFileSync(abs));
    memo.set(`${tag}|${rel}`, { key, v });
    return v;
  } catch {
    return hit?.v ?? null; // a writer is mid-save: keep the last good read
  }
}
const lines = (buf) => {
  const out = [];
  for (const l of String(buf).split('\n')) { if (!l.trim()) continue; try { out.push(JSON.parse(l)); } catch { /* torn line */ } }
  return out;
};
const json = (rel) => load(rel, (b) => JSON.parse(b), 'json');
const jsonl = (rel) => load(rel, (b) => lines(rel.endsWith('.gz') ? zlib.gunzipSync(b) : b), 'jsonl') || [];
const derived = (rel, tag, fn) => load(rel, fn, tag); // one parse + transform per file version and tag

function num(v, lo, hi, dflt) { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; }
function paged(rows, query, max = 300) {
  const off = num(query.get('off'), 0, 1e9, 0); const limit = num(query.get('limit'), 1, max, 60);
  return { total: rows.length, off, limit, rows: rows.slice(off, off + limit) };
}
const tally = (rows, key) => { const t = {}; for (const r of rows) { const k = key(r) ?? '—'; t[k] = (t[k] || 0) + 1; } return Object.entries(t).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, n })); };
const has = (q) => { const s = String(q || '').trim().toLowerCase(); return s ? (...xs) => xs.some((x) => String(x ?? '').toLowerCase().includes(s)) : null; };

// ---------------------------------------------------------------- Roblox thumbnails (public, free)
// Only for the rows on the current page; a failure just leaves the card without a picture.
const thumbCache = new Map();
async function thumbs(ids) {
  const want = [...new Set(ids.filter((x) => Number.isFinite(Number(x)) && !thumbCache.has(String(x))))].slice(0, 100);
  if (want.length) {
    try {
      const j = await fetchJson(`https://thumbnails.roblox.com/v1/assets?assetIds=${want.join(',')}&returnPolicy=PlaceHolder&size=150x150&format=Png&isCircular=false`,
        { label: 'Roblox Thumbnails', what: 'תמונות ממוזערות' });
      for (const t of arr(j?.data)) if (t?.targetId != null) thumbCache.set(String(t.targetId), t.state === 'Completed' ? t.imageUrl : null);
    } catch { /* no pictures this time */ }
  }
  return Object.fromEntries(ids.map((x) => [String(x), thumbCache.get(String(x)) ?? null]));
}

// ---------------------------------------------------------------- UI: components × skins
function readmeBoards() {
  // docs/gauntlet/visual/ui-library/README.md: | `id` | `<skin>-hud.png` | yes (6 inst, 2 img) | ... |
  let text; try { text = fs.readFileSync(path.join(REPO, UI_DOCS, 'README.md'), 'utf8'); } catch { return {}; }
  const out = {}; let skins = null;
  for (const line of text.split('\n')) {
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells[0] === 'Component') { skins = cells.slice(2); continue; }
    const id = /^`([\w-]+)`$/.exec(cells[0] || '')?.[1];
    if (!id || !skins) continue;
    out[id] = { board: cells[1].replace(/`/g, ''), per: Object.fromEntries(skins.map((s, i) => [s, cells[2 + i] || null])) };
  }
  return out;
}
function ui() {
  const u = json('ui-components.json');
  if (!u) return { error: 'הקובץ ui-components.json לא נקרא' };
  const ids = json('roblox-ids.json')?.ids || {};
  const boards = readmeBoards();
  const skins = Object.entries(u.skins || {}).map(([id, s]) => ({ id, title: s.title, font: s.font, colours: arr(s.colours), genres: arr(s.genres) }));
  const pairs = [];
  for (const c of arr(u.components)) {
    for (const s of arr(c.genres)) {
      const skin = u.skins?.[s]; if (!skin) continue;
      const colour = arr(skin.colours)[0];
      const role = arr(c.roles).find((r) => skin.roles?.[colour]?.[r]);
      const file = role ? skin.roles[colour][role] : null;
      const iconFile = arr(c.icons).map((n) => u.icons?.[n]).find(Boolean) || null;
      const b = boards[c.id];
      const boardFile = b?.board ? b.board.replace('<skin>', s) : null;
      pairs.push({
        k: `${c.id}:${s}`, id: c.id, title: c.title, group: c.group, skin: s, skinTitle: skin.title, colour, role,
        image: file ? media(`packs/${file}`) : null, icon: iconFile ? media(`packs/${iconFile}`) : null,
        robloxId: (file && ids[file]) || (iconFile && ids[iconFile]) || null,
        board: boardFile && fs.existsSync(path.join(REPO, UI_DOCS, boardFile)) ? `${UI_DOCS}/${boardFile}` : null,
        built: b?.per?.[s] ?? null, seenIn: arr(c.seenIn).length, sources: c.sourcesMatched ?? null,
      });
    }
  }
  return { components: arr(u.components).length, skins, groups: tally(arr(u.components), (c) => c.group), pairs,
    uploaded: Object.keys(ids).length, source: `${LIB_REL}/ui-components.json` };
}

// ---------------------------------------------------------------- assets: every icon in packs/
function assetRows() {
  return derived('index.json', 'assets', (b) => {
    const idx = JSON.parse(b); const rows = [];
    for (const p of arr(idx.packs)) for (const [folder, stems] of arr(p.folders)) for (const s of arr(stems)) rows.push({ p: p.id, f: folder, s });
    return { idx, rows };
  });
}
function assets(query) {
  const a = assetRows(); const man = json('manifest.json');
  if (!a) return { error: 'הקובץ index.json לא נקרא' };
  const meta = Object.fromEntries(arr(man?.packs).map((p) => [p.id, p]));
  const packs = arr(a.idx.packs).map((p) => ({ id: p.id, name: p.name, nameHe: meta[p.id]?.nameHe ?? null, kind: p.kind, license: p.license,
    attribution: p.attribution ?? null, author: meta[p.id]?.author ?? null, source: meta[p.id]?.source ?? null,
    n: arr(p.folders).reduce((t, [, s]) => t + arr(s).length, 0), folders: arr(p.folders).map(([f, s]) => ({ k: f, n: arr(s).length })) }));
  const pack = query.get('pack'); const folder = query.get('folder'); const q = has(query.get('q'));
  const rows = a.rows.filter((r) => (!pack || r.p === pack) && (!folder || r.f === folder) && (!q || q(r.s, r.f)));
  const byId = Object.fromEntries(packs.map((p) => [p.id, p]));
  const pg = paged(rows, query, 400);
  pg.rows = pg.rows.map((r) => { const rel = [r.p, r.f, r.s].filter(Boolean).join('/'); return { k: rel, name: r.s, pack: r.p, folder: r.f, license: byId[r.p]?.license ?? null, src: media(`packs/${rel}.png`) }; });
  return { total: a.rows.length, packs, page: pg, source: `${LIB_REL}/index.json` };
}

// ---------------------------------------------------------------- 3D models and kits
const GH = 'sources/models-github.jsonl.gz';
const KITS = 'sources/models-roblox-kits.jsonl';
function modelRow(r, cs) {
  const src = r.source || (r.format === 'creator-store' ? 'creator-store' : null);
  return { k: r.id, name: r.name, source: src, kind: r.kind ?? null, genres: arr(r.genres), licence: r.licence ?? (r.assetId ? cs?.licence ?? null : null),
    creator: r.creator ?? null, assetId: r.assetId ?? null, format: r.format ?? null, triangles: r.triangles ?? null,
    page: r.page ?? (r.assetId && cs?.page ? cs.page.replace('<assetId>', r.assetId) : null), file: r.path ? media(r.path) : null,
    bytes: r.bytes ?? null, local: localFact(r.path, r.bytes, r.sha256), clean: r.scan ? r.scan.clean !== false : null, scripts: r.scan?.scriptsFound ?? r.scriptCount ?? null,
    attribution: r.attribution ?? null, stars: r.stars ?? null, use: r.use ?? null, download: r.download ?? null };
}
async function models(query) {
  const m = json('models/manifest.json');
  if (!m) return { error: 'הקובץ models/manifest.json לא נקרא' };
  const source = query.get('source') || '';
  const gh = source === 'github' ? jsonl(GH) : null;
  const all = gh || arr(m.rows);
  const kind = query.get('kind'); const genre = query.get('genre'); const q = has(query.get('q'));
  const rowsSrc = (r) => r.source || (r.format === 'creator-store' ? 'creator-store' : null);
  const rows = all.filter((r) => (gh || !source || rowsSrc(r) === source) && (!kind || r.kind === kind) && (!genre || arr(r.genres).includes(genre))
    && (!q || q(r.name, r.creator, ...(arr(r.tags).slice(0, 12)))));
  const pg = paged(rows, query, 120);
  pg.rows = pg.rows.map((r) => modelRow(r, m.creatorStore));
  const t = await thumbs(pg.rows.map((r) => r.assetId).filter(Boolean));
  for (const r of pg.rows) r.thumb = r.assetId ? t[String(r.assetId)] : null;
  const ghN = derived(GH, 'count', (b) => zlib.gunzipSync(b).toString().split('\n').filter((l) => l.trim()).length) ?? 0;
  const kitsN = derived(KITS, 'count', (b) => String(b).split('\n').filter((l) => l.trim()).length) ?? 0;
  return { totals: m.totals, generated: m.generated ?? null, creatorStore: m.creatorStore ?? null, github: ghN, kits: kitsN, page: pg,
    source: `${LIB_REL}/models/manifest.json` };
}

// ---------------------------------------------------------------- SFX
const SFX_SOURCES = ['kenney-audio', 'opengameart-audio', 'opengameart-cc0-ui', 'sonniss', 'freesound', 'roblox-audio'];
let cat = null;
async function categories() {
  if (!cat) cat = await import(pathToFileURL(path.join(LIB, 'fx-categories.mjs')).href);
  return cat;
}
async function sfxRows() {
  const { sfxCategory } = await categories();
  const out = [];
  for (const s of SFX_SOURCES) {
    const rows = derived(`sfx/sources/${s}.jsonl`, 'rows', (b) => lines(b).map((r) => {
      const music = (r.audioType === 'Music' && !/\(SFX\)\s*$/i.test(r.name ?? '')) || /music/i.test(r.pack ?? '') || arr(r.tags).some((t) => /^music$/i.test(t));
      return { k: r.id ?? `${r.source}:${r.assetId}`, name: r.name, source: r.source, dur: r.durationSec ?? null,
        category: sfxCategory({ name: String(r.name ?? ''), tags: arr(r.tags), query: r.query ?? '', music }),
        license: r.license ?? (r.source === 'roblox' ? `roblox-${r.tier || 'community'}` : null), author: r.author ?? r.creator ?? null, pack: r.pack ?? null,
        file: r.file ? media(r.file) : null, local: localFact(r.file, r.bytes, r.sha256), bytes: r.bytes ?? null,
        sha256: r.sha256 ?? null, fileUrl: r.fileUrl ?? null, sourceUrl: r.sourceUrl ?? (r.assetId ? `https://create.roblox.com/store/asset/${r.assetId}` : null),
        assetId: r.assetId ?? null, use: r.use ?? (r.assetId ? 'by-id' : null) };
    })) || [];
    for (const r of rows) out.push(r);
  }
  return out;
}
async function sfx(query) {
  const all = await sfxRows();
  const source = query.get('source') || 'local'; const category = query.get('category'); const q = has(query.get('q'));
  const inSrc = (r) => (source === 'all' ? true : source === 'local' ? ['present', 'verified'].includes(r.local.state) : r.source === source);
  const scoped = all.filter(inSrc);
  const rows = scoped.filter((r) => (!category || r.category === category) && (!q || q(r.name, r.pack, r.author)));
  const man = json('sfx/manifest.json');
  return { total: all.length, local: all.filter((r) => ['present', 'verified'].includes(r.local.state)).length, bySource: tally(all, (r) => r.source), categories: tally(scoped, (r) => r.category),
    packs: arr(man?.packs).map((p) => ({ id: p.id, license: p.license, files: p.files })), page: paged(rows, query, 200),
    source: `${LIB_REL}/sfx/sources/*.jsonl` };
}

// Inventory is deliberately stricter than the catalogues. A row with a path is only a claim;
// the file, byte count and optional SHA-256 are checked from disk before calling it downloaded.
function localFact(rel, expectedBytes, expectedSha, verifyHash = true) {
  if (typeof rel !== 'string' || !rel || rel.startsWith('/') || rel.split('/').some((s) => !s || s === '.' || s === '..')) return { state: 'missing' };
  const abs = path.resolve(LIB, rel);
  if (!abs.startsWith(LIB + path.sep)) return { state: 'missing' };
  try {
    const real = fs.realpathSync(abs);
    if (!real.startsWith(LIB + path.sep)) return { state: 'missing' };
    const st = fs.statSync(real);
    if (!st.isFile() || (Number.isFinite(expectedBytes) && st.size !== expectedBytes)) return { state: 'mismatch', bytes: st.size };
    if (expectedSha && verifyHash) {
      const actual = createHash('sha256').update(fs.readFileSync(real)).digest('hex');
      if (actual !== expectedSha) return { state: 'mismatch', bytes: st.size };
      return { state: 'verified', bytes: st.size, sha256: actual };
    }
    return { state: 'present', bytes: st.size };
  } catch { return { state: 'missing' }; }
}

async function storedPaths() {
  const base = process.env.API_BASE; const key = process.env.GOLEM_ADMIN_KEY;
  if (!base || !key) return null;
  try {
    const rows = await cached('library:stored-paths', () => fetchJson(`${base}/api/admin/static-list`,
      { label: 'Apple', what: 'רשימת קבצים בשרת', headers: { 'X-Admin-Key': key } }), 60000);
    return new Set(arr(rows).map((r) => r.path));
  } catch { return null; }
}

function receiptRows() {
  const out = [];
  const packs = new Map(jsonl('sources/models-packs.jsonl').map((p) => [p.id, p]));
  for (const r of arr(json('models/manifest.json')?.rows)) if (r.path) {
    const p = packs.get(r.pack);
    out.push({ k: r.id, category: 'model', name: r.name, source: r.source ?? p?.source ?? null,
      sourceUrl: r.page ?? p?.page ?? null, file: r.path, expectedBytes: r.bytes, expectedSha: r.sha256,
      license: r.licence ?? p?.licence ?? null, download: { method: p?.downloadKind ?? 'not-recorded', url: p?.download ?? null },
      backendPath: `/model-library/${r.path}`, use: r.use ?? null });
  }
  for (const s of SFX_SOURCES) for (const r of jsonl(`sfx/sources/${s}.jsonl`)) if (r.file) {
    out.push({ k: r.id, category: 'sfx', name: r.name, source: r.source, sourceUrl: r.sourceUrl ?? null,
      file: r.file, expectedBytes: r.bytes, expectedSha: r.sha256, license: r.license ?? null,
      download: { method: r.fileUrl ? 'source-archive' : 'not-recorded', url: r.fileUrl ?? null },
      backendPath: r.file.startsWith('sfx-store/opengameart/') ? `/private-library/sfx/${r.file.slice('sfx-store/'.length)}` : null,
      use: r.use ?? null });
  }
  const ix = assetRows(); const packsUi = new Map(arr(json('manifest.json')?.packs).map((p) => [p.id, p]));
  for (const r of arr(ix?.rows)) {
    const p = packsUi.get(r.p); const file = `packs/${[r.p, r.f, r.s].filter(Boolean).join('/')}.png`;
    out.push({ k: file, category: 'ui', name: r.s, source: r.p, sourceUrl: p?.source ?? null,
      file, expectedBytes: null, expectedSha: null, license: p?.license ?? null,
      download: { method: 'pack-extract', url: null }, backendPath: null, use: p?.forAgent ? 'agent-index' : 'reference' });
  }
  for (const r of arr(json('vfx/manifest.json')?.rows)) if (r.file) {
    out.push({ k: r.id, category: 'vfx', name: r.name, source: r.source, sourceUrl: r.sourceUrl ?? null,
      file: r.file, expectedBytes: r.bytes, expectedSha: r.sha256, license: r.license ?? null,
      download: { method: 'pack-extract', url: null }, backendPath: null, use: r.use ?? null });
  }
  return out;
}

async function intake(query) {
  const view = query.get('view') === 'files' ? 'files' : 'sources';
  const q = has(query.get('q')); const category = query.get('category'); const state = query.get('state');
  const ownerSources = jsonl('sources/owner-priority.jsonl');
  const receipts = receiptRows();
  const inScopeSources = ownerSources.filter((r) => r.state !== 'out-of-scope-not-roblox');
  const exact = new Set(inScopeSources.map((r) => r.url));
  const portals = new Set(inScopeSources.filter((r) => r.category === 'source_portal').map((r) => {
    try { return new URL(r.url).hostname.replace(/^www\./, ''); } catch { return null; }
  }).filter(Boolean));
  const measured = receipts.map((r) => {
    let hostname = null; try { hostname = new URL(r.sourceUrl).hostname.replace(/^www\./, ''); } catch {}
    return { ...r, ownerListed: exact.has(r.sourceUrl) || (hostname && portals.has(hostname)) || false,
      local: localFact(r.file, r.expectedBytes, r.expectedSha, false) };
  });
  const files = measured.filter((r) => (!category || r.category === category) && (query.get('owner') !== '1' || r.ownerListed)
    && (!q || q(r.name, r.source, r.sourceUrl, r.file)));
  const present = measured.filter((r) => r.local.state === 'present' || r.local.state === 'verified');
  const stored = view === 'files' ? await storedPaths() : null;
  const filePage = paged(state ? files.filter((r) => r.local.state === state) : files, query, 120);
  filePage.rows = filePage.rows.map((r) => ({ ...r, local: localFact(r.file, r.expectedBytes, r.expectedSha),
    backend: { state: !r.backendPath ? 'not-supported' : !stored ? 'not-checked' : stored.has(r.backendPath) ? 'stored' : 'not-stored' } }));
  const sourceRows = ownerSources.filter((r) => (!category || r.category === category) && (!state || r.state === state) && (!q || q(r.url, r.category)));
  const sourcePage = paged(sourceRows, query, 120);
  sourcePage.rows = sourcePage.rows.map((r) => ({ ...r, acquired: r.state === 'out-of-scope-not-roblox' ? 0 : r.category === 'source_portal' ? present.filter((f) => {
    try { return new URL(f.sourceUrl).hostname.replace(/^www\./, '') === new URL(r.url).hostname.replace(/^www\./, ''); } catch { return false; }
  }).length : present.filter((f) => f.sourceUrl === r.url).length,
    review: r.reviewFile ? localFact(r.reviewFile, r.reviewBytes, r.reviewSha256) : null }));
  return { view, sources: { total: ownerSources.length, excluded: ownerSources.length - inScopeSources.length, page: sourcePage },
    files: { total: receipts.length, local: present.length, fromOwner: present.filter((r) => r.ownerListed).length,
      reviewOnly: ownerSources.filter((r) => r.reviewFile && ['verified', 'present'].includes(localFact(r.reviewFile, r.reviewBytes, r.reviewSha256).state)).length,
      hashRecorded: present.filter((r) => !!r.expectedSha).length },
    page: view === 'sources' ? sourcePage : filePage,
    categories: tally(view === 'sources' ? ownerSources : measured, (r) => r.category), backendChecked: !!stored,
    note: 'רק מודלים שנוצרו ל־Roblox נספרים כספריית המודלים. אתרי מודלים כלליים סומנו מחוץ לתחום; קובץ ישן שלהם אינו התקדמות. רשומה בקטלוג אינה הורדה. מצב השרת נבדק בנפרד.' };
}

// ---------------------------------------------------------------- VFX
const IMG = /\.(png|jpe?g|webp|gif)$/i;
function fmtProp(p) {
  const v = p?.v;
  const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : x);
  const hex = (c) => `#${arr(c).map((x) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0')).join('')}`;
  switch (p?.t) {
    case 'number': return String(r2(v));
    case 'NumberRange': return `${r2(v[0])}–${r2(v[1])}`;
    case 'NumberSequence': return arr(v).map((k) => r2(k[1])).join(' → ');
    case 'ColorSequence': return arr(v).map((k) => hex(k[1])).join(' → ');
    case 'Color3': return hex(v);
    case 'Vector2': case 'Vector3': return arr(v).map(r2).join(', ');
    default: return typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : String(v);
  }
}
function vfx(query) {
  const m = json('vfx/manifest.json');
  if (!m) return { error: 'הקובץ vfx/manifest.json לא נקרא' };
  const idx = json('vfx/index.json');
  const all = arr(m.rows);
  const kind = query.get('kind'); const category = query.get('category'); const source = query.get('source'); const q = has(query.get('q'));
  const rows = all.filter((r) => (!kind || r.kind === kind) && (!category || r.category === category) && (!source || r.source === source) && (!q || q(r.name, r.category)));
  const pg = paged(rows, query, 120);
  pg.rows = pg.rows.map((r) => ({ k: r.id, name: r.name, kind: r.kind, category: r.category, source: r.source, license: r.license ?? null,
    preview: r.file && IMG.test(r.file) ? media(r.file) : null, file: r.file ? media(r.file) : null, assetId: r.assetId ?? null,
    sourceUrl: r.sourceUrl ?? null, use: r.use ?? null, size: r.width ? `${r.width}×${r.height}` : null, creator: r.creator ?? null }));
  return pg.rows.some((r) => r.assetId) ? thumbs(pg.rows.map((r) => r.assetId).filter(Boolean)).then((t) => {
    for (const r of pg.rows) r.thumb = r.assetId ? t[String(r.assetId)] : null;
    return vfxOut(m, idx, all, pg);
  }) : vfxOut(m, idx, all, pg);
}
function vfxOut(m, idx, all, pg) {
  const presets = arr(idx?.presets || m.presets).map((p) => ({ k: p.name, name: p.name, category: p.category, kind: p.kind, summary: p.summary ?? null, use: p.use ?? null,
    parts: arr(p.parts).map((x) => ({ className: x.className, name: x.name, props: Object.entries(x.props || {}).map(([k, v]) => [k, fmtProp(v)]) })) }));
  return { total: all.length, totals: m.totals ?? null, kinds: tally(all, (r) => r.kind), categories: tally(all, (r) => r.category), sources: tally(all, (r) => r.source),
    presets, page: pg, source: `${LIB_REL}/vfx/manifest.json` };
}

// ---------------------------------------------------------------- summary: counts + growth from git
function counts() {
  const u = json('ui-components.json'); const man = json('manifest.json'); const mm = json('models/manifest.json');
  const vx = json('vfx/manifest.json');
  const pairs = arr(u?.components).reduce((t, c) => t + arr(c.genres).length, 0);
  const sfxN = SFX_SOURCES.map((s) => derived(`sfx/sources/${s}.jsonl`, 'count', (b) => {
    let n = 0, f = 0; for (const l of String(b).split('\n')) { if (!l.trim()) continue; n++; if (/"file":\s*"/.test(l)) f++; } return { n, f };
  }) || { n: 0, f: 0 });
  return [
    { id: 'ui', label: 'רכיבי UI', n: pairs, sub: `${arr(u?.components).length} רכיבים × ${Object.keys(u?.skins || {}).length} סגנונות`, file: 'ui-components.json' },
    { id: 'assets', label: 'אייקונים ותמונות', n: assetRows()?.rows.length ?? 0, sub: `${arr(man?.packs).length} חבילות`, file: 'index.json' },
    { id: 'models', label: 'מודלים וערכות 3D', n: mm?.totals?.rows ?? 0, sub: `${mm?.totals?.insertable ?? 0} מוכנים להכנסה, ${mm?.totals?.creatorStoreIds ?? 0} מזהי Creator Store`, file: 'models/manifest.json' },
    { id: 'sfx', label: 'צלילים (SFX)', n: sfxN.reduce((t, x) => t + x.n, 0), sub: `${sfxN.reduce((t, x) => t + x.f, 0)} מציינים נתיב קובץ; הזמינות נבדקת בלשונית הקליטה`, file: 'sfx/sources/*.jsonl' },
    { id: 'vfx', label: 'אפקטים (VFX)', n: arr(vx?.rows).length, sub: `${arr(vx?.presets).length} פריסטים מוכנים`, file: 'vfx/manifest.json' },
  ];
}

const gitBuf = (args) => new Promise((resolve, reject) => execFile('git', args, { cwd: REPO, maxBuffer: 256 << 20, encoding: 'buffer', timeout: 20000 },
  (e, out) => (e ? reject(e) : resolve(out))));
// Each library's count at every commit that touched its catalogue, then "now" from the working tree.
const GROWTH = [
  ['ui', 'ui-components.json', (b) => arr(JSON.parse(b).components).reduce((t, c) => t + arr(c.genres).length, 0)],
  ['assets', 'manifest.json', (b) => JSON.parse(b).totalFiles ?? 0],
  ['models', 'models/manifest.json', (b) => JSON.parse(b).totals?.rows ?? 0],
  ['sfx', 'sfx/manifest.json', (b) => JSON.parse(b).totals?.items ?? 0],
  ['vfx', 'vfx/manifest.json', (b) => JSON.parse(b).totals?.items ?? 0],
];
function growth() {
  return cached('library:growth', async () => {
    const out = {};
    for (const [id, rel, count] of GROWTH) {
      const p = `${LIB_REL}/${rel}`; const pts = [];
      try {
        const log = String(await gitBuf(['log', '--format=%H %cI', '--', p])).trim().split('\n').filter(Boolean).reverse();
        for (const l of log.slice(-12)) {
          const [sha, at] = l.split(' ');
          try { pts.push({ at, n: count(await gitBuf(['show', `${sha}:${p}`])), sha: sha.slice(0, 7) }); } catch { /* file absent at that commit */ }
        }
      } catch { /* no git */ }
      try { pts.push({ at: new Date().toISOString(), n: count(fs.readFileSync(path.join(REPO, p))), sha: null }); } catch { /* not built yet */ }
      out[id] = pts;
    }
    return out;
  }, 10 * 60000);
}

async function summary() {
  return { counts: counts(), growth: await growth(), note: 'נקרא מהקבצים בכל בקשה (מטמון לפי זמן שינוי הקובץ). "עכשיו" = עץ העבודה, גם לפני קומיט.' };
}

const TABS = { summary, ui, assets, models, sfx, vfx, intake };
export async function library(query = new URLSearchParams()) {
  const tab = TABS[query.get('tab')] ? query.get('tab') : 'summary';
  const out = await TABS[tab](query);
  return { tab, ...out };
}

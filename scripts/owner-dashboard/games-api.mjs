// GET /api/cc/games            the index of every rbxl game the owner supplied (built by games.py)
// GET /api/cc/games/<id>       one game: header, failures, per-service counts and a page of its components
//                              [?off=&limit=&q=&service=&sort=instances|percent|percent-asc|name]
// Reads ~/Library/Application Support/Apple/owner-dashboard (or $STUDPILOT_DASH_GAMES_DIR), cached per file
// mtime. Components can number in the tens of thousands, so the browser only ever gets one page.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fail, ok, sendJson, localHost } from './cc/http.mjs';

const dir = () => process.env.STUDPILOT_DASH_GAMES_DIR || path.join(os.homedir(), 'Library/Application Support/Apple/owner-dashboard');
const HINT = 'python3 scripts/owner-dashboard/games.py';
const missing = () => fail('אינדקס המשחקים עדיין לא נבנה. הריצו: ' + HINT, { hint: HINT });
// Same rule as games.py safe(): the file name of a game is its id with anything but letters, digits and -_. replaced.
const safeId = (id) => id.replace(/[^\p{L}\p{N}\-_.]/gu, '_');

const memo = new Map(); // file -> {key, v}; a game file can be 5 MB, so only the last few are kept
function read(file, derive = (x) => x) {
  let st; try { st = fs.statSync(file); } catch { return null; }
  const key = `${st.mtimeMs}:${st.size}`; const hit = memo.get(file);
  if (hit?.key === key) return hit.v;
  let v; try { v = derive(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { return hit?.v ?? null; }
  memo.delete(file); memo.set(file, { key, v });
  if (memo.size > 4) memo.delete(memo.keys().next().value);
  return v;
}
const byService = (g) => {
  const m = new Map();
  for (const c of g.components || []) {
    const s = m.get(c.service) || { service: c.service, components: 0, instances: 0 };
    s.components++; s.instances += c.instances || 0; m.set(c.service, s);
  }
  return { ...g, services: [...m.values()].sort((a, b) => b.instances - a.instances) };
};

const SORTS = { instances: (a, b) => b.instances - a.instances, percent: (a, b) => b.percent - a.percent || b.instances - a.instances,
  'percent-asc': (a, b) => a.percent - b.percent || b.instances - a.instances, name: (a, b) => String(a.name).localeCompare(String(b.name)) };

export function games(id, query = new URLSearchParams()) {
  const index = read(path.join(dir(), 'games.json'));
  if (!index) return missing();
  if (id == null) return ok(index);
  const meta = index.games.find((g) => g.id === id);
  if (!meta) return fail('אין משחק כזה באינדקס');
  const game = read(path.join(dir(), 'games', `${safeId(id)}.json`), byService);
  if (!game) return fail('קובץ הרכיבים של המשחק חסר. הריצו: ' + HINT, { hint: HINT });
  const { components, ...head } = game;
  const q = (query.get('q') || '').trim().toLowerCase(); const service = query.get('service') || '';
  const rows = components.filter((c) => (!service || c.service === service)
    && (!q || `${c.name} ${c.class}`.toLowerCase().includes(q))).sort(SORTS[query.get('sort')] || SORTS.instances);
  const limit = Math.min(200, Math.max(1, Number(query.get('limit')) || 50)); const off = Math.max(0, Number(query.get('off')) || 0);
  return ok({ ...head, page: { total: rows.length, limit, off, rows: rows.slice(off, off + limit) } });
}

// Returns true when it took the request.
export function gamesRoute(req, res) {
  if (req.method !== 'GET') return false;
  const u = new URL(req.url || '/', 'http://localhost');
  const m = /^\/api\/cc\/games(?:\/([^/]+))?\/?$/.exec(u.pathname);
  if (!m) return false;
  if (!localHost(req)) { sendJson(res, 403, fail('הבקשה חייבת להגיע מ-localhost')); return true; }
  let id = null;
  if (m[1] != null) { try { id = decodeURIComponent(m[1]); } catch { sendJson(res, 400, fail('מזהה משחק לא תקין')); return true; } }
  if (id != null && !/^([0-9a-f]{8,64}|missing:[^\0/\\]{1,200})$/.test(id)) { sendJson(res, 400, fail('מזהה משחק לא תקין')); return true; }
  try { sendJson(res, 200, games(id, u.searchParams)); } catch { sendJson(res, 500, fail('שגיאה פנימית בשרת הדשבורד')); }
  return true;
}

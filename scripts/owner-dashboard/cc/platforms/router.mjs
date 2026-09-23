// The /api/cc/* routes and the control-center static files. `route()` returns true when it took the
// request, so server.mjs keeps every route it already had.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnv, sendJson, readJsonBody, postAllowed, localHost, SESSION_TOKEN, ok, fail } from '../http.mjs';
import { github, githubAction } from './github.mjs';
import { supabase, supabaseAction } from './supabase.mjs';
import { cloudflare, cloudflareAction } from './cloudflare.mjs';
import { sentry, sentryAction } from './sentry.mjs';
import { hf } from './hf.mjs';
import { extras } from './extras.mjs';

loadEnv();

const CC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONTROL = path.resolve(CC, '../control');

// Lane B's modules, imported on first use (and again after an edit, keyed by mtime) so this server
// runs before they exist.
async function laneB(file, name, arg) {
  try {
    const abs = path.join(CC, file);
    const mod = await import(`${pathToFileURL(abs).href}?v=${fs.statSync(abs).mtimeMs}`);
    if (typeof mod[name] !== 'function') return fail('המודול עדיין בבנייה');
    const out = await mod[name](arg);
    return { ok: true, fetchedAt: new Date().toISOString(), ...out };
  } catch {
    return fail('המודול עדיין בבנייה');
  }
}

const GETS = {
  session: async () => ok({ token: SESSION_TOKEN }),
  overview: () => laneB('repo.mjs', 'overview'),
  tree: () => laneB('repo.mjs', 'tree'),
  repos: () => laneB('deps.mjs', 'repos'),
  github, supabase, cloudflare, sentry, hf, extras,
};
const POSTS = {
  review: (b) => laneB('repo.mjs', 'review', { sha: b.sha, verdict: b.verdict }),
  'github/action': githubAction,
  'supabase/action': supabaseAction,
  'cloudflare/action': cloudflareAction,
  'sentry/action': sentryAction,
};

async function api(req, res, name) {
  if (!localHost(req)) return sendJson(res, 403, fail('הבקשה חייבת להגיע מ-localhost'));
  try {
    if (req.method === 'GET' && GETS[name]) return sendJson(res, 200, await GETS[name]());
    if (req.method === 'POST' && POSTS[name]) {
      if (!postAllowed(req)) return sendJson(res, 403, fail('בקשה לא מורשית — רעננו את הדף ונסו שוב'));
      let body;
      try { body = await readJsonBody(req); } catch { return sendJson(res, 400, fail('גוף הבקשה אינו JSON תקין')); }
      if (body?.confirm !== true) return sendJson(res, 400, fail('חסר אישור מפורש (confirm:true)'));
      return sendJson(res, 200, await POSTS[name](body));
    }
    return sendJson(res, 404, fail('אין נתיב כזה'));
  } catch {
    return sendJson(res, 500, fail('שגיאה פנימית בשרת הדשבורד'));
  }
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json; charset=utf-8',
};
const notFound = (res) => { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); };

// Files under control/ only: a path that decodes or resolves outside it is refused.
function serveControl(res, rel) {
  let abs; try { abs = path.resolve(CONTROL, decodeURIComponent(rel)); } catch { return notFound(res); }
  const type = TYPES[path.extname(abs).toLowerCase()];
  if (!type || !abs.startsWith(CONTROL + path.sep)) return notFound(res);
  fs.readFile(abs, (err, buf) => {
    if (err) return notFound(res);
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
    res.end(buf);
  });
}

export function route(req, res) {
  const raw = (req.url || '/').split('?')[0];
  // Refuse any dot-segment before URL normalisation can quietly resolve it.
  if (raw.startsWith('/control/') && /(^|\/|%2f|%5c|\\)(\.|%2e){2}(\/|%2f|%5c|\\|$)/i.test(raw)) { notFound(res); return true; }
  const { pathname } = new URL(req.url || '/', 'http://localhost');
  if (pathname.startsWith('/api/cc/')) { api(req, res, pathname.slice('/api/cc/'.length).replace(/\/+$/, '')); return true; }
  if (pathname.startsWith('/control/')) { serveControl(res, pathname.slice('/control/'.length)); return true; }
  if (pathname === '/' && fs.existsSync(path.join(CONTROL, 'index.html'))) { serveControl(res, 'index.html'); return true; }
  return false;
}

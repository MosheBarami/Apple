// The /api/cc/* routes and the control-center static files. `route()` returns true when it took the
// request, so server.mjs keeps every route it already had.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnv, sendJson, readJsonBody, postAllowed, localHost, SESSION_TOKEN, ok, fail, uncache } from '../http.mjs';
import { github, githubAction } from './github.mjs';
import { supabase, supabaseAction } from './supabase.mjs';
import { cloudflare, cloudflareAction } from './cloudflare.mjs';
import { sentry, sentryAction } from './sentry.mjs';
import { hf, hfAction } from './hf.mjs';
import { extras } from './extras.mjs';
import { apple, appleAction } from './apple.mjs';
import { groq, groqAction } from './groq.mjs';
import { discord, discordAction } from './discord.mjs';
import { roblox, robloxAction } from './roblox.mjs';
import { status } from './status.mjs';
import { connectors, connectorAction } from './connectors.mjs';
import { langflow, langflowAction } from './langflow.mjs';
import { pulse } from './pulse.mjs';
import { insights } from '../insights.mjs';
import { stream } from '../stream.mjs';
import { media } from '../media.mjs';
import { os, osAction } from '../os.mjs';

loadEnv();

const CC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONTROL = path.resolve(CC, '../control');

// Modules imported on first use (and again after an edit, keyed by mtime) so this server runs before
// they exist: lane B's repo/deps readers and the platform modules the page lanes add (vercel, clerk,
// resend). A missing module or export answers {ok:false, reason:'המודול עדיין בבנייה'}.
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
  github, supabase, cloudflare, sentry, hf, extras, apple, groq, discord, roblox, status, connectors, langflow, pulse, insights, os,
};
// Platforms whose module lives in platforms/<id>.mjs and is loaded lazily: GET → <id>(), POST → <id>Action(body).
export const LAZY_PLATFORMS = ['vercel', 'clerk', 'resend', 'tests'];
for (const id of LAZY_PLATFORMS) GETS[id] = () => laneB(`platforms/${id}.mjs`, id);
const POSTS = {
  review: (b) => (b.dryRun === true ? ok({ dryRun: true, plan: { method: 'WRITE', url: 'scripts/owner-dashboard/cc/review.json', body: { sha: b.sha, verdict: b.verdict } } })
    : laneB('repo.mjs', 'review', { sha: b.sha, verdict: b.verdict })),
  'github/action': githubAction,
  'supabase/action': supabaseAction,
  'cloudflare/action': cloudflareAction,
  'sentry/action': sentryAction,
  'hf/action': hfAction,
  'groq/action': groqAction,
  'discord/action': discordAction,
  'roblox/action': robloxAction,
  'connectors/action': connectorAction,
  'langflow/action': langflowAction,
  'apple/action': appleAction,
  'os/action': osAction,
};
for (const id of LAZY_PLATFORMS) POSTS[`${id}/action`] = (b) => laneB(`platforms/${id}.mjs`, `${id}Action`, b);
// ?fresh=1 on a GET drops that platform's cache first (the "refresh now" button). The keys match
// each module's cached() key; pulse refreshes nothing on its own.
const FRESH = { github: 'github', supabase: 'supabase', cloudflare: 'cloudflare', sentry: 'sentry', hf: 'hf', extras: 'extras',
  apple: 'apple', groq: 'groq', discord: 'discord', roblox: 'roblox', status: 'status', connectors: 'conn:', langflow: 'langflow',
  vercel: 'vercel', clerk: 'clerk', resend: 'resend', tests: 'tests' };

// The `pulse` SSE event: the pulse payload with the derived insights beside it.
const pulseEvent = async () => { const [p, i] = await Promise.all([pulse(), insights()]); return { ...p, insights: i.insights, insightCounts: i.counts }; };

// The repo-depth pages: lazy like the platforms above, but the GET hands its query (page, filters,
// sha, fresh) to the module. id -> exported function of platforms/<id>.mjs.
const REPO_PAGES = { commits: 'commits', models: 'models', 'design-history': 'designHistory', 'studio-shots': 'studioShots', 'repo-health': 'repoHealth' };
// The owner's pages (lane O): the libraries (query = tab, filters, page), costs and the owner console.
// ?fresh=1 drops the module's cached() key first; library caches per file mtime and has none.
const OWNER_PAGES = { library: 'library', costs: 'costs', business: 'business' };

async function api(req, res, name, query) {
  if (!localHost(req)) return sendJson(res, 403, fail('הבקשה חייבת להגיע מ-localhost'));
  if (name === 'stream' && req.method === 'GET') return stream(req, res, pulseEvent);
  if (name === 'media' && req.method === 'GET') return media(req, res, query);
  try {
    if (req.method === 'GET' && REPO_PAGES[name]) return sendJson(res, 200, await laneB(`platforms/${name}.mjs`, REPO_PAGES[name], query));
    if (req.method === 'GET' && OWNER_PAGES[name]) {
      if (query.get('fresh') === '1' && name !== 'library') uncache(name);
      return sendJson(res, 200, await laneB(`platforms/${name}.mjs`, OWNER_PAGES[name], query));
    }
    if (req.method === 'GET' && GETS[name]) {
      if (query.get('fresh') === '1' && FRESH[name]) uncache(FRESH[name]);
      return sendJson(res, 200, await GETS[name]());
    }
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
  const { pathname, searchParams } = new URL(req.url || '/', 'http://localhost');
  if (pathname.startsWith('/api/cc/')) { api(req, res, pathname.slice('/api/cc/'.length).replace(/\/+$/, ''), searchParams); return true; }
  if (pathname.startsWith('/control/')) { serveControl(res, pathname.slice('/control/'.length)); return true; }
  if (pathname === '/' && fs.existsSync(path.join(CONTROL, 'index.html'))) { serveControl(res, 'index.html'); return true; }
  return false;
}

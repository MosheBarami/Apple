// Static asset serving from D1 (deployed via /api/admin/static-upload) with edge caching.
// Rationale: the deploy channel available to this project cannot use Workers static assets,
// and this also lets the site/app update without redeploying the worker.
import type { Env } from './env';

const MIME: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  ico: 'image/x-icon',
  txt: 'text/plain; charset=utf-8',
  xml: 'application/xml',
  glb: 'model/gltf-binary',
  woff2: 'font/woff2',
  rbxm: 'application/octet-stream',
  webmanifest: 'application/manifest+json',
};

function contentTypeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return MIME[ext] ?? 'application/octet-stream';
}

export async function serveStatic(env: Env, req: Request): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('method not allowed', { status: 405 });
  const url = new URL(req.url);
  let path = decodeURIComponent(url.pathname);
  if (path.endsWith('/')) path += 'index.html';

  const cache = caches.default;
  const cacheKey = new Request(`https://static-cache${path}`, { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) return withSecurityHeaders(cached);

  const candidates = [path];
  if (!/\.[a-z0-9]+$/i.test(path)) candidates.push(`${path}.html`, `${path}/index.html`);
  let row: { path: string; n_chunks: number; content_type: string | null; immutable: number } | null = null;
  for (const p of candidates) {
    const r = await env.CORPUS.prepare(`select path, n_chunks, content_type, immutable from static_assets where path = ?`)
      .bind(p)
      .first<{ path: string; n_chunks: number; content_type: string | null; immutable: number }>();
    if (r) {
      row = r;
      break;
    }
  }
  if (!row) {
    // SPA fallback for /app/*, marketing 404 page otherwise
    const fallback = path.startsWith('/app') ? '/app/index.html' : '/404.html';
    const fb = await env.CORPUS.prepare(`select path, n_chunks, content_type, immutable from static_assets where path = ?`)
      .bind(fallback)
      .first<{ path: string; n_chunks: number; content_type: string | null; immutable: number }>();
    if (!fb) return new Response('not found', { status: 404 });
    row = fb;
    path = fallback;
  }

  const chunks = await env.CORPUS.prepare(`select data from static_chunks where path = ? order by idx`)
    .bind(row.path)
    .all<{ data: ArrayBuffer | number[] }>();
  const parts = chunks.results.map((c) => (c.data instanceof ArrayBuffer ? new Uint8Array(c.data) : Uint8Array.from(c.data as number[])));
  const total = parts.reduce((n, p2) => n + p2.byteLength, 0);
  const buf = new Uint8Array(total);
  let off = 0;
  for (const p2 of parts) {
    buf.set(p2, off);
    off += p2.byteLength;
  }

  const isNotFound = path === '/404.html' && !candidates.includes('/404.html');
  const headers = new Headers({
    'Content-Type': row.content_type ?? contentTypeFor(row.path),
    'Cache-Control': row.immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=60',
  });
  const res = new Response(buf, { status: isNotFound ? 404 : 200, headers });
  if (!isNotFound) {
    const forCache = res.clone();
    await cache.put(cacheKey, forCache);
  }
  return withSecurityHeaders(res);
}

function withSecurityHeaders(res: Response): Response {
  const out = new Response(res.body, res);
  out.headers.set('X-Content-Type-Options', 'nosniff');
  out.headers.set('X-Frame-Options', 'DENY');
  out.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return out;
}

export async function ensureStaticTables(env: Env): Promise<void> {
  await env.CORPUS.exec(
    `create table if not exists static_assets(path text primary key, n_chunks integer not null, content_type text, immutable integer default 0, updated_at integer)`
  );
  await env.CORPUS.exec(`create table if not exists static_chunks(path text not null, idx integer not null, data blob not null, primary key(path, idx))`);
}

// GET /api/cc/media?p=<repo-relative path>: serves one image or audio file from an allowlist of repo
// folders, read-only. Shared by the repo pages (design history, Studio shots), the Test Lab and the
// Libraries pages. The router's localhost check runs before this.
//
// Refused: anything not a plain relative path (absolute, "..", backslash, NUL, a leftover "%" that
// would mean double encoding), a path outside the allowlist, a hidden or dependency folder, a
// symlink whose real target leaves its allowlisted root, a non-file, an extension outside TYPES.
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from './http.mjs';

export const TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
};

// Folders whose media the dashboard may show. Evidence and gauntlet captures live in docs/; the
// asset packs and the sfx/vfx stores in packages/asset-library/; the visual eval sheets in
// packages/evals/tasks-visual/; the site and web-app design captures in their .qa/ and asset folders.
export const ALLOW = [
  'docs/',
  'packages/asset-library/',
  'packages/evals/tasks-visual/',
  'packages/training/runs/',
  'apps/site/.qa/',
  'apps/site/public/',
  'apps/site/src/assets/',
  'apps/site/brand/',
  'apps/web/.qa/',
  'apps/web/src/assets/',
];
// Studio captures an agent left at the repo root (".tmp-studio-ui.png"): exactly one file name, no folder.
const ROOT_FILE = /^\.tmp-[a-z0-9-]+\.(png|jpe?g|webp)$/i;
const BLOCKED_SEGMENT = /^(node_modules|\.git|\.venv|\.env.*|\.wrangler|\.claude)$/i;
const MAX_BYTES = 60 * 1024 * 1024;

/** The absolute path for `p`, or null when it is refused. Exported for the tests. */
export function resolveMedia(p) {
  if (typeof p !== 'string' || !p || p.length > 600) return null;
  if (/[\0\\%]/.test(p) || p.startsWith('/') || /^[a-z]:/i.test(p)) return null;
  const segs = p.split('/');
  if (segs.some((s) => s === '' || s === '.' || s === '..' || BLOCKED_SEGMENT.test(s))) return null;
  const ext = path.extname(p).toLowerCase();
  if (!TYPES[ext]) return null;
  const root = segs.length === 1 ? (ROOT_FILE.test(p) ? '' : null) : ALLOW.find((a) => p.startsWith(a));
  if (root == null) return null;
  const abs = path.resolve(REPO, p);
  const base = path.resolve(REPO, root);
  if (abs !== base && !abs.startsWith(base + path.sep) && root !== '') return null;
  if (root === '' && path.dirname(abs) !== REPO) return null;
  let real, realBase, st;
  try { real = fs.realpathSync(abs); realBase = fs.realpathSync(base); st = fs.statSync(real); } catch { return null; }
  if (root === '' ? path.dirname(real) !== realBase : !real.startsWith(realBase + path.sep)) return null;
  if (!st.isFile() || st.size > MAX_BYTES) return null;
  return { abs: real, size: st.size, type: TYPES[ext], mtime: st.mtime };
}

const notFound = (res) => { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'x-content-type-options': 'nosniff' }); res.end('not found'); };

export function media(req, res, query) {
  const f = resolveMedia(query.get('p'));
  if (!f) return notFound(res);
  const head = {
    'content-type': f.type, 'x-content-type-options': 'nosniff', 'cache-control': 'private, max-age=300',
    'last-modified': f.mtime.toUTCString(), 'accept-ranges': 'bytes', 'cross-origin-resource-policy': 'same-origin',
  };
  // An SVG opened on its own must not run script or reach out.
  if (f.type === 'image/svg+xml') head['content-security-policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  // One byte range, so an <audio> element can seek.
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
  let start = 0, end = f.size - 1, status = 200;
  if (m && (m[1] || m[2])) {
    if (m[1]) { start = Number(m[1]); if (m[2]) end = Math.min(end, Number(m[2])); } else start = Math.max(0, f.size - Number(m[2]));
    if (start > end || start >= f.size) { res.writeHead(416, { 'content-range': `bytes */${f.size}`, 'x-content-type-options': 'nosniff' }); res.end(); return; }
    status = 206; head['content-range'] = `bytes ${start}-${end}/${f.size}`;
  }
  head['content-length'] = String(end - start + 1);
  res.writeHead(status, head);
  const s = fs.createReadStream(f.abs, { start, end });
  s.on('error', () => res.destroy());
  s.pipe(res);
}

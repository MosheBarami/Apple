/**
 * Draws the web app the way a person sees it, for the guards that measure PIXELS and not sheets.
 *
 * Test support (it lives in tests/ so the dead-end checker counts it as test code). It builds apps/web
 * with Vite (the same Tailwind v4 pipeline, the same cascade, the same components) into a temporary
 * folder, serves that over loopback under /app/, and hands back a Chromium to drive it.
 *
 * ONE DIFFERENCE FROM THE BUNDLE THAT SHIPS, and it is the only one: the build is made in Vite's
 * development MODE with the fixture flag on (`VITE_STUDPILOT_MOCK=1`), because apps/web/src/lib/mock.ts
 * serves its fixtures only when `import.meta.env.DEV` is true (that gate is deliberate: a production
 * bundle never carries fake projects). The stylesheet is compiled by the same plugins from the same
 * sources, minus minification, so a colour that is wrong here is wrong in production. Measured
 * (planning/proof/M2/DESIGN-SYSTEM.md section 11.1): the production stylesheet draws the same pair on a
 * default-variant Button, which is the pair the Send button draws here.
 *
 * IT FAILS RATHER THAN SKIPS. No Vite, no Chromium and a failed build are each a failure to observe,
 * and a failure to observe must not render as a clean page: the error names which.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import { ROOT } from './repo-walk.mjs';

const WEB = join(ROOT, 'apps/web');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.map': 'application/json' };

/** Build apps/web into a fresh temporary folder (about 10 s). Returns { dir, css } where css is every stylesheet it emitted. */
export function buildMockWeb() {
  const vite = join(WEB, 'node_modules/vite/bin/vite.js');
  if (!existsSync(vite)) throw new Error(`cannot build the app: ${vite} is missing (run pnpm install); this guard fails rather than skips`);
  const dir = mkdtempSync(join(tmpdir(), 'design-web-'));
  const run = spawnSync(process.execPath, [vite, 'build', '--mode', 'development', '--outDir', dir, '--emptyOutDir', '--logLevel', 'error'], {
    cwd: WEB,
    encoding: 'utf8',
    timeout: 240_000,
    maxBuffer: 1 << 26,
    env: { ...process.env, NODE_ENV: 'development', VITE_STUDPILOT_MOCK: '1' },
  });
  if (run.status !== 0) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(`vite build of apps/web failed (exit ${run.status}): ${(run.stderr || run.stdout || String(run.error)).slice(-1500)}`);
  }
  const css = readdirSync(join(dir, 'assets')).filter((n) => n.endsWith('.css')).map((n) => readFileSync(join(dir, 'assets', n), 'utf8'));
  if (css.length === 0) throw new Error('the build emitted no stylesheet');
  return { dir, css, remove: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Serve a built app folder on a free loopback port under /app/ (with the single-page fallback). Returns { url, close }. */
export async function serveApp(dir) {
  const server = createServer((req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.startsWith('/app/')) path = path.slice(4);
    let file = normalize(join(dir, path));
    if (!file.startsWith(dir + sep) && file !== dir) { res.writeHead(403).end(); return; }
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(dir, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

/** Launch Chromium, or throw saying why not. */
export async function launchChromium() {
  let chromium;
  try {
    ({ chromium } = await import('@playwright/test'));
  } catch (e) {
    throw new Error(`cannot draw the app: @playwright/test is not installed (${e.message}); this guard fails rather than skips`);
  }
  try {
    return await chromium.launch();
  } catch (e) {
    throw new Error(`cannot draw the app: Chromium did not start (${String(e.message).split('\n')[0]}); run \`pnpm exec playwright install chromium\`. This guard fails rather than skips`);
  }
}

/**
 * A real Chromium over loopback, serving the built site, for the guards that measure what a browser draws.
 *
 * Fails rather than skips: no build, no browser, no server is a failure to observe, never a clean page. Not a test file.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join, normalize, sep } from 'node:path';
import { DIST, SITE } from './dist.mjs';

const ROOT = join(SITE, '..', '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.xml': 'application/xml' };

export function serveDist() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let file = normalize(join(DIST, decodeURIComponent(url.pathname)));
    if (!file.startsWith(DIST + sep) && file !== DIST) return void res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) return void res.writeHead(404).end('not found');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

export function chromium() {
  try {
    return createRequire(join(ROOT, 'package.json'))('@playwright/test').chromium;
  } catch (err) {
    return assert.fail(`cannot load @playwright/test at the repository root (${err.message}): a failure to observe, not a clean page`);
  }
}

/** Run `fn(browser, base)` with the build served on loopback and a Chromium launched; both are closed after. */
export async function withBrowser(fn) {
  const { server, port } = await serveDist();
  const browser = await chromium().launch();
  try {
    await fn(browser, `http://127.0.0.1:${port}`);
  } finally {
    await browser.close();
    server.close();
  }
}

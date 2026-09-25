import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const worker = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'apple-static-')), 'static.mjs');
execFileSync(join(worker, 'node_modules', '.bin', 'esbuild'),
  [join(worker, 'src', 'static.ts'), '--bundle', '--format=esm', '--platform=browser', '--outfile=' + out],
  { cwd: worker, stdio: 'pipe' });
const { serveStatic } = await import(`file://${out}`);

test('catalogue file URLs are internal even when old bytes remain in D1/cache', async () => {
  const env = { CORPUS: { prepare() { throw new Error('must not read D1'); } } };
  globalThis.caches = { default: { match: async () => new Response('previously cached image') } };
  for (const path of ['/asset-library/packs/icon.png', '/asset-library/%70acks/icon.png']) {
    for (const method of ['GET', 'HEAD']) {
      const response = await serveStatic(env, new Request(`https://apple.test${path}`, { method }));
      assert.equal(response.status, 404, `${method} ${path}`);
    }
  }
});

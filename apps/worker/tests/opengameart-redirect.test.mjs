/**
 * THE SECURITY CONTROL THAT NEVER RAN, AND THE 6,835 ASSETS IT COST.
 *
 * `importAsset` fetched an OpenGameArt direct download with `redirect: 'error'`, meaning "do not
 * follow a redirect away from the file the catalogue admitted". Cloudflare's Request documentation
 * lists `error` as a valid mode. The workerd fetch() this Worker runs on does not: it throws
 * `Invalid redirect value, must be one of "follow" or "manual"`.
 *
 * So the control threw on every call. The throw was caught and rendered as "download failed without
 * following redirects", which reads like the remote host misbehaving — and every one of the 6,835
 * OpenGameArt rows carrying a direct download URL has been unreachable since it shipped, while the
 * error message pointed away from the caller that caused it.
 *
 * These tests pin BOTH halves, because fixing only one is how the defect comes back:
 *   - the request is made in a mode the runtime actually supports, and
 *   - a redirect is still refused rather than followed.
 * A fix that reached for `follow` would pass the first and silently lose the second.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'apple-ogа-')), 'asset-import.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'asset-import.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { stdio: 'pipe', cwd: WORKER });
const { importAsset } = await import(out);

/** An OpenGameArt row with a direct download URL — the shape that was unreachable. */
const row = (over = {}) => ({
  id: 'opengameart/someone/thing', source: 'opengameart', kind: 'prop', name: 'Thing',
  sourceUrl: 'https://opengameart.org/content/thing',
  downloadUrl: 'https://opengameart.org/sites/default/files/thing.png',
  robloxAssetId: null, ...over,
});

/** Records how fetch was called, and answers with whatever the test wants. */
function fetchSpy(answer) {
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init: init ?? {} }); return answer(String(url)); };
  return calls;
}

const png = () => new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { status: 200, headers: { 'content-type': 'image/png' } });

test('the fetch uses a redirect mode this runtime supports — never the one that throws', async () => {
  const calls = fetchSpy(() => png());
  // No creator id is configured here, so the upload refuses AFTER the download. That is fine: the
  // subject of this test is the fetch, and reaching the upload refusal proves the download ran.
  await importAsset({ CORPUS: null }, row());
  assert.equal(calls.length, 1, 'the download should have been attempted exactly once');
  const mode = calls[0].init.redirect;
  assert.notEqual(mode, 'error', 'workerd fetch() throws on `error` — this is the defect');
  assert.equal(mode, 'manual', 'manual hands the 3xx back instead of following it');
});

test('a redirect is still refused, and the refusal names where it tried to go', async () => {
  fetchSpy(() => new Response(null, { status: 302, headers: { location: 'https://elsewhere.example/evil.png' } }));
  const outcome = await importAsset({ CORPUS: null }, row());
  assert.equal(outcome.ok, false);
  assert.match(outcome.error, /refusing a redirect/);
  assert.match(outcome.error, /302/);
  assert.match(outcome.error, /elsewhere\.example/, 'the destination belongs in the sentence');
});

test('a non-redirect download is not refused — the control did not become a blanket no', async () => {
  fetchSpy(() => png());
  const outcome = await importAsset({ CORPUS: null }, row());
  assert.ok(!/refusing a redirect/.test(outcome.error ?? ''), `a 200 must pass the redirect gate, got: ${outcome.error}`);
});

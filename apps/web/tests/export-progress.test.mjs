/**
 * THE EXPORT THAT SAID "PREPARING…" AND THEN NEVER SAID ANYTHING ELSE.
 *
 * Exporting a conversation fired one toast — "Preparing <project> as Markdown…" — called
 * `res.blob()` in a single await, and stopped. No completion, no byte count, no percentage, and on
 * a long transcript over a slow connection no way at all to tell a download in progress from a
 * download that died. The only outcome the user ever saw was the file appearing, or not.
 *
 * Worse than silent: a TRUNCATED transfer saved without complaint. A Markdown file that ends
 * mid-sentence and a JSON file that will not parse are both "success" to a reader that never
 * checked what it received against what was sent.
 *
 * `downloadExport` is EXECUTED here, not grepped — the browser globals it needs are four stubs, so
 * there is no excuse for asserting its source text instead of its behaviour. The cases are the ones
 * that would ship broken:
 *
 *   a server that declares no length must still complete, reporting an unknown total rather than
 *   dividing by zero and rendering NaN%;
 *   a digest that does not match must save NOTHING, because a half-file on disk with a plausible
 *   name is worse than no file;
 *   a response with no digest header at all — an older worker — must still save, or a deploy
 *   ordering makes the feature disappear.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const ESBUILD = join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild');
const out = join(mkdtempSync(join(tmpdir(), 'exportapi-')), 'api.mjs');
execFileSync(ESBUILD, [join(WEB, 'src', 'lib', 'api.ts'), '--bundle', '--format=esm', '--platform=neutral',
  '--main-fields=main,module', '--define:import.meta.env={}', '--outfile=' + out], { stdio: 'pipe' });
const { downloadExport, ApiError } = await import(`file://${out}`);
const { exportProgressLine, exportStartLine, exportDoneLine } = await import('../src/lib/export-progress.ts');

/* ---------------------------------------------------------- browser, stubbed --- */

const saved = [];
globalThis.URL.createObjectURL = () => 'blob:stub';
globalThis.URL.revokeObjectURL = () => {};
globalThis.requestAnimationFrame = (fn) => fn();
globalThis.document = {
  createElement: () => {
    const a = { href: '', download: '', click: () => saved.push({ name: a.download }), remove: () => {} };
    return a;
  },
  body: { appendChild: () => {} },
};

const sha256Hex = async (text) => {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

const BODY = '# Tower Defence\n\n## You\n\nbuild a lobby — with a spinning portal 🌀\n';

/** A response delivered in pieces, so the reader loop is actually exercised. */
function streamed(body, headers) {
  const bytes = new TextEncoder().encode(body);
  const stream = new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.byteLength; i += 8) controller.enqueue(bytes.slice(i, i + 8));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers });
}

const headersFor = async (body, over = {}) => ({
  'Content-Type': 'text/markdown; charset=utf-8',
  'Content-Disposition': 'attachment; filename="tower-defence-2026-09-14.md"',
  'Content-Length': String(new TextEncoder().encode(body).byteLength),
  'X-Golem-Export-SHA256': await sha256Hex(body),
  ...over,
});

/* ------------------------------------------------------------------ progress --- */

test('the download reports its progress, and the total the server declared', async () => {
  saved.length = 0;
  globalThis.fetch = async () => streamed(BODY, await headersFor(BODY));
  const seen = [];
  const result = await downloadExport('p1', 'md', (p) => seen.push(p));

  assert.ok(seen.length > 1, 'a single call at the end is not progress');
  const total = new TextEncoder().encode(BODY).byteLength;
  assert.equal(seen[seen.length - 1].received, total, 'the last report must account for every byte');
  assert.equal(seen[seen.length - 1].total, total, 'and must carry what the server said it was sending');
  for (let i = 1; i < seen.length; i += 1) assert.ok(seen[i].received > seen[i - 1].received, 'received must only ever grow');
  assert.equal(result.filename, 'tower-defence-2026-09-14.md', 'the saved name comes back so the caller can say it');
  assert.equal(saved.length, 1, 'and the file is saved exactly once');
});

test('A RESPONSE WITH NO CONTENT-LENGTH STILL COMPLETES, and reports an unknown total', async () => {
  // The case that produces `NaN%` in every implementation that divides first and asks later.
  saved.length = 0;
  const headers = await headersFor(BODY);
  delete headers['Content-Length'];
  globalThis.fetch = async () => streamed(BODY, headers);
  const seen = [];
  await downloadExport('p1', 'md', (p) => seen.push(p));

  assert.ok(seen.length > 0, 'progress is still reported');
  for (const p of seen) {
    assert.equal(p.total, null, 'an undeclared total is null, not 0 and not NaN');
    assert.ok(Number.isFinite(p.received));
  }
  assert.equal(saved.length, 1, 'and the file still saves');
});

test('the line a user reads never contains NaN, Infinity or a percentage of nothing', () => {
  const unknown = exportProgressLine('Tower Defence', 'md', { received: 2048, total: null });
  assert.doesNotMatch(unknown, /NaN|Infinity|undefined|%/);
  assert.match(unknown, /2/, 'it says how much has arrived, since it cannot say how much is left');

  const half = exportProgressLine('Tower Defence', 'md', { received: 50, total: 100 });
  assert.match(half, /50%/);

  // A zero total is the divide-by-zero case arriving as a number rather than as an absence.
  assert.doesNotMatch(exportProgressLine('Tower Defence', 'md', { received: 0, total: 0 }), /NaN|Infinity|%/);

  // Over-declared progress: the body is decompressed by the time it is counted while
  // Content-Length describes the compressed bytes, so `received` can exceed `total`. Clamped
  // rather than printed — 340% is a meter reporting its own confusion to the user.
  assert.match(exportProgressLine('Tower Defence', 'md', { received: 340, total: 100 }), /100%/);
});

test('the three lines agree on what this export is called', () => {
  assert.match(exportStartLine('Tower Defence', 'md'), /Tower Defence/);
  assert.match(exportStartLine('Tower Defence', 'md'), /Markdown/);
  assert.match(exportStartLine('Tower Defence', 'json'), /JSON/);
  assert.match(exportDoneLine('tower-defence-2026-09-14.md'), /tower-defence-2026-09-14\.md/);
});

/* ----------------------------------------------------------------- integrity --- */

test('A TRUNCATED DOWNLOAD SAVES NOTHING and says which one it was', async () => {
  saved.length = 0;
  const headers = await headersFor(BODY); // the digest of the WHOLE body
  globalThis.fetch = async () => streamed(BODY.slice(0, 20), headers); // …and half of it arrives
  await assert.rejects(
    () => downloadExport('p1', 'md'),
    (e) => {
      assert.ok(e instanceof ApiError, 'a refusal the UI already knows how to show');
      assert.match(e.message, /incomplete|truncated/i, 'named as a broken transfer, not as a server error');
      return true;
    },
  );
  assert.equal(saved.length, 0, 'a half file on disk with a plausible name is worse than no file');
});

test('an export with no digest header still saves — an older worker must not break the feature', async () => {
  saved.length = 0;
  const headers = await headersFor(BODY);
  delete headers['X-Golem-Export-SHA256'];
  globalThis.fetch = async () => streamed(BODY, headers);
  const result = await downloadExport('p1', 'md');
  assert.equal(saved.length, 1);
  assert.equal(result.verified, false, 'and it says plainly that nothing was verified');
});

test('a verified download says so, rather than leaving the caller to assume', async () => {
  saved.length = 0;
  globalThis.fetch = async () => streamed(BODY, await headersFor(BODY));
  const result = await downloadExport('p1', 'md');
  assert.equal(result.verified, true);
  assert.equal(result.bytes, new TextEncoder().encode(BODY).byteLength);
});

test('a refusal is still a refusal, with the worker\'s own sentence', async () => {
  saved.length = 0;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  await assert.rejects(() => downloadExport('p1', 'md'), (e) => e instanceof ApiError && e.status === 404 && /not found/.test(e.message));
  assert.equal(saved.length, 0);
});

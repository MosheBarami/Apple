/**
 * "DOWNLOAD ALL" HAS TO REACH THE ROUTE THAT EXISTS.
 *
 * The archive is built and route-tested in apps/worker/tests/files-archive-live.test.mjs. What this
 * file pins is the other half — that something on a screen calls it, that it calls the path the
 * worker actually registers, and that the button is not offered when the only possible outcome is
 * the worker's own refusal.
 *
 * That last one is the point. An empty workspace is answered with "there are no files in this
 * project to download", which is right, and a button that produces it is a control wired to a
 * message rather than to a capability.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const panel = readFileSync(join(WEB, 'src', 'components', 'ws', 'files-panel.tsx'), 'utf8');
const api = readFileSync(join(WEB, 'src', 'lib', 'api.ts'), 'utf8');

test('the panel offers the archive, and only when there is something in it', () => {
  assert.match(panel, /downloadProjectArchive\(projectId\)/, 'the button must call the archive');
  assert.match(panel, /data\.fileCount > 0 && \(/, 'and must not be offered over an empty workspace');
});

test('a refusal is shown, not swallowed', () => {
  // The archive route can legitimately refuse — an empty workspace, a deployment with no KV — and
  // a download that silently does nothing is the failure mode this product keeps writing tests for.
  const at = panel.indexOf('downloadProjectArchive(projectId)');
  const around = panel.slice(at - 400, at + 400);
  assert.match(around, /catch/, 'the refusal must be caught');
  assert.match(around, /setNotice\(/, 'and put on the screen');
});

test('the client asks for the path the worker serves, with the token it requires', () => {
  const fn = api.slice(api.indexOf('export async function downloadProjectArchive'));
  const body = fn.slice(0, 1400);
  assert.match(body, /\/files\/archive/, 'the path must be the one index.ts registers');
  assert.match(body, /headers\.set\('Authorization', `Bearer \$\{token\}`\)/, 'a zip route is an /api route and needs the bearer');
  assert.match(body, /Content-Disposition/, 'the server names the file — a second slug rule here would disagree with it');
  assert.match(body, /URL\.revokeObjectURL/, 'and the blob is released');
});

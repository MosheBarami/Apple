// The post-login redirect target is attacker-reachable: the catch-all
// `<Route path="*">` lives INSIDE AuthGuard, so any path — including one from a
// crafted link — is stored as `from` and later handed to `navigate()`.
// react-router 6.30.6 is inside the vulnerable range for the backslash
// open-redirect (fixed in 7.18.0), so these cases are live, not theoretical.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');
// esbuild resolves into apps/worker only — it is a transitive dep of wrangler,
// and apps/web builds through vite, which bundles its own copy. packages/evals
// reaches for the same binary for the same reason; this follows that precedent
// rather than adding a dependency to apps/web for one test.
const ESBUILD = join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild');
const out = join(mkdtempSync(join(tmpdir(), 'studpilot-safe-redirect-')), 'safe-redirect.mjs');
execFileSync(ESBUILD, [join(WEB, 'src', 'lib', 'safe-redirect.ts'), '--format=esm', '--outfile=' + out], {
  stdio: 'pipe',
  cwd: WEB,
});
const { safeInternalPath } = await import(out);

test('an off-origin target is refused however it is spelled', () => {
  const hostile = [
    '/\\evil.com', // the backslash trick the advisory names
    '//evil.com', // protocol-relative
    '/\\/evil.com',
    '\\\\evil.com',
    'https://evil.com',
    '//evil.com/path',
    '/javascript:alert(1)',
    '/	//evil.com',
    '/\0//evil.com',
  ];
  for (const h of hostile) {
    assert.equal(safeInternalPath(h), '/', `must refuse ${JSON.stringify(h)}`);
  }
});

test('a genuine in-app route still survives — the guard must not break the feature', () => {
  // Every protected route in app.tsx, which is the whole reason `from` exists.
  for (const ok of [
    '/',
    '/usage',
    '/settings',
    '/admin',
    '/ui-lab',
    '/projects/abc-123',
    '/projects/abc-123/roadmap',
    '/projects/abc?tab=plan#top',
  ]) {
    assert.equal(safeInternalPath(ok), ok, `must preserve ${ok}`);
  }
});

test('a missing or malformed value falls back rather than throwing', () => {
  for (const bad of [undefined, null, '', 42, {}, []]) {
    assert.equal(safeInternalPath(bad), '/');
  }
  assert.equal(safeInternalPath(undefined, '/dashboard'), '/dashboard');
});

test('the sink actually uses it — a regression here silently reopens the redirect', () => {
  const src = readFileSync(join(WEB, 'src', 'routes', 'auth-pages.tsx'), 'utf8');
  assert.match(src, /safeInternalPath\(/, 'auth-pages.tsx must validate the redirect target');
  assert.doesNotMatch(
    src,
    /const from = \(location\.state[^\n]*\)\?\.from \?\? '\/'/,
    'the raw, unvalidated read must not come back',
  );
});

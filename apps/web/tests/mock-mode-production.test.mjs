/**
 * A PRODUCTION BUILD CANNOT BE SWITCHED INTO MOCK MODE.
 *
 * Mock mode replaces every network read with fixtures and the project socket with a scripted
 * session — a signed-in-looking app with fake projects, fake credits and a fake Studio. That is
 * right for a design reviewer on a dev server and wrong anywhere a customer can reach: the header
 * of mock.ts promised "nothing here runs in a normal production build", but the env flag was OR-ed
 * in OUTSIDE the `import.meta.env.DEV` check, so `VITE_STUDPILOT_MOCK=1 vite build` shipped a
 * production bundle that never talked to the API.
 *
 * EXECUTED, not source-read: mock.ts is bundled twice with the two values Vite substitutes for
 * `import.meta.env.DEV`, and the exported MOCK_MODE is read from each.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
// esbuild is Vite's own dependency — the same transformer the real build uses.
const esbuild = createRequire(require.resolve('vite'))('esbuild');
const TMP = mkdtempSync(join(tmpdir(), 'mock-mode-'));

async function mockModeWhen({ dev, flag, query = '' }) {
  const out = join(TMP, `mock-${dev}-${flag}-${query ? 'q' : 'n'}.mjs`);
  await esbuild.build({
    entryPoints: [join(WEB, 'src', 'lib', 'mock.ts')],
    bundle: true, format: 'esm', platform: 'neutral', outfile: out, logLevel: 'silent',
    define: {
      'import.meta.env.DEV': String(dev),
      'import.meta.env.VITE_STUDPILOT_MOCK': flag === undefined ? 'undefined' : JSON.stringify(flag),
    },
  });
  globalThis.window = { location: { search: query } };
  try {
    return (await import(pathToFileURL(out).href)).MOCK_MODE;
  } finally {
    delete globalThis.window;
  }
}

test('a production build with VITE_STUDPILOT_MOCK=1 still talks to the real API', async () => {
  assert.equal(await mockModeWhen({ dev: false, flag: '1' }), false);
});

test('a production build ignores ?mock=1 in the address bar', async () => {
  assert.equal(await mockModeWhen({ dev: false, flag: undefined, query: '?mock=1' }), false);
});

test('CONTROL: a dev server still turns mock mode on, by flag or by query', async () => {
  // Without these the two tests above would hold on a MOCK_MODE hard-wired to false.
  assert.equal(await mockModeWhen({ dev: true, flag: '1' }), true);
  assert.equal(await mockModeWhen({ dev: true, flag: undefined, query: '?mock=1' }), true);
  assert.equal(await mockModeWhen({ dev: true, flag: undefined }), false);
});

// THE REVIEW FLAG `?studio=off` (M2 fix cycle 1) makes the MOCK app's Studio disconnected, so the screenshots strip's "Connect Studio" lines can be
// photographed. It must never reach a real session: the one caller is inside the socket hook's mock branch, which production folds away.
test('?studio=off disconnects the MOCK app\'s Studio and nothing else uses the flag', async () => {
  const out = join(TMP, 'mock-studio-flag.mjs');
  await esbuild.build({
    entryPoints: [join(WEB, 'src', 'lib', 'mock.ts')], bundle: true, format: 'esm', platform: 'neutral', outfile: out, logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'true', 'import.meta.env.VITE_STUDPILOT_MOCK': 'undefined' },
  });
  const { mockStudioConnected } = await import(pathToFileURL(out).href);
  const askedWith = (search) => { globalThis.window = { location: { search } }; try { return mockStudioConnected(); } finally { delete globalThis.window; } };
  assert.equal(askedWith('?mock=1'), true, 'connected by default');
  assert.equal(askedWith('?mock=1&studio=off'), false);
  assert.equal(askedWith('?mock=1&studio=on'), true, 'only "off" disconnects');
  const hook = readFileSync(join(WEB, 'src', 'lib', 'use-project-socket.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');
  const uses = [...hook.matchAll(/mockStudioConnected\(\)/g)];
  assert.equal(uses.length, 1, 'the flag is read in one place');
  const loadHistory = hook.slice(hook.indexOf('const loadHistory = useCallback'), hook.indexOf('const loadCheckpoints = useCallback'));
  assert.match(loadHistory, /if \(MOCK_MODE\) \{[\s\S]*?mockStudioConnected\(\)[\s\S]*?return;\s*\}/, 'the flag is read outside the mock branch, where production runs it');
});

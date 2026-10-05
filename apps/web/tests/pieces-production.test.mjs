/**
 * THE PIECES STUB IS NOT IN A PRODUCTION BUILD (M2 step 2.3, item C5).
 *
 * The per-piece settings panel is built against sample pieces (lib/pieces-stub.ts). A sample piece shown to a customer would be a build
 * result that never happened, so the stub is reached only through a dynamic import behind `import.meta.env.DEV` (lib/pieces.ts).
 *
 * EXECUTED, not source-read, the way tests/mock-mode-production.test.mjs is: lib/pieces.ts is bundled twice with the two values Vite
 * substitutes for `import.meta.env.DEV`, and what comes out is read. The real `vite build` is checked the same way by
 * scripts/check-app-bundle.mjs (it greps dist for the marker), which CI runs after the build.
 *
 *   production  -> `loadPieces()` answers an empty list, and the bundle holds neither the marker nor a sample name;
 *   development -> the sample pieces are there (the control: without it the production half could pass on a stub that never loads).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve('vite'))('esbuild');
const TMP = mkdtempSync(join(tmpdir(), 'pieces-prod-'));
const MARKER = 'studpilot-pieces-stub-v1';
const SAMPLE_NAMES = ['Sample shop screen', 'Sample coin system', 'Sample lava zone'];

async function bundleWhen(dev, entry = join(WEB, 'src', 'lib', 'pieces.ts')) {
  const out = join(TMP, `pieces-${dev}-${Math.random().toString(36).slice(2)}.mjs`);
  await esbuild.build({
    entryPoints: [entry],
    bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
    // Vite emits dynamic imports as separate chunks; a single file keeps every byte the page could ever fetch in one place to read.
    splitting: false,
    define: { 'import.meta.env.DEV': String(dev), 'import.meta.env.PROD': String(!dev), 'process.env.NODE_ENV': '"production"' },
  });
  return { out, source: readFileSync(out, 'utf8') };
}

test('a PRODUCTION bundle of the pieces module contains no sample piece, and loadPieces() answers nothing', async () => {
  const { out, source } = await bundleWhen(false);
  assert.equal(source.includes(MARKER), false, 'the stub’s marker is in the production bundle');
  for (const name of SAMPLE_NAMES) assert.equal(source.includes(name), false, `"${name}" is in the production bundle`);
  assert.equal(/pieces-stub/.test(source), false, 'the production bundle still names the stub module');
  const { loadPieces } = await import(pathToFileURL(out).href);
  assert.deepEqual(await loadPieces(), []);
});

test('CONTROL: a DEVELOPMENT bundle has the sample pieces, so the production half is not passing on a stub that never loads', async () => {
  const { out, source } = await bundleWhen(true);
  assert.equal(source.includes(MARKER), true, 'the development bundle has no stub at all');
  for (const name of SAMPLE_NAMES) assert.equal(source.includes(name), true, `${name}`);
  const { loadPieces } = await import(pathToFileURL(out).href);
  const pieces = await loadPieces();
  assert.equal(pieces.length, 3);
  assert.ok(pieces.every((piece) => piece.specimen === true), 'every sample piece says it is a specimen');
});

test('a PRODUCTION bundle of the panel (the whole component graph) holds no sample piece either', async () => {
  const { source } = await bundleWhen(false, join(WEB, 'src', 'components', 'ws', 'pieces-panel.tsx'));
  assert.equal(source.includes(MARKER), false, 'the stub reached the production panel bundle');
  for (const name of SAMPLE_NAMES) assert.equal(source.includes(name), false, name);
  // The panel's own words survive: its empty state is the production behaviour.
  assert.ok(source.includes('Pieces appear here after a build'));
});

/* ------------------------------------------------------------------ the import graph (source) --- */

function sources(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sources(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');

test('the stub is imported from ONE place, dynamically, and inside the DEV branch', () => {
  const files = sources(join(WEB, 'src'));
  assert.ok(files.length > 100, 'the scan read the app');
  const importers = files
    .filter((f) => /pieces-stub/.test(strip(readFileSync(f, 'utf8'))))
    .map((f) => relative(join(WEB, 'src'), f));
  // The stub's own file does not count (it is the module itself and names itself only in its marker).
  assert.deepEqual(importers.filter((f) => f !== join('lib', 'pieces-stub.ts')), [join('lib', 'pieces.ts')]);
  const pieces = strip(readFileSync(join(WEB, 'src', 'lib', 'pieces.ts'), 'utf8'));
  assert.match(pieces, /if \(import\.meta\.env\.DEV\) \{\s*const \{ STUB_PIECES \} = await import\('\.\/pieces-stub'\);\s*return STUB_PIECES;\s*\}/, 'the import is not a dynamic import inside the DEV branch');
  assert.doesNotMatch(pieces, /^import .*pieces-stub/m, 'a static import of the stub');
  assert.doesNotMatch(pieces, /import\.meta\.env\.(PROD|MODE)|VITE_/, 'something other than the DEV constant decides whether the stub loads');
});

test('no environment flag can load the stub into a production build', () => {
  const pieces = strip(readFileSync(join(WEB, 'src', 'lib', 'pieces.ts'), 'utf8'));
  // The mock app's flags (?mock=1, VITE_STUDPILOT_MOCK) are not consulted here: only the build-time constant is.
  assert.doesNotMatch(pieces, /window\.location|URLSearchParams|MOCK_MODE|VITE_STUDPILOT_MOCK|localStorage|sessionStorage/);
});

test('the real build is checked too: check-app-bundle.mjs fails when the stub’s marker is in dist', () => {
  const script = strip(readFileSync(join(WEB, '..', '..', 'scripts', 'check-app-bundle.mjs'), 'utf8'));
  const list = /const MUST_BE_ABSENT = \[([^\]]*)\]/.exec(script)?.[1] ?? '';
  assert.ok(list.includes(`'${MARKER}'`), 'the production build is not searched for the stub marker');
  assert.ok(list.includes("'Sample shop screen'"), 'nor for a sample name');
  assert.match(script, /for \(const route of MUST_BE_ABSENT\)/, 'and the list is actually read');
});

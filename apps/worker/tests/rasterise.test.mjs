// SVG to PNG, which 78% of the library depends on.
//
// Roblox takes .png, .jpeg, .bmp and .tga. Iconify (348,522 rows) and game-icons publish SVG, so
// without this step those rows are a catalogue that can never become anything — a search result
// that wastes somebody's time. The cases here are about the two ways a rasteriser fails quietly:
// it renders SOMETHING for input that was never an image, and it renders an icon nobody can see.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
// INSIDE apps/worker, not in tmpdir: the bundle keeps `@resvg/resvg-wasm/index_bg.wasm` external
// (node cannot load wrangler's compiled-module form), and an external import is resolved from
// wherever the bundle SITS. In tmpdir that is nowhere, and the whole file fails to load with
// ERR_MODULE_NOT_FOUND — one error that reads as seven broken assertions.
const out = join(mkdtempSync(join(tmpdir(), 'raster-')), 'r.mjs');
// The wasm module is STUBBED here. Node cannot load wrangler's compiled-module form of a `.wasm`
// import, and these cases are about the PURE decisions — what is refused, how currentColor
// resolves, how an Iconify record becomes a document — none of which reach it. The render itself
// is exercised against the deployed worker, by the real runtime, and this file does not pretend
// otherwise.
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'rasterise.ts'), '--bundle', '--format=esm', '--target=es2022',
   `--alias:@resvg/resvg-wasm/index_bg.wasm=${join(WORKER, 'tests', 'fixtures', 'wasm-stub.mjs')}`,
   '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const R = await import(`file://${out}`);

test('input that was never an image is REFUSED, not rendered as something', async () => {
  // The realistic bad input is an HTML error page served with a 200, and it starts with `<` too —
  // which is why the check is for an <svg> element and not for a leading angle bracket.
  // THE MESSAGE IS ASSERTED, NOT JUST THE REFUSAL. Deleting the <svg> check entirely still left
  // every case here failing — the renderer refuses them too, so `ok: false` is satisfied either
  // way and the guard was unfalsifiable. Requiring the SHAPE check's own words is what makes the
  // difference visible: markup with no svg must be turned away before a megabyte of WASM is
  // involved, and the reason must say which of the two happened.
  for (const [bad, why, expected] of [
    ['', 'empty', /not SVG/],
    ['not markup at all', 'plain text', /not SVG/],
    ['{"error":"nope"}', 'JSON', /not SVG/],
    ['<!doctype html><html><body>404</body></html>', 'an HTML error page', /no <svg> element/],
    ['<div><p>hello</p></div>', 'markup with no svg', /no <svg> element/],
  ]) {
    const r = await R.rasteriseSvg(bad);
    assert.equal(r.ok, false, `${why} must be refused`);
    assert.equal(r.png, undefined, `${why} must produce no bytes`);
    assert.match(r.error ?? '', expected, `${why}: the reason must come from the shape check`);
  }
});

test('CURRENTCOLOR BECOMES A COLOUR YOU CAN SEE', () => {
  // resvg has no CSS cascade, so `fill="currentColor"` renders BLACK: a black icon on a
  // transparent background, invisible on the dark UI most Roblox games use. An icon that cannot be
  // seen is a failure that renders as a success.
  const svg = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M0 0h24v24H0z"/></svg>';
  assert.match(R.withColour(svg, '#ffffff'), /fill="#ffffff"/);
  assert.equal(/currentColor/.test(R.withColour(svg, '#ffffff')), false, 'none may survive');
});

test('every occurrence is replaced, not just the first', () => {
  const svg = '<svg><path fill="currentColor"/><path stroke="currentColor"/><g fill="currentColor"/></svg>';
  assert.equal((R.withColour(svg, '#abcdef').match(/currentColor/g) ?? []).length, 0);
  assert.equal((R.withColour(svg, '#abcdef').match(/#abcdef/g) ?? []).length, 3);
});

test('a colour that is not a colour falls back to white rather than into the document', () => {
  // The value reaches this from a caller, and an unchecked substitution would put arbitrary text
  // inside an attribute in a document that is about to be parsed.
  for (const bad of ['red; }</svg><script>', 'url(#x)', '', 'currentColor', 'javascript:1']) {
    const outSvg = R.withColour('<svg><path fill="currentColor"/></svg>', bad);
    assert.match(outSvg, /fill="#ffffff"/, `"${bad}" must not reach the document`);
  }
});

test('AN ICONIFY RECORD BECOMES A DOCUMENT AT THE SET S OWN SIZE', () => {
  // Iconify stores bare path data plus the SET width and height — not the icon s. Defaulting to
  // 24x24 would crop or letterbox every icon in any set that is not (game-icons is 512x512), and
  // it would do it silently, one icon at a time.
  const body = '<path d="M0 0h512v512H0z"/>';
  assert.match(R.iconifySvg(body, 512, 512), /viewBox="0 0 512 512"/);
  assert.match(R.iconifySvg(body, 512, 512), /width="512"/);
  assert.match(R.iconifySvg(body), /viewBox="0 0 24 24"/, 'the documented default when a set omits them');
  assert.ok(R.iconifySvg(body, 512, 512).includes(body), 'the path must survive intact');
});

test('a nonsense size does not produce a nonsense viewBox', () => {
  for (const bad of [0, -5, NaN, undefined, 'big']) {
    assert.match(R.iconifySvg('<path/>', bad, bad), /viewBox="0 0 24 24"/, String(bad));
  }
});

test('the raster size is clamped to what Roblox can use', () => {
  assert.equal(R.MAX_RASTER_PX, 1024, 'Roblox caps textures at 1024');
  assert.ok(R.DEFAULT_RASTER_PX <= R.MAX_RASTER_PX);
  assert.ok(R.DEFAULT_RASTER_PX >= 64, 'an icon smaller than this is not worth uploading');
});


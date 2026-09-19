import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('..', import.meta.url));
const out = join(mkdtempSync(join(tmpdir(), 'apple-image-save-')), 'api.mjs');
execFileSync(join(web, '../worker/node_modules/.bin/esbuild'), [join(web, 'src/lib/api.ts'), '--bundle', '--format=esm', '--platform=neutral', '--main-fields=main,module', '--define:import.meta.env={}', `--outfile=${out}`], { stdio: 'pipe' });
const api = await import(`file://${out}`);

test('image save downloads fetched bytes and releases the blob after the browser reads it', async (t) => {
  const events = [];
  const link = { click() { events.push(['click', this.href, this.download]); }, remove() { events.push(['remove']); } };
  t.mock.method(URL, 'createObjectURL', (blob) => { assert.equal(blob.type, 'image/jpeg'); return 'blob:verified'; });
  t.mock.method(URL, 'revokeObjectURL', (url) => events.push(['revoke', url]));
  const previousDocument = globalThis.document;
  const previousFrame = globalThis.requestAnimationFrame;
  let nextFrame;
  globalThis.document = { createElement: () => link, body: { appendChild: () => events.push(['append']) } };
  globalThis.requestAnimationFrame = (fn) => { nextFrame = fn; };
  t.after(() => { globalThis.document = previousDocument; globalThis.requestAnimationFrame = previousFrame; });
  await api.downloadProjectImage('project', 'image', async (project, image) => {
    assert.equal(project, 'project'); assert.equal(image, 'image');
    return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/png' });
  });
  assert.deepEqual(events, [['append'], ['click', 'blob:verified', 'apple-image-image.jpg'], ['remove']]);
  nextFrame();
  assert.deepEqual(events.at(-1), ['revoke', 'blob:verified']);
});

test('expired or unauthorized images reject instead of pretending a file was saved', async () => {
  const error = new Error('expired');
  await assert.rejects(() => api.downloadProjectImage('p', 'i', async () => { throw error; }), (value) => value === error);
});

test('save uses authenticated image fetch and is offered only for project-owned image paths', () => {
  const source = readFileSync(join(web, 'src/lib/api.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const render = readFileSync(join(web, 'src/lib/generative-ui/render.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(source, /fetchImage\s*=\s*fetchImageBlob/);
  assert.match(render, /parseImagePath\(asset\.thumbnail\.src\)/);
  assert.match(render, /<SaveImage\b/);
});

test('download format follows raster bytes, not a possibly incorrect content type', async () => {
  for (const [bytes, extension, mime] of [
    [[137,80,78,71,13,10,26,10], 'png', 'image/png'],
    [[255,216,255,224], 'jpg', 'image/jpeg'],
    [[82,73,70,70,0,0,0,0,87,69,66,80], 'webp', 'image/webp'],
    [[71,73,70,56,57,97], 'gif', 'image/gif'],
  ]) {
    assert.deepEqual(await api.imageDownloadFormat(new Blob([new Uint8Array(bytes)], { type: 'text/html' })), { extension, mime });
  }
});

test('unknown, HTML and SVG bodies cannot be silently downloaded as image files', async () => {
  for (const text of ['', '<html>login</html>', '<svg onload="alert(1)"/>']) {
    await assert.rejects(() => api.downloadProjectImage('p', 'i', async () => new Blob([text], { type: 'image/png' })), /unsupported image/i);
  }
});

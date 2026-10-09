/**
 * make_image's picture pipeline (src/image-gen.ts): the prompt per kind, the background cut (key colour from the
 * edges, key-hued shadows, specks, spill), the crop, the fit and the measured 9-slice.
 *
 * Run with:  node --test tests/image-gen.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(join(tmpdir(), 'image-gen-'));
const out = join(temp, 'image-gen.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'image-gen.ts'), '--bundle', '--format=esm', '--platform=neutral', '--target=es2022', `--outfile=${out}`], { cwd: WORKER, stdio: 'pipe' });
const G = await import(pathToFileURL(out).href);
rmSync(temp, { recursive: true, force: true });

/** A w x h picture: a model-ish off-green background, a red rounded box, a dark-green "floor shadow" and one speck. */
function scene(w = 200, h = 160) {
  const data = new Uint8Array(w * h * 4);
  const set = (x, y, [r, g, b]) => { const i = (y * w + x) * 4; data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(x, y, [120, 220, 110]);
  for (let y = 30; y < 110; y++) for (let x = 40; x < 160; x++) {
    const cx = Math.min(x - 40, 159 - x), cy = Math.min(y - 30, 109 - y);
    if (cx < 12 && cy < 12 && (12 - cx) ** 2 + (12 - cy) ** 2 > 144) continue; // rounded corners
    set(x, y, cx < 4 || cy < 4 ? [20, 20, 20] : [220, 30, 30]);
  }
  for (let y = 130; y < 140; y++) for (let x = 60; x < 140; x++) set(x, y, [40, 140, 40]); // the floor shadow
  set(5, 150, [200, 200, 200]); // a speck
  return { width: w, height: h, data };
}

test('the cut removes the background, the key-hued shadow and specks, then crops to the subject', () => {
  const cut = G.cropToContent(G.cutBackground(scene()));
  assert.ok(cut, 'something is left');
  assert.ok(cut.width >= 120 && cut.width <= 126, `width ${cut.width}`);
  assert.ok(cut.height >= 80 && cut.height <= 86, `height ${cut.height} (the shadow under it is gone)`);
  const at = (x, y) => cut.data[(y * cut.width + x) * 4 + 3];
  assert.equal(at(0, 0), 0, 'the rounded corner is transparent');
  assert.equal(at(Math.floor(cut.width / 2), Math.floor(cut.height / 2)), 255, 'the middle is solid');
  for (let i = 0; i < cut.width * cut.height; i++) {
    if (cut.data[i * 4 + 3] === 0) continue;
    const [r, g, b] = [cut.data[i * 4], cut.data[i * 4 + 1], cut.data[i * 4 + 2]];
    assert.ok(g - Math.max(r, b) <= 60, 'no green spill survives');
  }
});

test('the measured slice keeps the corners out of the stretch and always leaves a middle', () => {
  const cut = G.cropToContent(G.cutBackground(scene()));
  const [l, t, r, b] = G.suggestSlice(cut);
  assert.ok(l >= 12 && t >= 12 && r >= 12 && b >= 12, `slice ${[l, t, r, b]} covers the 12 px corner`);
  assert.ok(l + r < cut.width && t + b < cut.height);
});

test('fitting keeps the shape inside the box; a texture is sized exactly', () => {
  const img = { width: 400, height: 100, data: new Uint8Array(400 * 100 * 4).fill(255) };
  const fit = G.resizeTo(img, 200, 200);
  assert.deepEqual([fit.width, fit.height], [200, 50]);
  assert.deepEqual([G.resizeTo(img, 64, 64, true).width, G.resizeTo(img, 64, 64, true).height], [64, 64]);
});

test('prompts: cut-out kinds ask for a flat key colour (magenta for green subjects); quoted text is drawn, else none', () => {
  const button = G.planImage({ prompt: 'a red glossy button', kind: 'button', style: 'cartoon' });
  assert.match(button.prompt, /pure green #00FF00/);
  assert.match(button.prompt, /no text/);
  assert.equal(button.cut, true);
  const leaf = G.planImage({ prompt: 'a green leaf icon', kind: 'icon' });
  assert.match(leaf.prompt, /magenta/);
  assert.deepEqual(leaf.key, [255, 0, 255]);
  const banner = G.planImage({ prompt: 'a ribbon with the text "SHOP"', kind: 'banner' });
  assert.match(banner.prompt, /render the quoted text exactly/);
  const texture = G.planImage({ prompt: 'studs', kind: 'texture' });
  assert.equal(texture.cut, false);
  assert.doesNotMatch(texture.prompt, /#00FF00/);
});

test('base64 round-trips bytes for the plugin download', () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 255, 128, 64]);
  assert.deepEqual([...Uint8Array.from(atob(G.toBase64(bytes)), (c) => c.charCodeAt(0))], [...bytes]);
});

test('the PNG for an Open Cloud upload decodes back to the same pixels', async () => {
  const { inflateSync } = await import('node:zlib');
  const img = { width: 3, height: 2, data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) };
  const png = Buffer.from(await G.encodeRgbaPng(img));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 3);
  assert.equal(png.readUInt32BE(20), 2);
  const idatLen = png.readUInt32BE(33);
  const raw = inflateSync(png.subarray(41, 41 + idatLen));
  assert.deepEqual([...raw.subarray(1, 13)], [...img.data.subarray(0, 12)]);
  assert.deepEqual([...raw.subarray(14, 26)], [...img.data.subarray(12, 24)]);
});

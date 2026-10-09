import test from 'node:test';
import assert from 'node:assert/strict';
import { framesToImages, MAX_EVIDENCE_IMAGES } from '../src/evidence-images.ts';

const rgb = (w, h) => Buffer.alloc(w * h * 3, 200).toString('base64');

test('render frames become PNG images, native viewport first, capped, bad frames dropped', async () => {
  const frames = [
    { rgbBase64: rgb(4, 3), width: 4, height: 3, view: 'hero', subject: 's', capturedAt: 1, source: 'software_render' },
    { rgbBase64: rgb(2, 2), width: 2, height: 2, view: 'x', subject: 's', capturedAt: 1, source: 'studio_viewport', encoding: 'rgb24' },
    { rgbBase64: rgb(2, 2), width: 9, height: 9, view: 'bad', subject: 's', capturedAt: 1 },
    { rgbBase64: 'AAAA', width: 2, height: 2, view: 'rle', subject: 's', capturedAt: 1, encoding: 'rle24' },
  ];
  const out = await framesToImages(frames);
  assert.deepEqual(out.map((i) => i.label), ['studio_viewport', 'hero']);
  for (const i of out) assert.equal(Buffer.from(i.base64, 'base64').subarray(1, 4).toString(), 'PNG');
  const many = Array.from({ length: 6 }, (_, n) => ({ rgbBase64: rgb(1, 1), width: 1, height: 1, view: `v${n}`, subject: 's', capturedAt: 1 }));
  assert.equal((await framesToImages(many)).length, MAX_EVIDENCE_IMAGES);
});

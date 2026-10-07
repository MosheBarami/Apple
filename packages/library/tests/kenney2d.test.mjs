import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kept, titleOf, pngSize } from '../src/ingest-kenney-2d.mjs';

test('kept: base-size PNGs in a folder; 2x copies, sheets and the root preview are not', () => {
  assert.equal(kept('PNG/Default (64px)/arrow.png'), true);
  assert.equal(kept('PNG/Double (128px)/arrow.png'), false);
  assert.equal(kept('PNG/Dark (2×)/crosshair001.png'), false);
  assert.equal(kept('Large (2×)/ai.png'), false);
  assert.equal(kept('PNG/White/2x/coin.png'), false);
  assert.equal(kept('Tilesheet/sheet.png'), false);
  assert.equal(kept('Preview.png'), false);
  assert.equal(kept('PNG/Blue/Default/button.svg'), false);
});

test('a title is the file words, then the variant folders, then the pack', () => {
  assert.equal(titleOf('PNG/Blue/Default/buttonLong_blue.png', 'UI Pack'), 'Button Long blue (Blue, UI Pack)');
  assert.equal(titleOf('PNG/Default (64px)/arrow_cross.png', 'Board Game Icons'), 'Arrow cross (Default (64px), Board Game Icons)');
});

test('pngSize reads the header', () => {
  const b = Buffer.alloc(32); b.write('\x89PNG', 0, 'latin1'); b.writeUInt32BE(64, 16); b.writeUInt32BE(32, 20);
  assert.deepEqual(pngSize(b), [64, 32]);
  assert.equal(pngSize(Buffer.from('not a png at all, really not')), null);
});

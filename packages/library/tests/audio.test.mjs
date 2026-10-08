import { test } from 'node:test';
import assert from 'node:assert/strict';
import { soundWords, createdOf } from '../src/ingest-kenney-audio.mjs';

test('a sound is named by its words, without take numbers', () => {
  assert.equal(soundWords('impactGlass_light_002'), 'impact glass light');
  assert.equal(soundWords('click1'), 'click');
  assert.equal(soundWords('1'), '1'); // a spoken number is all the name there is
});

test('a pack is dated by its License.txt creation date', () => {
  assert.equal(createdOf('Impact Sounds (1.0)\n\tCreation date: 19-12-2019\n'), '2019-12-19');
  assert.equal(createdOf('Casino Audio (1.1)'), undefined);
});

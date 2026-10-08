import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skyTags } from '../src/ingest-skies.mjs';
import { outdoorSky } from '../tools/fetch-polyhaven-hdris.mjs';

test('an outdoor sky is outdoor, with some sky in view', () => {
  assert.equal(outdoorSky({ categories: ['outdoor', 'nature'], attributes: { sky_view: 'open' } }), true);
  assert.equal(outdoorSky({ categories: ['indoor'], attributes: { environment: 'indoor' } }), false);
  assert.equal(outdoorSky({ categories: ['outdoor'], attributes: { sky_view: 'none' } }), false);
});

test('a sky is found by time of day, weather and contrast', () => {
  const t = skyTags({ tags: ['Hilltop'], categories: ['outdoor'], attributes: { time_of_day: 'sunset', weather: 'partly_cloudy', contrast: 'high' } });
  assert.deepEqual(t, ['hilltop', 'outdoor', 'sunset', 'partly cloudy', 'high contrast']);
});

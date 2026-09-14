// Reading direction resolution.
//
// The stylesheets had ~150 physical-direction declarations and nothing ever set `dir`, so a
// Hebrew interface did not merely look wrong — labels sat on the far side of their controls and
// every icon placed "before" its text landed after it. Text-flow properties are logical now, so
// these tests cover the half that decides WHEN to mirror.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isRtlLanguage, detectDirection } from '../src/lib/direction.ts';

test('Hebrew is recognised, with and without a region', () => {
  for (const tag of ['he', 'he-IL', 'HE', 'he_IL', 'iw', 'iw-IL']) {
    assert.equal(isRtlLanguage(tag), true, tag);
  }
});

test('the other major RTL scripts are recognised', () => {
  for (const tag of ['ar', 'ar-EG', 'fa', 'fa-IR', 'ur', 'ps', 'yi', 'ckb']) {
    assert.equal(isRtlLanguage(tag), true, tag);
  }
});

test('LTR languages are not mirrored', () => {
  for (const tag of ['en', 'en-US', 'fr', 'de', 'ru', 'ja', 'zh-CN', 'hi']) {
    assert.equal(isRtlLanguage(tag), false, tag);
  }
});

test('a Hebrew speaker anywhere in the language list gets RTL', () => {
  // Browsers send an ordered list. Someone whose first preference is English but who also reads
  // Hebrew still gets an interface that reads correctly.
  assert.equal(detectDirection(['he-IL', 'en-US']), 'rtl');
  assert.equal(detectDirection(['en-US', 'he']), 'rtl');
  assert.equal(detectDirection(['en-US', 'fr']), 'ltr');
});

test('an empty language list does not throw', () => {
  assert.equal(detectDirection([]), 'ltr');
});

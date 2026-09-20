// Reading direction resolution.
//
// The stylesheets had ~150 physical-direction declarations and nothing ever set `dir`, so a
// Hebrew interface did not merely look wrong — labels sat on the far side of their controls and
// every icon placed "before" its text landed after it. Text-flow properties are logical now, so
// these tests cover the half that decides WHEN to mirror.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isRtlLanguage, detectDirection, detectLanguage, UI_LANGUAGES } from '../src/lib/direction.ts';

test('Hebrew is NOT an RTL language this product knows about', () => {
  // Hebrew was removed from the product on 2026-09-20 — a Hebrew prompt was measured losing a word
  // silently on the way in, so the language stopped being offered rather than keep a promise it
  // could not hold. The owner asked for no connection to it anywhere, so `he` and `iw` left
  // RTL_LANGS too. This asserts the removal directly rather than leaving a gap where a test was.
  for (const tag of ['he', 'he-IL', 'HE', 'he_IL', 'iw', 'iw-IL']) {
    assert.equal(isRtlLanguage(tag), false, tag);
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

test('an English-only interface is NOT mirrored for a Hebrew speaker', () => {
  // THIS TEST USED TO ASSERT THE OPPOSITE, and the sentence it carried was "still gets an
  // interface that reads correctly." It does not. Every string in this app is English, so what a
  // Hebrew speaker actually got was English prose right-aligned with its full stops moved to the
  // far end, under `lang="he"` — a screen reader told to read English words in a Hebrew voice.
  //
  // The browser's language list says what the READER wants. It cannot say what this interface has
  // to give them, and mirroring is a decision about the second.
  assert.equal(detectDirection(['he-IL', 'en-US']), 'ltr');
  assert.equal(detectDirection(['he']), 'ltr');
  assert.equal(detectDirection(['ar-EG', 'en-US']), 'ltr');
  assert.equal(detectDirection(['en-US', 'fr']), 'ltr');
});

test('the mirroring turns on the day the interface is translated', () => {
  // The whole RTL apparatus — the logical properties, the bidi isolation on code, the mirrored
  // workspace — must stay live and provable while it is switched off, or it rots. Passing the
  // translated list is what proves it still works, without shipping a half-translated app.
  // Arabic stands in for the translated case now that Hebrew is gone from the product. The apparatus
  // being proved is the same and is the reason this test exists: it must stay live and provable
  // while it is switched off, or it rots.
  assert.equal(detectDirection(['ar-EG', 'en-US'], ['en', 'ar']), 'rtl');
  assert.equal(detectDirection(['en-US', 'ar'], ['en', 'ar']), 'rtl');
  // Still not mirrored for a language the interface does not have, even a translated one.
  assert.equal(detectDirection(['fa-IR', 'en-US'], ['en', 'ar']), 'ltr');
});

test('UI_LANGUAGES says what the interface actually speaks, and today that is English', () => {
  // A list that quietly grew a language nobody translated would turn the mirroring back on for
  // readers of a language the app cannot say a word of.
  assert.deepEqual([...UI_LANGUAGES], ['en']);
});

test('lang declares the words on the page, not the reader’s preference', () => {
  assert.equal(detectLanguage(['he-IL', 'en-US']), 'en');
  assert.equal(detectLanguage(['he']), 'en', 'a language we do not speak must not be claimed');
  assert.equal(detectLanguage(['he-IL', 'en'], ['en', 'he']), 'he', 'once translated, their preference is honoured in order');
  assert.equal(detectLanguage([]), 'en');
});

test('an empty language list does not throw', () => {
  assert.equal(detectDirection([]), 'ltr');
});

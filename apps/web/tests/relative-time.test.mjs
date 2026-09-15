/**
 * A TIMESTAMP IS HALF-LOCALISED UNTIL THE WORDS AROUND IT ARE TOO.
 *
 * `relativeTime` and `shortRelative` already routed the fallback DATE through Intl with the user's
 * locale and time zone. Everything nearer than a month was assembled from English literals — 'just
 * now', '2m ago', 'Yesterday', 'from now' — so in a Hebrew session the product rendered a Hebrew
 * date under an English clock, in a right-to-left paragraph, with a Latin unit letter glued to a
 * number. That is not a cosmetic gap: 'd' and 'm' are not units in Hebrew, and a Latin run inside
 * an RTL line is reordered by the bidi algorithm.
 *
 * THE PROPERTY, and the reason this file does not compare against a table of expected strings: under
 * a Hebrew locale, NO relative timestamp may contain a Latin letter. Any surviving English literal —
 * one branch missed, one fallback forgotten — fails it, and it keeps failing for a literal this test
 * was never written to know about.
 *
 * The English output is pinned separately, because the compact forms sit in a narrow rail and
 * "2 minutes ago" where "2m" used to be is a layout regression dressed as an improvement.
 *
 * Run with:  node --test tests/relative-time.test.mjs      (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { relativeTime, shortRelative } from '../src/lib/format.ts';

const S = (locale) => ({ locale, timeZone: 'UTC', hour12: undefined });
const EN = S('en-US');
const HE = S('he');

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const ago = (ms) => Date.now() - ms;

test('CONTROL: this runtime can actually format Hebrew', () => {
  // Without ICU data every locale silently becomes en-US and the Latin-letter assertion below is
  // vacuous — it would pass against the exact implementation it exists to reject.
  assert.notEqual(
    new Intl.RelativeTimeFormat('he', { numeric: 'auto', style: 'narrow' }).format(-2, 'minute'),
    new Intl.RelativeTimeFormat('en-US', { numeric: 'auto', style: 'narrow' }).format(-2, 'minute'),
  );
});

// ---------------------------------------------------------------- the property, stated negatively

const BUCKETS = [
  ['seconds', 10_000],
  ['minutes', 2 * MIN],
  ['an hour', 3 * HOUR],
  ['yesterday', 1.5 * DAY],
  ['days', 4 * DAY],
  ['past a month', 90 * DAY],
];

test('UNDER A HEBREW LOCALE NO RELATIVE TIMESTAMP CONTAINS A LATIN LETTER', () => {
  for (const [label, delta] of BUCKETS) {
    for (const [fn, name] of [[relativeTime, 'relativeTime'], [shortRelative, 'shortRelative']]) {
      const out = fn(ago(delta), HE);
      assert.doesNotMatch(out, /[A-Za-z]/, `${name} at ${label} rendered English: "${out}"`);
      assert.ok(out.length > 0, `${name} at ${label} rendered nothing`);
    }
  }
});

test('and a future instant is localised too, not "from now"', () => {
  const out = relativeTime(Date.now() + 5 * MIN, HE);
  assert.doesNotMatch(out, /[A-Za-z]/, `a future time rendered English: "${out}"`);
});

// ------------------------------------------------------------------ the English form is preserved

test('THE COMPACT ENGLISH FORM IS UNCHANGED — it lives in a narrow rail', () => {
  assert.equal(shortRelative(ago(2 * MIN), EN), '2m');
  assert.equal(shortRelative(ago(3 * HOUR), EN), '3h');
  assert.equal(shortRelative(ago(4 * DAY), EN), '4d');
  assert.equal(shortRelative(ago(5_000), EN), 'now');
});

test('the verbose English form still reads as it did', () => {
  assert.equal(relativeTime(ago(2 * MIN), EN), '2m ago');
  assert.equal(relativeTime(ago(3 * HOUR), EN), '3h ago');
  assert.equal(relativeTime(ago(4 * DAY), EN), '4d ago');
});

test('a future instant reads as a future instant', () => {
  assert.match(relativeTime(Date.now() + 5 * MIN, EN), /in 5m/);
});

test('YESTERDAY IS INTL’S WORD, NOT OURS', () => {
  // numeric:'auto' is what turns "1 day ago" into "yesterday" — and into "אתמול". Compared against
  // Intl's own output rather than a literal, so this asserts the OPTION is set rather than that
  // someone typed the right English word.
  const expected = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto', style: 'narrow' }).format(-1, 'day');
  assert.equal(shortRelative(ago(1.5 * DAY), EN), expected);
  assert.equal(shortRelative(ago(1.5 * DAY), HE), new Intl.RelativeTimeFormat('he', { numeric: 'auto', style: 'narrow' }).format(-1, 'day'));
});

// ------------------------------------------------------------------------------------ robustness

test('an unparseable or missing input still renders nothing rather than "Invalid Date"', () => {
  assert.equal(relativeTime('not a date', EN), '');
  assert.equal(shortRelative(null, EN), '');
  assert.equal(shortRelative(undefined, EN), '');
  assert.equal(shortRelative('not a date', EN), '');
});

test('a malformed locale cannot throw inside render', () => {
  // The same second line of defence the date formatters already have: these run inside render on
  // the very screens someone needs in order to undo the setting that broke them.
  const forged = { locale: 'not a locale', timeZone: 'Europe/Nowhere', hour12: undefined };
  assert.doesNotThrow(() => relativeTime(ago(2 * MIN), forged));
  assert.doesNotThrow(() => shortRelative(ago(2 * MIN), forged));
  assert.ok(relativeTime(ago(2 * MIN), forged).length > 0, 'and must still say something');
});

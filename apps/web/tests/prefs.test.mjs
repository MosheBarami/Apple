// Personal settings: the stored blob, and what the interface does with it.
//
// Two shapes of failure are covered here, and they are the two that a "preferences" feature always
// has:
//
//   1. THE BLOB IS PARSED STATE. Everything in storage arrives as `unknown`, and a settings object
//      is read on every single load — so a value that throws where it is USED takes the product
//      down for the one person who can no longer reach the screen that would fix it. The time zone
//      is the sharp edge: `Intl.DateTimeFormat` raises a RangeError on an unknown zone.
//
//   2. A PREFERENCE THAT NOTHING READS IS NOT A PREFERENCE. It is a control that moves. So the
//      resolvers are tested against the formatters they actually feed, with fixtures where the
//      regions genuinely disagree — a date order, a decimal separator, a clock — because a test
//      that formats 1000 in two locales that both render it "1,000" measures nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APPEARANCES,
  COMMON_TIME_ZONES,
  DEFAULT_PREFS,
  HOUR_CYCLES,
  MOTIONS,
  PREF_LABELS,
  REGIONS,
  REGION_NAMES,
  changedPrefs,
  isDefaultPrefs,
  isTimeZone,
  normalisePrefs,
  resolveAppearance,
  resolveHour12,
  resolveLocale,
  resolveReducedMotion,
  resolveTimeZone,
} from '../src/lib/prefs.ts';
import { clockTime, formatBytes, formatNumber, formatSettingsFrom, fullStamp, isoStamp, relativeTime } from '../src/lib/format.ts';

const prefs = (over = {}) => ({ ...DEFAULT_PREFS, ...over });

/* --------------------------------------------------------------- 1. the blob --- */

test('anything at all normalises to a usable settings object', () => {
  for (const junk of [null, undefined, '', 0, [], 'dark', { appearance: 42 }, { __proto__: { appearance: 'light' } }]) {
    const p = normalisePrefs(junk);
    assert.ok(APPEARANCES.includes(p.appearance), JSON.stringify(junk));
    assert.ok(MOTIONS.includes(p.motion));
    assert.ok(REGIONS.includes(p.region));
    assert.ok(HOUR_CYCLES.includes(p.hourCycle));
    assert.equal(typeof p.timeZone, 'string');
  }
});

test('one bad field does not discard the others', () => {
  // The tempting implementation validates the whole object and returns the defaults if anything is
  // wrong — which silently resets five settings the user did configure because of one stale key
  // written by a previous build.
  const p = normalisePrefs({
    appearance: 'light',
    motion: 'reduced',
    region: 'de-DE',
    hourCycle: 'NONSENSE',
    timeZone: 'Europe/Berlin',
  });
  assert.equal(p.hourCycle, DEFAULT_PREFS.hourCycle, 'the bad field falls back');
  assert.equal(p.appearance, 'light');
  assert.equal(p.motion, 'reduced');
  assert.equal(p.region, 'de-DE');
  assert.equal(p.timeZone, 'Europe/Berlin');
});

test('a time zone is refused before it is stored, not when it is rendered', () => {
  assert.equal(isTimeZone('Europe/Berlin'), true);
  assert.equal(isTimeZone('UTC'), true);
  assert.equal(isTimeZone('system'), true);
  for (const bad of ['Europe/Nowhere', 'Mars/Olympus', '', '   ', 'GMT+27', null, 42, {}]) {
    assert.equal(isTimeZone(bad), false, JSON.stringify(bad));
  }
  assert.equal(normalisePrefs({ timeZone: 'Europe/Nowhere' }).timeZone, 'system');
});

test('an invalid zone that got in anyway cannot throw inside render', () => {
  // The second line of defence. `new Intl.DateTimeFormat(undefined, { timeZone: 'Europe/Nowhere' })`
  // raises a RangeError, and these functions run inside render on the screens someone needs in
  // order to undo the setting that broke them.
  assert.throws(() => new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Nowhere' }), RangeError);
  const forged = { locale: 'en-US', timeZone: 'Europe/Nowhere', hour12: undefined };
  assert.doesNotThrow(() => clockTime(Date.now(), forged));
  assert.doesNotThrow(() => fullStamp(Date.now(), forged));
  assert.doesNotThrow(() => relativeTime(Date.UTC(2020, 0, 1), forged));
  assert.doesNotThrow(() => formatNumber(1000, {}, { locale: 'not a locale', timeZone: undefined, hour12: undefined }));
});

test('every zone offered in the picker is one the runtime can format in', () => {
  // F-64: a list that is never checked is a list that quietly stops being true when ICU data moves.
  assert.ok(COMMON_TIME_ZONES.length > 5, 'the picker list is suspiciously short');
  for (const zone of COMMON_TIME_ZONES) assert.equal(isTimeZone(zone), true, zone);
});

test('every region offered has a name, and every name a region', () => {
  assert.deepEqual(Object.keys(REGION_NAMES).sort(), [...REGIONS].sort());
  for (const r of REGIONS) assert.ok(REGION_NAMES[r].length > 0, r);
});

test('the reset button knows what there is to reset', () => {
  assert.equal(isDefaultPrefs(prefs()), true);
  assert.deepEqual(changedPrefs(prefs()), []);
  const changed = prefs({ region: 'de-DE', appearance: 'light' });
  assert.equal(isDefaultPrefs(changed), false);
  assert.deepEqual(changedPrefs(changed).sort(), ['appearance', 'region']);
  // Every field is nameable, or the dialog lists a key the user has never seen.
  for (const k of Object.keys(DEFAULT_PREFS)) assert.ok(PREF_LABELS[k], k);
});

/* ------------------------------------------------------------ 2. appearance --- */

test('an explicit appearance beats the operating system in both directions', () => {
  assert.equal(resolveAppearance('light', true), 'light');
  assert.equal(resolveAppearance('dark', false), 'dark');
});

test("'system' lets the operating system decide", () => {
  assert.equal(resolveAppearance('system', true), 'dark');
  assert.equal(resolveAppearance('system', false), 'light');
});

test('a system signal that is not a literal true is not a yes', () => {
  // `matchMedia` on an engine without the query returns `{ matches: false }`, and a missing read is
  // `undefined`. Neither is evidence of a dark desktop.
  for (const v of [undefined, null, 'true', 1, {}]) {
    assert.equal(resolveAppearance('system', v), 'light', JSON.stringify(v));
  }
});

test('an unrecognised appearance falls back to asking the system, not to a fixed theme', () => {
  assert.equal(resolveAppearance('midnight', true), 'dark');
  assert.equal(resolveAppearance(undefined, false), 'light');
});

/* ---------------------------------------------------------------- 3. motion --- */

test('motion follows the system unless the user has overridden it', () => {
  assert.equal(resolveReducedMotion('system', true), true);
  assert.equal(resolveReducedMotion('system', false), false);
});

test('the override works in BOTH directions', () => {
  // The 'full' direction is the one that gets forgotten. A locked-down corporate image or a remote
  // session can report reduced-motion for reasons that have nothing to do with this person, and
  // without this they have no way to turn the interface's motion back on.
  assert.equal(resolveReducedMotion('reduced', false), true);
  assert.equal(resolveReducedMotion('full', true), false);
});

/* ------------------------------------------------- 4. regional formatting --- */

const AT = Date.UTC(2026, 1, 3, 20, 5, 0); // 3 February 2026, 20:05 UTC

test('the region actually changes the date order', () => {
  // en-US and en-GB disagree about which number comes first. A fixture where they agree would
  // prove nothing, so the day here is 3 and the month is 2.
  const us = fullStamp(AT, formatSettingsFrom(prefs({ region: 'en-US', timeZone: 'UTC' })));
  const gb = fullStamp(AT, formatSettingsFrom(prefs({ region: 'en-GB', timeZone: 'UTC' })));
  assert.notEqual(us, gb, `both regions rendered "${us}"`);
  assert.match(us, /Feb/);
  assert.match(gb, /Feb/);
});

test('the region actually changes the decimal separator', () => {
  const us = formatNumber(1234.5, {}, formatSettingsFrom(prefs({ region: 'en-US' })));
  const de = formatNumber(1234.5, {}, formatSettingsFrom(prefs({ region: 'de-DE' })));
  assert.equal(us, '1,234.5');
  assert.equal(de, '1.234,5');
  // The consequence, said out loud: a thousands separator read as a decimal point is a Credit
  // balance wrong by three orders of magnitude.
  assert.notEqual(us, de);
});

test('the clock preference actually changes the clock', () => {
  const twelve = clockTime(AT, formatSettingsFrom(prefs({ hourCycle: 'h12', timeZone: 'UTC', region: 'en-US' })));
  const twentyFour = clockTime(AT, formatSettingsFrom(prefs({ hourCycle: 'h23', timeZone: 'UTC', region: 'en-US' })));
  assert.match(twelve, /8:05/);
  assert.match(twentyFour, /20:05/);
  assert.notEqual(twelve, twentyFour);
});

test('the time zone actually moves the wall clock', () => {
  // 20:05 UTC is 21:05 in Berlin and 12:05 in Los Angeles. A zone preference that nothing reads
  // would leave these identical.
  const berlin = clockTime(AT, formatSettingsFrom(prefs({ timeZone: 'Europe/Berlin', hourCycle: 'h23' })));
  const la = clockTime(AT, formatSettingsFrom(prefs({ timeZone: 'America/Los_Angeles', hourCycle: 'h23' })));
  assert.match(berlin, /21:05/);
  assert.match(la, /12:05/);
});

test('a chosen zone is named on the full stamp, because it may not be the reader\'s own', () => {
  const stamp = fullStamp(AT, formatSettingsFrom(prefs({ timeZone: 'Europe/Berlin', region: 'en-GB' })));
  // "14:32" with no zone was honest when it was always the device's. It is a lie the moment the
  // product lets you choose a different one.
  assert.match(stamp, /GMT|CET|UTC/i, `no zone named in "${stamp}"`);
});

test('the machine-readable stamp is NOT localised', () => {
  // `<time dateTime>` is defined in terms of UTC ISO-8601. Formatting it in the user's zone
  // produces a string that reads plausibly and parses to the wrong instant.
  assert.equal(isoStamp(AT), '2026-02-03T20:05:00.000Z');
  assert.equal(isoStamp(AT), new Date(AT).toISOString());
});

test('the default settings format exactly as the browser would have on its own', () => {
  // The whole point of 'system' being the default: nobody who has never opened settings sees any
  // change at all.
  const s = formatSettingsFrom(prefs());
  assert.deepEqual(s, { locale: undefined, timeZone: undefined, hour12: undefined });
  assert.equal(formatNumber(1234.5, {}, s), (1234.5).toLocaleString());
  assert.equal(formatNumber(1200, {}, s), (1200).toLocaleString());
});

test('bytes are formatted in the reader\'s conventions too', () => {
  const de = formatSettingsFrom(prefs({ region: 'de-DE' }));
  assert.equal(formatBytes(2048, de), '2,0 KB');
  assert.equal(formatBytes(2048, formatSettingsFrom(prefs({ region: 'en-US' }))), '2.0 KB');
  assert.equal(formatBytes(512, formatSettingsFrom(prefs({ region: 'en-US' }))), '512 B');
});

test('a resolver never hands a formatter a value it has not checked', () => {
  assert.equal(resolveLocale('system'), undefined);
  assert.equal(resolveLocale('xx-YY'), undefined, 'a locale outside the allowlist is not passed through');
  assert.equal(resolveLocale('de-DE'), 'de-DE');
  assert.equal(resolveTimeZone('system'), undefined);
  assert.equal(resolveTimeZone('Europe/Nowhere'), undefined);
  assert.equal(resolveTimeZone('Europe/Berlin'), 'Europe/Berlin');
  assert.equal(resolveHour12('system'), undefined);
  assert.equal(resolveHour12('h12'), true);
  assert.equal(resolveHour12('h23'), false);
  assert.equal(resolveHour12('h11'), undefined);
});

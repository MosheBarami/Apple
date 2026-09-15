/**
 * WALL-CLOCK TIME IN A NAMED ZONE — and the two mornings a year it is not a single instant.
 *
 * Everything time-keyed in this product is UTC, and quota-math.ts argues well for why. A SCHEDULE
 * is the exception: "run this at 09:00" is the person's clock, not the service's, and a schedule
 * stored in UTC silently moves an hour away from the person twice a year.
 *
 * The property under test is not "the offset is applied". It is that the two pathological cases are
 * DETECTED AND DECIDED rather than silently answered:
 *
 *   - spring forward: 02:30 local does not exist. `Date.UTC(...) - offset` still returns a number,
 *     and the number is an hour wrong. A converter that returns it has not failed, which is worse.
 *   - autumn back: 01:30 local exists twice, an hour apart. A daily job whose next-fire test is
 *     "has the wall clock come round to 01:30 again" fires twice on that morning.
 *
 * The fixtures are real transitions in the IANA database, not invented ones:
 *   America/New_York  2026-03-08 07:00Z  EST -05:00 → EDT -04:00   (one hour forward)
 *   America/New_York  2026-11-01 06:00Z  EDT -04:00 → EST -05:00   (one hour back)
 *   Australia/Lord_Howe 2026-10-04       +10:30 → +11:00           (THIRTY minutes forward)
 *
 * Lord Howe is in here because it is the case a hard-coded `+ 3600000` passes the other two and
 * fails: the gap is half an hour, so "shift forward by an hour" is wrong by thirty minutes.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'zoned-')), 'zoned.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'zoned-time.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const Z = await import(`file://${out}`);

const iso = (ms) => new Date(ms).toISOString();

test('a zone name the tz database does not know is refused, and the empty string with it', () => {
  assert.equal(Z.isTimeZone('America/New_York'), true);
  assert.equal(Z.isTimeZone('UTC'), true);
  assert.equal(Z.isTimeZone('Mars/Olympus_Mons'), false);
  // The empty string is the dangerous one: Intl treats an ABSENT timeZone as the system zone, so a
  // converter that let '' through would resolve every schedule against whatever zone the server
  // happens to run in — a value that is not the user's and that nothing records.
  assert.equal(Z.isTimeZone(''), false);
  assert.equal(Z.isTimeZone(null), false);
  assert.equal(Z.isTimeZone(42), false);
});

test('the offset is read from the zone, not assumed, and it moves across a transition', () => {
  // 2026-03-08 06:59Z is still EST; 07:01Z is EDT.
  assert.equal(Z.offsetMsAt('America/New_York', Date.parse('2026-03-08T06:59:00Z')), -5 * 3600_000);
  assert.equal(Z.offsetMsAt('America/New_York', Date.parse('2026-03-08T07:01:00Z')), -4 * 3600_000);
  // A zone with a half-hour offset, which an implementation that works in whole hours gets wrong.
  assert.equal(Z.offsetMsAt('Asia/Kolkata', Date.parse('2026-06-01T00:00:00Z')), 5.5 * 3600_000);
  assert.equal(Z.offsetMsAt('UTC', Date.parse('2026-06-01T00:00:00Z')), 0);
});

test('an instant carrying milliseconds does not shift the offset by those milliseconds', () => {
  // formatToParts has no millisecond field, so an implementation that subtracts the raw instant
  // reports an offset short by up to 999ms — a value that is not any zone's real offset.
  const withMs = Date.parse('2026-06-01T00:00:00Z') + 437;
  assert.equal(Z.offsetMsAt('Asia/Kolkata', withMs), 5.5 * 3600_000);
});

test('an ordinary wall time resolves to exactly one instant and reports no fold', () => {
  const r = Z.instantForWall('America/New_York', { year: 2026, month: 6, day: 15, hour: 9, minute: 0 });
  assert.equal(r.fold, 'normal');
  assert.equal(iso(r.instant), '2026-06-15T13:00:00.000Z'); // EDT, -04:00
  // And the round trip holds: the clock in that zone really does read 09:00 then.
  const back = Z.wallPartsAt('America/New_York', r.instant);
  assert.equal(back.hour, 9);
  assert.equal(back.minute, 0);
  assert.equal(back.day, 15);
});

test('a wall time that does not exist is named as skipped and runs when the clocks land', () => {
  const r = Z.instantForWall('America/New_York', { year: 2026, month: 3, day: 8, hour: 2, minute: 30 });
  assert.equal(r.fold, 'skipped', 'a time that does not exist must not be reported as an ordinary one');
  // 03:30 local — shifted forward by the size of the gap, which is what the disclosure promises.
  assert.equal(iso(r.instant), '2026-03-08T07:30:00.000Z');
  const back = Z.wallPartsAt('America/New_York', r.instant);
  assert.equal(back.hour, 3);
  assert.equal(back.minute, 30);
  // The run is NOT dropped and NOT moved to another day.
  assert.equal(back.day, 8);
});

test('the shift for a skipped time is the size of that zone gap, not a hard-coded hour', () => {
  // Lord Howe Island moves the clock by THIRTY minutes. 2026-10-04 02:15 local does not exist;
  // an implementation that adds an hour lands at 03:15, which is half an hour past the gap.
  const r = Z.instantForWall('Australia/Lord_Howe', { year: 2026, month: 10, day: 4, hour: 2, minute: 15 });
  assert.equal(r.fold, 'skipped');
  const back = Z.wallPartsAt('Australia/Lord_Howe', r.instant);
  assert.equal(back.hour, 2);
  assert.equal(back.minute, 45, 'a 30-minute gap shifts the run by 30 minutes, not by 60');
});

test('a wall time that happens twice is named as repeated and resolves to the FIRST of the two', () => {
  const r = Z.instantForWall('America/New_York', { year: 2026, month: 11, day: 1, hour: 1, minute: 30 });
  assert.equal(r.fold, 'repeated', 'a time that exists twice must not be reported as an ordinary one');
  // 05:30Z is 01:30 EDT — the first one. 06:30Z is 01:30 EST — the second, which must not be chosen.
  assert.equal(iso(r.instant), '2026-11-01T05:30:00.000Z');
  assert.notEqual(iso(r.instant), '2026-11-01T06:30:00.000Z');
  // Both really are 01:30 on the wall clock: this is what makes a naive "is it 01:30 yet" test fire
  // twice, and it is the reason the fold has to be returned rather than inferred.
  assert.equal(Z.wallPartsAt('America/New_York', Date.parse('2026-11-01T05:30:00Z')).hour, 1);
  assert.equal(Z.wallPartsAt('America/New_York', Date.parse('2026-11-01T06:30:00Z')).hour, 1);
});

test('resolution never goes backwards across a transition, and a skipped time lands on a real one', () => {
  // The property a schedule depends on is NON-DECREASING, not strictly increasing, and the
  // difference is the whole point of the gap. A wall time that does not exist has to resolve to an
  // instant that DOES, so 02:30 and 03:30 on the morning the clocks go forward are necessarily the
  // same instant. That is a real consequence — two schedules an hour apart fire together that
  // morning — and it is stated here rather than discovered by someone reading a duplicate log line.
  let prev = -Infinity;
  let sawSkip = false;
  for (const day of [8, 9]) {
    for (let hour = 0; hour < 24; hour += 1) {
      const r = Z.instantForWall('America/New_York', { year: 2026, month: 3, day, hour, minute: 30 });
      if (day === 8 && hour === 2) { assert.equal(r.fold, 'skipped'); sawSkip = true; }
      assert.ok(r.instant >= prev, `hour ${hour} on day ${day} resolved BEFORE the previous one`);
      prev = r.instant;
    }
  }
  // The loop has to have WALKED the transition, or it proved monotonicity over an ordinary day.
  assert.equal(sawSkip, true);

  // The collision, named. The skipped 02:30 and the real 03:30 are one instant.
  const skipped = Z.instantForWall('America/New_York', { year: 2026, month: 3, day: 8, hour: 2, minute: 30 });
  const real = Z.instantForWall('America/New_York', { year: 2026, month: 3, day: 8, hour: 3, minute: 30 });
  assert.equal(skipped.instant, real.instant);
  assert.equal(real.fold, 'normal', 'only the time that does not exist is folded; the one that does is ordinary');
});

test('a daily run keeps its interval across a spring-forward instead of losing the gap', () => {
  // WHY the shift is by the gap rather than to the transition instant. 02:30 the day before and
  // 03:30 on the morning of are exactly 24 hours apart in real time; firing at 03:00 instead would
  // make that day 23.5 hours long for a schedule whose whole promise is "every day at this time".
  const before = Z.instantForWall('America/New_York', { year: 2026, month: 3, day: 7, hour: 2, minute: 30 });
  const across = Z.instantForWall('America/New_York', { year: 2026, month: 3, day: 8, hour: 2, minute: 30 });
  assert.equal(across.instant - before.instant, 24 * 3600_000);
});

test('the disclosure names the time it is about, so it cannot be shown beside the wrong schedule', () => {
  const text = Z.dstDisclosure({ hour: 2, minute: 30 });
  assert.match(text, /02:30/);
  assert.match(text, /forward/i);
  assert.match(text, /first one only/i);
  // A schedule at a different time gets copy about THAT time. Rendering one fixed sentence for
  // every schedule is the shape that makes a disclosure decorative.
  assert.match(Z.dstDisclosure({ hour: 9, minute: 5 }), /09:05/);
});

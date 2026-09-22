/**
 * WORK THAT HAPPENS WITHOUT SOMEBODY SITTING THERE - the policy, executed.
 *
 * A run could only ever be started by a `chat` frame on a project's WebSocket. Everything here is
 * the decision layer for the other three ways one can start, and every property below is one where
 * getting it wrong SPENDS MONEY rather than merely looking wrong:
 *
 *   1. A "next fire" that can equal the instant it was computed from is a dispatcher that fires
 *      forever. Each iteration starts a build. This is the single most expensive defect the file
 *      can have, and it is the first test.
 *   2. A daily automation whose dispatcher was down for a week has seven missed fires. Running all
 *      seven is seven builds at once for an outage the person did not cause. `catch_up` must run
 *      EXACTLY ONE.
 *   3. Two dispatchers waking in the same minute must produce the same idempotency key, or one
 *      schedule starts two builds.
 *   4. A retry of a QUOTA or BUSY refusal is a dispatch that spends nothing and achieves nothing,
 *      and burns the retry budget the one transient case needs.
 *   5. An automation is a standing actor. The access it was created with must not outlive the
 *      access its owner has.
 *
 * The DST fixtures are real transitions: America/New_York 2026-03-08 (forward) and 2026-11-01
 * (back). A daily 02:30 automation crosses a wall time that does not exist; a daily 01:30 one
 * crosses a wall time that exists twice and must not fire on both.
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
const out = join(mkdtempSync(join(tmpdir(), 'autom-')), 'autom.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'automations.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const A = await import(`file://${out}`);

const NOW = Date.parse('2026-06-15T12:00:00Z');
const CTX = { ownerId: 'owner-1', projectId: 'proj-1', now: NOW };
const iso = (ms) => new Date(ms).toISOString();

/** A well-formed daily automation. Negative fixtures below spoil exactly ONE field of it. */
const good = (over = {}) => ({
  name: 'Nightly polish',
  description: 'Tidy the lighting before I get up.',
  prompt: 'Tidy the lighting in the main map.',
  mode: 'agent',
  trigger: 'schedule',
  timezone: 'America/New_York',
  schedule: { every: 'day', hour: 9, minute: 0 },
  ...over,
});

const make = (over = {}, ctx = {}) => {
  const r = A.normaliseAutomation(good(over), { ...CTX, ...ctx });
  assert.equal(r.ok, true, `fixture refused: ${r.reason}`);
  return r.automation;
};

// ---------------------------------------------------------------------------------------------
// 1. the fire that must not repeat
// ---------------------------------------------------------------------------------------------

test('the next fire is STRICTLY after the instant asked about, including when it lands exactly on it', () => {
  const a = make();
  const at = A.nextFireAfter(a, NOW).at;
  // 09:00 New York on 2026-06-15 is 13:00Z; NOW is 12:00Z, so today's fire is still ahead.
  assert.equal(iso(at), '2026-06-15T13:00:00.000Z');
  // THE CASE THAT LOOPS: ask again from the fire itself. A `>=` here returns the same instant, the
  // dispatcher writes it back as "next", and wakes to find it due again - forever, one build each.
  const after = A.nextFireAfter(a, at).at;
  assert.ok(after > at, 'a next-fire equal to the fire it followed is an infinite dispatcher');
  assert.equal(iso(after), '2026-06-16T13:00:00.000Z');
});

test('an hourly schedule advances by exactly an hour and never returns its own input', () => {
  const a = make({ schedule: { every: 'hour', minute: 20 } });
  const first = A.nextFireAfter(a, Date.parse('2026-06-15T12:00:00Z')).at;
  assert.equal(iso(first), '2026-06-15T12:20:00.000Z');
  const second = A.nextFireAfter(a, first).at;
  assert.equal(iso(second), '2026-06-15T13:20:00.000Z');
  // Exactly on the minute boundary, which is where an off-by-one lands.
  assert.equal(iso(A.nextFireAfter(a, Date.parse('2026-06-15T12:20:00Z')).at), '2026-06-15T13:20:00.000Z');
});

test('a weekly schedule picks the named weekday, in the automation zone', () => {
  // 2026-06-15 is a Monday. A Wednesday schedule from Monday noon lands two days later.
  const a = make({ schedule: { every: 'week', weekday: 3, hour: 9, minute: 0 } });
  assert.equal(iso(A.nextFireAfter(a, NOW).at), '2026-06-17T13:00:00.000Z');
  // And from just after that Wednesday fire, the following one is a whole week later.
  const next = A.nextFireAfter(a, Date.parse('2026-06-17T13:00:00Z')).at;
  assert.equal(iso(next), '2026-06-24T13:00:00.000Z');
});

test('a schedule that has no next fire answers null rather than a plausible instant', () => {
  const manual = make({ trigger: 'manual', schedule: undefined });
  assert.equal(A.nextFireAfter(manual, NOW).at, null);
  // A row whose stored zone is no longer in the tz database - a rename, a hand-edited restore.
  // Returning an instant computed in some other zone would fire somebody's build at the wrong time
  // and report success.
  assert.equal(A.nextFireAfter({ ...make(), timezone: 'Mars/Olympus_Mons' }, NOW).at, null);
});

// ---------------------------------------------------------------------------------------------
// daylight saving
// ---------------------------------------------------------------------------------------------

test('a daily run at a wall time that does not exist is not skipped, and is named as skipped', () => {
  // 02:30 on 2026-03-08 in New York does not exist. The fire happens, shifted by the gap.
  const a = make({ schedule: { every: 'day', hour: 2, minute: 30 } });
  const fire = A.nextFireAfter(a, Date.parse('2026-03-07T12:00:00Z'));
  assert.equal(iso(fire.at), '2026-03-08T07:30:00.000Z');
  assert.equal(fire.fold, 'skipped', 'the run history has to be able to say which morning this was');
  // Exactly 24 hours after the previous day's fire, which is the promise "every day at 02:30" makes.
  const previous = A.nextFireAfter(a, Date.parse('2026-03-06T12:00:00Z')).at;
  assert.equal(fire.at - previous, 24 * 3600_000);
});

test('a daily run at a wall time that happens twice fires ONCE, on the first of the two', () => {
  const a = make({ schedule: { every: 'day', hour: 1, minute: 30 } });
  const fire = A.nextFireAfter(a, Date.parse('2026-10-31T12:00:00Z'));
  assert.equal(iso(fire.at), '2026-11-01T05:30:00.000Z'); // 01:30 EDT, the first one
  assert.equal(fire.fold, 'repeated');
  // THE DOUBLE-FIRE: ask again from that fire. A next-fire computed by "when is the wall clock next
  // 01:30" answers 06:30Z - the second 01:30, an hour later, same morning, one extra build.
  const next = A.nextFireAfter(a, fire.at).at;
  assert.notEqual(iso(next), '2026-11-01T06:30:00.000Z');
  assert.equal(iso(next), '2026-11-02T06:30:00.000Z', 'the next fire is the next DAY');
});

test('the schedule reads back as a sentence naming the zone', () => {
  // The commonest automation bug is the right time in the wrong zone, and a schedule a person
  // cannot read back is one they cannot check.
  assert.match(A.describeSchedule(make()), /Every day at 09:00 \(America\/New_York\)/);
  assert.match(A.describeSchedule(make({ schedule: { every: 'hour', minute: 5 } })), /Every hour at :05/);
  assert.match(A.describeSchedule(make({ schedule: { every: 'week', weekday: 3, hour: 9, minute: 0 } })), /Wednesday/);
  assert.match(A.describeSchedule(make({ trigger: 'manual', schedule: undefined })), /Only when you run it/);
  assert.match(A.describeSchedule(make({ trigger: 'event', event: 'build_failed', schedule: undefined })), /build failed/);
});

// ---------------------------------------------------------------------------------------------
// 2. missed runs
// ---------------------------------------------------------------------------------------------

test('a week of missed daily fires runs ONCE under catch_up, and the option to run all does not exist', () => {
  const dueAt = Date.parse('2026-06-08T13:00:00Z');
  const now = Date.parse('2026-06-15T13:30:00Z'); // a week and a half-hour later
  const v = A.missedRunVerdict(make({ missedRuns: 'catch_up' }), dueAt, now);
  assert.equal(v.run, true);
  assert.equal(v.reason, 'caught_up');
  assert.equal(v.missed, 7, 'it counts what was missed rather than pretending nothing was');
  // The verdict is one run. There is no field on it that could mean seven, and the vocabulary has
  // no third policy - that absence is the feature.
  assert.deepEqual([...A.MISSED_RUN_POLICIES], ['skip', 'catch_up']);
});

test('the default is to skip, and skipping still reports how many were missed', () => {
  const dueAt = Date.parse('2026-06-08T13:00:00Z');
  const now = Date.parse('2026-06-15T13:30:00Z');
  const a = make();
  assert.equal(a.missedRuns, 'skip', 'the default is the one that does not spend money');
  const v = A.missedRunVerdict(a, dueAt, now);
  assert.equal(v.run, false);
  assert.equal(v.reason, 'skipped');
  assert.equal(v.missed, 7);
});

test('a fire that is merely on time is not a missed run', () => {
  const dueAt = Date.parse('2026-06-15T13:00:00Z');
  const v = A.missedRunVerdict(make(), dueAt, dueAt + 30_000);
  assert.equal(v.missed, 0);
  assert.equal(v.run, true);
  assert.equal(v.reason, 'on_time');
});

test('an automation dormant for a year does not walk a year of fires inside the dispatcher', () => {
  // The bound matters: this runs in a cron handler with a wall-clock limit, and an hourly schedule
  // idle for a year is 8,760 iterations that would be paid for on every tick.
  const a = make({ schedule: { every: 'hour', minute: 0 }, missedRuns: 'skip' });
  const dueAt = Date.parse('2025-06-15T13:00:00Z');
  const now = Date.parse('2026-06-15T13:00:00Z');
  const started = Date.now();
  const v = A.missedRunVerdict(a, dueAt, now);
  assert.ok(Date.now() - started < 200, 'the walk is not bounded');
  assert.ok(v.missed > 0);
  assert.equal(v.run, false);
});

// ---------------------------------------------------------------------------------------------
// 3. duplicate triggers
// ---------------------------------------------------------------------------------------------

test('two dispatchers waking in the same minute compute the SAME key for one scheduled fire', () => {
  const dueAt = Date.parse('2026-06-15T13:00:00Z');
  // Two dispatchers, two different wake instants, one due instant.
  assert.equal(A.fireKey('auto-1', dueAt), A.fireKey('auto-1', dueAt));
  // And the next fire of the same automation is a DIFFERENT key, or the second day never runs.
  assert.notEqual(A.fireKey('auto-1', dueAt), A.fireKey('auto-1', dueAt + 86_400_000));
  assert.notEqual(A.fireKey('auto-1', dueAt), A.fireKey('auto-2', dueAt));
});

test('an event key carries the subject, so one build finishing does not fire twice', () => {
  assert.equal(A.eventFireKey('a', 'build_failed', 'run-1'), A.eventFireKey('a', 'build_failed', 'run-1'));
  assert.notEqual(A.eventFireKey('a', 'build_failed', 'run-1'), A.eventFireKey('a', 'build_failed', 'run-2'));
  assert.notEqual(A.eventFireKey('a', 'build_failed', 'run-1'), A.eventFireKey('a', 'build_succeeded', 'run-1'));
});

// ---------------------------------------------------------------------------------------------
// 4. retries
// ---------------------------------------------------------------------------------------------

test('a refusal a retry cannot argue with is not retried, however many retries are left', () => {
  for (const outcome of ['quota', 'busy', 'refused']) {
    const v = A.retryVerdict(outcome, 0, A.MAX_RETRIES, NOW);
    assert.equal(v.retry, false, `${outcome} was retried`);
    assert.equal(v.reason, 'not_retriable');
    assert.equal(v.at, null);
  }
  // And a success is not retried either, which is the degenerate case a countdown gets wrong.
  assert.equal(A.retryVerdict('ok', 0, 3, NOW).retry, false);
});

test('a genuinely transient failure is retried, and only up to the configured count', () => {
  const v = A.retryVerdict('error', 0, 2, NOW);
  assert.equal(v.retry, true);
  assert.equal(v.at, NOW + A.RETRY_DELAY_MS);
  assert.equal(A.retryVerdict('error', 1, 2, NOW).retry, true);
  const done = A.retryVerdict('error', 2, 2, NOW);
  assert.equal(done.retry, false);
  assert.equal(done.reason, 'no_retries_left');
  // Zero retries is the default, and it means zero.
  assert.equal(A.retryVerdict('failed', 0, 0, NOW).retry, false);
  assert.equal(make().maxRetries, 0);
});

// ---------------------------------------------------------------------------------------------
// 5. a standing actor, re-authorised
// ---------------------------------------------------------------------------------------------

test('an automation whose owner lost access to the project does not fire', () => {
  const a = make();
  assert.equal(A.authorizeFire(a, { projectId: 'proj-1', ownerHasAccess: true }).ok, true);
  const gone = A.authorizeFire(a, { projectId: 'proj-1', ownerHasAccess: false });
  assert.equal(gone.ok, false);
  assert.equal(gone.reason, 'owner_lost_access');
  // And an automation pointed at a different project than the one being fired is refused too - the
  // row's own project is the authority, never the id the dispatcher was handed.
  assert.equal(A.authorizeFire(a, { projectId: 'proj-2', ownerHasAccess: true }).reason, 'wrong_project');
});

test('the refusal a fire gets is the one that is true, in the order the answers matter', () => {
  const a = make({ overlap: 'skip' });
  // Every one of these contexts is a well-formed start with exactly ONE thing wrong with it.
  const base = { inFlight: false, runsToday: 0, authorized: true, killed: false };
  assert.equal(A.startVerdict(a, base).start, true);
  assert.equal(A.startVerdict(a, { ...base, authorized: false }).reason, 'no_access');
  assert.equal(A.startVerdict({ ...a, enabled: false }, base).reason, 'disabled');
  assert.equal(A.startVerdict(a, { ...base, killed: true }).reason, 'killed');
  assert.equal(A.startVerdict(a, { ...base, runsToday: a.budget.maxRunsPerDay }).reason, 'daily_cap');
  assert.equal(A.startVerdict(a, { ...base, inFlight: true }).reason, 'overlapping');
  // Access is answered FIRST. An automation belonging to somebody who was removed must not present
  // as temporarily blocked by a busy project - which is a refusal that looks like it will clear.
  assert.equal(A.startVerdict(a, { ...base, authorized: false, inFlight: true, runsToday: 99 }).reason, 'no_access');
});

test('a paused automation does not fire, and pausing is a per-automation switch', () => {
  // The only pause this product had was the service-wide kill switch, which stops generation for
  // everyone. These are different levers and both are honoured.
  const paused = { ...make(), enabled: false };
  assert.equal(A.startVerdict(paused, { inFlight: false, runsToday: 0, authorized: true }).start, false);
  const running = make();
  assert.equal(A.startVerdict(running, { inFlight: false, runsToday: 0, authorized: true }).start, true);
  // And the service kill switch is honoured as a REQUEUE, not a drop: capacity comes back.
  const killed = A.startVerdict(running, { inFlight: false, runsToday: 0, authorized: true, killed: true });
  assert.equal(killed.start, false);
  assert.equal(killed.requeue, true);
});

test('an overlapping fire is queued or dropped according to the automation own policy', () => {
  const busy = { inFlight: true, runsToday: 0, authorized: true };
  assert.equal(A.startVerdict(make({ overlap: 'skip' }), busy).requeue, false);
  assert.equal(A.startVerdict(make({ overlap: 'queue' }), busy).requeue, true);
  // `allow` is not in the vocabulary, because single-flight.ts would refuse it one layer down and
  // the switch would do nothing.
  assert.deepEqual([...A.OVERLAP_POLICIES], ['skip', 'queue']);
  assert.equal(A.normaliseAutomation(good({ overlap: 'allow' }), CTX).reason, 'bad_overlap');
});

// ---------------------------------------------------------------------------------------------
// validation - one spoiled field each
// ---------------------------------------------------------------------------------------------

test('each refusal is reached by spoiling exactly one field, so the reason is the reason', () => {
  const cases = [
    ['bad_name', good({ name: '   ' })],
    ['bad_name', good({ name: 'x'.repeat(A.NAME_MAX + 1) })],
    ['bad_description', good({ description: 'x'.repeat(A.DESCRIPTION_MAX + 1) })],
    ['bad_prompt', good({ prompt: '' })],
    ['bad_prompt', good({ prompt: 'x'.repeat(A.PROMPT_MAX + 1) })],
    ['bad_mode', good({ mode: 'diamond' })],
    ['bad_trigger', good({ trigger: 'telepathy' })],
    ['unknown_timezone', good({ timezone: 'Mars/Olympus_Mons' })],
    ['bad_schedule', good({ schedule: { every: 'fortnight', minute: 0 } })],
    ['bad_schedule', good({ schedule: { every: 'day', hour: 25, minute: 0 } })],
    ['bad_schedule', good({ schedule: { every: 'day', hour: 9, minute: 60 } })],
    ['bad_event', good({ trigger: 'event', event: 'the_vibes_shifted', schedule: undefined })],
    ['bad_overlap', good({ overlap: 'allow' })],
    ['bad_missed_runs', good({ missedRuns: 'run_them_all' })],
    ['bad_retries', good({ maxRetries: A.MAX_RETRIES + 1 })],
    ['bad_retries', good({ maxRetries: -1 })],
    ['bad_budget', good({ budget: { maxCreditsPerRun: 0 } })],
    ['bad_budget', good({ budget: { maxRunsPerDay: A.MAX_RUNS_PER_DAY + 1 } })],
  ];
  for (const [reason, input] of cases) {
    const r = A.normaliseAutomation(input, CTX);
    assert.equal(r.ok, false, `${reason}: accepted ${JSON.stringify(input).slice(0, 80)}`);
    assert.equal(r.reason, reason, `expected ${reason} for ${JSON.stringify(input).slice(0, 80)}`);
  }
  // The control: the unspoiled fixture is accepted, so every case above differs from an accepted
  // one in exactly the field it names.
  assert.equal(A.normaliseAutomation(good(), CTX).ok, true);
});

test('an owner or a project the caller did not prove is refused before anything else is read', () => {
  assert.equal(A.normaliseAutomation(good(), { ...CTX, ownerId: '' }).reason, 'bad_owner');
  assert.equal(A.normaliseAutomation(good(), { ...CTX, projectId: '  ' }).reason, 'bad_project');
});

test('a field that does not belong to the chosen trigger is CLEARED, not stored', () => {
  // A manual automation carrying a schedule is a row whose next-fire column the dispatcher reads.
  // It would run on a schedule the settings page does not show, because the page renders by trigger.
  const manual = make({ trigger: 'manual', event: 'build_failed' });
  assert.equal(manual.schedule, null);
  assert.equal(manual.event, null);
  const scheduled = make({ event: 'build_failed' });
  assert.equal(scheduled.event, null);
  assert.notEqual(scheduled.schedule, null);
  const evented = make({ trigger: 'event', event: 'build_failed' });
  assert.equal(evented.schedule, null);
  assert.equal(evented.event, 'build_failed');
});

test('the defaults are the ones that do not spend money, and an automation arrives switched on', () => {
  const a = make({ overlap: undefined, missedRuns: undefined, maxRetries: undefined, budget: undefined, mode: undefined });
  assert.equal(a.overlap, 'skip');
  assert.equal(a.missedRuns, 'skip');
  assert.equal(a.maxRetries, 0);
  assert.deepEqual(a.budget, A.DEFAULT_BUDGET);
  assert.equal(a.mode, 'agent');
  // Switched on, because an automation you have to go and enable afterwards is a two-step creation
  // dressed as a safety feature - and every OTHER default here is already the cautious one.
  assert.equal(a.enabled, true);
});

test('a name is trimmed and collapsed but never silently shortened', () => {
  const a = make({ name: '  Nightly   polish  ' });
  assert.equal(a.name, 'Nightly polish');
  // One character over the cap is a refusal, not a truncation: a shortened name is a different
  // name attributed to the person who did not choose it.
  assert.equal(A.normaliseAutomation(good({ name: 'x'.repeat(A.NAME_MAX) }), CTX).ok, true);
  assert.equal(A.normaliseAutomation(good({ name: 'x'.repeat(A.NAME_MAX + 1) }), CTX).ok, false);
});

test('an id and a creation time survive an update rather than being minted again', () => {
  const first = make();
  const edited = A.normaliseAutomation(good({ name: 'Renamed' }), {
    ...CTX,
    now: NOW + 60_000,
    id: first.id,
    createdAt: first.createdAt,
  });
  assert.equal(edited.automation.id, first.id);
  assert.equal(edited.automation.createdAt, first.createdAt, '"since when has this existed" is not "when was it last touched"');
  assert.equal(edited.automation.updatedAt, NOW + 60_000);
});

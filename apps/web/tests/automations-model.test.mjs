/**
 * THE AUTOMATION EDITOR'S DECISIONS, held against the worker that enforces them.
 *
 * Until this existed, `grep -rni automation apps/web/src` returned nothing: the worker had a
 * validator refusing fourteen named things, a store with a per-owner cap, and routes that fire a
 * run — and no person could reach any of it. This file is the client half of that agreement, and
 * it imports BOTH sides, for the reason search-filters.test.mjs records: a web test asserting
 * "we send mode: stone" passes against a worker reading something else, and the symptom is not a
 * failure but a refusal the user reads as "the form is broken".
 *
 * THE THREE PROPERTIES THIS FILE EXISTS FOR:
 *
 *   1. EVERY REFUSAL THE WORKER CAN RETURN HAS A SENTENCE AND A FIELD. A refusal with no mapping
 *      renders as a generic failure on no field, and the person retypes the same value. The test
 *      derives the list from the worker's own union rather than from a literal here, so adding a
 *      refusal to the server without a sentence is a red test rather than a dead end in the UI.
 *   2. THE CLIENT NEVER TRIMS. The server REFUSES an over-long name; it does not shorten one. A
 *      client that truncated first would store a different name than the person typed and report
 *      success. So the draft carries the full value and the counter says it is over.
 *   3. THE EDITOR OFFERS ONLY WHAT THE SERVER WILL FIRE. A trigger nothing dispatches, a retry
 *      count nothing reads and a credit ceiling nothing spends against are controls wired to
 *      nothing; this build has all three, and the draft must not carry them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKER = join(WEB, '..', 'worker');

/**
 * The worker's modules, BUNDLED rather than imported.
 *
 * They import each other extensionlessly (`./zoned-time`), which is the worker's own bundler's
 * convention and not something Node's resolver will follow. Bundling is what the worker's tests
 * do; importing a hand-copied list of its constants instead is the drift this file exists to stop.
 */
const bundle = (file, tag) => {
  const out = join(mkdtempSync(join(tmpdir(), `au-${tag}-`)), `${tag}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
    [join(WORKER, 'src', file), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
    { cwd: WORKER, stdio: 'pipe' });
  return import(`file://${out}`);
};

const web = await import('../src/lib/automations.ts');
const worker = await bundle('automations.ts', 'policy');

const NOW = Date.UTC(2026, 8, 15, 12, 0, 0);
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT = '11111111-1111-4111-8111-111111111111';

/** Run a draft through the SERVER'S validator, which is the only opinion that counts. */
const normalise = (draft) =>
  worker.normaliseAutomation(web.draftToBody(draft), { ownerId: OWNER, projectId: PROJECT, now: NOW });

// ------------------------------------------------------------------ the refusals ---

test('every refusal the worker can return has a sentence and a field to put it on', () => {
  // The union lives in the worker's types, which a runtime test cannot read, so the worker exports
  // the list it validates against. A refusal with no entry here is a message the user never sees.
  for (const reason of worker.AUTOMATION_REJECTS) {
    const r = web.refusalFor(reason);
    assert.ok(r.message.length > 0, `${reason} has no sentence`);
    assert.ok(r.known, `${reason} is not a refusal this editor knows`);
  }
});

test('an unfamiliar refusal names itself rather than pretending to be understood', () => {
  // A newer worker refusing something this build has never heard of must not render as a blank
  // form with a green tick, and must not render as a sentence invented for it either.
  const r = web.refusalFor('bad_moon_rising');
  assert.equal(r.known, false);
  assert.match(r.message, /bad_moon_rising/, 'the unrecognised reason is shown, not swallowed');
  assert.equal(r.field, null, 'no field is blamed for a refusal this build cannot place');
});

test('the field a refusal lands on is the field that caused it', () => {
  assert.equal(web.refusalFor('bad_name').field, 'name');
  assert.equal(web.refusalFor('bad_description').field, 'description');
  assert.equal(web.refusalFor('bad_prompt').field, 'prompt');
  assert.equal(web.refusalFor('bad_mode').field, 'mode');
  assert.equal(web.refusalFor('bad_budget').field, 'maxRunsPerDay');
  // `too_many` is the per-owner cap. It is nobody's field: retyping the name will not help.
  assert.equal(web.refusalFor('too_many').field, null);
  assert.match(web.refusalFor('too_many').message, /25/, 'the cap is named, so the next step is obvious');
});

test('the cap in the copy is the cap the store enforces', async () => {
  const store = await bundle('automation-store.ts', 'store');
  assert.match(web.refusalFor('too_many').message, new RegExp(String(store.AUTOMATIONS_PER_OWNER_MAX)));
});

// ------------------------------------------------------------- the draft the server accepts ---

test('a blank draft plus a name and a prompt is accepted by the worker unchanged', () => {
  const draft = { ...web.blankDraft(), name: 'Tidy the lighting', prompt: 'Tidy the lighting in the main map.' };
  const r = normalise(draft);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.automation.name, 'Tidy the lighting');
  assert.equal(r.automation.trigger, 'manual');
  assert.equal(r.automation.enabled, true);
});

test('the mode crosses the wire as the specialist, not as the product word', async () => {
  const shared = await import('@golem/shared');
  for (const product of shared.PRODUCT_MODES) {
    const draft = { ...web.blankDraft(), name: 'n', prompt: 'p', mode: product };
    const r = normalise(draft);
    assert.equal(r.ok, true, `${product}: ${r.reason}`);
    assert.equal(r.automation.mode, shared.PRODUCT_MODE_TO_SPECIALIST[product]);
  }
});

test('an over-long name is sent WHOLE and refused by the server, never trimmed here', () => {
  const name = 'x'.repeat(worker.NAME_MAX + 1);
  const body = web.draftToBody({ ...web.blankDraft(), name, prompt: 'p' });
  assert.equal(body.name.length, worker.NAME_MAX + 1, 'trimming here would store a name nobody typed');
  const r = normalise({ ...web.blankDraft(), name, prompt: 'p' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'bad_name');
  assert.equal(web.refusalFor(r.reason).field, 'name');
});

test('the counter says over-limit before the server does, without changing the value', () => {
  assert.equal(web.overBy('x'.repeat(worker.NAME_MAX), worker.NAME_MAX), 0);
  assert.equal(web.overBy('x'.repeat(worker.NAME_MAX + 3), worker.NAME_MAX), 3);
});

test("the editor's limits are the server's limits, not a second copy of them", () => {
  assert.equal(web.LIMITS.name, worker.NAME_MAX);
  assert.equal(web.LIMITS.description, worker.DESCRIPTION_MAX);
  assert.equal(web.LIMITS.prompt, worker.PROMPT_MAX);
  assert.equal(web.LIMITS.runsPerDay, worker.MAX_RUNS_PER_DAY);
});

test('an empty description is omitted rather than sent as an empty string', () => {
  const body = web.draftToBody({ ...web.blankDraft(), name: 'n', prompt: 'p', description: '   ' });
  assert.equal('description' in body, false, 'an empty string is a description somebody wrote');
  assert.equal(normalise({ ...web.blankDraft(), name: 'n', prompt: 'p', description: '  ' }).automation.description, null);
});

test('the daily cap travels inside budget, where the server reads it', () => {
  const r = normalise({ ...web.blankDraft(), name: 'n', prompt: 'p', maxRunsPerDay: 3 });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.automation.budget.maxRunsPerDay, 3);
});

test('a daily cap outside the range is refused by the server and lands on its own field', () => {
  const r = normalise({ ...web.blankDraft(), name: 'n', prompt: 'p', maxRunsPerDay: worker.MAX_RUNS_PER_DAY + 1 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'bad_budget');
  assert.equal(web.refusalFor('bad_budget').field, 'maxRunsPerDay');
});

// ------------------------------------------------ what the editor deliberately does NOT offer ---

test('the draft carries no trigger but manual, because nothing in this build dispatches one', () => {
  //[[ A SCHEDULE PICKER WOULD BE A CONTROL WIRED TO NOTHING.
  //
  //   `nextFireAfter` is built and tested, `dueAutomations` has its index — and no scheduled
  //   handler exists, because every project-access lookup in the worker goes through PostgREST
  //   under the USER's own JWT and a cron invocation has none. A person who sets "every day at
  //   09:00", watches nothing happen and is told nothing has been sold a feature. So the editor
  //   offers the trigger that works, and a row created through the API with another one is
  //   rendered with `willFireOnItsOwn` false rather than as a working schedule. ]]
  const body = web.draftToBody({ ...web.blankDraft(), name: 'n', prompt: 'p' });
  assert.equal(body.trigger, 'manual');
  assert.equal('schedule' in body, false);
  assert.equal('event' in body, false);
  assert.deepEqual([...web.EDITABLE_TRIGGERS], ['manual']);
});

test('the draft carries no retry count and no credit ceiling, because nothing reads either', () => {
  // `retryVerdict` has no caller and no code compares a run's spend to `maxCreditsPerRun`. A
  // selector for either is a setting the layer below ignores, which is the defect this repository
  // keeps finding. The server's defaults stand until something enforces them.
  const body = web.draftToBody({ ...web.blankDraft(), name: 'n', prompt: 'p' });
  assert.equal('maxRetries' in body, false);
  assert.equal('budget' in body && 'maxCreditsPerRun' in body.budget, false);
});

test('an automation that cannot start on its own says so, and a manual one does not', () => {
  assert.equal(web.willFireOnItsOwn({ trigger: 'manual' }), true, 'Run now is exactly how a manual one starts');
  assert.equal(web.willFireOnItsOwn({ trigger: 'schedule' }), false);
  assert.equal(web.willFireOnItsOwn({ trigger: 'event' }), false);
  assert.match(web.DORMANT_NOTE, /Run now/, 'the note has to say what DOES work');
});

// ------------------------------------------------------------------- the run history ---

test('every outcome the worker can record has a word for it', () => {
  for (const outcome of worker.FIRE_OUTCOMES) {
    const o = web.outcomeLabel(outcome);
    assert.ok(o.label.length > 0, outcome);
    assert.ok(['good', 'bad', 'muted'].includes(o.tone), `${outcome} has tone ${o.tone}`);
  }
  assert.equal(web.outcomeLabel('ok').tone, 'good');
  assert.equal(web.outcomeLabel('failed').tone, 'bad');
});

test('a run that has not finished reads as running, not as an outcome it does not have', () => {
  const o = web.outcomeLabel(null);
  assert.equal(o.tone, 'muted');
  assert.match(o.label, /Running/i);
});

test('a run whose cost was never recorded reads as unrecorded, not as zero credits', () => {
  // The same distinction `automationSpend` makes. Drawing a null as "0 Credits" is how a spending
  // report understates, and this row is the one place a person looks for what a fire cost.
  assert.equal(web.creditLabel(12), '12 Credits');
  assert.equal(web.creditLabel(null), 'cost not recorded');
});

test('the duration of a run still going is not invented', () => {
  assert.equal(web.durationLabel({ startedAt: 1000, finishedAt: 4500 }), '3.5s');
  assert.equal(web.durationLabel({ startedAt: 1000, finishedAt: null }), null);
});

test('a fire that landed in a daylight-saving fold says which morning it was', () => {
  // `NextFire.fold` and the `fold` column exist so "why did this run at 03:30" is answerable.
  assert.match(web.foldNote('skipped'), /did not exist/i);
  assert.match(web.foldNote('repeated'), /twice/i);
  assert.equal(web.foldNote('normal'), null, 'an ordinary morning has nothing to explain');
  assert.equal(web.foldNote(null), null);
});

// ----------------------------------------------------------- the refusals a FIRE can carry ---

test('every reason a fire can be refused has a sentence, and a queued one is not called dropped', () => {
  for (const reason of worker.START_REFUSALS) {
    assert.ok(web.fireRefusal(reason, false).length > 0, reason);
  }
  const dropped = web.fireRefusal('overlapping', false);
  const queued = web.fireRefusal('overlapping', true);
  assert.notEqual(dropped, queued, '"it was dropped" and "it will be retried" are different facts');
});

test('a fire refused because the route could not observe something says it could not observe it', () => {
  // `run_state_unreadable` and `kill_switch_unreadable` are the route refusing OUT LOUD rather
  // than guessing. Rendering them as "the project is busy" would turn a failure to observe into
  // an observation — the exact shape this tree refuses.
  assert.match(web.fireRefusal('run_state_unreadable', false), /could not/i);
  assert.match(web.fireRefusal('kill_switch_unreadable', false), /could not/i);
  assert.doesNotMatch(web.fireRefusal('run_state_unreadable', false), /busy/i);
});

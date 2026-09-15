/**
 * A RESTORE TELLS THE PERSON WATCHING IT WHAT IS HAPPENING, AND WHAT CAME BACK.
 *
 * Two defects, one silence. (1) A restore was a single opaque op with a 120s ceiling and nothing
 * broadcast while it ran: the ws handler broadcast only on FAILURE, so a user who pressed Restore
 * saw the drawer close and then nothing at all for up to two minutes. (2) The plugin's fidelity
 * report — instancesCreated, scriptsRestored against scriptsExpected, and the caveat when only
 * properties failed — was built, tested, and then dropped on the floor on the one path a person
 * actually clicks: it reached the HTTP caller and the SDK and never the browser.
 *
 * These drive the REAL SessionDO against a REAL SQLite, through the real gzip/chunk path, and
 * assert on what the socket actually received.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionHarness, answerNextOp } from './session-harness.mjs';

const SNAPSHOT = { scriptCount: 2, instanceCount: 9, tree: { Workspace: { children: [] } } };
const CLEAN_REPORT = {
  restored: true,
  instancesCreated: 9,
  scriptsRestored: 2,
  scriptsExpected: 2,
  failedInstances: 0,
  failedScripts: 0,
  failedProperties: 0,
};

async function seedCheckpoint(h, label = 'before the portal') {
  const pending = h.session.createCheckpoint(label, 'manual');
  await answerNextOp(h, { ok: true, data: SNAPSHOT });
  const cp = await pending;
  assert.ok(!('error' in cp), `checkpoint could not be created: ${JSON.stringify(cp)}`);
  return cp;
}

async function restore(h, id, report) {
  const pending = h.session.restoreCheckpoint(id);
  await answerNextOp(h, { ok: true, data: report });
  return await pending;
}

const statuses = (h) => h.sent.filter((m) => m.type === 'restore_status');

test('a restore announces each phase as it reaches it', async () => {
  const h = sessionHarness();
  const cp = await seedCheckpoint(h);
  h.sent.length = 0;
  const res = await restore(h, cp.id, CLEAN_REPORT);

  assert.equal(res.ok, true);
  const phases = statuses(h).map((m) => m.phase);
  assert.deepEqual(
    phases,
    ['reading', 'applying', 'verifying', 'done'],
    'the browser must be told the restore started, is applying, is being checked, and finished',
  );
  for (const m of statuses(h)) {
    assert.equal(m.checkpointId, cp.id, 'every phase must name the checkpoint it belongs to');
  }
});

test('the finished phase carries the fidelity report the plugin sent back', async () => {
  // The report exists and is well tested (restore-fidelity.test.mjs). What was missing is that it
  // ever reached a browser: a restore that recreated 9 instances and 2 scripts told the user
  // nothing, so "it worked" and "it half worked" looked identical.
  const h = sessionHarness();
  const cp = await seedCheckpoint(h);
  h.sent.length = 0;
  await restore(h, cp.id, CLEAN_REPORT);

  const done = statuses(h).at(-1);
  assert.equal(done.phase, 'done');
  assert.equal(done.fidelity.instancesCreated, 9);
  assert.equal(done.fidelity.scriptsRestored, 2);
  assert.equal(done.fidelity.scriptsExpected, 2);
  assert.equal(done.error, undefined);
});

test('a restore that could not set some properties says so, verbatim, on the success path', async () => {
  const h = sessionHarness();
  const cp = await seedCheckpoint(h);
  h.sent.length = 0;
  const res = await restore(h, cp.id, { ...CLEAN_REPORT, failedProperties: 4 });

  assert.equal(res.ok, true);
  const done = statuses(h).at(-1);
  assert.equal(done.phase, 'done');
  assert.equal(done.note, res.note, 'the caveat the caller gets and the one the browser gets must be the same sentence');
  assert.match(done.note, /4 properties could not be set/);
});

test('a plugin too old to report is broadcast as unverified, not as success', async () => {
  const h = sessionHarness();
  const cp = await seedCheckpoint(h);
  h.sent.length = 0;
  const { restored, ...noVerdict } = CLEAN_REPORT;
  await restore(h, cp.id, noVerdict);

  const done = statuses(h).at(-1);
  assert.equal(done.phase, 'done');
  assert.match(done.note, /too old to report/);
});

test('a failed restore ends in a failed phase carrying what went wrong', async () => {
  const h = sessionHarness();
  const cp = await seedCheckpoint(h);
  h.sent.length = 0;
  const res = await restore(h, cp.id, { ...CLEAN_REPORT, restored: false, failedInstances: 3, error: 'three models would not rebuild' });

  assert.equal(res.ok, false);
  const last = statuses(h).at(-1);
  assert.equal(last.phase, 'failed');
  assert.equal(last.error, 'three models would not rebuild');
  assert.equal(last.fidelity.failedInstances, 3, 'a failure must still say how far it got');
});

test('a restore of a checkpoint that is not there fails loudly rather than silently', async () => {
  const h = sessionHarness();
  h.sent.length = 0;
  const res = await h.session.restoreCheckpoint('cp-that-never-existed');
  assert.equal(res.ok, false);
  const last = statuses(h).at(-1);
  assert.ok(last, 'a restore that never starts must still be reported — the drawer is waiting on it');
  assert.equal(last.phase, 'failed');
  assert.match(last.error, /not found/);
});

test('the phases stop at failed — nothing claims done after a failure', async () => {
  const h = sessionHarness();
  const cp = await seedCheckpoint(h);
  h.sent.length = 0;
  await restore(h, cp.id, { ...CLEAN_REPORT, restored: false });
  const phases = statuses(h).map((m) => m.phase);
  assert.equal(phases.at(-1), 'failed', `phases were ${phases.join(' → ') || '(none at all)'}`);
  assert.ok(!phases.includes('done'), `phases were ${phases.join(' → ')}`);
});

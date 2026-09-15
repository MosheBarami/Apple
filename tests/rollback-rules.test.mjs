// The undo's rules, each one handed something that violates it.
//
// docs/FAILURES.md F-62: the documented rollback for a bad static deploy uploaded nothing and
// printed `done`. Nothing in this repository executed that path, and nothing would have — the
// defect is invisible to every test that only walks the healthy path, because the healthy path
// was not the one the documentation named.
//
// So every test below hands `scripts/lib/rollback-rules.mjs` a capture, a result or a probe that
// is wrong in one specific way and watches the rule fire, and each is paired with a CONTROL: the
// same input with that one fault removed, which must pass. Without the control a rule that
// refuses everything looks identical to a rule that works.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decideAutoRollback,
  judgeHealth,
  judgeProbe,
  judgeRestore,
  planRestore,
} from '../scripts/lib/rollback-rules.mjs';

/** A capture of two files that reconciles with itself. Every test starts from this and breaks it. */
const manifest = (over = {}) => ({
  origin: 'https://example.test',
  at: '2026-09-15T00:00:00.000Z',
  overwritable: 2,
  captured: 2,
  additions: 0,
  unrestorable: 0,
  failures: 0,
  files: [
    { remote: '/index.html', url: 'https://example.test/', bytes: 120, contentType: 'text/html; charset=utf-8' },
    { remote: '/styles.css', url: 'https://example.test/styles.css', bytes: 40, contentType: 'text/css' },
  ],
  additionPaths: [],
  unrestorablePaths: [],
  failurePaths: [],
  ...over,
});

const onDisk = (over = {}) => new Map(Object.entries({
  '/index.html': { bytes: 120 },
  '/styles.css': { bytes: 40 },
  ...over,
}));

/* ------------------------------------------------------------------ the plan --- */

test('CONTROL: a capture that reconciles plans both of its files and refuses nothing', () => {
  const plan = planRestore(manifest(), onDisk());
  assert.deepEqual(plan.refusals, []);
  assert.equal(plan.restore.length, 2);
  // The relationship, not the literal: everything the manifest says it captured is planned.
  assert.equal(plan.restore.length, manifest().captured);
});

test('a manifest whose counts do not reconcile is refused', () => {
  // capture-rollback.mjs exits 1 rather than write this, so a manifest in this state was edited
  // or came from a capture that died part way. Either way it does not describe the origin.
  const plan = planRestore(manifest({ overwritable: 9 }), onDisk());
  assert.match(plan.refusals.join('\n'), /does not reconcile/);
  // The plan still says what it WOULD have restored — that is what makes a rehearsal readable —
  // and the refusal is what stops it, which is asserted where it is enforced.
  assert.equal(judgeRestore(plan, { uploaded: 2, verified: 2, failures: [] }).ok, false);
});

test('a manifest that lists fewer files than it claims to have captured is refused', () => {
  const m = manifest();
  m.files = [m.files[0]];
  const plan = planRestore(m, onDisk());
  assert.match(plan.refusals.join('\n'), /says 2 file\(s\) were captured and lists 1/);
});

test('a capture that recorded failures is refused, and --partial is what accepts it knowingly', () => {
  const broken = manifest({ failures: 1, overwritable: 3, failurePaths: [{ remote: '/og.png', why: 'HTTP 500' }] });
  const refused = planRestore(broken, onDisk());
  assert.match(refused.refusals.join('\n'), /holes in it/);

  // THE CONTROL, and it is the interesting half: the same capture is restorable once someone has
  // said so explicitly. A refusal that cannot be overridden gets worked around with a shell loop.
  const accepted = planRestore(broken, onDisk(), { allowPartial: true });
  assert.deepEqual(accepted.refusals, []);
  assert.equal(accepted.restore.length, 2);
});

test('a file in the manifest that is not on disk is refused — the bytes to put back are missing', () => {
  const plan = planRestore(manifest(), new Map([['/index.html', { bytes: 120 }]]));
  assert.match(plan.refusals.join('\n'), /\/styles\.css is in the manifest and not in the capture directory/);
});

test('a captured file whose length on disk differs from the manifest is refused', () => {
  // A truncated backup is the failure mode capture-rollback was written against: a file that
  // LOOKS present and is not the bytes that were live.
  const plan = planRestore(manifest(), onDisk({ '/styles.css': { bytes: 39 } }));
  assert.match(plan.refusals.join('\n'), /39 bytes on disk and 40 in the manifest/);
});

test('a zero-byte or unreadable length in the manifest is refused, not treated as a small file', () => {
  for (const bytes of [0, '40', Number.NaN, undefined, null]) {
    const m = manifest();
    m.files[1] = { ...m.files[1], bytes };
    const plan = planRestore(m, onDisk());
    assert.match(
      plan.refusals.join('\n'),
      /not a length a capture can have/,
      `${JSON.stringify(bytes)} must not pass as a byte count`,
    );
  }
});

test('a file the capture directory holds and the manifest does not mention blocks the restore', () => {
  // Uploading it would publish bytes nothing recorded; ignoring it silently would hide that
  // someone has been editing the undo.
  const plan = planRestore(manifest(), onDisk({ '/evil.js': { bytes: 12 } }));
  assert.match(plan.refusals.join('\n'), /\/evil\.js is in the capture directory and not in the manifest/);
  assert.deepEqual(plan.unlisted, ['/evil.js']);
});

test('a path listed twice in the manifest is refused', () => {
  const m = manifest();
  m.files.push({ ...m.files[0] });
  m.captured = 3;
  m.overwritable = 3;
  const plan = planRestore(m, onDisk());
  assert.match(plan.refusals.join('\n'), /listed twice/);
});

test('a capture with nothing restorable in it is refused rather than called an empty success', () => {
  const plan = planRestore(manifest({ captured: 0, files: [], overwritable: 0 }), new Map());
  assert.match(plan.refusals.join('\n'), /there is nothing to put back/);
});

test('additions and unrestorable paths are NAMED as staying published, never dropped', () => {
  // F-62's second finding: a restore covers overwrites. A path the new build introduced did not
  // exist on the origin, so the rollback leaves the bad deploy's version of it live — and the
  // difference between "restored" and "cannot be restored" is the whole value of the record.
  const plan = planRestore(manifest({
    overwritable: 4,
    additions: 1,
    unrestorable: 1,
    additionPaths: ['/og.png'],
    unrestorablePaths: [{ remote: '/icon-192.png', servedType: 'text/html', expected: 'image/png' }],
  }), onDisk());
  assert.deepEqual(plan.refusals, []);
  assert.deepEqual(plan.leftPublished, ['/og.png', '/icon-192.png']);
});

test('a manifest that is not an object, or has no files list, produces a refusal rather than a crash', () => {
  for (const bad of [null, 'MANIFEST.json', [], 42]) {
    assert.equal(planRestore(bad, onDisk()).refusals.length > 0, true, `${JSON.stringify(bad)} is not a manifest`);
  }
  assert.match(planRestore({ captured: 1 }, onDisk()).refusals.join('\n'), /no "files" list/);
});

/* --------------------------------------------------------------- the verdict --- */

const goodPlan = () => planRestore(manifest(), onDisk());

test('CONTROL: a restore that uploaded and verified everything planned is ok', () => {
  const plan = goodPlan();
  const v = judgeRestore(plan, { uploaded: 2, verified: 2, failures: [] });
  assert.equal(v.ok, true, v.problems.join('; '));
  assert.equal(v.restored, plan.restore.length);
});

test('THE DEFECT, F-62: a restore that uploaded NOTHING is not a success', () => {
  // This is the line the documented rollback command would have failed. `--only file a b` matched
  // no branch, transferred zero bytes, and printed `done`.
  const v = judgeRestore(goodPlan(), { uploaded: 0, verified: 0, failures: [] });
  assert.equal(v.ok, false);
  assert.match(v.problems.join('\n'), /0 of 2 file\(s\) were uploaded/);
  assert.match(v.problems.join('\n'), /may never read as success/);
});

test('a count that is not a number fails the verdict instead of passing a comparison', () => {
  // `results.uploaded ?? 0` defends undefined and null and nothing else. NaN is the sharp one:
  // `NaN === 0` is false and `NaN !== planned` is true, so the same value can satisfy or fail
  // whichever comparison happens to be written first.
  for (const uploaded of [Number.NaN, '2', Infinity, undefined, null, 2.5, -1]) {
    const v = judgeRestore(goodPlan(), { uploaded, verified: 2, failures: [] });
    assert.equal(v.ok, false, `${JSON.stringify(uploaded)} must not pass as a count of files written`);
    assert.match(v.problems.join('\n'), /did not report a count of files written/);
  }
});

test('a partial restore is a failure — a mixed origin is not a rolled-back one', () => {
  const v = judgeRestore(goodPlan(), { uploaded: 1, verified: 1, failures: [] });
  assert.equal(v.ok, false);
  assert.match(v.problems.join('\n'), /1 of 2 file\(s\) were uploaded/);
});

test('an upload that was not read back does not count as restored', () => {
  // Uploading is not restoring: a 200 from the admin route says a row was written, not that the
  // origin now serves those bytes — and serving the wrong thing under a 200 is a defect this
  // repository has already shipped once, on the pricing page.
  const v = judgeRestore(goodPlan(), { uploaded: 2, verified: 1, failures: [] });
  assert.equal(v.ok, false);
  assert.match(v.problems.join('\n'), /an unverified upload is not a restore/);
  assert.equal(v.restored, 1, 'the number reported as restored is the number VERIFIED');
});

test('a missing failures list is not an empty one', () => {
  const v = judgeRestore(goodPlan(), { uploaded: 2, verified: 2 });
  assert.equal(v.ok, false);
  assert.match(v.problems.join('\n'), /did not report a list of failures/);
});

test('every reported failure reaches the verdict, named', () => {
  const v = judgeRestore(goodPlan(), { uploaded: 2, verified: 2, failures: [{ remote: '/styles.css', why: 'HTTP 500' }] });
  assert.equal(v.ok, false);
  assert.match(v.problems.join('\n'), /\/styles\.css — HTTP 500/);
});

test('a plan that refused is still refused after the uploader reports success', () => {
  // The order matters: an uploader that claims to have written two files against a capture that
  // was never fit to restore from must not be able to talk its way into a green verdict.
  const plan = planRestore(manifest({ failures: 3, overwritable: 5 }), onDisk());
  const v = judgeRestore(plan, { uploaded: 2, verified: 2, failures: [] });
  assert.equal(v.ok, false);
  assert.match(v.problems.join('\n'), /holes in it/);
});

test('an empty plan cannot be a success, however cleanly the uploader reports', () => {
  const v = judgeRestore({ restore: [], refusals: [] }, { uploaded: 0, verified: 0, failures: [] });
  assert.equal(v.ok, false);
  assert.match(v.problems.join('\n'), /has not rolled anything back/);
});

/* ----------------------------------------------------------------- the probes --- */

test('CONTROL: a probe that gets what it asked for passes', () => {
  const r = judgeProbe({ name: '/', status: 200, contentTypeIncludes: 'text/html' }, { status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html>' });
  assert.equal(r.ok, true, r.why.join('; '));
});

test('a 200 with the wrong content type is a failure — the pricing page answered 200 and browsers DOWNLOADED it', () => {
  const r = judgeProbe({ name: '/pricing', status: 200, contentTypeIncludes: 'text/html' }, { status: 200, contentType: 'application/octet-stream', body: '<!doctype html>' });
  assert.equal(r.ok, false);
  assert.match(r.why.join('; '), /application\/octet-stream/);
});

test('a probe whose request threw is a FAILURE, never a probe that is dropped', () => {
  // Dropping it would let a total outage read as "no failing probes", which is a failure to
  // observe rendering as an observation.
  const r = judgeProbe({ name: '/', status: 200 }, { error: 'ECONNREFUSED' });
  assert.equal(r.ok, false);
  assert.match(r.why.join('; '), /ECONNREFUSED/);
});

test('the health route is checked for a shape, not for a 200', () => {
  const probe = {
    name: '/api/health',
    status: 200,
    contentTypeIncludes: 'application/json',
    json: { ok: true, buildSha: (s) => (s === 'unknown' ? 'deployed without a build sha' : true) },
  };
  const good = judgeProbe(probe, { status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, buildSha: 'abc123' }) });
  assert.equal(good.ok, true, good.why.join('; '));

  // `ok: false` under a 200 is exactly what a worker in trouble returns.
  const sick = judgeProbe(probe, { status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, buildSha: 'abc123' }) });
  assert.equal(sick.ok, false);
  assert.match(sick.why.join('; '), /ok is false/);

  // `unknown` is what the worker reports when a deploy supplied no sha, which makes the §10.2
  // comparison between deployed build and HEAD unperformable while looking like an answer.
  const blind = judgeProbe(probe, { status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, buildSha: 'unknown' }) });
  assert.equal(blind.ok, false);
  assert.match(blind.why.join('; '), /deployed without a build sha/);

  const garbage = judgeProbe(probe, { status: 200, contentType: 'application/json', body: 'not json' });
  assert.equal(garbage.ok, false);
  assert.match(garbage.why.join('; '), /not a JSON object/);
});

/* ----------------------------------------------------------------- the health --- */

test('THE OBSERVATION RULE: a run in which no probe produced a result is UNOBSERVED, not healthy', () => {
  for (const nothing of [[], null, undefined]) {
    const h = judgeHealth(nothing);
    assert.equal(h.verdict, 'unobserved', 'zero probes is not a clean bill of health');
    assert.notEqual(h.verdict, 'healthy');
  }
});

test('a run thinner than the one that was asked for is unobserved', () => {
  const h = judgeHealth([{ name: '/', ok: true }], { minProbes: 4 });
  assert.equal(h.verdict, 'unobserved');
  assert.match(h.reason, /at least 4 were required/);
  // CONTROL: the same probes with the floor they actually meet.
  assert.equal(judgeHealth([{ name: '/', ok: true }], { minProbes: 1 }).verdict, 'healthy');
});

test('a probe that did not answer counts against health — `ok !== true`, not `!ok`', () => {
  for (const ok of [undefined, null, 'yes', 1, false]) {
    const h = judgeHealth([{ name: '/', ok: true }, { name: '/pricing', ok }]);
    assert.equal(h.verdict, 'unhealthy', `${JSON.stringify(ok)} is not a probe that passed`);
  }
  assert.equal(judgeHealth([{ name: '/', ok: true }, { name: '/pricing', ok: true }]).verdict, 'healthy');
});

test('a non-integer floor cannot be used to wave a check through', () => {
  for (const floor of [Number.NaN, 0, -1, '3', undefined]) {
    const h = judgeHealth([{ name: '/', ok: true }], { minProbes: floor });
    if (floor === undefined) { assert.equal(h.verdict, 'healthy', 'an absent floor means the default of one'); continue; }
    assert.equal(h.verdict, 'unobserved', `${JSON.stringify(floor)} is not a floor`);
  }
});

test('only "unhealthy" triggers an automatic rollback, and the three verdicts have three exit codes', () => {
  const unhealthy = decideAutoRollback(judgeHealth([{ name: '/', ok: false }]));
  assert.equal(unhealthy.rollback, true);
  assert.equal(unhealthy.exit, 1);

  const healthy = decideAutoRollback(judgeHealth([{ name: '/', ok: true }]));
  assert.equal(healthy.rollback, false);
  assert.equal(healthy.exit, 0);

  // The one that matters: could-not-see does not undo a deploy, and does not bless it either.
  const blind = decideAutoRollback(judgeHealth([]));
  assert.equal(blind.rollback, false, 'a checker that could not look must not un-deploy a working release');
  assert.equal(blind.exit, 2, 'and it must not exit 0 either');
  assert.match(blind.reason, /no clean bill of health is claimed/);

  assert.equal(decideAutoRollback(undefined).exit, 2, 'no verdict at all is undecided, not healthy');
});

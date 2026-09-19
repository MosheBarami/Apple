// The owner's release-acceptance scenarios, run as tests.
//
// `acceptance.mjs` holds the scenarios and the checks; this file is the part that makes them go
// red in `pnpm -r test` and therefore in CI. It is deliberately thin: the report in
// `success-metrics.mjs` runs the SAME list through the same functions, so a scenario cannot pass
// in one and fail in the other.
//
// Offline. No model call, no network, no spend — see the header of acceptance.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BRIEF, SCENARIOS } from './acceptance.mjs';

test('the harness still implements every scenario the brief names, and no others', () => {
  assert.equal(
    SCENARIOS.length,
    BRIEF.itemCount,
    `${BRIEF.file} section "${BRIEF.section}" names ${BRIEF.itemCount} scenarios; this harness holds ${SCENARIOS.length}`,
  );
  assert.deepEqual(
    SCENARIOS.map((s) => s.n),
    Array.from({ length: BRIEF.itemCount }, (_, i) => i + 1),
    'the scenarios are no longer the brief’s items 1..20 in order',
  );
  for (const s of SCENARIOS) {
    assert.ok(typeof s.name === 'string' && s.name.length > 0, `scenario ${s.n} has no name`);
    if (s.skip) {
      assert.ok(s.skip.length > 40, `scenario ${s.n} is skipped without a real reason`);
    } else {
      assert.equal(typeof s.run, 'function', `scenario ${s.n} neither runs nor says why not`);
      assert.ok(s.checks && s.checks.length > 0, `scenario ${s.n} does not say what it checks`);
      assert.ok(s.notChecked && s.notChecked.length > 0, `scenario ${s.n} does not say what it leaves unchecked`);
    }
  }
});

for (const s of SCENARIOS) {
  if (s.skip) {
    // A skip is still a test: its stated reason is asserted, so the day the reason stops being
    // true the suite says so instead of carrying a stale excuse forever.
    test(`ACCEPTANCE ${s.n} · SKIPPED · ${s.name}`, async () => {
      assert.equal(typeof s.guardSkipReason, 'function', 'a skipped scenario must verify its stated reason');
      await s.guardSkipReason();
    });
    continue;
  }
  test(`ACCEPTANCE ${s.n} · ${s.name}`, async () => {
    await s.run();
  });
}

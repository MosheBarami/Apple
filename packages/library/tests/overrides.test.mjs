import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOverride } from '../tools/apply-overrides.mjs';

test('an override sets the grade or the maturity, and keeps the reason as critic L4 once', () => {
  const it = { id: 'a', grade: 'A', grade_notes: [{ critic: '1', grade: 'A', why: 'clear' }] };
  const c = applyOverride(it, { grade: 'C', reason: 'L4: gambling' });
  assert.equal(c.grade, 'C');
  assert.deepEqual(c.grade_notes.at(-1), { critic: 'L4', grade: 'C', why: 'L4: gambling' });
  assert.equal(applyOverride(c, { grade: 'C', reason: 'L4: gambling' }).grade_notes.filter((n) => n.critic === 'L4').length, 1);
  const m = applyOverride(it, { maturity: 'Mild', reason: 'horror' });
  assert.equal(m.maturity, 'Mild');
  assert.equal(m.grade, 'A');
});

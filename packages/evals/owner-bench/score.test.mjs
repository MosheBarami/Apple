/** The owner-bench scorer (score.mjs): fixed formula, unmeasured is never zero or a pass. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreRun, scoreMarkdown, WEIGHTS } from './score.mjs';

const row = (id, category, s, extra = {}) => ({ id, category, turns: [id], total: s.reduce((a, b) => a + b, 0), credits: 1, seconds: 10,
  scores: Object.fromEntries(['works', 'professional', 'matches', 'polished', 'noErrors', 'performance', 'sound', 'animation', 'fx'].map((k, i) => [k, s[i]])), critique: ['x'], ...extra });

test('the meter follows the fixed weights and marks what was not measured', () => {
  assert.equal(Object.values(WEIGHTS).reduce((a, b) => a + b, 0), 100);
  const rows = [row('o1', 'object', [2, 1, 0, 0, 2, 2, 0, 1, 0]), row('u1', 'ui', [1, 1, 1, 2, 2, 2, 0, 0, 0]), { id: 'g1', category: 'game', status: 'error', error: 'did not run' }];
  const run = scoreRun(rows);
  assert.equal(run.judged, 2);
  assert.deepEqual(run.unmeasured, ['g1'], 'an item that did not run is unmeasured, not zero');
  assert.equal(run.domains.agent.value, 66.7, 'mean of (works+matches+noErrors)/3 over judged items, as a share of 2');
  assert.equal(run.domains.ui.value, 100, 'polished on ui (and game) items');
  assert.equal(run.domains.visual.value, 50, 'professional on visual categories only');
  assert.equal(run.domains.library.measured, false);
  assert.match(scoreMarkdown(run, rows), /Unmeasured: g1/);
});

test('with no ui or game item judged, ui stays an estimate', () => {
  const run = scoreRun([row('o1', 'object', [1, 1, 1, 1, 1, 1, 1, 1, 1])]);
  assert.equal(run.domains.ui.measured, false);
});

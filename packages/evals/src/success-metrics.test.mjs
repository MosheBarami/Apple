// The success-metrics report is not allowed to invent a number.
//
// The report's whole value is that an unmeasurable metric prints "not measured, because <reason>"
// instead of a plausible figure — which is a promise, and a promise nothing checks is the exact
// shape of defect this repository keeps finding. These tests hold the promise against the report's
// own data, not against its text.
//
// Offline. Importing the report runs it; it prints nothing unless invoked as a script.
import test from 'node:test';
import assert from 'node:assert/strict';
import { REPORT } from './success-metrics.mjs';
import { BRIEF } from './acceptance.mjs';

test('every measure is either a real number or a stated reason, and never both and never neither', () => {
  assert.ok(REPORT.analytics.measures.length > 0, 'the report measures nothing at all');
  for (const m of REPORT.analytics.measures) {
    assert.ok(m.state === 'measured' || m.state === 'not-measured', `measure ${m.item} has state "${m.state}"`);
    if (m.state === 'measured') {
      assert.equal(typeof m.value, 'number', `measure ${m.item} ("${m.name}") is measured but its value is not a number`);
      // EVERY MEASURE THIS REPORT CAN COMPUTE IS A COUNT. A fractional value here means a rate
      // was estimated rather than counted, which is the one thing the report promises not to do —
      // and a plausible fraction is exactly what an invented metric looks like.
      assert.ok(
        Number.isInteger(m.value),
        `measure ${m.item} ("${m.name}") reported ${m.value}; every measure this report can compute is a count, so a fraction is a figure that was not counted`,
      );
      assert.ok(m.value >= 0, `measure ${m.item} reported a negative count`);
      assert.ok(m.unit && m.unit.length > 0, `measure ${m.item} reported a bare number with no unit`);
      assert.ok(m.how && m.how.length > 0, `measure ${m.item} does not say how it was measured`);
      // Where the things counted can be enumerated, the number is checked against the list rather
      // than believed. A count that has drifted from what it counts is the cheapest wrong number.
      if (m.counted) {
        assert.equal(
          m.value,
          m.counted.length,
          `measure ${m.item} reports ${m.value} and names ${m.counted.length} things: ${m.counted.join(', ')}`,
        );
      }
    } else {
      assert.equal(m.value, undefined, `measure ${m.item} is unmeasured and carries a value anyway`);
      assert.ok(
        typeof m.because === 'string' && m.because.length > 30,
        `measure ${m.item} ("${m.name}") prints "not measured" with no real reason`,
      );
    }
  }
});

test('a modelled figure is never offered as the measurement it stands in for', () => {
  for (const m of REPORT.analytics.measures) {
    if (m.state !== 'not-measured' || !m.note) continue;
    // A note may carry a modelled number, but only under a reason — so the reason must exist and
    // the note must say what it is not.
    assert.ok(m.because.length > 30, `measure ${m.item} has a note and no reason above it`);
    assert.ok(
      /not from users|not what|not this|must not be quoted|models against/i.test(m.note),
      `measure ${m.item}'s note carries a figure without saying what it is not: ${m.note}`,
    );
  }
});

test('the report says which commit it measured', () => {
  assert.ok(/^[0-9a-f]{40}$/.test(REPORT.provenance.commit ?? ''), 'the report does not name a commit');
  assert.ok(!Number.isNaN(Date.parse(REPORT.provenance.measuredAt)), 'the report does not name a date');
  assert.equal(typeof REPORT.provenance.treeDirty, 'boolean', 'the report does not say whether the tree was dirty');
});

test('the acceptance tally accounts for every scenario the brief names', () => {
  const t = REPORT.acceptance.tally;
  assert.equal(t.total, BRIEF.itemCount, `the brief names ${BRIEF.itemCount} scenarios; the report tallied ${t.total}`);
  assert.equal(t.pass + t.fail + t.skip, t.total, 'the pass/fail/skip counts do not add up to the scenario count');
  for (const s of REPORT.acceptance.scenarios) {
    if (s.verdict === 'skip') {
      assert.ok(s.reason && s.reason.length > 40, `scenario ${s.n} is skipped with no real reason`);
    } else {
      assert.ok(s.checks && s.checks.length > 0, `scenario ${s.n} does not say what it checked`);
      assert.ok(s.notChecked && s.notChecked.length > 0, `scenario ${s.n} does not say what it left unchecked`);
    }
  }
});

test('the completion figure is recomputed from the marks, not copied from the header', () => {
  const c = REPORT.completion;
  assert.equal(c.overall.total, c.overall.done + c.overall.partial + c.overall.notFound + c.overall.other);
  assert.ok(c.overall.total > 0, 'the checklist parsed to zero items — the report would print a number from nothing');
  assert.ok(c.overall.weightedPct >= 0 && c.overall.weightedPct <= 100, 'the weighted figure is not a percentage');
});

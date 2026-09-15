// The scoring CLI, and the three exit codes its gate subcommands are for.
//
// The exit code is the whole contract with CI. 0 = the gate said yes, 1 = it said no,
// 2 = it could not tell. A CI step that only distinguishes zero from non-zero will treat
// "could not measure" as a failure, which is survivable; a CLI that RETURNS 0 for it would
// ship an unmeasured build, which is not. So all three are asserted, against real recorded runs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { main, EXIT, DEFAULT_PROMOTION_POLICY, DEFAULT_ROLLBACK_POLICY } from './score.mjs';

// Two real runs recorded in results/: one healthy, one where all 168 jobs died.
const HEALTHY = 'glm-final';
const OUTAGE = 'baseline-20260830-200846.json';

function run(argv) {
  const out = [];
  const log = console.log;
  const err = console.error;
  console.log = (...a) => out.push(a.join(' '));
  console.error = (...a) => out.push(a.join(' '));
  try {
    const code = main(argv);
    return { code, text: out.join('\n') };
  } finally {
    console.log = log;
    console.error = err;
  }
}

function policyFile(policy) {
  const dir = mkdtempSync(join(tmpdir(), 'golem-policy-'));
  const file = join(dir, 'policy.json');
  writeFileSync(file, JSON.stringify(policy));
  return { file, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('the three exit codes are three distinct values', () => {
  assert.equal(new Set([EXIT.yes, EXIT.no, EXIT.undecided]).size, 3);
  assert.equal(EXIT.yes, 0, 'CI reads 0 as success; the yes code must be 0');
  assert.notEqual(EXIT.undecided, EXIT.yes, '"could not measure" must not exit 0');
});

test('scorecard prints a dash and a reason for a run that measured nothing', () => {
  const { code, text } = run(['scorecard', OUTAGE]);
  assert.equal(code, EXIT.yes);
  assert.match(text, /pass rate\s+— \(all_records_ungraded\)/);
  assert.doesNotMatch(text, /pass rate\s+0\.0%/, 'a run with 168 dead jobs printed a 0% pass rate');
  assert.match(text, /error rate\s+100\.0%/, 'the fact it CAN state is missing');
  assert.match(text, /ungraded: transport_error/);
});

test('leaderboard leaves unmeasurable models unranked', () => {
  const { text } = run(['leaderboard', OUTAGE]);
  for (const model of ['clay', 'stone', 'coder']) {
    assert.match(text, new RegExp(`\\s-\\s+${model}\\s+— \\(all_records_ungraded\\)`), `${model} was ranked on a run that measured nothing`);
  }
});

test('gate promote EXITS 1 for a candidate nobody could measure', () => {
  const { code, text } = run(['gate', 'promote', HEALTHY, OUTAGE]);
  assert.equal(code, EXIT.no, 'an unmeasurable candidate was promoted');
  assert.match(text, /BLOCKED/);
  assert.match(text, /BLOCK passRate: unmeasured/);
});

test('gate promote EXITS 0 for a run that meets the default policy against itself', () => {
  const { code, text } = run(['gate', 'promote', HEALTHY, HEALTHY]);
  assert.equal(code, EXIT.yes, text);
  assert.match(text, /PROMOTE/);
});

test('gate rollback EXITS 1 when a trigger actually fired', () => {
  const { code, text } = run(['gate', 'rollback', HEALTHY, OUTAGE]);
  assert.equal(code, EXIT.no);
  assert.match(text, /FIRED errorRate/);
});

test('gate rollback EXITS 2 — not 0 — when every trigger was unmeasurable', () => {
  // The whole reason for a third exit code. Policy watches pass rate only; the live run
  // measured no pass rate; the gate must not report a healthy deploy.
  const { file, cleanup } = policyFile({ triggers: { passRate: { maxDrop: 0.1 } } });
  try {
    const { code, text } = run(['gate', 'rollback', HEALTHY, OUTAGE, '--policy', file]);
    assert.equal(code, EXIT.undecided, 'an unmeasurable deploy exited as healthy or as a rollback');
    assert.match(text, /INDETERMINATE/);
    assert.match(text, /UNMEASURED passRate/);
    assert.doesNotMatch(text, /FIRED/);
  } finally {
    cleanup();
  }
});

test('gate rollback EXITS 0 only when nothing fired AND nothing went unmeasured', () => {
  const { file, cleanup } = policyFile({ triggers: { errorRate: { max: 0.1 }, completionRate: { min: 0.9 } } });
  try {
    const { code, text } = run(['gate', 'rollback', HEALTHY, HEALTHY, '--policy', file]);
    assert.equal(code, EXIT.yes, text);
    assert.match(text, /HEALTHY/);
  } finally {
    cleanup();
  }
});

test('diff exits 2 when nothing regressed but something could not be measured', () => {
  // "No regressions" over rows nobody measured is the claim this refuses to make.
  const { code, text } = run(['diff', HEALTHY, HEALTHY]);
  assert.equal(code, EXIT.undecided, text);
  assert.match(text, /UNMEASURED \d+ metric row\(s\)/);
});

test('history keeps the unmeasurable run as a gap in the series', () => {
  const { code, text } = run(['history', '--metric', 'passRate']);
  assert.equal(code, EXIT.yes);
  assert.match(text, /gap\(s\)/);
  assert.match(text, /— \(all_records_ungraded\)/);
});

test('an unknown metric is a usage error rather than an empty table', () => {
  assert.equal(run(['leaderboard', '--metric', 'vibes']).code, EXIT.usage);
});

test('an unknown run reference is a usage error, not a silent default', () => {
  assert.equal(run(['scorecard', 'no-such-run-anywhere']).code, EXIT.usage);
});

test('the default policies name metrics that exist and thresholds that are numbers', () => {
  // A policy naming a metric that does not exist would block every promotion with
  // `metric_absent` forever, and a policy with no numeric threshold checks nothing.
  for (const [label, policy, key] of [
    ['promotion', DEFAULT_PROMOTION_POLICY, 'require'],
    ['rollback', DEFAULT_ROLLBACK_POLICY, 'triggers'],
  ]) {
    const entries = Object.entries(policy[key]);
    assert.ok(entries.length > 0, `${label} policy is empty`);
    for (const [id, rule] of entries) {
      const numbers = Object.values(rule).filter((v) => Number.isFinite(v));
      assert.ok(numbers.length > 0, `${label}.${id} has no numeric threshold`);
      const probe = run(['gate', label === 'promotion' ? 'promote' : 'rollback', HEALTHY, HEALTHY]);
      assert.doesNotMatch(probe.text, new RegExp(`${id}: metric_absent`), `${label} policy names a metric the diff does not carry: ${id}`);
    }
  }
});

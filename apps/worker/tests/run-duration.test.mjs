/** Regression contract for autonomous long-horizon runs.
 *
 * Apple used to stop a healthy build after 5/20/45 minutes or 3/16/24 model steps and tell the
 * customer to send another message. Those are product-imposed boundaries, not Cloudflare limits.
 * Runs now continue across Durable Object alarms; the real terminal fences remain Stop/access,
 * Credits/BudgetDO and bounded individual provider/tool operations.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');

test('a run has no wall-clock or step-count terminal branch', () => {
  assert.doesNotMatch(source, /RUN_WALL_MS/);
  assert.doesNotMatch(source, /runDurationVerdict/);
  assert.doesNotMatch(source, /agent\.step\s*>\s*agent\.maxSteps/);
  assert.doesNotMatch(source, /reached the step limit for this run/i);
  assert.doesNotMatch(source, /minute time limit/i);
});

test('long-horizon autonomy keeps the real safety and spend fences', () => {
  assert.match(source, /if \(await this\.stopForAccess\(agent\)\) return/,
    'access revocation must still stop a run between durable steps');
  assert.match(source, /if \(state\.creditsRemaining <= 0\)/,
    'unbounded steps must still stop when the account has no Credits');
  assert.match(source, /BudgetError/,
    'BudgetDO failures remain a hard run boundary');
  assert.match(source, /stopRequested/,
    'the user Stop fence disappeared');
});

test('free provider refusals sleep and retry inside the same durable run', () => {
  assert.match(source, /RATE_LIMIT_WAIT_MS\[Math\.min\(waited, RATE_LIMIT_WAIT_MS\.length - 1\)\]/);
  assert.match(source, /agent\.step = Math\.max\(0, agent\.step - 1\)/);
  assert.match(source, /setAlarm\(agent\.resumeAt\)/);
});

test('output truncation is an internal recovery event, not a terminal reply', () => {
  assert.match(source, /finishReason === 'length'/);
  assert.match(source, /did not end the run/);
  assert.match(source, /Continue the SAME task/);
  assert.match(source, /setAlarm\(Date\.now\(\) \+ 10\)/);
});

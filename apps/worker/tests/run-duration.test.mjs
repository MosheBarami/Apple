/** Regression contract for long-horizon runs and the one explicit per-message work bound. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');

test('a run has no wall-clock cutoff and has exactly the 1000-step message ceiling', () => {
  assert.doesNotMatch(source, /RUN_WALL_MS/);
  assert.doesNotMatch(source, /runDurationVerdict/);
  assert.doesNotMatch(source, /STEP_STALE_MS/,
    'run age must not make a live durable run replaceable by a newer message');
  assert.match(source, /export const MAX_RUN_STEPS = 1000/);
  assert.match(source, /if \(agent\.step >= MAX_RUN_STEPS\)/);
  assert.match(source, /finishRun\(agent, 'incomplete', undefined, undefined, 'step_limit'\)/);
  assert.doesNotMatch(source, /minute time limit/i);
});

test('long-horizon autonomy keeps the real safety and spend fences', () => {
  assert.match(source, /if \(await this\.stopForAccess\(agent\)\) return/,
    'access revocation must still stop a run between durable steps');
  assert.match(source, /state\.unmetered !== true && state\.creditsRemaining <= 0/,
    'ordinary accounts must still stop when they have no Credits, while authoritative unmetered accounts bypass that fence');
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

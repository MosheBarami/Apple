/**
 * WHAT A FINISHED PLAYTEST ACTUALLY CHECKED — for the AI Elements `test-results` pick.
 *
 * Upstream draws a test run: passed, failed, skipped, a progress bar, one row per test. A playtest
 * is not a test suite, and this module refuses to pretend it is one. Every row below is a count the
 * worker measured and put on the wire (see PlaytestRun in @golem/shared). There is no row for "the
 * game works", because nothing measured that.
 *
 *   Errors in Output   — passed when Studio's console logged no error during run mode.
 *   Warnings in Output — never a failure; a warning is shown as skipped-grey when there were some,
 *                        passed when there were none.
 *   Pictures arrived   — passed when every requested frame arrived, failed when none did, and
 *                        skipped when some were lost (the playtest still ran).
 *
 * Only for a playtest that ended. A running one has no result yet, and a result drawn early would
 * be a claim about a game that is still being played.
 */
import type { PlaytestRun } from '@golem/shared';

export type CheckStatus = 'passed' | 'failed' | 'skipped';

export interface PlaytestCheck {
  id: 'errors' | 'warnings' | 'frames' | 'ran';
  name: string;
  status: CheckStatus;
  /** A short fact, plain. */
  note: string;
}

export interface PlaytestSummary {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  /** Measured run time, from the worker's own timestamps. */
  durationMs: number | null;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function playtestChecks(run: PlaytestRun | null): PlaytestCheck[] {
  if (!run || (run.phase !== 'finished' && run.phase !== 'failed')) return [];
  const checks: PlaytestCheck[] = [];
  if (run.phase === 'failed') {
    checks.push({ id: 'ran', name: 'Playtest ran', status: 'failed', note: run.error ?? 'Run mode did not start.' });
  } else {
    checks.push({ id: 'ran', name: 'Playtest ran', status: 'passed', note: `${run.requestedSeconds}s of run mode` });
  }
  checks.push(run.consoleErrors > 0
    ? { id: 'errors', name: 'Errors in Output', status: 'failed', note: plural(run.consoleErrors, 'error') }
    : { id: 'errors', name: 'Errors in Output', status: 'passed', note: 'None' });
  checks.push(run.consoleWarnings > 0
    ? { id: 'warnings', name: 'Warnings in Output', status: 'skipped', note: plural(run.consoleWarnings, 'warning') }
    : { id: 'warnings', name: 'Warnings in Output', status: 'passed', note: 'None' });
  const asked = run.framesDelivered + run.framesDropped;
  if (asked > 0) {
    checks.push({
      id: 'frames',
      name: 'Pictures arrived',
      status: run.framesDropped === 0 ? 'passed' : run.framesDelivered === 0 ? 'failed' : 'skipped',
      note: `${run.framesDelivered} of ${asked}`,
    });
  }
  return checks;
}

export function playtestSummary(run: PlaytestRun | null, checks: PlaytestCheck[]): PlaytestSummary {
  const count = (s: CheckStatus) => checks.filter((c) => c.status === s).length;
  const durationMs = run && run.endedAt !== undefined ? Math.max(0, run.endedAt - run.startedAt) : null;
  return { passed: count('passed'), failed: count('failed'), skipped: count('skipped'), total: checks.length, durationMs };
}

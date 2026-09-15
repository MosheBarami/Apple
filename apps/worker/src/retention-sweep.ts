// THE THING THAT ACTUALLY DELETES. One caller for the three sweeps that had none.
//
// `purgeExpired`, `pruneNotifications` and `pruneExecutions` were each written, exported and
// unit-tested, and `grep -rn purgeExpired src` returned the definition and nothing else. Three
// retention windows were published, described on a docs page, and enforced by nobody: an expired
// memory entry stayed, a notification read in January stayed, an automation run from last year
// stayed. The numbers beside them read exactly like a policy that was running.
//
// TWO PROPERTIES THIS FILE IS SHAPED BY:
//
//   ONE BROKEN STORE DOES NOT CANCEL THE OTHERS. Each sweep is caught on its own, because the
//   alternative — one `await Promise.all` that rejects — means a single unavailable table stops
//   the nightly deletion of everything else, silently, for as long as it stays broken.
//
//   ZERO AND "COULD NOT LOOK" ARE THE SAME NUMBER AND DIFFERENT FACTS. A sweep that throws reports
//   `rows: null` with the error, never `rows: 0`. A caller adding these up gets a total that is
//   missing a store, and can see which one.
import type { Env } from './env';
import { purgeExpired } from './memory-store';
import { pruneNotifications } from './notification-store';
import { pruneExecutions } from './automation-store';

export interface SweepResult {
  store: string;
  /** Rows removed, as the store counted them, or null when the sweep could not run. */
  rows: number | null;
  error?: string;
}

export interface SweepReport {
  at: string;
  results: SweepResult[];
  /** Rows removed across the stores that ran. Never a stand-in for "all of them ran". */
  removed: number;
  failures: SweepResult[];
}

async function one(store: string, run: () => Promise<number>): Promise<SweepResult> {
  try {
    return { store, rows: await run() };
  } catch (err) {
    return { store, rows: null, error: String((err as Error)?.message ?? err) };
  }
}

/**
 * Run every retention sweep this worker owns.
 *
 * Sequential rather than concurrent: D1 is single-threaded, these are DELETE statements over whole
 * tables, and the outage schema-once.ts records came from exactly this shape of work arriving all
 * at once. It runs at three in the morning; it does not need to be fast.
 */
export async function runRetentionSweeps(env: Env, now: number = Date.now()): Promise<SweepReport> {
  const results: SweepResult[] = [];
  results.push(await one('memory_entries', () => purgeExpired(env, { now })));
  results.push(await one('notifications', () => pruneNotifications(env, { now })));
  results.push(await one('automation_runs', () => pruneExecutions(env, now)));
  const failures = results.filter((r) => r.rows === null);
  return {
    at: new Date(now).toISOString(),
    results,
    removed: results.reduce((n, r) => n + (r.rows ?? 0), 0),
    failures,
  };
}

/** `memory_entries=3 notifications=2 automation_runs=failed` — readable in a log line. */
export function describeSweep(report: SweepReport): string {
  return report.results.map((r) => `${r.store}=${r.rows === null ? 'failed' : r.rows}`).join(' ');
}

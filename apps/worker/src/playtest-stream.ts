/**
 * The playtest run record: what the Playtest card is allowed to say, and the
 * only place that decides it.
 *
 * This is a companion to playtest.ts, which answers "is this playtest safe".
 * This file answers a different question: "what is honestly true about the
 * playtest right now", for a user watching it happen.
 *
 * THE RULE. Every field is a fact the worker observed, at a moment the worker
 * can name. Elapsed time is measured from a timestamp the worker wrote, not
 * counted up in the browser. Console errors are a count of real LogService
 * entries the plugin returned, not an inference from a failed op. The action
 * string names the step actually executing. When the worker does not know
 * something, the field is absent and the card says nothing about it — there is
 * no default that means "probably fine".
 *
 * WHY THAT MATTERS MORE HERE THAN ELSEWHERE. A viewport is the most credible
 * surface in the product: a moving picture of a game reads as ground truth even
 * when every other part of the UI is hedged. That credibility is exactly what
 * makes a stale frame dangerous — a user looking at a five-minute-old render of
 * a build that has since broken will believe their eyes over any text. So
 * staleness is computed here, from the worker's own timestamps, and travels to
 * the browser as data rather than being left for the UI to infer.
 */
import type { PlaytestPhase, PlaytestRun, StudioEventLog } from '@golem/shared';
import { PLAYTEST_DEAD_MS, PLAYTEST_STALE_MS } from '@golem/shared';

/** Phases from which no further transition is legal. */
const TERMINAL: ReadonlySet<PlaytestPhase> = new Set<PlaytestPhase>(['finished', 'failed']);

export function isTerminal(phase: PlaytestPhase): boolean {
  return TERMINAL.has(phase);
}

export function startPlaytest(opts: {
  id: string;
  now: number;
  requestedSeconds: number;
  msgId?: string;
  action?: string;
}): PlaytestRun {
  return {
    id: opts.id,
    phase: 'preparing',
    startedAt: opts.now,
    requestedSeconds: opts.requestedSeconds,
    action: opts.action ?? 'Taking a protective checkpoint',
    consoleErrors: 0,
    consoleWarnings: 0,
    framesDelivered: 0,
    framesDropped: 0,
    msgId: opts.msgId,
  };
}

/**
 * Apply a change to a run.
 *
 * A terminal run is FROZEN: late frames and late log reads from a playtest that
 * already ended must not revive it or edit its record. The capture loop and the
 * op timeouts are concurrent, so a frame arriving after the stop is ordinary,
 * not exceptional, and dropping it silently here is the correct handling.
 */
export function advance(
  run: PlaytestRun,
  patch: Partial<Pick<PlaytestRun, 'phase' | 'action' | 'consoleErrors' | 'consoleWarnings' | 'error' | 'lastFrameAt'>> & {
    deliveredFrame?: boolean;
    droppedFrame?: boolean;
    now?: number;
  },
): PlaytestRun {
  if (isTerminal(run.phase)) return run;

  const next: PlaytestRun = { ...run };
  if (patch.phase) next.phase = patch.phase;
  if (patch.action !== undefined) next.action = patch.action;
  if (patch.consoleErrors !== undefined) next.consoleErrors = patch.consoleErrors;
  if (patch.consoleWarnings !== undefined) next.consoleWarnings = patch.consoleWarnings;
  if (patch.error !== undefined) next.error = patch.error;
  if (patch.lastFrameAt !== undefined) next.lastFrameAt = patch.lastFrameAt;
  if (patch.deliveredFrame) next.framesDelivered += 1;
  if (patch.droppedFrame) next.framesDropped += 1;
  if (patch.phase && isTerminal(patch.phase)) next.endedAt = patch.now ?? Date.now();
  return next;
}

/**
 * How long the playtest has been going, as a number the browser can render
 * without owning a clock.
 *
 * A finished run reports the interval it actually ran for, frozen at its end.
 * A live run reports the interval up to `now`. Never negative: a client whose
 * clock is behind the worker's would otherwise see a countdown.
 */
export function elapsedMs(run: PlaytestRun, now: number): number {
  const end = run.endedAt ?? now;
  return Math.max(0, end - run.startedAt);
}

/**
 * How current the newest frame is.
 *
 *   fresh  — recent enough to describe as what is happening now
 *   stale  — still shown, but explicitly labelled as not current
 *   dead   — the stream has stopped; the card says so and dates the last frame
 *   none   — nothing has arrived yet, which is not the same as a stopped stream
 *
 * Deliberately NOT a boolean. "Waiting for the first frame" and "the stream
 * died" look identical in a two-state model, and they need opposite copy: one
 * is patience, the other is a problem.
 */
export type FrameFreshness = 'none' | 'fresh' | 'stale' | 'dead';

export function frameFreshness(lastFrameAt: number | undefined, now: number): FrameFreshness {
  if (!lastFrameAt) return 'none';
  const age = now - lastFrameAt;
  // A frame timestamped in the future is a clock disagreement, not freshness
  // to be trusted; treat it as just-arrived rather than as infinitely fresh.
  if (age < 0) return 'fresh';
  if (age >= PLAYTEST_DEAD_MS) return 'dead';
  if (age >= PLAYTEST_STALE_MS) return 'stale';
  return 'fresh';
}

/**
 * Count real console entries by severity.
 *
 * Counts the WHOLE window the plugin returned, and the caller replaces rather
 * than accumulates, because `get_logs` returns a trailing window of
 * LogService history — adding successive reads would count the same error
 * several times and report a single failure as a cascade.
 */
export function countConsole(entries: readonly StudioEventLog[] | undefined): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const e of entries ?? []) {
    if (e.level === 'error') errors += 1;
    else if (e.level === 'warn') warnings += 1;
  }
  return { errors, warnings };
}

/**
 * Pull log entries out of a `get_logs` op result.
 *
 * Shaped like parseCensus in playtest.ts and for the same reason: the live wire
 * shape nests the handler's return inside `result`, and assuming a fixed
 * nesting order has already been wrong twice against real Studio while every
 * unit test passed. Peel any recognised wrapper until nothing changes.
 */
export function parseLogEntries(raw: unknown): StudioEventLog[] | null {
  let value: unknown = raw;
  for (let i = 0; i < 6; i += 1) {
    if (!value || typeof value !== 'object') break;
    const o = value as Record<string, unknown>;
    if ('entries' in o) {
      value = o.entries;
      break;
    }
    if ('result' in o) {
      value = o.result;
      continue;
    }
    if ('data' in o) {
      value = o.data;
      continue;
    }
    if ('t' in o && 'v' in o) {
      value = o.v;
      continue;
    }
    break;
  }
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
    if (value && typeof value === 'object' && 'entries' in (value as Record<string, unknown>)) {
      value = (value as Record<string, unknown>).entries;
    }
  }
  if (!Array.isArray(value)) return null;
  const out: StudioEventLog[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Record<string, unknown>;
    if (typeof e.message !== 'string') continue;
    const level = e.level;
    out.push({
      kind: 'log',
      message: e.message,
      level: level === 'error' || level === 'warn' || level === 'info' || level === 'output' ? level : 'output',
      clock: typeof e.clock === 'number' ? e.clock : 0,
    });
  }
  return out;
}

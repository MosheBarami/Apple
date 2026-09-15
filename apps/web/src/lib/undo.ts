/**
 * An offer to put something back.
 *
 * "Undo" in a toast is a promise made in the past tense, and by the time the user reaches for it
 * the promise may no longer be true. Every rule below is about the moment it stops being true,
 * because a naive implementation goes on making it:
 *
 *   * THE BUTTON IS CLICKED TWICE. Double-clicking is not rare, and the second archive-then-restore
 *     lands on a row the user has already put back. The reversal runs at most once per success.
 *   * THE WINDOW HAS CLOSED. A reversal that fires ten minutes later operates on a world that has
 *     moved on. `now - createdAt >= windowMs` is FALSE when `now` is NaN, so a broken clock reads
 *     as "still fresh" — a guard that fails open. An unusable clock is treated as expired.
 *   * THE REVERSAL THREW. This is the repo's own central failure in miniature: the call returned,
 *     so the UI said "restored". Nothing was restored — the request never left. A rejection is
 *     reported as `failed`, never as an undo, and the offer stays live so the user can try again.
 *
 * Nothing is imported: this is a promise about a callback and a clock, and both come from the
 * caller.
 */

/** How long an undo stays on offer. Shorter than the toast that carries it — see toast-model.ts. */
export const UNDO_WINDOW_MS = 8_000;

export type UndoStatus = 'pending' | 'running' | 'undone' | 'expired' | 'failed';

export interface UndoResult {
  /** True ONLY when the reversal actually completed. */
  ok: boolean;
  status: UndoStatus;
  error?: unknown;
}

export interface Undoable {
  readonly label: string;
  readonly createdAt: number;
  status(now?: number): UndoStatus;
  /** Whether the button should still be there. */
  offered(now?: number): boolean;
  undo(now?: number): Promise<UndoResult>;
}

export interface UndoableSpec {
  label: string;
  /**
   * Puts it back. May reject — and if it does, nothing was undone.
   *
   * Its resolved value is deliberately ignored and deliberately untyped: callers hand this a
   * mutation that resolves to whatever the server said, and the only thing that matters here is
   * whether it threw.
   */
  reverse: () => unknown;
  windowMs?: number;
  now?: number;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function createUndoable({ label, reverse, windowMs, now }: UndoableSpec): Undoable {
  const span = windowMs === undefined ? UNDO_WINDOW_MS : windowMs;
  // Thrown rather than defaulted. An undoable built with a NaN window either never expires or never
  // offers, and both failures are silent — the caller finds out from a user, weeks later.
  if (typeof span !== 'number' || !Number.isFinite(span) || span <= 0) {
    throw new TypeError(`createUndoable: windowMs must be a finite positive number, got ${String(span)}`);
  }
  const createdAt = finiteOr(now, Date.now());

  let done = false;
  let inFlight: Promise<UndoResult> | null = null;
  let lastError: unknown = null;

  /**
   * An unreadable clock counts as expired.
   *
   * The alternative reading — "we cannot tell, so assume it is fresh" — offers a reversal of
   * unknown age against state that may have changed hands. Refusing costs the user one click of a
   * button that says it can no longer help; accepting costs them a change they did not ask for.
   */
  const expired = (at: unknown): boolean => {
    if (typeof at !== 'number' || !Number.isFinite(at)) return true;
    return at - createdAt >= span;
  };

  const status = (at: number = Date.now()): UndoStatus => {
    if (done) return 'undone';
    if (inFlight) return 'running';
    if (expired(at)) return 'expired';
    return lastError === null ? 'pending' : 'failed';
  };

  return {
    label,
    createdAt,
    status,
    offered(at: number = Date.now()) {
      const s = status(at);
      // `failed` is still offered: the thing was not put back, and the user may want to try again.
      return s === 'pending' || s === 'failed';
    },
    undo(at: number = Date.now()): Promise<UndoResult> {
      if (done) return Promise.resolve({ ok: true, status: 'undone' });
      // A second click while the first reversal is in the air joins it rather than starting another.
      if (inFlight) return inFlight;
      if (expired(at)) return Promise.resolve({ ok: false, status: 'expired' });

      const run = (async (): Promise<UndoResult> => {
        try {
          await reverse();
          done = true;
          lastError = null;
          return { ok: true, status: 'undone' };
        } catch (error) {
          lastError = error;
          return { ok: false, status: 'failed', error };
        } finally {
          inFlight = null;
        }
      })();
      inFlight = run;
      return run;
    },
  };
}

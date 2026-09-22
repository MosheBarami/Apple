/**
 * The Playtest card, as the browser is actually entitled to describe it.
 *
 * A sibling of studio-connection.ts, written to the same standard and for a
 * sharper version of the same reason. That file governs a sentence of copy.
 * This one governs a MOVING PICTURE OF THE USER'S GAME, which is the most
 * credible thing this product can put on a screen — a viewport reads as ground
 * truth even when every other surface is hedged, and a user will believe their
 * eyes over any text next to them.
 *
 * That credibility is precisely what makes a stale frame dangerous. A render
 * from four minutes ago, shown without qualification, tells the user their
 * build is fine long after it stopped being fine. So:
 *
 *   - THE CARD NEVER SHOWS A FRAME AS LIVE UNLESS THE WORKER'S OWN TIMESTAMP
 *     SAYS IT IS RECENT. Freshness is computed from `capturedAt`, which the
 *     worker wrote when the pixels arrived, against the clock now. It is not
 *     inferred from the phase, from the socket being open, or from a frame
 *     having been received at some point.
 *
 *   - A STALE FRAME IS STILL SHOWN, AND STILL LABELLED. Hiding it would throw
 *     away the last thing we actually know. Showing it unmarked would be a
 *     lie. So it is shown, dimmed, over its real age.
 *
 *   - THE STREAM STOPPING AND THE STREAM NOT HAVING STARTED ARE DIFFERENT
 *     STATES with opposite copy. One is patience, the other is a problem.
 *
 * WHAT IS DELIBERATELY ABSENT: any notion of "live video", any frame
 * interpolation, any smoothing between frames, and any placeholder image. The
 * plugin rasterises geometry on demand — there is no video stream at any price,
 * so a card that implied one would be dressing periodic stills up as something
 * they are not. The playtest card applies this rule to both native Studio captures and
 * software-render fallbacks.
 */
import type { PlaytestRun, StudioFrame } from '@golem/shared';
import { PLAYTEST_DEAD_MS, PLAYTEST_STALE_MS } from '@golem/shared';

/**
 * How current the displayed frame is.
 *
 *   none   — no frame has arrived yet. Not a failure: the first rasterise takes
 *            a moment and the card should say it is waiting.
 *   fresh  — recent enough to describe as what is happening now.
 *   stale  — shown, but explicitly marked as not current.
 *   dead   — the stream has stopped. The last frame stays on screen, dated.
 */
export type FrameFreshness = 'none' | 'fresh' | 'stale' | 'dead';

export function frameFreshness(frame: StudioFrame | undefined, now: number): FrameFreshness {
  if (!frame) return 'none';
  const age = now - frame.capturedAt;
  // A frame stamped in the future means the two clocks disagree, not that the
  // frame is eternally current. Treat it as just-arrived and let the next one
  // settle it, rather than pinning the card to 'fresh' forever.
  if (age < 0) return 'fresh';
  if (age >= PLAYTEST_DEAD_MS) return 'dead';
  if (age >= PLAYTEST_STALE_MS) return 'stale';
  return 'fresh';
}

/**
 * Everything the card renders, derived in one place so the component holds no
 * judgement of its own.
 */
export interface PlaytestView {
  /** Whether the card should be on screen at all. */
  visible: boolean;
  /** The frame to paint, or undefined when there is nothing real to paint. */
  frame: StudioFrame | undefined;
  freshness: FrameFreshness;
  /** Age of the displayed frame in ms. Undefined when there is no frame. */
  frameAgeMs: number | undefined;
  /** Elapsed run time in ms, from the worker's timestamps. */
  elapsedMs: number;
  /** The worker's own word for what it is doing. */
  action: string;
  /** True while the playtest is in a phase that can still produce frames. */
  live: boolean;
  /**
   * The one-line status the card shows next to the picture. This is the
   * sentence that must never overclaim, so it is decided here and asserted in
   * tests rather than being assembled inline in JSX.
   */
  label: string;
  /** Whether the picture should be visually de-emphasised as not-current. */
  dimmed: boolean;
  consoleErrors: number;
  consoleWarnings: number;
  framesDelivered: number;
  framesDropped: number;
  /** Present only when the playtest failed. */
  error: string | undefined;
}

/**
 * Pick the frame this card is entitled to show.
 *
 * ONLY frames belonging to THIS playtest. The same socket also carries the
 * agent's build renders, which are a different camera at a different size taken
 * at a different time — showing one of those inside a Playtest card would put a
 * picture of the static scene under a "run mode is live" label, which is
 * exactly the class of lie this file exists to prevent.
 *
 * Ordered by the worker's monotonic `seq` where present, so a frame that
 * overtook another in flight cannot make the card go backwards in time.
 */
export function framesForRun(frames: readonly StudioFrame[], run: PlaytestRun | null): StudioFrame[] {
  if (!run) return [];
  return frames
    .filter((f) => f.playtestRunId === run.id)
    .slice()
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
}

/**
 * The status line, and the whole point of this module.
 *
 * Every branch names a fact. There is no branch that says the game is running
 * well, because that is a judgement the browser has no basis for.
 */
function statusLabel(run: PlaytestRun, freshness: FrameFreshness, frameAgeMs: number | undefined): string {
  if (run.phase === 'failed') return 'Playtest failed';
  if (run.phase === 'finished') {
    const evidence = freshness === 'none'
      ? (run.framesDelivered > 0 ? 'frame unavailable' : 'no frames captured')
      : 'last diagnostic frame';
    const issues = run.consoleErrors > 0
      ? `${run.consoleErrors} console error${run.consoleErrors === 1 ? '' : 's'}`
      : run.consoleWarnings > 0
        ? `${run.consoleWarnings} console warning${run.consoleWarnings === 1 ? '' : 's'}`
        : '';
    return `Playtest finished — ${issues ? `${issues} · ` : ''}${evidence}`;
  }
  if (run.phase === 'preparing') return 'Preparing — run mode has not started';
  if (run.phase === 'stopping') return 'Stopping run mode';

  // 'running' — the only phase where a live claim is even possible, and it
  // still depends entirely on the age of the pixels.
  switch (freshness) {
    case 'none':
      return 'Run mode is live — waiting for the first frame';
    case 'fresh':
      return 'Run mode is live';
    case 'stale':
      return `Frame is ${seconds(frameAgeMs)}s old — the stream is falling behind`;
    case 'dead':
      return `No frame for ${seconds(frameAgeMs)}s — showing the last one received`;
  }
}

function seconds(ms: number | undefined): number {
  return Math.max(0, Math.round((ms ?? 0) / 1000));
}

/**
 * Build the card's whole state from the worker's record, the frames received,
 * and the clock.
 *
 * `now` is a parameter rather than a call to Date.now() so that freshness is
 * testable and so the component re-derives on a tick it controls. A card whose
 * staleness only updates when a new message arrives would show "just now"
 * indefinitely on a stream that has died — which is the exact failure this
 * module exists to make impossible.
 */
export function playtestView(
  run: PlaytestRun | null,
  frames: readonly StudioFrame[],
  now: number,
): PlaytestView {
  if (!run) {
    return {
      visible: false,
      frame: undefined,
      freshness: 'none',
      frameAgeMs: undefined,
      elapsedMs: 0,
      action: '',
      live: false,
      label: '',
      dimmed: false,
      consoleErrors: 0,
      consoleWarnings: 0,
      framesDelivered: 0,
      framesDropped: 0,
      error: undefined,
    };
  }

  const mine = framesForRun(frames, run);
  const frame = mine[mine.length - 1];
  const freshness = frameFreshness(frame, now);
  const frameAgeMs = frame ? Math.max(0, now - frame.capturedAt) : undefined;
  const end = run.endedAt ?? now;

  return {
    visible: true,
    frame,
    freshness,
    frameAgeMs,
    elapsedMs: Math.max(0, end - run.startedAt),
    action: run.phase === 'finished' ? statusLabel(run, freshness, frameAgeMs) : run.action,
    live: run.phase === 'running',
    label: statusLabel(run, freshness, frameAgeMs),
    // Anything not currently true is visually demoted. A finished playtest's
    // final frame is dimmed too: it is a real picture of a moment that has
    // passed, and the card should not present it as the state of the game now.
    dimmed: freshness === 'stale' || freshness === 'dead' || run.phase !== 'running',
    consoleErrors: run.consoleErrors,
    consoleWarnings: run.consoleWarnings,
    framesDelivered: run.framesDelivered,
    framesDropped: run.framesDropped,
    error: run.error,
  };
}

/** Re-derivation cadence. Staleness must advance on a clock, not on message arrival. */
export const PLAYTEST_TICK_MS = 1000;

export { PLAYTEST_DEAD_MS, PLAYTEST_STALE_MS };

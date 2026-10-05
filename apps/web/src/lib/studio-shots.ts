// The Studio screenshots strip in a turn: which frames belong to it, how many, and what each is called.
//
// The worker sends a `studio_frame` message each time a tool captures Studio (use-project-socket.ts keeps the newest few). This
// module decides which of them a turn shows. It is for the PERSON, and only the person: nothing here sends a frame anywhere, and
// the strip keeps nothing but what is already in the page's memory. (What the worker does with a frame is its own business and is
// said where it happens: apps/worker/src/tools.ts and do/session.ts. This page says only what this page does.)
//
// WHAT A FRAME IS CALLED. Two sources exist today. `studio_viewport` is a real capture of the 3D viewport in Studio. Anything else
// (a frame with no source is the older renderer's) is StudPilot's own preview render of the geometry: useful, and not a screenshot of
// Studio. The strip says which, so a preview is never read as a screenshot.
//
// Only types are imported, so `node --test` loads this module directly.
import type { StudioFrame } from '@studpilot/shared';

/** The newest this many frames of the run are shown. The page keeps no more than this many either (use-project-socket.ts). */
export const SHOT_LIMIT = 8;

/** A run in flight, Studio connected, nothing captured yet. */
export const SHOTS_EMPTY = 'Studio screenshots appear here while StudPilot builds';
/** A run in flight with Studio not connected: the sentence says what to do, because waiting will not fill the strip. */
export const SHOTS_CONNECT = 'Connect Studio to see screenshots here while StudPilot builds';
/** A finished request that captured nothing, with Studio not connected: why, and what to do next time. */
export const SHOTS_NONE_TAKEN = 'No screenshots were taken for this request. Connect Studio to see them next time.';

/**
 * The one line under a turn that has no screenshot, or null when there is nothing true and useful to say.
 *
 * It follows what is the case, because a sentence written for a run in flight is false under a finished one: while the run is going and
 * Studio is connected, screenshots are on their way; while it is going and Studio is not connected they are not, and the line says how to
 * get them; once the run is over with nothing captured, a line is drawn only when there is something to do (connect Studio), and nothing
 * is drawn when Studio was there and the request simply took none (a web search, a file read), so no finished turn keeps a promise.
 */
export function shotsEmptyLine({ running, studioConnected }: { running: boolean; studioConnected: boolean }): string | null {
  if (running) return studioConnected ? SHOTS_EMPTY : SHOTS_CONNECT;
  return studioConnected ? null : SHOTS_NONE_TAKEN;
}

/** Said in the enlarged view, and true of this page only. */
export const SHOTS_KEPT = 'Shown only in this tab and kept only while it is open. This page does not save or send them.';

/**
 * Whether two frames are ONE capture. The worker replays the frames it still holds, with their original `msgId` and `capturedAt`, every
 * time a socket attaches during a playtest (apps/worker/src/do/session.ts), so after a reconnect the page receives captures it already
 * has. A playtest frame is identified by its run and its counter (`playtestRunId`, `seq`); any other by what was captured and when.
 * Two different pictures never compare equal: the pixels are part of the identity when nothing else tells them apart.
 */
export function sameFrame(a: StudioFrame, b: StudioFrame): boolean {
  if (a === b) return true;
  if (a.playtestRunId !== undefined && a.seq !== undefined && b.playtestRunId !== undefined && b.seq !== undefined) {
    return a.playtestRunId === b.playtestRunId && a.seq === b.seq;
  }
  return (
    a.capturedAt === b.capturedAt &&
    a.msgId === b.msgId &&
    a.source === b.source &&
    a.view === b.view &&
    a.subject === b.subject &&
    a.width === b.width &&
    a.height === b.height &&
    a.rgbBase64 === b.rgbBase64
  );
}

/**
 * The page's frames after `frame` arrives: the same list when this capture is already held, otherwise the list with it added, newest
 * `max` kept. The socket hook calls it for every `studio_frame`, so a replayed ring changes nothing and cannot push the held frames
 * out of the newest few.
 */
export function appendFrame(list: readonly StudioFrame[], frame: StudioFrame, max: number): StudioFrame[] {
  if (list.some((held) => sameFrame(held, frame))) return list as StudioFrame[];
  return [...list, frame].slice(-max);
}

/**
 * The frames of ONE run, oldest first, newest last, at most SHOT_LIMIT, each capture once.
 *
 * A run is one assistant message, and the worker stamps every frame with the id of the message it was taken for (`msgId`), so a frame
 * from an earlier run, or one the worker could not attribute, is never shown under this turn. Ordered by the worker's own
 * capture time, and a frame that arrives out of order is placed by it. A capture that arrived twice (the worker replays its ring when a
 * socket reattaches) is shown once, so a reconnect does not repeat the strip or push the run's older frames out of the newest eight.
 */
export function shotsForTurn(frames: readonly StudioFrame[], turnId: string): StudioFrame[] {
  if (!turnId) return [];
  return frames
    .filter((frame) => frame.msgId === turnId)
    .filter((frame, at, own) => own.findIndex((other) => sameFrame(other, frame)) === at)
    .map((frame, arrived) => ({ frame, arrived }))
    .sort((a, b) => a.frame.capturedAt - b.frame.capturedAt || a.arrived - b.arrived)
    .map(({ frame }) => frame)
    .slice(-SHOT_LIMIT);
}

export type ShotKind = 'studio' | 'preview';

export function shotKind(frame: Pick<StudioFrame, 'source'>): ShotKind {
  return frame.source === 'studio_viewport' ? 'studio' : 'preview';
}

export function shotKindLabel(frame: Pick<StudioFrame, 'source'>): string {
  return shotKind(frame) === 'studio' ? 'Studio screenshot' : 'Preview render';
}

/** What a screenshot is called when it has to be named: its kind and the time it was taken. */
export function shotCaption(frame: Pick<StudioFrame, 'source' | 'capturedAt'>, clock: (at: number) => string): string {
  const at = clock(frame.capturedAt);
  return at ? `${shotKindLabel(frame)}, ${at}` : shotKindLabel(frame);
}

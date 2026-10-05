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
/**
 * A finished turn with no frame in this page and Studio not connected: why there is nothing to show, and what to do next time.
 *
 * It does NOT say that none were taken. The page cannot know: its frames live in memory only (use-project-socket.ts persists none and a reloaded
 * conversation carries its tool steps, not its frames), so a build that did capture Studio, opened again after a reload, has none here either.
 * What is true of every case is that the page keeps them only while the tab is open, and that is what this says.
 */
export const SHOTS_NONE_HERE =
  'No screenshots to show for this request: they are kept only while this tab stays open, so a reload clears them. To see them next time, connect Studio and keep this tab open during the request.';

/**
 * The one line under a turn that has no screenshot, or null when there is nothing true and useful to say.
 *
 * It follows what is the case, because a sentence written for a run in flight is false under a finished one: while the run is going and
 * Studio is connected, screenshots are on their way; while it is going and Studio is not connected they are not, and the line says how to
 * get them; once the run is over with no frame in this page, a line is drawn only when there is something to do (connect Studio), and nothing
 * is drawn when Studio is connected (the request may simply have taken none, a web search or a file read, and the page cannot tell that from a
 * reload that cleared them), so no finished turn keeps a promise or claims what it cannot know.
 */
export function shotsEmptyLine({ running, studioConnected }: { running: boolean; studioConnected: boolean }): string | null {
  if (running) return studioConnected ? SHOTS_EMPTY : SHOTS_CONNECT;
  return studioConnected ? null : SHOTS_NONE_HERE;
}

/** Said in the enlarged view, and true of this page only. */
export const SHOTS_KEPT = 'Shown only in this tab and kept only while it is open. This page does not save or send them.';

/**
 * Whether two frames are ONE capture. The worker replays the frames it still holds, with their original `msgId` and `capturedAt`, every
 * time a socket attaches during a playtest (apps/worker/src/do/session.ts), so after a reconnect the page receives captures it already
 * has. A playtest frame is identified by its run, its counter and the moment it was captured (`playtestRunId`, `seq`, `capturedAt`); any
 * other by what was captured and when. Two different pictures never compare equal: the pixels are part of the identity when nothing else
 * tells them apart.
 *
 * THE MOMENT IS PART OF A PLAYTEST FRAME'S KEY because the counter alone cannot tell a new frame from a replay: `seq` is a plain field of the
 * Durable Object (`playtestSeq`, reset only when a playtest begins) while the playtest run is stored, so after an eviction in the middle of a
 * playtest the worker keeps the same run id and counts from 1 again. A replay carries the capture's original time; a new frame does not.
 */
export function sameFrame(a: StudioFrame, b: StudioFrame): boolean {
  if (a === b) return true;
  if (a.playtestRunId !== undefined && a.seq !== undefined && b.playtestRunId !== undefined && b.seq !== undefined) {
    return a.playtestRunId === b.playtestRunId && a.seq === b.seq && a.capturedAt === b.capturedAt;
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

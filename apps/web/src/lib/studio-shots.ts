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

export const SHOTS_EMPTY = 'Studio screenshots appear here while StudPilot builds';

/** Said in the enlarged view, and true of this page only. */
export const SHOTS_KEPT = 'Shown only in this tab and kept only while it is open. This page does not save or send them.';

/**
 * The frames of ONE run, oldest first, newest last, at most SHOT_LIMIT.
 *
 * A run is one assistant message, and the worker stamps every frame with the id of the message it was taken for (`msgId`), so a frame
 * from an earlier run, or one the worker could not attribute, is never shown under this turn. Ordered by the worker's own
 * capture time, and a frame that arrives out of order is placed by it.
 */
export function shotsForTurn(frames: readonly StudioFrame[], turnId: string): StudioFrame[] {
  if (!turnId) return [];
  return frames
    .filter((frame) => frame.msgId === turnId)
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

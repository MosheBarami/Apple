// Whether the conversation follows the newest turn, and how the user says otherwise.
//
// WHAT WAS WRONG WITH THE OLD VERSION. Following was a `useRef` set from a scroll handler —
// `stick.current = scrollHeight - scrollTop - clientHeight < 90` — and re-armed on send. As a
// heuristic that is fine and is kept below. As the WHOLE mechanism it has two failures that people
// hit constantly on a long build:
//
//   * It is invisible. A user who has scrolled up to re-read step 3 has silently left the live
//     edge, and nothing on screen says so or offers to go back. The way back is to scroll, by
//     hand, past however much the agent has written since — which on a sixteen-step run is a lot.
//   * A ref does not re-render, so no control COULD be offered from it. This is why the state
//     below is state.
//
// The pattern with real controls already exists in this product: `studio-view.tsx` pins and
// releases frame-following explicitly, and says which frame you are on. This is the same idea for
// the transcript.

export const NEAR_BOTTOM_PX = 90;

export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/** How far the viewport's bottom edge is from the end of the content. Never negative. */
export function distanceFromBottom(m: ScrollMetrics): number {
  return Math.max(0, m.scrollHeight - m.scrollTop - m.clientHeight);
}

/**
 * Is the reader at the live edge?
 *
 * The slack exists because "at the bottom" is never exact: sub-pixel layout, a growing composer and
 * the browser's own scroll anchoring all leave a few pixels. 90px is roughly one line of prose plus
 * the thread's bottom padding, which is what the previous implementation used and what it should
 * keep using — this function is that expression, named.
 */
export function isNearBottom(m: ScrollMetrics, slack: number = NEAR_BOTTOM_PX): boolean {
  return distanceFromBottom(m) < slack;
}

/**
 * How many turns arrived while the reader was away.
 *
 * Counted from a WATERMARK rather than accumulated, because the transcript can SHRINK: an
 * edit-and-resend truncates it and `history_truncated` drops rows the server deleted. An
 * accumulating counter would keep announcing messages that no longer exist, and would never come
 * back down. A total below the watermark means the conversation was rewound, and the honest answer
 * is zero new turns, not a negative one.
 */
export function unseenCount(total: number, watermark: number): number {
  return Math.max(0, total - watermark);
}

/**
 * What the jump control says.
 *
 * It names the count only when there is one to name. "0 new" is noise, and a bare arrow with no
 * label is a control whose purpose the user has to guess at — this is the one affordance that
 * brings them back to the live edge.
 */
export function jumpLabel(unseen: number): string {
  if (unseen <= 0) return 'Jump to latest';
  return unseen === 1 ? '1 new message — jump to latest' : `${unseen} new messages — jump to latest`;
}

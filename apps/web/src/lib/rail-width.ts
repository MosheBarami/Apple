// How wide the rail is, as arithmetic rather than as event handlers.
//
// The drag itself is four lines of pointer plumbing in components/layout.tsx; everything that can
// be wrong about it is here, where it can be driven directly: the clamp, the value a pointer
// position means, and what an arrow key does. A resize whose only proof is "the source calls
// addEventListener" is not observed.
//
// THE CEILING AND THE FLOOR ARE NOT TASTE. Below the floor the account card's name and email
// ellipsis into uselessness and the conversation titles become two words each; above the ceiling
// the conversation loses its measure on a 13" screen. A handle that can produce a rail nobody can
// read is a handle that can break the app, and the user cannot tell that they did it.

/** Matches `--gx-rail-w` in styles/workspace.css. rail-width.test.mjs holds the two together. */
export const RAIL_DEFAULT = 240;
export const RAIL_MIN = 240;
export const RAIL_MAX = 460;

/** The keyboard step. Coarse enough to get somewhere, fine enough to land where you meant. */
export const RAIL_STEP = 16;

/**
 * Turn anything at all into a usable rail width.
 *
 * This is the normaliser handed to readViewState, so its input is genuinely unknown: a value
 * written by an older build, by a different clamp, or by hand. Absent, unparseable and
 * out-of-range are three different inputs with one correct answer — a rail you can read.
 */
export function clampRailWidth(raw: unknown): number {
  // `Number(null)` is 0 and `Number('')` is 0, and 0 would clamp to the floor — so an ABSENT
  // width would silently become the narrowest one instead of the default. Only a number or a
  // non-empty string is a measurement; everything else is "nothing was stored".
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return RAIL_DEFAULT;
  return Math.round(Math.min(RAIL_MAX, Math.max(RAIL_MIN, n)));
}

/**
 * The width the pointer is asking for, measured against the rail's own box.
 *
 * Measured rather than accumulated from a delta: a drag that adds up deltas drifts away from the
 * cursor whenever a move is dropped or the clamp bites, and the handle then sits somewhere the
 * hand is not. `rtl` is passed in because the rail is on the other side there, so the same cursor
 * position means the opposite width.
 */
export function widthFromPointer(
  clientX: number,
  rail: { left: number; right: number },
  rtl: boolean,
): number {
  return clampRailWidth(rtl ? rail.right - clientX : clientX - rail.left);
}

/**
 * What an arrow key does to the width, or null for a key this does not handle.
 *
 * Null rather than the unchanged width, so the caller preventDefault()s only the keys it actually
 * consumed — swallowing Tab or Enter on a focused separator would trap the keyboard user on it.
 *
 * The arrows are read as DIRECTIONS ON SCREEN, not as grow/shrink: in a right-to-left layout the
 * rail is on the right, so the key that makes it bigger is the one that points at the middle of
 * the screen. Someone pressing an arrow is pointing, and the rail should move that way.
 */
export function nudgeRailWidth(current: number, key: string, rtl: boolean): number | null {
  const w = clampRailWidth(current);
  switch (key) {
    case 'ArrowRight':
      return clampRailWidth(w + (rtl ? -RAIL_STEP : RAIL_STEP));
    case 'ArrowLeft':
      return clampRailWidth(w + (rtl ? RAIL_STEP : -RAIL_STEP));
    case 'Home':
      return RAIL_MIN;
    case 'End':
      return RAIL_MAX;
    default:
      return null;
  }
}

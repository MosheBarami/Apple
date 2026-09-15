/**
 * What a toast is allowed to do — the DATA half, split from the provider for the reason every
 * other model here is split (`empty-state-model`, `thinking-model`, `activity-model`): the
 * decisions are the part worth testing, and a module that imports React cannot be loaded by
 * `node --test`.
 *
 * The provider this replaced did not model the stack at all. It appended to it, capped it with
 * `list.slice(-3)`, and armed one `setTimeout` per row at the moment the row was created. That is
 * fine right up until two things are true at once, and both now are:
 *
 *   * A MESSAGE CAN REPEAT. A socket that drops four times produces four identical rows, which is
 *     not four pieces of information — it is one, shouted. Coalescing turns it back into one row
 *     with a count, and — because the row is still true — pushes its deadline out rather than
 *     leaving it where the first occurrence put it. A per-row timer cannot do that.
 *   * A TOAST CAN CARRY AN UNDO. Once a row is the user's only way back, "drop the oldest" is no
 *     longer a display decision. An evicted undo is not a dismissed undo: the row is simply not
 *     there, and nothing tells them the offer was ever made. So the cap applies to rows that carry
 *     nothing, and an offered reversal is never what makes room.
 *
 * NOTHING IS IMPORTED HERE ON PURPOSE, for the same reason `error-taxonomy` imports nothing: a
 * decision about a queue of strings needs the strings and a clock, and dragging React — or the
 * undo module, or Vite's `import.meta.env` behind it — into that would make it untestable.
 */

export type ToastKind = 'info' | 'success' | 'error';

/** Every kind, as a value, so a sweep over them cannot silently miss one. */
export const TOAST_KINDS: readonly ToastKind[] = ['info', 'success', 'error'];

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface ToastInput {
  id: number;
  kind: ToastKind;
  message: string;
  /** The one thing a toast may offer besides being read. */
  action?: ToastAction | null;
}

export interface ToastItem extends ToastInput {
  action: ToastAction | null;
  /** How many identical events this row stands for. 1 unless it coalesced. */
  count: number;
  /** Epoch ms after which the row stops being shown. Always finite — see `sweepToasts`. */
  expiresAt: number;
}

/**
 * How many rows may sit on screen. Four is already a lot; beyond that the stack is a wall and the
 * newest — the one the user's action just produced — is the hardest to find.
 */
export const TOAST_CAP = 4;

const BASE_MS: Record<ToastKind, number> = {
  info: 4_200,
  success: 4_200,
  // Bad news takes longer to read, and is more often read from across the room.
  error: 6_500,
};

/**
 * A kind that is not one of the three.
 *
 * `Record<ToastKind, number>` is a compile-time promise and this value crosses a trust boundary the
 * moment a caller passes a variable. A missing key yields `undefined`, `now + undefined` is NaN,
 * and a NaN deadline never passes a `>` comparison — the toast would sit there until the page
 * reloaded. So the lookup has an explicit floor rather than a `??` that only defends nullish.
 */
const FALLBACK_MS = 5_000;

/**
 * How long a row carrying an action lives.
 *
 * DELIBERATELY LONGER THAN `UNDO_WINDOW_MS` in lib/undo.ts (8s). An Undo that disappears while it
 * would still have worked is an Undo the user watched vanish mid-reach. The two constants live in
 * different modules — this one imports nothing — so the RELATIONSHIP between them is asserted in
 * tests/toast-model.test.mjs rather than left to whoever edits one of them next.
 */
export const ACTION_LIFETIME_MS = 9_500;

export function toastLifetimeMs(kind: ToastKind | string, hasAction: boolean): number {
  const base = BASE_MS[kind as ToastKind];
  const safe = typeof base === 'number' && Number.isFinite(base) && base > 0 ? base : FALLBACK_MS;
  return hasAction ? Math.max(safe, ACTION_LIFETIME_MS) : safe;
}

/** Two rows describe the same event when the words AND the severity match. */
function sameEvent(row: ToastItem, incoming: ToastInput): boolean {
  // A row carrying an action is never merged with anything. Two archived projects produce the same
  // sentence and two different reversals; merging them strands one with no way back and no sign
  // that anything was lost.
  if (row.action || incoming.action) return false;
  return row.kind === incoming.kind && row.message === incoming.message;
}

/**
 * Admit a toast to the stack.
 *
 * Pure: the clock is a parameter, so "it expired" is a case a test can produce rather than wait for.
 */
export function admitToast(
  list: readonly ToastItem[],
  incoming: ToastInput,
  now: number,
  cap: number = TOAST_CAP,
): ToastItem[] {
  const expiresAt = now + toastLifetimeMs(incoming.kind, Boolean(incoming.action));

  const at = list.findIndex((row) => sameEvent(row, incoming));
  let next: ToastItem[];
  if (at >= 0) {
    const row = list[at]!;
    next = [...list];
    // The row keeps its id and its POSITION: re-inserting it at the end would re-animate a row the
    // user is already reading, and the movement is the only thing they would notice.
    next[at] = { ...row, count: row.count + 1, expiresAt };
  } else {
    next = [...list, { ...incoming, action: incoming.action ?? null, count: 1, expiresAt }];
  }

  // Oldest-first eviction, with two rows exempt: anything offering an action, and the row that
  // just arrived. Without the second exemption a stack of live undos would push out the very
  // message the user's last click produced.
  let over = next.length - cap;
  while (over > 0) {
    const victim = next.findIndex((row) => !row.action && row.id !== incoming.id);
    if (victim < 0) break;
    next.splice(victim, 1);
    over -= 1;
  }
  return next;
}

/**
 * Drop everything whose deadline has passed.
 *
 * Both directions of a broken clock are handled, because they fail in opposite ways:
 *
 *   * A row whose `expiresAt` is NaN, Infinity or a string never satisfies `expiresAt > now`, so a
 *     naive sweep KEEPS it — permanently. It is removed instead: a toast that cannot say when it
 *     should leave has already failed at being a toast.
 *   * A `now` that is not usable would make every row look expired and wipe a live undo off the
 *     screen. Nothing is removed in that case: not sweeping is recoverable, sweeping is not.
 */
export function sweepToasts(list: readonly ToastItem[], now: number): ToastItem[] {
  // THE SAME ARRAY BACK WHEN NOTHING CHANGED, and this is not tidiness. The provider sweeps four
  // times a second for as long as anything is on screen, and `setToasts` with a fresh array every
  // tick re-renders every component under the provider — which is the entire app. Returning the
  // identical reference is what lets React bail out of the update.
  const kept = list as ToastItem[];
  if (!Number.isFinite(now)) return kept;
  const next = list.filter(
    (row) => typeof row.expiresAt === 'number' && Number.isFinite(row.expiresAt) && row.expiresAt > now,
  );
  return next.length === list.length ? kept : next;
}

/** A failure interrupts. A confirmation waits its turn. */
export function toastRole(kind: ToastKind | string): 'alert' | 'status' {
  return kind === 'error' ? 'alert' : 'status';
}

export function toastLive(kind: ToastKind | string): 'assertive' | 'polite' {
  return kind === 'error' ? 'assertive' : 'polite';
}

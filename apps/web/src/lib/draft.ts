// An unsent message, kept across a reload.
//
// Losing a half-written prompt to an accidental reload is small and infuriating, and it happens
// most often to the longest messages — the ones worth the most to keep.
//
// Three rules decide the shape of this, and each one is a way the naive version loses the draft
// anyway:
//
//   * PER PROJECT. One key would show project A's draft in project B, which is worse than losing
//     it: the user sends the wrong thing.
//   * CLEARED ON A SUCCESSFUL SEND, not on the attempt. A send that is refused — offline, over
//     quota, socket closed — must leave the draft exactly where it was.
//   * NEVER THROWS. `localStorage` throws on access in a private window and in some embedded
//     webviews, and an exception on the composer's change handler takes the composer down. Losing
//     a draft is a small failure; losing the ability to type is not.
//
// And a fourth, which is not about keeping drafts but about not keeping them:
//
//   * GONE AT SIGN-OUT. Every other piece of user content in this product is isolated by Postgres
//     RLS and never leaves the server without a verified JWT. A draft is the one exception: it is
//     the user's own words, sitting in `localStorage`, on a device that may not be theirs. Nothing
//     cleared it, so an unsent prompt outlived the session that wrote it and was waiting in the
//     box for whoever signed in next. `clearAllDrafts` is called from the auth listener on
//     SIGNED_OUT, which catches a token expiry and a session replaced by a different account as
//     well as the button.

import { MESSAGE_MAX_CHARS } from '@golem/shared';

const PREFIX = 'apple.draft.';

/**
 * The composer's own cap. A draft longer than a message could ever be is not a draft.
 *
 * Taken from the shared protocol constant rather than restated: the server slices every incoming
 * message to exactly this many characters, and a draft store with its own copy of the figure is a
 * second source of truth that can silently drift past what the server will accept.
 */
export const DRAFT_MAX = MESSAGE_MAX_CHARS;

const keyFor = (projectId: string) => `${PREFIX}${projectId}`;

export function readDraft(projectId: string): string {
  if (!projectId) return '';
  try {
    return window.localStorage.getItem(keyFor(projectId))?.slice(0, DRAFT_MAX) ?? '';
  } catch {
    return '';
  }
}

export function writeDraft(projectId: string, text: string): void {
  if (!projectId) return;
  try {
    // An empty draft is REMOVED rather than stored as "". Otherwise every project the user has
    // ever opened leaves a key behind, and the quota is shared across the origin — eventually a
    // real draft fails to save because of a hundred empty ones.
    if (text.trim()) window.localStorage.setItem(keyFor(projectId), text.slice(0, DRAFT_MAX));
    else window.localStorage.removeItem(keyFor(projectId));
  } catch {
    /* private window, blocked storage, or quota — the draft simply does not persist */
  }
}

export function clearDraft(projectId: string): void {
  writeDraft(projectId, '');
}

/**
 * Remove every draft on this device.
 *
 * Scoped to this module's own prefix, and the keys are collected BEFORE any are removed: removing
 * while iterating `localStorage.key(i)` re-indexes the store underneath the loop and silently skips
 * every second match — which would leave half the drafts behind and look like it had worked.
 */
export function clearAllDrafts(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(PREFIX)) doomed.push(key);
    }
    for (const key of doomed) window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable — there is nothing persisted to clear */
  }
}

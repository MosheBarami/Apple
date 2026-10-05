// WHAT A PREFERENCE SWITCH MAY SAVE ON TOP OF.
//
// `savePreferences` REPLACES the whole set of a scope: the worker's own comment is "what is not sent is deleted"
// (apps/worker/src/preferences.ts). So a switch that saves `{ ...base, key: value }` is only as safe as `base`, and
// `base` was `storedPrefs.data?.preferences.prefs ?? {}`. When the read had failed, `data` was undefined, the base was
// blank, and flipping the improvement-data switch sent `{ improvement_opt_out }` alone: the analytics opt-out, the
// notification settings and everything else stored for the person were deleted by a switch that said nothing about them.
// The analytics switch beside it built its base the same way.
//
// A FAILURE TO READ MUST NOT RENDER AS "NOTHING IS STORED". So the only base a switch gets is the one that was loaded,
// and when none was, it gets a refusal that says nothing was changed. The switches are also disabled until the read has
// answered (settings.tsx), so this refusal is the second line: a click that arrives anyway, say from a stale tab, still
// saves nothing.
import type { Preferences, ScopeMemoryResponse } from './api';

export const PREFERENCES_NOT_LOADED =
  'Your saved settings have not loaded, so nothing was changed. Reload the page and try again.';

/** True once the stored preferences have actually been read: the only state in which a switch may be used. */
export function preferencesLoaded(read: { data?: Pick<ScopeMemoryResponse, 'preferences'> | undefined | null }): boolean {
  return Boolean(read.data?.preferences?.prefs);
}

/**
 * Everything already stored, plus the change. Throws when nothing was loaded, because a blank base is a delete-everything
 * request in disguise.
 */
export function preferencesToSave(
  loaded: Pick<ScopeMemoryResponse, 'preferences'> | undefined | null,
  change: Preferences,
): Preferences {
  const stored = loaded?.preferences?.prefs;
  if (!stored) throw new Error(PREFERENCES_NOT_LOADED);
  return { ...stored, ...change };
}

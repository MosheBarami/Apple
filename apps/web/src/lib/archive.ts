// Archiving a project.
//
// Deleting used to be the only way to clear a finished project off the dashboard, and deleting is
// permanent: it takes the chat history, the checkpoints and the Studio pairing with it. So people
// keep dead projects forever rather than risk it, and the dashboard stops being usable at exactly
// the moment the product starts working.
//
// Archive is the reversible half of that. One nullable timestamp — see
// infra/supabase/migrations/0004_project_archive.sql — because "archived" and "when" are the same
// fact, and an `is_archived` beside an `archived_at` is two facts that can disagree.

/** Selected columns, shared so the two list queries cannot drift apart. */
export const PROJECT_COLUMNS =
  'id, owner_id, name, description, place_name, place_id, memory_summary, created_at, updated_at, last_activity_at, archived_at';

export type ProjectScope = 'active' | 'archived';

/** The scopes a stored preference is checked against. See lib/view-state.ts for why that matters. */
export const PROJECT_SCOPES = ['active', 'archived'] as const;

/**
 * Which query keys hold a project list.
 *
 * Archiving moves a row between two lists and out of the sidebar, so three caches are stale at
 * once. Naming them here means a future list cannot be added without this being the obvious place
 * to add it — the alternative is a fourth cache nobody remembers to invalidate, which shows the
 * user a project they just archived.
 */
export const PROJECT_LIST_KEYS = [['projects'], ['projects-archived'], ['projects-nav']] as const;

/**
 * Which scope the dashboard should actually show, given the one it remembered.
 *
 * The Archived tab appears only once something is in it — an always-present, always-empty tab is
 * chrome. That is fine until the scope is REMEMBERED: restore 'archived' on a dashboard with
 * nothing archived and the tab strip does not render, so the view is stuck on an empty list with
 * no control anywhere on the page to leave it. The remembered preference has to yield to what can
 * actually be displayed.
 *
 * A count of `null` means the archived list has not answered yet. The scope is left alone until it
 * does: flipping to 'active' on a not-yet-loaded list would move the tab under the user a moment
 * after they arrived, which is the same defect in the opposite direction.
 */
export function scopeToShow(stored: ProjectScope, archivedCount: number | null): ProjectScope {
  if (stored === 'archived' && archivedCount === 0) return 'active';
  return stored;
}

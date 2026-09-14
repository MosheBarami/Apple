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

/**
 * Which query keys hold a project list.
 *
 * Archiving moves a row between two lists and out of the sidebar, so three caches are stale at
 * once. Naming them here means a future list cannot be added without this being the obvious place
 * to add it — the alternative is a fourth cache nobody remembers to invalidate, which shows the
 * user a project they just archived.
 */
export const PROJECT_LIST_KEYS = [['projects'], ['projects-archived'], ['projects-nav']] as const;

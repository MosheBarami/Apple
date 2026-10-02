-- Archiving a project: out of the way, not gone.
--
-- Deleting is the only thing a user could do with a finished or abandoned project, and deletion is
-- permanent and takes the Studio pairing, the chat history and the checkpoints with it. So people
-- keep dead projects on the dashboard forever rather than risk it, and the dashboard becomes
-- unusable at exactly the point the product is working.
--
-- Nullable timestamp rather than a boolean: "archived" and "when" are the same fact, and a separate
-- `archived_at` beside an `is_archived` is two facts that can disagree.
alter table public.projects
  add column if not exists archived_at timestamptz;

-- The dashboard's hot query is "my active projects, newest first". Without this the partial index
-- below is the only thing standing between that and a full scan once a user has archived more
-- projects than they have open — which is the normal end state, not an edge case.
create index if not exists projects_owner_active_idx
  on public.projects (owner_id, updated_at desc)
  where archived_at is null;

create index if not exists projects_owner_archived_idx
  on public.projects (owner_id, archived_at desc)
  where archived_at is not null;

-- No policy change is needed: "own projects" already covers `for all` on rows the caller owns, so
-- archiving and restoring are ordinary updates. Stated here so the absence is deliberate rather
-- than an oversight someone later "fixes" by widening access.

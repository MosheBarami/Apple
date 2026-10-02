-- Pinning a project to the top of both lists.
--
-- Both lists were pure recency. The dashboard ordered by `updated_at desc`, and the sidebar took
-- the first eight rows of the same order — so the one project someone is actually living in slid
-- down the page every time they opened anything else, and on their ninth project it left the
-- sidebar altogether. Recency answers "what did I touch last", which is not the question anyone is
-- asking when they open the app to keep working on the same thing for the fourth day running.
--
-- Nullable timestamp rather than a boolean, for the same reason 0004 gave for `archived_at`:
-- "pinned" and "when" are one fact, and an `is_pinned` beside a `pinned_at` is two facts that can
-- disagree. It also gives the ordering a tiebreak for free — pin three things and they sort by
-- when they were pinned rather than arbitrarily.
--
-- Deliberately NOT also a `favorited_at`. A star and a pin both mean "this one matters", and two
-- stores for one intent disagree the first time a user touches both.
alter table public.projects
  add column if not exists pinned_at timestamptz;

-- Every dashboard load and every sidebar load now sorts by this column, so it is on the hot path
-- from the moment the migration lands. Partial, because the rows that matter to the sort are the
-- few that are pinned; the unpinned tail is already served by projects_owner_active_idx.
create index if not exists projects_owner_pinned_idx
  on public.projects (owner_id, pinned_at desc)
  where pinned_at is not null;

-- No policy change: "own projects" already covers `for all` on rows the caller owns, so pinning
-- and unpinning are ordinary updates. Said out loud so the absence reads as a decision rather than
-- as an oversight someone later "fixes" by widening access.

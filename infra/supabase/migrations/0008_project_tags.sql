-- Tagging a project.
--
-- The dashboard is one flat grid with an Active/Archived split, and until now the only axis that
-- ordered it was recency. Pinning (0007) answers "the thing I am working on today"; it does nothing
-- for "my three client projects" or "the four that are experiments". Past about twenty projects the
-- grid is a wall and the only way through it is to read every card.
--
-- `not null default '{}'` rather than a nullable array, because a nullable array has three states —
-- null, empty, populated — and the first two mean the same thing to every caller. One fewer state
-- is one fewer branch in every place that reads it.
--
-- Deliberately NOT also a `folder` column. A folder is a single-valued tag; shipping both gives a
-- project two places to live that can disagree, and gives the dashboard two groupings to draw.
alter table public.projects
  add column if not exists tags text[] not null default '{}';

-- GIN, not btree. The dashboard filters with `tags @> ARRAY['x']` (supabase-js `.contains()`), the
-- containment operator, which btree cannot serve at all — without this the filter is a sequential
-- scan of every project the user owns, on a query that runs on every chip click.
create index if not exists projects_tags_idx
  on public.projects using gin (tags);

-- No policy change: "own projects" already covers `for all` on rows the caller owns, so setting
-- tags is an ordinary update. Stated so the absence reads as a decision.

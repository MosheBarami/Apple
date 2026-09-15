-- Membership lifecycle: a grant can be PAUSED, and every change to one leaves a record.
--
-- Migration 0005 gave a project members. It gave them exactly two states — live, or `revoked_at`
-- is set — and no memory at all: `POST /project_members` with `Prefer: resolution=merge-duplicates`
-- overwrites the row in place, so a demotion from admin to viewer leaves nothing behind that could
-- say a demotion happened. An access-control table with no history is one where "who gave this
-- person admin, and when" has no answer.
--
-- THREE THINGS THIS FILE ADDS, EACH FOR A REASON:
--
--   1. SUSPENSION, as a column of its own rather than a reuse of `revoked_at`. An admin who cannot
--      tell "paused pending a conversation" from "removed" has to re-invite the first, which is
--      the same act as inviting a stranger and reads the same in every log. The worker's
--      `classifyGrant` closes a suspended grant exactly as it closes a revoked one — suspension is
--      a state, not a label on a button — and `project_role` below is updated to agree, because
--      RLS is the backstop behind every route and a backstop that admits a suspended member is
--      not one.
--   2. `membership_events`, APPEND-ONLY. There is no update policy and no delete policy on it, and
--      that is the mechanism rather than an omission: RLS denies what no policy admits, so the
--      table cannot be rewritten by the people whose actions it records.
--   3. `with check (actor_id = auth.uid())` on the insert. An audit row an admin can attribute to
--      somebody else is worse than no audit row.
--
-- WHAT IS DELIBERATELY NOT HERE: the acceptance of a share link. A link is redeemed by a stranger
-- who is not yet a member of anything, so an insert policy that let them write the acceptance
-- would let anyone write any line into any project's history. That record lives on the grant
-- itself, in KV, written by the worker at the moment of redemption where the user cannot reach it
-- — see `accepted_at` in apps/worker/src/collab-links.ts, and the history route that merges the
-- two stores into one ordered list.
--
-- ORDER OF DEPLOYMENT. The worker selects `suspended_at` from `project_members`; apply this
-- migration before shipping a worker that does. A select naming a column that does not exist is a
-- PostgREST 400, which `listMyGrants` reads as NO grants — it fails closed, but it fails.

alter table public.project_members
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_reason text,
  add column if not exists suspended_by uuid references public.profiles(id) on delete set null;

-- A reason nobody can read is not a reason. Bounded here as well as in the worker
-- (EVENT_REASON_MAX in apps/worker/src/membership.ts), because the database is the last authority.
alter table public.project_members
  drop constraint if exists project_members_suspended_reason_len;
alter table public.project_members
  add constraint project_members_suspended_reason_len
  check (suspended_reason is null or char_length(suspended_reason) <= 500);

-- The hot-path index from 0005 answers "projects shared with me". A suspended grant is not one of
-- them, so it must not be in the index that serves that question.
drop index if exists public.project_members_user_idx;
create index if not exists project_members_user_idx
  on public.project_members (user_id, created_at desc)
  where revoked_at is null and suspended_at is null;

-- ---------------------------------------------------------------------------------------------
-- The membership lookup, again, now that "live" has one more condition.
--
-- REWRITTEN RATHER THAN PATCHED AROUND. Every policy in 0005 calls this function; leaving it
-- unaware of suspension would mean a suspended member is refused by the worker and admitted by
-- Postgres, which is the two-authorities failure (F-57) written into the security layer itself.
-- The role ordering is unchanged and still mirrors `roleRank` in apps/worker/src/collab.ts.
-- ---------------------------------------------------------------------------------------------
create or replace function public.project_role(p_project uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.projects pr where pr.id = p_project and pr.owner_id = auth.uid())
      then 'owner'
    else (
      select pm.role
      from public.project_members pm
      where pm.project_id = p_project
        and pm.user_id = auth.uid()
        and pm.revoked_at is null
        and pm.suspended_at is null
        and (pm.expires_at is null or pm.expires_at > now())
      order by case pm.role when 'admin' then 3 when 'editor' then 2 when 'commenter' then 1 else 0 end desc
      limit 1
    )
  end;
$$;

revoke all on function public.project_role(uuid) from public;
grant execute on function public.project_role(uuid) to authenticated;

-- The project-read policy in 0005 inlines the same test rather than calling project_role (it
-- cannot: the function reads `projects`, and a policy on `projects` that called it would recurse).
-- So the suspension condition is repeated there, by hand, for the same reason it exists above.
drop policy if exists "members read shared projects" on public.projects;
create policy "members read shared projects" on public.projects
  for select using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = id
        and pm.user_id = auth.uid()
        and pm.revoked_at is null
        and pm.suspended_at is null
        and (pm.expires_at is null or pm.expires_at > now())
    )
  );

-- ---------------------------------------------------------------------------------------------
-- The record of what happened
-- ---------------------------------------------------------------------------------------------

create table if not exists public.membership_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- The person the event is ABOUT. Cascades with the account, so a deleted user takes their
  -- history with them — the export and erasure paths in the worker depend on that being true.
  subject_id uuid not null references public.profiles(id) on delete cascade,
  -- The person who DID it. Nullable only because an account can later be deleted; the insert
  -- policy below requires it to be the caller at the time it is written.
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('invited','role_changed','renewed','reactivated','suspended','removed','link_accepted')),
  from_role text check (from_role is null or from_role in ('viewer','commenter','editor','admin')),
  to_role text check (to_role is null or to_role in ('viewer','commenter','editor','admin')),
  reason text check (reason is null or char_length(reason) <= 500),
  via_token text,
  created_at timestamptz not null default now()
);

create index if not exists membership_events_project_idx
  on public.membership_events (project_id, created_at desc);
create index if not exists membership_events_subject_idx
  on public.membership_events (project_id, subject_id, created_at desc);

alter table public.membership_events enable row level security;

-- Who may READ the history: the people who administer the project, and the person it is about.
-- A viewer does not need to know who was suspended last week; the subject does need to be able to
-- see what was done to them.
drop policy if exists "admins read membership history" on public.membership_events;
create policy "admins read membership history" on public.membership_events
  for select using (public.project_role(project_id) in ('owner','admin'));

drop policy if exists "read own membership history" on public.membership_events;
create policy "read own membership history" on public.membership_events
  for select using (subject_id = auth.uid());

-- Who may WRITE one: an owner or an admin, about somebody else's membership, naming THEMSELVES as
-- the actor. `with check` covers the row as it will exist.
drop policy if exists "admins append membership history" on public.membership_events;
create policy "admins append membership history" on public.membership_events
  for insert with check (
    public.project_role(project_id) in ('owner','admin')
    and actor_id = auth.uid()
  );

-- NO UPDATE POLICY AND NO DELETE POLICY, ON PURPOSE. RLS denies what no policy admits, so this
-- table is append-only to every caller that reaches it through PostgREST — including the admins
-- whose actions it records. Adding either one below this line removes the only property the table
-- has; the check in apps/worker/tests/membership-migration.test.mjs fails if one appears.

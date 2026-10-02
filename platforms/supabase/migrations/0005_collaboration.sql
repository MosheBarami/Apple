-- Collaboration: a project can have people on it who do not own it.
--
-- Everything before this migration assumed one project, one person. `projects` has `owner_id`,
-- every policy is `owner_id = auth.uid()`, and the worker's `getOwnedProject` asks Postgres the
-- only question the schema could answer. Sharing needs a second question — "is this person ON
-- this project, and as what" — and it has to be answerable in SQL, because RLS is the backstop
-- behind every route.
--
-- THREE THINGS THIS FILE REFUSES, EACH FOR A REASON:
--
--   1. A membership row may never say `owner`. Ownership is the `projects.owner_id` column. If a
--      row in this table could confer it, then anyone who can insert a row can take the project —
--      and the people who can insert rows are, by design, project admins. The CHECK constraint is
--      the same allowlist the worker's GRANTABLE_ROLES holds, written where the database can
--      enforce it too.
--   2. Policies never recurse. A policy on `project_members` that reads `project_members` is an
--      infinite recursion Postgres will refuse at query time, not at migration time — so the
--      membership lookup lives in a SECURITY DEFINER function that runs outside RLS, and the
--      policies call it.
--   3. `revoked_at` rather than DELETE. "This access ended" is a fact worth keeping; a deleted row
--      cannot tell an audit reader that someone ever had access at all.
--
-- NOTE ON THE WORKER. Widening `projects` select to members changes what every existing
-- `getOwnedProject` caller can see. That function now narrows by `owner_id` ITSELF rather than
-- relying on this policy to mean "owned" — see apps/worker/src/supa.ts, which explains why at
-- length. Do not remove that filter on the grounds that RLS covers it; after this migration, RLS
-- deliberately does not.

create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- The allowlist. `owner` is absent on purpose — see (1) above.
  role text not null check (role in ('viewer','commenter','editor','admin')),
  invited_by uuid references public.profiles(id) on delete set null,
  display_name text,
  created_at timestamptz not null default now(),
  -- Null means "never expires". A non-null value in the past means the grant is over; the worker
  -- treats a value it cannot PARSE as over too, which is the direction a corrupt row must fail.
  expires_at timestamptz,
  revoked_at timestamptz,
  primary key (project_id, user_id)
);

-- The dashboard's hot query is "projects shared with me, newest first".
create index if not exists project_members_user_idx
  on public.project_members (user_id, created_at desc)
  where revoked_at is null;

create index if not exists project_members_project_idx
  on public.project_members (project_id)
  where revoked_at is null;

alter table public.project_members enable row level security;

-- ---------------------------------------------------------------------------------------------
-- The membership lookup, outside RLS so the policies that need it cannot recurse.
--
-- SECURITY DEFINER with an empty search_path: the function runs as its owner, so it must not be
-- resolvable to a table an attacker can create on their own schema path.
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
        and (pm.expires_at is null or pm.expires_at > now())
      -- The STRONGEST live grant, matching resolveMembership in apps/worker/src/collab.ts. A
      -- weaker ordering here would disagree with the worker, and two authorities that disagree
      -- are worse than one.
      order by case pm.role when 'admin' then 3 when 'editor' then 2 when 'commenter' then 1 else 0 end desc
      limit 1
    )
  end;
$$;

revoke all on function public.project_role(uuid) from public;
grant execute on function public.project_role(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------------------------

-- Read your own membership row, always — that is how the worker resolves your access, and a
-- person must be able to see that they were invited.
drop policy if exists "read own membership" on public.project_members;
create policy "read own membership" on public.project_members
  for select using (user_id = auth.uid());

-- Read the whole roster of a project you are on. `project_role` is SECURITY DEFINER, so this does
-- not recurse into the policy above.
drop policy if exists "read roster of my projects" on public.project_members;
create policy "read roster of my projects" on public.project_members
  for select using (public.project_role(project_id) in ('owner','admin','editor','commenter','viewer'));

-- Only an owner or an admin may invite, change a role, or revoke. `with check` covers the row as
-- it will EXIST, which is what stops an admin from writing a row for a project they do not run.
drop policy if exists "owners and admins manage members" on public.project_members;
create policy "owners and admins manage members" on public.project_members
  for all
  using (public.project_role(project_id) in ('owner','admin'))
  with check (public.project_role(project_id) in ('owner','admin'));

-- Members may read the projects they are on. This is the policy that widens `projects` — read the
-- note at the top of this file before touching anything that selects from it.
drop policy if exists "members read shared projects" on public.projects;
create policy "members read shared projects" on public.projects
  for select using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = id
        and pm.user_id = auth.uid()
        and pm.revoked_at is null
        and (pm.expires_at is null or pm.expires_at > now())
    )
  );

-- Members may read the transcript of a project they are on. Deliberately SELECT only: a message
-- is written by the worker on the owner's behalf during a run, and a member writing directly into
-- the transcript would be writing history nobody performed.
drop policy if exists "members read shared messages" on public.messages;
create policy "members read shared messages" on public.messages
  for select using (
    owner_id = auth.uid()
    or public.project_role(project_id) in ('owner','admin','editor','commenter','viewer')
  );

-- Same for checkpoints: a member can SEE the restore points. Creating and restoring them goes
-- through the worker, which checks `build` and `restore_version` respectively.
drop policy if exists "members read shared checkpoints" on public.checkpoints;
create policy "members read shared checkpoints" on public.checkpoints
  for select using (
    owner_id = auth.uid()
    or public.project_role(project_id) in ('owner','admin','editor','commenter','viewer')
  );

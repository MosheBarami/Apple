-- Durable membership-access delivery.
--
-- A membership write and the SessionDO notification used to be two unrelated operations. The
-- Postgres/KV mutation landed first and the Worker then made one best-effort fetch to the Durable
-- Object. If that fetch was lost, the database correctly refused the member on their next HTTP
-- request while the already-open socket and the alarm-driven run kept the role they had before.
--
-- This migration makes the intent part of the data mutation:
--
--   * every INSERT/UPDATE of project_members advances one per-(project,user) version and writes an
--     outbox row in the SAME Postgres transaction;
--   * a small authenticated RPC records the same state for link-derived grants whose JSON lives in
--     KV, which cannot participate in a Postgres transaction;
--   * each deployed Worker has its own delivery row because `golem` and `apple` share Supabase but
--     have different Durable Object namespaces;
--   * the consumer claims bounded batches with SKIP LOCKED, retries with capped backoff, and only
--     removes an item after the receiving SessionDO has accepted its monotonic version.
--
-- ORDER OF DEPLOYMENT. Apply this migration before deploying the Worker that reads
-- membership_access_state. Then configure a DIFFERENT random MEMBERSHIP_OUTBOX_TOKEN digest for
-- each consumer here, put its matching raw token on that Worker only, and deploy both Workers. The trigger
-- deliberately supports the old direct PostgREST writers, so writes made during the rollout still
-- produce durable intents.

create schema if not exists private;
revoke all on schema private from public;

-- The consumers are rows, not a hard-coded CASE inside the trigger. A third Worker namespace must
-- be enrolled explicitly before it can acknowledge events intended for it.
create table if not exists public.membership_outbox_consumers (
  consumer text primary key check (consumer ~ '^[a-z0-9][a-z0-9_-]{0,31}$'),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.membership_outbox_consumers (consumer)
values ('golem'), ('apple')
on conflict (consumer) do nothing;

-- One purpose-scoped bearer secret PER Durable Object namespace, stored only as a SHA-256 hex
-- digest. Distinct credentials are the boundary: a valid golem credential must not claim or ack an
-- apple row merely by changing a JSON consumer field. The migration creates no secret values;
-- deployment writes both explicitly after generating the two Worker secrets.
create table if not exists public.membership_outbox_secret (
  consumer text primary key references public.membership_outbox_consumers(consumer) on delete cascade,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now()
);

-- The latest authoritative lifecycle overlay. It never creates access: the Worker still needs a
-- live Postgres or KV grant. It can close one (`removed`/`suspended`) or cap it at the role an admin
-- most recently chose (`clear`/`demoted`). That makes a Postgres intent the security authority when
-- the corresponding KV mirror write is delayed or lost.
create table if not exists public.membership_access_state (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  version bigint not null check (version > 0),
  role text check (role is null or role in ('viewer','commenter','editor','admin')),
  expires_at timestamptz,
  access text not null check (access in ('clear','demoted','removed','suspended')),
  updated_at timestamptz not null default now(),
  primary key (project_id, user_id),
  check (access in ('removed','suspended') or role is not null)
);

-- One pending row per Durable Object namespace. The event payload is immutable; only delivery
-- bookkeeping changes. A successful acknowledgement deletes the row, while the state table keeps
-- the monotonic version that makes a later duplicate harmless.
create table if not exists public.membership_access_outbox (
  project_id uuid not null,
  user_id uuid not null,
  version bigint not null check (version > 0),
  consumer text not null references public.membership_outbox_consumers(consumer),
  role text check (role is null or role in ('viewer','commenter','editor','admin')),
  expires_at timestamptz,
  access text not null check (access in ('clear','demoted','removed','suspended')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text check (last_error is null or char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id, version, consumer),
  foreign key (project_id, user_id)
    references public.membership_access_state(project_id, user_id) on delete cascade,
  check (access in ('removed','suspended') or role is not null)
);

create index if not exists membership_access_outbox_due_idx
  on public.membership_access_outbox (consumer, next_attempt_at, created_at, version);

alter table public.membership_outbox_consumers enable row level security;
alter table public.membership_outbox_secret enable row level security;
alter table public.membership_access_state enable row level security;
alter table public.membership_access_outbox enable row level security;

-- The lifecycle overlay is visible only to the subject and project administrators. The delivery
-- queue, consumer list and token digest have no policies and no table grants at all.
drop policy if exists "read own membership access state" on public.membership_access_state;
create policy "read own membership access state" on public.membership_access_state
  for select using (user_id = auth.uid());

drop policy if exists "admins read membership access state" on public.membership_access_state;
create policy "admins read membership access state" on public.membership_access_state
  for select using (public.project_role(project_id) in ('owner','admin'));

revoke all on table public.membership_outbox_consumers from public, anon, authenticated;
revoke all on table public.membership_outbox_secret from public, anon, authenticated;
revoke all on table public.membership_access_outbox from public, anon, authenticated;
revoke all on table public.membership_access_state from public, anon, authenticated;
grant select on table public.membership_access_state to authenticated;

-- Insert the next version and fan it out to every enabled Durable Object namespace. The upsert is
-- the sequencer: concurrent writers conflict on one state row and PostgreSQL serialises the
-- `version + 1` update before either event can be inserted.
create or replace function private.enqueue_membership_access(
  p_project uuid,
  p_user uuid,
  p_state_role text,
  p_event_role text,
  p_access text,
  p_expires_at timestamptz
)
returns table (project_id uuid, user_id uuid, version bigint, role text, access text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_version bigint;
  v_consumers integer;
begin
  if p_access not in ('clear','demoted','removed','suspended') then
    raise exception 'invalid membership access change' using errcode = '22023';
  end if;
  if p_state_role is not null and p_state_role not in ('viewer','commenter','editor','admin') then
    raise exception 'invalid membership role' using errcode = '22023';
  end if;
  if p_event_role is not null and p_event_role not in ('viewer','commenter','editor','admin') then
    raise exception 'invalid membership event role' using errcode = '22023';
  end if;
  if p_access in ('clear','demoted') and (p_state_role is null or p_event_role is null) then
    raise exception 'active membership access change needs a role' using errcode = '22023';
  end if;

  insert into public.membership_access_state as current
    (project_id, user_id, version, role, expires_at, access, updated_at)
  values
    (p_project, p_user, 1, p_state_role, p_expires_at, p_access, statement_timestamp())
  on conflict on constraint membership_access_state_pkey do update
    set version = current.version + 1,
        role = coalesce(excluded.role, current.role),
        expires_at = excluded.expires_at,
        access = excluded.access,
        updated_at = excluded.updated_at
  returning current.version into v_version;

  insert into public.membership_access_outbox
    (project_id, user_id, version, consumer, role, expires_at, access)
  select p_project, p_user, v_version, c.consumer, p_event_role, p_expires_at, p_access
  from public.membership_outbox_consumers c
  where c.enabled;
  get diagnostics v_consumers = row_count;
  if v_consumers = 0 then
    -- A mutation with nowhere durable to deliver is not a successful mutation. Raising here rolls
    -- back the state update and the project_members write whose trigger called us.
    raise exception 'membership outbox has no enabled consumers' using errcode = '55000';
  end if;

  return query select p_project, p_user, v_version, p_event_role, p_access, p_expires_at;
end
$fn$;

revoke all on function private.enqueue_membership_access(uuid,uuid,text,text,text,timestamptz) from public;

-- Every project_members writer, including an older Worker revision, gets the atomic intent. The
-- trigger fires only for fields that can change access. A role change still produces an event when
-- it retains build permission (admin -> editor), because the open socket must receive the new role.
create or replace function private.project_member_access_outbox_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_access text;
  v_event_role text;
begin
  if new.revoked_at is not null then
    v_access := 'removed';
    v_event_role := null;
  elsif new.suspended_at is not null then
    v_access := 'suspended';
    v_event_role := null;
  elsif tg_op = 'UPDATE'
    and old.role in ('editor','admin')
    and new.role not in ('editor','admin') then
    v_access := 'demoted';
    v_event_role := new.role;
  else
    v_access := 'clear';
    v_event_role := new.role;
  end if;

  perform * from private.enqueue_membership_access(
    new.project_id,
    new.user_id,
    new.role,
    v_event_role,
    v_access,
    new.expires_at
  );
  return new;
end
$fn$;

revoke all on function private.project_member_access_outbox_trigger() from public;

drop trigger if exists project_member_access_outbox on public.project_members;
create trigger project_member_access_outbox
  after insert or update of role, expires_at, revoked_at, suspended_at
  on public.project_members
  for each row execute procedure private.project_member_access_outbox_trigger();

-- Link-derived grants live in KV. Their JSON cannot be committed in this transaction, so this RPC
-- commits the authoritative lifecycle state and delivery intent. Removal/suspension call it before
-- the KV mirror; reactivation restores KV first and commits `clear` second. A crash in either order
-- therefore leaves the safe state (denied) rather than granting access without an intent.
create or replace function public.record_link_membership_access_change(
  p_project uuid,
  p_user uuid,
  p_role text,
  p_access text,
  p_expires_at timestamptz
)
returns table (project_id uuid, user_id uuid, version bigint, role text, access text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_owner uuid;
  v_actor_role text;
  v_state_role text;
  v_event_role text;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select p.owner_id into v_owner from public.projects p where p.id = p_project;
  if v_owner is null then
    raise exception 'project not found' using errcode = 'P0002';
  end if;
  if p_user = v_owner then
    raise exception 'owner is not a member' using errcode = '22023';
  end if;
  v_actor_role := public.project_role(p_project);
  if v_actor_role not in ('owner','admin') then
    raise exception 'manage_members required' using errcode = '42501';
  end if;
  if p_access not in ('clear','demoted','removed','suspended') then
    raise exception 'invalid membership access change' using errcode = '22023';
  end if;
  if p_role is null or p_role not in ('viewer','commenter','editor','admin') then
    raise exception 'link membership role required' using errcode = '22023';
  end if;

  v_state_role := p_role;
  v_event_role := case when p_access in ('removed','suspended') then null else p_role end;
  return query
    select * from private.enqueue_membership_access(
      p_project,
      p_user,
      v_state_role,
      v_event_role,
      p_access,
      p_expires_at
    );
end
$fn$;

revoke all on function public.record_link_membership_access_change(uuid,uuid,text,text,timestamptz) from public, anon;
grant execute on function public.record_link_membership_access_change(uuid,uuid,text,text,timestamptz) to authenticated;

-- The system RPCs use the anonymous Data API role plus a separate purpose-scoped token. The Worker
-- sends the RAW token over TLS; PostgreSQL hashes it before comparison so the stored digest is not
-- itself a replayable bearer credential. Checking the consumer row separately prevents one Worker
-- namespace from acknowledging another's delivery.
create or replace function private.membership_outbox_authorized(p_token text, p_consumer text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    p_token is not null
    and pg_catalog.char_length(p_token) >= 32
    and exists (
      select 1
      from public.membership_outbox_consumers c
      join public.membership_outbox_secret s on s.consumer = c.consumer
      where c.consumer = p_consumer
        and c.enabled
        and s.token_hash = pg_catalog.encode(
          pg_catalog.sha256(pg_catalog.convert_to(p_token, 'UTF8')),
          'hex'
        )
    );
$fn$;

revoke all on function private.membership_outbox_authorized(text,text) from public;

create or replace function public.membership_access_outbox_ready(p_token text, p_consumer text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select private.membership_outbox_authorized(p_token, p_consumer);
$fn$;

revoke all on function public.membership_access_outbox_ready(text,text) from public, authenticated;
grant execute on function public.membership_access_outbox_ready(text,text) to anon;

create or replace function public.claim_membership_access_outbox(
  p_token text,
  p_consumer text,
  p_limit integer default 25
)
returns table (
  project_id uuid,
  user_id uuid,
  version bigint,
  role text,
  access text,
  expires_at timestamptz,
  attempts integer
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
begin
  if not private.membership_outbox_authorized(p_token, p_consumer) then
    raise exception 'membership outbox credentials refused' using errcode = '42501';
  end if;

  return query
  with due as (
    select o.project_id, o.user_id, o.version, o.consumer
    from public.membership_access_outbox o
    where o.consumer = p_consumer
      and o.next_attempt_at <= statement_timestamp()
    order by o.next_attempt_at, o.created_at, o.project_id, o.user_id, o.version
    limit v_limit
    for update skip locked
  ), claimed as (
    update public.membership_access_outbox o
    set attempts = least(o.attempts + 1, 1000000),
        -- Retry forever because silently dead-lettering a revocation recreates the original hole,
        -- but cap both the counter and delay so each scheduled invocation has bounded work.
        next_attempt_at = statement_timestamp()
          + pg_catalog.make_interval(secs => least(300, (1 << least(o.attempts, 8)))),
        last_error = null
    from due d
    where o.project_id = d.project_id
      and o.user_id = d.user_id
      and o.version = d.version
      and o.consumer = d.consumer
    returning o.project_id, o.user_id, o.version, o.role, o.access, o.expires_at, o.attempts
  )
  select c.project_id, c.user_id, c.version, c.role, c.access, c.expires_at, c.attempts
  from claimed c
  order by c.project_id, c.user_id, c.version;
end
$fn$;

revoke all on function public.claim_membership_access_outbox(text,text,integer) from public, authenticated;
grant execute on function public.claim_membership_access_outbox(text,text,integer) to anon;

create or replace function public.ack_membership_access_outbox(
  p_token text,
  p_consumer text,
  p_project uuid,
  p_user uuid,
  p_version bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_deleted integer;
begin
  if not private.membership_outbox_authorized(p_token, p_consumer) then
    raise exception 'membership outbox credentials refused' using errcode = '42501';
  end if;
  delete from public.membership_access_outbox o
  where o.consumer = p_consumer
    and o.project_id = p_project
    and o.user_id = p_user
    and o.version = p_version;
  get diagnostics v_deleted = row_count;
  -- False is still idempotent success to a caller retrying an acknowledgement whose response was
  -- lost: the exact row is already absent and no broader row was touched.
  return v_deleted > 0;
end
$fn$;

revoke all on function public.ack_membership_access_outbox(text,text,uuid,uuid,bigint) from public, authenticated;
grant execute on function public.ack_membership_access_outbox(text,text,uuid,uuid,bigint) to anon;

create or replace function public.fail_membership_access_outbox(
  p_token text,
  p_consumer text,
  p_project uuid,
  p_user uuid,
  p_version bigint,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_updated integer;
begin
  if not private.membership_outbox_authorized(p_token, p_consumer) then
    raise exception 'membership outbox credentials refused' using errcode = '42501';
  end if;
  update public.membership_access_outbox o
  set last_error = left(coalesce(p_error, 'delivery failed without a reason'), 500)
  where o.consumer = p_consumer
    and o.project_id = p_project
    and o.user_id = p_user
    and o.version = p_version;
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end
$fn$;

revoke all on function public.fail_membership_access_outbox(text,text,uuid,uuid,bigint,text) from public, authenticated;
grant execute on function public.fail_membership_access_outbox(text,text,uuid,uuid,bigint,text) to anon;

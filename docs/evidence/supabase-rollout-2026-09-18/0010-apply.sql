-- APPLE_SQL_0010_apply_sql_BEGIN
begin;
do $migration_guard$ begin
  if exists (select 1 from public.schema_migrations where name='0010_schema_hardening.sql') then
    raise exception 'Migration already recorded; inspect rather than replay';
  end if;
end $migration_guard$;
-- Schema hardening for the two reproducible database shapes in service:
--
--   * a clean database built from 0001-0009, where usage_events stores `credits`;
--   * the observed production lineage, where the same integer is still stored as `sparks`.
--
-- This migration keeps the historical `sparks` column when it exists. It adds the current
-- `credits` contract beside it, copies every value, and keeps old/new writers synchronized. A clean
-- database does not gain a legacy-only column. Unknown types, generated columns, or conflicting
-- dual-column rows abort the transaction instead of guessing which value is authoritative.

do $preconditions$
declare
  v_missing text;
begin
  select pg_catalog.string_agg(required.name, ', ' order by required.name)
    into v_missing
  from pg_catalog.unnest(array[
    'public.profiles',
    'public.projects',
    'public.messages',
    'public.checkpoints',
    'public.usage_events',
    'public.feedback',
    'public.studio_pairings',
    'public.waitlist',
    'public.project_members',
    'public.membership_events',
    'public.membership_outbox_consumers',
    'public.membership_outbox_secret',
    'public.membership_access_state',
    'public.membership_access_outbox'
  ]::text[]) required(name)
  where pg_catalog.to_regclass(required.name) is null;

  if v_missing is not null then
    raise exception '0010 requires migrations 0001-0009; missing relation(s): %', v_missing
      using errcode = '42P01';
  end if;

  select pg_catalog.string_agg(required.name, ', ' order by required.name)
    into v_missing
  from pg_catalog.unnest(array[
    'public.force_project_id()',
    'public.handle_new_user()',
    'public.protect_profile_fields()',
    'public.project_role(uuid)'
  ]::text[]) required(name)
  where pg_catalog.to_regprocedure(required.name) is null;

  if v_missing is not null then
    raise exception '0010 requires the installed 0001-0006 function signatures; missing: %', v_missing
      using errcode = '42883';
  end if;
end
$preconditions$;

do $guard$
declare
  v_table oid := pg_catalog.to_regclass('public.usage_events');
  v_credits_type oid;
  v_credits_generated text;
  v_sparks_type oid;
  v_sparks_generated text;
begin
  if v_table is null then
    raise exception '0010 requires public.usage_events from 0001' using errcode = '42P01';
  end if;

  select a.atttypid, a.attgenerated::text
    into v_credits_type, v_credits_generated
  from pg_catalog.pg_attribute a
  where a.attrelid = v_table and a.attname = 'credits' and not a.attisdropped;

  select a.atttypid, a.attgenerated::text
    into v_sparks_type, v_sparks_generated
  from pg_catalog.pg_attribute a
  where a.attrelid = v_table and a.attname = 'sparks' and not a.attisdropped;

  if v_credits_type is null and v_sparks_type is null then
    raise exception '0010 found neither usage_events.credits nor usage_events.sparks; refusing an unidentified schema'
      using errcode = '42703';
  end if;
  if v_credits_type is not null and v_credits_type <> 'integer'::pg_catalog.regtype then
    raise exception '0010 requires usage_events.credits to be integer, found %',
      pg_catalog.format_type(v_credits_type, null) using errcode = '42804';
  end if;
  if v_sparks_type is not null and v_sparks_type <> 'integer'::pg_catalog.regtype then
    raise exception '0010 requires usage_events.sparks to be integer, found %',
      pg_catalog.format_type(v_sparks_type, null) using errcode = '42804';
  end if;
  if coalesce(v_credits_generated, '') <> '' or coalesce(v_sparks_generated, '') <> '' then
    raise exception '0010 will not replace generated usage accounting columns' using errcode = '0A000';
  end if;
end
$guard$;

-- Parsed by the migration verifier and a no-op on the clean 0001 schema. On the observed legacy
-- schema this is the one new stored column; the historical `sparks` column remains in place.
alter table public.usage_events
  add column if not exists credits integer;

do $reconcile$
declare
  v_has_sparks boolean;
  v_conflict boolean;
begin
  select exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.usage_events'::pg_catalog.regclass
      and a.attname = 'sparks'
      and not a.attisdropped
  ) into v_has_sparks;

  if v_has_sparks then
    execute 'select exists (
      select 1 from public.usage_events
      where credits is not null and sparks is not null and credits <> sparks
    )' into v_conflict;
    if v_conflict then
      raise exception '0010 found conflicting usage_events.credits and usage_events.sparks values; refusing to choose one'
        using errcode = '23514';
    end if;

    execute 'update public.usage_events set credits = sparks where credits is null and sparks is not null';
    execute 'update public.usage_events set sparks = credits where sparks is null and credits is not null';
    execute 'update public.usage_events set credits = 0, sparks = 0 where credits is null and sparks is null';
    execute 'alter table public.usage_events alter column sparks set default 0';
    execute 'alter table public.usage_events alter column sparks set not null';
    execute 'alter table public.usage_events drop constraint if exists usage_events_credit_columns_match';
    execute 'alter table public.usage_events add constraint usage_events_credit_columns_match check (credits = sparks)';
  end if;
end
$reconcile$;

alter table public.usage_events
  alter column credits set default 0,
  alter column credits set not null;

-- Only a legacy database receives this trigger. Inserts that name just one spelling see the other
-- spelling's default zero, so the non-zero value wins. Updates are unambiguous because OLD records
-- which spelling changed. Two different non-zero insert values, or two different update values, are
-- refused rather than silently losing accounting data.
create or replace function public.sync_usage_event_credit_columns()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if tg_op = 'INSERT' then
    if new.credits is null and new.sparks is null then
      new.credits := 0;
      new.sparks := 0;
    elsif new.credits is null then
      new.credits := new.sparks;
    elsif new.sparks is null then
      new.sparks := new.credits;
    elsif new.credits = new.sparks then
      null;
    elsif new.credits = 0 then
      new.credits := new.sparks;
    elsif new.sparks = 0 then
      new.sparks := new.credits;
    else
      raise exception 'usage_events credits and sparks disagree' using errcode = '22023';
    end if;
  else
    if new.credits is distinct from old.credits and new.sparks is not distinct from old.sparks then
      new.sparks := new.credits;
    elsif new.sparks is distinct from old.sparks and new.credits is not distinct from old.credits then
      new.credits := new.sparks;
    elsif new.credits is distinct from old.credits and new.sparks is distinct from old.sparks then
      if new.credits is distinct from new.sparks then
        raise exception 'usage_events credits and sparks disagree' using errcode = '22023';
      end if;
    elsif new.credits is distinct from new.sparks then
      raise exception 'usage_events credits and sparks disagree' using errcode = '22023';
    end if;
  end if;

  if new.credits is null or new.sparks is null then
    raise exception 'usage_events credits and sparks must both be present' using errcode = '23502';
  end if;
  return new;
end
$fn$;

revoke all on function public.sync_usage_event_credit_columns() from public, anon, authenticated;

drop trigger if exists sync_usage_event_credit_columns on public.usage_events;
do $trigger$
begin
  if exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.usage_events'::pg_catalog.regclass
      and a.attname = 'sparks'
      and not a.attisdropped
  ) then
    execute 'create trigger sync_usage_event_credit_columns
      before insert or update of credits, sparks on public.usage_events
      for each row execute procedure public.sync_usage_event_credit_columns()';
  end if;
end
$trigger$;

-- Preserve the installed function bodies. The live protect_profile_fields body intentionally
-- differs from the old 0001 text, so ALTER FUNCTION changes only execution configuration and ACLs.
-- Every name used inside these functions is schema-qualified or lives in pg_catalog.
alter function public.force_project_id() set search_path = '';
alter function public.handle_new_user() set search_path = '';
alter function public.protect_profile_fields() set search_path = '';
alter function public.project_role(uuid) set search_path = '';

-- Trigger functions are invoked by their triggers; they do not need to be exposed as Data API RPCs.
-- project_role is still required by authenticated RLS policy evaluation.
revoke all on function public.force_project_id() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.protect_profile_fields() from public, anon, authenticated;
revoke all on function public.project_role(uuid) from public, anon, authenticated;
grant execute on function public.project_role(uuid) to authenticated;

-- Reassert RLS for every application table, including the four created by 0009. This does not use
-- FORCE ROW LEVEL SECURITY: database owners and the service role retain their intended maintenance
-- path, while Data API roles remain policy-bound.
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.messages enable row level security;
alter table public.checkpoints enable row level security;
alter table public.usage_events enable row level security;
alter table public.feedback enable row level security;
alter table public.studio_pairings enable row level security;
alter table public.waitlist enable row level security;
alter table public.project_members enable row level security;
alter table public.membership_events enable row level security;
alter table public.membership_outbox_consumers enable row level security;
alter table public.membership_outbox_secret enable row level security;
alter table public.membership_access_state enable row level security;
alter table public.membership_access_outbox enable row level security;

-- Supabase's legacy grants gave anon/authenticated TRUNCATE, TRIGGER, REFERENCES and (on PostgreSQL
-- 17) MAINTAIN in addition to ordinary DML. REVOKE ALL removes that version-dependent set without
-- naming privileges PostgreSQL 16 does not understand; the grants below restore only operations for
-- which the current policies and callers have a path. DML still remains subject to RLS.
revoke all privileges on table
  public.profiles,
  public.projects,
  public.messages,
  public.checkpoints,
  public.usage_events,
  public.feedback,
  public.studio_pairings,
  public.waitlist,
  public.project_members,
  public.membership_events,
  public.membership_outbox_consumers,
  public.membership_outbox_secret,
  public.membership_access_state,
  public.membership_access_outbox
from public, anon, authenticated;

grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.projects to authenticated;
grant select on table public.messages to authenticated;
grant select on table public.checkpoints to authenticated;
grant select on table public.usage_events to authenticated;
grant select, insert on table public.feedback to authenticated;
grant select, insert on table public.waitlist to authenticated;
-- Membership removal is an UPDATE of revoked_at. No product caller deletes the audit-bearing row.
grant select, insert, update on table public.project_members to authenticated;
grant select, insert on table public.membership_events to authenticated;
grant select on table public.membership_access_state to authenticated;

insert into public.schema_migrations(name,sha256,applied_by) values ('0010_schema_hardening.sql','cf033d4df2b0c4b5d70f1fda6faa8a2d20060f35f7aa594cc13c62ed30cedb43','reviewed Apple rollout 2026-09-18');
commit;
select name,sha256 from public.schema_migrations where name='0010_schema_hardening.sql';
-- APPLE_SQL_0010_apply_sql_END

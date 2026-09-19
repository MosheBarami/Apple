-- APPLE_SQL_00_secure_ledger_sql_BEGIN
begin;
create table if not exists public.schema_migrations (
  name text primary key,
  sha256 text not null,
  applied_at timestamptz not null default now(),
  applied_by text
);
alter table public.schema_migrations enable row level security;
revoke all privileges on table public.schema_migrations from public;
do $ledger_roles$
begin
  if pg_catalog.to_regrole('anon') is not null then
    execute 'revoke all privileges on table public.schema_migrations from anon';
  end if;
  if pg_catalog.to_regrole('authenticated') is not null then
    execute 'revoke all privileges on table public.schema_migrations from authenticated';
  end if;
end
$ledger_roles$;
commit;
select c.relrowsecurity as ledger_rls,
  not has_table_privilege('anon', 'public.schema_migrations', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') as anon_denied,
  not has_table_privilege('authenticated', 'public.schema_migrations', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') as authenticated_denied
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='schema_migrations';
-- APPLE_SQL_00_secure_ledger_sql_END

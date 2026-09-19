-- Read-only catalogue and aggregate checks. No customer content or credential value is selected.
select jsonb_build_object(
  'migrations', (select jsonb_agg(jsonb_build_object('name',name,'sha256',sha256) order by name) from public.schema_migrations),
  'tables', (select jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity) order by c.relname)
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'),
  'data_api_privileges', (select coalesce(jsonb_agg(jsonb_build_object('table',table_name,'role',grantee,'privilege',privilege_type)
    order by table_name,grantee,privilege_type),'[]'::jsonb)
    from information_schema.table_privileges where table_schema='public' and grantee in ('PUBLIC','anon','authenticated')),
  'usage_columns', (select jsonb_agg(jsonb_build_object('name',column_name,'type',data_type,'nullable',is_nullable,'default',column_default) order by column_name)
    from information_schema.columns where table_schema='public' and table_name='usage_events' and column_name in ('credits','sparks')),
  'usage_mismatches', (select count(*) from public.usage_events where credits is distinct from sparks),
  'functions', (select jsonb_agg(jsonb_build_object('name',p.proname,'settings',p.proconfig,'sourceHash',md5(p.prosrc),
    'anonExecute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticatedExecute',has_function_privilege('authenticated',p.oid,'EXECUTE')) order by p.proname)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
      and p.proname in ('force_project_id','handle_new_user','protect_profile_fields','project_role')),
  'outbox_consumers', (select jsonb_agg(jsonb_build_object('consumer',consumer,'enabled',enabled) order by consumer) from public.membership_outbox_consumers),
  'configured_consumers', (select coalesce(jsonb_agg(consumer order by consumer),'[]'::jsonb) from public.membership_outbox_secret),
  'pending_delivery_count', (select count(*) from public.membership_access_outbox)
) as postflight;

-- APPLE_SQL_01_adopt_existing_baseline_sql_BEGIN
begin;
do $adoption_guard$ begin
  if exists (select 1 from public.schema_migrations) then
    raise exception 'Expected empty newly-adopted ledger; inspect current state instead of overwriting it';
  end if;
end $adoption_guard$;
insert into public.schema_migrations(name,sha256,applied_by) values
('0001_init.sql','8f995af09676f1f8141fe68b206aec7adcbddf901ccc3c5e8f049bf0d3856230','adopted inspected baseline; legacy accounting repaired by 0010'),
('0002_waitlist_policy.sql','efbc94539510918ce02aeea3a988742243f477a408eebba853f44add3abc3991','adopted inspected baseline; legacy accounting repaired by 0010'),
('0003_security_hardening.sql','c710b084b3673504dcf168b2c63939bc64c089f48fab800b4024ec8b4060b671','adopted inspected baseline; legacy accounting repaired by 0010'),
('0004_project_archive.sql','428a5774a72c5eea5183cf1d9b2cdd0eb08716b775165be26e42517fbcd10763','adopted inspected baseline; legacy accounting repaired by 0010'),
('0005_collaboration.sql','c4f1fdcbe540426a78a60b4dc3be33fb01057777ed80ce5d8ca1f521eed50366','adopted inspected baseline; legacy accounting repaired by 0010'),
('0006_membership_lifecycle.sql','d369975cfbc038bee82d125aff9f7cb22aae2b17a5110a428c075503aef2182d','adopted inspected baseline; legacy accounting repaired by 0010'),
('0007_project_pinning.sql','63236036927b1edf8bbf86774a5634c238118e7574b4423f68441b5adfe2a331','adopted inspected baseline; legacy accounting repaired by 0010'),
('0008_project_tags.sql','1d164203532c35faf999eb9b4f1aea58c6e1d4c1ed1457542d5e72a14c93351f','adopted inspected baseline; legacy accounting repaired by 0010');
commit;
select name,sha256 from public.schema_migrations order by name;
-- APPLE_SQL_01_adopt_existing_baseline_sql_END

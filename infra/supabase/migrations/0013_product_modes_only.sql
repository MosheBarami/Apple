-- Apple has one planning mode and one building mode. Any historic/non-canonical value is folded
-- into Agent before the constraint is tightened, so no retired mode vocabulary survives in data.
update public.messages
set mode = 'agent'
where mode is not null
  and mode not in ('plan', 'agent');

alter table public.messages
  drop constraint if exists messages_mode_check;

alter table public.messages
  add constraint messages_mode_check
  check (mode is null or mode in ('plan', 'agent'));

begin;
do $guard$ begin
if exists(select 1 from public.membership_outbox_secret) then raise exception 'Consumer credentials already exist; refusing replacement'; end if;
end $guard$;
insert into public.membership_outbox_secret(consumer,token_hash) values ('apple','c198bf12e5e5dba704b339d109c813267ce9d396d6dc6f4f211fe84acea6edf6'),('golem','d4a3443e6ca078ee07e2a76fb4e75dbbcbc80ab8d938c8e051dde92e4a7ff0a8');
commit;
select consumer from public.membership_outbox_secret order by consumer;

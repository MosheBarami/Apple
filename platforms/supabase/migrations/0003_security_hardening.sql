-- Clients must not choose a project's primary key: a released UUID could otherwise be
-- re-registered by another user and inherit that project's Durable Object.
create or replace function public.force_project_id()
returns trigger language plpgsql as $fn$
begin
  new.id := gen_random_uuid();
  new.owner_id := coalesce(auth.uid(), new.owner_id);
  return new;
end $fn$;
drop trigger if exists force_project_id on public.projects;
create trigger force_project_id before insert on public.projects
  for each row execute procedure public.force_project_id();

-- Feedback inserts were reachable with the anon key and no session. Require a real user.
drop policy if exists "own feedback insert" on public.feedback;
create policy "own feedback insert" on public.feedback for insert
  to authenticated with check ((select auth.uid()) = owner_id);

drop policy if exists "own waitlist insert" on public.waitlist;
create policy "own waitlist insert" on public.waitlist for insert
  to authenticated with check ((select auth.uid()) = owner_id);

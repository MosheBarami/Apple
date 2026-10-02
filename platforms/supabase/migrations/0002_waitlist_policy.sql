create policy "own waitlist insert" on public.waitlist for insert
  with check ((select auth.uid()) = owner_id);
create policy "own waitlist read" on public.waitlist for select
  using ((select auth.uid()) = owner_id);

-- 0011 — A REDEEMED SHARE LINK COULD NOT OPEN ANYTHING.
--
-- WHAT WAS BROKEN. `POST /api/shared/links/redeem` wrote the grant to KV and answered 201 with a
-- role, and the join page told the recipient "You're in. You joined as editor." Every request that
-- page then made returned 404. The reason is one ordering: `getProjectAccess` reads the project row
-- FIRST, with the caller's own JWT, and returns `not_a_member` when RLS yields nothing — before it
-- ever looks at the KV grants a few lines below. public.projects has exactly two policies that can
-- return a row (own projects, and members of project_members), and a link guest matches neither,
-- because the grant a link produces lives in KV: a bearer secret cannot be looked up under RLS.
--
-- So the three link products the UI advertises — shared projects, shared chats, shared builds —
-- opened nothing for anybody, and the only sharing that worked was inviting by raw user id.
--
-- WHY THE TESTS DID NOT SEE IT, which is the part worth keeping. The PostgREST fake in
-- collab-routes.test.mjs returns the project row whenever the id matches. Under that fake the
-- read always succeeds, the early return is never taken, and the suite is structurally incapable
-- of observing the refusal. Replacing that one branch with the real predicate turns exactly two of
-- thirty-two tests red — both link tests — and leaves every invited-member test green.
--
-- WHAT THIS ADDS, AND WHAT IT DELIBERATELY DOES NOT. One `security definer` function that returns
-- one project row, gated on the same purpose token 0009 introduced for the membership outbox. It is
-- REVOKED from `authenticated`: granting it there would let any signed-in person read any project
-- row straight off the Data API, which is a far larger hole than the one being closed. It is
-- granted to `anon`, which without the token can do nothing with it.
--
-- The function cannot check the grant, because the grant is in KV and Postgres cannot see it. The
-- worker checks it, before calling — and that is the honest description of this trust boundary:
-- the database is trusting the worker, which already decides every access question in this product,
-- and the token is what establishes that the caller IS the worker. No service role key is
-- introduced; ADR-071 refused one and this does not reopen it. This function answers exactly one
-- question and can do exactly one thing.

create or replace function public.project_for_link_grant(
  p_token text,
  p_consumer text,
  p_project uuid
)
returns table (
  id uuid,
  owner_id uuid,
  name text,
  place_name text,
  memory_summary text,
  memory_facts jsonb
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select p.id, p.owner_id, p.name, p.place_name, p.memory_summary, p.memory_facts
  from public.projects p
  where p.id = p_project
    -- The authorisation is the whole body. 0009's helper hashes the presented token and compares it
    -- against the stored hash for an ENABLED consumer, so a disabled consumer stops working without
    -- anyone having to rotate a secret.
    and private.membership_outbox_authorized(p_token, p_consumer);
$fn$;

revoke all on function public.project_for_link_grant(text,text,uuid) from public, authenticated;
grant execute on function public.project_for_link_grant(text,text,uuid) to anon;

comment on function public.project_for_link_grant(text,text,uuid) is
  'Returns one project row for the Worker, which has already verified a live KV share-link grant for the caller. Token-gated, never granted to authenticated.';

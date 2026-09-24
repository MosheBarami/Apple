# Membership outbox acknowledgement privilege drift

Read-only check on 2026-09-24 at 23:51 UTC, Supabase project `npqvyijsvzkuwddyhtpm`:

- `pg_proc.proacl` for `public.ack_membership_access_outbox(text,text,uuid,uuid,bigint)` is
  `{postgres=X/postgres,service_role=X/postgres}`. `has_function_privilege('anon', …, 'EXECUTE')`
  is false. No outbox rows were pending when counted by consumer.
- The four other token-gated system RPCs exposed to `anon` are still callable; the two
  collaboration RPCs are callable by `authenticated`. The Supabase security advisor now reports
  four anonymous plus two authenticated SECURITY DEFINER warnings, and leaked-password protection.
- Migration `0009_membership_access_outbox.sql` grants `ack_membership_access_outbox` to `anon`.
  The worker's `systemRpc` sends the purpose token through the anonymous Data API role, and
  `deliverMembershipAccessEvent` calls this RPC after SessionDO accepts a change. A denied RPC
  leaves the event due for retry. The immediate SessionDO delivery still occurs; future queue
  rows would be repeatedly delivered and never removed. The version check in SessionDO limits
  duplicate effects, but does not repair the queue.

This is production privilege drift. Nothing was changed in the database during the investigation.
The current absence of queued rows is a point-in-time observation, not a proof that the path works.

## Narrow restoration proposed for Q-021

```sql
grant execute on function public.ack_membership_access_outbox(text,text,uuid,uuid,bigint) to anon;
```

The function already checks a separate, purpose-scoped token and enabled consumer before deleting
only the exact `(consumer, project, user, version)` outbox row. Restoring the grant would make it
callable by anyone holding the public Supabase key, so its token check remains the security boundary.
This is a real privilege expansion from the current live state and needs an explicit owner decision.
The alternative is to redesign all system RPCs around a non-anonymous server credential; that is
a broader privilege change and conflicts with ADR-071's deliberate no-service-role-key design.

If approved, apply the one-function grant as a migration, then verify the live ACL, that a forged
token still fails, and that a real disposable membership event is acknowledged exactly once.
Re-run the Supabase security advisor; the anonymous SECURITY DEFINER warning count will return
to five by design. Do not generate a real member revocation merely to test the grant without a
disposable test project and user.

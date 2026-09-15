# The returning-user read path, against the deployed system

**Date:** 2026-09-01 23:04Z · **Mission Phase J** (returning-user journey through real
systems). Read-only on purpose: every call below reads state that already exists, so it
spends **no Credits** and mutates nothing. The build half of Phase J is the §9.1 exercise
and is quota-gated.

Run against `https://golem.moshe-barami111.workers.dev` with the real E2E account, the
same auth the browser uses.

```
auth: ok in 220ms

200  257ms   432B      /api/me                      — credits 0/60
200  228ms   8541B     /api/projects/:id/messages   — 20 messages
200  285ms   3290B     /api/projects/:id/checkpoints — 19 checkpoints
200   89ms   145B      /api/me/usage                — 3 usage days
200   23ms   63B       /api/health                  — ok=true
404   25ms   21B       /api/projects/:id/attribution
```

## What this establishes

A returning user's state survives and is served: **20 messages** of conversation and
**19 checkpoints** come back for a project last built in a previous session, along with
quota and three days of usage history. Nothing here is a fixture — it is the same
production Durable Object the workspace reads.

Studio was paired throughout: a `hello` probe on the project socket reported
`studioConnected = true` with the benchmark place open.

## What the 404 establishes

`/api/projects/:id/attribution` is this branch's route and it is **not deployed**. That
is the expected answer and it is recorded because it corroborates `BLOCKERS.md`: the
production site and worker are still serving the state this branch has since corrected —
including the wrong Plan credit figure and the internal specialist names.

The 404 is also the honest reading of the earlier claim that the credits feature "500s in
production". It would, once deployed, if the read path had not been fixed; today it does
not exist there at all. Both statements are true of different builds, and this file says
which is which.

## What it does not establish

No write path is exercised: no chat, no build, no checkpoint creation, no restore, no
playtest. Those cost Credits or need a run, and running them here would have consumed the
allowance the §9.1 exercise needs. Reconnect-and-replay is covered separately in
`2026-09-01-persistence-reconnect.md`.

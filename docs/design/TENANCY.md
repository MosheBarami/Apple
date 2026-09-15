# Organizations and workspaces — the gap under 77 checklist items

Found while assessing docs/backlog/CHECKLIST-V2.md. This is a note for whoever builds it,
including agents; it is not a decision. The decision is the owner's and is stated at the bottom.

## What the checklist assumes

A three-level tenancy: **organization → workspace → project**. Section 06 is twenty items of
organization management, section 09 is twenty items of workspace management, and the concepts leak
into ten more sections — default organization selection (§04), organization creation during
onboarding (§05), invitation workspace assignment (§07), organization- and workspace-scoped access
(§08.05, §08.06), workspace-scoped search (§12), organization-approved model policies (§19), seat
limits (§35), organization data export (§48), organization rate limits (§50).

**77 of the 1,200 items mention an organization, a workspace, or a seat.** Measured, not estimated:

    python3 - <<'PY'
    import json; j=json.load(open('docs/backlog/CHECKLIST-V2.json'))
    print(sum(1 for s in j['sections'] for i in s['items']
              if any(w in i['name'].lower() for w in ('organization','workspace','seat'))))
    PY

## What exists

Neither. The schema is flat:

    public.profiles          one row per user
    public.projects          owner_id -> profiles
    public.messages, public.checkpoints, public.studio_pairings, public.usage_events

`grep -rn "create table.*organizations" infra/supabase/migrations` returns nothing. Sharing exists
and is sound — `project_members` with viewer/commenter/editor/admin/owner, RLS-isolated, 43 database
checks and 20 hostile application inputs — but it attaches people to a PROJECT, not to an org.

`orgMembership()` and `memory_org_members` in memory-store.ts are the only org-shaped things in the
tree, and they are a MEMORY SCOPE: a place to hang shared instructions. There is no organization row
for them to point at, so the scope id is currently an opaque string.

## THE NAMING COLLISION, and it will bite an agent that does not read this

**`workspace` already means something else in this codebase.** In `apps/worker/src/webtools.ts` it
is the agent's per-project FILE STORE — `workspaceFor(ctx)`, `WorkspaceStore`,
`WORKSPACE_MAX_BYTES`, keyed by project id in KV. That is where `workspace_read` and
`workspace_write` put files.

A tenant workspace is a completely different thing at a different level of the hierarchy. Anyone
adding one must pick a distinct name in code — `tenantWorkspace`, or rename the file store — or the
two will be confused in exactly the places where confusing them is a tenant-isolation bug.

## What it costs

This is not a feature; it is a level in the data model. Every table that currently hangs off
`owner_id` gains an ancestor, every RLS policy is rewritten, every route that resolves a project
resolves it within a scope, and `project_members` becomes one of three membership tables rather than
the only one. The 43 RLS checks in `infra/supabase/tests/rls-isolation.mjs` are written against the
flat schema and would all need to be re-derived — and that suite is the strongest evidence in the
repository that tenants cannot read each other.

Doing it late is more expensive than doing it early, and it is already late.

## THE DECISION, which is the owner's

Three honest options, and the second is not a cop-out:

1. **Build the full hierarchy.** Organizations and workspaces as first-class rows, membership at
   each level, RLS rewritten, seats billed per organization. Unblocks all 77 items. It is the
   largest single structural change left in the product.

2. **Organizations only, no workspaces.** Users belong to organizations; projects belong directly to
   an organization. Covers section 06 and most of the org-shaped items elsewhere; section 09's twenty
   items become "not planned" rather than "not started". Far cheaper, and workspaces are the level
   most products add last and some never need.

3. **Neither.** The product stays single-user with per-project sharing, which is what it is today and
   what every test in the repository currently proves. 77 items move to "not planned". This is a
   legitimate answer for a product whose buyer is one Roblox developer rather than a studio.

What must NOT happen is the fourth option: leaving them "not started" so the number stays at 1,200
while nobody intends to build them. A backlog that counts work nobody plans to do reports a
completion percentage that is wrong in a direction that flatters us.

# Organizations and workspaces — the gap under 77 checklist items

Found while assessing docs/backlog/CHECKLIST-V2.md. This was a note for whoever builds it,
including agents; the question it put has since been answered. **The answer is option 3 and it
is recorded at the bottom of this file and as ADR-021 in docs/DECISIONS.md.** Read the decision
before acting on anything above it.

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

## THE DECISION, which is the owner's — TAKEN 2026-09-16: OPTION 3, ADR-021

The question was put to the owner on **2026-09-16** with the three options below. His answer,
in his own words:

> **לא צריך — משתמש יחיד**

*Not needed — a single user.* That is **option 3**, recorded as **ADR-021** in
docs/DECISIONS.md. There is no organization row, no workspace row and no seat. A person owns
projects; a project is shared with named people through `project_members`
(viewer / commenter / editor / admin / owner), isolated by RLS and proven by the 43 checks in
`infra/supabase/tests/rls-isolation.mjs`. That is the whole tenancy model, and it is now the
intended one rather than the interim one.

**What the decision does NOT touch.** Nothing is deleted. `memory_org_members`,
`orgMembership()` and the `/api/orgs/:id/members` routes keep their names and keep working —
they are the MEMORY SCOPE described under THE NAMING COLLISION above, and they never were an
organization. The same goes for `workspaceFor()` / `WorkspaceStore`: that is the agent's
per-project file store, not a tenant.

**What it did to the backlog.** 73 items in docs/backlog/CHECKLIST-V2.md are marked `⊘` not
planned and leave the denominator, which is the fourth option this file names below as the one
that must not happen. They are marked per item rather than by keyword: a blanket match on
organization / workspace / seat catches 77, and four of those are this file's own naming
collision appearing inside the checklist — section 42's Desktop / Laptop / Tablet "workspace
layout" are SCREEN layouts and section 60's "enters a usable workspace" is the application's
working area. Two more are kept on the same principle for their own reasons: section 21's
"Organization memory scope" IS the memory scope this decision keeps, and section 10's "Project
creation from an empty workspace" is the dashboard's empty state. Every `⊘` cites ADR-021 on its
own line, and `packages/evals/src/success-metrics.test.mjs` fails on one that cites nothing.

**If this is ever reopened,** reopen it here and in a new ADR — do not start building against
the memory scope because it is org-shaped. The cost section above is still accurate, and it is
later now than it was.

---

The three options as they were put, kept for the record — the second is not a cop-out:

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

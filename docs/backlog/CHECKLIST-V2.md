# COMPLETE AI ROBLOX SAAS SHELL — 1,200-ITEM CHECKLIST

**✓ 356 done · ~ 543 partly built · ☐ 301 not found — weighted 52.3%**

Owner-authored list of record. 60 sections, 1,200 items.

Marked 2026-09-15 by 60 agents reading the repository, one per section — then every ✓ was
sent to a SECOND agent whose only job was to refute it. 70 of the 426 ✓ claims did not
survive that round and were downgraded here. A ✓ in this file has been attacked and held.

`✓` built, reachable, and something proves it — the proof is printed beside the line.
`~` real code exists but stops short: built and not wired, wired and not tested, in the
    worker with no UI, or in the UI with no route behind it. What is missing is stated.
`☐` searched and not found. Where the search looked is stated, so a failure to observe
    is never printed as an observation.

## 09. WORKSPACE MANAGEMENT  —  0%   ✓0 ~0 ☐20

- [☐] Workspace creation
      · No workspace entity exists at any layer. `grep -rn "create table" infra/supabase/migrations` returns exactly ten tables (profiles, projects, messages, checkpoints, usage_events, feedback, studio_pairings, waitlist, project_members, membersh
      → This item is the foundation for the other nineteen. Create infra/supabase/migrations/0007_tenant_workspaces.sql adding `public.tenant_workspaces (id uuid pk, owner_id uuid -> profiles, name text check length 1..80, created_at, archived_at)` plus `public.projects.tenant_workspace_id uuid references t
- [☐] Workspace naming and description
      · There is no row to name. infra/supabase/migrations/0001_init.sql:13 gives `name` and `description` to public.projects, not to any parent; apps/web/src/lib/rename-project.ts and apps/web/src/components/editable-title.tsx rename a PROJECT. gr
      → Depends on the 0007 migration from `Workspace creation`. Add `name` and `description` columns there, a PATCH `/api/tenant-workspaces/:id` route in apps/worker/src/index.ts that validates length the way projects.name is validated (1..80) and refuses a whitespace-only name, and a settings form in apps
- [☐] Workspace icon and color
      · No icon or colour column exists at any level: the full projects DDL at infra/supabase/migrations/0001_init.sql:13-25 is id/owner_id/name/description/place_name/place_id/memory_summary/memory_facts/created_at/updated_at/last_activity_at — no
      → Depends on the 0007 migration. Add `icon text` (a name from the app's own glyph set, not a URL — an arbitrary URL is an SSRF and a tracking pixel) and `color text check (color ~ '^#[0-9a-f]{6}$')` to tenant_workspaces, accept them on the PATCH route in apps/worker/src/index.ts, and render them on th
- [☐] Workspace membership
      · Membership exists, but it attaches a person to a PROJECT, never to a workspace: infra/supabase/migrations/0005_collaboration.sql:29 `public.project_members`, role ladder at apps/worker/src/collab.ts:55 `GRANTABLE_ROLES = ['viewer','commente
      → Depends on the 0007 migration. Add `public.tenant_workspace_members (workspace_id, user_id, role, granted_at, revoked_at, suspended_at)` with the same three refusals 0005_collaboration.sql documents: a membership row may never say `owner` (ownership is the owner_id column), policies must not recurse
- [☐] Workspace administrator assignment
      · The only administer-check in the tree above project level is apps/worker/src/memory-store.ts:980 `canAdministerOrg`, used by the /api/orgs/:id/members routes at apps/worker/src/index.ts:887-912 — that is the memory ORG scope, not a workspac
      → Depends on `Workspace membership`. Port the last-owner guard from apps/worker/src/memory-store.ts:988 `ownerCount` / :1023 (`last_owner` returned as 409, not 403, because it is the state of the tenant that refuses, not the caller's right) into apps/worker/src/tenant-workspace.ts, and add PUT `/api/t
- [☐] Workspace visibility controls
      · There is no visibility flag on any container. grep for `visibility|is_public|public_project` across apps/worker/src, apps/web/src and infra/supabase/migrations returns only Roblox asset moderation fields (apps/worker/src/assets.ts:480 `visi
      → Depends on the 0007 migration. Add `visibility text not null default 'private' check (visibility in ('private','members','link'))` to tenant_workspaces, enforce it in the RLS select policy (not only in the worker route — RLS is the backstop), and add the control to apps/web/src/routes/settings.tsx. 
- [☐] Workspace switcher
      · No switcher of any tenant scope exists in the UI. apps/web/src/app.tsx registers nine routes (:65-:128) — login, signup, forgot, reset, confirm, /projects/:id, /projects/:id/roadmap, /usage, /settings, /admin, /ui-lab — and none is scoped b
      → Depends on `Workspace creation`. Add a switcher to apps/web/src/components/layout.tsx's sidebar header that lists GET /api/tenant-workspaces, persists the choice through apps/web/src/lib/prefs.ts, and re-keys the dashboard's React Query keys (apps/web/src/routes/dashboard.tsx:363 `['projects']` / `[
- [☐] Workspace project directory
      · The project directory is account-scoped, not workspace-scoped: apps/web/src/routes/dashboard.tsx:35 `supabase.from('projects').select(PROJECT_COLUMNS)` with active/archived scopes at :362-369 and cards at :541. The query filters on archived
      → Depends on `Workspace creation`. Change `fetchProjects` in apps/web/src/routes/dashboard.tsx:35 to add `.eq('tenant_workspace_id', activeWorkspaceId)` and add the matching partial index to the 0007 migration alongside the existing projects_owner_active_idx (infra/supabase/migrations/0004_project_arc
- [☐] Workspace-level defaults
      · Defaults are layered across exactly three scopes and workspace is not one: apps/worker/src/memory-store.ts:43 `MEMORY_SCOPES = ['org','user','project']`, precedence at :358 `precedenceOf`, and the header at memory-store.ts:12 describes the 
      → Depends on `Workspace creation`. Either add 'workspace' to MEMORY_SCOPES in apps/worker/src/memory-store.ts:43 and give it a precedence rank in `precedenceOf` (:358 — note it throws on an unknown scope by design, so every switch over scopes must be updated together), or decide workspace defaults are
- [☐] Workspace-specific integrations
      · Every integration in the product is bound to a user or a project, never to a container. Roblox Open Cloud credentials: apps/worker/src/user-credentials.ts with routes /api/me/roblox-key at apps/worker/src/index.ts:2376/:2392/:2398 (per user
      → Depends on `Workspace membership`. Decide which integrations are tenant-owned rather than person-owned — the Roblox Open Cloud key in apps/worker/src/user-credentials.ts is the one that matters, since a studio would want one key the members share — and add `tenant_workspace_id` to its row plus an au
- [☐] Workspace-specific AI policies
      · The one policy layer above the individual is org-scoped and memory-shaped: apps/worker/src/memory-store.ts:999 describes an org's "instructions, its tool policy, its member list" as requiring owner or admin, and the write gate is canWriteSc
      → Depends on `Workspace-level defaults` (the scope must exist before a policy can hang off it). Then reuse the org policy machinery rather than duplicating it: apps/worker/src/memory-store.ts already stores per-scope instructions and a tool policy and resolves precedence — give the workspace scope the
- [☐] Workspace usage allocation
      · Usage accounting is per user, per UTC day, per plan: apps/worker/src/quota-math.ts (`dayKey`, ledger keyed by user + day), plan ceilings from apps/worker/src/pricing.ts:106 PLAN_LIMITS, the ledger table public.usage_events at infra/supabase
      → Depends on `Workspace creation`. Add `tenant_workspace_id` to public.usage_events in the 0007 migration (nullable, backfilled null for pre-workspace rows) and an allowance column on tenant_workspaces; then extend apps/worker/src/quota-math.ts so the admission check is `min(user allowance, workspace 
- [☐] Workspace spending allocation
      · Spending is guarded per account and globally, never per container: apps/worker/src/billing.ts with /api/billing/checkout (apps/worker/src/index.ts:1869) and /api/billing/portal (:1916), the admin spend controls /api/admin/spend, /api/admin/
      → Depends on `Workspace usage allocation`. Add a per-workspace cap (dollars/day) to tenant_workspaces and enforce it in the same admission path apps/worker/tests/budget-admission.test.mjs covers, before the provider call — an after-the-fact ledger is not a cap. Decide explicitly whether a workspace ha
- [☐] Workspace activity history
      · Two audit trails exist, both below workspace level: infra/supabase/migrations/0006_membership_lifecycle.sql:111 `public.membership_events` (append-only, per project, no update or delete policy — routes at apps/worker/src/index.ts:3723 `/api
      → Depends on `Workspace creation`. Add `tenant_workspace_id` to public.membership_events and to the attribution rows, then add GET `/api/tenant-workspaces/:id/events` in apps/worker/src/index.ts that unions membership changes, project creation/archival and run attribution for the workspace, members-on
- [☐] Workspace resource transfer
      · Nothing moves a resource between containers, because there are no containers. The only transfer function in the tree is apps/worker/src/automation-store.ts:297 `transferAutomation`, and it is DEAD: a repo-wide grep (all .ts/.tsx/.mjs/.js ou
      → Depends on `Workspace creation`. Add POST `/api/projects/:id/move` in apps/worker/src/index.ts that sets projects.tenant_workspace_id after proving the caller may administer BOTH the source and the destination, and that refuses when the destination's members would lose or gain access silently. While
- [☐] Workspace duplication
      · No duplication of any container exists. grep for `duplicate|clone project|fork` across apps/worker/src and apps/web/src returns only de-duplication logic (membership.ts:362, critic.ts:101, asset-library.ts:700) and the per-file duplicate in
      → Depends on `Workspace creation`. Add POST `/api/tenant-workspaces/:id/duplicate` in apps/worker/src/index.ts that copies the workspace row, its settings and (optionally) its projects' file stores, and decide explicitly what is NOT copied — members, API keys, Studio pairings and usage history must no
- [☐] Workspace archival
      · Archival is implemented for PROJECTS only: infra/supabase/migrations/0004_project_archive.sql:11 adds `archived_at timestamptz` to public.projects with partial indexes at :17 and :21, the UI is apps/web/src/routes/dashboard.tsx:379-409 (Arc
      → Depends on `Workspace creation`. Add `archived_at timestamptz` to tenant_workspaces in the 0007 migration, copying 0004's reasoning verbatim (a nullable timestamp, never an `is_archived` boolean beside it — two facts that can disagree), plus a partial index for the active-workspaces list. Archiving 
- [☐] Workspace restoration
      · Restore exists at two levels below this one and neither is a workspace: project restore (apps/web/src/routes/dashboard.tsx:379 setArchived with archive=false, toast + undo at :403, covered by apps/web/tests/archive.test.mjs) and file-store 
      → Depends on `Workspace archival`. Add the un-archive branch to PATCH `/api/tenant-workspaces/:id` and surface it where archived workspaces are listed in apps/web/src/components/layout.tsx's switcher. Follow the pattern in apps/web/src/routes/dashboard.tsx:399 — report a rejected request as failed rat
- [☐] Workspace export
      · Two exports exist, neither workspace-scoped. (1) Per-project transcript export: apps/worker/src/export.ts, route /api/projects/:id/export at apps/worker/src/index.ts:1171, menu item in apps/web/src/routes/dashboard.tsx:44, test apps/worker/
      → Depends on `Workspace creation`. Add GET `/api/tenant-workspaces/:id/export` in apps/worker/src/index.ts building on the per-table column spec in apps/worker/src/user-export.ts (it is a spec precisely so a new column cannot leak silently) scoped to the workspace's projects, admin-only. Separately wo
- [☐] Workspace deletion impact preview
      · An impact statement exists for project deletion only, and it is prose rather than a computed preview: apps/web/src/routes/dashboard.tsx:337 says deletion takes "chat history, checkpoints and the Studio pairing" and that the Roblox place is 
      → Depends on `Workspace creation`. Add GET `/api/tenant-workspaces/:id/deletion-preview` in apps/worker/src/index.ts returning real counts (projects, members who lose access, checkpoints, stored file bytes, automations that will stop firing) and render them in a ConfirmDialog in apps/web/src/component

## 06. ORGANIZATION MANAGEMENT  —  15%   ✓0 ~6 ☐14

- [~] Organization creation
      · Built in the worker and tested, but unreachable from any UI. Store: apps/worker/src/memory-store.ts:930 `createOrg` (inserts into `memory_orgs`, DDL at memory-store.ts:548, and writes the creator as owner via `setOrgMember`). Route: apps/wo
      → apps/web/src/lib/api.ts has no org helpers; add `fetchOrgs()` -> GET /api/orgs and `createOrg(name)` -> POST /api/orgs {name} (400 body is {error:'bad_name'|'bad_owner'}). Then add an 'Organisations' section to apps/web/src/routes/settings.tsx that lists the orgs from fetchOrgs() and has a name fiel
- [☐] Organization profile editing
      · No code path ever updates an organisation row. `grep -n "memory_orgs" apps/worker/src/*.ts` returns exactly three hits: the DDL (memory-store.ts:548), one INSERT inside createOrg (memory-store.ts:941) and one SELECT in listOrgsFor (memory-s
      → Add `renameOrg(env, access, orgId, name)` to apps/worker/src/memory-store.ts next to createOrg (line 930): require `canAdministerOrg(access, orgId)`, run the name through the existing `normaliseOrgName` (memory-store.ts:914), reject 'bad_name' on empty, `update memory_orgs set name = ? where id = ?`
- [☐] Organization logo management
      · Searched apps/worker/src, apps/web/src, apps/site/src, packages/shared, packages/sdk and infra for 'logo' — every hit is the image generator refusing to draw brand marks (apps/worker/src/imagegen.ts:195 MARK_REQUEST, imagegen.ts:241, apps/w
      → Add a `logo_key text` column to the `memory_orgs` DDL in apps/worker/src/memory-store.ts:548 (create-if-not-exists plus an idempotent add-column, matching how other stores evolve), an `app.put('/api/orgs/:id/logo')` in apps/worker/src/index.ts that requires `canAdministerOrg`, size- and type-caps th
- [☐] Organization identifier management
      · An org id is an opaque UUID minted server-side and never chosen or changed by a user: apps/worker/src/memory-store.ts:944 `const id = opts.id ?? crypto.randomUUID()`, and the only caller (apps/worker/src/index.ts:881) passes no `opts`, so t
      → Add a `slug text unique` column to `memory_orgs` in apps/worker/src/memory-store.ts:548 and a `normaliseOrgSlug()` beside `normaliseOrgName` (memory-store.ts:914) enforcing /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/. Have `createOrg` (memory-store.ts:930) derive a slug from the name and retry on unique-con
- [~] Organization switcher
      · The server half is built and even documented as being for a switcher; the client half is dead code. apps/worker/src/index.ts:846 `app.get('/api/memory/scopes')` returns `orgs: [{scopeId, name, role, canWrite}]` with the comment 'what the me
      → In apps/web/src/components/ws/instructions-panel.tsx call the already-exported `fetchMemoryScopes()` (apps/web/src/lib/api.ts:330) in a useQuery, replace the hardcoded `['user','project']` array at line 226 with user + project + one button per returned org, and change the scopeId derivation at line 
- [~] Organization ownership display
      · The data is served and tested; no screen renders it. GET /api/orgs (apps/worker/src/index.ts:872) returns each org with the caller's role, and GET /api/orgs/:id/members (index.ts:887) returns `{members:[{userId, role, addedAt}], canAdminist
      → Create apps/web/src/routes/organization.tsx (registered in the router beside settings) that takes an org id, calls a new `fetchOrgMembers(orgId)` helper in apps/web/src/lib/api.ts hitting GET /api/orgs/:id/members, and renders the roster with each member's role, marking role==='owner' with an explic
- [~] Organization ownership transfer
      · Transfer is achievable as two calls but exists as no single operation and has no UI. apps/worker/src/memory-store.ts:1004 `updateOrgMember` lets an owner set role 'owner' on someone else (an admin is refused: memory-store.ts:1019 'Only an o
      → Add `app.post('/api/orgs/:id/transfer-ownership')` to apps/worker/src/index.ts taking {userId} and calling a new `transferOrgOwnership` in apps/worker/src/memory-store.ts that, in one D1 batch, promotes the target to 'owner' and demotes the caller to 'admin' — requiring the caller's own role to be '
- [~] Sole-owner departure protection
      · Built, wired and named by a test. The guard is in both mutating store functions: apps/worker/src/memory-store.ts:1023 refuses a demotion when `ownerCount(env, orgId) <= 1` with reason 'last_owner', and apps/worker/src/memory-store.ts:1044 (
      · REFUTED: REFUTED on three independent grounds; the guard code is real and correct, but the capability is not done. (1) THE CHECKLIST ITSELF SAYS NOT PLANNED, BY THE OWNER'S OWN DECISION. docs/backlog/CHECKLIST-V2.md:127 heads the
- [☐] Organization billing contact
      · Billing has no organisation dimension at all. Stripe subscriptions and credit purchases are keyed to a single user through subscription metadata — apps/worker/src/billing.ts:289 `const userId = metadata['userId']`, with billing.ts:299 rejec
      → Only worth building after organisations own billing. Add a `billing_user_id`/`billing_email` column to `memory_orgs` in apps/worker/src/memory-store.ts:548, an `app.put('/api/orgs/:id/billing-contact')` in apps/worker/src/index.ts gated on `canAdministerOrg`, and change apps/worker/src/billing.ts:28
- [☐] Organization security settings
      · Searched apps/worker/src, apps/web/src, apps/site/src, packages/shared, packages/sdk and infra for 'sso', 'saml', 'scim', '2fa', 'mfa' and 'session policy' — zero hits. The only org-level policy that exists is the memory preference floor (a
      → Requires an auth-level decision first (auth is Supabase JWT — apps/worker/src/auth.ts). If built: store the settings as org-scoped memory entries under a reserved key prefix so they inherit the existing `canWriteScope` owner/admin gate (apps/worker/src/memory-store.ts), add an `app.put('/api/orgs/:i
- [☐] Organization default member role
      · Every membership write takes an explicit role and there is no configured default anywhere. `createOrg` hardcodes the creator as 'owner' (apps/worker/src/memory-store.ts:946 `setOrgMember(env, id, ownerId, 'owner', now)`), and `updateOrgMemb
      → Add a `default_role text` column to `memory_orgs` in apps/worker/src/memory-store.ts:548 defaulting to 'member', validated with the existing `isOrgRole` (memory-store.ts:69) and never allowed to be 'owner'. Expose it on `app.patch('/api/orgs/:id')` (see Organization profile editing) and read it in w
- [☐] Organization domain verification
      · Searched apps/worker/src, apps/web/src, apps/site/src, packages/shared, packages/sdk and infra with `grep -rniE 'domain_verif|verifyDomain|domain verification|verified_domain'` — zero hits. The only domain-shaped code in the worker is the o
      → Create apps/worker/src/org-domains.ts with a `memory_org_domains(org_id, domain, token, verified_at)` table, a `claimDomain` that mints a TXT token and a `checkDomain` that resolves `_apple-verify.<domain>` via DNS-over-HTTPS (the only DNS available in a Worker) and stamps verified_at on a match. Wi
- [☐] Domain-based membership policies
      · Depends on domain verification, which is itself absent (see above — no 'domain_verif|verifyDomain' hits anywhere in apps or infra). Membership into an org is only ever written by an explicit admin action: `setOrgMember` (apps/worker/src/mem
      → After domain verification exists, add a `join_policy` column ('closed' | 'request' | 'auto') to `memory_orgs` in apps/worker/src/memory-store.ts:548 and a `matchOrgForEmailDomain(env, email)` in the new apps/worker/src/org-domains.ts that only considers rows with a non-null verified_at. Call it at f
- [☐] Organization workspace inventory
      · There is no tenant workspace level to take an inventory of. The Postgres schema is flat — `grep -rniE 'organi[sz]ation|org_id|tenant' infra/supabase` finds only comments about per-user tenancy (infra/supabase/migrations/0001_init.sql:1 'Ten
      → Blocked on the tenancy decision in docs/design/TENANCY.md, which currently records option 3 (no workspaces). If it is reversed: add the workspace level as a Postgres table with RLS in a new infra/supabase/migrations file, re-derive the 43 checks in infra/supabase/tests/rls-isolation.mjs against the 
- [☐] Organization usage overview
      · Usage is per-user and addressed only by the caller's own token: apps/worker/src/index.ts:2009 `app.get('/api/me/usage')` fetches `QUOTA_DO.idFromName(user.userId)` — the Durable Object is keyed by user id, so there is no aggregate to read f
      → Add `app.get('/api/orgs/:id/usage')` to apps/worker/src/index.ts, gated on `canAdministerOrg(proven.access, orgId)` via the existing `memoryScopeAccess` helper (index.ts:819). It should read the member list with `orgMembersOf` (apps/worker/src/memory-store.ts:969) and fan out to each member's QUOTA_
- [☐] Organization integration inventory
      · Every integration in the product is owned by one user and none is enumerable by an organisation. Studio pairings, the Roblox Open Cloud key (apps/worker/src/index.ts:2392 `app.get('/api/me/roblox-key')`) and API keys (apps/worker/src/api-ke
      → Add `app.get('/api/orgs/:id/integrations')` to apps/worker/src/index.ts behind `canAdministerOrg`, listing per member (from `orgMembersOf`, apps/worker/src/memory-store.ts:969) which integrations are connected — Studio pairing present, Roblox key present, count of API keys — and deliberately returni
- [☐] Organization lifecycle status
      · An organisation has no state to be in. The row is `memory_orgs(id text primary key, name text not null, created_at text not null, created_by text not null)` — apps/worker/src/memory-store.ts:548 — with no status, suspended_at, trial_ends_at
      → Add a `status text not null default 'active'` column to the `memory_orgs` DDL at apps/worker/src/memory-store.ts:548 with the allowed set 'active' | 'suspended' | 'deleting', return it from `listOrgsFor` (memory-store.ts:957) and from GET /api/orgs (apps/worker/src/index.ts:872), and make `memorySco
- [~] Organization export initiation
      · A route does export org-scoped data, but only one narrow slice of it and no UI reaches it. apps/worker/src/index.ts:1077 `app.get('/api/memory/:scope/:scopeId/export')` accepts scope='org' (proof via `memoryScopeAccess`, index.ts:819, which
      → Two separable pieces. (1) Reachability: once the scope switcher in apps/web/src/components/ws/instructions-panel.tsx:226 offers orgs, the existing Export button at instructions-panel.tsx:451 covers the memory slice with no worker change. (2) A real export: add `app.post('/api/orgs/:id/export')` in a
- [☐] Organization deletion preview
      · An organisation cannot be deleted at all, so there is nothing to preview. The router has no DELETE on /api/orgs/:id — the only DELETE in the org block is DELETE /api/orgs/:id/members/:userId (apps/worker/src/index.ts:912) — and apps/worker/
      → Add `app.get('/api/orgs/:id/deletion-preview')` to apps/worker/src/index.ts behind `canAdministerOrg`, returning counts of what deletion would destroy — members from `orgMembersOf` (apps/worker/src/memory-store.ts:969) and org-scoped memory rows from `listMemoryEntries` at org scope — computed from 
- [☐] Organization deletion recovery window
      · There is no org deletion (no DELETE /api/orgs/:id in apps/worker/src/index.ts, no `deleteOrg` in apps/worker/src/memory-store.ts), therefore no grace period, no scheduled purge and no restore. Searched apps/worker/src, apps/web/src and infr
      → Build it together with deletion, and soft first: add `deleting_at text` to `memory_orgs` (apps/worker/src/memory-store.ts:548), have `app.delete('/api/orgs/:id')` (new, owner-only) stamp it rather than remove rows, make `memoryScopeAccess` (apps/worker/src/index.ts:819) refuse writes to an org insid

## 02. REGISTRATION AND SIGN-IN  —  48%   ✓8 ~3 ☐9

- [✓] Email and password registration
      · apps/web/src/routes/auth-pages.tsx:235 SignupPage, calling supabase.auth.signUp at :255 with emailRedirectTo('/confirm'). Route registered at apps/web/src/app.tsx:76 behind GuestGuard and served by the SPA fallback at apps/worker/src/static
- [✓] Email verification
      · Sending: apps/web/src/routes/auth-pages.tsx:255 (signUp -> /confirm) and the resend at :281. Landing: /confirm route at apps/web/src/app.tsx:97 (deliberately outside both guards), ConfirmEmailPage at apps/web/src/routes/auth-pages.tsx:600 w
- [☐] Passwordless email sign-in
      · Grepped the whole tree (apps, packages, docs, infra) for signInWithOtp, verifyOtp, magiclink, 'magic link', passwordless, token_hash: the only hits are apps/web/src/lib/auth-flows.ts:167 and :184, where 'magiclink' is listed as an AuthLinkK
      → In apps/web/src/routes/auth-pages.tsx, add an 'Email me a link instead' path on LoginPage that calls supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: emailRedirectTo('/confirm'), shouldCreateUser: false } }) and renders the existing CheckEmailCard with CHECK_EMAIL_LINE so it stays no
- [☐] Passkey registration and sign-in
      · Grepped apps, packages, infra and docs for passkey, webauthn, navigator.credentials and 'publicKey:' — zero hits in any source file. The only occurrences of the word are backlog entries: docs/backlog/FEATURES.md:971 ('Passkeys', unchecked),
      → Passkeys cannot be added in the Supabase client alone. Build it as a worker-hosted WebAuthn flow: add apps/worker/src/passkeys.ts holding registration/authentication challenge issue and verification (store credential id, public key, sign counter and an AAGUID per user in a new infra/supabase/migrati
- [☐] Supported social sign-in providers
      · Grepped for signInWithOAuth, provider:, 'sign in with google', github/discord/roblox oauth across apps and packages — no hits. apps/web/src/routes/auth-pages.tsx renders only email and password fields (LoginPage :158, SignupPage :235); ther
      → Decide the provider set first (Google and Discord are the ones a Roblox-adjacent audience has). Then: enable those providers in the Supabase dashboard, add provider buttons to LoginPage and SignupPage in apps/web/src/routes/auth-pages.tsx calling supabase.auth.signInWithOAuth({ provider, options: { 
- [☐] Enterprise single sign-on
      · Grepped for saml, sso, ssoProvider, 'single sign' across apps, packages and infra — the only hits are docs/research/supabase-auth-worker.md:21, which records that SAML/SSO is not included on the project's current Supabase plan, and the chec
      → Blocked on plan and on product scope rather than on code: Supabase SSO requires a paid tier (docs/research/supabase-auth-worker.md:21) and docs/design/TENANCY.md records that organizations are not being built, so there is no tenant for an SSO connection to attach to. If it is ever taken on, it needs
- [☐] Organization-specific sign-in policies
      · Deliberately descoped, and the decision is written down: docs/design/TENANCY.md records that the owner chose a single-user product with per-project sharing on 2026-09-15, and that `grep -rn "create table.*organizations" infra/supabase/migra
      → No change. This is descoped by an owner decision recorded in docs/design/TENANCY.md; anyone picking it up should reopen that decision first rather than build against a table that does not exist.
- [☐] Invitation-based registration
      · Every invitation path in the product requires the invitee to already have an account. POST /api/shared/:id/members (apps/worker/src/index.ts:3852) takes a userId UUID, and the UI says so out loud: apps/web/src/components/ws/members-panel.ts
      → Add an email-invitation path. In apps/worker/src/index.ts add POST /api/shared/:id/invites taking { email, role }, minting a share link via the existing newShareToken/putShareLink in apps/worker/src/collab-links.ts:26/:69 and mailing the invitee a URL of the form /app/join?token=<token>. In apps/web
- [~] Expired invitation recovery
      · The worker half is real and tested; the client half does not exist. apps/worker/src/collab.ts:220 returns status 'expired' rather than folding it into 'invalid', redeemShareLink returns { ok:false, reason:'expired' } at collab.ts:462, and a
      → Build the client half. Add redeemShareLink(token) to apps/web/src/lib/api.ts POSTing /api/shared/links/redeem, and a /join route in apps/web/src/app.tsx (outside AuthGuard, like /reset and /confirm at app.tsx:96-97) that calls it. On a 403 whose body error is 'expired', render the existing ExpiredLi
- [~] Existing-account invitation acceptance
      · Worker built and end-to-end tested, UI entirely absent. POST /api/shared/links/redeem (apps/worker/src/index.ts:4177) accepts a signed-in stranger, records accepted_at on the KV grant (index.ts:4203-4207, whose comment notes this is the onl
      → Wire the three share-link routes into the client. In apps/web/src/lib/api.ts add createShareLink(projectId, { scope, resourceId, role, expiresAt }) -> POST /api/shared/:id/links, redeemShareLink(token) -> POST /api/shared/links/redeem, and revokeShareLink(projectId, token) -> POST /api/shared/:id/li
- [☐] Duplicate-account detection
      · The mark's cited file is unrelated: packages/corpus/src/intake/dedupe.mjs:1 is MinHash near-duplicate detection over training-corpus content ('near-duplicate detection over normalised content', implementing SOURCE-INTELLIGENCE.md §2), with 
      → Decide first what this is FOR — it is almost certainly free-credit farming, since apps/worker/src/billing.ts grants a free allowance per profile. Then add apps/worker/src/signup-risk.ts holding pure functions over signals the worker can already see on a first authenticated request: normalised email 
- [☐] Secure identity linking
      · Grepped apps and packages for linkIdentity, getUserIdentities, identities, 'link account' — the only mention of `identities` in the whole tree is apps/web/src/lib/auth-flows.ts:19, which says signupOutcome deliberately never reads it (it is
      → Blocked until at least one non-password provider exists. Once one does: add a 'Connected accounts' Row to the Security section of apps/web/src/routes/settings.tsx (beside the existing email-address Row at :391) listing supabase.auth.getUserIdentities() and offering linkIdentity({ provider }). Gate t
- [☐] Identity unlinking with recovery safeguards
      · Grepped for unlinkIdentity across apps and packages — no hits. Same root cause as linking: no provider identities exist to unlink. The safeguard this item names (never let someone remove their last remaining way in) has no implementation an
      → Blocked on identity linking existing at all. When built, the safeguard is the load-bearing part and belongs in apps/web/src/lib/auth-flows.ts as a pure, tested function — canUnlink(identities, hasPassword) must refuse to remove the last credential that can still sign the account in, and must fail cl
- [✓] Password reset
      · Request: ForgotPasswordPage at apps/web/src/routes/auth-pages.tsx:345 calls supabase.auth.resetPasswordForEmail with redirectTo emailRedirectTo('/reset') at :359, and renders the uniform CheckEmailCard. Landing: /reset registered at apps/we
- [✓] Expired reset-link recovery
      · The distinction is made deliberately and tested: failureFor in apps/web/src/lib/auth-flows.ts:207 checks 'expired' BEFORE 'invalid' because Supabase's own text ('Email link is invalid or has expired') contains both words, proved by apps/web
- [✓] Safe post-login redirects
      · apps/web/src/lib/safe-redirect.ts:22 safeInternalPath folds backslashes, refuses protocol-relative and schemed paths and control characters, with a doc comment naming the react-router 6.30.6 open-redirect advisory it defends against at the 
- [✓] Session restoration after page refresh
      · apps/web/src/lib/supabase.ts:9 sets persistSession, autoRefreshToken and detectSessionInUrl on the client. apps/web/src/lib/auth.tsx:56 calls supabase.auth.getSession() on mount and subscribes to onAuthStateChange at :70, and AuthGuard rend
- [~] Return to interrupted onboarding after login
      · What exists: the coach-mark tour persists its progress and resumes from it — readProgress at apps/web/src/lib/onboarding.ts:137 reading TOUR_KEY 'apple.tour.v1' (:128), consumed on mount by apps/web/src/components/onboarding-tour.tsx:34 and
      → Two separate changes. (a) In apps/web/src/lib/auth.tsx:145 stash `location.pathname + location.search + location.hash` instead of pathname alone; safeInternalPath (apps/web/src/lib/safe-redirect.ts:22) already tolerates a query and hash, and apps/web/tests/safe-redirect.test.mjs should gain a case a
- [✓] Clear authentication failure messages
      · authErrorMessage at apps/web/src/lib/auth-flows.ts:93 maps the provider's strings onto sentences a person can act on — wrong credentials, unconfirmed email, rate limit, weak password, same password, dead network — and is careful that the un
- [✓] Sign-out from the current session
      · The mark's cited file (apps/plugin/src/init.server.luau) is the wrong one; the real implementation is apps/web/src/lib/auth.tsx:91, signOut() calling supabase.auth.signOut({ scope: 'local' }) with a comment explaining why local rather than 

## 03. ACCOUNT SECURITY AND RECOVERY  —  50%   ✓9 ~2 ☐9

- [✓] Multifactor authentication enrollment
      · RE-AUDITED 2026-09-15 AND NOW BUILT — the grep above is stale. apps/web/src/lib/mfa.ts is the decision layer (verifiedTotpFactors reads `all` and filters to status==="verified", so an abandoned enrolment is not counted as protection; factorsState refuses to say "off" for anything but a well-formed empty list). apps/web/src/routes/settings.tsx:720-873 is the panel — enroll({factorType:"totp"}), QR, challengeAndVerify, unenroll behind guard("remove-two-step") — and settings-search.ts:39 registers the "two-step" row. Proof: node --test apps/web/tests/mfa.test.mjs = 23 pass / 0 fail.
- [✓] Multifactor authentication verification
      · RE-AUDITED 2026-09-15 AND NOW BUILT. apps/web/src/lib/mfa.ts:130 secondStep reads getAuthenticatorAssuranceLevel and FAILS CLOSED — an unreadable level blocks the sign-in and says which of the two happened, rather than letting a password-only session into an account whose owner asked for a code every time. apps/web/src/routes/auth-pages.tsx:231 calls it after signInWithPassword and :306 renders the code step, which challengeAndVerifies before navigating. Proof: the 23 mfa.test.mjs cases include the unreadable-level and empty-list shapes.
- [☐] Recovery code generation
      · Grepped -riE 'recovery.code|backup.code|scratch code|one-time code' over apps/, packages/, infra/: the only hits in the whole tree are docs/backlog/CHECKLIST-V2.md:62-63, i.e. the checklist lines themselves. No table in infra/supabase/migra [2026-09-15: still absent — confirmed by the same grep.]
      → Create apps/worker/src/recovery-codes.ts modelled on apps/worker/src/user-credentials.ts: a D1 table (user_id, code_hash, used_at) storing only SHA-256 of each code (sha256hex already exists at user-credentials.ts:81), a generate(userId) that mints 10 codes, returns them exactly once and stores only NOT ATTEMPTED THIS PASS, deliberately: generation and storage are straightforward, but REDEMPTION is not reachable from this deployment. Spending a code to get past a lost factor means dropping that factor, which is auth.admin.mfa.deleteFactor and needs SUPABASE_SERVICE_ROLE_KEY — absent from apps/worker/src/env.ts and an owner-provisioned secret. Codes that can be minted and never spent are decoration, so the honest intermediate is the human queue below (Account recovery request tracking), which shipped this pass.
- [☐] Recovery code regeneration
      · Same search as generation — nothing to regenerate exists. No route in apps/worker/src/index.ts matches /recovery, and apps/web/src/lib/settings-search.ts has no entry for it. [2026-09-15: still absent. The audit line "no route in apps/worker/src/index.ts matches /recovery" is now out of date — /api/recovery-request exists — but that is the support queue, not a code store.]
      → Once apps/worker/src/recovery-codes.ts exists, add POST /api/security/recovery-codes/regenerate that deletes every existing row for the user in one statement and mints a fresh set, and call securityNotice() (apps/worker/src/index.ts:2819) so the account holder is told the old codes stopped working.  Blocked behind generation for the service-role reason recorded above.
- [~] Lost-authenticator recovery
      · PARTLY BUILT 2026-09-15, and the audit line is stale in both directions: a factor DOES now exist to lose (two-step verification shipped), and there IS now an alternate path. apps/web/src/routes/auth-pages.tsx — the two-step prompt — used to read "Without that app you cannot get in — there are no backup codes yet", which was honest and left the person nowhere; /forgot is not the answer either, since a new password lands back on the same prompt. It now says that and links to /recovery carrying the address already typed. Proof: node --test apps/web/tests/lost-authenticator-exit.test.mjs = 5 pass / 0 fail, two of which were red first.
      → WHAT IS STILL MISSING is the self-service half: a code the person redeems themselves, which drops the factor and lets them back in unaided. That needs recovery codes (above) AND auth.admin.mfa.deleteFactor, i.e. SUPABASE_SERVICE_ROLE_KEY in apps/worker/src/env.ts — an owner action. Until then the exit is a human reading the queue: a real path, not a self-service one, which is why this is ~ and not ✓.
- [☐] Passkey management
      · Grepped -riE 'passkey|webauthn|navigator\.credentials|publicKeyCredential' over apps/ and packages/ (*.ts,*.tsx,*.astro): zero hits in source. Only docs/backlog/FEATURES.md:54 and :971 and docs/backlog/CHECKLIST-V2.md:40/65 mention it. apps
      → Build a credential registry: a D1 or Postgres table of (user_id, credential_id, public_key, sign_count, label, created_at, last_used_at), a worker route pair POST /api/security/passkeys/options + /verify performing WebAuthn registration and assertion, and a 'passkeys' row in apps/web/src/routes/sett NOT ATTEMPTED THIS PASS: WebAuthn costs nothing in fees but is a whole second credential system — registration and assertion ceremonies, a key table, attestation policy, and a recovery story of its own. It is the largest item in this section and would have come at the cost of finishing anything else; skipped in favour of depth on the recovery queue.
- [☐] Active session inventory
      · No surface anywhere lists sessions. apps/web/src/lib/auth.tsx exposes exactly session, loading, signOut, signOutEverywhere, reauthenticatedAt, markReauthenticated (:15-21) — one session object, the current one. No worker route lists session
      → Add GET /api/security/sessions to apps/worker/src/index.ts that uses a SUPABASE_SERVICE_ROLE_KEY secret (not currently in apps/worker/src/env.ts) to read auth.sessions and auth.refresh_tokens for c.get('user').userId, returning id, created_at, updated_at, user_agent and ip, with the current session  SKIPPED 2026-09-15 — CONFIRMED BLOCKED: grep SUPABASE apps/worker/src/env.ts returns only SUPABASE_URL and SUPABASE_ANON_KEY. Reading auth.sessions needs the service-role key, a secret only the owner can provision. Building the route against a binding nobody has set would ship a surface that 500s in production.
- [☐] Device and browser identification
      · Nothing captures or displays a device fingerprint for an account session. Grepped -riE 'user.agent|user_agent|device|ip.address|last.seen' over apps/worker/src and apps/web/src: every hit is unrelated (apps/web/src/lib/prefs.ts:2 device *se
      → Blocked on session inventory. When GET /api/security/sessions is added, parse the user_agent column Supabase already stores into a human label ('Chrome on macOS', 'Roblox Studio') in a new apps/web/src/lib/device-name.ts with a node --test unit test, and show that label plus the IP's coarse location SKIPPED: blocked on session inventory, which is blocked on the service-role secret.
- [☐] Individual session revocation
      · Only two scopes exist and neither targets one session: apps/web/src/lib/auth.tsx:95 signOut({scope:'local'}) and :112 signOutEverywhere -> signOut({scope:'global'}). There is no per-session id anywhere in the client, and no worker route acc
      → Add DELETE /api/security/sessions/:id to apps/worker/src/index.ts that, with the service-role key, deletes the named row from auth.sessions only when its user_id equals c.get('user').userId, then calls securityNotice() (index.ts:2819). Wire a 'Sign out' button on each row of the sessions list in app SKIPPED: same service-role blocker.
- [✓] Sign-out from all devices
      · apps/web/src/lib/auth.tsx:111-115 signOutEverywhere calls supabase.auth.signOut({scope:'global'}) and RETURNS the error rather than swallowing it; apps/web/src/routes/settings.tsx:494-502 renders the 'sign-out-everywhere' row with a button  [Re-verified 2026-09-15: auth.tsx:166 signOutEverywhere still returns the error rather than swallowing it; settings.tsx:1022 still renders the row.]
- [☐] Suspicious sign-in notifications
      · A security_event notification kind exists and is unmutable (apps/worker/src/notifications.ts:56 and :117), but grep 'securityNotice' in apps/worker/src/index.ts shows exactly five call sites — :2916 API key created, :2983 rotated, :3009 rev
      → Register a Supabase Auth Hook (or a Postgres trigger on auth.audit_log_entries) that POSTs sign-in events to a new authenticated-by-shared-secret route POST /api/hooks/auth-event in apps/worker/src/index.ts. Store a per-user history of (ip, user_agent, at) and, when a sign-in is far outside it or fo SKIPPED 2026-09-15: a Supabase Auth Hook is configured in the Supabase project, not in this repository — an owner action. grep "auth-event" in apps/worker/src/index.ts still returns nothing.
- [☐] New-device notifications
      · Same absence as suspicious sign-ins, plus there is no notion of a known device to compare against: nothing in apps/worker/src or apps/web/src persists a device identifier for an account (see 'Device and browser identification'). The five se
      → Depends on the auth-event hook above plus a devices table keyed on a hash of (user_agent, ip prefix). On the first sign-in from an unseen device, call securityNotice(). Because delivery is in-app only (apps/worker/src/notifications.ts:143), this is only useful once the inbox UI in 'Security event hi SKIPPED: depends on the auth hook above.
- [✓] Sensitive-action reauthentication
      · apps/web/src/lib/auth-flows.ts:376 defines SENSITIVE_ACTIONS ('change-email','change-password','sign-out-everywhere','reset-settings'); :415 needsReauth fails closed on an unreadable and on a future timestamp; :432 freshestAuth takes the la [Re-verified 2026-09-15: auth-flows.ts:376 SENSITIVE_ACTIONS, :425 needsReauth and :442 freshestAuth are all still present and still fail closed.]
- [~] Secure email address changes
      · Built and reachable: apps/web/src/routes/settings.tsx:198-221 changeEmail calls supabase.auth.updateUser({email}, {emailRedirectTo: emailRedirectTo('/confirm')}), gated by guard('change-email') at :425, with an enumeration-safe outcome (ema
      → Either (a) add infra/supabase/config.toml with [auth.email] secure_email_change_enabled = true and have infra/supabase/migrate.mjs apply/verify it, or (b) add a check to infra/supabase/tests/ that queries the project's auth settings and fails when secure email change is off. Until one of those exist STILL OPEN 2026-09-15 — infra/supabase/ holds migrate.mjs, migrations/ and tests/ and NO config.toml. Not attempted this pass because neither half is verifiable from here: the Management API field (mailer_secure_email_change_enabled) needs an owner personal access token, so a checker written now could not be RUN now, and adding a file under infra/supabase/tests/ that merely MENTIONS the setting would flip licensedByAnObservation() in apps/web/tests/secure-email-change.test.mjs and unlock a copy claim nobody has actually made. That is the exact trapdoor that test exists to hold shut. The settings copy stays honest in the meantime.
- [✓] Password change notifications
      · RE-AUDITED 2026-09-15 AND NOW BUILT — both halves the → line asked for. apps/worker/src/index.ts:3629 POST /api/security/password-changed AWAITS the write (not fire-and-forget securityNotice) and answers {recorded:false, reason} rather than 500 when the notice is dropped, because the password genuinely did change and reporting that as failed is the worse wrong answer. The recipient is the token subject, so the route cannot post "your password was changed" into anybody else's inbox. apps/web/src/lib/api.ts:1804 reportPasswordChanged, called at apps/web/src/routes/settings.tsx:1159, where the page says different things for recorded and not-recorded.
- [✓] Compromised credential handling
      · RE-AUDITED 2026-09-15 AND NOW BUILT — the detection half is no longer discarded. apps/worker/src/do/session.ts:2728 records the verdict BEFORE the `action === "allow"` return, so zero-weight signals such as secret_in_prompt are written down on submissions that are otherwise fine, which is the only kind they occur on; a pasted credential gets its own errorKind rather than the generic abuse_noted. :2763 broadcasts advisory(verdict) (apps/worker/src/abuse.ts:343) to the client as a `notice`, not an `error` — the run is still running, and a failure-shaped banner over a healthy build teaches people to distrust both the banner and the build.
- [✓] Account recovery request tracking
      · BUILT THIS PASS (2026-09-15). apps/worker/src/recovery-requests.ts is the store: recovery_requests(id, email_hash, opened_at, state, note, attempts, decided_by, decided_at), created via oncePerIsolate. Rows hold the SHA-256 of the address and NEVER the address — a plaintext queue of people locked out is a phishing list — and the operator matches by hashing one the person gave them out of band (?email= on the admin route). It CANNOT answer "does this address have an account?": it holds a D1 binding and nothing that could ask, so there is no branch to get wrong, and the route test proves it by comparing two whole response bodies. A failed write is never reported as a recorded request (503, "nothing has been saved"), because whether D1 accepted the row does not depend on the address and so saying so leaks nothing. refused/closed are terminal, so an impersonation attempt cannot be reopened and approved later.
      → SHIPPED: POST /api/recovery-request (in AUTH_EXEMPT — the premise is that there is no token), GET/POST /api/admin/recovery-requests[/:id], apps/web/src/lib/account-recovery.ts (recoveryOutcome reaches "received" from exactly one shape, so a proxy error page and a dead connection cannot render as thanks), and the /recovery page, linked from the sign-in form, the check-your-email card and the two-step prompt. Proof: node --test apps/worker/tests/recovery-requests.test.mjs = 20 pass, apps/worker/tests/recovery-routes-live.test.mjs = 12 pass, apps/web/tests/account-recovery.test.mjs = 11 pass, 0 fail. STILL MISSING: nothing notifies the operator that a row arrived — the queue has to be opened to be seen.
- [✓] Security event history
      · RE-AUDITED 2026-09-15 AND NOW BUILT — the consumer exists. apps/web/src/lib/security-history.ts holds the two decisions a page gets wrong quietly: historyState refuses to say "nothing has happened on your account" for anything but a well-formed empty list (a failed read is a different sentence), and unreadSecurityIds marks read by ID rather than passing "all", so opening the security panel cannot clear unseen run failures from a panel that is not about runs. apps/web/src/routes/settings.tsx:925 SecurityHistory renders it at :1449 in the Security section, which is where notifications.ts:117 already pointed. Proof: node --test apps/web/tests/security-history.test.mjs = 16 pass / 0 fail.
- [☐] Organization-enforced security requirements
      · Nothing exists and nothing is intended to. There is no organization row anywhere in infra/supabase/migrations/0001-0006, and the only 'org' concept in the worker is apps/worker/src/memory-store.ts orgMembership used for preference layering 
      → Not planned — do not build. If the tenancy decision in docs/design/TENANCY.md is ever reversed, this item needs organization rows with an enforced policy document (minimum password length, MFA required, session lifetime) checked at sign-in and at each sensitive action, which presumes every other ite [2026-09-15: left alone as instructed — this is the one item in the section whose → line says do not build it.]
- [✓] Protection against account enumeration
      · The strongest-built item in the section. apps/web/src/lib/auth-flows.ts:55 CHECK_EMAIL_LINE is one conditional sentence used for registered and unregistered addresses alike; :73 revealsAccountExistence filters provider phrasings on the way  [Re-verified 2026-09-15: CHECK_EMAIL_LINE at auth-flows.ts:52, revealsAccountExistence at :77, and signupOutcome still reads `session` and never `identities`. The new /recovery route was built to the same rule and its route test asserts it on the wire.]

## 07. MEMBERSHIP AND INVITATIONS  —  38%   ✓0 ~15 ☐5

- [~] Member directory
      · Worker half is complete and proven: memberDirectory at apps/worker/src/supa.ts:182 feeds GET /api/shared/:id (apps/worker/src/index.ts:3622) and mention resolution; buildRoster at apps/worker/src/membership.ts:140 backs GET /api/shared/:id/
      → Mount the existing panel. In apps/web/src/routes/workspace.tsx add a 'members' drawer alongside the 'memory' drawer at line 891: import { MembersPanel } from '../components/ws/members-panel', call fetchProjectAccess(projectId) (apps/web/src/lib/api.ts:539) through useQuery, pass its result through n
- [~] Member search and filtering
      · Server-side search and filters are built and tested: parseRosterQuery at apps/worker/src/membership.ts:216 (q, role, status, origin, limit, offset, and an unreadable value is an error rather than an ignored filter) and filterRoster at apps/
      → Covered by mounting MembersPanel (see 'Member directory'). Nothing new to build server-side. Note apps/web/src/lib/member-match.ts has no test file under apps/web/tests — add member-match.test.mjs asserting tierFor returns exact/prefix/word/substring/id in that priority order.
- [~] Single-member invitations
      · POST /api/shared/:id/members at apps/worker/src/index.ts:3852 is complete: gated on manage_members, refuses a non-grantable role (:3861), refuses the owner (:3864), reads the prior row before the merge so the audit event names what actually
      → Covered by mounting MembersPanel (see 'Member directory'); InviteForm is rendered at apps/web/src/components/ws/members-panel.tsx:421 as a child of the panel, so it comes with it.
- [~] Bulk invitations
      · Worker side is complete and heavily tested: planBulkInvite at apps/worker/src/membership.ts:338 (cap of 50 at :328, refused whole rather than truncated, per-row rejection reasons bad_row/bad_user/unknown_role/owner_is_not_a_member/duplicate
      → Add to apps/web/src/lib/api.ts, next to inviteMember at line 586: export const bulkInviteMembers = (projectId, members: {userId,role,expiresAt}[]) => request(`/api/shared/${encodeURIComponent(projectId)}/members/bulk`, { method:'POST', body: JSON.stringify({ members }) }). Then in apps/web/src/compo
- [~] Invitation role selection
      · The role is required and validated on every path that confers access: POST /api/shared/:id/members rejects anything outside GRANTABLE_ROLES at apps/worker/src/index.ts:3861; planBulkInvite does the same at apps/worker/src/membership.ts:346;
      → Covered by mounting MembersPanel (see 'Member directory'). No worker change needed.
- [☐] Invitation workspace assignment
      · There is no workspace level in the data model to assign to. docs/design/TENANCY.md records the owner's decision on 2026-09-15 to stay single-user with per-project sharing, and grep 'create table.*workspace' over infra/supabase/migrations (0
      → Not planned. Building it means adding a tenant-workspace table between organizations and projects, a scope column on project_members, and rewriting the 43 RLS checks in infra/supabase/tests/rls-isolation.mjs. If the owner reverses the decision, start from docs/design/TENANCY.md option 1 and pick a n
- [~] Invitation expiration
      · Expiry is a real column and a real refusal: expires_at at infra/supabase/migrations/0005_collaboration.sql:39; RLS excludes an expired grant at infra/supabase/migrations/0006_membership_lifecycle.sql:80 and :103; classifyGrant makes an expi
      → In apps/worker/src/index.ts at line 3879, replace the unvalidated pass-through with the same check planBulkInvite makes at apps/worker/src/membership.ts:364: if body.expiresAt is present and not a string whose Date.parse is finite, return c.json({ error: 'bad_expiry' }, 400) before the insert. Add a
- [☐] Invitation resend
      · Nothing is ever sent to an invitee, so there is nothing to resend. NOTIFICATION_KINDS at apps/worker/src/notifications.ts:47-57 lists run_complete, run_failed, automation_failed, approval_requested, mention, integration_failure, usage_thres
      → There is no invitation delivery to re-send, so build the delivery first. Add 'invited' to NOTIFICATION_KINDS in apps/worker/src/notifications.ts:47 and, in POST /api/shared/:id/members (apps/worker/src/index.ts:3893), call notifyMany for the invitee with the project name and role alongside the exist
- [~] Invitation revocation
      · Revoking a granted membership is built and tested end to end: DELETE /api/shared/:id/members/:userId at apps/worker/src/index.ts:3985 PATCHes revoked_at rather than deleting, revokes the KV grant a share link minted AND bars re-redemption (
      → Mount MembersPanel for the member half. For the link half, add GET /api/shared/:id/links to apps/worker/src/index.ts beside the POST at line 4144, gated on 'share': list the project's StoredShareLink records (they are keyed by token via shareLinkKey in apps/worker/src/collab-links.ts:38, so add a pe
- [☐] Pending invitation inventory
      · There is no pending state to inventory and no inventory route. An invitation in this product is immediate: POST /api/shared/:id/members (apps/worker/src/index.ts:3852) writes a live grant with no acceptance step — the redeem route says so i
      → Add GET /api/shared/:id/links to apps/worker/src/index.ts (gated on 'share') returning every share link issued for the project with scope, role, createdBy, createdAt, expiresAt, revokedAt, a redeemed-count, and an opaque id instead of the token. This needs a per-project index in KV, because putShare
- [~] Invitation acceptance audit
      · The acceptance is recorded where the accepter cannot reach it and is read back in the history: accepted_at is written on the KV grant at redeem time (apps/worker/src/index.ts:4207-4209) and merged into GET /api/shared/:id/members/events as 
      → Add fetchMemberEvents(projectId, userId?) to apps/web/src/lib/api.ts calling GET /api/shared/:id/members/events (it accepts ?userId= and ?limit=), and render it in apps/web/src/components/ws/members-panel.tsx as a per-member history disclosure. Honour the response's `partial`/`incomplete:['link_gran
- [~] Role change history
      · Built, append-only, and tested. Table membership_events at infra/supabase/migrations/0006_membership_lifecycle.sql:111 with no update and no delete policy (test apps/worker/tests/membership-migration.test.mjs:69) and a CHECK constraint whos
      → Same as 'Invitation acceptance audit': add fetchMemberEvents to apps/web/src/lib/api.ts and a history view in apps/web/src/components/ws/members-panel.tsx that renders fromRole -> toRole, the actor, the reason and the timestamp, and surfaces the route's `audited:false` answer (returned by the invite
- [~] Member suspension
      · A first-class state, not a reuse of revocation. Columns suspended_at/suspended_reason/suspended_by at infra/supabase/migrations/0006_membership_lifecycle.sql:36-38 with a 500-char CHECK matching the worker's EVENT_REASON_MAX (test apps/work
      → Covered by mounting MembersPanel (see 'Member directory'). One real gap once mounted: suspendMember is called with an empty reason at apps/web/src/components/ws/members-panel.tsx:127 even though the route stores and audits a reason — add a reason prompt or field to the Pause control and pass it thro
- [~] Member reactivation
      · POST /api/shared/:id/members/:userId/reactivate at apps/worker/src/index.ts:4107 clears revoked_at and the suspension in Postgres, lifts the re-redemption bar on the KV grant (:4135, restoreKvGrant), and deliberately restores AT THE ROLE TH
      → Covered by mounting MembersPanel (see 'Member directory'). Note the panel only offers Reactivate for status==='suspended' (members-panel.tsx:270) while the route also reinstates a REMOVED member; extend that condition to include 'revoked' so an admin can undo a removal from the list rather than by r
- [~] Member removal impact preview
      · Built as a read-only preview and tested. GET /api/shared/:id/members/:userId/impact at apps/worker/src/index.ts:3820 combines the roster standing with memberFootprint from the collaboration store (apps/worker/src/do/collab-store.ts:459, cou
      → Add fetchMemberImpact(projectId, userId) to apps/web/src/lib/api.ts hitting GET /api/shared/:id/members/:userId/impact, and in apps/web/src/components/ws/members-panel.tsx change the Remove button to open a confirmation that first fetches the impact and lists the counts and the `effects` flags befor
- [~] Removed-member access revocation
      · AT THE DOOR IT WORKS: DELETE /api/shared/:id/members/:userId revokes in Postgres and KV and bars re-redemption of the link the person still holds (apps/worker/src/index.ts:3985-4025); the next request from that person is refused (apps/worke
      → Wire the module it already has. (1) In apps/worker/src/do/session.ts, record the initiator when a run starts: persist initiatedBy (the authenticated user id from the socket handshake, which apps/worker/src/index.ts:3646 already stamps as X-User-Id) and initiatorExpiresAt from the resolved grant onto
- [☐] Departing-member resource reassignment
      · Nothing reassigns anything. The impact preview enumerates what the departing member holds (apps/worker/src/do/collab-store.ts:459 counts their comments, reviews and versions) and then explicitly states the opposite of reassignment: apps/wor
      → Add POST /api/shared/:id/members/:userId/reassign to apps/worker/src/index.ts beside the removal route at line 3985, gated on manage_members, taking { toUserId } and verifying the recipient is a live member at a role that can hold the work (editor or above, via can() from apps/worker/src/collab.ts).
- [~] Guest membership
      · Guests are a distinct, named class throughout the roster. MEMBER_ORIGINS at apps/worker/src/membership.ts:61 defines 'link' as the guest class with a comment saying a roster that cannot tell an admin-named member from a link-redeemer cannot
      → Two pieces. (1) Mount MembersPanel (see 'Member directory') for the guest labelling and the origin filter. (2) Add the link-minting client that does not exist: a createShareLink(projectId, {scope, role, expiresAt}) function in apps/web/src/lib/api.ts posting to POST /api/shared/:id/links (apps/worke
- [~] Temporary membership expiration
      · A time-boxed membership works at every layer. expires_at is on the row (infra/supabase/migrations/0005_collaboration.sql:39) and excluded by RLS (infra/supabase/migrations/0006_membership_lifecycle.sql:80, :103); classifyGrant produces the 
      → (1) Mount MembersPanel (see 'Member directory'). (2) For the warning: add an 'access_expiring' kind to NOTIFICATION_KINDS in apps/worker/src/notifications.ts:47 and a scheduled handler in apps/worker/src/index.ts that selects project_members rows whose expires_at falls inside the next 48 hours and w
- [☐] Seat availability visibility
      · There is no seat concept anywhere in the product. I grepped 'seat' case-insensitively across apps/worker/src, apps/web/src, apps/site/src and packages/shared: every hit is Roblox furniture or level-design vocabulary (apps/worker/src/worldbu
      → Not planned. If the owner reverses it, the minimum honest version without organizations is a per-project collaborator cap tied to the owner's plan: add a limit to the plan definitions in apps/worker/src/pricing.ts, enforce it in POST /api/shared/:id/members (apps/worker/src/index.ts:3852) and in pla

## 04. USER PROFILE AND PERSONAL SETTINGS  —  68%   ✓11 ~5 ☐4

- [✓] Display name management
      · Control: apps/web/src/routes/settings.tsx:367 (<Row id="display-name"> form, maxLength 60) writing profiles.display_name at apps/web/src/routes/settings.tsx:262. Read back in the app shell at apps/web/src/components/layout.tsx:346 and serve
- [☐] Profile image management
      · Searched apps/web/src, apps/worker/src, apps/site/src, packages/ and infra/ for avatar|profile_image|gravatar|photoURL|picture. The only hits are the CSS class .gx-avatar and apps/web/src/components/layout.tsx:68,80, which renders the first
      → Add `avatar_url text` to public.profiles in a new infra/supabase/migrations file, add a worker route (e.g. PUT /api/me/avatar in apps/worker/src/index.ts) that accepts a bounded PNG/JPEG, stores it in R2 and writes the URL to the profile; add a <Row id="avatar"> to the Profile section of apps/web/sr
- [✓] Verified email management
      · apps/web/src/routes/settings.tsx:391 (<Row id="email-address">) shows the address with a Verified / Not confirmed pill derived from emailVerification() in apps/web/src/lib/auth-flows.ts, a 'Send the link again' resend (settings.tsx:411) and
- [✓] Preferred language selection
      · Control: apps/web/src/components/ws/instructions-panel.tsx:247 ('Answer me in', ten tags) saving via savePreferences at instructions-panel.tsx:129 → PUT /api/memory/:scope/:scopeId/preferences (apps/worker/src/index.ts:1036) → validated aga
- [✓] Timezone selection
      · apps/web/src/routes/settings.tsx:579 (<Row id="time-zone">) offers 'Match my device' plus COMMON_TIME_ZONES and preserves an already-stored zone outside the list; values are validated before storage by isTimeZone (apps/web/src/lib/prefs.ts:
- [✓] Date and time formatting preferences
      · Two controls plus the zone: region select at apps/web/src/routes/settings.tsx:547 and the 12/24-hour Choice at settings.tsx:568, both feeding formatSettingsFrom (apps/web/src/lib/format.ts:31) which every fullStamp/clockTime call reads. Pro
- [✓] Number formatting preferences
      · The regional-formatting select at apps/web/src/routes/settings.tsx:547 drives resolveLocale → formatNumber (apps/web/src/lib/format.ts:119) and formatBytes, and the row previews the result live at settings.tsx:557 (formatNumber(1234.5)). Pr
- [✓] Light and dark appearance preferences
      · Three-way control (Match my system / dark / light) at apps/web/src/routes/settings.tsx:513; the chosen value is persisted by writePrefs (apps/web/src/lib/theme.tsx:127) and painted by always writing an explicit data-theme at apps/web/src/li
- [✓] System appearance synchronization
      · apps/web/src/lib/theme.tsx:100 subscribes to '(prefers-color-scheme: dark)' through useMediaQuery (theme.tsx:50-73, which re-subscribes on change and is guarded for engines without matchMedia/addEventListener), and resolveAppearance turns '
- [✓] Accessibility preference storage
      · The reduced-motion preference is stored and honoured end to end: vocabulary and per-field validation at apps/web/src/lib/prefs.ts:35,124,202; control at apps/web/src/routes/settings.tsx:529 (system / always reduce / keep motion on); resolve
- [~] Notification channel preferences
      · Worker half is real and tested: channels and the refusal vocabulary at apps/worker/src/notifications.ts:135 (NOTIFICATION_CHANNELS = ['inapp']) and :142 (UNBUILT_CHANNELS), per-event and delivery preferences stored as scoped preference rows
      → Add a 'Notifications' Section to apps/web/src/routes/settings.tsx with rows id="notify-events" (a switch per NOTIFICATION_KIND, disabled with an explanation for the two kinds where spec.optional is false) and id="notify-delivery" (timezone, quiet-hours start/end, digest mode + hour); register both i
- [☐] Default organization selection
      · There is no organization to select. docs/design/TENANCY.md records the measured finding that `grep -rn "create table.*organizations" infra/supabase/migrations` returns nothing and that the schema is flat (profiles → projects → project_membe
      → Out of scope by the owner's 2026-09-15 single-user decision (docs/design/TENANCY.md). If that is ever reversed, organizations must exist as rows first (new migration adding public.organizations and public.organization_members, RLS re-derived, infra/supabase/tests/rls-isolation.mjs rewritten); only t
- [☐] Default workspace selection
      · Same absence as the organization item, plus a naming trap documented in docs/design/TENANCY.md: 'workspace' in this tree already means the agent's per-project FILE STORE (workspaceFor/WorkspaceStore in apps/worker/src/webtools.ts), and apps
      → Out of scope by the owner's 2026-09-15 single-user decision (docs/design/TENANCY.md). If reversed, pick a distinct code name (tenantWorkspace) before writing any of it, because the existing WorkspaceStore collision is where a tenant-isolation bug would hide.
- [☐] Default project landing view
      · Searched apps/web/src and apps/worker/src for default.{0,6}view, landing.{0,6}view, startPage, start_page, homeRoute, defaultRoute — no hits. apps/web/src/lib/prefs.ts:83-89 records why: the preference was drafted and REMOVED before shippin
      → This needs a product decision before code: there is currently only one project view. If a second landing surface is reintroduced, add a 'landingView' field to Prefs in apps/web/src/lib/prefs.ts (allowlist + per-field fallback, add it to PREF_LABELS so the reset dialog can name it), a <Row id="landin
- [~] Keyboard shortcut preferences
      · Exactly one binding is user-configurable and it is done properly: the send key. Vocabulary at apps/web/src/lib/prefs.ts:103 (SEND_KEYS), chooser at apps/web/src/components/shortcuts-dialog.tsx:61-72 (radiogroup writing setPref('sendKey', ke
      → To make shortcuts rebindable rather than just the send key: add a `bindings?: Partial<Record<ShortcutName, Shortcut>>` field to Prefs in apps/web/src/lib/prefs.ts with per-field validation (reject a chord the browser owns — the list is in the header of apps/web/src/lib/shortcuts.ts — and reject a ch
- [~] AI interaction preferences
      · Five of them are built, reachable and applied: reply language (apps/web/src/components/ws/instructions-panel.tsx:247), response length (:264), coding style (:281), Roblox conventions (:298) and the personal prompt profile (:320), saved thro
      → Add a memory-mode control to apps/web/src/components/ws/instructions-panel.tsx (a three-way choice matching MEMORY_MODE values in apps/worker/src/memory.ts, saved with the existing savePreferences call at line 129) and add `memory_mode` and `tool_permissions` to the Preferences interface in apps/web
- [~] Connected identity overview
      · There is one connection panel, not an overview. apps/web/src/routes/settings.tsx:506-510 renders a 'Connections' section containing RobloxKeyPanel (apps/web/src/components/roblox-key-panel.tsx), which shows the stored Roblox Open Cloud cred
      → Extend the Connections section of apps/web/src/routes/settings.tsx with a <Row id="connected-identities"> that lists every identity with its connected-at and last-used time and a disconnect action: the Roblox credential (already served by GET /api/me/roblox-key), and Studio pairings — add a worker r
- [✓] Personal settings search
      · Search field at apps/web/src/routes/settings.tsx:344 filtering rows through matchSettings (apps/web/src/lib/settings-search.ts:80), which ranks with the command palette's own scorer rather than a second one; every row is stamped data-settin
- [~] Settings synchronization across devices
      · Split down the middle by design. Synced half: the AI preferences and personal prompt profile live server-side in the scoped preference store and follow the user to any device (PUT/GET /api/memory/user/:id/preferences, apps/worker/src/index.
      → Persist the Prefs object per user: add GET/PUT /api/me/prefs to apps/worker/src/index.ts (or new preference keys in apps/worker/src/preferences.ts:32 reusing the user scope) storing the six fields from apps/web/src/lib/prefs.ts, and hydrate in apps/web/src/lib/theme.tsx:99 — read localStorage first 
- [✓] Settings reset with confirmation
      · apps/web/src/routes/settings.tsx:628 (<Row id="reset-settings">): the button names how many settings will change and disables itself when everything is already default (isDefaultPrefs), then goes through BOTH gates — needsReauth → ReauthDia

## 08. AUTHORIZATION AND TENANT ISOLATION  —  73%   ✓11 ~7 ☐2

- [✓] Explicit resource ownership
      · Ownership is a column plus an asserted query, not an implication. infra/supabase/migrations/0001_init.sql:13 declares projects.owner_id; :132 is the `own projects` RLS policy. apps/worker/src/supa.ts:77 getOwnedProject reads the JWT subject
- [✓] Deny-by-default authorization
      · apps/worker/src/index.ts:392 AUTH_EXEMPT is a 5-entry allowlist; :393 the /api/* middleware 401s everything else before a handler runs. packages/evals/src/security.test.mjs:1585 sweeps every literal /api/ route out of index.ts, subtracts AU
- [✓] Server-side permission enforcement
      · Enforced at the route and again inside the Durable Object. packages/evals/src/security.test.mjs:1184 is a static sweep asserting EVERY /api/projects/* route proves ownership by one of three named forms and refuses with 404 — a route that in
- [✓] Database-level tenant isolation
      · RLS is enabled on every public table (infra/supabase/migrations/0001_init.sql:106-113, 0005_collaboration.sql:53, 0006_membership_lifecycle.sql:133) and each has an explicit policy or is deliberately worker-only (0001_init.sql:144 notes pai
- [~] Organization-scoped data access
      · The checklist marks this 'not planned' per docs/design/TENANCY.md, but org-scoped data access EXISTS for one data domain and that doc is now out of date. apps/worker/src/memory-store.ts:54 defines ORG_ROLES (owner/admin/member/viewer); :540
      → Two separable halves. (1) Reachability: apps/web has no organisation surface at all — add an Organisations section to apps/web/src/routes/settings.tsx that calls fetchMemoryScopes (apps/web/src/lib/api.ts:330, currently uncalled) plus new api.ts helpers for GET/POST /api/orgs and GET/PUT/DELETE /api
- [☐] Workspace-scoped data access
      · No tenant-workspace level exists. `grep -rn "create table.*workspaces\|workspace_id\|tenant_id" infra/supabase/migrations/` returns nothing; there is no workspaces table in apps/worker/src/memory-store.ts's D1 schema either (only memory_ent
      → Descoped by the owner on 2026-09-15 (docs/design/TENANCY.md) — build only if that is reversed. If it is: add infra/supabase/migrations/0007_workspaces.sql with a workspaces table, projects.workspace_id, workspace_members, and rewrite every 'own projects'/'members read shared *' policy to resolve thr
- [✓] Project-scoped data access
      · The checklist's citation (apps/web/src/lib/supabase.ts) is wrong; the enforcement is in the worker. Every project resource is addressed by a project id the caller PROVED, never by one they supplied: apps/worker/src/index.ts:501 withOwnedPro
- [✓] Action-level permissions
      · apps/worker/src/collab.ts:78 COLLAB_ACTIONS is an 11-verb vocabulary; :110 CAPABILITIES maps each role to its verbs (restore_version deliberately admin-only, chat/build stop at editor because they spend the owner's Credits); :125 can() take
- [✓] Built-in role definitions
      · Two role vocabularies, both defined in code and both enforced. Project collaboration: apps/worker/src/collab.ts:41 COLLAB_ROLES = viewer/commenter/editor/admin/owner, :55 GRANTABLE_ROLES excludes owner, :110 CAPABILITIES defines what each o
- [☐] Custom role definitions
      · Roles are two closed compile-time tuples with no persistence and no creation path. apps/worker/src/collab.ts:41-113 hard-codes COLLAB_ROLES and CAPABILITIES; :47 asCollabRole refuses anything outside the tuple; apps/worker/src/memory-store.
      → Not started. To build: add infra/supabase/migrations/0007_custom_roles.sql with project_roles(project_id, slug, name, created_by) and project_role_actions(project_id, slug, action) constrained to the COLLAB_ACTIONS vocabulary; change apps/worker/src/collab.ts so can()/capabilitiesFor() take a resolv
- [~] Least-privilege default roles
      · The ladder is least-privilege by construction and nothing ever defaults a role upward: apps/worker/src/collab.ts:104 VIEWER holds only 'read'; :107 restore_version is admin rather than editor with the reason written out; :405 SHARE_LINK_MAX
      → Change apps/web/src/components/ws/members-panel.tsx:341 from useState<GrantableRole>('editor') to useState<GrantableRole>('viewer') so the invite form opens at the least-privileged grant, and add a test in apps/web/tests/ asserting the initial value equals GRANTABLE_ROLES[0]. Also add an assertion i
- [~] Permission inheritance visibility
      · Worker half is complete. apps/worker/src/collab.ts:308 effectivePermissions returns via:'owner'|'grant' (where the role came from), invitedBy (who conferred it) and expiresAtIso (until when), derived from the same can() the routes enforce w
      → Add `export const fetchPermissions = (projectId: string) => request<EffectivePermissions>(`/api/shared/${encodeURIComponent(projectId)}/permissions`)` to apps/web/src/lib/api.ts beside fetchProjectAccess (line 538), and render its answer in a 'Your access' block in apps/web/src/components/ws/members
- [~] Permission override visibility
      · The mechanism is real and unit-tested: apps/worker/src/collab.ts:308 effectivePermissions recomputes the ACTIVE grants for the caller, reports invitedBy for the one in force and supersededCount for the ones it outranks (collab.ts:345-353), 
      → Once fetchPermissions exists (see 'Permission inheritance visibility'), render supersededCount in apps/web/src/components/ws/members-panel.tsx as an explicit line — e.g. 'You also hold 1 weaker invitation, which this role overrides' — rather than dropping it; an overridden grant that is silently not
- [~] Effective permission inspection
      · The inspection endpoint exists and is honest: apps/worker/src/index.ts:4336 GET /api/shared/:id/permissions consults only the caller's own rows and returns EVERY action in the vocabulary as true/false rather than a subset (collab.ts:330 com
      → Three concrete steps. (1) Create apps/web/tests/capabilities.test.mjs — the file apps/web/src/lib/capabilities.ts:18 already claims exists — which esbuild-bundles apps/worker/src/collab.ts and apps/web/src/lib/capabilities.ts and asserts COLLAB_ROLES, COLLAB_ACTIONS and GRANTABLE_ROLES are identical
- [✓] Cross-tenant access rejection
      · Proved at three layers, two of them in CI. HTTP, as the stranger: apps/worker/tests/collab-routes.test.mjs:238 drives 17 shared routes with a real ES256 token for an account with no relationship to the project and asserts 404 on every one, 
- [✓] Unauthorized resource existence protection
      · The 404/403 split is a written rule with a reason: apps/worker/src/collab.ts:365-375 — a non-member gets 404 because three distinct answers would turn an id into an oracle, while a MEMBER lacking the capability gets 403 because they already
- [✓] Search result permission filtering
      · Every search path is bound to a scope the caller already proved, and returns nothing otherwise. Conversation search: apps/worker/src/index.ts:790 GET /api/projects/:id/search goes through withOwnedProject and forwards to the project's own D
- [✓] Export permission enforcement
      · Three export paths, each gated, one of them with a test written specifically for this risk. Transcript export: apps/worker/src/index.ts:1171 GET /api/projects/:id/export goes through withOwnedProject (owner-only, not member-readable) and ap
- [~] Background job permission enforcement
      · THIS IS THE DEAD-CODE CASE. A run is admitted with a capability check — apps/worker/src/do/session.ts:1414 mayNot('chat') and :1530 mayNot('build') on the socket — and then never re-checked: the loop is alarm-driven (session.ts:1764 async a
      → Wire the module that already exists. (1) In apps/worker/src/do/session.ts, record the initiator when a run starts: add initiatedBy (from beatOf(ws).userId at the 'chat' branch, session.ts:1414) and initiatorExpiresAt to the persisted AgentState. (2) In session.ts:1764 alarm(), immediately after the 
- [~] Automated multi-tenant isolation verification
      · Two automated suites exist and one of them is not automatic. IN CI (`pnpm -r test`, .github/workflows/ci.yml:86): packages/evals/src/security.test.mjs A3 section (lines 1117-1316) and apps/worker/tests/collab-routes.test.mjs:238 both bundle
      → Two changes to close it. (1) Coverage: in infra/supabase/tests/rls-isolation.mjs extend the SEED (line ~78) with a third tenant who holds a project_members grant on Alice's project, and add checks that a member sees Alice's project/messages/checkpoints but not Bob's, that a member cannot read anothe

## 10. PROJECT MANAGEMENT  —  33%   ✓2 ~9 ☐9

- [~] Project creation from an empty workspace
      · apps/web/src/routes/dashboard.tsx:158 CreateProjectModal inserts into Supabase `projects` (dashboard.tsx:171) and navigates to /projects/:id; reachable three ways — the empty state at dashboard.tsx:526-537 (`state="noProjects"` with a 'Summ
      · REFUTED: The repo evidence is accurate (CreateProjectModal at /Users/moshe/Desktop/RbxAI/apps/web/src/routes/dashboard.tsx:158, insert at :171, noProjects empty state at :526-537, header button :465, useProvideNewProject :415, sh
- [☐] Project creation from a template
      · No template concept anywhere. Grepped apps/web/src, apps/worker/src, apps/site/src and packages/shared for 'template', 'starter project', 'seed project', 'blank project', 'from a template': the only product hits are apps/site/src/pages/inde
      → Add a template picker to CreateProjectModal in apps/web/src/routes/dashboard.tsx. Define the templates as data in packages/shared (id, label, blurb, genre, seed prompt) rather than as rows, so CI needs no fixtures; on submit, insert the project as today and then seed the first conversation turn with
- [~] Project creation from an existing Studio place
      · The BINDING half is built and tested: apps/worker/src/studio-place.ts decides bind/match/mismatch/unverified, the plugin sends placeId/gameId/placeName at claim time (apps/plugin/src/init.server.luau:406-421), and apps/worker/tests/studio-l
      → Two parts, both in the worker. (1) In apps/worker/src/do/session.ts, wherever placeAdmission returns verdict 'bind' or a changed 'match' (search for `boundPlace` and the existing PATCH at line 2588), extend the best-effort Supabase PATCH to also set place_name and place_id from the admitted StudioPl
- [~] Project naming and description
      · NAMING is complete and tested: one shared hook, apps/web/src/lib/rename-project.ts:28, used by the dashboard card menu (apps/web/src/routes/dashboard.tsx:243) and by the inline workspace title (apps/web/src/routes/workspace.tsx:561, Editabl
      → apps/web/src/routes/dashboard.tsx RenameProjectModal has a Name field only. Add a description textarea to it (maxLength 500, same as the create modal) and extend apps/web/src/lib/rename-project.ts to PATCH `{ name, description }` in one Supabase update — keep the existing isRenameWorthwhile short-ci
- [☐] Project icon and cover image
      · No column, no upload, no render. infra/supabase/migrations/0001_init.sql:13-25 and 0004_project_archive.sql define the projects row with no icon/cover/thumbnail field, and apps/web/src/lib/supabase.ts:26-37 (ProjectRow) and apps/web/src/lib
      → Add `icon text` and `cover_key text` to public.projects in a new infra/supabase/migrations/0007_*.sql (nullable, no default), add both to PROJECT_COLUMNS in apps/web/src/lib/archive.ts and to ProjectRow in apps/web/src/lib/supabase.ts, and render the icon in the card header at apps/web/src/routes/da
- [☐] Project status
      · No project lifecycle status exists. infra/supabase/migrations/0001_init.sql:13-25 has no status column (the only `status` check constraint in the schema is on public.feedback, line ~72). Grepped apps/web/src, apps/worker/src and infra for '
      → Decide what the statuses mean before adding a column, then add `status text not null default 'building' check (status in ('building','paused','shipped'))` to public.projects in a new infra/supabase/migrations file, surface it as a select in the dashboard card menu (apps/web/src/routes/dashboard.tsx 
- [✓] Project ownership
      · public.projects.owner_id references profiles with RLS (infra/supabase/migrations/0001_init.sql:15), and ownership is asserted in the QUERY rather than left to RLS: apps/worker/src/supa.ts:77-88 getOwnedProject filters `owner_id=eq.<jwt sub>
- [~] Project membership
      · THE SERVER HALF IS DONE AND WELL TESTED — invite/role-change (apps/worker/src/index.ts:3852), bulk invite (:3920), remove (:3985), suspend (:4047), reactivate (:4107), roster with filters and paging (:3677), audit events (:3723), share link
      → Mount the existing panel. In apps/web/src/routes/workspace.tsx: add 'members' to both the Drawer and DrawerName unions (lines 71-72); add a useQuery keyed ['access', projectId] calling fetchProjectAccess from apps/web/src/lib/api.ts and pass its result through normaliseAccess (apps/web/src/lib/capab
- [~] Project permission settings
      · The model and its enforcement are complete server-side: roles and actions in apps/worker/src/collab.ts, an effective-permissions answer at GET /api/shared/:id/permissions (apps/worker/src/index.ts:4336) and GET /api/shared/:id (:3623), test
      → Two concrete pieces. (1) Write apps/web/tests/capabilities.test.mjs — the test capabilities.ts:17 already claims exists: esbuild-bundle apps/web/src/lib/capabilities.ts and apps/worker/src/collab.ts and assert COLLAB_ROLES/COLLAB_ACTIONS are identical sets and that `allows()` agrees with the worker'
- [☐] Project tags
      · Searched for a tag concept on projects and found none: no tag column in infra/supabase/migrations/*.sql (grepped all four migrations for 'tag' — zero hits); PROJECT_COLUMNS (apps/web/src/lib/archive.ts:13-14) and ProjectRow (apps/web/src/li
      → Add `tags text[] not null default '{}'` to public.projects in a new infra/supabase/migrations/0007_*.sql with a GIN index, add it to PROJECT_COLUMNS in apps/web/src/lib/archive.ts and ProjectRow in apps/web/src/lib/supabase.ts, render the tags as pills in the card meta row at apps/web/src/routes/das
- [☐] Project folders
      · There is no way to group projects. The dashboard renders one flat card grid (apps/web/src/routes/dashboard.tsx:539-570) and the sidebar one flat recent list capped at 20 (apps/web/src/components/layout.tsx:40-53); neither has a grouping con
      → If this is wanted, it is cheaper as a saved filter than as a hierarchy: implement 'Project tags' first, then add a tag rail to apps/web/src/routes/dashboard.tsx alongside the existing Active/Archived scope tabs (dashboard.tsx:469-491) that narrows the grid. A real folder needs a `folder_id uuid refe
- [☐] Project favorites
      · Nothing. Grepped apps/web/src, apps/worker/src, apps/site/src and packages/shared for 'favorite', 'favourite', 'starred', 'pinned project' — one hit repo-wide, apps/worker/src/roadmap.ts:1184, which is milestone prose ('Players find a favou
      → Add `favorited_at timestamptz` to public.projects in a new infra/supabase/migrations/0007_*.sql (nullable timestamp, not a boolean — the same reasoning 0004_project_archive.sql gives for archived_at), add it to PROJECT_COLUMNS in apps/web/src/lib/archive.ts, add a star toggle to the project card in 
- [☐] Project duplication
      · No duplicate/clone path for a project. Grepped apps/web/src, apps/worker/src and infra for 'duplicate', 'clone project', 'copy project', 'fork project': the only real hit is DUPLICATING A FILE inside one project's workspace store (apps/web/
      → Add POST /api/projects/:id/duplicate to apps/worker/src/index.ts guarded by withOwnedProject: insert a new projects row copying name (suffixed 'copy'), description and memory_summary/memory_facts, then have the new project's SessionDO seed itself from the source DO's stored memory and workspace KV p
- [☐] Project transfer between workspaces
      · Nothing is built and nothing can be: there is no workspace or organization level in the schema. infra/supabase/migrations/0001_init.sql defines a flat profiles -> projects(owner_id) model, and docs/design/TENANCY.md lays out the three optio
      → No product work — the owner dropped organizations and workspaces. Record the decision where the doc expects it: append a dated 'Decision: option 3, single-user with per-project sharing' section to docs/design/TENANCY.md (which currently ends at the three open options) so the 73 '✗' checklist lines t
- [~] Project archive and restore
      · Schema: infra/supabase/migrations/0004_project_archive.sql adds a nullable archived_at plus two partial indexes. Worker: none needed — the write is a plain RLS-scoped update (apps/web/src/routes/dashboard.tsx:376-384) and the migration says
      · REFUTED: Repository-only, and worse than inert — it is the thing that broke the dashboard. The schema change lives in infra/supabase/migrations/0004_project_archive.sql, and that migration has never been run against the live data
- [✓] Project export
      · Route: GET /api/projects/:id/export at apps/worker/src/index.ts:1171, owner-gated through withOwnedProject, serving Markdown or JSON from one payload with a safe Content-Disposition filename (apps/worker/src/export.ts). UI: the card menu's 
- [☐] Project deletion recovery
      · Deletion is immediate and total, by design, with no recovery window. apps/web/src/routes/dashboard.tsx:298-336 purges the session DO (POST /api/projects/:id/purge, apps/worker/src/index.ts:1381) and then hard-deletes the row (`supabase.from
      → Make project deletion a two-stage soft delete mirroring the file trash. Add `deleted_at timestamptz` to public.projects in a new infra/supabase/migrations/0007_*.sql, exclude non-null deleted_at from both list queries (apps/web/src/routes/dashboard.tsx:33 fetchProjects and apps/web/src/components/la
- [~] Project connection inventory
      · The inventory EXISTS in the worker and is tested, and no UI can reach it. GET /api/projects/:id/studio/diagnostics (apps/worker/src/index.ts:1451) forwards to apps/worker/src/do/session.ts:1239, which returns the link summary, pairedAt, pai
      → Add `fetchStudioDiagnostics(projectId)`, `disconnectStudio(projectId)` and `rebindPlace(projectId)` to apps/web/src/lib/api.ts (GET /api/projects/:id/studio/diagnostics, POST .../studio/disconnect, POST .../studio/place/rebind) and render them in apps/web/src/components/pairing-dialog.tsx, which is 
- [~] Project resource inventory
      · The worker computes a real inventory of what is in the project and the UI deliberately drops it. apps/worker/src/roadmap.ts ROADMAP_SCAN_LUAU (line 37) walks the place in one round trip and analyzeProject produces ProjectSystems (roadmap.ts
      → Render the inventory that is already on the wire. In apps/web/src/components/roadmap/model.ts add the `shape` fields the view needs (scale.instances/parts/scripts, systems.serverScripts/clientScripts/moduleScripts/guis/zones/currencies, limits) to the response type, and add a 'What is in this place'
- [~] Project activity timeline
      · Two reachable surfaces. Per-run: apps/web/src/components/ws/activity.tsx renders the grouped step timeline built by apps/web/src/components/ws/activity-model.ts, mounted via thinking.tsx:94 (`{stage.actions && <Activity run={activity} evide
      · REFUTED: The code is real; the ITEM is not what the code does. The per-run surface checks out — apps/web/src/components/ws/activity.tsx is mounted at thinking.tsx:94 inside turn.tsx:185, rendered by workspace.tsx:712, and activit

## 05. ONBOARDING AND ACTIVATION  —  57%   ✓8 ~7 ☐5

- [✓] First-use welcome flow
      · apps/web/src/components/layout.tsx:376 mounts `<OnboardingTour done={{ hasProject: hasProjects }} />` inside the Shell that wraps every signed-in route (apps/web/src/app.tsx:101-128), gated on layout.tsx:289 `knowsProjects = navProjects.isS
- [☐] Intended-use selection
      · Nothing asks a new user what they intend to build. Searched: apps/web/src/routes/auth-pages.tsx (signup is email + password, then `navigate('/', { replace: true })` at :270 — no questions); apps/web/src/lib/onboarding.ts (TourStep at :24-33
      → Add a one-question intent card to the first-run dashboard: create apps/web/src/components/onboarding-intent.tsx and render it from apps/web/src/routes/dashboard.tsx beside the `state="noProjects"` EmptyState at :526-536 (same condition: projects.isSuccess && data.length === 0 && scope === 'active').
- [☐] Individual or team setup
      · No individual-vs-team choice exists in any onboarding path. Searched apps/web/src/routes/auth-pages.tsx, apps/web/src/routes/dashboard.tsx, apps/web/src/lib/onboarding.ts and the worker router. Collaboration itself is real and reachable — p
      → Do not build a tenancy choice (docs/design/TENANCY.md rules it out). Build the per-project invite nudge instead: add a `data-tour="members"` attribute to the members-drawer trigger in apps/web/src/routes/workspace.tsx and a sixth step to TOUR_STEPS in apps/web/src/lib/onboarding.ts anchored at it ('
- [☐] Organization creation during onboarding
      · Deliberately out of scope, and genuinely absent. docs/design/TENANCY.md records the owner's 2026-09-15 decision (option 3: single-user with per-project sharing; 77 checklist items move to not-planned). Confirmed by looking: no onboarding su
      → No work planned; leave it. If the owner ever reverses the TENANCY.md decision, the onboarding half is the last step, not the first: organizations would need real rows in infra/supabase/migrations and RLS rewritten before any signup screen could offer to create one.
- [☐] Workspace creation during onboarding
      · Same decision and same verification as the previous item: docs/design/TENANCY.md, option 3 chosen 2026-09-15. Nothing in apps/web/src offers to create a workspace. Note the trap TENANCY.md flags for whoever reads this later: `workspace` alr
      → No work planned; leave it. If it is ever revived, pick a distinct identifier (tenantWorkspace) before writing a line, per the naming-collision section of docs/design/TENANCY.md.
- [✓] First project creation
      · The first-project path is complete and reachable four ways. Empty shelf: apps/web/src/routes/dashboard.tsx:526-536 renders EmptyState `state="noProjects"` ('Summon your first project') with a 'Summon a project' button. Dialog and write: Cre
- [☐] Sample project selection
      · Nothing lets a user start from a sample or template. Searched apps/web/src for template/starter/sample/preset — the only hit is a literal demo string in apps/web/src/routes/ui-lab.tsx:409 ('"Sample project" archived' in a toast specimen). a
      → Add starters to the create path: define 3-4 starters in a new apps/web/src/lib/starters.ts (id, name, one-line description, and the opening prompt text — reuse the shape of SUGGESTIONS at apps/web/src/routes/workspace.tsx:58), render them as selectable cards inside CreateProjectModal (apps/web/src/r
- [~] Roblox Studio prerequisite check
      · The checks that exist are all AFTER pairing, and they are real: the plugin reports version and protocol on every request (apps/worker/src/index.ts:1653-1655 at claim, headers read per-poll), admission is decided by protocol in apps/worker/s
      → Two concrete changes. (1) apps/web/src/components/ws/connect-studio.tsx renders three steps with no prerequisites line; add a short 'Before you start' line above the <ol> at :68 stating what is needed (Roblox Studio installed and the place open and saved), phrased as requirements, never as detected 
- [✓] Studio plugin installation guidance
      · In-app: apps/web/src/components/ws/connect-studio.tsx:69-82 is step 1 of the connect block with an Install button whose href comes from STUDIO_PLUGIN_INSTALL_HREF; apps/web/src/routes/dashboard.tsx:570-597 repeats it in the shelf footer; ap
- [✓] Studio pairing walkthrough
      · End-to-end and reachable. Web: apps/web/src/components/ws/connect-studio.tsx:83-91 ('Pair your project' → Enter pairing code) opens apps/web/src/components/pairing-dialog.tsx, which mints a code (createPairingCode, apps/web/src/lib/api.ts:4
- [~] Connection troubleshooting guidance
      · Two layers, both real. In-app, contextual: apps/web/src/lib/studio-connection.ts:143-163 (linkDetail) produces the one sentence under the connection pill — place mismatch outranks everything and names both places and the remedy (:144-149), 
      · REFUTED: REFUTED — the in-app layer is dead code. `grep -rn linkDetail` over the whole repo returns exactly two files: the definition at /Users/moshe/Desktop/RbxAI/apps/web/src/lib/studio-connection.ts:143 and the test at apps/we
- [~] First successful AI request
      · The checklist's cited evidence (apps/web/tests/connectivity.test.mjs) is a keyword false positive — that file is about offline detection. The real thing: the empty conversation guides the first request with three one-tap seeds (apps/web/src
      · REFUTED: REFUTED. The pieces cited are real — SUGGESTIONS at workspace.tsx:58-62, the noConversation EmptyState with three seed buttons at :691-716 (claim said 690-705), setSeed at :105 handed to Composer at :798, composer.tsx:10
- [~] First proposed Studio change
      · There is no propose-then-approve step for Studio edits anywhere in the product: in Agent mode the tools write straight into the paired place, wrapped in a checkpoint and a ChangeHistoryService recording (apps/plugin/src/Ops.luau:1241-1261),
      → Cheapest honest version, no new subsystem: after the first agent run in a project, show a one-time explanatory card above the turn in apps/web/src/components/ws/turn.tsx (or as a sixth TOUR_STEP in apps/web/src/lib/onboarding.ts anchored at a new data-tour="evidence" on the first evidence card in ap
- [~] First change approval
      · The checklist's cited evidence (apps/worker/tests/collab-threads.test.mjs) is a false positive for this section: that is code-review-style approval BETWEEN COLLABORATORS on a shared project (apps/worker/src/collab-threads.ts:347 'approved r
      → Wire the memory-proposal review UI: add fetch + accept/discard helpers to apps/web/src/lib/api.ts calling POST /api/projects/<id>/memory/suggestions (body shape per apps/worker/src/do/session.ts's /memory/suggestions handler), and render the pending list with Accept/Discard buttons at the top of app
- [~] First verified Studio operation
      · Verification is built and wired: five verifier tools offered to the agent (check_composition, audit_build, run_spec, run_and_check, inspect_visually) with the choice between them pinned by apps/worker/tests/verification-tools.test.mjs:39 'a
      → Add a sixth step to TOUR_STEPS in apps/web/src/lib/onboarding.ts anchored at a new data-tour="evidence" attribute on the card wrapper in apps/web/src/components/ws/evidence-cards.tsx, body explaining that Apple proves its work by running the place rather than asserting success, with satisfiedBy: 'ha
- [~] First undo demonstration
      · Undo itself is genuinely there: every agent op is wrapped in a ChangeHistoryService recording so Ctrl+Z reverses a whole batch natively (apps/plugin/src/Ops.luau:3-4, :1241-1261, waypoint at :1163), and checkpoints give the heavier rewind (
      → After the first run that executed at least one mutating Studio op, show a one-time line in the workspace — simplest home is beside the checkpoint chip in apps/web/src/components/ws/turn.tsx — reading that the whole batch is a single Studio undo (Ctrl+Z / ⌘Z) and that a checkpoint was taken before it
- [✓] Initial usage allowance explanation
      · Explained at first use in the rail, on its own page, and in the tour. Rail meter: apps/web/src/components/usage-meter.tsx:33-60 draws two bands (renewable allowance vs purchased credits) and prints '<n> Credits left today' with 'of <total> 
- [✓] Onboarding progress persistence
      · apps/web/src/lib/onboarding.ts:128-163: progress is stored under TOUR_KEY 'apple.tour.v1' and read back defensively — a non-object, an array, a truncated blob or a hand-written {"dismissed":"yes"} all yield a fresh start instead of a spread
- [✓] Skip and resume onboarding
      · Skip: the card's 'Skip the tour' button and Escape both call dismissTour, and Escape is suppressed while a modal owns it so one keystroke never does two things (apps/web/src/components/onboarding-tour.tsx:100-120, :182-184); dismissTour at 
- [✓] Contextual next-step guidance
      · Guidance is derived per surface rather than generic. Canonical states with a next action, one vocabulary: apps/web/src/components/empty-state-model.ts:53-112 (M01 'Summon your first project', M02 'Nothing said yet', M04/M05 for Studio), tes

## 01. PUBLIC WEBSITE AND PRODUCT DISCOVERY  —  68%   ✓9 ~9 ☐2

- [✓] Clear product positioning
      · apps/site/src/pages/index.astro:232-246 ships the badge ("Works inside Roblox Studio"), the single h1 ("It works inside the place you already have open.") and the sub-head naming what it does; the title/description are at index.astro:199-20
- [☐] Audience-specific landing pages
      · Searched every route the site has — apps/site/src/pages holds 7 top-level pages plus 11 under docs/, and apps/site/dist/sitemap-0.xml lists exactly those 17 URLs; there is no /for/*, /solo, /studios or equivalent. Grepped docs/ and apps/sit
      → Create per-audience entry pages under apps/site/src/pages/for/ (e.g. solo-creator.astro, studio-team.astro, learning-to-script.astro) using apps/site/src/layouts/Base.astro so they inherit Nav/Footer. Each needs its own h1, three to five capability points drawn from that audience's job, and a CTA to
- [~] Product capability overview
      · The overview half exists: apps/site/src/pages/index.astro:297-378 (#product, a named-steps run panel) and :380-417 (#modes, three cards each with a 'does' list), plus apps/site/src/pages/docs/modes.astro and the capability rows of PLAN_FEAT
      → Add apps/site/src/pages/docs/capabilities.astro (DocsLayout, added to the 'Using Apple' group in apps/site/src/layouts/DocsLayout.astro:31-37 so it is not an orphan) grouping the tool families in apps/worker/src/tools.ts into reader-facing capabilities: build and edit, scripts, assets and licensing,
- [~] Interactive product walkthrough
      · A real interactive walkthrough exists but no public visitor can reach it: apps/web/src/components/onboarding-tour.tsx, driven by TOUR_STEPS in apps/web/src/lib/onboarding.ts:42, mounted at apps/web/src/components/layout.tsx:376 — which is i
      → Build a click-through demo on the marketing site — e.g. apps/site/src/components/Walkthrough.astro rendered into a new #walkthrough section of apps/site/src/pages/index.astro: three to five steps (prompt -> named tool steps -> checkpoint -> playtest) advanced by real buttons, using the same still-fr
- [☐] Working sample projects
      · Nothing anywhere lets a visitor or a new user open a prepared project. Searched: apps/site/src (no /examples, /showcase, /templates route; sitemap-0.xml confirms 17 routes), apps/web/src (project creation has no template picker; the only 's
      → Create a small curated set of starter places and a way to start from one. Minimum: a seed file (e.g. packages/corpus/seeds/starter-projects.json) with 3-5 entries, each holding a name, a one-line description, the prompt sequence that builds it and the expected instance counts; a worker route POST /a
- [✓] Roblox Studio integration overview
      · apps/site/src/pages/docs/plugin.astro covers the two-step Creator Store install, Studio's per-plugin network permission prompt, removal, and a 'What it can and cannot do' boundary list at line 107-118; apps/site/src/pages/docs/connect.astro
- [✓] Supported workflow documentation
      · The whole signup-to-first-build workflow is documented and reachable: apps/site/src/pages/docs/getting-started.astro (six numbered steps), docs/connect.astro, docs/modes.astro (when to use each mode), docs/updating.astro, docs/troubleshooti
- [✓] Transparent capability limitations
      · apps/site/src/pages/docs/plugin.astro:107-118 states plainly what the plugin cannot do (no local files, no unconnected places, cannot run with Studio closed, cannot publish your game); plugin.astro:46-56 renders a 'Not available yet' callou
- [✓] Public pricing page
      · apps/site/src/pages/pricing.astro (519 lines) — plan cards, comparison table, credit calculator and a limits FAQ — builds to apps/site/dist/pricing/index.html and is deployed into the worker's D1 static store by infra/deploy-static.mjs. Eve
- [~] Plan comparison table
      · apps/site/src/pages/pricing.astro:177-245 renders a real table: PLAN_FEATURES (packages/shared/src/index.ts:1469-1530 — price, credits/day, credits/month, builds/month, all three modes, unlimited projects, checkpoints, plugin, sharing, buy 
      · REFUTED: REFUTED on deployment. The table is real in source (pricing.astro:177-245 driven by PLAN_FEATURES at packages/shared/src/index.ts:1469-1530, with the visually-hidden caption and Included/Not included text, exactly as des
- [~] Usage and credit explanation
      · The explanation is built and mostly derived: apps/site/src/pages/docs/credits-and-limits.astro reads PLAN_LIMITS (lines 2-6) for the numbers, explains metering, the midnight-UTC reset and what happens at zero; apps/site/src/pages/pricing.as
      → In apps/site/src/pages/docs/getting-started.astro, import PLAN_LIMITS from '@golem/shared' and replace the two hardcoded '60 Credits' strings (lines 19 and 88) with {PLAN_LIMITS.free.creditsPerDay}, the way apps/site/src/pages/docs/credits-and-limits.astro already does. Delete or rewrite the 'When d
- [✓] Frequently asked questions
      · apps/site/src/pages/docs/faq.astro holds ten questions (plugin source, the retired .rbxm, scripting knowledge, Studio versions, publishing, Team Create, closing Studio mid-build, undoing a change, API availability, reporting bugs) rendered 
- [~] Searchable documentation entry point
      · The entry point is real: apps/site/src/pages/docs/index.astro is a curated overview grouped Start here / Using Apple / Keeping it working / Trust / For developers, and apps/site/src/layouts/DocsLayout.astro:14-49 puts every one of the eleve
      → Add a client-side search to apps/site/src/layouts/DocsLayout.astro: generate a JSON index at build time from the eleven pages under apps/site/src/pages/docs (title, headings, first paragraph, href) into apps/site/public/docs-index.json, and render an input above the sidebar that filters it and links
- [✓] Public changelog
      · apps/site/src/pages/changelog.astro (256 lines) carries dated releases — v0.2 'One model, measured' (2026-08-30) with engine, spend-control and context sections, and v0.1 — built to apps/site/dist/changelog/index.html. Linked from apps/site
- [✓] Public service status page
      · apps/site/src/pages/status.astro is a working status page, not a placeholder: its script (lines 238-316) fetches /api/health with cache: 'no-store' and a 10s abort, polls every 30s with a visible countdown, offers a 'Check now' button, dist
- [~] Security and privacy overview
      · Both surfaces exist and are substantial: apps/site/src/pages/privacy.astro (what is collected, what is deliberately not, the never-trained-on promise, processors, retention, deletion, rights, children, a Security section on TLS and scoped s
      → Edit apps/site/src/pages/privacy.astro: delete the 'No payment details' bullet at line 38, add Stripe to the 'Who processes your data' list at lines 52-55 saying it handles checkout, subscription state and invoices and that card numbers reach Stripe and never this service, and add a short 'Billing d
- [~] Contact and support options
      · One published channel exists and is wired on most pages: apps/site/src/components/Footer.astro:47 (Contact -> mailto:apple.labs.app@gmail.com), the docs footer at apps/site/src/layouts/DocsLayout.astro:96-99, apps/site/src/pages/status.astr
      → Add a Contact link (mailto:apple.labs.app@gmail.com) and a Status link (/status) to the landing footer nav in apps/site/src/pages/index.astro:512-520 so they sit alongside Privacy and Terms. Change the Enterprise CTA at apps/web/src/components/plans.tsx:138 to the same address the site publishes, or
- [✓] Accessible registration entry points
      · Registration is reachable from the hero (apps/site/src/pages/index.astro:249 'Start building — free' -> /app/signup), the header (:222), the pricing section cards (:490) and the free plan card on /pricing (apps/site/src/pages/pricing.astro:
- [~] Mobile-friendly public pages
      · Both layouts emit the viewport meta (apps/site/src/layouts/Base.astro:29, Landing.astro:45) and every component carries real breakpoints (Nav.astro burger menu at max-width 940px, DocsLayout.astro:258 collapses the sidebar into a <details> 
      · REFUTED: REFUTED: the proof the claim cites is red on mobile-specific defects. The static parts check out — viewport meta at Base.astro:29 and Landing.astro:45, breakpoints at Nav.astro:284 (940px), DocsLayout.astro:259 (900px), 
- [~] Accurate product screenshots and demonstrations
      · There are demonstrations but no screenshots, and the demonstration that ships is failing its own guards. apps/site/public holds only icons and og.png — no product imagery — and grep finds no <img> or <video> of the product anywhere in apps/
      → Decide and record which way this goes, then make the page and the spec agree. Either (a) keep apps/site/src/components/BuildStage.astro and update tests/e2e/landing.spec.ts:227-236 to allow the pinned three.js CDN script and one canvas — and raise the .bs__step colour in that component's <style> unt

## 13. ROBLOX STUDIO INSTALLATION AND PAIRING  —  70%   ✓11 ~6 ☐3

- [~] Verified plugin installation entry point
      · The entry point exists, is single-sourced and is test-guarded: packages/shared/src/index.ts:1268 STUDIO_PLUGIN_INSTALL_HREF, consumed by apps/web/src/components/ws/connect-studio.tsx:74, apps/web/src/components/pairing-dialog.tsx:134, apps/
      → Two steps, in order. (1) Human action outside the repo: in the Roblox Creator Dashboard, Development Items -> Configure asset 132128477945417 -> Distribution -> enable 'Distribute on Creator Store'. (2) Re-probe with `curl -s -o /dev/null -w '%{http_code}\n' "https://apis.roblox.com/toolbox-service/
- [✓] Supported Studio version guidance
      · apps/site/src/pages/docs/faq.astro:19-21 — 'Which Roblox Studio versions are supported?' answers 'Current production Roblox Studio on Windows and macOS… the plugin uses only stable, documented Studio APIs'. Served at /docs/faq, linked from 
- [~] Plugin version display
      · Studio half is real and asserted: apps/plugin/src/init.server.luau:235 renders 'Apple v0.2.0 · protocol 1' in the dock, and packages/evals/src/plugin-version.test.mjs:160 fails if that label disappears. Web half is absent: the worker alread
      → Add `fetchStudioLink(projectId)` to apps/web/src/lib/api.ts calling GET /api/projects/${id}/studio/link (returns StudioLinkSummary from @golem/shared), and render `pluginVersion` — with 'unknown' when null, never a blank — in the Studio pill/title at apps/web/src/routes/workspace.tsx:576-586. If you
- [✓] Plugin update availability
      · apps/worker/src/plugin-version.ts:174 clientNotice() is called on every poll at apps/worker/src/do/session.ts:2954 and returned as `client` in the poll response; the plugin renders it at apps/plugin/src/init.server.luau:267 applyClientNotic
- [✓] Plugin compatibility validation
      · apps/worker/src/plugin-version.ts:155 pluginCompatibility() gates on PROTOCOL only, and the gate actually blocks: apps/worker/src/do/session.ts:2961-2964 short-circuits an incompatible client with `{ ops: [], waitMs: 5000, client: notice }`
- [✓] Secure pairing code generation
      · apps/worker/src/do/pairing.ts:31 newPairingCode() uses rejection sampling (bytes >= 248 discarded) over a 31-char confusable-free alphabet, giving a flat draw over 31^6. Proven by apps/worker/tests/pairing.test.mjs:119 'CODES ARE DRAWN UNIF
- [✓] Short-lived pairing codes
      · apps/worker/src/do/pairing.ts:12 TTL_MS = 10 minutes; enforced on claim at pairing.ts:79, swept by a storage alarm at pairing.ts:66 and pairing.ts:110. The expiry is handed to the UI as `expiresAtIso` (pairing.ts:68) and rendered as a live 
- [✓] Single-use pairing codes
      · apps/worker/src/do/pairing.ts:80 deletes the key inside /claim before returning the binding. Test: apps/worker/tests/pairing.test.mjs:76 'a code is SINGLE USE' (the checklist's cited web test about surrogate pairs is unrelated and was a fal
- [✓] Pairing confirmation in the web application
      · Three surfaces, all driven by the live `studio_status` signal rather than by having shown a code: apps/web/src/components/pairing-dialog.tsx:75-82 swaps to a green 'Studio connected' panel, apps/web/src/routes/workspace.tsx:387-389 raises a
- [✓] Pairing confirmation inside Studio
      · apps/plugin/src/init.server.luau:388-390 sets the dock to green 'Connected · <project>' and reveals the project label on a successful claim; init.server.luau:430-434 appends '· Place: <placeName>' using the binding the server confirmed back
- [☐] Explicit organization selection during pairing
      · There is no organization entity anywhere. Searched apps/worker/src (no org table, no org route in index.ts), infra/supabase/migrations/0001_init.sql (schema is flat: profiles -> projects -> messages/checkpoints/usage_events/studio_pairings)
      → Do not build this. The owner cancelled organizations (docs/design/TENANCY.md); the correct action is to strike this line from docs/backlog/CHECKLIST-V2.md section 13 along with the other 76 organization/workspace/seat items, rather than to leave it reading as unfinished work.
- [✓] Explicit project selection during pairing
      · Selection is by context and is confirmed on both ends rather than guessed. The code is minted only from inside one project — apps/worker/src/index.ts:1386 POST /api/projects/:id/pairing, body scoped to ctx.project.id/ctx.user.userId (index.
- [✓] Place identity confirmation
      · apps/worker/src/studio-place.ts:110-135 placeAdmission decides bind/match/mismatch/unverified, with the rule that an unidentifiable place (placeId 0) is never a mismatch. It is called at pairing time (apps/worker/src/do/session.ts:864-868, 
- [~] Duplicate pairing detection
      · Server half is built and tested; the UI half that the server was built for does not exist. apps/worker/src/index.ts:1396-1417 reads the existing link after minting and returns it as PairingCodeDto.existingLink (packages/shared/src/index.ts:
      → In apps/web/src/components/pairing-dialog.tsx, after the code box (around line 116) render `pairing.existingLink` when it is non-null: a warning line naming existingLink.place?.placeName and the lastSeenAt, e.g. 'This project is already paired to <place>. Using a new code will disconnect it.' Treat 
- [✓] Pairing expiration recovery
      · Both clocks recover. Code expiry (10 min): apps/web/src/components/pairing-dialog.tsx:68 derives `expired` from countdownTo returning null and :101-106 replaces the code with a 'Generate a new code' button that re-mints. Token expiry (30 da
- [~] Pairing cancellation
      · Worker built and well tested; nothing calls it. apps/worker/src/do/pairing.ts:96-108 /cancel checks the code against the minting user and answers identically for absent/expired/other-user so it cannot be used as an oracle; apps/worker/src/i
      → Add `cancelPairingCode(projectId, code)` to apps/web/src/lib/api.ts POSTing {code} to /api/projects/${id}/pairing/cancel, then call it from apps/web/src/components/pairing-dialog.tsx in two places: in the `mint` callback (line 40) before minting a replacement when `pairing` is already set, and in a 
- [☐] Paired installation inventory
      · There is no list of paired installations anywhere, and the two places that look like one are dead. (a) apps/web/src/routes/dashboard.tsx:562-567 renders a per-project place pill or 'Not linked' from projects.place_name — but grep for place_
      → Cheapest honest version: at claim time in apps/worker/src/index.ts (after the /plugin/register call around line 1665), PATCH the project row via supaRest with the bound place — `place_name` and `place_id` from the `bound` place — and clear both in the /api/projects/:id/studio/disconnect handler at i
- [☐] Installation rename
      · No installation entity exists to rename. The pairing record is apps/worker/src/do/session.ts:851-856 (pluginTokenHash, pluginTokenIssuedAt) plus pluginClient (version/protocol, session.ts:2925) and pluginPlace; StudioLinkSummary (packages/s
      → Only worth building after 'Paired installation inventory' exists. Then: add `label: string | null` to StudioLinkSummary in packages/shared/src/index.ts:311, persist it under a `pluginLabel` storage key in apps/worker/src/do/session.ts alongside pluginTokenHash, return it from linkSummary (session.ts
- [~] Installation revocation
      · Worker built and tested; no control in any UI. apps/worker/src/do/session.ts:1281-1291 deletes pluginTokenHash/issuedAt/lastSeen/place/superseded, broadcasts studio_status disconnected and releases the parked long-poll; apps/worker/src/inde
      → Add `disconnectStudio(projectId)` to apps/web/src/lib/api.ts POSTing to /api/projects/${id}/studio/disconnect, and put a 'Disconnect Studio' control behind the live topbar pill in apps/web/src/routes/workspace.tsx:575-586 (the pill is currently a non-interactive span when connected). Confirm before 
- [~] Plugin removal and disconnect guidance
      · The guidance exists and is reachable: apps/site/src/pages/docs/plugin.astro:121-127 'Removing it', apps/site/src/pages/docs/connect.astro:71-76 'Disconnecting', apps/site/src/pages/docs/troubleshooting.astro:115-117. All three are served un
      → Preferred: ship the Disconnect Studio control described under 'Installation revocation' (apps/web/src/routes/workspace.tsx:575-586), which makes all three pages true with no copy change. If it is not being built this cycle, instead delete the phrase 'or disconnect from the web workspace' from apps/s

## 11. APPLICATION SHELL AND NAVIGATION  —  57%   ✓7 ~9 ☐4

- [~] Persistent application navigation
      · The shell is genuinely persistent on desktop: apps/web/src/app.tsx:105-129 nests every signed-in route under <AppLayout/>, which renders <Rail/> + <Outlet/> (apps/web/src/components/layout.tsx:357-370), and apps/web/tests/command-palette.te
      → Move the hamburger out of apps/web/src/routes/workspace.tsx:548-556 into the shell. In apps/web/src/components/layout.tsx, render a `<button className="gx-icon-btn gx-rail-toggle" onClick={openRail} aria-label="Open navigation">` inside <main id="main-content"> (or a thin shell-owned header above <O
- [☐] Organization and workspace context display
      · Nothing to display: docs/design/TENANCY.md records that the schema is flat (public.profiles -> public.projects.owner_id) with no organization or workspace table, and that the owner chose a single-user product with per-project sharing. I con
      → Nothing should be built unless tenancy is revived. If it ever is, the display belongs in apps/web/src/components/layout.tsx above the wordmark (a switcher button feeding the same ShellProvider in apps/web/src/lib/shell.tsx), and it must be preceded by the schema work described in docs/design/TENANCY
- [✓] Project context display
      · apps/web/src/routes/workspace.tsx:547-662 is a real context header a person reaches at /app/projects/:id: an in-place renamable title (EditableProjectTitle, :558), the last-activity time with a full timestamp on hover (:562-566), a live Stu
- [~] Breadcrumb navigation
      · A real breadcrumb trail is implemented — apps/web/src/components/ws/files-model.ts:117-127 builds crumbs from a storage prefix and apps/web/src/components/ws/files-panel.tsx:126-145 renders them inside <nav aria-label="Folder"> with aria-cu
      → Two separate things. (1) Mount the existing FilesPanel: add 'files' to the Drawer union and DRAWERS array at apps/web/src/routes/workspace.tsx:73-75, add a topbar icon button beside the memory/credits buttons (workspace.tsx:600-630) that calls setDrawer('files'), and render `{drawer === 'files' && <
- [~] Stable deep links
      · Resource URLs are stable and survive a cold load: apps/web/src/app.tsx:101-104 keys routes on the project id (/projects/:id, /projects/:id/roadmap) and apps/worker/src/static.ts:65-72 serves /app/index.html for any unmatched /app/* path, so
      → Three edits. (1) In apps/web/src/lib/error-taxonomy.ts change href '/app/sign-in' -> '/login', '/app' -> '/', '/app/usage' -> '/usage' (they are passed to a <Link> inside basename="/app", which prepends the prefix itself), and update the assertions at apps/web/tests/error-taxonomy.test.mjs:81 and :1
- [✓] Browser back and forward support
      · Standard history navigation works and is handled with care. apps/web/src/app.tsx:58 uses <BrowserRouter basename="/app"> over a real route table (:63-129); every in-app move is a <Link>/navigate, so Back and Forward move between dashboard, 
- [✓] Restorable panel layouts
      · apps/web/src/lib/view-state.ts is the store, and it validates on the way in rather than obeying whatever is in localStorage (readViewChoice checks the value against the set this build can render, :20-27; readViewState requires a normaliser,
- [☐] Resizable panels
      · Nothing resizes. I grepped apps/web/src and apps/web/tests for resiz|splitter|gutter|drag-handle|gx-split and for pointer-driven width changes: the only `resize:` declarations are `resize: vertical` / `resize: none` on textareas (apps/web/s
      → Add a drag handle on the rail's trailing edge. In apps/web/src/components/layout.tsx render a `<div role="separator" aria-orientation="vertical" aria-label="Resize the sidebar">` at the end of <aside className="gx-rail">, drive it with pointerdown/pointermove/pointerup writing a clamped px value (24
- [✓] Collapsible navigation
      · Built end to end. State and persistence: apps/web/src/lib/shell.tsx:57-62 (readCollapsed) and :74-87 (toggleRailCollapsed writes apple.rail.collapsed and survives a storage throw). Control: the panel-left button at apps/web/src/components/l
- [☐] Tabbed project views
      · A project has one lane and four drawers, not tabs — apps/web/src/routes/workspace.tsx:1-7 says so explicitly ('One lane, not three') and :73-75 defines the drawers as a mutually exclusive union opened from topbar buttons. I grepped role="ta
      → If tabbed project views are wanted, give the workspace a tablist in the topbar of apps/web/src/routes/workspace.tsx (beside the title at :558) with tabs Conversation / Roadmap / Files, each a <NavLink> to /projects/:id, /projects/:id/roadmap and a new /projects/:id/files route added to apps/web/src/
- [~] Recently opened resources
      · A recents list exists in the rail and a person reaches it on every route: apps/web/src/components/layout.tsx:40-54 fetches projects and :156-158, :203-222 render up to RAIL_LIMIT (8) of them with a relative time and a 'View all chats' link.
      → Make 'recent' mean opened. Add a `last_opened_at timestamptz` column to public.projects, have apps/web/src/routes/workspace.tsx fire a one-shot PATCH of it when the project query first succeeds (next to the fetchProject useQuery at :115-119), and change fetchRecentProjects in apps/web/src/components
- [☐] Favorite resource shortcuts
      · There is no way to favourite, star, pin or bookmark anything. I grepped favou?rite|pinned|star|bookmark across apps/web/src, apps/worker/src and apps/web/tests: every hit is unrelated — frame pinning in the Studio viewer (apps/web/src/compo
      → Add a `favorited_at timestamptz` column to public.projects. In apps/web/src/routes/dashboard.tsx ProjectMenu (:85-160) add a 'Favourite' / 'Remove favourite' menu item that PATCHes it through supabase alongside the existing rename/archive mutations. In apps/web/src/components/layout.tsx render a 'Fa
- [✓] Global command palette
      · Built, mounted and tested. apps/web/src/components/command-palette.tsx:27-180 is the palette: opened by SHORTCUTS.palette through the shared matcher (:42), a role="listbox"/role="option" list (:137, :159), selection scrolled into view, focu
- [✓] Contextual action menus
      · Per-object overflow menus exist and are reachable. apps/web/src/routes/dashboard.tsx:44-160 ProjectMenu is a kebab button on every project card with aria-haspopup="menu"/aria-expanded, a role="menu" popover, role="menuitem" rows for Rename…
- [~] Unsaved-change navigation protection
      · One class of unsaved work is protected and one is not. Protected: the composer draft, which survives a reload and a route change and is cleared only after the message actually leaves — apps/web/src/lib/draft.ts, with apps/web/tests/draft.te
      → Add a shared guard hook, e.g. apps/web/src/lib/unsaved.ts exporting `useUnsavedGuard(dirty: boolean)` that (a) registers a beforeunload listener while dirty and (b) registers the dirty flag on the ShellProvider context in apps/web/src/lib/shell.tsx so a caller can ask before navigating. Call it from
- [~] Permission-aware navigation
      · The account-level axis is wired and tested; the per-project role axis is not wired at all. Wired: AuthGuard/GuestGuard gate every route and stash the intended path (apps/web/src/lib/auth.tsx:141-155), the post-login return is validated agai
      → Mount the role model. In apps/web/src/routes/workspace.tsx call fetchProjectAccess (apps/web/src/lib/api.ts:539, GET /api/shared/:id) into an AccessState, pass it to a mounted <MembersPanel projectId access> behind a new 'members' drawer (extend the Drawer union at workspace.tsx:73-75 the same way t
- [✓] Not-found pages
      · All three layers exist. In the app: apps/web/src/app.tsx:128 mounts `<Route path="*" element={<NotFoundPage />} />` INSIDE the shell layout route, so a bad /app/* URL keeps the rail and renders apps/web/src/routes/not-found.tsx with an illu
- [~] Access-denied pages
      · One refusal page exists and is reachable — apps/web/src/routes/admin.tsx:357-366 renders 'Nothing here / This area is for Apple operators.' for a signed-in non-admin who types /app/admin — but it has the observation-failure defect this repo
      → Split the two states in apps/web/src/routes/admin.tsx:357-366: render `<Failure error={me.error} onRetry={() => void me.refetch()} />` when me.isError, and keep the 'Nothing here' card only for a profile that actually answered with is_admin !== true. Then add a shared <AccessDenied/> to apps/web/src
- [~] Recoverable application error boundaries
      · Exactly one boundary exists and it does recover: apps/web/src/components/error-boundary.tsx:8-40 catches, shows a crash card with 'Your projects and data are safe' plus the error message, and offers both 'Reload the app' and 'Try to continu
      → Add a second, route-level boundary. Wrap <Outlet/> in apps/web/src/components/layout.tsx:369 in an ErrorBoundary keyed on useLocation().pathname so navigating away clears the crash and the rail and palette survive it; keep the root one in apps/web/src/app.tsx:54 as the last resort. Extend apps/web/s
- [~] Consistent account and settings access
      · On desktop it is genuinely consistent: the AccountMenu sits in the rail foot on every signed-in route (apps/web/src/components/layout.tsx:263, defined :64-147) with the user's name and email, Settings, Usage and Credits, Docs, a theme toggl
      → Same fix as 'Persistent application navigation': move the `.gx-rail-toggle` hamburger from apps/web/src/routes/workspace.tsx:548-556 into apps/web/src/components/layout.tsx so it renders in the shell on every route. Optionally also render a compact avatar button in that shell header that opens the s

## 12. SEARCH AND RESOURCE DISCOVERY  —  65%   ✓11 ~4 ☐5

- [☐] Global resource search
      · The worker has exactly two search routes: apps/worker/src/index.ts:790 (`/api/projects/:id/search`, one project, owner-gated by withOwnedProject) and apps/worker/src/index.ts:2062 (`/api/docs/search`, the Roblox docs RAG corpus). No route f
      → Add a cross-project endpoint `GET /api/search?q=` in apps/worker/src/index.ts beside the existing route at :790: resolve the caller's projects (the same Supabase `projects` rows the dashboard reads), fan out to each session Durable Object's `https://do/search` handler (apps/worker/src/do/session.ts:
- [☐] Organization-scoped search
      · Nothing to scope a search to: `grep -n 'organizations\|workspaces' infra/supabase/migrations/*.sql` returns nothing, and no project row carries an org id (apps/web/src/lib/supabase.ts ProjectRow / PROJECT_COLUMNS). The only org-shaped code 
      → Not planned per docs/design/TENANCY.md (option 3: single-user with per-project sharing). If that decision is ever reversed, this item depends on organizations existing as rows first (a migration under infra/supabase/migrations adding `organizations` and `organization_members`, plus an org id on `pro
- [☐] Workspace-scoped search
      · Same absence as organizations, plus a naming trap: `workspace` in this codebase means the agent's per-project KV FILE STORE (apps/worker/src/workspace-files.ts:94 listWorkspace, apps/worker/src/webtools.ts workspaceFor) and the signed-in ch
      → Not planned per docs/design/TENANCY.md. If reversed, the tenant level must be named something other than `workspace` in code (TENANCY.md suggests `tenantWorkspace`) or the existing file store in apps/worker/src/workspace-files.ts must be renamed first, before any scoped-search work begins.
- [✓] Project-scoped search
      · End to end and reachable. Route: apps/worker/src/index.ts:790 forwards the query string to the session DO; handler: apps/worker/src/do/session.ts:1039, which gathers five record kinds in searchRecords (apps/worker/src/do/session.ts:3157) an
- [~] Conversation search
      · The within-a-conversation half is built and proven: the drawer is literally titled 'Search this conversation' (apps/web/src/routes/workspace.tsx:881), every message row is scanned server-side (apps/worker/src/do/session.ts:3164-3186) and a 
      → Two concrete pieces. (1) Add a filter input above the conversation list in apps/web/src/components/layout.tsx (the Rail, around :156) that filters the fetched project list by name client-side and, when the query exceeds MIN_QUERY, calls the cross-project endpoint proposed for 'Global resource search
- [✓] Message content search
      · Messages are searched server-side over every row, not the pager window: apps/worker/src/do/session.ts:3164 selects `id, role, content, created_at from messages` with the narrowing built by apps/worker/src/search.ts:507, and matching/snippet
- [~] File and artifact search
      · Artifacts yes, files no. Tool steps are indexed as type 'artifact' (apps/worker/src/do/session.ts:3190-3224, title = tool name, body = summary), faceted in the panel (apps/web/src/lib/search-filters.ts:32 TYPE_LABELS.artifact; apps/web/src/
      → Add a 'file' record type: extend SEARCH_TYPES in apps/worker/src/search.ts:115 and the mirror in apps/web/src/lib/search-filters.ts:24 (plus TYPE_LABELS/TYPE_NOUN in search-filters.ts:31 and apps/web/src/components/ws/search-panel.tsx:53), then in apps/worker/src/do/session.ts searchRecords add a bl
- [✓] Asset search
      · Two real search paths, both wired and gated. Curated library: apps/worker/src/tools.ts:2439 search_asset_library backed by a hybrid vector + FTS5 query (apps/worker/src/asset-library.ts:945, ftsSearch at :1031). Creator Store fallback: apps
- [~] Member search
      · The server half is finished and tested; the client half is unreachable. Route: apps/worker/src/index.ts:3677 `GET /api/shared/:id/members` parses `?q=` through parseRosterQuery (apps/worker/src/membership.ts:216) and filters with filterRost
      → Mount the panel: import MembersPanel from '../components/ws/members-panel' in apps/web/src/routes/workspace.tsx and render it inside a drawer the way SearchPanel is rendered at workspace.tsx:881 — add 'members' to the Drawer/DrawerName unions at workspace.tsx:71-73, add a palette command beside the 
- [✓] Activity search
      · The operation log is a first-class search type. Rows are written at apps/worker/src/do/session.ts:2695 and :2883 (`insert into oplog(...)`), gathered as type 'activity' with title = op kind and body = summary at apps/worker/src/do/session.t
- [✓] Search result type filters
      · Five types (apps/worker/src/search.ts:115) parsed from `types=`/`type=` with unknown values REPORTED rather than dropped (parseSearchFilter, apps/worker/src/search.ts:238-262) and re-applied in runSearch (search.ts:427) so the SQL narrowing
- [✓] Search date filters
      · Server: parseSearchDate (apps/worker/src/search.ts:198) accepts `YYYY-MM-DD` as a whole DAY (the `to` edge extends to the last millisecond), full ISO instants and epoch ms, and refuses an unreadable bound as `impossible` instead of dropping
- [~] Search ownership filters
      · An author filter exists and is honest, but it has only two user-facing values and cannot name a person. Server: SEARCH_AUTHORS = you|apple|system with aliases (apps/worker/src/search.ts:124-137), applied in withinFilter (search.ts:414) and 
      → Give messages an author: add an `author_id text` column to the messages table in apps/worker/src/do/session.ts:497 (with the same additive `alter table` pattern used for the oplog `failure` column near :512), populate it on write from the authenticated caller, extend SearchRecord in apps/worker/src/
- [☐] Search tag filters
      · Nothing in the product is tagged, so nothing can filter by tag. SearchFilter carries q/limit/types/authors/from/to/ignored/impossible only (apps/worker/src/search.ts:155-176) and PanelFilter carries types/authors/range/from/to (apps/web/src
      → Tags must exist before they can be filtered. Add a `tags text[]` column (or a `project_tags` table) in a new migration under infra/supabase/migrations, expose editing on the project card in apps/web/src/routes/dashboard.tsx, then add a `tags` dimension to SearchFilter in apps/worker/src/search.ts:15
- [✓] Search result relevance ranking
      · Ranking is a pure, tested function, not an ORDER BY. scoreRecord (apps/worker/src/search.ts:358) weights title over body, whole word over fragment, position, occurrence count and density, and contributes NOTHING for recency; runSearch (sear
- [✓] Search result previews
      · Every hit carries a preview computed server-side: snippetAround (apps/worker/src/search.ts:38) returns a window around the first match with ellipses on cut edges, the offset of the match inside that window, and the total occurrence count; S
- [✓] Search query history
      · apps/web/src/lib/search-history.ts stores up to 8 queries per project in localStorage, keyed `apple.search.history.<projectId>` (readSearchHistory :61, rememberSearch :71, forgetSearch :81, clearAllSearchHistory :96), never throws when stor
- [☐] Saved search views
      · `grep -rn 'savedSearch\|saved_search\|SavedSearch' apps packages` returns nothing, and `grep -n 'saved' apps/web/src/lib/view-state.ts apps/web/src/lib/search-filters.ts apps/web/src/components/ws/search-panel.tsx` returns nothing. What exi
      → Build on the filter serialisation that already exists. Add apps/web/src/lib/saved-searches.ts storing a list of `{id, name, query, filter}` per project under a `apple.search.saved.<projectId>` localStorage key, reusing normaliseFilter (apps/web/src/lib/search-filters.ts:118) to validate on read and 
- [✓] Keyboard-driven result navigation
      · The result list is a real listbox driven from the input: apps/web/src/components/ws/search-panel.tsx:150-168 handles ArrowDown/ArrowUp (wrapping), Enter (open), Home and End, with the selection clamped so it cannot dangle when the list shri
- [✓] Clear empty and unavailable search states
      · Every state is named in copy rather than rendered as an empty list: idle with the 'searches every message, artifact, checkpoint and memory' explainer and a 'keep typing — 2 characters at least' variant (apps/web/src/components/ws/search-pan

## 17. MESSAGE COMPOSER AND ATTACHMENTS  —  85%   ✓16 ~2 ☐2

- [✓] Multiline message input
      · apps/web/src/components/ws/composer.tsx:525 renders a <textarea> (rows=1, maxLength at :552) that auto-grows in the effect at composer.tsx:252-256; apps/web/src/styles/workspace.css gives it min-height 56px / max-height 230px. Line numbers re-read after the attachment pass moved them.
- [✓] Configurable send shortcut
      · The preference is apps/web/src/lib/prefs.ts SEND_KEYS ('enter' | 'mod-enter'); apps/web/src/lib/send-key.ts:47 sendBinding maps it to a Shortcut (composer.tsx:159); the composer matches through the shared matcher at composer.tsx:496, now AFTER the @-picker’s own key claim.
- [✓] Draft persistence
      · apps/web/src/lib/draft.ts readDraft/writeDraft/clearDraft/clearAllDrafts, keyed per project ('apple.draft.<projectId>'), capped at DRAFT_MAX = MESSAGE_MAX_CHARS, every access try/catch-wrapped. Wired: apps/web/src/components/ws/composer.tsx
- [✓] Draft recovery after refresh
      · Recovery is on the first render, not in an effect: apps/web/src/components/ws/composer.tsx:150 `useState(() => (draftKey ? readDraft(draftKey) : ''))`, asserted verbatim by apps/web/tests/draft.test.mjs 'the draft is restored on the FIRST render'.
- [✓] File attachment upload
      · BUILT. POST/GET/DELETE /api/projects/:id/attachments in apps/worker/src/index.ts over apps/worker/src/attachments.ts; the composer stages, uploads and sends them (apps/web/src/components/ws/composer.tsx). 14 executed-route tests: apps/worker/tests/attachment-routes-live.test.mjs.
      · AND IT REACHES THE MODEL: promptWithAttachments folds each file into the message at the chat ingress (apps/worker/src/do/session.ts case 'chat'), asserted by apps/worker/tests/attachment-prompt.test.mjs. KV, not R2 — no bucket exists and provisioning one is the owner’s call.
- [☐] Image attachment upload
      · STILL NOT BUILT, and now refused BY NAME rather than accepted and dropped: validateAttachment answers image_unsupported and the picker, paste and drop all end in "Apple can’t read images yet" (packages/shared/src/attachments.ts, asserted in apps/worker/tests/attachment-policy.test.mjs).
      → The upload substrate is done; what is missing is the model half. session.ts would have to pass image attachments to a vision-capable branch and the run’s model would have to be one — that is a routing and spend decision, not a UI one. Until it exists, accepting an image would be a lie.
- [☐] Audio attachment upload
      · SKIPPED DELIBERATELY. The mic is still disabled and still says "Voice input isn’t supported yet" (apps/web/src/components/ws/composer.tsx), which apps/web/tests/composer-attachments.test.mjs now pins so it cannot be quietly wired to nothing.
      → Needs a transcription model and a per-minute spend decision the owner has not made. MediaRecorder capture is the easy half; a Whisper call billed against BudgetDO is the half that costs money.
- [~] Pasted image handling
      · A PASTED FILE IS HANDLED; A PASTED IMAGE IS REFUSED IN WORDS. onPaste scans clipboardData for files and routes them through the same admission path as the picker, calling preventDefault only in the branch that found one — a plain text paste is untouched (apps/web/src/components/ws/composer.tsx).
      → The remaining half is the same blocker as image attachment upload: this build cannot show an image to a model. The paste path is already wired to whatever admitFiles admits, so it becomes ✓ the day images are admitted.
- [✓] Drag-and-drop attachments
      · onDragOver/onDragLeave/onDrop on the composer form, lighting up only when dataTransfer.types includes ‘Files’ so dragged TEXT does not promise an upload that will not happen; dragleave ignores moves onto a child, or the highlight flickers across the box. .gx-composer__inner.is-dropping in workspace.css.
- [✓] Attachment upload progress
      · A determinate bar from real bytes: uploadAttachment in apps/web/src/lib/api.ts uses XMLHttpRequest because fetch cannot report REQUEST progress, and fires only when e.lengthComputable — a bar that animates without knowing the total is a lie. role="progressbar" with aria-valuenow, styled .gx-attach__bar.
- [✓] Attachment upload cancellation
      · One AbortController per in-flight row; × aborts the request and then DELETEs the object if its bytes had already landed, so no orphan sits in the store for a week. An abort rejects with UploadAborted and leaves NO failed row — a cancel is not an error the person must react to.
- [✓] Attachment retry
      · The File object is kept beside the row so Retry re-posts the same bytes rather than re-opening the picker. Failures classify through apps/web/src/lib/error-taxonomy.ts, which learned 413 and 415: both are retryable:false, so no Try again is offered over a file that can never be accepted.
- [✓] Attachment size validation
      · MAX_ATTACHMENT_BYTES (32 KiB) in packages/shared/src/attachments.ts, imported by both ends so the picker cannot accept what the server refuses. Measured on the bytes that ARRIVED, not on Content-Length — a lying length is tested at apps/worker/tests/attachment-routes-live.test.mjs. 413 with the ceiling in the sentence.
- [✓] Attachment type validation
      · ATTACHMENT_MIME_ALLOWLIST plus magic-byte sniffing: a PNG renamed notes.txt and posted as text/plain is refused on its leading bytes, as are NUL bytes and invalid UTF-8. The <input accept> is BUILT from the allowlist, so the dialog cannot offer a type the worker refuses. 415, distinct from 413 and 400.
- [✓] Attachment removal before sending
      · A chip row above the tool bar, one × per file including the ones that already succeeded. Removal aborts, DELETEs and splices. Send is BLOCKED while anything is uploading or failed, with the reason in an aria-live line — a file still on the screen has not been sent.
- [✓] Project resource mentions
      · Typing @ at a word boundary opens a listbox of the project’s own files (GET /api/projects/:id/files, fetched once per project) and picking one inserts the backticked path the agent’s workspace_read tool opens. apps/web/src/lib/mentions.ts + apps/web/tests/mentions.test.mjs (21 tests).
      · me@example.com is NOT a mention; the token is read at the caret, not at the end of the box; and the picker claims Enter/Arrows/Tab/Escape BEFORE the send binding, so a send chord cannot fire with a half-typed @pla in the message.
- [~] Studio object references
      · This is real and reachable, and the checklist's cited proof (packages/corpus/src/intake/forks.test.mjs, about parsing GitHub repo slugs) is the wrong file. The feature is apps/web/src/lib/selection-reference.ts — selectionReference/selectio
      · REFUTED: REFUTED on deployment. The browser half is real (apps/web/src/lib/selection-reference.ts, the chip at composer.tsx:257-267, insertSelection at 162-178, all present in the deployed bundle) and the tests pass — but no user
- [✓] Prompt template insertion
      · Both halves. The seed no longer replaces the box: it goes through insertPhrase/insertAtCursor, so clicking a suggestion over a half-written sentence keeps the sentence (apps/web/tests/composer-templates.test.mjs).
      · And a Templates chip in the composer offers PROJECT_TEMPLATES — previously reachable only in the new-project dialog, i.e. once in a project’s life — minus the blank start, filtered by the null prompt rather than by name so a sixth template needs no edit here.
- [✓] Message length feedback
      · apps/web/src/components/ws/composer.tsx:510 `showCount = text.length >= MESSAGE_WARN_CHARS` and :590 renders '<n> characters left' in an aria-live="polite" region; the box is clamped on change at :529 and carries maxLength at :552.
- [✓] Clear submission failure recovery
      · The onSend contract is boolean, not void: composer.tsx:100 `onSend: (text: string, attachments: ChatAttachment[]) => boolean` and :452 `if (!onSend(value, readyAttachments(staged))) return;` short-circuits BEFORE the box, the draft AND the staged files are cleared. Signature re-read this pass.

## 16. CONVERSATION MANAGEMENT  —  45%   ✓7 ~4 ☐9

- [✓] New conversation creation
      · A conversation IS a project in this product (one SessionDO per project row). Creation UI: apps/web/src/routes/dashboard.tsx:158 `CreateProjectModal`, inserting at dashboard.tsx:171 and navigating to /projects/:id. Reachable three ways: the 
- [✓] Project-bound conversations
      · Every conversation is addressed by its project row id: apps/worker/src/index.ts:524 `const stub = sessionStub(c.env, row.id)` inside `withOwnedProject` (index.ts:501), and index.ts:525-529 POSTs /init with {projectId, projectName, ownerId},
- [✓] Conversation naming
      · Name is required at creation: apps/web/src/routes/dashboard.tsx:196-206 (required input, maxLength 80) and the submit is disabled on an empty name (dashboard.tsx:227). Enforced in the schema at infra/supabase/migrations/0001_init.sql:16 `ch
- [☐] Automatic title suggestions
      · Nothing anywhere derives or proposes a name. `projects.name` is written in exactly two places and both are a human typing it: apps/web/src/routes/dashboard.tsx:171 (create) and apps/web/src/lib/rename-project.ts:28 (rename) — a repo-wide gr
      → In apps/worker/src/do/session.ts, after the first assistant turn completes on a project whose name is still the create-time placeholder (or after N turns), generate a <=80-char title from the first user message via the existing gateway call and PATCH it to Supabase alongside the memory_summary write
- [✓] Conversation rename
      · One shared hook, two surfaces: apps/web/src/lib/rename-project.ts:22 `useRenameProject` (Supabase update under RLS at line 28, invalidating all three caches at lines 33-35). Dashboard menu item at apps/web/src/routes/dashboard.tsx:97 → Rena
- [☐] Conversation folders
      · There is no grouping construct for projects. infra/supabase/migrations/0001_init.sql:13-25 defines `projects` with no folder/parent/group column, and no later migration adds one (0004 adds only `archived_at`, 0005/0006 add collaboration and
      → Add `folder text` (nullable, a plain label rather than a tree — matching the project's one-nullable-column habit documented in apps/web/src/lib/archive.ts) in a new infra/supabase/migrations/0007_project_folders.sql with an index on (owner_id, folder), add it to PROJECT_COLUMNS in apps/web/src/lib/a
- [☐] Conversation tags
      · No tag column, type or UI. infra/supabase/migrations/0001_init.sql:13-25 has no tags/labels column and none of 0002-0006 adds one. The search facets the product does have are fixed enumerations with no tag axis: apps/web/src/lib/search-filt
      → Add `tags text[] not null default '{}'` to projects in a new infra/supabase/migrations/0007_project_tags.sql with a GIN index, add it to PROJECT_COLUMNS in apps/web/src/lib/archive.ts:14 and to ProjectRow in apps/web/src/lib/supabase.ts:32, add a tag editor to ProjectMenu in apps/web/src/routes/dash
- [☐] Conversation pinning
      · No pin column, action or ordering override. The sidebar orders by recency only (apps/web/src/components/layout.tsx:156 `fetchRecentProjects`, sliced to RAIL_LIMIT at :158) and the dashboard orders by `updated_at desc` / `archived_at desc` (
      → Add `pinned_at timestamptz` to projects (one nullable timestamp, same shape as archived_at — see apps/web/src/lib/archive.ts:1-10 for why a boolean beside a date is refused here) in a new migration; add it to PROJECT_COLUMNS (apps/web/src/lib/archive.ts:14); add a Pin/Unpin item to ProjectMenu at ap
- [☐] Conversation favorites
      · Same search as pinning and with the same result: no favorite/star column in infra/supabase/migrations/*.sql, no control in ProjectMenu (apps/web/src/routes/dashboard.tsx:85-155), no filter in apps/web/src/lib/search-filters.ts. Case-insensi
      → Do not build this as a second axis beside pinning — pick one. If both are wanted, implement favorites as the persisted flag (`favorited_at timestamptz` on projects) and make the dashboard's Active tab offer a Favorites scope alongside Active/Archived, extending PROJECT_SCOPES in apps/web/src/lib/arc
- [~] Conversation archival
      · Column: infra/supabase/migrations/0004_project_archive.sql:11 `add column if not exists archived_at timestamptz`. Mutation: apps/web/src/routes/dashboard.tsx:378-408 `setArchived`, invalidating all three lists (dashboard.tsx:390) and offeri
      · REFUTED: REFUTED — built in the repository, not present in what is deployed. The column does not exist in the live database. information_schema on the production Supabase project (npqvyijsvzkuwddyhtpm — the same project id baked 
- [~] Conversation restoration
      · Two paths, both real. (1) The card menu flips to 'Restore' on an archived project — apps/web/src/routes/dashboard.tsx:110 `{archived ? 'Restore' : 'Archive'}` → dashboard.tsx:381-384 clearing archived_at to null. (2) Undo in the toast, rout
      · REFUTED: REFUTED for the same root cause, and it fails twice over. Both paths write or read archived_at, which does not exist in the live database (verified by information_schema and by a 400/42703 from production PostgREST). Pat
- [~] Conversation deletion confirmation
      · apps/web/src/routes/dashboard.tsx:298 `DeleteProjectModal` derives the ceremony from the consequence — dashboard.tsx:322 `confirmationFor({ reversible: false, destroysUserContent: true })` (apps/web/src/lib/confirm-model.ts:42) — which retu
      · REFUTED: REFUTED on reachability, though the logic is sound. The ceremony model is real and genuinely tested: confirm-model.test.mjs calls confirmationFor, canConfirm and confirmMatches for real (17 tests, all pass), :85 'AN EMPT
- [✓] Conversation export
      · Route: apps/worker/src/index.ts:1171 GET /api/projects/:id/export, serving Markdown or JSON from one payload with a safe Content-Disposition filename (index.ts:1180-1185). Renderer: apps/worker/src/export.ts (renderTranscriptMarkdown / expo
- [☐] Conversation duplication
      · Nothing copies a conversation. ProjectMenu offers no duplicate (apps/web/src/routes/dashboard.tsx:85-155); there is no route for it in apps/worker/src/index.ts (I read every app.get/post/put/delete registration — /api/projects/:id has ws, m
      → Add `POST /api/projects/:id/duplicate` in apps/worker/src/index.ts beside the export route (index.ts:1171): resolve via withOwnedProject, insert a new Supabase projects row owned by the caller (name = `<name> (copy)`, copying description/memory_summary/memory_facts but NOT place_id/place_name — a co
- [☐] Conversation branching
      · The opposite of branching is what is implemented: editing an earlier message DELETES everything from it onward. apps/worker/src/do/session.ts:1498 `this.sql.exec('delete from messages where created_at >= ?', row.created_at)` and the broadca
      → This is a schema change before it is a UI change. In apps/worker/src/do/session.ts:497 add `parent_id text` and `branch_id text` to the messages table (plus the try/catch ALTER pattern already used for oplog.failure at session.ts:521 so existing DOs migrate), and change the `edit_resend` handler (se
- [☐] Branch ancestry display
      · There are no branches to display (see above), and nothing in the UI renders a conversation lineage. apps/web/src/components/ws/turn.tsx renders a flat list of turns with no parent/sibling affordance, and workspace.tsx:717-726 maps `messages
      → Blocked on 'Conversation branching'. Once messages carry branch_id/parent_id, add a sibling switcher to apps/web/src/components/ws/turn.tsx beside the existing Edit control (turn.tsx:160-167) reading '2 of 3' with prev/next arrows, and render the lineage in a drawer — the Drawer union in apps/web/sr
- [✓] Message editing
      · End to end. UI: the Edit control on a user turn at apps/web/src/components/ws/turn.tsx:160-167 → apps/web/src/routes/workspace.tsx:723 `onEdit` → EditMessageDialog (apps/web/src/components/ws/edit-message-dialog.tsx:17), which names the dis
- [☐] Message version history
      · An edit destroys the prior version rather than storing it: apps/worker/src/do/session.ts:1498 deletes every row from the edited message onward, and the messages table has no version/revision/edited_at column (apps/worker/src/do/session.ts:4
      → In apps/worker/src/do/session.ts, add a `message_revisions(message_id text, seq integer, content text, created_at integer, primary key(message_id, seq))` table beside the messages table at session.ts:497, and in the edit_resend handler (session.ts:1444) insert the OLD content as a revision row befor
- [~] Response regeneration
      · Built, wired and tested, but only for FAILED runs. apps/web/src/components/ws/turn.tsx:215-217 renders 'Try again' inside the `{outcome && (...)}` block, and `outcome` is defined at turn.tsx:176 as `item.stopReason && item.stopReason !== 'd
      → In apps/web/src/components/ws/turn.tsx, move the retry control out of the `{outcome && (...)}` block at turn.tsx:209 so a successful last assistant turn also offers it, labelled 'Regenerate' rather than 'Try again' (keep the `stopReason !== 'quota'` suppression at turn.tsx:215 and the last-turn-only
- [✓] Conversation state restoration across devices
      · Conversation state lives server-side in the SessionDO, not in the browser, so any device that can open the project gets it. History: apps/worker/src/do/session.ts:954 serves /messages from DO SQLite, exposed at apps/worker/src/index.ts:544,

## 14. STUDIO CONNECTION AND SESSION MANAGEMENT  —  55%   ✓4 ~14 ☐2

- [✓] Live connection status
      · Worker computes it and pushes it: apps/worker/src/do/session.ts:776 (`studioConnected` on `hello`) and :3022-3030 (`studio_status` broadcast the moment a plugin reappears), :1289 (broadcast on revoke). Browser consumes it at apps/web/src/li
- [~] Last successful heartbeat
      · The worker half is finished: apps/worker/src/do/session.ts:692-696 (`pluginLastSeenAt`), :785 (`studioLastSeenAt` on `hello`), :3025 (`lastSeenAt` on `studio_status`), served at :712-718 (`linkSummary`) and proven by apps/worker/tests/studi
      → In apps/web/src/lib/use-project-socket.ts, extend the `studio` state with `lastSeenAt: number | null` and set it from `msg.studioLastSeenAt` in the `case 'hello'` branch (line 393) and from `msg.lastSeenAt` in `case 'studio_status'` (line 401); both fields already exist on ServerMsg in packages/shar
- [~] Connection latency display
      · The server half exists and is deliberate: apps/worker/src/do/session.ts:1393-1402 echoes the browser's own timestamp `t` back on `pong` so the round trip is measured in one clock domain, and packages/shared/src/index.ts:453 and :945 declare
      → In apps/web/src/lib/use-project-socket.ts:774 send `{ type: 'ping', t: Date.now() }`, keep a `rttMs` ref, and replace the `case 'pong': break;` at :727 with `if (typeof msg.t === 'number') setRtt(Date.now() - msg.t);` — never setting a value when `t` is absent, so an unmeasured trip stays null rathe
- [~] Active place identification
      · The place is identified, bound and persisted server-side: apps/worker/src/studio-place.ts:110-135 (`placeAdmission`), apps/worker/src/do/session.ts:2982-2987 (bind/refresh on poll) and :859-876 (bound at claim time and handed back so the pl
      → In apps/web/src/lib/use-project-socket.ts, add `place: StudioPlace | null` and `placeMismatch` to the `studio` state; set `place` from `msg.studioPlace` in `case 'hello'` (line 393) and from `msg.place` in `case 'studio_status'` (line 401), and set `placeMismatch` from `msg.placeMismatch ?? null` in
- [~] Active Studio session identification
      · There is no identifier for a Studio session or instance anywhere. What exists is a description of whichever Studio is currently attached: apps/worker/src/do/session.ts:707-719 (`linkSummary` → paired, connected, lastSeenAt, queuedOps, plugi
      → Mint a per-Studio installation id in the plugin (a GUID stored under `plugin:SetSetting('apple_install_id', ...)` in apps/plugin/src/init.server.luau alongside `golem_session`) and send it on the existing `X-Golem-Plugin-*` header set in the `post` helper at apps/plugin/src/init.server.luau:107-125.
- [☐] Multiple Studio session inventory
      · The data model holds exactly one Studio per project and cannot represent a second: apps/worker/src/do/session.ts:851-856 stores a single `pluginTokenHash` and moves the previous one to `pluginSuperseded`, and apps/worker/src/index.ts:1398 s
      → This needs the per-install id from 'Active Studio session identification' first. Then change apps/worker/src/do/session.ts to keep a map of `pluginTokens` keyed by install id (replacing the single `pluginTokenHash` at :851-856 and the lookup at :881-908), each with its own lastSeen, place and client
- [☐] Explicit active-session selection
      · Nothing to select between — see 'Multiple Studio session inventory'. Ops are handed to whichever plugin polls with the one valid token: apps/worker/src/do/session.ts:3128 (`this.opQueue.splice(0, 10)`) has no notion of a target Studio, and 
      → Blocked on the installations inventory. Once apps/worker/src/do/session.ts keys plugin tokens by install id, store an `activeInstallId` in DO storage, have the poll handler serve ops only to that id (returning an empty op list plus an explanatory `client.message` to the others), add POST /api/projec
- [~] Project-to-place binding
      · apps/worker/src/studio-place.ts:110-135 decides bind/match/mismatch/unverified; apps/worker/src/do/session.ts:2982-2987 persists the binding on poll and :859-876 binds it at claim time; ops are withheld on a proven mismatch at :2988-3016 an
      · REFUTED: The code is exactly as cited (studio-place.ts:114-134 placeAdmission, session.ts:2982-2987 persist, :863-867 bind at claim, :2988-3017 withhold, :2845-2847 refuse before queueing, :1303-1309 rebind, index.ts:1478 route, 
- [~] Connection authorization refresh
      · The browser's authorization does refresh: apps/web/src/lib/use-project-socket.ts:734-740 refreshes the Supabase session before every (re)connect. The Studio link's authorization does not. apps/worker/src/do/session.ts:401 sets PLUGIN_TOKEN_
      → In apps/worker/src/do/session.ts's `/plugin/poll` handler (line 879), after the token compare succeeds, slide the expiry: if `Date.now() - issuedAt > PLUGIN_TOKEN_TTL_MS / 2`, write a fresh `pluginTokenIssuedAt` so an actively used pairing never lapses, while an idle one still expires at 30 days. Ad
- [✓] Automatic reconnection
      · Both halves reconnect without user action. Plugin: apps/plugin/src/init.server.luau:352-355 treats a failed poll as a hiccup, waits 3s and loops (the loop condition at :307 is the single place that decides to keep going), and :450 resumes t
- [✓] Reconnection progress display
      · Browser: apps/web/src/routes/workspace.tsx:485-492 derives `connNote` ('Connecting…' / 'Offline — check your connection' / 'Reconnecting…') and renders it in a `role="status"` line at :769-773. Studio: apps/plugin/src/init.server.luau:353 s
- [~] Offline operation queue visibility
      · The depth is real and crosses the wire: apps/worker/src/do/session.ts:714 (`queuedOps` in linkSummary), :786, :3026 and :1289 put it on `hello` and every `studio_status`, and apps/worker/tests/studio-place-poll.test.mjs:281 ('the queue dept
      → Add `queuedOps: number` to the `studio` state in apps/web/src/lib/use-project-socket.ts, set it from `msg.queuedOps` in both `case 'hello'` (line 393) and `case 'studio_status'` (line 401), and feed it into the `StudioLinkFacts` passed to `linkDetail` rendered under the Studio pill in apps/web/src/r
- [~] Queue cancellation before reconnect
      · Automatic cancellation is built and tested: apps/worker/src/do/session.ts:2344 drops every op the ending run queued (`dropOpsForEndedRuns(undefined)` in finishRun), :2816-2832 resolves each dropped op's waiter with a `transport` failure rat
      → Add `if (path === '/studio/queue' && req.method === 'DELETE')` to apps/worker/src/do/session.ts's fetch (beside /studio/place/rebind at line 1303) that empties `opQueue`, persists it, resolves every outstanding waiter with `WORKER_FAILURES.runEnded`, and broadcasts a `studio_status` carrying the new
- [~] Session expiration handling
      · Wired end to end but unproven and unannounced. apps/worker/src/do/session.ts:401 defines the 30-day TTL and :888-890 answers an aged pairing with 401 `{error:'token expired'}` plus a sentence; apps/plugin/src/init.server.luau:321-334 reads 
      → Add a test to apps/worker/tests/studio-place-poll.test.mjs that seeds `pluginTokenIssuedAt` at `Date.now() - 31 days`, polls with the correct token, and asserts status 401 with `error === 'token expired'` and a non-empty `message` — the harness at the top of that file already builds a paired session
- [✓] Stale session detection
      · apps/worker/src/do/session.ts:676-682 decides the plugin is gone from the deadline it actually issued (`pollDueBy`, set at :3132 to the wait it just told the plugin plus POLL_STALE_GRACE_MS), falling back after an eviction to `lastSeen + PO
- [~] Duplicate command protection
      · The transport half is genuinely safe: apps/worker/src/do/session.ts:3105-3128 states at-most-once delivery as a decision and `opQueue.splice(0, 10)` never redelivers, so the server cannot send the same op twice. The classifier that would st
      → In apps/worker/src/tools.ts:295-299, change the `op` helper to append the retry hint: `const hint = retryHint(studioOp, res); if (!res.ok) return { error: res.error ?? 'operation failed', ...(hint ? { retry: hint } : {}) };`, importing `retryHint` from '../op-failure'. That puts 'Do not retry this a
- [~] Plugin and server protocol negotiation
      · apps/worker/src/plugin-version.ts:163 `pluginCompatibility` admits on PROTOCOL only and treats an unknown protocol as compatible unconditionally; :177 `clientNotice` adds the advisory 'an update exists' message. Both are wired on the live p
      · REFUTED: The worker mechanism is real and deployed (pluginCompatibility at plugin-version.ts:159 — the cited :163 is the unknown-protocol branch inside it; clientNotice at :181, not :177; session.ts:2962-2965 returns `{ops: [], w
- [~] Connection diagnostics
      · The endpoint is real, owner-authorized and rich: apps/worker/src/index.ts:1451 GET /api/projects/:id/studio/diagnostics → apps/worker/src/do/session.ts:1239-1268, returning the link summary, agent status, pairedAt/pairingExpiresAt, the plac
      → Add `studioDiagnostics(projectId)` to apps/web/src/lib/api.ts calling GET /api/projects/:id/studio/diagnostics, and build a 'Studio connection' panel — a new apps/web/src/components/ws/studio-link-panel.tsx opened from the Studio pill in apps/web/src/routes/workspace.tsx:575-598 — showing paired/con
- [~] Safe disconnect behavior
      · The mechanics are correct and tested on both sides. Worker: apps/worker/src/do/session.ts:1281-1295 deletes the token hash, the heartbeat, the place binding and the superseded record, resets the in-memory flags, broadcasts `connected:false`
      → Add `disconnectStudio(projectId)` to apps/web/src/lib/api.ts POSTing to /api/projects/:id/studio/disconnect, and wire a 'Disconnect Studio' button behind the existing ConfirmDialog (apps/web/src/components/confirm-dialog.tsx) into the Studio connection panel opened from the pill in apps/web/src/rout
- [~] Reconnection reconciliation of pending operations
      · Half of it holds. The queue is durable (apps/worker/src/do/session.ts:2862 persists `opQueue` on every push, :524 restores it on boot), so ops survive an eviction or a plugin restart and are served on the next poll — apps/worker/tests/studi
      → Make the reconnect handshake carry unfinished work: have apps/plugin/src/init.server.luau persist the ids and results of ops it applied but has not yet successfully reported (a bounded list under `plugin:SetSetting('apple_unreported', ...)`, written in the loop at :336-346) and send them in the firs

## 21. MEMORY AND PERSONALIZATION  —  80%   ✓12 ~8 ☐0

- [✓] User memory scope
      · Store: /Users/moshe/Desktop/RbxAI/apps/worker/src/memory-store.ts:324 canReadScope treats scope 'user' as scopeId === access.userId. Route: /Users/moshe/Desktop/RbxAI/apps/worker/src/index.ts:836 memoryScopeAccess refuses any user scopeId t
- [✓] Project memory scope
      · Two real project memories, both reachable. (a) DO-held summary/facts: /Users/moshe/Desktop/RbxAI/apps/worker/src/index.ts:706 GET and :723 PUT, DO handler /Users/moshe/Desktop/RbxAI/apps/worker/src/do/session.ts:990, UI /Users/moshe/Desktop
- [~] Organization memory scope
      · Worker half is complete and tested; the product half does not exist. Store: memory-store.ts:930 createOrg, :957 listOrgsFor, :902 org rows, canWriteScope restricts org writes to owner/admin (memory-store.ts:339). Routes: /Users/moshe/Deskto
      → Two changes. (1) apps/web/src/lib/api.ts: add fetchOrgs/createOrg/fetchOrgMembers/setOrgMember/removeOrgMember wrappers for /api/orgs, /api/orgs/:id/members. (2) apps/web/src/components/ws/instructions-panel.tsx:226: replace the hardcoded ['user','project'] array with the result of the already-expor
- [✓] Explicit memory creation
      · Three reachable writers. User adds a project fact: /Users/moshe/Desktop/RbxAI/apps/web/src/components/ws/memory-panel.tsx:133 add form -> saveMemory -> index.ts:723. User adds an instruction with optional TTL: /Users/moshe/Desktop/RbxAI/app
- [~] Suggested memory approval
      · Backend complete, no UI at all. Queue and decisions: /Users/moshe/Desktop/RbxAI/apps/worker/src/memory.ts:35 suggested{}, :238 review-mode proposal path, decideSuggestedFact/decideSuggestedSummary; DO route /Users/moshe/Desktop/RbxAI/apps/w
      → apps/web/src/lib/api.ts: widen `Memory` (line 195) to { summary, facts, suggested: { summary: string|null; facts: string[] }, origins?: Record<string,'user'|'model'|'import'> } and add `decideSuggestion(projectId, { decision: 'accept'|'discard', target?: 'summary', fact?: string })` POSTing to /api/
- [~] Memory source attribution
      · The checklist's existing citation (packages/corpus/src/intake/licence.test.mjs) is the keyword matcher misfiring — that is asset licence attribution, not memory. Real state: every scoped row carries `source: 'user'|'model'|'import'` (memory
      → apps/web/src/components/ws/instructions-panel.tsx:401: in the instructions <li>, render a small badge from e.source — 'you wrote this' / 'Apple noticed this' / 'imported' — next to the existing expiry chip; and add {a.actor} to the audit row at line 480. apps/web/src/lib/api.ts:195: add `origins?: R
- [~] Memory creation timestamp
      · created_at is a column on memory_entries (apps/worker/src/memory-store.ts:508 DDL), set in normaliseEntry (memory-store.ts:294), and explicitly preserved across an overwrite — test /Users/moshe/Desktop/RbxAI/apps/worker/tests/memory-store.t
      · REFUTED: REFUTED on reachability and on the tests. (1) NO SURFACE SHOWS IT. `grep -rn createdAt apps/web/src` returns the field only as a type in api.ts:249 — no component reads entry.createdAt. The claimed path ('the first put l
- [✓] Memory modification history
      · memory_audit table with before/after values (apps/worker/src/memory-store.ts:513 DDL), written on put/delete/import/move (memory-store.ts:602 action union), read by readMemoryAudit (memory-store.ts:845, scope-checked at :852). Route: /Users
- [✓] Memory viewer
      · The existing mark cites infra/supabase/migrations/0006_membership_lifecycle.sql, which is unrelated. Two viewers actually ship, both in the 'What Apple remembers' drawer: /Users/moshe/Desktop/RbxAI/apps/web/src/components/ws/memory-panel.ts
- [~] Memory search
      · Project memory IS searchable end to end: the DO emits memory records into the search corpus (/Users/moshe/Desktop/RbxAI/apps/worker/src/do/session.ts:3291 and :3295), 'memory' is a filterable type (apps/worker/src/search.ts:115), and clicki
      → apps/web/src/lib/api.ts:332: change fetchScopeMemory to (scope, scopeId, query?: string) and append `?q=${encodeURIComponent(query)}` when query is a non-empty string. apps/web/src/components/ws/instructions-panel.tsx: add a search input above the instructions list (near line 395), hold it in state,
- [✓] Memory editing
      · Project memory: every field editable in place and saved — summary textarea at /Users/moshe/Desktop/RbxAI/apps/web/src/components/ws/memory-panel.tsx:90, per-fact input at :110, save at :157 -> PUT /api/projects/:id/memory (index.ts:723) -> 
- [✓] Memory deletion
      · Scoped rows: deleteMemoryEntry (apps/worker/src/memory-store.ts, write-access checked, audited) behind DELETE /api/memory/:scope/:scopeId/entries/:key at /Users/moshe/Desktop/RbxAI/apps/worker/src/index.ts:1020, called from the 'Forget' but
- [✓] Memory expiration
      · TTL accepted and validated (expiresAtFor, /Users/moshe/Desktop/RbxAI/apps/worker/src/memory-store.ts:218; MAX_TTL_DAYS 730 at :101), enforced at READ time so a missing sweeper cannot resurrect a stale instruction (isExpired at memory-store.
- [~] Memory scope changes
      · Server half complete, client half absent. moveMemoryEntry at /Users/moshe/Desktop/RbxAI/apps/worker/src/memory-store.ts:788 (write access to both ends, refuses to overwrite the destination, keeps created_at and source, audits both scopes), 
      → apps/web/src/lib/api.ts: add `moveMemoryEntry(scope, scopeId, key, to: { toScope: MemoryScope; toScopeId: string })` POSTing to `${scopePath(scope, scopeId)}/entries/${encodeURIComponent(key)}/move`, mapping 409 to 'there is already something with that name there'. apps/web/src/components/ws/instruc
- [✓] Memory access controls
      · canReadScope/canWriteScope at /Users/moshe/Desktop/RbxAI/apps/worker/src/memory-store.ts:322 and :337 (org writes narrowed to owner/admin), with MemoryAccess carrying only proven ids (:305). Every route goes through memoryScopeAccess at /Us
- [~] Sensitive memory handling
      · The refusal half is real and enforced at the single door: refusedDisclosure (/Users/moshe/Desktop/RbxAI/apps/worker/src/memory-store.ts:178) is called inside normaliseEntry (:274) so the entry editor, preferences form, profile form and impo
      → (1) apps/web/src/lib/api.ts:241: add `sensitive?: string[]` to MemoryEntry; in apps/web/src/components/ws/instructions-panel.tsx:401, when e.sensitive?.length render the value masked with a 'contains your email address — Show' toggle that reveals it on click. (2) apps/web/src/lib/api.ts:15: give Api
- [✓] Conflicting memory resolution
      · resolveMemoryLayers at /Users/moshe/Desktop/RbxAI/apps/worker/src/memory-store.ts:389 — strict org<user<project precedence, never a merge, reporting every shadowed row; precedenceOf throws on an unknown scope rather than silently losing (:3
- [✓] Memory export
      · buildExport with a versioned envelope (MEMORY_EXPORT_FORMAT 'golem.memory.v1', /Users/moshe/Desktop/RbxAI/apps/worker/src/memory-store.ts:399, :412 — expired rows excluded). Route GET /api/memory/:scope/:scopeId/export at /Users/moshe/Deskt
- [✓] Memory import validation
      · The existing mark cites packages/evals/src/tasks.mjs, which is unrelated. Real implementation: parseImport at /Users/moshe/Desktop/RbxAI/apps/worker/src/memory-store.ts:441 — target comes from the URL and never from the envelope, rows namin
- [~] Disable-memory mode
      · Worker half complete and tested; no control in the product. MEMORY_MODES ['auto','review','off'] at /Users/moshe/Desktop/RbxAI/apps/worker/src/memory.ts:62, memoryWritable/memoryReadable at :68-70, so 'off' stops both writing and reading. I
      → apps/web/src/lib/api.ts:260: add `memory_mode?: 'auto' | 'review' | 'off'` to the Preferences interface. apps/web/src/components/ws/instructions-panel.tsx: add a select next to the other preference fields (after the 'How to write code' block around line 265) labelled 'What Apple may remember' with o

## 15. STUDIO OPERATION EXECUTION  —  68%   ✓10 ~7 ☐3

- [~] Studio capability discovery
      · BUILD discovery exists and is wired: the plugin puts X-Golem-Plugin-Version/Protocol on every request (apps/plugin/src/init.server.luau:113-117), the DO reads and records them and refuses an under-floor protocol with ops:[] (apps/worker/src
      → Have the plugin declare what it can do rather than only what version it is: in apps/plugin/src/init.server.luau add a `supportedOps` array to the claim and poll bodies, derived from the keys of the `handlers` table in apps/plugin/src/Ops.luau (export it as Ops.kinds()). Store it in SessionDO beside 
- [✓] Supported operation registry
      · The wire registry is the StudioOp union at packages/shared/src/index.ts:37-108; the execution registry is the `handlers` table in apps/plugin/src/Ops.luau:153 dispatched at :1212. The two are kept in step by a real test in BOTH directions: 
- [~] Operation argument validation
      · The companion ops are validated thoroughly and provably: apps/plugin/src/Companion.luau:36 finite (NaN/Inf), :231 planTransform (per-component ranges, exact identity elements, refuses a no-op request), :289 validateName (empty, length, doub
      → Give the three core mutating tools a real contract. In apps/worker/src/tools.ts define ToolContracts for create_instances, set_properties and delete_instances and run apps/worker/src/tool-contract.ts validateArgs(contract, args) inside each `run` before building the StudioOp: cap `items` and `paths`
- [✓] Target instance validation
      · apps/plugin/src/Paths.luau:44 Paths.resolve walks the path and errors 'not found: %s (missing %q at depth %d)' on the first missing segment; apps/plugin/src/Ops.luau:1199 classifyFailure re-resolves the addressed path after a failure and re
- [~] Stable instance identity mapping
      · The protocol addresses instances by PATH and enforces the invariant that a path it hands back resolves to the instance it names: apps/plugin/src/Ops.luau:1065 renames, re-derives the path, resolves it and UNDOES the rename if it does not co
      → Give instances an id the plugin owns. In apps/plugin/src/Ops.luau createFromSpec (line 96) SetAttribute('AppleId', HttpService:GenerateGUID(false)) on every instance the agent creates, and return it beside the path in the create_instances/clone_instances/group_instances results. In apps/plugin/src/P
- [✓] Target place validation
      · The existing [~] mark and its citation (apps/worker/tests/prefabs.test.mjs) are both wrong — this is fully built. apps/worker/src/studio-place.ts:111 placeAdmission decides bind/match/unverified/mismatch and :137 servesOps; it is wired into
- [✓] Pre-operation state capture
      · apps/plugin/src/Ops.luau:697 handlers.snapshot serialises a subtree (class, name, whitelisted properties, attributes, script sources) and :701 handlers.restore puts it back; the round trip is tested at apps/plugin/tests/snapshot.spec.luau:2
- [☐] Dry-run operation preview
      · Searched for it four ways and it is not there. (1) The wire type has no preview affordance: no dryRun/preview/plan field on any member of StudioOp, packages/shared/src/index.ts:37-108. (2) The executor has no plan-only path: apps/plugin/src
      → Add `dryRun?: boolean` to the mutating members of StudioOp in packages/shared/src/index.ts (create_instances, set_props, delete_instances, move_instances, transform_instances). In apps/plugin/src/Ops.luau Ops.execute (line 1211), when opBody.dryRun is true, skip TryBeginRecording entirely and run a 
- [✓] Batched operation execution
      · Two real layers of batching. Delivery: apps/worker/src/do/session.ts:3127 `const ops = this.opQueue.splice(0, 10)` hands up to ten queued ops in one poll response, and apps/plugin/src/init.server.luau:341 executes them in order and accumula
- [✓] Per-operation execution results
      · Every op returns its own typed result: apps/plugin/src/Ops.luau:1211-1279 produces {id, ok, data, error, durationMs, failure} for each op individually, including the unknown-op case (:1215) and the declared-failure case (:1268). The worker 
- [~] Partial batch failure reporting
      · The plugin half is built and tested. apps/plugin/src/Ops.luau:333 create_instances returns `propIssues` listing the property assignments that failed while the instances were still created, :355 set_props does the same, and :1097 set_locked 
      → In apps/worker/src/tools.ts, stop returning the plugin payload verbatim for the two ops that can half-succeed. Change the create_instances run body (line 1350) and set_properties run body (line 1359) to await the op result, and when `propIssues` is a non-empty array return { ...data, partial: true, 
- [✓] Operation timeout handling
      · apps/worker/src/do/session.ts:2864-2877: every op's waiter is armed with a setTimeout that deletes the waiter and resolves {ok:false, error:`Studio did not respond within Ns`, failure: WORKER_FAILURES.timeout}, and the comment at :2867 stat
- [✓] Operation cancellation
      · The stop signal has its own storage key with one writer and one reader so a step's tail write cannot erase it (apps/worker/src/stop-signal.ts:39 requestStop), and it is read inside the tool loop at apps/worker/src/do/session.ts:2206 and aga
- [~] Retry eligibility classification
      · The classifier is real, careful and tested — and nothing in the product calls it. apps/worker/src/op-failure.ts:104 retryEligibility takes the failure KIND plus whether the op mutates (so a timed-out read is retryable and a timed-out write 
      → Wire the classifier into the one place the model reads. In apps/worker/src/tools.ts, import { retryHint } from './op-failure' and change `op()` (line 295) from `if (!res.ok) return { error: res.error ?? 'operation failed' };` to return `{ error: res.error ?? 'operation failed', failure: res.failure,
- [☐] Safe retry execution
      · Nothing anywhere re-executes a Studio op. grep -rn 'for (let attempt|while (attempt|maxRetries|backoff' over apps/worker/src returns only asset-library.ts:756 (D1 writes), automations.ts:496 (webhook fires) and gateway.ts:351 (rate-limit wa
      → Make retry safe before making it automatic, in that order. First, in apps/plugin/src/Ops.luau add a bounded applied-op cache: a table of the last ~64 op ids mapped to their OpResult, checked at the top of Ops.execute (line 1211) so a redelivered id replays the stored result instead of re-running the
- [~] Conflict detection against current Studio state
      · Scripts have real optimistic concurrency and it is proven. apps/plugin/src/Ops.luau:272 compares sourceHash(old) against op.baseHash INSIDE the ScriptEditorService:UpdateSourceAsync transaction — the only moment the answer cannot go stale —
      → Extend the same discipline to instance writes. Add `expect?: Record<string, PropValue>` to the set_props member of StudioOp in packages/shared/src/index.ts (line 69). In apps/plugin/src/Ops.luau handlers.set_props (line 339), before writing anything, read each expected property off the resolved inst
- [☐] Destructive operation confirmation
      · The product owns a confirmation model and the Studio path does not use it. apps/web/src/lib/confirm-model.ts:42 confirmationFor derives none/undo/dialog/typed from a Consequence, and apps/web/src/components/confirm-dialog.tsx renders the tw
      → Gate large deletions on a user answer. In apps/worker/src/do/session.ts, before running a delete_instances tool call, resolve the target subtree size with a get_tree op and, when it exceeds a threshold (say 25 instances, or any direct child of a service), broadcast a new `confirm_required` socket me
- [✓] Studio undo integration
      · Every mutating op is wrapped in a ChangeHistoryService recording, and a mutation that cannot get one is REFUSED rather than performed without it: apps/plugin/src/Ops.luau:18 MUTATING (16 kinds, with run_mode deliberately excluded because st
- [~] Operation provenance tracking
      · In-flight attribution is real and tested: packages/shared/src/index.ts:241 PendingOp.runId, stamped at apps/worker/src/do/session.ts:2856 and cleared when a run ends (:2361), with the three-way partition (live run / no run / dead run) teste
      → Add `run_id text` and `duration_ms integer` to the oplog table created at apps/worker/src/do/session.ts:508, using the same swallowed `alter table oplog add column` pattern already used for the failure column at :520 so existing projects migrate. Pass op.runId and result.durationMs into the insert a
- [✓] Verification of resulting Studio state
      · A registered read-back tool exists and the prompt's instruction to verify now names a real tool: apps/worker/src/tools.ts:1385 get_instance ('Use it to VERIFY a change you just made, and quote what you actually saw rather than what you inte

## 18. AI RESPONSE PRESENTATION  —  88%   ✓16 ~3 ☐1

- [~] Incremental response streaming
      · The delta wire exists end to end: packages/shared/src/index.ts:829 declares `{type:'delta'; msgId; text}`, apps/worker/src/do/session.ts:2010 broadcasts one per model step and :2399 flushes fallback text, and apps/web/src/lib/use-project-so
      → apps/worker/src/gateway.ts `chat()` (line 246) has no streaming path. Add a `chatStream(env, req, onText)` alongside it, backed by a streaming adapter in apps/worker/src/providers/workers-ai.ts that reads the response body incrementally, and call it from the step loop at apps/worker/src/do/session.t
- [✓] Markdown rendering
      · apps/web/src/lib/markdown.tsx:35 `renderMarkdown` = marked(gfm) → DOMPurify with an explicit ALLOWED_TAGS/ALLOWED_ATTR allowlist and `ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i`, plus an afterSanitizeAttributes hook (markdown.tsx:27) forcin
- [✓] Syntax-highlighted code blocks
      · apps/web/src/lib/highlight.ts:286 `tokenize` (hand-written scanners for luau/lua/ts/js/json/text; :66 `normaliseLanguage` maps fence aliases and returns 'text' for anything unknown). Rendered as React children — never an HTML string — at ap
- [✓] Copyable code blocks
      · apps/web/src/components/ws/code-block.tsx:64 renders a `gx-code__copy` button calling `navigator.clipboard?.writeText(code)` (code-block.tsx:42), gated by `{closed && (` at code-block.tsx:61 so a still-streaming fence offers no button, with
- [✓] Structured tables
      · Two live paths. (1) Markdown GFM tables: table/thead/tbody/tr/th/td are in the DOMPurify allowlist (apps/web/src/lib/markdown.tsx:41) and styled at apps/web/src/styles.css:1872-1888. (2) Generative-UI `table` block: schema apps/web/src/lib/
- [~] Expandable long responses
      · The collapse pattern exists next to the reply but not on it. The Thinking card is collapsed by default and expands (apps/web/src/components/ws/thinking.tsx:136-145, `aria-expanded={open}`, CSS grid-rows transition at apps/web/src/styles/wor
      → apps/web/src/components/ws/turn.tsx:196-201 renders the reply as `<div className="gx-prose"><Markdown source={parsed.rest} /></div>` with no length bound. Wrap it in a new component (e.g. apps/web/src/components/ws/long-reply.tsx) that measures the rendered height with a ref after layout and, when i
- [~] Source citation links
      · The worker half is real and tested: apps/worker/src/retrieval.ts:564 `buildCitations` (one numbered entry per source URL, with freshness), :625 `auditCitations` (rejects markdown links and [0] as forged citations), wired through apps/worker
      → Make the sources the agent used reach the transcript. In apps/worker/src/tools.ts `search_docs` (line 2751-2768), in addition to the array returned to the model, set `ctx.uiDetail = { v: 1, title: 'Sources', blocks: [{ type: 'list', items: [...] }] }` — or better, a `key_values` block whose values a
- [☐] Citation source previews
      · Searched apps/web/src for 'citation', 'cite', 'source preview', 'excerpt', 'docs/search' and 'search_docs': the only `excerpt` in the web app is `ErrorDiagnosisBlock.excerpt` (apps/web/src/lib/generative-ui/schema.ts:357, rendered at render
      → Add a fifth evidence kind. (1) apps/worker/src/tools.ts `search_docs` (line 2751): set `ctx.uiDetail` carrying `{title, url, excerpt}` for each hit so it crosses on tool_end.detail. (2) apps/web/src/components/ws/evidence-model.ts: add a `SourcesEvidence` kind ({kind:'sources', items:[{n,title,url,e
- [✓] Tool activity summaries
      · The worker broadcasts a per-tool summary (apps/worker/src/do/session.ts:2167 `tool_end ... summary: out.summary`, produced by `summarize()` in apps/worker/src/tools.ts). apps/web/src/components/ws/activity-model.ts reduces those into ordere
- [✓] Run progress indicators
      · apps/web/src/components/ws/thinking.tsx:170-176 renders 'Step N of M' from `agent_status.step`/`totalSteps`, next to the settled per-run Credits figure. The activity timeline carries an in-flight ring (activity.tsx:82-88) and per-phase elap
- [✓] Proposed change summaries
      · Two live forms. (1) Before the work: `run_intent` is broadcast once per run (apps/worker/src/do/session.ts:1726) carrying `summary` + `checklist` + `questions` (packages/shared/src/index.ts:606); apps/web/src/components/ws/thinking-model.ts
- [✓] File and artifact cards
      · Diff cards: produced by apps/worker/src/tools.ts:1158 (edit_script) and :1334 (format_script) as a `code_diff` block with `path`, carried on tool_end.detail via tools.ts:3036, validated and rendered as a full panel (apps/web/src/lib/generat
- [✓] Scene preview cards
      · In the reply: the render tool sets `ctx.uiDetail = { render, critique, panel }` with a PNG-encoded hero frame at apps/worker/src/tools.ts:2384-2401; apps/web/src/lib/generative-ui/adapters.ts:373 `documentFromToolDetail` converts it to a `r
- [✓] Verification result cards
      · `test_report` blocks are produced by the spec runner tool at apps/worker/src/tools.ts:2045 (including cases that never ran, marked failed rather than omitted), rendered as a full panel at apps/web/src/lib/generative-ui/render.tsx:709 and as
- [✓] Explicit incomplete response states
      · The worker OVERRIDES the model's own text when a build run changed nothing: apps/worker/src/do/session.ts:2392-2396 replaces the reply with 'I did not change anything in your project…' and finishes with stopReason 'incomplete' on `msg_end` 
- [✓] Explicit failed response states
      · apps/web/src/components/ws/turn.tsx:26-37 OUTCOME maps stopped / quota / error to distinct copy and tone; turn.tsx:211 prefers the worker's own error text over the generic line, and turn.tsx:215 withholds Try again on a quota stop so the us
- [✓] Accessible streaming announcements
      · apps/web/src/routes/workspace.tsx:671-677 makes the transcript `role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions"` — deliberately NOT the default 'additions text', so streaming deltas do not flood the polite 
- [✓] Scroll position preservation
      · New content only moves the viewport while the reader is at the live edge: apps/web/src/routes/workspace.tsx:415-421 runs `if (el && stick.current) el.scrollTop = el.scrollHeight` on every messages change, and workspace.tsx:423-429 sets `sti
- [✓] User-controlled follow-to-latest behavior
      · apps/web/src/routes/workspace.tsx:404 holds `following` as React state (it used to be a ref, which could not render a control); workspace.tsx:756-761 renders the `gx-jump` button only when the reader has left the edge, labelled with the uns
- [✓] Separation of generated claims from verified results
      · The model's judgement and the measurement are computed, reported and rendered separately, and the measurement wins. apps/worker/src/tools.ts:2340-2368: the deterministic critic panel runs alongside the vision critique and, on a confirmed de

## 25. LUAU CODE WORKFLOW  —  75%   ✓12 ~6 ☐2

- [✓] Script discovery
      · Tool `list_scripts` at apps/worker/src/tools.ts:1033 dispatches op `list_scripts`, handled at apps/plugin/src/Ops.luau:187 (returns path, ClassName and line count per script, capped at 400). Reachability proven two ways: apps/worker/tests/s
- [✓] Script content inspection
      · Tool `read_script` at apps/worker/src/tools.ts:1038; plugin handler apps/plugin/src/Ops.luau:202 reads via ScriptEditorService:GetEditorSource and returns { source, baseHash, class }. The whole-place read path is apps/worker/src/tools.ts:27
- [✓] Script creation
      · `edit_script` takes create_class (Script | LocalScript | ModuleScript) and create_parent at apps/worker/src/tools.ts:1062-1064; the worker builds the `create` payload at tools.ts:1080 and the plugin instantiates and parents the new script a
- [✓] Script editing
      · apps/worker/src/tools.ts:1048 `edit_script` (source mode and find/replace `edits` mode), transaction in apps/plugin/src/Ops.luau:246 inside ScriptEditorService:UpdateSourceAsync. apps/worker/src/luau-review.ts:120 `applyEdits` reproduces th
- [✓] Syntax validation
      · apps/worker/src/luau-review.ts:84 `checkSyntax` (real parser, packages/evals/src/luau-ast.mjs), used as a PRE-WRITE gate at apps/worker/src/tools.ts:1136 — a body that would not parse is refused and nothing reaches Studio. Tests: apps/worke
- [✓] Code formatting
      · Tool `format_script` at apps/worker/src/tools.ts:1309, backed by apps/worker/src/luau-review.ts:578 `formatScript`, which runs `tokenDrift` as a falsifier and DISCARDS the output rather than writing a reformat that changed meaning. Tests: a
- [~] Static analysis
      · Tool `review_scripts` at apps/worker/src/tools.ts:1188 (per-script and whole-place), backed by apps/worker/src/luau-review.ts:419 `reviewScript` / :443 `reviewPlace`, which call packages/evals/src/luau-intel.mjs analyzeFile/analyzePlace — u
      · REFUTED: REFUTED on deployment, for the default mode. The per-script branch (tools.ts:1209-1227, via read_script) is real and reviewScript is genuinely tested at :428. But the whole-place branch — which is what you get when you o
- [☐] Type diagnostics
      · No Luau type checking anywhere in the product. I enumerated every rule id emitted by the analysis cluster (grep "rule: '" across packages/evals/src/luau-*.mjs): analyzer-error, implicit-global, inconsistent-return, never-updated-loop-condit
      → There is no in-process Luau type checker and the Worker cannot spawn luau-lsp, so build the check where the types already are: add a type pass to packages/evals/src/luau-intel.mjs that walks the typeAnnotation/TypeAlias nodes the parser already records (luau-ast.mjs:583, :618) and emits findings for
- [~] Symbol navigation
      · Tool `find_symbol` at apps/worker/src/tools.ts:1251, name mode (tools.ts:1359 branch) backed by apps/worker/src/luau-review.ts:545 `symbolSearch`, which runs packages/evals/src/luau-graph.mjs indexPlace over every script and maps evals path
      · REFUTED: REFUTED. The claim is specifically about NAME mode, and name mode is the one branch that cannot run in production: tools.ts:1298 calls dumpScripts -> op `dump_scripts`, absent from every built plugin (see Static analysis
- [✓] Definition lookup
      · `find_symbol` with path + line + column returns `definedAt` — apps/worker/src/tools.ts:1284-1290 — via apps/worker/src/luau-review.ts:514 `symbolLookup`, which resolves through the scope-aware symbol table (crossReference) rather than by te
- [✓] Reference lookup
      · `find_symbol` returns `reads`, `writes` and a `references` list (path:line:column kind) for the binding at a position — apps/worker/src/tools.ts:1288-1292, from apps/worker/src/luau-review.ts:514 SymbolLookup.references. Tests: apps/worker/
- [~] Dependency inspection
      · BUILT AND TESTED BUT NOT REACHABLE. apps/worker/src/luau-review.ts:479-487 computes the full require graph — edges, `unresolved` (the require expressions that resolved to nothing), `cycles`, `roots` and topological `order` from requireOrder
      → In apps/worker/src/tools.ts, inside the whole-place branch of review_scripts.run (the return object built at tools.ts:1240-1250), read the declared flag: when a.dependencies === true, add to the reply `edges: place.dependencies.edges.map((e) => `${e.from} -> ${e.to}`).slice(0, 80)`, `unresolved: pla
- [~] Server and client context identification
      · apps/worker/src/luau-review.ts:302 `contextFindings` combines the class, the container the instance lives in (CLIENT_CONTAINERS / SERVER_CONTAINERS at luau-review.ts:290-293) and the source's API vocabulary (inferContext) to emit localscrip
      · REFUTED: REFUTED on deployment — and this one fails harder than it looks. Every finding contextFindings produces is gated on the script's class: luau-review.ts:328 sets `const cls = f.className ?? ''` and all four rules (localscr
- [✓] Remote event misuse detection
      · Rules live in packages/evals/src/roblox-antipatterns.mjs: remote-function-to-client:256, client-authoritative-currency:270, server-trusts-client-amount:283, unvalidated-remote-arg:304, remote-parented-before-handler:712, plus the dataflow r
- [✓] Infinite loop risk detection
      · Two detectors, deduplicated on purpose. CFG-based: packages/evals/src/luau-flow.mjs:454 `infiniteLoops` emits `no-yield-infinite-loop` (loop with no exit edge that never yields) and `never-updated-loop-condition`; it follows break out of ne
- [✓] Code diff preview
      · Producer: apps/worker/src/luau-review.ts:200 `diffHunks` (LCS over lines, context lines, hunk/line budgets) and :276 `diffStat`; emitted as a `code_diff` uiDetail block by edit_script at apps/worker/src/tools.ts:1162 and by format_script at
- [☐] Selective change application
      · Nothing lets a person (or the agent) apply PART of a proposed change. The diff surface is read-only markup: apps/web/src/lib/generative-ui/render.tsx:347 CodeDiffView renders hunks as spans with no checkbox, button or handler, and the block
      → Make hunks addressable and give them a write path. (1) apps/worker/src/luau-review.ts: have diffHunks stamp each hunk with a stable `id` (index plus the hunk's start lines) and include it in ReviewDiffHunk. (2) apps/web/src/lib/generative-ui/schema.ts:283 and validate.ts:767: accept the optional hun
- [~] Concurrent edit conflict detection
      · Two-sided and the two sides are proven to agree. apps/worker/src/luau-review.ts:158 sourceHash is FNV-1a/32 over UTF-8 BYTES; apps/plugin/src/Ops.luau:141 computes the same, and read_script returns it as baseHash (Ops.luau:207). The worker 
      · REFUTED: REFUTED — the 'two-sided' claim has exactly zero sides in production. Both halves live in the 2026-09-15 commit that added sourceHash to Ops.luau; the built plugin contains neither the string `sourceHash` nor `baseHash`.
- [✓] Script test result display
      · `run_spec` at apps/worker/src/tools.ts:1984 runs per-case Luau assertions in Studio and emits a `test_report` uiDetail block at tools.ts:2044-2065 with per-case name, status, message and duration. Rendered at apps/web/src/lib/generative-ui/
- [~] Verified script rollback
      · The restore path counts what it actually wrote and refuses to claim success otherwise. apps/plugin/src/Serializer.luau:164 restore writes each snapshot script's Source under pcall and increments scriptsWritten (Serializer.luau:213-214), the
      · REFUTED: REFUTED on deployment — the exact defect the claim says was removed is what a user gets today. I decompiled apps/plugin/release/golem-plugin.rbxm and the shipped Serializer.restore ends: `return { restored = true, instan

## 20. CONTEXT AND KNOWLEDGE RETRIEVAL  —  63%   ✓6 ~13 ☐1

- [✓] Current project context assembly
      · apps/worker/src/do/session.ts:1656 builds the run's system prompt from mode, studioConnected, placeName (from the persisted pluginState), bind.projectName, asset-library availability, project memory and layered personalisation; line 1690 ap
- [✓] Selected Studio object context
      · apps/plugin/src/Companion.luau:326-354 captures the selection with a real count plus a truncated list; apps/worker/src/do/session.ts:3057-3061 persists it and broadcasts `studio_selection`; apps/web/src/lib/use-project-socket.ts handles tha
- [✓] Script context selection
      · Agent side: apps/worker/src/tools.ts:1033 `list_scripts`, :1038 `read_script` (returns a baseHash so a stale write is refused), and the place-wide `dump_scripts` op with a char budget that reports truncation (packages/shared/src/index.ts:52
- [~] Project file context selection
      · The worker half is complete and permission-tested: apps/worker/src/index.ts:1224/1236/1274/1283 serve /api/projects/:id/files (+content, history, op), apps/worker/src/workspace-files.ts holds the rules, and the agent selects files with `wor
      → Two changes. (1) Mount the files drawer: apps/web/src/routes/workspace.tsx has drawer cases for 'checkpoints', 'search', 'credits' and 'memory' around lines 804-899 but none for files — add a `drawer === 'files'` Drawer rendering <FilesPanel projectId={projectId} canEdit={canEdit} /> and add a toolb
- [~] Conversation context selection
      · Selection is automatic and fixed: apps/worker/src/do/session.ts:1690 takes `select role, content from messages order by created_at desc limit 15` and truncates each to 4000 chars; the user's own message is pinned so the trim can never evict
      → The wire format already supports it: GatewayMessage carries `pinned` and apps/worker/src/transcript.ts:turnGroups/trimTranscriptReport never drop a pinned message. Expose it — add a 'Keep in context' action on a user or assistant turn in apps/web/src/components/ws/turn.tsx that POSTs to a new sessio
- [~] Documentation source ingestion
      · packages/corpus/src/chunk.mjs:19-20 reads raw/creator-docs and raw/luau-site and emits data/chunks.jsonl (8,326 chunks; hosts are create.roblox.com 8,056 and luau.org 270, kinds 'guide' 7,009 / 'api' 1,317). packages/corpus/src/upload.mjs p
      · REFUTED: REFUTED: the ingestion step reads two directories that NO LONGER EXIST, so a re-ingest today produces an empty corpus — and one half fails silently. chunk.mjs:19-20 sets CREATOR = raw/creator-docs/content/en-us and LUAU_
- [~] Repository source ingestion
      · The intake pipeline is real: packages/corpus/data/sources.json records 1,240 sources of which 1,144 are kind 'repo', packages/corpus/src/fetch.mjs checks out and licence-reads them, scan.mjs runs the security gate over each checkout, hash.m
      → Extend packages/corpus/src/chunk.mjs with a third producer that walks the licence-cleared repo checkouts under packages/corpus/raw (gate on sources.json record.licence.class being in fetch.mjs's FETCHABLE_CLASSES and record.security.safe === true), emits kind 'code' chunks with url = the GitHub blob
- [~] Manual knowledge uploads
      · A person can upload knowledge as a memory/instructions bundle: apps/web/src/components/ws/instructions-panel.tsx:457 is a real <input type="file" accept="application/json"> wired to importMemory (apps/web/src/lib/api.ts:376) against POST /a
      → Add a per-project knowledge upload. In apps/worker/src/index.ts add POST /api/projects/:id/knowledge behind withOwnedProject that accepts a text/markdown body (reuse checkWorkspacePath and WORKSPACE_MAX_BYTES from apps/worker/src/webtools.ts), chunks it with the same rules as packages/corpus/src/chu
- [✓] Source access validation
      · Two enforced gates. Runtime, for web sources: apps/worker/src/net-policy.ts compiles a host allowlist that refuses wildcards, one-label suffixes, IP literals, non-https schemes, embedded credentials and non-standard ports, re-checks every r
- [~] Source freshness indicators
      · The signal is computed and correct but never displayed. apps/worker/src/index.ts:2432-2451 adds an `indexed_at` column and :2459 writes it on every embed-batch; apps/worker/src/rag.ts:indexedAtFor reads it back and apps/worker/src/retrieval
      → Render it. The data is already on the wire as `citations[].freshness` / `ageDays`. Give search_docs an attribution panel (see 'Retrieval result attribution') whose source rows carry an age chip, and have apps/worker/src/tools.ts:2767 include `freshness` and `ageDays` in the objects it returns so the
- [~] Source reindexing controls
      · A real incremental re-index, not a re-upload. GET /api/admin/corpus-manifest (apps/worker/src/index.ts:2500) reports what the index actually holds (vecId, content_hash, embedded, indexed_at, paged by rowid) and returns {known:false} with 50
      · REFUTED: REFUTED on deployment: the incremental re-index CANNOT RUN against the live index. I ran the manifest route's own query against production D1 golem-corpus and it fails — `select rowid as rid, vec_id, content_hash, embedd
- [~] Context budget visibility
      · The worker measures and sends it, the browser stores it, and no pixel renders it. apps/worker/src/do/session.ts:1899-1908 broadcasts `context_budget` with usedChars/maxChars after every trim; packages/shared/src/index.ts:903 types it; apps/
      → Render it in apps/web/src/components/ws/turn.tsx (or thinking.tsx, which already draws the run's meters): import contextBudgetLabel/contextFill/contextOverBudget from './context-model', read `message.context` (already populated by use-project-socket.ts:684), and draw a meter plus the label under the
- [~] Context truncation disclosure
      · Same dead end as the budget, one step worse because the loss is real. apps/worker/src/transcript.ts:trimTranscriptReport returns droppedGroups/droppedChars measured as before-after; apps/worker/src/do/session.ts:1904-1907 attaches `dropped`
      → In apps/web/src/components/ws/turn.tsx, call truncationNote(message.context) from apps/web/src/components/ws/context-model.ts and render the returned string as a notice on the run when it is non-null (it is null when nothing was dropped, so no '0 turns dropped' can appear). Cover it in apps/web/test
- [~] Source inclusion controls
      · For ASSET sources this is complete: apps/web/src/components/asset-source-dialog.tsx, mounted at apps/web/src/routes/workspace.tsx:775, collects an allow-list ('apple_library' / 'creator_store' / 'from_scratch'), stored as the `asset_sources
      → Add a tool-permission editor to apps/web/src/components/ws/instructions-panel.tsx (it already reads and writes the scoped preferences via savePreferences, and already renders which layer won). List the source-bearing tools — search_docs, web_search, web_fetch, browse_page, workspace_read, search_ass
- [~] Source exclusion controls
      · Exclusion exists as NARROWING and is well tested, but only for asset sources and only through the same dialog: apps/worker/src/preferences.ts:145 narrowAssetSources makes a project able to drop a source the org allowed and never able to add
      → Give retrieval an exclusion list. Add an `excluded_sources` preference beside `asset_sources` in apps/worker/src/preferences.ts (array of url prefixes, validated and narrowed the same way — a project may add exclusions, never remove an org's), resolve it into AgentCtx where `assetSources` is resolve
- [~] Retrieval result attribution
      · The mechanism is built and tested on the worker side: apps/worker/src/retrieval.ts:564 buildCitations makes one numbered entry per SOURCE (three chunks of one page are one citation), :589 renderCitedContext numbers the model's context the s
      → Two halves. (1) In apps/worker/src/prompts.ts IDENTITY, add a rule that when search_docs returns results the reply must cite them by their [n] marker, and audit the run's finalText with auditCitations in apps/worker/src/do/session.ts:finishRun so an invented marker is caught rather than shipped. (2)
- [☐] Conflicting source identification
      · Searched apps/worker/src/retrieval.ts, rag.ts, semantic.ts, asset-library.ts and the whole of apps/worker/src, apps/web/src, packages/evals/src and packages/corpus/src for 'conflict', 'contradict', 'disagree', 'two sources' and 'stale versi
      → Add a conflict pass to apps/worker/src/retrieval.ts as a pure function beside dropIrrelevant — e.g. `flagConflicts(hits)` that groups hits by docSlug family/api symbol (the `doc_slug` column already exists in the chunks table, apps/worker/src/index.ts:2434) and marks a pair as conflicting when two d
- [✓] Permission-aware retrieval
      · Every scoped read binds a proven scope. apps/worker/src/do/session.ts:1645 builds the run's access context with memoryAccessFor(this.env, bind.ownerId, [bind.projectId]) — both ids from the DO's own binding, never from the request — and app
- [~] Deleted-source removal from retrieval
      · POST /api/admin/corpus-prune (apps/worker/src/index.ts:2528) deletes a batch of vecIds from the D1 `chunks` table AND the FTS5 mirror, then deletes the vectors, reporting `vectorsDeleted` separately so a half-succeeded prune cannot read as 
      · REFUTED: REFUTED by the production index itself. I compared the deployed D1 corpus against the shipped chunks.jsonl and found THREE concrete divergences that prove the prune has never run there. (1) `api-sparkles-1` ('Sparkles (C
- [✓] Retrieval failure and fallback visibility
      · apps/worker/src/retrieval.ts:463 classifyRetrieval returns a discriminated outcome — hits / miss / empty-index / unembedded-index / unsearchable / unavailable — plus `certain`, which is false whenever a backend was down or the census could 

## 19. MODEL SELECTION AND PROVIDER CONTROL  —  38%   ✓1 ~13 ☐6

- [~] Available model catalog
      · Catalogue is real: apps/worker/src/providers/registry.ts:29 allModels() aggregates 7 rows from apps/worker/src/providers/workers-ai.ts:47 (4 models), openai.ts:29, google.ts:37, deepseek.ts:23. It egresses on a live route, apps/worker/src/i
      → Add a 'Model catalog' panel to apps/web/src/routes/admin.tsx: add `adminModelRouting(adminKey)` to apps/web/src/lib/api.ts calling GET /api/admin/model-routing with the X-Admin-Key header (copy the shape of adminModelTest at api.ts:727), and render one table row per model showing label, provider, av
- [~] Model capability descriptions
      · Machine-readable capability facts per model exist and are enforced: apps/worker/src/providers/types.ts:30-48 defines supportsTools, supportsVision, contextWindow, maxOutput and the honesty field unverifiedFields; apps/worker/src/providers/r
      → Add a `description: string` field to the ProviderModel interface in apps/worker/src/providers/types.ts:30 and fill it for every entry in workers-ai.ts/openai.ts/google.ts/deepseek.ts with one sentence saying what the model is for (the justification comments already sitting above each entry, e.g. wor
- [~] Model context limits
      · The number exists and egresses: contextWindow is on every catalogue row (apps/worker/src/providers/workers-ai.ts:55 = 128_000) and is whitelisted onto GET /api/admin/model-routing at apps/worker/src/index.ts:2235; packages/evals/src/provide
      → Three changes. (1) In apps/web/src/components/ws/thinking.tsx, next to the reasoning-effort line at :187, render contextBudgetLabel(context) and truncationNote(context) from apps/web/src/components/ws/context-model.ts, fed by the context_budget message that use-project-socket.ts:659 already receives
- [~] Supported input modality display
      · The only statement in the product about which inputs are accepted is in the composer, and it is honest but hardcoded: apps/web/src/components/ws/composer.tsx:278 and :287 render the attach and mic controls disabled with titles "Attachments 
      → Add `inputModalities: ('text'|'image'|'audio')[]` to ProviderModel in apps/worker/src/providers/types.ts:30 (llama-3.2-11b-vision-instruct gets ['text','image'], the gpt-oss entries ['text']), whitelist it onto GET /api/admin/model-routing at apps/worker/src/index.ts:2233 and into the allowed-field 
- [☐] Supported output modality display
      · Searched apps/worker/src/providers/types.ts:30-48 (ProviderModel has only supportsTools/supportsVision/contextWindow/maxOutput/costs/unverifiedFields), the egress whitelist at apps/worker/src/index.ts:2222-2241 and its pinned field set at p
      → Add `outputModalities: ('text'|'image'|'audio'|'embedding')[]` to ProviderModel in apps/worker/src/providers/types.ts:30; set it on every existing entry and on the image/speech/embedding entries added per item 1 (flux -> ['image'], melotts -> ['audio'], whisper -> ['text'], bge -> ['embedding']). Wh
- [~] Estimated model cost display
      · A cost estimate IS displayed in two reachable places, but per MODE, not per model: apps/web/src/components/ws/composer.tsx:248 renders 'Typically N Credits' inside the mode menu and apps/web/src/routes/usage.tsx:324 renders the same figure 
      → Wire scripts/check-credit-figures.mjs into the gate so the published estimate cannot drift silently: add it as a case in scripts/gate-suite.mjs and as a `check:credits` script in the root package.json. Then add the per-model price to the admin catalog panel from item 1 (columns for inputCostPer1M/ou
- [~] Default model selection
      · Server-side defaults are real and enforced: DEFAULT_MODELS at apps/worker/src/gateway.ts:61-134 gives each key a default model id and chat() throws 'unknown model key' for anything else (gateway.ts:249-250), which apps/worker/tests/mode-ing
      → Add `defaultMode: ProductMode` to the Prefs interface at apps/web/src/lib/prefs.ts:108 and to DEFAULT_PREFS at :118 (default 'agent'), validate it in the parser at :202 the way sendKey is, add a <Choice> control for it in the Appearance or a new 'Building' section of apps/web/src/routes/settings.tsx
- [~] Per-conversation model selection
      · The mode chip is a real, reachable engine selector wired end to end: apps/web/src/components/ws/composer.tsx:229-253 renders the three-item radio menu, workspace.tsx maps the choice through PRODUCT_MODE_TO_SPECIALIST (packages/shared/src/in
      → Persist the per-conversation choice: in apps/web/src/routes/workspace.tsx:104, initialise mode from the existing per-project view-state store (writeViewChoice/readViewChoice, already used for the drawer at :88-102) under a key like `mode.${projectId}`, and write on every onModeChange. For a server-s
- [~] Per-run model override
      · The only per-run engine override the product makes is reasoning effort, and it is policy-chosen, not user-chosen: apps/worker/src/reasoning.ts classifies the step, GatewayRequest.reasoningEffort (packages/shared/src/index.ts:1057) carries i
      → Fix the stale hint first: change the placeholder at apps/web/src/routes/admin.tsx:250 from 'e.g. coder-large' to 'clay | stone | rune | memory | vision', and better, render it as a <select> populated from GET /api/admin/models (apps/worker/src/index.ts:2191) so it can never name a key the gateway do
- [☐] Organization-approved model policies
      · Descoped by a recorded owner decision, and genuinely absent. docs/design/TENANCY.md:31 records that `grep -rn "create table.*organizations" infra/supabase/migrations` returns nothing, and the closing section ('THE DECISION, which is the own
      → Not planned — do not build unless the tenancy decision in docs/design/TENANCY.md is reversed. If it is: the hook is apps/worker/src/gateway.ts:138 getModels(env), which would need a scope argument and a per-scope allowlist merged over DEFAULT_MODELS, plus a refusal path in chat() at gateway.ts:249 t
- [~] Provider availability indicators
      · Availability is computed correctly and is admin-readable, but no person sees an indicator. Each adapter computes it from env at call time (apps/worker/src/providers/openai.ts:213-228 is the pattern; Workers AI keys on the binding's existenc
      → Add a 'Providers' panel to apps/web/src/routes/admin.tsx rendering the `models[].available` / `unavailableReason` / `reason` and the `health[]` rows from GET /api/admin/model-routing (same fetcher as item 1), with the health counters as a per-provider status dot. For the user-facing half, have apps/
- [☐] Model retirement notices
      · No retirement or deprecation concept exists for models. ProviderModel (apps/worker/src/providers/types.ts:30-48) has no such field, and the egress field set is pinned closed at packages/evals/src/security.test.mjs:436-445 with none. The one
      → Add `retiredAt?: number` and `supersededBy?: string` to ProviderModel in apps/worker/src/providers/types.ts:30 and set them on the GLM entry at apps/worker/src/providers/workers-ai.ts:92; make apps/worker/src/providers/registry.ts:69 capabilityTable() force available:false with reason 'retired' for 
- [☐] Fallback model configuration
      · chat() resolves exactly one model and never tries a second. apps/worker/src/gateway.ts:249-251 picks models[req.model]; the loop at :351-381 retries the SAME adapter with the SAME encoded payload; on exhaustion it releases the reservation a
      → In apps/worker/src/gateway.ts, replace the single-adapter retry loop at :349-381 with a lane walk: add `laneFor(modelKey): {provider, modelId}[]` to apps/worker/src/providers/registry.ts beside selectProvider (reuse its availability + capability filtering so the eligible list and the rejection ratio
- [☐] Fallback transparency
      · There is no fallback (see previous item), so there is nothing that reports one, and no channel to report it on. GatewayResponse (packages/shared/src/index.ts:1068-1077) carries `provider` and `model` but no field saying a substitution occur
      → Depends on the previous item. Once a lane walk exists in apps/worker/src/gateway.ts, add `fellBackFrom?: string` to GatewayResponse in packages/shared/src/index.ts:1068 and set it when the serving model differs from the one first chosen; add a ServerMsg variant `{ type: 'engine_fallback'; msgId: str
- [~] Provider timeout handling
      · Timeouts are handled at the RUN level and classified in the taxonomy, but no individual inference call has a deadline. Present: RUN_WALL_MS at apps/worker/src/do/session.ts:272-276 (clay 5m / stone 20m / rune 45m), evaluated by runDurationV
      → Add a per-call deadline to the provider layer. Put `timeoutMs` on InvokeContext in apps/worker/src/providers/types.ts:158 (default 120_000), pass `AbortSignal.timeout(ctx.timeoutMs)` into the fetch at apps/worker/src/providers/openai.ts:197 and the equivalent in google.ts/deepseek.ts, and wrap the e
- [✓] Provider rate-limit handling
      · Built and proven end to end for the provider that actually runs. Classification distinguishes a pre-run refusal (nothing billed, free to retry) from a billed failure: ErrorClassification.retryable at apps/worker/src/providers/types.ts:97-10
- [~] Provider outage handling
      · A single failed call is handled well; a sustained outage is not detected or acted on. Handled: apps/worker/src/gateway.ts:365-380 records the failure into the health ring with its classified kind and writes a model_call trace with outcome '
      → Give health a verdict and let refusal read it. In apps/worker/src/providers/health.ts, add `providerDegraded(provider): boolean` returning true when the retained ring has >= 5 samples and a failure rate above ~60%, and export it through providers/index.ts. In apps/worker/src/gateway.ts:246 chat(), c
- [~] Provider-specific error normalization
      · A single taxonomy, one translation per provider, tested per adapter. The vocabulary is apps/worker/src/providers/types.ts:88-95 (rate_limit | auth | context_length | content_filter | transient | unknown) with ErrorClassification at :97-104 
      · REFUTED: The shared taxonomy is real, but two load-bearing statements in the evidence are false, and one of them concerns a named adapter. REFUTATION 1 - Google has no provider-specific error translation. The claim says 'Each ada
- [~] Actual model attribution per response
      · Attribution is produced on every call and reaches two admin surfaces, but never the response a user reads. Produced: apps/worker/src/gateway.ts returns provider and model on every GatewayResponse (the return at the end of chat(), typed at p
      → Fix the false label first: delete the hardcoded 'glm-5.3-flash' span at apps/web/src/routes/admin.tsx:75 or replace it with the distinct model ids present in the loaded spend breakdown (d.breakdown). Then carry real attribution to the turn: add `model?: string; provider?: string` to MessageDto in pa
- [☐] Organization controls for externally processed data
      · Descoped by the same recorded decision as the other org item: docs/design/TENANCY.md ends with the owner's three options and the checklist records option 3 (single-user, per-project sharing) as taken 2026-09-15; TENANCY.md:31 shows no organ
      → Not planned — do not build unless the tenancy decision in docs/design/TENANCY.md is reversed. If it is: the enforcement point is apps/worker/src/providers/registry.ts:133 selectProvider(), which would take an allowed-processor set alongside its capability needs and reject providers outside it with a

## 22. AGENT PLANNING  —  45%   ✓3 ~12 ☐5

- [✓] Goal capture
      · apps/worker/src/do/session.ts:475 `runIntentFor()` derives a RunIntent (summary/checklist/questions) from the user's own words with zero model cost; called at :1625, persisted onto AgentState at :1721 so a refresh replays it, broadcast once
- [~] Goal editing before execution
      · What exists: a plan's request text is handed to the composer as editable text before it runs — apps/web/src/routes/roadmap.tsx:110-115 navigates with `{state:{seed,mode}}`, apps/web/src/routes/workspace.tsx:374-382 reads it, apps/web/src/co
      → Add a client frame `{type:'revise_intent'; msgId; checklist: string[]; questions?: string[]}` to packages/shared/src/index.ts's ClientMsg union and handle it in apps/worker/src/do/session.ts next to the `edit_resend` case at :1444: replace `agent.intent` and re-broadcast `run_intent`. In apps/web/sr
- [~] Clarifying question support
      · Extraction and display are real: apps/worker/src/semantic.ts:807 pushes a question when a building noun is ambiguous ('reads as either a room you stand inside or a building seen from outside') and :875 pushes one for every hedged clause; th
      → Add an `ask_user` tool in apps/worker/src/tools.ts that returns a sentinel result, and in apps/worker/src/do/session.ts's step loop treat that result as a run-suspend: persist AgentState with a new status 'awaiting_user', add `{type:'msg_end'; stopReason:'awaiting_input'}` to packages/shared/src/ind
- [~] Explicit assumption display
      · The roadmap surface does it: apps/web/src/routes/roadmap.tsx:267 renders 'Reads as <genre> (<confidence in words>)' and :272-275 prints the worker's own honesty notes about what the scan could not see, tested at apps/web/tests/roadmap-model
      → Add `assumptions: string[]` to `RunIntent` in packages/shared/src/index.ts:606, populate it in apps/worker/src/do/session.ts:475-481 from `intentCheck(request).notes` (capped like the other two lists), add an `assumptions?: string[]` field to TimelineStage in apps/web/src/components/ws/thinking-mode
- [~] Proposed execution plan
      · Two real surfaces. (1) Plan mode: apps/worker/src/prompts.ts:120-147 makes the plan the deliverable ('Deliver an ordered roadmap. Each step should be small enough to hand to a builder and check off') and apps/worker/src/router.ts:89-95 with
      → In apps/worker/src/tools.ts add a `propose_plan` tool whose arguments are `{steps:[{title,detail?,tool?}]}` and whose handler sets `ctx.uiDetail = {v:1, blocks:[{type:'build_plan', title, steps: steps.map(s=>({...s,status:'pending'}))}]}` (the same pattern as the test_report at tools.ts:2045). Add i
- [~] Plan step descriptions
      · The roadmap half is real and reachable: MilestoneSpec.build ('what a builder must actually do', apps/worker/src/roadmap.ts:699-700) becomes MilestoneBrief.steps (roadmap.ts:1595, 1637) and renders as a list under 'It would build' at apps/we
      → Same producer as 'Proposed execution plan': make some worker tool emit a `build_plan` UI document. Concretely, in apps/worker/src/do/session.ts's step loop, after each tool_end, re-emit the run's plan with updated statuses as `ctx.uiDetail`, or add the `propose_plan` tool in apps/worker/src/tools.ts
- [✓] Plan dependencies
      · Worker: MilestoneSpec.dependsOn (apps/worker/src/roadmap.ts:691), Kahn ordering so a dependency always precedes its dependent (roadmap.ts:701-720 region, comment at :1467-1475), and per-milestone `blockedBy`. Client: apps/web/src/components
- [~] Required tool identification
      · The field exists and is rendered but is never populated. `PlanStep.tool?: string` at apps/web/src/lib/generative-ui/schema.ts:203; apps/web/src/lib/generative-ui/render.tsx:836 renders it as a monospace chip on each step; apps/web/src/route
      → When adding the `propose_plan` tool to apps/worker/src/tools.ts (see 'Proposed execution plan'), require a `tool` name per step and validate each against `toolNames()` so a plan cannot name a tool that does not exist. Separately, add `tools: readonly string[]` to MilestoneSpec in apps/worker/src/roa
- [~] Required capability checks
      · Execution-time checks are real: every roadmap route refuses with 409 and a reason when the Studio plugin is not attached (apps/worker/src/index.ts:1553-1554 and :1621-1622, rationale at :1530-1539), and apps/worker/src/router.ts:90-92 drops
      → Add `requires: {studio: boolean; assetLibrary: boolean; robloxKey: boolean}` to MilestoneBrief in apps/worker/src/roadmap.ts:1588-1601, computed in `executionBrief` (:1633) from the spec, and render unmet ones as a blocking note in apps/web/src/components/roadmap/brief-dialog.tsx next to the existin
- [~] Required permission checks
      · Server-side role checks are real and tested: apps/worker/src/collab.ts:83-107 defines the action vocabulary and `can()`, and apps/worker/tests/effective-permissions.test.mjs:42 'CONTROL: the answer AGREES with can() for every role and every
      → Add a per-tool permission control to apps/web/src/components/ws/instructions-panel.tsx (which already reads and writes scoped preferences): list the tool names from a shared registry, offer allow/ask/deny per tool, and PUT them as `tool_permissions` on the existing preferences endpoint that apps/web
- [☐] Estimated usage
      · No pre-run usage estimate is shown to anyone. The only estimates in the codebase are internal budget RESERVATIONS the user never sees: apps/worker/src/pricing.ts:61-64 `estimateNeurons` ('Pre-flight estimate used to RESERVE budget'), called
      → Add `GET /api/projects/:id/estimate?mode=&chars=` to apps/worker/src/index.ts that returns `{neuronsLow, neuronsHigh, creditsLow, creditsHigh}` from apps/worker/src/pricing.ts (`estimateNeurons` for the low bound, MODE_BASE_TOKENS × the mode's step ceiling from apps/worker/src/do/session.ts:208/217 
- [~] Estimated cost range
      · A real range is shown before a run, but it is per-mode and static, not per-plan. apps/web/src/components/ws/composer.tsx:248 renders '{info.blurb} Typically {info.typicalCredits} Credits.' in the mode popover, from PRODUCT_MODE_INFO → MODE_
      → In apps/worker/src/roadmap.ts add `creditsLow`/`creditsHigh` to the Milestone shape (around :1420-1444) computed as spec.runs × the low and high ends of MODE_INFO[spec.mode].typicalCredits from packages/shared, and render it on the card beside the effort chip in apps/web/src/components/roadmap/miles
- [☐] Estimated execution duration
      · Every duration in the product is measured, never predicted, and that is a stated design rule: apps/web/src/components/ws/activity-model.ts:108 'Measured, never inferred', :281-282 rejects negative measured durations rather than substituting
      → Record `durationMs` per finished run (it is already computed in apps/worker/src/do/session.ts's finishRun) into the D1 analytics sink at apps/worker/src/analytics-sink.ts keyed by mode, then add a `GET /api/projects/:id/estimate` field `p50DurationMs`/`p90DurationMs` from that history. Render it in 
- [✓] Expected output definition
      · MilestoneSpec.acceptance ('how the result is checked — becomes the brief's acceptance list', apps/worker/src/roadmap.ts:701) is carried onto MilestoneBrief.acceptance (roadmap.ts:1596, populated at :1660), embedded verbatim into the request
- [~] Verification step planning
      · Verification criteria ARE planned in the brief — the acceptance list above, written as checkable statements ('A player spawns on the ground, not in the air.', apps/worker/src/roadmap.ts:718). Five verifiers exist and their descriptions tell
      → Extend the `propose_plan` payload (see 'Proposed execution plan') so the emitted build_plan includes the verification steps as pending entries with their tool names (`run_and_check`, `audit_build`, `inspect_visually`), and in apps/worker/src/prompts.ts:150-156 require stone/rune to include at least 
- [~] Plan approval
      · A genuine approval gate exists for the roadmap path: apps/web/src/components/roadmap/brief-dialog.tsx shows the exact request, its steps and its acceptance before anything runs (its header at :1-7 says a button that silently composes an ins
      → Depends on the suspend/resume path from 'Clarifying question support'. Once a run can pause: make the `propose_plan` tool in apps/worker/src/tools.ts suspend the run after emitting its build_plan, and add an Approve / Edit / Cancel control under the plan block in apps/web/src/lib/generative-ui/rende
- [☐] Plan revision
      · No plan can be revised because no plan is stored. The roadmap is recomputed from a fresh Studio scan on every request and persisted nowhere — apps/worker/src/index.ts:1550-1560 and :1615-1627 both call `roadmapForProject` afresh, the result
      → Persist a plan before it can be revised: add a `plans` table to the SessionDO schema in apps/worker/src/do/session.ts:495-509 holding `{id, milestoneId|null, steps json, acceptance json, seq, created_at}`, write one when a brief is opened (apps/worker/src/index.ts:1615) or when `propose_plan` runs, 
- [☐] Plan version history
      · Nothing versions a plan, because nothing stores one — see the persistence search above: apps/worker/src/roadmap.ts returns a fresh object with only `generatedAt` (:1575), no roadmap or milestone table exists in infra/supabase/migrations or 
      → Build on the `plans` table from 'Plan revision': keep every revision as a new `seq` row rather than an update, mirroring the append-only rule in apps/worker/src/version-history.ts:1-23 (a restore appends, never rewinds). Add `GET /api/projects/:id/plans/:planId/history` in apps/worker/src/index.ts a
- [☐] Scope change visibility
      · Nothing compares delivered work against an agreed scope and reports the delta. Searched: grep -i 'scope' across apps/worker/src and apps/web/src returns only Roblox API key scopes (apps/web/src/components/roblox-key-panel.tsx:29-41, package
      → After the run loop finishes in apps/worker/src/do/session.ts's finishRun, diff the mutating ops in the oplog against `agent.intent.checklist` and broadcast a new `{type:'run_scope'; msgId; delivered: string[]; notDelivered: string[]; extra: string[]}` message (add it to packages/shared/src/index.ts'
- [~] Plan-to-execution traceability
      · The two halves exist and nothing joins them. Forward link: apps/web/src/routes/roadmap.tsx:113 hands a milestone to the workspace as `{state:{seed: request, mode}}` — the prose only; the milestone id does not travel, and neither the message
      → Carry the id: change apps/web/src/routes/roadmap.tsx:113 to send `{seed, mode, milestoneId}`, have apps/web/src/routes/workspace.tsx:374-382 pass it to the socket's chat frame, add `milestoneId?: string` to the chat frame in packages/shared/src/index.ts:420 and a `milestone_id` column to the message

## 26. ROBLOX SCENE BUILDING  —  73%   ✓10 ~9 ☐1

- [✓] Explorer hierarchy inspection
      · Agent tool `get_project_tree` registered and Studio-gated at apps/worker/src/tools.ts:1021-1033; plugin handler `handlers.get_tree` at apps/plugin/src/Ops.luau:159. apps/worker/tests/studio-op-parity.test.mjs:48 asserts `get_tree` is in the
- [✓] Instance property inspection
      · Tool `get_instance` at apps/worker/src/tools.ts:1387-1425 reads class, child count, grouped common properties and attributes and emits a `property_inspector` uiDetail block. The renderer exists and is reached: apps/web/src/lib/generative-ui
- [✓] Selected object synchronization
      · Full loop, both directions. Push: apps/plugin/src/init.server.luau:91 connects Selection.SelectionChanged and sends an event built by Companion.selectionEvent. Worker re-derives rather than trusts: apps/worker/src/companion.ts:78 readSelect
- [✓] Primitive creation
      · Tool `create_instances` at apps/worker/src/tools.ts:1341-1352 (typed props: Vector3/CFrame/Color3/EnumItem/BrickColor/UDim2/…); plugin handler apps/plugin/src/Ops.luau:325 calling createFromSpec at Ops.luau:96. Real instances are created an
- [✓] Model assembly
      · Two mechanisms. (a) create_instances nests children recursively — createFromSpec recurses at apps/plugin/src/Ops.luau:117-121 — and apps/plugin/tests/ops.spec.luau:399-415 builds a `Model` named NestedGate with a nested `MeshPart` child and
- [~] Grouped object transforms
      · BUILT AND TESTED BUT NOTHING CALLS IT. `transform_instances` at apps/plugin/src/Ops.luau:845-902 resolves a Model to the BaseParts under it (partsUnder, Ops.luau:794) and rotates ABOUT THE MODEL rather than the world origin; argument valida
      → apps/web has no companion panel. Add one — e.g. apps/web/src/components/ws/companion-panel.tsx mounted from apps/web/src/routes/workspace.tsx — with move/rotate/scale controls that POST {op:{op:'transform_instances',paths,move?,rotate?,scale?}} to /api/projects/:id/studio/op via a new studioOp() hel
- [~] Object duplication
      · `clone_instances` at apps/plugin/src/Ops.luau:904-945 honours Archivable, refuses services, and gives each clone a unique resolvable path (uniqueName, Ops.luau:809). Tests: apps/plugin/tests/companion.spec.luau:430 ('two clones of one part 
      → Either register a `duplicate_instances` tool in apps/worker/src/tools.ts that runs op {op:'clone_instances',paths,parent?} (same shape as delete_instances at tools.ts:1362), or add a Duplicate button to the companion panel POSTing to /api/projects/:id/studio/op. Registering the tool is the smaller c
- [~] Object renaming
      · The checklist's existing mark points at apps/web/src/lib/rename-project.ts, which renames a PROJECT, not a scene object — wrong evidence. The real thing is `rename_instance` at apps/plugin/src/Ops.luau:1037-1078: it validates the name (apps
      → Register a `rename_instance` tool in apps/worker/src/tools.ts (args: path, name) that runs op {op:'rename_instance',path,name}, so the agent's renames go through the collision and path-round-trip guards in apps/plugin/src/Ops.luau:1037 instead of a raw Name assignment. Add it to the `case` list in p
- [~] Object parenting
      · `move_instances` at apps/plugin/src/Ops.luau:373 reparents and reports the new path; tested at apps/plugin/tests/handlers.spec.luau:98 ('a move reparents and reports the new path'), :112 (a bad destination moves nothing), :125 (it takes an 
      → Decide the open question that apps/worker/tests/tools-viewport.test.mjs:79 records. Either (a) register `move_instances` in apps/worker/src/tools.ts behind the pre-run checkpoint that apps/worker/src/do/session.ts:1744 already takes, and update that test's assertion, or (b) expose it as a drag-to-re
- [~] Object grouping and ungrouping
      · `group_instances` (apps/plugin/src/Ops.luau:947-982) creates the Model, moves the targets under it, validates the name with the rename rule, and reports how many came from other parents; `ungroup_instances` (Ops.luau:984-1035) refuses anyth
      → Register `group_instances` and `ungroup_instances` in apps/worker/src/tools.ts alongside create_instances (tools.ts:1341), forwarding {op:'group_instances',paths,name?} and {op:'ungroup_instances',paths}; add both names to phaseForTool in packages/shared/src/index.ts:491 (phase 'building') or apps/w
- [✓] Property editing
      · Tool `set_properties` at apps/worker/src/tools.ts:1354-1360 → op `set_props` → apps/plugin/src/Ops.luau:339-358, which sets each property and each attribute independently and returns `set` plus per-property `propIssues` rather than failing 
- [✓] Material and color editing
      · Material is an EnumItem and Color a Color3 in the same typed-prop path as every other property (apps/worker/src/tools.ts:1346 names both in the tool contract; decode at apps/plugin/src/Paths.luau:105-130), with EnumItem decode tested at app
- [✓] Lighting configuration
      · `set_mood` at apps/worker/src/tools.ts:1731-1787: eight complete art-directed presets at apps/worker/src/worldbuilding.ts:88, compiled to Luau by moodLuau at worldbuilding.ts:422, which tags everything it creates with an AppleMood attribute
- [~] Collision configuration
      · The READ half exists and ships: apps/plugin/src/Generation.luau:749-780 fails a model in which no part has CanCollide=true ('players will walk straight through this') and warns on PreciseConvexDecomposition meshes, with a concrete fix strin
      → Two separable pieces. (1) Test the existing check: add a case to apps/plugin/tests/inspect.spec.luau alongside the anchoring tests at :91 that builds a model whose parts all have CanCollide=false and asserts the 'collision' check fails with the CanCollide remediation. (2) Add collision-group support
- [☐] Constraint configuration
      · Searched apps/worker/src, apps/plugin/src, apps/plugin/tests, packages/shared/src and apps/worker/tests (case-insensitive) for WeldConstraint, HingeConstraint, AlignPosition, AlignOrientation, Motor6D, SpringConstraint, PrismaticConstraint,
      → Add a constraint pass to the model QC in apps/plugin/src/Generation.luau, next to the anchoring check at :783: for every unanchored BasePart in the model, walk for a WeldConstraint/Motor6D/RigidConstraint whose Part0 or Part1 is that part (or a Weld/joint reaching it) and fail the 'anchoring' check 
- [~] Spawn point placement
      · Detection and prescription are real and shipped: apps/worker/src/roadmap.ts:275 detects `SpawnLocation` count >= 1, roadmap.ts:713-718 is the build brief ('Place a SpawnLocation on solid ground at the entrance to the main play area') with a
      → Extend the audit capture in apps/worker/src/build-audit.ts (the AUDIT_LUAU pass and AuditPart at :36) to emit SpawnLocation positions, then add a metric in auditMetrics (build-audit.ts:214) such as `spawnsUngrounded` — a spawn with no part surface within ~1 stud directly beneath it — and a blocking 
- [~] Interaction object configuration
      · The product recognises interaction objects but does not configure them. apps/worker/src/roadmap.ts:47 scans for ClickDetector and ProximityPrompt; roadmap.ts:294 detects a ProximityPrompt as 'NPC interaction' and roadmap.ts:1339 prescribes 
      → Add a 'dialogue-story' entry to FAMILY_HINTS in apps/worker/src/design-brief.ts:52 (e.g. /\b(npc|dialogue|dialog|shopkeeper|conversation|quest ?giver)\w*/i -> 'dialogue-story') so the ProximityPrompt rule at packages/design/src/rules.mjs:754 can actually be selected for an NPC request, and extend th
- [✓] Supported UI instance generation
      · The tool contract declares UI explicitly and carries the UI datatypes: apps/worker/src/tools.ts:1346 ('Create instances (parts, models, UI, folders…)') with UDim2, UDim, Vector2 (AnchorPoint) and Rect in the supported prop-type list; decode
- [✓] Scene validation after modification
      · AUTOMATIC, in the run loop: apps/worker/src/do/session.ts:2024-2081 — when a run mutated the place for a visual request and has not yet been critiqued, it runs `inspect_visually`, and a failing critique is pushed back into the conversation 
- [~] Scene changes linked to originating runs
      · IN FLIGHT the link exists and is load-bearing: PendingOp carries `runId` (packages/shared/src/index.ts:244), set at apps/worker/src/do/session.ts:1976 and :2430, and apps/worker/src/op-attribution.ts:47 partitionOpsByRun (called at session.
      → Add a `run_id` (message id) column to the `oplog` table in apps/worker/src/do/session.ts:508, with the same `alter table oplog add column` migration pattern already used at session.ts:520, and write `this.currentMsgId` into it at the insert on session.ts:2882. Then surface it: the op-log read at ses

## 23. AGENT RUN LIFECYCLE  —  70%   ✓11 ~6 ☐3

- [☐] Queued run state
      · Searched packages/shared/src/index.ts:419-453 (ClientMsg) and :860-920 (ServerMsg) for any queued/pending run message — none. The run's own status union is only 'idle'|'running'|'stopping' (apps/worker/src/do/session.ts:108) and AgentPhase 
      → Add a queued run state end to end. In packages/shared/src/index.ts add 'queued' to the run lifecycle (a ServerMsg `{type:'run_queued', msgId, position}` plus a queued AgentPhase or a RunSnapshot.queued flag). In apps/worker/src/do/session.ts startRunInner (line 1589) replace the 'busy' broadcast at 
- [~] Preparing run state
      · A real preparation stage exists but no state announces it. apps/worker/src/do/session.ts:1740-1763 takes the automatic pre-run place checkpoint before the first step; that calls createCheckpoint (session.ts:3303-3305) which issues a full `s
      → In apps/worker/src/do/session.ts, move the phase broadcast at lines 1728-1729 so that the pre-run checkpoint block (lines 1740-1763) is bracketed by `agent.phase='checkpointing'; this.broadcast({type:'agent_status', phase:'checkpointing'})` before createCheckpoint and the existing 'planning'/'unders
- [✓] Running run state
      · apps/worker/src/do/session.ts:1696 sets status 'running'; runStep broadcasts agent_status with phase/step/totalSteps/creditsSpent at session.ts:1915 and again per tool at :2151-2157. Client stores it at apps/web/src/lib/use-project-socket.t
- [☐] Waiting-for-user run state
      · The codebase says so in its own words: apps/worker/src/preferences.ts:476-478 — 'nothing in this product can interrupt a run to ask, so leaving an `ask` tool in the set would make "ask me first" mean "go ahead"' — which is why applyToolPerm
      → Build a run-blocking question path: add `{type:'run_question', msgId, questionId, prompt, options}` to ServerMsg and `{type:'run_answer', questionId, answer}` to ClientMsg in packages/shared/src/index.ts; add a 'waiting_for_user' member to the AgentState.status union in apps/worker/src/do/session.ts
- [✓] Waiting-for-tool run state
      · apps/worker/src/do/session.ts:2150-2158 sets agent.phase = phaseForTool(call.name), broadcasts agent_status carrying the tool name, then broadcasts tool_start immediately before awaiting runTool; tool_end follows at :2167 with ok/summary/de
- [☐] Paused run state
      · No pause exists for an agent run. packages/shared/src/index.ts:419-453 (ClientMsg) has chat/edit_resend/stop/resume/checkpoint_create/checkpoint_restore/presence/ping and no pause; AgentState.status is 'idle'|'running'|'stopping' only (apps
      → Add `{type:'pause'}` and `{type:'unpause'}` to ClientMsg in packages/shared/src/index.ts; add 'paused' to the AgentState.status union in apps/worker/src/do/session.ts:108; write the pause request to its own storage key beside stopRequested (new file modelled on apps/worker/src/stop-signal.ts — do NO
- [✓] Completed run state
      · apps/worker/src/do/session.ts:2113 finishRun(agent,'done') on the normal exit, plus :1858 (time limit) and :1863 (step limit); finishRun writes the assistant row with the tool trace (session.ts:2402), broadcasts msg_end with stopReason and 
- [✓] Failed run state
      · The existing ✓ pointed at a playtest frame-freshness test and is wrong; the real proof is elsewhere. apps/worker/src/do/session.ts:1828 finishRun(agent,'error',msg) from the alarm's catch, with named branches for BudgetError (:1795), RateLi
- [✓] Cancelled run state
      · The existing ~ pointed at apps/web/src/lib/billing-copy.ts (subscription cancellation) and is wrong. Real path: apps/worker/src/do/session.ts:1515-1527 writes the stop to its OWN storage key via requestStop (apps/worker/src/stop-signal.ts, 
- [✓] Run progress persistence
      · AgentState is persisted at the head of every step (apps/worker/src/do/session.ts:1910), at its tail (:2231) and on every early return that re-arms the alarm (:2078, :2100), through persistWithShedding (session.ts:2326-2328 → apps/worker/src
- [✓] Run recovery after browser refresh
      · On socket accept the worker pushes the live run unasked: apps/worker/src/do/session.ts:818-820 `const live = await this.runSnapshot(); if (live) server.send({type:'run_state', run: live})`, built at session.ts:1344-1361 from persisted Agent
- [~] Run recovery after connection loss
      · The live-run half works: apps/web/src/lib/use-project-socket.ts:788-801 reconnects with exponential backoff and jitter, :830 reconnects on the browser 'online' event, and the fresh socket receives run_state from apps/worker/src/do/session.t
      → Two changes. (1) apps/worker/src/do/session.ts:819: send the message unconditionally — `server.send(JSON.stringify({type:'run_state', run: live}))` — the wire type already permits null (packages/shared/src/index.ts:913) and the 'resume' handler at session.ts:1408-1410 already sends null. (2) apps/we
- [~] Run cancellation acknowledgement
      · The TERMINAL acknowledgement exists and is good: msg_end with stopReason 'stopped' (apps/worker/src/do/session.ts:2414) renders as 'Stopped.' (apps/web/src/components/ws/turn.tsx:31) and 'Stopped by you' (apps/web/src/components/ws/activity
      → In apps/worker/src/do/session.ts:1515-1527: after requestStop succeeds, broadcast an acknowledgement — reuse agent_status with a new 'stopping' phase added to AgentPhase in packages/shared/src/index.ts:464 (and to both exhaustive Record<AgentPhase,…> tables, apps/web/src/components/ws/thinking-model
- [✓] Run timeout enforcement
      · Per-mode wall clock: RUN_WALL_MS at apps/worker/src/do/session.ts:272-276 (clay 5m, stone 20m, rune 45m), evaluated by runDurationVerdict (session.ts:303-344) and checked FIRST in runStep, before the step limit, so the run is told what actu
- [~] Step-level checkpoints
      · Two real things exist and neither is a per-step restore point. (a) The RUN's state is checkpointed every step — persistAgent at the head and tail of runStep (apps/worker/src/do/session.ts:1910, :2231) with shedding (persist.ts) — so a crash
      → In apps/worker/src/do/session.ts runStep, after the tool loop at line ~2230 and before persistAgent, if this step's trace contains a successful MUTATING_TOOLS entry, call `await this.createCheckpoint(\`step ${agent.step}\`, 'auto')` guarded so a failure is reported and does not abort the run (copy t
- [~] Safe continuation from checkpoints
      · Restore is real and is VERIFIED rather than assumed: apps/worker/src/do/session.ts:3377 restoreCheckpoint drives a `restore` op with a 120s budget and reports the plugin's own fidelity verdict, pinned by apps/worker/tests/restore-fidelity.t
      → Either implement continuation or remove the promise. To implement: add `{type:'continue'; fromMessageId?: string}` to ClientMsg in packages/shared/src/index.ts:419, and in apps/worker/src/do/session.ts add a handler beside 'chat' (session.ts:1441) that rebuilds AgentState from the last assistant row
- [✓] Partial result preservation
      · finishRun (apps/worker/src/do/session.ts:2330) runs on every terminal reason and always writes the assistant row with the full tool trace (session.ts:2402) — nothing rolls back mutations already applied to the place, and checkpoints are unt
- [~] Terminal state immutability
      · Explicit and tested for the nested PLAYTEST run: apps/worker/src/playtest-stream.ts:28-33 declares TERMINAL/isTerminal and :70 `advance` returns the run unchanged once terminal, pinned by apps/worker/tests/playtest-stream.test.mjs:69 'a ter
      → Add an explicit freeze on both sides. In apps/worker/src/do/session.ts:2330, make finishRun's first statement `if (agent.status === 'idle') return;` before it sets status idle — mirroring isTerminal in apps/worker/src/playtest-stream.ts:31 — so a double call is a no-op instead of a primary-key throw
- [✓] Concurrent run conflict handling
      · Two layers. (1) An in-memory gate set synchronously before any await: apps/worker/src/do/session.ts:1561 `private readonly startGate = singleFlight()` used at :1583, with the header at :1563-1576 explaining that the storage read deciding 'i
- [✓] Per-run execution history
      · User-facing, per run, and reachable: each run's tool trace (tool, summary, ok, durationMs) is written with the assistant row at apps/worker/src/do/session.ts:2402, served back by the history route at session.ts:954-967 and the export at :10

## 24. APPROVALS AND TOOL PERMISSIONS  —  45%   ✓3 ~12 ☐5

- [✓] Read-only tool permissions
      · apps/worker/src/router.ts:56 PLAN_TOOLS is an inspection-only toolset; apps/worker/src/router.ts:89 toolsForMode returns it for mode 'clay' AND for any unrecognised mode (the default branch fails closed, router.ts:105-113). It is user-reach
- [~] Write tool permissions
      · The mechanism is complete and tested in the worker, and has no UI. apps/worker/src/preferences.ts:107 TOOL_PERMISSIONS = allow|ask|deny, :293 validates each entry against the real tool-name allowlist, :480 applyToolPermissions narrows the m
      → Add a tool-permission section to apps/web/src/components/ws/instructions-panel.tsx, beside the existing coding-style/response-length controls: list the write tools the agent can call (edit_script, format_script, create_instances, set_properties, delete_instances, run_luau, run_and_check, insert_asse
- [~] Destructive action permissions
      · Destructive tool calls get protection but not a permission. Real code: apps/worker/src/tools.ts:1561 run_and_check REFUSES to playtest if a protective checkpoint cannot be taken first (needsProtection at apps/worker/src/playtest.ts:134 fail
      → Add a `destructive: boolean` field to the ToolImpl interface at apps/worker/src/tools.ts:207 and set it true on delete_instances, run_luau, run_and_check, edit_script, set_properties and install_module. Then extend apps/worker/src/preferences.ts with a `destructive_tools` preference ('allow' | 'deny
- [✓] External network permissions
      · A real, enforced, tested network permission boundary. apps/worker/src/net-policy.ts:80 compileHostPolicy refuses a whole allowlist rather than partially applying it (a `*` or one-label suffix kills the list); :128 checkUrl refuses http, IP 
- [~] Project-specific tool policies
      · The worker half is complete and tested. apps/worker/src/preferences.ts:341-386 mergePreferences layers org→user→project and INTERSECTS tool_permissions towards the most restrictive rather than overriding; apps/worker/src/preferences.ts:769 
      → The same control described for 'Write tool permissions' fixes this one: once instructions-panel.tsx renders a tool-permission editor it will already be project-scoped, because the panel's scope tab at instructions-panel.tsx:226 sets `scope`/`scopeId` and savePreferences(scope, scopeId, prefs) at :12
- [~] Organization-specific tool policies
      · The checklist's '✗ not planned' mark understates what is already built. The org layer of tool permissions exists and is tested: apps/worker/src/preferences.ts:367-386 merges an `org` layer with strictest-wins, and apps/worker/tests/preferen
      → Decide first, per docs/design/TENANCY.md. If organizations stay unbuilt, delete nothing but stop counting this item: the org layer in apps/worker/src/preferences.ts:367-386 and the memory_org_members store are already load-bearing for the strictest-wins rule and should keep their tests. If organizat
- [☐] Per-run permission grants
      · Nothing anywhere grants a permission for the duration of one run. What exists is the OPPOSITE and should not be mistaken for it: apps/worker/src/do/session.ts:157-164 documents that toolPermissions are PINNED to the run so a preference edit
      → Add a run-scoped layer to the permission resolution. In apps/worker/src/do/session.ts extend the AgentState toolPermissions field (session.ts:164) with a sibling `runGrants?: Record<string, 'allow'>`, add a `{ type: 'grant_tool'; tool: string }` client message to the ClientMessage union in packages/
- [~] Temporary permission expiration
      · Expiry is real in the store and reachable in the UI — but never for a permission. Store: apps/worker/src/memory-store.ts:218 expiresAtFor validates a TTL and refuses NaN/Infinity/'7'; :241 isExpired; :665 listMemoryEntries filters expired r
      → Give tool permissions an expiry. Change preferencesToEntries in apps/worker/src/preferences.ts:572 to carry an optional per-key ttlDays through to putMemoryEntry, accept `{ preferences, ttlDays }` in the PUT handler at apps/worker/src/index.ts:1036, and make the preferences replace-loop preserve an 
- [~] Approval request summaries
      · Exactly one approval surface in the product writes a summary, and it is good; nothing else has one. Built: apps/web/src/lib/asset-sources.ts:30-55 gives each asset source a title, a `does` sentence and a `costs` sentence, rendered by apps/w
      → When the tool-approval path is built, make the request carry a written summary rather than a tool name: change the tool_start broadcast at apps/worker/src/do/session.ts:2158 to pass a rendered summary built from the call arguments (the same sentence tool_end already produces at :2167 via out.summary
- [☐] Exact target resource display
      · No approval names its target, because the target is only known to the user after the action ran. apps/worker/src/do/session.ts:2158 broadcasts tool_start with `summary: call.name` — just 'edit_script' or 'delete_instances', never the script
      → Add a `target` string to the tool_start message in packages/shared/src/index.ts:830 and populate it in apps/worker/src/do/session.ts:2158 from the call arguments — the script path for edit_script/read_script/format_script, the joined instance paths for create_instances/set_properties/delete_instance
- [☐] Proposed change previews
      · Every write tool applies immediately; the only diffs are retrospective. apps/worker/src/tools.ts:1050 edit_script writes; :1344 create_instances, :1354 set_properties, :1362 delete_instances all send ops straight to the plugin — none takes 
      → Give the mutating tools a preview mode. Add an optional `dryRun: boolean` to edit_script, create_instances, set_properties and delete_instances in apps/worker/src/tools.ts (definitions at :1050, :1344, :1354, :1362) that computes and returns the change — for edit_script the unified diff it already h
- [~] Estimated charge disclosure
      · Cost is disclosed in words on the one consent screen that exists, and as a number nowhere. Built: apps/web/src/lib/asset-sources.ts:30-55 states the cost of each asset source ('Credits and time on every asset' for from_scratch) before the u
      → Surface the estimate that already exists. Have apps/worker/src/do/session.ts include the reserved-neuron estimate from gateway.ts:306 in the agent_status broadcast it already sends each step (session.ts:1915), converted to Credits with the same conversion the usage route uses, and render a running '
- [~] Approval acceptance
      · Two accept paths exist in the worker, both complete and tested, neither reachable by a user. (1) Memory proposals: apps/worker/src/memory.ts:294 decideSuggestedFact with decision 'accept' (records the fact as the MODEL's, not the approver's
      → Add the pending-proposal queue to apps/web/src/components/ws/memory-panel.tsx. First extend the Memory interface at apps/web/src/lib/api.ts:195 with `suggested: { summary: string | null; facts: string[] }` (the worker already returns it — apps/worker/src/memory.ts:159), add a `decideSuggestion(proje
- [~] Approval rejection
      · Rejection is implemented symmetrically with acceptance in the worker and is equally unreachable. apps/worker/src/memory.ts:288 SuggestionDecision = 'accept' | 'discard', with discard removing the proposal and leaving active memory untouched
      → The same memory-panel change described under 'Approval acceptance' covers the memory half: the Discard button POSTs { decision: 'discard', fact } to /api/projects/:id/memory/suggestions. For the review half, add a reviews section to apps/web/src/components/ws/members-panel.tsx listing open review re
- [☐] Approval expiration
      · Nothing pending ever expires. Memory proposals: apps/worker/src/memory.ts:265-277 caps the queue at SUGGESTED_MAX and carries no timestamp or TTL on a suggestion at all — the Memory shape (memory.ts:159) is summary/facts/suggested/origins. 
      → Add `expires_at integer` to collab_reviews in apps/worker/src/do/collab-store.ts:81 (with a migration alongside the others in apps/worker/tests/collab-migration.test.mjs), have planApproval in apps/worker/src/collab-threads.ts:314 refuse a verdict on an expired request the same way it already refuse
- [~] Approval revocation before execution
      · This is the section's clearest instance of code that exists and nothing calls. apps/worker/src/run-access.ts is a complete module for revoking a permission out from under a run already in flight — markAccessRevoked (:87), accessRevokedFor (
      → Wire run-access.ts. In apps/worker/src/index.ts, after the successful revoke at :4007 (and the equivalent point in the suspend route at :4047), call the project's DO stub with the revocation mark — add a `POST https://do/access/revoke` handler in apps/worker/src/do/session.ts that calls markAccessRe
- [~] Approval audit history
      · Permission CHANGES are audited and readable; permission DECISIONS at run time are not recorded anywhere. Built and reachable: the memory_audit table (apps/worker/src/memory-store.ts:533) records every write to a scoped entry — including pre
      → Record the narrowing. In apps/worker/src/do/session.ts:1924, diff toolsForMode(...) against applyToolPermissions(...) and, when the sets differ, push one entry into agent.trace and emit recordEvent({ kind: 'audit', action: 'tool_denied', actorKind: 'user', subject: <tool name>, allowed: false }) usi
- [☐] Changed-plan reapproval requirements
      · There is no plan approval, so there is nothing to re-approve. The Intent and Plan rows are purely informational: packages/shared/src/index.ts:606 RunIntent is a deterministic restatement of the user's own words ('no model call, no inference
      → Blocked on there being an approval mechanism at all. Once one exists, store a hash of the approved intent on the run — add `approvedIntentHash?: string` to AgentState in apps/worker/src/do/session.ts:164 — and recompute it in the step loop whenever the agent revises its plan (the checklist in RunInt
- [~] Protection against approval reuse
      · Every approval path that exists is protected against replay, and each protection is tested; there is no tool-approval path to protect. (1) A memory decision cannot be applied twice: apps/worker/src/do/session.ts:1030 returns 404 'that is no
      → When the tool-approval path is built, make each approval single-use and bound to the exact call: give the approval a nonce stored on the run in apps/worker/src/do/session.ts, bind it to a hash of { tool, arguments, step }, and have the step loop at session.ts:1924 refuse an approval whose hash does 
- [✓] Safe behavior when approval is unavailable
      · Three independent fail-closed behaviours, each written deliberately and each proven. (1) apps/worker/src/preferences.ts:476-486: because nothing in the product can interrupt a run to ask, an 'ask' permission is treated as 'deny' rather than

## 27. ASSET SEARCH AND GENERATION  —  65%   ✓10 ~6 ☐4

- [☐] Asset library browsing
      · No listing surface exists. I enumerated every route in apps/worker/src/index.ts (grep '^app\.(get|post|put|delete)') — the only asset_library routes are POST /api/admin/assets/ingest (index.ts:2338), /import (2350), /unimport (2361) and POS
      → Add GET /api/assets in apps/worker/src/index.ts (session-auth, next to the /api/docs/search route at 2062) that pages apps/worker/src/asset-library.ts's asset_library table — select the SELECT_COLS set (asset-library.ts:894) plus author and source, filtered to status='active', with query params kind
- [~] Asset keyword search
      · BUILT AND WIRED, NEVER TESTED. Hybrid retrieval exists: searchAssetLibrary (apps/worker/src/asset-library.ts:943) fuses a Vectorize semantic pass (vecSearch:996) with a D1 FTS5 bm25 keyword pass (ftsSearch:1031) by reciprocal rank fusion, a
      → Add apps/worker/tests/asset-search.test.mjs that bundles apps/worker/src/asset-library.ts with esbuild (copy the harness from apps/worker/tests/asset-ingest-resilience.test.mjs), drives searchAssetLibrary against a fake CORPUS returning fixed FTS rows and a fake VEC_ASSETS index, and asserts: a term
- [~] Asset type filtering
      · IMPLEMENTED IN THREE PLACES, PROVEN IN NONE. The kind enum is on the tool schema (apps/worker/src/tools.ts:2447), pushed into the FTS SQL as 'and l.kind = ?' (apps/worker/src/asset-library.ts:1039), into the Vectorize metadata filter (asset
      → In the new apps/worker/tests/asset-search.test.mjs, assert that searchAssetLibrary(env,'rock',{kind:'foliage'}) binds 'foliage' into the FTS statement, passes kind into the Vectorize filter object, and drops a hit whose kind differs even when the fake vector index returns it — keep() at apps/worker/
- [✓] Asset source filtering
      · End to end. SOURCE_CHOICE maps every engine source to a dialog choice exhaustively by type (apps/worker/src/asset-policy.ts:34), allowedSources returns nothing for an absent policy (:82) and sourceRefusal names the setting and distinguishes
- [✓] Asset metadata inspection
      · The inspect_model tool (apps/worker/src/tools.ts:2659) reaches Ops.luau handlers.inspect_model (apps/plugin/src/Ops.luau:744) and Generation.inspect (apps/plugin/src/Generation.luau:500), which measures triangle count, bounding box, scale p
- [✓] Asset creator attribution
      · author is a required field on every provenance record (apps/worker/src/asset-library.ts:123, validated at :340) and a column in the DDL (:556). attributionReport (apps/worker/src/provenance.ts:477) splits credits into original / userGenerat
- [✓] Asset licensing metadata
      · LICENCES is a canonical table with commercialUse / attributionRequired / shareAlike / allowedInLibrary per id (apps/worker/src/asset-library.ts:197); normaliseLicence maps verbatim source wordings and refuses to guess (:266); validateProven
- [~] Asset provenance history
      · THE ORIGIN IS RECORDED; THE HISTORY WRITER IS DEAD CODE. What works: source/sourceUrl/author/retrievedAt/importedAt/modifications on every row (apps/worker/src/asset-library.ts:123), and a per-project usage ledger with firstUsedAt, lastUsed
      → Call recordVerification from verifyCreatorStoreAsset in apps/worker/src/assets.ts (at the end of the function, where the AssetVerdict is returned around :560) so every gate decision is logged with its verdict, reasons, provenance and resolved fields — it already takes exactly that shape. Then add GE
- [✓] Asset suitability warnings
      · Three independent warning surfaces, all reachable. (1) QC: Generation.inspect returns per-check fail + a concrete remediation sentence ('regenerate with a lower MaxTriangles', 'the mesh is flat or empty on one axis') at apps/plugin/src/Gene
- [✓] Asset generation requests
      · Two request paths, both complete. generate_model (apps/worker/src/tools.ts:2626) sends the op with a 120s budget to apps/plugin/src/Ops.luau:720, which calls Generation.generateAndInspect (apps/plugin/src/Generation.luau:831) — inspection i
- [~] Asset generation progress
      · THE GENERIC HALF EXISTS, THE GENERATION-SPECIFIC HALF DOES NOT. A running generation does show as an in-flight step with a live ticking elapsed figure: apps/worker/src/do/session.ts:2158 broadcasts tool_start before the tool runs, apps/web/
      → Have apps/plugin/src/Generation.luau emit a heartbeat while it waits: in the wait loop around :130 post a {op:'generate_progress', elapsedSeconds, budgetSeconds} frame every 5s over the existing poll channel, and in apps/worker/src/do/session.ts broadcast it as a tool_progress event beside tool_star
- [☐] Asset generation cancellation
      · Nothing cancels a generation. I searched: apps/worker/src/stop-signal.ts is a run-level stop only; apps/worker/src/do/session.ts reads it exclusively BETWEEN tool calls (2206, inside the tool loop after the result is appended, and 2215 afte
      → Two parts. In apps/worker/src/tools.ts:2646, pass the stop signal into the op: before awaiting execStudioOp, and again on each poll, check stopRequested(ctx) and return a 'cancelled by the user' result instead of the model. In apps/plugin/src/Generation.luau, thread a cancelled flag into the wait lo
- [☐] Durable generated asset storage
      · Neither generated form survives. Models: GenerateModelAsync output is session-scoped and the code says so rather than pretending otherwise — apps/plugin/src/Generation.luau:21 ('It does not survive save/publish. Persisting it needs AssetSer
      → For images: after storeImage in apps/worker/src/tools.ts:2727, offer a follow-up that calls uploadAsset (apps/worker/src/roblox-upload.ts:133) with type 'Decal' using the CALLER'S connected key via accountFor/useRobloxCredential (the pattern at apps/worker/src/asset-import.ts:294), write the returne
- [✓] Generated asset previews
      · imagePanel (apps/worker/src/imagegen.ts:741) emits an asset_picker block whose thumbnail src is a same-origin PATH, never the bytes, built by the same helper the route uses (imagePathFor:780); generate_image assigns it to ctx.uiDetail at ap
- [☐] Asset version history
      · No asset is versioned anywhere. apps/worker/src/asset-library.ts:728 writes with 'insert into asset_library(...) on conflict(id) do update set ...' — a re-ingest overwrites the row and the previous state is gone; the DDL at :556 has created
      → If asset versioning is wanted, add an asset_library_versions table in ensureAssetTables (apps/worker/src/asset-library.ts:545) keyed (asset_id, seq) holding the full prior column set, and make upsertAssets (:658) copy the existing row into it before the on-conflict update at :728, so a re-ingest tha
- [~] Asset insertion preview
      · BOTH HALVES ARE BUILT AND THEY ARE NOT CONNECTED — the exact defect this audit is looking for. Producer side: every gate verdict carries a public no-auth render URL (assetThumbnailUrl at apps/worker/src/assets.ts:522, set on every verdict a
      → In apps/worker/src/tools.ts, set ctx.uiDetail in both search tools before returning: build an asset_picker block ({v:1, blocks:[{type:'asset_picker', title:'Assets', assets:[{id, name, kind, creator, thumbnail:{src: thumbnailUrl}}]}]}) — copy the shape from imagePanel in apps/worker/src/imagegen.ts:
- [✓] Asset import capability checks
      · Every import decision is a stated capability check, not a silent skip. resolveDownload returns a real fetchable address or an {error} sentence per source (apps/worker/src/asset-import.ts:56), asserted exhaustively by apps/worker/tests/asset
- [✓] Scoped asset upload authorization
      · Authorisation is scoped on three axes and each is tested. (1) Account consent: uploading requires ROBLOX_UPLOAD_AUTHORISED_FOR to equal the creator id exactly, or preflight refuses before a byte is sent (apps/worker/src/roblox-upload.ts:85/
- [~] Supported Roblox asset export
      · Read as 'export an asset into Roblox in the types Roblox actually supports', this is complete. OPEN_USE_UPLOAD_TYPES is the allowlist Decal/Image/Mesh and Model is refused by name because a Model uploaded under Apple's account 404s for ever
      · REFUTED: REFUTED under both readings. (a) The checklist's OWN cited evidence is dead code, and worse than the claim admits: exportGlb (meshgen.ts:1916) and exportObj (:1837) have no callers, and `grep -rln meshgen apps packages s
- [✓] Clear unavailable asset operation states
      · Four distinct unavailable states, each named rather than rendered as an empty result. (1) Missing library: assetLibraryAvailable READS sqlite_master and never creates tables (apps/worker/src/asset-library.ts:924); the tool is withheld from 

## 28. SCENE PREVIEWS AND EVIDENCE  —  73%   ✓12 ~5 ☐3

- [✓] Software-rendered scene previews
      · apps/plugin/src/Render.luau:1-13 is a depth-buffered Luau rasteriser (Roblox gives plugins no viewport readback); Render.capture at apps/plugin/src/Render.luau:312 and renderView at :206 produce real base64 RGB. Wired: apps/plugin/src/Ops.l
- [~] Preview source identification
      · Producer is stated in prose on all three surfaces (apps/web/src/components/ws/studio-view.tsx:84, evidence-cards.tsx:104, playtest-card.tsx:142) and the copy is enforced by apps/web/tests/playtest-viewport.test.mjs:376. The frame identifies
      → Add `source: 'studio_render' | 'playtest_render' | 'generated_image' | 'web_capture'` to StudioFrame in packages/shared/src/index.ts:666 and set it where frames are stamped in apps/worker/src/do/session.ts:2704-2708 (studio_render for the emitFrame path, playtest_render when playtestRunId is set). T
- [✓] Preview generation timestamps
      · capturedAt is stamped by the worker when the pixels arrive: apps/worker/src/tools.ts:363 (build renders) and apps/worker/src/do/session.ts:2788 (playtest captures); it is on the wire at packages/shared/src/index.ts:691. The browser shows th
- [✓] Preview freshness indicators
      · apps/web/src/lib/playtest-view.ts:49-60 frameFreshness returns none/fresh/stale/dead against PLAYTEST_STALE_MS and PLAYTEST_DEAD_MS (packages/shared/src/index.ts:756-770); statusLabel at playtest-view.ts:121-140 names the age, dimmed at :19
- [~] Preview-to-run association
      · The worker stamps association on every frame: msgId at apps/worker/src/do/session.ts:2706 and playtestRunId+seq at :2707. The playtest half is wired and tested — apps/web/src/lib/playtest-view.ts:109-112 framesForRun filters by run id and o
      → In apps/web/src/routes/workspace.tsx:746, filter the frames handed to StudioView to those whose `msgId` matches the turn being viewed (the active run for a live turn, the message id for a scrolled-back one) instead of passing the unfiltered array, and in apps/web/src/components/ws/studio-view.tsx:86
- [✓] Preview-to-project association
      · Structural rather than a field, and the reasoning is recorded: frames live only in the per-project SessionDO's in-memory ring (apps/worker/src/do/session.ts:2647-2660), and a SessionDO is addressed by project id at apps/worker/src/index.ts:
- [☐] Preview-to-scene-version association
      · Searched every preview type for a version handle and found none: StudioFrame (packages/shared/src/index.ts:666-703) and RenderedView.meta (:118-134) carry no checkpoint, snapshot or place-version id; apps/worker/src/do/session.ts:2691-2710 
      → Thread the current scene version onto the frame: in apps/worker/src/do/session.ts add a `sceneRevision` counter bumped by every mutating studio op (the same place dropOpsForEndedRuns tags ops with runId, session.ts:2727+), add `sceneRevision?: number` and `checkpointId?: string` to StudioFrame in pa
- [✓] Preview resolution metadata
      · Produced at apps/plugin/src/Render.luau:303-305 (meta.width/height beside the pixels), typed at packages/shared/src/index.ts:120-128, carried on the frame at packages/shared/src/index.ts:691-692, and validated rather than trusted: apps/work
- [✓] Camera framing controls
      · Five named presets plus 'all' (packages/shared/src/index.ts:116 RENDER_VIEWS), poses computed in apps/plugin/src/Render.luau:136-170 with a calibrated 1.35x framing distance, a `target` path that frames one instance's subtree and width/heig
- [✓] Selected object focus
      · Three wired pieces: get_selection (apps/worker/src/tools.ts:1434 -> apps/plugin/src/Ops.luau:616) reads what the user has selected, focus_camera (apps/worker/src/tools.ts:1450-1462 -> apps/plugin/src/Ops.luau:633-652) frames one instance in
- [~] Before-and-after preview comparison
      · Everything except a producer exists and nothing calls it. The block type is defined (apps/web/src/lib/generative-ui/schema.ts:291), validated (validate.ts:779), rendered as a draggable wipe (apps/web/src/lib/generative-ui/render.tsx:396,109
      → Give it a producer on the worker side, which is where both renders exist: in apps/worker/src/tools.ts inspect_visually (line 2304), keep the previous RenderViewResult on the agent context beside `ctx.lastRender` (declared apps/worker/src/tools.ts:138 area) and, when a previous one exists for the sam
- [☐] User-uploaded Studio screenshots
      · The old mark cites apps/web/src/components/ws/studio-view.tsx, which shows plugin-rasterised frames, not user uploads. The only trace of the capability is a dead type: `ChatAttachment { kind: 'image' | 'file'; name; r2Key; mime; size }` at 
      → Build the three missing pieces. (1) apps/worker/src/index.ts: add POST /api/projects/:id/attachments that accepts a single image (cap ~4MB, png/jpeg/webp only), stores it the way generated images are stored (apps/worker/src/imagegen.ts:690-705 storeImage, with an expiresAt in KV metadata) and return
- [~] Supported capture capability detection
      · Coarse availability is detected and reported honestly: when the plugin is absent every studio tool is removed from the model's tool list (apps/worker/src/router.ts:89-91) and runTool refuses by name (apps/worker/src/tools.ts:2991-2993), and
      → Add a capability handshake. In apps/plugin/src/init.server.luau, include a `capabilities` list (the keys of `handlers` in apps/plugin/src/Ops.luau plus a render feature flag for layoutSummary) in the /plugin/register body; in apps/worker/src/do/session.ts:837 persist it on the session alongside plug
- [☐] Capture permission status
      · The file the old mark cites, apps/worker/src/build-audit.ts, contains no permission logic at all (grep for 'permission' in it returns nothing; it is the geometry critic). Searched apps/plugin/src — the only permission mentions are Paths.lua
      → Report it from the only place that can observe it. In apps/plugin/src/init.server.luau, wrap the first HttpService request in a pcall and record whether it was refused by the permission prompt, then send `permission: 'granted' | 'denied'` on every /plugin/poll body; carry it through PluginPollRespon
- [✓] Missing visual evidence indicators
      · A render whose views carry no pixels is classified `empty`, not `ready`, at apps/web/src/components/ws/evidence-model.ts:171, with the copy 'The render came back with no pixels.' at :266-271; drawn by apps/web/src/components/ws/evidence-car
- [✓] Preview delivery failure recovery
      · A capture that returns no pixels is counted as a drop and the playtest continues to the next tick (apps/worker/src/do/session.ts:2774-2779); a frame refused by admission is written to the oplog and returns false rather than throwing, so a b
- [✓] Preview payload validation
      · apps/worker/src/frame-bus.ts:227 admitFrame is the single gate — empty payload, base64 over the ceiling, more pixels than the rasteriser can produce, non-finite or non-integer dimensions, invalid base64, and payload/dimension mismatch each 
- [✓] Evidence attachment to verification results
      · inspect_visually attaches the image the verdict was formed from: apps/worker/src/tools.ts:2380-2395 encodes the hero view to a PNG data URL and puts it on ctx.uiDetail alongside the critique and the deterministic panel, explicitly so a scor
- [~] Evidence retention controls
      · Retention is implemented but nothing controls it and evidence cannot be deleted. Frames are deliberately never persisted and the ring is bounded on both count and bytes (apps/worker/src/do/session.ts:2620-2624 and :2647-2660; FRAME_RING_CAP
      → Add an owner-facing control and the route behind it. In apps/worker/src/index.ts add DELETE /api/projects/:id/evidence that clears the SessionDO frame ring and strips persisted tool `detail` payloads from the messages table (the same table edit_resend truncates at apps/worker/src/do/session.ts:1499)
- [✓] Explicit distinction between previews and captured Studio output
      · Stated on every surface that shows pixels and enforced by test. Copy: apps/web/src/components/ws/studio-view.tsx:84 'Diagnostic render from Studio — geometry only, not a viewport', apps/web/src/components/ws/evidence-cards.tsx:104, and apps

## 33. AUTOMATIONS AND BACKGROUND TASKS  —  45%   ✓0 ~18 ☐2

- [~] Automation creation
      · Validation is real and tested: normaliseAutomation at apps/worker/src/automations.ts:237 refuses 14 named reasons, proven by apps/worker/tests/automations.test.mjs:297 ('each refusal is reached by spoiling exactly one field'). Persistence i
      → apps/worker/src/index.ts has no automations router. Add `POST /api/projects/:projectId/automations` (authenticate, resolve ownerId from the verified JWT, call normaliseAutomation(body, {ownerId, projectId, now}) from './automations', then saveAutomation(c.env, result.automation, nextFireAfter(result
- [~] Automation naming and descriptions
      · apps/worker/src/automations.ts:183 cleanName() trims and collapses whitespace and REFUSES rather than truncates, with NAME_MAX=60 (automations.ts:99) and DESCRIPTION_MAX=280 (automations.ts:100); apps/worker/tests/automations.test.mjs:359 '
      → Once the automations router exists in apps/worker/src/index.ts, apps/web/src/routes/workspace.tsx needs a create/edit form with a name input (maxLength 60) and a description textarea (maxLength 280) that POSTs `{name, description}` to /api/projects/:projectId/automations, and must render the server'
- [~] Manual automation execution
      · 'manual' is the default trigger (apps/worker/src/automations.ts:48, defaulted at automations.ts:260) and describeSchedule renders it as 'Only when you run it.' (automations.ts:569). The primitive that would start the fire, claimFire at apps
      → Add `POST /api/automations/:id/run` to apps/worker/src/index.ts: load the automation with getAutomation(env, ownerId, id), call authorizeFire(a, {projectId: a.projectId, ownerHasAccess}) and startVerdict(a, {inFlight, runsToday: await firesSince(env, id, startOfDayInZone), authorized, killed}) from 
- [~] Scheduled automation execution
      · The clock arithmetic is built and well tested — nextFireAfter at apps/worker/src/automations.ts:344 is strictly-after by construction (test at apps/worker/tests/automations.test.mjs:68) and dueAutomations/scheduleNext at apps/worker/src/aut
      → Add a cron trigger and a dispatcher. In apps/worker/wrangler.jsonc add `"triggers": {"crons": ["* * * * *"]}`. In apps/worker/src/index.ts, replace `export default app` (index.ts:4369) with `export default { fetch: app.fetch, scheduled: dispatchAutomations }` and write dispatchAutomations in a new a
- [~] Event-triggered automation execution
      · The vocabulary is deliberately short and real — AUTOMATION_EVENTS = build_failed | build_succeeded | checkpoint_created at apps/worker/src/automations.ts:59 — the lookup exists (automationsForEvent at apps/worker/src/automation-store.ts:343
      → In apps/worker/src/do/session.ts, at the terminal-state branch that already calls notify() around session.ts:2450, also call automationsForEvent(this.env, projectId, outcome === 'ok' ? 'build_succeeded' : 'build_failed') and, for each result, authorizeFire + startVerdict + claimFire(env, a, eventFir
- [~] Timezone-aware scheduling
      · The engine is complete and independently tested: apps/worker/src/zoned-time.ts exports isTimeZone:52, wallPartsAt:93, instantForWall:149 with a DstFold result, covered by apps/worker/tests/zoned-time.test.mjs:71,82,104. nextFireAfter (apps/
      → apps/web/src/routes/workspace.tsx (automation editor, once added) needs a timezone select defaulting to Intl.DateTimeFormat().resolvedOptions().timeZone, POSTed as `timezone` in the automation body; the worker already refuses an unknown zone with reason 'unknown_timezone' (apps/worker/src/automation
- [~] Daylight-saving behavior visibility
      · The copy exists and is correct: dstDisclosure at apps/worker/src/zoned-time.ts:185 explains both mornings, and the behaviour it describes is enforced (apps/worker/tests/automations.test.mjs:112 'a daily run at a wall time that does not exis
      → Two halves. (a) Export the disclosure to the client: have the automations GET route in apps/worker/src/index.ts include `dstDisclosure(automation.schedule)` from './zoned-time' in each automation's JSON, and render it in apps/web/src/routes/workspace.tsx under the schedule picker for every 'day' and
- [~] Automation permission scope
      · The model is right and tested: authorizeFire at apps/worker/src/automations.ts:552 refuses 'owner_lost_access' and 'wrong_project' (apps/worker/tests/automations.test.mjs:244 'an automation whose owner lost access to the project does not fi
      → When the automations router is added to apps/worker/src/index.ts, every fire path (manual run, cron dispatch, event dispatch) must compute ownerHasAccess with the SAME project-access lookup the interactive websocket path uses and pass it to authorizeFire(a, {projectId, ownerHasAccess}) before claimF
- [~] Automation budget limits
      · Half enforced, half decorative. maxRunsPerDay IS a real gate: startVerdict returns 'daily_cap' at apps/worker/src/automations.ts:455 and firesSince (apps/worker/src/automation-store.ts:437) counts the fires, tested at apps/worker/tests/auto
      → apps/worker/src/automations.ts stores budget.maxCreditsPerRun but nothing spends against it. When the dispatcher is written, it must pass the automation's maxCreditsPerRun to the run it starts as a per-run ceiling checked by BudgetDO (apps/worker/src/do/budget.ts) — the admission check must refuse t
- [~] Automation execution history
      · The schema and every query are written: the automation_runs table with a unique fire_key plus both history indexes (apps/worker/src/automation-store.ts:82-86), claimFire:401, finishFire:418, listExecutions:450 (owner-bound), automationSpend
      → Two gaps. (a) No route: add `GET /api/automations/:id/runs` to apps/worker/src/index.ts returning listExecutions(env, ownerId, id, limit) and `GET /api/automations/:id/spend` returning automationSpend(env, ownerId, id, since), and render them as a run list in apps/web/src/routes/workspace.tsx with o
- [~] Automation pause and resume
      · setAutomationEnabled at apps/worker/src/automation-store.ts:274 is a dedicated single-column write chosen so a row this version cannot parse is still stoppable, and it deliberately leaves next_fire_at alone so resuming keeps its place; star
      → Add `POST /api/automations/:id/enabled` to apps/worker/src/index.ts taking `{enabled: boolean}` and calling setAutomationEnabled(c.env, ownerId, id, enabled, Date.now()), returning 404 when it reports false. Add a pause/resume switch per row in the automations list in apps/web/src/routes/workspace.t
- [☐] Automation cancellation
      · Searched apps/worker/src/automations.ts and apps/worker/src/automation-store.ts for 'cancel' — zero matches. FIRE_OUTCOMES (automations.ts:473) has ok/failed/quota/busy/refused/error and no 'cancelled'; StartRefusal (automations.ts:417) has
      → Add `POST /api/automations/:id/runs/:executionId/cancel` to apps/worker/src/index.ts: verify the execution belongs to the caller via listExecutions' owner binding, take the stored run_id, call requestStop on that project's SessionDO storage (the same path apps/worker/src/do/session.ts already uses v
- [~] Missed-run handling
      · missedRunVerdict at apps/worker/src/automations.ts:391 counts the missed fires with a bounded 64-iteration walk and returns on_time/caught_up/skipped, with MISSED_RUN_POLICIES restricted to skip|catch_up (automations.ts:78) so 'run them all
      → In the cron dispatcher (to be created at apps/worker/src/automation-dispatch.ts per the Scheduled-automation-execution fix), for each row from dueAutomations call missedRunVerdict(a, a.nextFireAt, now) BEFORE claiming the fire and skip the fire when verdict.run is false, while still advancing schedu
- [~] Overlapping-run policy
      · The checklist marks this done, but only the decision half exists. OVERLAP_POLICIES is skip|queue with 'allow' deliberately absent (apps/worker/src/automations.ts:74), startVerdict returns {start:false, requeue: a.overlap === 'queue', reason
      → The dispatcher in apps/worker/src/automation-dispatch.ts must act on StartVerdict.requeue: when requeue is true, leave next_fire_at at the due instant (do not advance it) so the next cron tick retries the same fire under the same fireKey, and when requeue is false advance it with scheduleNext. Also 
- [~] Retry policy configuration
      · retryVerdict at apps/worker/src/automations.ts:496 refuses to retry quota/busy/refused/ok by name (NEVER_RETRIED at automations.ts:481) and otherwise retries at a fixed RETRY_DELAY_MS (automations.ts:487) up to maxRetries, bounded by MAX_RE
      → Two halves. (a) Enforcement: after finishFire in the dispatcher, call retryVerdict(outcome, execution.attempt, a.maxRetries, now) and, when it says retry, schedule the re-attempt by writing next_fire_at = verdict.at via scheduleNext and claiming the retry with a fireKey that includes the attempt num
- [~] Duplicate-trigger protection
      · The design is the right one — `fire_key text not null unique` on automation_runs with the reasoning spelled out at apps/worker/src/automation-store.ts:75-84, and claimFire at automation-store.ts:401 reading the verdict from an `insert or ig
      → Add apps/worker/tests/automation-store.test.mjs that runs claimFire twice with the same fire_key against the D1 stub in apps/worker/tests/stubs and asserts the second returns {claimed:false, reason:'already_fired'} with no exception thrown — the whole point of automation-store.ts:401 is that the los
- [~] Failed-run notifications
      · The checklist marks this done and cites apps/worker/tests/notifications.test.mjs:213, but that test uses kind 'run_failed' — the interactive-run notification — not 'automation_failed'. Repo-wide, `grep -rn automation_failed` matches exactly
      → In the dispatcher's failure branch (apps/worker/src/automation-dispatch.ts, after finishFire records an outcome other than 'ok'), call notify(env, {kind:'automation_failed', recipientId: automation.ownerId, projectId, projectName, subject: executionId, ...}) from './notify'. Use the EXECUTION id as 
- [☐] Approval-dependent automation steps
      · Searched for an approval gate on an automation and found none. apps/worker/src/automations.ts has no approval state anywhere: FIRE_OUTCOMES (automations.ts:473) is ok/failed/quota/busy/refused/error, StartRefusal (automations.ts:417) is dis
      → Nothing implements a human gate inside an automation run. Design and build it as: a per-automation `requiresApproval` flag plus a list of gated tool names, stored in a new column on the automations table (apps/worker/src/automation-store.ts createAutomationTables); a 'awaiting_approval' member added
- [~] Automation ownership transfer
      · transferAutomation at apps/worker/src/automation-store.ts:297 is written and its safety argument is sound — an automation carries no credential, so the transfer moves a row and the first fire afterwards re-asks authorizeFire about the NEW o
      → Add `POST /api/automations/:id/transfer` to apps/worker/src/index.ts taking `{toUserId}`, resolving the new owner's project access with the same membership lookup the collab routes use, and calling transferAutomation(c.env, callerId, id, toUserId, {newOwnerHasAccess, now}); map 'no_access' to 403, '
- [~] Automation disablement after access revocation
      · What is built is REFUSAL AT FIRE, not disablement: authorizeFire (apps/worker/src/automations.ts:552) returns 'owner_lost_access' and startVerdict checks access before everything else (automations.ts:451), tested at apps/worker/tests/automa
      → Two distinct behaviours, both absent. (a) Refusal: the dispatcher in apps/worker/src/automation-dispatch.ts must call authorizeFire with a freshly computed ownerHasAccess on every fire and record the refusal as outcome 'refused' via finishFire, so the history shows why it stopped. (b) Disablement: i

## 29. PLAYTESTING AND VERIFICATION  —  68%   ✓10 ~7 ☐3

- [☐] Studio playtest capability detection
      · Searched apps/worker/src (playtest.ts, playtest-stream.ts, tools.ts run_and_check at 1535, plugin-version.ts), apps/plugin/src (Companion.luau planTest at 112, init.server.luau stateEvent at 93, Ops.luau run_mode at 590), apps/web/src and p
      → In apps/worker/src/tools.ts, add a preflight to run_and_check before the first census (line 1551). Expose the session DO's stored pluginState (apps/worker/src/do/session.ts:1241) on AgentCtx as e.g. ctx.studioState(), and refuse with a named reason when isRunMode is already true (a playtest started 
- [✓] Playtest start controls
      · apps/worker/src/tools.ts:1576 sends {op:'run_mode', action:'start'} after taking a protective checkpoint; apps/plugin/src/Ops.luau:590 dispatches it through the pure state machine at apps/plugin/src/Companion.luau:112, which maps start/run 
- [✓] Playtest stop controls
      · apps/worker/src/tools.ts:1632 sends {op:'run_mode', action:'stop'} after the capture loop; Companion.planTest maps it to RunService:Stop() and treats an already-stopped place as a no-op rather than a second Stop (apps/plugin/src/Companion.l
- [✓] Playtest session identification
      · A run id is minted per playtest at apps/worker/src/do/session.ts:2731 (`pt_<base36>_<rand>`), stamped on every frame as playtestRunId plus a monotonic seq at session.ts:2707/2790, persisted to DO storage at session.ts:2678 so it survives ev
- [☐] Test scenario selection
      · Grepped apps, packages and scripts for 'scenario' — the only hits are internal Luau test harnesses in packages/evals/src/asset-content-gate.test.mjs, nothing product-facing. run_and_check's whole parameter surface is {seconds} (apps/worker/
      → Create apps/worker/src/playtest-scenarios.ts holding a table of named scenarios (id, one-line description, optional setup Luau run after the checkpoint and before run_mode start, optional teardown). Add a `scenario` string parameter to run_and_check's schema at apps/worker/src/tools.ts:1540, run the
- [✓] Test preparation status
      · The run record starts in phase 'preparing' with the action string 'Taking a protective checkpoint' (apps/worker/src/playtest-stream.ts:35-53), which run_and_check advances to 'Starting run mode in Studio' at apps/worker/src/tools.ts:1575 an
- [✓] Runtime error collection
      · run_and_check polls {op:'get_logs', maxEntries:120} every other capture tick (apps/worker/src/tools.ts:1611) and once more after the loop (:1627), unwraps the payload with parseLogEntries (apps/worker/src/playtest-stream.ts:151) and tallies
- [✓] Runtime warning collection
      · Warnings are counted separately from errors in the same pass — countConsole returns {errors, warnings} at apps/worker/src/playtest-stream.ts:133-142, and an unknown severity degrades to 'output' rather than to 'error' (playtest-stream.ts:18
- [✓] Test assertion results
      · run_spec (apps/worker/src/tools.ts:1984) sends a pcall-per-case Luau harness built by specLuau (apps/worker/src/spec-runner.ts:94) and reads back per-case {name, status, message, durationMs} via parseSpecRun (spec-runner.ts:131). A case tha
- [✓] Build integrity checks
      · Two live checks. (1) The playtest's own integrity pass: a before/after census of instances, parts, scripts and top-level names (CENSUS_LUAU, apps/worker/src/playtest.ts:38) compared by destructiveDelta (playtest.ts:111), which triggers a ch
- [~] Required object existence checks
      · The read primitives exist and are wired: get_instance (apps/worker/src/tools.ts:1385) returns the plugin's {error} for a path that does not resolve and renders a property_inspector panel, and a run_spec case can assert FindFirstChild by han
      → Add an `expect_instances` tool to apps/worker/src/tools.ts beside run_spec (around line 1984) that takes an array of full paths, resolves them all in ONE run_code op (mirroring the single-round-trip pattern of CENSUS_LUAU at apps/worker/src/playtest.ts:38), and returns one case per path. Set ctx.uiD
- [~] Expected property value checks
      · Reading a property back is built: get_instance returns class, common properties and attributes and renders them as a property_inspector (apps/worker/src/tools.ts:1385-1425), and the system prompt tells the model to verify with a read-back (
      → Extend the `expect_instances` tool proposed above (apps/worker/src/tools.ts) to accept {path, property, expected} triples using the same typed property encoding set_properties already uses (tools.ts:1352), compare them inside the single run_code pass, and return one test_report case per triple whose
- [~] Script execution verification
      · Half exists: run mode executes the place's server scripts against the edit DataModel and the console window is collected and tallied (apps/worker/src/tools.ts:1611,1627), which is what run_and_check's own description claims — 'It proves NOT
      → In apps/worker/src/tools.ts run_and_check, read the run_mode result instead of discarding it: after line 1576 inspect start.data.running / start.data.started (shape defined at apps/plugin/src/Ops.luau:605-612) and call ctx.playtest?.phase('failed', ...) with a named reason when the engine did not ac
- [☐] Interaction behavior verification
      · Grepped apps/worker/src and apps/plugin/src for ClickDetector, ProximityPrompt, Touched, 'simulate' and 'interact'. The only hits are generated prefab source (apps/worker/src/prefabs.ts:788,1327,1502) and the roadmap class census (apps/work
      → Add an `interact` op to apps/plugin/src/Ops.luau (register it in the StudioOp union at packages/shared/src/index.ts:82) taking {path, kind} where kind is one of clickDetector | proximityPrompt | touched, and having the handler fire the matching server-side signal (ClickDetector.MouseClick via :Fire 
- [✓] Test duration limits
      · Three independent ceilings, all on the live path. (1) run_and_check clamps the requested duration to 2-15s at apps/worker/src/tools.ts:1544 and the capture loop is driven by that deadline, not by a frame counter, so a slow rasterise eats in
- [~] Interrupted test handling
      · The record half is built and tested: finishRun closes a non-terminal playtest as 'failed' with a real reason rather than leaving it counting up (apps/worker/src/do/session.ts:2377-2385), advance freezes a terminal run against every later fr
      → In apps/worker/src/tools.ts, wrap everything from the successful run_mode start (line 1576) through the after-census (line 1637) in try/finally and issue {op:'run_mode', action:'stop'} from the finally block, so the stop currently at line 1632 cannot be skipped by a throw. Separately, in apps/worker
- [~] Failed test investigation links
      · Two halves exist and neither is connected. (a) The playtest card renders an 'Open in Studio' button only when onOpenStudio is supplied (apps/web/src/components/ws/playtest-card.tsx:179-183), and the sole call site never supplies it — apps/w
      → Two changes. (1) apps/web/src/routes/workspace.tsx:742: pass onOpenStudio to PlaytestCard, wired to the same Studio deep-link the connect flow already uses, so a failed playtest offers a way into the place. (2) apps/worker/src/tools.ts run_spec (1984): when a case fails, emit an `error_diagnosis` bl
- [~] Verification evidence attachments
      · Attachment works for the life of a run: inspect_visually encodes the hero render to PNG and hangs it on the tool row with the critique and the measured panel (apps/worker/src/tools.ts:2380-2402), documentFromToolDetail recognises that shape
      → Persist the evidence, not just the summary. In apps/worker/src/do/session.ts, add a tool_detail column to the messages table (schema at session.ts:499) or a sibling tool_details table keyed by toolId, write out.detail there at the same point agent.uiTools is appended (session.ts:2170) under a size c
- [~] Verification summary per run
      · A per-run summary exists and is tested: Turn collects every validated tool document for the turn and derives gate rows (apps/web/src/components/ws/turn.tsx:104), gatesFromDocs turns a visual_critique or a test_report into a labelled pass/fa
      → In apps/worker/src/tools.ts run_and_check, set ctx.uiDetail before returning (after line 1660) to a document carrying a `test_report`-shaped block — title 'Playtest', failed = consoleErrors, passed = 1 when the run completed cleanly — plus a `callout` when destroyedByPlaytest is non-empty, so the pl
- [✓] Explicit unverified result states
      · Unverified is a distinct state in four places rather than being folded into pass or fail. (1) A critique the model's output could not be parsed returns {score: null, unavailable: true} with copy that says the scene has NOT been judged (apps

## 34. NOTIFICATIONS AND ACTIVITY INBOX  —  45%   ✓0 ~18 ☐2

- [~] In-app notification inbox
      · Server half is complete and tested: store at apps/worker/src/notification-store.ts:233 (listNotifications), route GET /api/notifications at apps/worker/src/index.ts:2030 returning {items, unread, groups, kinds}, tests apps/worker/tests/noti
      → Add `export const fetchNotifications = (unread?: boolean) => request<{items: NotificationRow[]; unread: number; groups: NotificationGroup[]; kinds: string[]}>(`/api/notifications${unread ? '?unread=true' : ''}`)` to apps/web/src/lib/api.ts (mirror the NotificationRow/NotificationGroup shapes from ap
- [☐] Email notifications
      · No mail transport exists anywhere: grep -rniE 'mailchannels|sendgrid|postmark|nodemailer|smtp|sendEmail' over apps/worker/src, apps/web/src, apps/site/src and packages/shared returns only the prose in apps/worker/src/notifications.ts:26. ap
      → Only if email is actually wanted: add a mail binding/API key to apps/worker/wrangler.jsonc, create apps/worker/src/mail.ts with a single `sendMail(env, {to, subject, text})`, then (a) move 'email' from UNBUILT_CHANNELS (apps/worker/src/notifications.ts:143) into NOTIFICATION_CHANNELS (:136), (b) add
- [☐] Optional browser push notifications
      · No service worker and no push plumbing anywhere: `find apps/web apps/site -name 'sw.js' -o -name 'service-worker*' -o -name 'manifest.webmanifest'` returns nothing, and grep -rniE 'serviceWorker|pushManager|web-push|vapid|Notification.reque
      → Only if push is actually wanted: ship apps/web/public/sw.js with a `push` handler calling registration.showNotification, register it from apps/web/src/main.tsx, add a `push_subscriptions(user_id, endpoint, p256dh, auth)` table plus POST /api/notifications/subscribe in apps/worker/src/index.ts near t
- [~] Notification delivery preferences
      · Worker side is complete and honoured: DeliveryPreference + normaliseDelivery at apps/worker/src/notifications.ts:165 and :198, registered as the preference key 'notify_delivery' at apps/worker/src/preferences.ts:45 and :279, stored/served b
      → Add `notify_delivery?: { timezone: string; quiet_hours: { start: string; end: string } | null; digest: 'off'|'hourly'|'daily'; digest_hour: number }` to the Preferences interface at apps/web/src/lib/api.ts:260. Then add a 'Notifications' fieldset to apps/web/src/routes/settings.tsx (user scope) that
- [~] Per-project notification preferences
      · Scoping works and is tested: notify_events merges PER ENTRY across org/user/project at apps/worker/src/preferences.ts:424-432 via mergeEventPrefs (apps/worker/src/notifications.ts:293), the project layer is loaded in notificationPrefsFor at
      → After adding notify_events to the Preferences interface in apps/web/src/lib/api.ts:260, add a per-kind checkbox list to apps/web/src/components/ws/instructions-panel.tsx inside the existing preferences block (around :245), driven by the `kinds` array that GET /api/notifications already returns (apps
- [~] Per-event notification preferences
      · Built, validated and tested server-side: NOTIFICATION_KINDS at apps/worker/src/notifications.ts:48, normaliseEventPrefs at :259, wants() at :310, and enforcement inside planNotification at :583 ('muted' refusal). Tests: apps/worker/tests/no
      → Build the consumer for `kinds`. In apps/web, add notify_events?: Partial<Record<string, boolean>> to the Preferences interface (apps/web/src/lib/api.ts:260) and render one toggle per kind in the new Notifications fieldset in apps/web/src/routes/settings.tsx, labelled from a map in that file (run_com
- [~] Run completion notifications
      · It IS emitted — the checklist's [☐] is wrong. apps/worker/src/do/session.ts:2451 sends `kind: failed ? 'run_failed' : 'run_complete'` from finishRun, addressed to agent.userId with subject agent.msgId, via notify() (apps/worker/src/notify.t
      → Add a test to apps/worker/tests/notifications.test.mjs (or a new apps/worker/tests/notification-emitters.test.mjs) that reads apps/worker/src/do/session.ts as text and asserts the finishRun branch still passes kind 'run_complete'/'run_failed', recipientId agent.userId and subject agent.msgId — the s
- [~] Run failure notifications
      · Emitted from the same line as run completion: apps/worker/src/do/session.ts:2451, with the failure branch covering reason 'error' | 'incomplete' | 'quota' (session.ts:2449) and body falling back to the run's error text. Dedupe by run id is 
      → Same source-level emitter test as for run completion. The user-visible half needs the inbox UI (apps/web/src/components/notification-inbox.tsx); until that exists a person who closes the tab still never learns the run failed, which is the failure mode the header comment at apps/worker/src/notificati
- [~] Approval request notifications
      · Wired: apps/worker/src/index.ts:4291 sets kind 'approval_requested' for POST /api/shared/:id/reviews (collabHandler at index.ts:4256), reading reviewers from the Durable Object's 201 response rather than the request body, and fanning out wi
      → Add a case to apps/worker/tests/collab-routes.test.mjs that posts a review with a reviewer and asserts a row lands in the notifications table with kind 'approval_requested' and the reviewer as recipient_id — the file already stands up the D1 fake needed for it. Rendering needs the inbox UI item.
- [~] Collaboration mention notifications
      · Wired: apps/worker/src/index.ts:4291 sets kind 'mention' for POST /api/shared/:id/comments, taking recipients from `written.mentions[].userId` in the store's own 201 response (index.ts:4288) so a mention of a non-member cannot be notified, 
      → Add a case to apps/worker/tests/collab-routes.test.mjs posting a comment that mentions a second member and asserting a notifications row with kind 'mention', recipient_id = that member, and href = /app/projects/<id>. Rendering needs the inbox UI item.
- [~] Billing issue notifications
      · Wired into the Stripe webhook: apps/worker/src/index.ts:1806 calls interpretDunningEvent, :1808 dunningCopy, :1811 emits kind 'billing_issue' with the invoice id as the dedupe subject, on waitUntil. billing_issue is mandatory and non-deferr
      → Create apps/worker/tests/dunning.test.mjs covering apps/worker/src/dunning.ts: interpretDunningEvent returns null for subscription events and the three kinds for invoice.payment_failed / invoice.payment_action_required / invoice.payment_succeeded; a payload with no resolvable user id returns null ra
- [~] Usage threshold notifications
      · Emitted: apps/worker/src/do/session.ts:2486 sends kind 'usage_threshold' after the last settlement when usageBand(state.creditsRemaining, state.creditsDaily) is not 'fine', with subject `usage:<day>:<band>` so it fires once per day per band
      → Add a source-level assertion (same technique as apps/worker/tests/notifications.test.mjs:177) that apps/worker/src/do/session.ts still emits kind 'usage_threshold' with a subject containing the day key and the band, so a refactor of finishRun cannot silently drop it. Rendering needs the inbox UI ite
- [~] Security event notifications
      · Genuinely wired, at five call sites, not just declared: securityNotice is defined at apps/worker/src/index.ts:2819 (kind 'security_event') and called at index.ts:2916, :2983, :3009 (API key mint / rotate / revoke), :3898 and :4025 (membersh
      → Add assertions to apps/worker/tests/api-key-rotation.test.mjs: after POST /api/keys succeeds, a notifications row exists with kind 'security_event', recipient_id = the key owner, and subject `key:<id>`; and after DELETE, a second row with the revoke title. Add the equivalent to apps/worker/tests/mem
- [~] Integration failure notifications
      · The kind exists and nothing produces it. grep -rn 'integration_failure' across apps and packages returns exactly two hits, both declarations: apps/worker/src/notifications.ts:53 (NOTIFICATION_KINDS) and :114 (the spec: warn, optional, targe
      → Pick the real integration failure paths and emit there. The strongest candidates: apps/worker/src/roblox-upload.ts (an Open Cloud publish rejected for a bad or expired API key) and apps/worker/src/asset-import.ts:231 (an import that fails because the user's key is missing). In each, on a terminal fa
- [~] Unread notification count
      · Computed, correct and tested: unreadCount at apps/worker/src/notification-store.ts:265 counts only read_at is null AND deliver_at <= now, so a row held by quiet hours is not counted — pinned by apps/worker/tests/notification-store.test.mjs:
      → Render the count in apps/web/src/components/layout.tsx as a superscript badge on the new inbox bell button (next to the settings gear at layout.tsx:143), read from the same react-query cache key the inbox popover uses so the number and the list agree. Update it from the POST /api/notifications/read 
- [~] Mark-as-read controls
      · The server control exists and is well tested: markRead at apps/worker/src/notification-store.ts:334 (ids or all, count read from the write's meta.changes at :354, and `all` restricted to delivered rows), route POST /api/notifications/read a
      → In apps/web/src/lib/api.ts add `export const markNotificationsRead = (body: {ids?: string[]; all?: boolean}) => request<{marked: number; unread: number}>('/api/notifications/read', { method: 'POST', body: JSON.stringify(body) })`. In apps/web/src/components/notification-inbox.tsx wire two controls: 
- [~] Notification grouping
      · Built, served and tested: groupKeyFor at apps/worker/src/notifications.ts:372 (recipient + kind + project, deliberately coarser than the dedupe key), groupNotifications at apps/worker/src/notification-store.ts:292 aggregating total/unread/l
      → Render `groups` in apps/web/src/components/notification-inbox.tsx as the popover's default view — one line per group showing kind label, project name, unread/total — with the flat `items` list shown when a group is expanded or when a 'Show all' toggle is on. Take both from the single fetchNotificati
- [~] Duplicate notification suppression
      · dedupeKeyFor at apps/worker/src/notifications.ts:361 (recipient + kind + subject) is set on every planned notification at notifications.ts:600, and deliverNotification at apps/worker/src/notification-store.ts:174 folds a repeat into the exi
      · REFUTED: The CODE is real and says what was claimed. dedupeKeyFor is at /Users/moshe/Desktop/RbxAI/apps/worker/src/notifications.ts:361 (recipient + kind + subject), it is set on the plan at notifications.ts:602 (claimed :600), a
- [~] Deep links to relevant resources
      · deepLinkFor at apps/worker/src/notifications.ts:341 resolves each kind's target through NOTIFICATION_ROUTES (:333), encodes the project id into the path, and returns null rather than a wrong link when a project-scoped kind has no project — 
      · REFUTED: The code and the test are both genuine — this one fails on reachability, not on honesty. Verified: deepLinkFor at /Users/moshe/Desktop/RbxAI/apps/worker/src/notifications.ts:341 returns NOTIFICATION_ROUTES[target] for ac
- [~] Quiet hours and digest scheduling
      · The scheduling engine is complete and the most heavily tested part of the section: inQuietHours at apps/worker/src/notifications.ts:407 (half-open, wraps midnight), quietHoursEnd at :422 (DST-safe via instantForWall), nextDigestAt at :422-4
      → Same control as 'Notification delivery preferences': a Notifications fieldset in apps/web/src/routes/settings.tsx with timezone, quiet-hours start/end (<input type="time">, sent as HH:MM), digest mode and digest hour, persisted through savePreferences('user', userId, prefs) (apps/web/src/lib/api.ts:

## 31. COLLABORATION AND REVIEW  —  55%   ✓2 ~18 ☐0

- [~] Shared project access
      · Worker half is complete and live-tested: apps/worker/src/index.ts:3623 GET /api/shared/:id, gate at index.ts:3512 sharedAccess, and apps/worker/tests/collab-routes.test.mjs:258 ('a MEMBER reads, and is told their role and exactly what it ca
      → Mount the panel that already exists. In apps/web/src/routes/workspace.tsx add 'members' to the Drawer/DrawerName unions and the DRAWERS array at line 71-73, add a <Drawer open={drawer === 'members'} title="Who can build here"> beside the existing ones at line 885, and render {drawer === 'members' &&
- [~] Shared conversation access
      · The shared route exists and is tested: apps/worker/src/index.ts:3655 GET /api/shared/:id/messages proxies the session DO, and apps/worker/tests/collab-routes.test.mjs:271-276 asserts a VIEWER gets 200 on it. But the web app never calls it. 
      → apps/web/src/lib/api.ts:132-133: change fetchMessages to request `/api/shared/${encodeURIComponent(projectId)}/messages?limit=${limit}` and fetchCheckpoints (api.ts:408) to `/api/shared/${projectId}/checkpoints`. Both shared routes already exist (apps/worker/src/index.ts:3655 and :3662) and are gate
- [✓] Shared artifact access
      · apps/worker/src/index.ts:597 GET /api/projects/:id/images/:imageId gates with withOwnedProject(..., 'read') rather than owner-only, with the reason written at index.ts:602-606 ('a share that hands over the prose and withholds the output is 
- [~] Resource-specific share links
      · The link itself is scoped and the scope is enforced AT REDEMPTION: apps/worker/src/collab.ts:441 redeemShareLink refuses wrong_project/wrong_scope/wrong_resource, apps/worker/src/index.ts:4154-4155 refuses a chat/build link minted with no r
      → Carry the scope onto the grant and enforce it at the door. Add `scope: ShareScope` and `resource_id: string | null` to KvGrant in apps/worker/src/collab-links.ts:94, write them in the redeem handler at apps/worker/src/index.ts:4199 from out.grant.scope/out.grant.resourceId, and in apps/worker/src/co
- [~] Share link expiration
      · Enforced in the worker on both sides of the link's life: apps/worker/src/index.ts:4157 accepts body.expiresAt when minting and pre-checks the row through redeemShareLink at index.ts:4172 (so a past or unparseable expiry is a 400 at mint tim
      → Add the control where links are minted. Once a share-link UI exists (see 'Share link revocation'), give its form an expiry select (24 hours / 7 days / 30 days / never) that posts expiresAt as an ISO string to POST /api/shared/:id/links, and render the expiry on each listed link. In apps/worker/src/c
- [~] Share link revocation
      · The route works and is driven over HTTP: apps/worker/src/index.ts:4214 POST /api/shared/:id/links/revoke, backed by revokeShareLink at apps/worker/src/collab-links.ts:86, with apps/worker/tests/collab-routes.test.mjs:407-431 minting, redeem
      → Add a listing and a UI. In apps/worker/src/collab-links.ts add `shareLinkProjectPrefix(projectId)` and store each minted link under a second key `share:link:by-project:<projectId>:<token>` in putShareLink (collab-links.ts:69), then add `app.get('/api/shared/:id/links', ...)` in apps/worker/src/index
- [✓] Member presence indicators
      · End to end and tested on both sides. Worker: apps/worker/src/do/session.ts:765 mints a beat when a socket is accepted, session.ts:651 broadcastPresence sends {type:'presence', present} to the room on connect, heartbeat and close, and apps/w
- [~] Active editor indicators
      · The three-state vocabulary exists everywhere except the browser. packages/shared/src/index.ts:444 declares the client message {type:'presence'; activity:'viewing'|'typing'|'building'}; apps/worker/src/do/session.ts:1406 handles it; apps/web
      → Two changes. (1) apps/web/src/components/ws/composer.tsx: on input, send {type:'presence',activity:'typing'} through the socket, debounced to at most one frame every ~5s, and send {type:'presence',activity:'viewing'} 3s after typing stops or on submit; expose a send() from apps/web/src/lib/use-proje
- [~] Inline comments
      · Comments are real, stored and gated, but they anchor to a whole object and nothing renders them. Store: apps/worker/src/do/collab-store.ts:200 addComment, schema at collab-store.ts:61-72 (target_kind, target_id, parent_id, body, resolved_at
      → Anchor them, then render them. (1) Add nullable `anchor` columns to the SCHEMA in apps/worker/src/do/collab-store.ts:61 (anchor_path text, anchor_start integer, anchor_end integer), validate them in planComment (apps/worker/src/collab-threads.ts:154) — refuse start>end and a negative offset — and re
- [~] Threaded replies
      · The reply relation is stored and its most dangerous failure is refused: apps/worker/src/collab-threads.ts:181-188 planComment validates parentId and returns 404 'parent_not_found' rather than silently promoting an orphan to a new top-level 
      → In apps/worker/src/collab-threads.ts:154 planComment, change the ctx hook from `threadExists?: (parentId: string) => boolean` to one that returns the parent's target, and refuse 400 'parent_on_another_target' when the parent's (kind,id) differs from the request's; in apps/worker/src/do/collab-store.
- [~] Member mentions
      · Parsing and resolution are complete and hostile-input tested: apps/worker/src/collab-threads.ts:108 parseMentions, :123 resolveMentions (a handle nobody answers to is REPORTED as unresolved and notified to nobody), stored at apps/worker/src
      → (1) Build the comment composer described under 'Inline comments' with an @-autocomplete fed by the members array already returned by GET /api/shared/:id (apps/worker/src/index.ts:3629), and surface the response's unresolvedMentions (collab-store.ts:230) inline as 'nobody here answers to @ghost'. (2)
- [~] Comment resolution
      · Built through every layer of the worker: apps/worker/src/index.ts:4319 POST /api/shared/:id/comments/resolve, apps/worker/src/do/collab-store.ts:235 resolveComment writes resolved_at/resolved_by, and the policy at apps/worker/src/collab-thr
      → Add a store test in apps/worker/tests/collab-store.test.mjs beside line 76: seed a comment as EDITOR, call s.resolveComment(EDITOR_CTX, {commentId, resolved:true}), then assert listComments returns resolvedAt as a number and resolvedBy as the editor's id. Then in the comment UI (see 'Inline comments
- [~] Comment reopening
      · The code path exists and is deliberate — apps/worker/src/collab-threads.ts:197 planCommentResolve takes a `resolved: boolean` and refuses 400 'bad_resolved_flag' for anything else, and apps/worker/src/do/collab-store.ts:243-246 writes NULL 
      → Add a test to apps/worker/tests/collab-threads.test.mjs beside line 154 and one to apps/worker/tests/collab-store.test.mjs: resolve a comment, then call resolveComment with {resolved:false} and assert resolvedAt and resolvedBy both come back null from listComments, and assert a VIEWER is still refus
- [~] Review requests
      · The worker side is thorough. apps/worker/src/index.ts:4322 POST /api/shared/:id/reviews (action 'request_review', needsDirectory true), apps/worker/src/collab-threads.ts:265 planReviewRequest refuses a reviewer who is not a member BY NAME, 
      → (1) Add POST /api/shared/:id/reviews/close in apps/worker/src/index.ts beside line 4323 (add the entry to COLLAB_ROUTES at index.ts:4228 with action 'request_review', and a `closeReview` case in the router at apps/worker/src/do/collab-store.ts:525) that sets closed_at = nowMs when the actor is the r
- [~] Reviewer assignment
      · Assignment happens, but only once, at request creation. apps/worker/src/collab-threads.ts:280-294 validates every reviewer against the project directory (refusing 'reviewer_not_a_member' and 'reviewer_cannot_approve' rather than dropping th
      → Add POST /api/shared/:id/reviews/reviewers to apps/worker/src/index.ts (an entry in COLLAB_ROUTES at line 4228 with action 'request_review' and needsDirectory:true, a literal app.post registration beside line 4322, and a `setReviewers` case in the router at apps/worker/src/do/collab-store.ts:525) th
- [~] Proposed change review
      · There is a review record attached to a change, but the change is never actually held pending. apps/worker/src/collab-threads.ts:250 restricts review targets to ['build','version'], and a version is a first-class row (apps/worker/src/do/coll
      → Decide which of the two this product means and build that one. If it is gated promotion: add a `requires_review` flag to a version row in apps/worker/src/do/collab-store.ts:79 and make restoreVersion (collab-store.ts:430) refuse 409 'awaiting_review' unless reviewState for that version is 'approved'
- [~] Approval and rejection records
      · The records themselves are complete and unusually well tested. apps/worker/src/do/collab-store.ts:358 approve writes collab_approvals(review_id, user_id, verdict, created_at) with insert-or-replace so a reviewer who changes their mind repla
      → (1) Add 'review_approved' and 'changes_requested' to NOTIFICATION_KINDS in apps/worker/src/notifications.ts:47 with a policy entry beside approval_requested at notifications.ts:112, then extend the notify block in apps/worker/src/index.ts:4280 to fire on a 200 from '/collab/reviews/approve', reading
- [~] Concurrent collaboration conflict handling
      · Three real conflict guards exist and are tested. (1) Two collaborators cannot start simultaneous runs: apps/worker/src/do/session.ts:1561 startGate = singleFlight(), with the race written out at session.ts:1566-1576, tested at apps/worker/t
      → (1) apps/worker/src/do/session.ts:1585 and :1597: replace this.broadcast({type:'error',code:'busy',...}) with a send to the originating socket only — thread the `ws` from webSocketMessage's chat case (session.ts:1414) into startRun and use the same targeted refuse() helper defined at session.ts:1388
- [~] Permission changes applied to active sessions
      · The HTTP half is correct and tested: every shared route re-resolves membership through sharedAccess (apps/worker/src/index.ts:3512) on every request, and apps/worker/tests/collab-routes.test.mjs:335 'a REVOKED member is a stranger again, on
      → Push the change into the room. In apps/worker/src/index.ts, after the writes succeed in the removal route (line 4021), the suspend route (line 4047) and the invite/role-change route (line 3852), call ctx.stub.fetch('https://do/collab/access-changed', {method:'POST', body: JSON.stringify({userId, rol
- [~] Collaborative activity history
      · The MEMBERSHIP history is built and tested: apps/worker/src/index.ts:3723 GET /api/shared/:id/members/events merges the Postgres membership_events rows with the link acceptances held in KV (index.ts:3765-3784) and reports `partial` when KV 
      → (1) Add fetchMemberEvents(projectId, userId?) to apps/web/src/lib/api.ts beside fetchMembers at line 577, calling GET /api/shared/:id/members/events, and render it as a 'History' tab in the members drawer — one line per event ('Maya changed Gil from viewer to editor · 2 days ago'), with the `partial

## 30. HISTORY, DIFFS, AND RECOVERY  —  48%   ✓4 ~11 ☐5

- [~] Project change timeline
      · The worker has a real append-only project timeline: apps/worker/src/version-history.ts:88 (planVersion) / :131 (planRestore, which appends a `restore` row rather than rewinding) / :169 (lineage, cycle-safe), stored at apps/worker/src/do/col
      → Add a Timeline drawer to apps/web/src/routes/workspace.tsx: extend the Drawer union at line 71 (and DRAWERS at line 73, which apps/web/tests/view-state.test.mjs:50 asserts against) with 'timeline', add `fetchProjectVersions(projectId)` to apps/web/src/lib/api.ts hitting GET /api/shared/:id/versions,
- [~] Studio operation timeline
      · Every Studio op is logged: apps/worker/src/do/session.ts:508 (oplog table with op_id, kind, ok, summary, created_at, failure) written at session.ts:2883 after each execStudioOp. It is served by apps/worker/src/index.ts:1451 (GET /api/projec
      → Add a 'Studio activity' section to apps/web: a component that calls GET /api/projects/:id/studio/diagnostics (add `fetchStudioDiagnostics` to apps/web/src/lib/api.ts) and renders `recentOps` newest-first as op kind, ok/failed with the `failure` kind, summary and time. Mount it in the Checkpoints dra
- [~] Script revision history
      · Two halves, neither complete. (a) Workspace files keep real versions — apps/worker/src/workspace-files.ts:136 historyOf and :237 revertWorkspaceFile, .luau/.lua are allowed types (apps/worker/src/webtools.ts:139), route GET /api/projects/:i
      → Mount the existing panel: in apps/web/src/routes/workspace.tsx add 'files' to the Drawer union (line 71) and DRAWERS (line 73), render <FilesPanel projectId={projectId} canEdit={...}/> inside a Drawer the way MemoryPanel is mounted at line ~893, and add a command-palette entry beside 'ws-checkpoints
- [✓] Scene snapshot history
      · Snapshots are stored, listed and reachable. apps/worker/src/do/session.ts:501-507 defines checkpoints + checkpoint_chunks; :3303 createCheckpoint gzips a full `snapshot` of game with scripts, chunks it, records scriptCount/instanceCount/siz
- [☐] Asset revision history
      · Searched apps/worker/src/asset-library.ts:556 (asset_library schema — id, name, kind, source, licence, sha256, status, created_at, updated_at; no version, revision or parent column), apps/worker/src/asset-library.ts:578 (asset_verification_
      → Add revision columns to the asset store in apps/worker/src/asset-library.ts:556 — `version integer not null default 1`, `supersedes text null` — and make the ingest/regenerate paths (apps/worker/src/asset-ingest.ts insert, apps/worker/src/imagegen.ts and meshgen.ts result handlers) insert a NEW row 
- [✓] Named checkpoints
      · A user types a name and it is stored and shown. apps/web/src/routes/workspace.tsx:805-826 is a form with a 'Name this checkpoint' input that calls createCheckpoint(label) (use-project-socket.ts:905-909, ws frame 'checkpoint_create'), handle
- [✓] Automatic pre-change checkpoints
      · Two automatic paths, both wired and both tested. (a) apps/worker/src/do/session.ts:1743-1759 takes a `pre_agent` checkpoint labelled 'before Apple changes' before any builder-mode run, inside a try so a throw cannot strand the run, and broa
- [☐] Snapshot descriptions
      · No description field exists on any snapshot. packages/shared/src/index.ts:964-972 CheckpointMeta is {id, label, createdAt, kind, scriptCount, instanceCount, sizeBytes} — label only, capped at 60 chars at apps/worker/src/do/session.ts:1143 a
      → Add `description text` to the checkpoints table in apps/worker/src/do/session.ts:501 (plus the `alter table ... add column` guard pattern already used at session.ts:520 for existing objects), add `description?: string` to CheckpointMeta in packages/shared/src/index.ts:964, accept it on the 'checkpoi
- [~] Author attribution
      · Only the collaboration version row carries a real author: apps/worker/src/version-history.ts:38 authorId, set from actor.userId at :116 and :154, stored at apps/worker/src/do/collab-store.ts:92/411, counted per member at collab-store.ts:489
      → Add `author_id text` to the checkpoints table in apps/worker/src/do/session.ts:501 (with the alter-table guard used at :520), set it from the ws actor in the 'checkpoint_create' handler (session.ts:1529, which already resolves a role via socketRole at :594) and from ctx.user on the HTTP path (apps/w
- [~] Run attribution
      · Live ops are attributed and that attribution is load-bearing and tested: apps/worker/src/do/session.ts:2856 tags every PendingOp with `runId: this.currentMsgId` (field at packages/shared/src/index.ts:244), and apps/worker/src/op-attribution
      → Add a `run_id text` column to the oplog table in apps/worker/src/do/session.ts:508 (with the alter-table guard at :520), pass `op.runId` into the insert at session.ts:2883, return it in the /studio/diagnostics payload (session.ts:1245) and as `messageId` on the type 'activity' search record at sessi
- [~] Script revision comparison
      · A real diff engine exists and is wired to one producer: apps/worker/src/luau-review.ts:198 diffHunks (LCS over lines, bounded, context hunks) and :285 diffStat, emitted as a `code_diff` panel by edit_script at apps/worker/src/tools.ts:1155-
      → Persist the panel: add `detail?: unknown` to ToolTraceEntry in packages/shared/src/index.ts:999, push `out.detail` into the trace entry at apps/worker/src/do/session.ts:2160 (it is already capped by capUiDetail at tools.ts:3036), and map it back in apps/web/src/lib/use-project-socket.ts:328-338 so r
- [~] Scene structure comparison
      · The display half is complete and the producer half is dead code — the exact pattern this audit is looking for. Blocks are defined at apps/web/src/lib/generative-ui/schema.ts:290 (scene_comparison) and :360 (checkpoint_comparison), validated
      → Add a `compare_checkpoints` path in the worker: in apps/worker/src/do/session.ts, add a GET /checkpoints/compare?a=&b= handler beside :1124 that gunzips both snapshots (reuse the chunk reassembly at :3367-3374), walks the two container trees and returns {added, removed, changed} instance paths; expo
- [~] Property-level change comparison
      · The schema and renderer support a genuine before→after per property and nothing in the product ever fills them. apps/web/src/lib/generative-ui/schema.ts:170-175 PropertyRow carries `changed?: boolean` and `previous?: string`, and apps/web/s
      → In apps/worker/src/tools.ts:1354 set_properties, read the instance first with the existing `{op:'get_instance', path}` (the same call get_instance makes at line 1396), apply the op, then emit a property_inspector panel into ctx.uiDetail whose rows set `changed: true` and `previous: displayTagged(bef
- [~] Selective change reversal
      · One selective reversal exists and it is for workspace files only: apps/worker/src/workspace-files.ts:237 revertWorkspaceFile (which writes forward — 'a history that can be rewritten by using it is not a history', header line 23), reachable 
      → Two parts. (1) Mount the existing panel: in apps/web/src/routes/workspace.tsx add 'files' to the Drawer union (line 71) and DRAWERS (line 73) and render <FilesPanel/> in a Drawer, so the per-file 'Put back' at files-panel.tsx:282 becomes reachable. (2) Add partial place restore: extend the `restore`
- [✓] Full checkpoint restoration
      · apps/worker/src/do/session.ts:3351 restoreCheckpoint reassembles the gzip chunks (:3367-3374), gunzips and sends `{op:'restore', root:'game', snapshot}` to the plugin with a 120s budget (:3377); apps/plugin/src/Serializer.luau:164-250 clear
- [☐] Restoration impact preview
      · Nothing computes or shows what a restore would change or discard before it runs. The only thing standing between the button and the destruction is a browser confirm string at apps/web/src/routes/workspace.tsx:855 — 'Restore "x"? This replac
      → Add GET /api/projects/:id/restore/preview?checkpointId= to apps/worker/src/index.ts beside the restore route at line 1373, backed by a new SessionDO handler beside session.ts:1147 that runs the existing CENSUS_LUAU (apps/worker/src/playtest.ts:38) against the live place, gunzips the target snapshot'
- [~] Restore conflict detection
      · Two generic op-level conflict guards do cover a restore. (a) apps/worker/src/do/session.ts:2845-2847 refuses to queue ANY op, restore included, when Studio has a different place open than the project is bound to (`placeMismatch`, built in a
      → Give the restore an optimistic-concurrency check the way edit_script already has one (apps/worker/src/tools.ts:1109-1117 refuses on a stale base_hash). Record the head oplog id and the live census hash at checkpoint time in the checkpoints row (apps/worker/src/do/session.ts:501/3324), and in restore
- [☐] Restore progress display
      · A restore is one opaque op with no progress and, on success, no feedback at all. apps/worker/src/do/session.ts:3377 issues a single `restore` op with a 120s timeout and broadcasts nothing while it is in flight; the ws handler at session.ts:
      → Model it on the playtest stream. Add `{type:'restore_status', checkpointId, phase: 'reading'|'applying'|'verifying'|'done'|'failed', note?, fidelity?}` to ServerMsg in packages/shared/src/index.ts:910, broadcast it from apps/worker/src/do/session.ts:3351 restoreCheckpoint at each stage (after chunk 
- [~] Restore result verification
      · The verification itself is built and well tested, on two independent levels. (1) apps/plugin/src/Serializer.luau:182-248 counts created instances, written scripts and failed instance/script/property writes and sets `restored = failedInstanc
      → Carry the verification to the browser. In apps/worker/src/do/session.ts:1545, broadcast the full result on success too — the new `restore_status` / `restore_result` ServerMsg carrying `{ok, fidelity, note}` (add it to packages/shared/src/index.ts:910) — not just the error branch. Then in apps/web/sr
- [☐] Recovery from interrupted restoration
      · A restore that is interrupted leaves the place destroyed with no resume path. apps/plugin/src/Serializer.luau:243-250 iterates the containers calling clearChildren FIRST and then rebuilding, with no journal, no transaction spanning containe
      → Make the restore resumable and detectable. In apps/worker/src/do/session.ts:3351, write `restoreInProgress = {checkpointId, startedAt, containersDone: []}` to ctx.storage before issuing the op and delete it only after the fidelity check passes; on DO boot (the blockConcurrencyWhile block at session.

## 32. FILES, ARTIFACTS, AND EXPORTS  —  48%   ✓2 ~15 ☐3

- [~] Project file browser
      · Worker half is done and tested: apps/worker/src/index.ts:1224 GET /api/projects/:id/files returns files, derived folders, totals and the trash; apps/worker/src/workspace-files.ts:94 listWorkspace; proven by apps/worker/tests/files-routes-li
      → Mount the existing panel. In apps/web/src/routes/workspace.tsx add 'files' to the `Drawer` union and the `DrawerName`/`DRAWERS` list at lines 71-73, import FilesPanel from '../components/ws/files-panel', and add beside the credits drawer at line 885: <Drawer open={drawer === 'files'} onClose={() => 
- [~] Folder creation and management
      · Folders exist as derived prefixes and can be browsed: apps/worker/src/workspace-files.ts:94-127 builds a `folders` array from shared path prefixes, the route takes ?prefix (apps/worker/src/index.ts:1229), and apps/web/src/components/ws/file
      → In apps/worker/src/index.ts add two ops to the /api/projects/:id/files/op switch (around line 1300): 'move_folder' {path,to} which lists the store under `path + '/'` and calls moveWorkspaceFile (apps/worker/src/workspace-files.ts:162) for every file with the prefix re-written, refusing the whole bat
- [☐] File upload
      · The existing [✓] cites tests/deploy-content-type.test.mjs, which tests infra/deploy-static.mjs — the script that pushes the built marketing site into D1 via POST /api/admin/static-upload (apps/worker/src/index.ts:2764, admin-key gated). Tha
      → Add POST /api/projects/:id/files/content in apps/worker/src/index.ts next to the existing GET at line 1236, gated by `sharedAccess(c, id, 'build')` exactly as /files/op is at line 1287. Body {path, content}; run checkWorkspacePath, refuse over WORKSPACE_MAX_BYTES (48 KB, apps/worker/src/webtools.ts:
- [☐] Multipart upload recovery
      · Searched for 'multipart' across apps/worker/src, apps/web/src, apps/site/src, apps/plugin, packages, scripts and both tests directories: the only hits are apps/worker/src/roblox-upload.ts:145-156, a FormData POST out to Roblox with no resum
      → Blocked on File upload existing; do not build it first. When POST /api/projects/:id/files/content is added, give it a resumable variant rather than retrofitting one: POST .../files/upload returns an uploadId, PUT .../files/upload/:uploadId?offset=N appends and returns the committed byte count so a c
- [~] File rename
      · Worker: apps/worker/src/index.ts:1300-1304 maps op 'rename' onto moveWorkspaceFile (apps/worker/src/workspace-files.ts:162), which validates BOTH paths through twoPaths (workspace-files.ts:63) and refuses an occupied destination rather than
      → Mount FilesPanel per the Project file browser row (apps/web/src/routes/workspace.tsx:71-73 and :885) — the Rename button at apps/web/src/components/ws/files-panel.tsx:223 is already correct and already maps refusal codes through refusalCopy. If the agent should also be able to rename, add a `workspa
- [~] File move
      · Same route and same function as rename by design — apps/worker/src/index.ts:1300-1304 falls 'rename' through to 'move' with the comment that a rename is a move sharing a folder, so there is one validation path rather than two. moveWorkspace
      → Mount FilesPanel (apps/web/src/routes/workspace.tsx:71-73, :885). Note that the panel's only move affordance today is the Rename prompt at apps/web/src/components/ws/files-panel.tsx:221, which does accept a path with slashes and therefore does move files between folders — but the prompt text says 'N
- [~] File duplication
      · Built and route-tested. apps/worker/src/index.ts:1305-1312 handles op 'copy', and when no destination is given it asks freeCopyPath (apps/worker/src/workspace-files.ts:265) for a name, which probes the store for each candidate rather than t
      → Mount FilesPanel (apps/web/src/routes/workspace.tsx:71-73, :885). The button at apps/web/src/components/ws/files-panel.tsx:234 already posts {op:'copy', path} with no destination, which is the branch that gets the free name, and the success notice reads 'Duplicated' — improve it to name the file the
- [~] File version history
      · Two separate histories exist and neither reaches a user. (1) Workspace files: every write archives the previous text (apps/worker/src/webtools.ts:315 kvWorkspace, capped at WORKSPACE_MAX_VERSIONS=20 at :208), exposed by GET /api/projects/:i
      → Mount FilesPanel (apps/web/src/routes/workspace.tsx:71-73, :885); its Earlier versions list and Put back button at apps/web/src/components/ws/files-panel.tsx:252-285 already fetch /files/history and post op 'revert'. Separately, add client functions in apps/web/src/lib/api.ts for GET/POST /api/share
- [~] File previews
      · The renderer is written and is reached by nobody and tested by nobody. apps/web/src/components/ws/files-model.ts:226 previewOf classifies by extension (prose/table/data/code, apps/web/src/components/ws/files-model.ts:188-201), caps at 200 l
      → Two changes. (1) Mount FilesPanel (apps/web/src/routes/workspace.tsx:71-73, :885). (2) Create apps/web/tests/files-model.test.mjs — the file the module's own header already claims exists — with node:test cases over previewOf (a CSV of 60 lines reports truncated:true and totalRows 60; a .luau file is
- [~] File download
      · Workspace-file download is built and tested: apps/worker/src/index.ts:1259-1270 serves ?download=1 as Content-Disposition attachment with text/plain, nosniff and a filename stripped of anything outside [A-Za-z0-9._-]; proven by apps/worker/
      → (1) Mount FilesPanel (apps/web/src/routes/workspace.tsx:71-73, :885) so the Download button at apps/web/src/components/ws/files-panel.tsx:210 is reachable. (2) Fix generated audio: add `fetchAudioObjectUrl(projectId, audioId, {download})` to apps/web/src/lib/api.ts modelled exactly on fetchImageObje
- [☐] Bulk file download
      · Nothing archives or streams more than one file. Searched apps/worker/src and apps/web/src for zipSync, createZip, makeZip, 'application/zip' and '.zip': the only hits are apps/worker/src/asset-import.ts:138-159 (fetching third-party asset a
      → Add GET /api/projects/:id/files/archive in apps/worker/src/index.ts beside the content route at line 1236, gated by withOwnedProject(...,'read') like the listing. Build a stored (compression method 0) ZIP in a ReadableStream so nothing is buffered whole — the workspace is bounded by WORKSPACE_MAX_BY
- [~] Generated artifact persistence
      · Split decision. Text the agent writes DOES persist: kvWorkspace (apps/worker/src/webtools.ts:315) writes with no expirationTtl at all — the only TTL in the store is on trash entries (webtools.ts:431, 30 days) — and up to 20 prior versions a
      → Decide the retention policy first and write it in apps/worker/src/imagegen.ts beside IMAGE_TTL_SECONDS (line 681). If artifacts should survive the conversation, add an R2 binding to apps/worker/src/env.ts and apps/worker/wrangler.jsonc, change storeImage (imagegen.ts:696) and storeAudio (audio-store
- [~] Artifact metadata
      · Files carry real metadata and it is served: path, bytes, updatedAt per row plus totals and limits from apps/worker/src/index.ts:1224, and version/savedAt per version from /files/history (index.ts:1274), asserted by apps/worker/tests/files-r
      → Widen the KV metadata at the two write sites so the facts live with the bytes rather than only in a transcript: in apps/worker/src/imagegen.ts:683 extend ImageMeta to {expiresAt, contentType, bytes, width, height, subject, model, runId} and populate it in storeImage (line 696, whose callers at apps/
- [✓] Artifact provenance
      · Built, wired end to end, and reachable. apps/worker/src/provenance.ts:159 recordAssetUse writes project_asset_use, and apps/worker/tests/provenance-wiring.test.mjs:30 pins that insert_asset records the use ONLY after the asset passes the po
- [✓] Artifact access permissions
      · Authorisation is the project, not the identifier, and it is enforced on every artifact path. Generated images: apps/worker/src/index.ts:597 uses withOwnedProject(c, id, 'read') then builds the key itself via imageKvKey (apps/worker/src/imag
- [~] Expiring download links
      · Expiry of the OBJECT is real, correct and tested. apps/worker/src/imagegen.ts:701 and apps/worker/src/audio-store.ts:88 write with expirationTtl 3600 and store expiresAt anchored at write time; remainingLife (apps/worker/src/index.ts:572) m
      → Add a short-lived download grant rather than widening the share link. In apps/worker/src/index.ts add POST /api/projects/:id/files/link (gated 'read') that mints an opaque token into KV keyed `dl:<token>` with value {projectId, path, version} and expirationTtl of at most 900 seconds, and GET /api/do
- [~] Storage usage visibility
      · The worker computes it honestly and no user can see it. apps/worker/src/workspace-files.ts:94-127 sums totalBytes, counts rows whose size was never recorded into `unmeasured` rather than summing them as zero, and returns limits {maxFileByte
      → Mount FilesPanel (apps/web/src/routes/workspace.tsx:71-73, :885) — that alone puts the summary line in front of the user. Additionally add a Storage block to apps/web/src/routes/usage.tsx beside the credits meter (around line 222) that calls fetchProjectFiles (apps/web/src/lib/api.ts:750) per projec
- [~] File deletion recovery
      · The mechanism is complete and route-tested. deleteWorkspaceFile (apps/worker/src/workspace-files.ts:204) soft-deletes and returns deletedAt AND expiresAt so a UI can state the window; the trash entry is written BEFORE the file is removed (a
      → Mount FilesPanel (apps/web/src/routes/workspace.tsx:71-73, :885); the trash list, the countdown from trashLine and the Bring back button at apps/web/src/components/ws/files-panel.tsx:296-320 are already correct, as is the confirmation copy that states the window (files-model.ts:294 deleteConfirm). A
- [~] Export progress tracking
      · There is a busy signal and nothing that tracks progress. apps/web/src/routes/workspace.tsx:183 fires a 'Preparing <project> as Markdown…' toast before calling downloadExport and an error toast on failure (:187) — but there is no completion 
      → In apps/worker/src/index.ts:1179-1184 add a Content-Length header to the export Response (the body string's byte length is already known there). Then in apps/web/src/lib/api.ts:479 change downloadExport to read res.body.getReader() in a loop, accumulate chunks, and invoke an optional onProgress(rece
- [~] Export integrity verification
      · Completeness is verified; integrity of the bytes is not. The export declares what it contains: apps/worker/src/do/session.ts:1099-1113 returns messageCount, totalMessages and `truncated` rather than silently clipping, and apps/worker/src/ex
      → Two changes. (1) In apps/worker/src/index.ts:1179-1184, compute `await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))` and emit it as an X-Golem-Export-SHA256 header alongside a Content-Length, and for format=json include the same hex digest as a top-level `sha256` field computed ov

## 37. SUBSCRIPTION LIFECYCLE  —  30%   ✓0 ~12 ☐8

- [~] Subscription creation
      · Full path exists and is exercised end to end. Route: apps/worker/src/index.ts:1869 (POST /api/billing/checkout) building the Stripe session via buildCheckoutRequest at apps/worker/src/billing.ts:396; the resulting customer.subscription.crea
      · REFUTED: The repo half of the evidence holds: apps/worker/src/index.ts:1869 is POST /api/billing/checkout, :1888 calls checkoutGuard, apps/worker/src/billing.ts:396 is buildCheckoutRequest, :296 is the customer.subscription.creat
- [~] Subscription status display
      · apps/worker/src/billing.ts:133 subscriptionView collapses the stored Stripe record into one of seven states; served on /api/me at apps/worker/src/index.ts:2003; rendered by the BillingNotice component at apps/web/src/routes/usage.tsx:84-103
      · REFUTED: Every file:line checks out in HEAD (billing.ts:133 subscriptionView with the seven BillingState values at :83-97, index.ts:2003 serving it on /api/me, usage.tsx:84-103 BillingNotice, billing-copy.ts:83 billingNotice) and
- [☐] Trial start
      · Nothing anywhere starts a trial. The Stripe checkout body is built at apps/worker/src/billing.ts:414-436 and sets mode, line_items, urls, client_reference_id, metadata and allow_promotion_codes — no trial_period_days and no subscription_dat
      → Decide first whether this is wanted: apps/site/src/pages/pricing.astro:81 and :113 currently sell 'no trial countdown' as a feature, so this item may deserve the [✗] not-planned mark that 'Seat count changes' has. If trials ARE wanted: add a TRIAL_DAYS constant and set p.set('subscription_data[trial
- [~] Trial conversion
      · The state machine would survive a conversion but nothing drives or announces one. Built half: 'trialing' entitles (apps/worker/src/billing.ts:60) and is its own view state (apps/worker/src/billing.ts:161, tested apps/worker/tests/billing-su
      → In apps/web/src/lib/billing-copy.ts, the 'active' branch (line 93) cannot tell a first charge after a trial from an ordinary renewal. Carry a 'converted' signal: in apps/worker/src/billing.ts subscriptionView, when sub.status === 'active' and the previous stored status was 'trialing', set a new Subs
- [☐] Trial expiration reminders
      · No reminder of any kind. customer.subscription.trial_will_end is not in interpretStripeEvent's switch (apps/worker/src/billing.ts:295-331, which handles only the three customer.subscription.* events and checkout.session.completed) and not i
      → Two pieces. (1) apps/worker/src/dunning.ts: add 'customer.subscription.trial_will_end' to EVENT_TO_KIND with a new kind 'trial_ending', give it a dunningCopy branch naming the date from data.object.trial_end and what will be charged, and read the user id from subscription metadata (the existing user
- [~] Plan upgrade preview
      · There is a plan comparison but no preview of the change. Built half: apps/web/src/components/plans.tsx:77-126 renders every tier's price, monthly credits, builds/day and highlights before the user commits, with the charge currency stated fr
      → Add GET /api/billing/preview?plan=<id> in apps/worker/src/index.ts near the other billing routes (line 1955), which reads the caller's customerId and subscriptionId via readBillingRecord (index.ts:1737) and calls Stripe GET /v1/invoices/upcoming with subscription, subscription_items[0][id] and subsc
- [~] Immediate upgrade handling
      · free->paid is immediate and proven; paid->paid is wired to a path that grants the WRONG tier. Working half: the webhook recomputes entitlement and writes it at once (apps/worker/src/index.ts:1828 entitlementFor -> /set-plan), tested at apps
      → In apps/worker/src/billing.ts add the inverse of priceIdFor — export function planForPriceId(env, priceId): PlanId | null comparing against STRIPE_PRICE_BUILDER and STRIPE_PRICE_STUDIO (declared at apps/worker/src/env.ts:45-46). In interpretStripeEvent's customer.subscription.* branch (billing.ts:30
- [~] Scheduled downgrade handling
      · Scheduled downgrade TO FREE is fully handled; scheduled downgrade between two paid tiers is not modelled. Working half: cancelAtPeriodEnd is parsed (apps/worker/src/billing.ts:314), persisted whole (apps/worker/src/do/quota.ts:149), turned 
      → Extend Subscription in apps/worker/src/billing.ts:32 with pendingPlan: PlanId | null and pendingAt: number | null, populated in interpretStripeEvent from obj['schedule'] / obj['pending_update'] (resolve the price id through the planForPriceId helper described under 'Immediate upgrade handling'). Per
- [☐] Proration preview
      · Searched 'proration|prorate|upcoming|invoices/upcoming' across apps/ and packages/ (excluding node_modules and packages/corpus). The only hits are three comments all saying Stripe owns it and we do not: apps/worker/src/billing.ts:349, apps/
      → Build the GET /api/billing/preview route described under 'Plan upgrade preview' — it is the same Stripe call. Add it in apps/worker/src/index.ts beside /api/billing/history (line 1955): read customerId and the subscription via readBillingRecord (index.ts:1737), GET https://api.stripe.com/v1/invoices
- [☐] Seat count changes
      · Deliberately not built. There is no seat, organization or workspace concept in the code: the schema is one row per user with projects owned by a profile, recorded in docs/design/TENANCY.md:24-30, and the owner's decision of 2026-09-15 is ca
      → No work. Out of scope by the owner's decision recorded in docs/design/TENANCY.md and on the checklist line; this item should keep its [✗] mark rather than being scheduled.
- [☐] Billing cycle changes
      · There is only one billing cycle and no way to express another. The plan table carries priceUsdMonthly and nothing else (packages/shared/src/index.ts:1327, values at :1376, :1383, :1390, :1397); there is no interval, no annual price, and no 
      → If annual billing is wanted: add priceUsdAnnual to the PlanCopy interface at packages/shared/src/index.ts:1327 and to each entry; add STRIPE_PRICE_BUILDER_ANNUAL and STRIPE_PRICE_STUDIO_ANNUAL to apps/worker/src/env.ts:45 and to the CheckoutEnv interface at apps/worker/src/billing.ts:354; change pri
- [~] Cancellation at period end
      · The control, the resulting state and the sentence all exist and are tested. Control: POST /api/billing/portal at apps/worker/src/index.ts:1916 via buildPortalRequest (apps/worker/src/billing.ts:440), reachable from two places on /app/usage 
      · REFUTED: HEAD is as described — billing.ts:314 reads cancel_at_period_end, quota.ts:149 stores the subscription whole, billing.ts:153-156 returns state 'cancelling' with endsAt set and renewsAt null, billing-copy.ts:113-122 emits
- [~] Cancellation confirmation
      · The end STATE is confirmed; the ACT is not. Present: once the webhook lands, /app/usage says 'Your X plan ends on DAY' plus 'You keep X until then, and nothing is charged after that' (apps/web/src/lib/billing-copy.ts:113-122, tested apps/we
      → In apps/worker/src/index.ts:1921 change the portal return URL to `${origin}/app/usage?billing=returned`. In apps/web/src/routes/usage.tsx extend the useEffect at line 236 to also recognise a 'billing' flag: set a state that refetches /api/me and then renders a plans-note (same pattern as lines 360-3
- [~] Cancellation reversal before expiration
      · The affordance and the storage path are there; nothing tests it and it leaves no trace. Present: the 'cancelling' notice's action label is 'Resume or change this plan' and its button opens the portal (apps/web/src/lib/billing-copy.ts:120, r
      → Add a test to apps/worker/tests/billing-persistence.test.mjs modelled on 'A CANCELLING SUBSCRIPTION SURVIVES THE ROUND TRIP AS CANCELLING' (line 138): setPlan with cancelAtPeriodEnd true, then setPlan with cancelAtPeriodEnd false under a different eventId, and assert subscriptionView returns state '
- [☐] Subscription pause where supported
      · Nothing models a paused subscription. BillingState lists exactly none|active|trialing|cancelling|past_due|needs_action|lapsed (apps/worker/src/billing.ts:83-97) and its client mirror the same seven (apps/web/src/lib/billing-copy.ts:20-42, c
      → If pausing is wanted: enable pause in the Stripe Billing Portal configuration (no code), then teach the reader about it — add pauseCollection: { behavior: string; resumesAt: number | null } | null to the Subscription interface at apps/worker/src/billing.ts:32, populate it in interpretStripeEvent fro
- [☐] Subscription resumption where supported
      · Same search as 'Subscription pause where supported' and the same result: there is no paused state to resume from. The word 'resume' appears twice, neither of them a resumption path — a prose comment about reactivation at apps/worker/src/bil
      → Depends entirely on pause being built first — see 'Subscription pause where supported'. Once a 'paused' BillingState exists in apps/worker/src/billing.ts, give it a billingNotice branch in apps/web/src/lib/billing-copy.ts with action 'Resume your plan' pointing at the existing portal mutation (apps/
- [☐] Renewal reminders
      · Nothing reaches out before a renewal. invoice.upcoming is absent from EVENT_TO_KIND, which lists only invoice.payment_failed, invoice.payment_action_required and invoice.payment_succeeded (apps/worker/src/dunning.ts:25-31), and absent from 
      → Add 'invoice.upcoming' to EVENT_TO_KIND in apps/worker/src/dunning.ts:25 as a new kind 'renewal_upcoming' with a dunningCopy branch naming the amount (formatAmount at dunning.ts:118 already exists) and the date from data.object.next_payment_attempt; it will then flow through the existing call at app
- [~] Past-due grace period handling
      · Built, wired, tested, and visible to the person it affects. The grace itself: 'past_due' is in ENTITLING_STATUSES with the reasoning at apps/worker/src/billing.ts:56-60, and it stops entitling the moment the period lapses (apps/worker/src/b
      · REFUTED: Refuted on deployment, plus one substantive error in the evidence itself. The evidence error: 'it stops entitling the moment the period lapses (billing.ts:66)' is true of the pure function and false of enforcement. `enti
- [~] Subscription reactivation
      · A lapsed customer can buy again, and the refusal that would have blocked it is explicitly carved out. Server: checkoutGuard refuses a second checkout only while a subscription is LIVE, and 'lapsed' is deliberately not in LIVE_STATES (apps/w
      · REFUTED: The server carve-out is real in HEAD (LIVE_STATES at billing.ts:167 omits 'lapsed'; checkoutGuard at :182-189; enforced at index.ts:1888) and billing-routes-live.test.mjs:163 genuinely drives it over HTTP with a canceled
- [~] Historical subscription change records
      · The mechanism is real and tested, but it silently skips cancellation and its reversal — the two changes a customer is most likely to dispute. Built: billing_events table (apps/worker/src/do/quota.ts:30), written by record() (quota.ts:83), r
      → In apps/worker/src/do/quota.ts, widen the comparison at line 161 to include the cancellation flag: change the condition to `next !== before || status !== (beforeSub?.status ?? null) || (subscription?.cancelAtPeriodEnd ?? false) !== (beforeSub?.cancelAtPeriodEnd ?? false)`, and extend the billing_eve

## 35. PLANS AND ENTITLEMENTS  —  45%   ✓3 ~12 ☐5

- [✓] Defined subscription plan catalog
      · packages/shared/src/index.ts:1299 PLAN_LIMITS defines four tiers (free 231/2,310, builder 416/12,600, studio 700/21,000, enterprise 833/25,000); PLAN_COPY at :1371 gives each a name, blurb, price and highlights; PLAN_FEATURES at :1469 is a 
- [✓] Free plan entitlements
      · packages/shared/src/index.ts:1300 `free: { creditsPerDay: 231, creditsPerMonth: 2_310 }`. Enforced, not merely declared: apps/worker/src/quota-math.ts:63 reads PLAN_LIMITS[plan] for the daily/monthly remainder, apps/worker/src/do/quota.ts:9
- [~] Paid plan entitlements
      · builder/studio rows at packages/shared/src/index.ts:1301-1302, granted only by a verified Stripe event: apps/worker/src/index.ts:1828 recomputes the tier through entitlementFor and POSTs it to do/quota.ts:127 /set-plan, which stores it idem
      · REFUTED: REFUTED on reachability. The code is all there and the tests are genuine — packages/shared/src/index.ts:1301-1302, apps/worker/src/index.ts:1828 entitlementFor, do/quota.ts:127 /set-plan, claimEvent at :71 (evidence said
- [~] Team plan entitlements
      · There is no plan id 'team'. `studio` ($40, packages/shared/src/index.ts:1302 + PLAN_COPY at :1388 'For a few people building together on the same places') is the team tier and its ALLOWANCE half is real and enforced like any other row. The 
      → Decide which half is wrong and change that one. (a) If Studio is meant to be the collaboration tier: add a plan gate in apps/worker/src/collab.ts around the invite/membership entry points (the routes at apps/worker/src/index.ts:3925 planBulkInvite and the /api/shared/* membership writes) that reads 
- [~] Enterprise entitlement overrides
      · An `enterprise` row exists (packages/shared/src/index.ts:1303, 833/25,000) and is correctly non-self-serve: apps/worker/src/billing.ts:366 priceIdFor returns null for it and buildCheckoutRequest refuses at :403 (tested in apps/worker/tests/
      → Add a per-account limit override to the quota ledger. In apps/worker/src/do/quota.ts add a storage key `limitsOverride` ({creditsPerDay, creditsPerMonth} | null) written by a new `/set-limits` handler, and have state() at do/quota.ts:89 pass the override into quotaState; in apps/worker/src/quota-mat
- [~] Feature-to-plan mapping
      · packages/shared/src/index.ts:1469 PLAN_FEATURES is a genuine, complete mapping — `values: Record<PlanId, boolean | string>` is required by the type, so no plan can have a missing cell — and it is rendered as a comparison table at apps/site/
      → In packages/shared/src/index.ts, change the 'credits' row at :1513 to `everyPlan(() => false)` (or add the purchase path first — see item 20) and remove 'Priority during busy periods' from PLAN_COPY.builder.highlights at :1384 until apps/worker/src/do/budget.ts actually reads a plan. Then add tests/
- [~] Server-enforced feature access
      · Exactly two server paths condition on the plan, and both are real and tested: apps/worker/src/quota-math.ts:63 (the allowance, via do/quota.ts:98 and /spend at do/quota.ts:113 — apps/worker/tests/quota-spend.test.mjs:95) and apps/worker/src
      → Add `export function planAllows(plan: PlanId, featureId: string): boolean` to packages/shared/src/index.ts reading the PLAN_FEATURES row by id (string values count as allowed, false as denied), and a Hono helper in apps/worker/src/index.ts — `requireFeature(featureId)` — that reads the caller's plan
- [✓] Client-visible entitlement state
      · Three independent surfaces, all fed from the server. GET /api/me (apps/worker/src/index.ts:1981) returns `quota` (plan + daily/monthly allowance + used, from QuotaDO state at do/quota.ts:89) and `billing: subscriptionView(...)` at index.ts:
- [☐] Seat limits
      · Searched apps/worker/src, apps/web/src and packages/shared/src for 'seat' and 'quantity': the only hits are unrelated (worldbuilding.ts:28 furniture dimensions, semantic.ts:575 'seating'). apps/worker/src/billing.ts:417 hardcodes `line_item
      → Deliberately out of scope — do not build this. The one concrete action worth taking is to record the decision where the design note lives: append a dated 'DECISION' section to docs/design/TENANCY.md stating that option 3 was chosen, so the next reader does not re-open the question from a file that s
- [☐] Project limits
      · Projects are inserted straight into Supabase from the browser under RLS — apps/web/src/routes/dashboard.tsx:171 and :381, apps/web/src/components/layout.tsx:46 — so there is no worker route that could count them (apps/worker/src/index.ts ha
      → Only build this if the offer changes — today's pricing page promises unlimited projects on every tier. If a cap is wanted: add `maxProjects` to each row of PLAN_LIMITS in packages/shared/src/index.ts:1299, then enforce it where creation actually happens, which is the database, not the worker — add a
- [☐] Storage limits
      · Per-item caps exist and are enforced — WORKSPACE_MAX_BYTES 48KB (apps/worker/src/webtools.ts:153, refused at :1281 and workspace-files.ts:198), MAX_UPLOAD_BYTES 20MB (apps/worker/src/roblox-upload.ts:28, preflight at :113, tested at apps/wo
      → Only worth building alongside a decision to charge for storage. If wanted: add `storageBytes` counters to apps/worker/src/do/quota.ts (incremented where blobs are written — apps/worker/src/persist.ts, assets.ts and the checkpoint writer in do/session.ts) plus `maxStorageBytes` on each PLAN_LIMITS ro
- [~] Concurrent run limits
      · One run at a time per project session IS enforced, synchronously and correctly: apps/worker/src/single-flight.ts:26-32 sets `inFlight` before the first await, used by the SessionDO run loop, and apps/worker/tests/single-flight.test.mjs:3 do
      → Add `maxConcurrentRuns` to each PLAN_LIMITS row in packages/shared/src/index.ts:1299 and enforce it in QuotaDO rather than in SessionDO, since QuotaDO is the one object per account: add `/claim-run` and `/release-run` handlers to apps/worker/src/do/quota.ts holding a set of active run ids with a tim
- [☐] Model access limits
      · Model choice is a function of MODE, never of plan. apps/worker/src/gateway.ts:114-134 DEFAULT_MODELS is keyed clay/stone/rune/memory/vision, and no plan value reaches getModels (gateway.ts:139) or selectProvider — grep for 'plan' in gateway
      → Only build if a mode or model is to be sold. The plumbing: add `modes: ProductMode[]` (or `models`) to each PLAN_LIMITS row in packages/shared/src/index.ts:1299; thread the caller's plan into apps/worker/src/do/session.ts where the mode is resolved (session.ts:1728 sets agent.phase from mode; the mo
- [☐] Integration limits
      · No count cap on any integration, plan-scoped or otherwise. Public API keys: apps/worker/src/api-keys.ts has only a per-key REQUEST rate (KEY_RATE_LIMIT at :279, live 120 / test 60, chosen by key mode at :380 — not by plan) and no maximum nu
      → Add `maxApiKeys` and `maxAutomations` to each PLAN_LIMITS row in packages/shared/src/index.ts:1299 and enforce at creation: in apps/worker/src/api-keys.ts, before minting in the create path used by apps/worker/src/index.ts, count the account's live keys and refuse with 402 naming the plan when at th
- [~] Support level entitlements
      · The catalog states a differentiated support level and one surface acts on it — PLAN_COPY.enterprise.highlights includes 'Direct support' (packages/shared/src/index.ts:1398), PLAN_FEATURES 'invoicing' (:1526) is true only for unpriced plans,
      → First, fix the dead address: change the href at apps/web/src/components/plans.tsx:138 from mailto:hello@apple.build to the address used everywhere else (apple.labs.app@gmail.com, as in apps/site/src/components/Footer.astro:49), keeping the ?subject=Enterprise%20plan. Then either add a real support l
- [~] Trial entitlements
      · The half that READS a trial is complete and tested: 'trialing' is in ENTITLING_STATUSES (apps/worker/src/billing.ts:60), subscriptionView returns state 'trialing' (billing.ts:161) — apps/worker/tests/billing-subscription.test.mjs:183 'a tri
      → Decide whether trials are part of the offer. If yes: add `trialDays?: number` to PLAN_COPY in packages/shared/src/index.ts:1371 and have apps/worker/src/billing.ts:396 buildCheckoutRequest emit `p.set('subscription_data[trial_period_days]', String(days))` when the chosen plan has one and the account
- [~] Trial expiration handling
      · The pure decision is right and tested: apps/worker/src/billing.ts:66 drops to 'free' the moment currentPeriodEnd passes whatever the status says, asserted at apps/worker/tests/billing.test.mjs:92 'a lapsed period never entitles', and subscr
      → Make entitlement a read-time computation rather than a stored fact. In apps/worker/src/do/quota.ts, have plan() at :47 read the stored `subscription` as well and return `entitlementFor(subscription, Date.now()/1000)` when one exists, falling back to the stored plan id otherwise — that makes state(),
- [~] Entitlement change propagation
      · The webhook-driven path is built, wired and tested end to end: apps/worker/src/index.ts:1826-1845 recomputes the tier and forwards plan + whole subscription + eventId to QuotaDO, which applies it idempotently and records a history row (apps
      → Fix (1) in apps/worker/src/do/quota.ts by deriving the plan from the stored subscription at read time (see the fix for 'Trial expiration handling') — that single change removes the contradiction inside one /api/me response. Fix (2) in apps/web/src/lib/use-project-socket.ts:394: where setQuota(msg.qu
- [~] Existing-resource behavior after downgrade
      · Two behaviours are implemented, one of them tested. The Stripe customer id is deliberately never cleared by a plan change so a lapsed customer keeps access to invoices and can resubscribe — apps/worker/src/do/quota.ts:151-155 with the reaso
      → Decide the mid-month rule and make it visible. In apps/worker/src/quota-math.ts:62 quotaState, when the monthly allowance is already exceeded by prior spend, return a distinguishable state rather than a bare zero — add `monthlyExceededByDowngrade: boolean` to QuotaState (packages/shared) set when sp
- [~] Clear upgrade prompts at actual limits
      · The limit is named and an action is offered — in prose only, and one of the two actions does not exist. Prose: apps/web/src/components/usage-meter-model.ts:199-205 sets headline 'No Credits left' and nextAction 'Add credits, or upgrade — th
      → Two changes. (1) Build the credit purchase the copy already promises: add STRIPE_PRICE_CREDITS to apps/worker/src/env.ts:45 and a `buildCreditCheckoutRequest` beside buildCheckoutRequest in apps/worker/src/billing.ts:396 using mode=payment with `metadata[credits]` set to the pack size (the exact fie

## 36. USAGE, QUOTAS, AND CREDITS  —  70%   ✓10 ~8 ☐2

- [✓] Per-request usage metering
      · Every model call is metered individually. apps/worker/src/gateway.ts:420 settles that one call against BudgetDO and :421-428 records a `model_call` event carrying inputTokens/outputTokens/neurons/latency plus actorId, projectId and runId; a
- [✓] Per-run usage metering
      · apps/worker/src/do/session.ts:1991 accumulates `agent.neuronsUsed` across every step of a run and :1992-1995 charges the Credit difference as it goes; :2414 broadcasts `msg_end` with the settled `creditsSpent`. The browser shows it: apps/we
- [✓] Per-user usage breakdown
      · A user sees their own: GET /api/me/usage (apps/worker/src/index.ts:2009) proxies QuotaDO /history (apps/worker/src/do/quota.ts:221-226), which groups the Credit ledger by UTC day for the last 30 days, and apps/web/src/routes/usage.tsx:342 r
- [~] Per-project usage breakdown
      · The worker half is built and tested; nothing renders it and it cannot be expressed in Credits. apps/worker/src/analytics.ts:836 includes 'projectId' in BREAKDOWN_DIMENSIONS, :867-903 groups model calls by it (calls, neurons, usd, tokens, p5
      → Two changes. (1) apps/worker/src/do/quota.ts: add a `project text` column to the `ledger` table created at :26-28, accept an optional `projectId` in the `/spend` body at :111-126 and write it on the insert at :121; pass it from apps/worker/src/do/session.ts:3433 (it has `this.boundProjectId`) and fr
- [☐] Per-organization usage breakdown
      · There is no organization to break usage down by. apps/worker/src/analytics.ts:836 BREAKDOWN_DIMENSIONS is exactly ['provider','model','feature','projectId','actorId']; `grep -rn "create table.*organizations" infra/supabase/migrations` retur
      → Only if the tenancy decision is reversed. It is gated on organizations existing at all: add an `organizations` table plus `organization_members` to infra/supabase/migrations, give projects an `organization_id`, then add 'organizationId' to BREAKDOWN_DIMENSIONS in apps/worker/src/analytics.ts:836 and
- [✓] Input and output token accounting
      · apps/worker/src/providers/workers-ai.ts:187 returns {inputTokens, outputTokens, cachedInputTokens, reportedNeurons} per call and providers/types.ts:160 makes it the contract for every adapter; gateway.ts:423-425 puts both counts on the mode
- [~] Non-token tool usage accounting
      · Accounted on the platform ledger, never on the user's Credits. Image generation reserves and settles neurons on the same BudgetDO singleton (apps/worker/src/imagegen.ts:628 reserve, :644 settle), as do speech ASR (speech.ts:594/621), TTS (s
      → Make non-token spend reach QuotaDO through the existing settlement. In apps/worker/src/tools.ts add a `toolNeurons?: number` accumulator field to the tool context interface (beside `uiDetail` at tools.ts:138) and, at tools.ts:2708, do `ctx.toolNeurons = (ctx.toolNeurons ?? 0) + res.neurons` after ge
- [~] Estimated usage before execution
      · A static estimate is shown and a real one gates admission; neither is a per-request estimate for the prompt in hand. The composer's mode picker renders 'Typically {n} Credits' per mode (apps/web/src/components/ws/composer.tsx:248, from MODE
      → Either build the warning or withdraw the claim. To build it: add a POST /api/projects/:id/estimate route in apps/worker/src/index.ts that takes the draft prompt and mode, calls the same estimator the gateway uses (estimateNeuronsForModel via apps/worker/src/pricing.ts) against the composed system pr
- [✓] Actual usage after execution
      · apps/worker/src/gateway.ts:419 takes the actual cost as max(provider-reported neurons, price-table computation) and :420 settles it; apps/worker/src/do/budget.ts:336-353 charges the measured figure rather than the hold, proven by apps/worke
- [✓] Credit balance display
      · Two surfaces, one model. The rail meter is rendered on every signed-in page at apps/web/src/components/layout.tsx:262 (<UsageMeter quota=... />, component at components/usage-meter.tsx:22), and the /usage page — routed at apps/web/src/app.t
- [~] Append-only credit transaction ledger
      · The allowance half is an append-only ledger; the purchased-credit half is a bare number with no transaction rows. apps/worker/src/do/quota.ts:26-28 creates `ledger(id, day, kind, credits, created_at)` and :121 only ever inserts into it (the
      → In apps/worker/src/do/quota.ts: (1) at the /spend handler around :118-122, write a ledger row for the purchased half as well — either a second insert with kind suffixed ':credits' or a new `source text` column on `ledger` set to 'allowance' or 'credits' — so /history and /api/me/usage report total s
- [~] Credit reservation before execution
      · A reservation exists, but it holds the platform's neurons, not the user's Credits. apps/worker/src/do/budget.ts:251-298 is a real hold — /reserve adds to `dayPending`, refuses against the day and month ceilings, and nothing runs without it 
      → Give the Credit ledger the same lifecycle the neuron ledger already has. In apps/worker/src/do/quota.ts add /reserve, /settle and /release beside the existing /spend (:111): /reserve checks affordability with the existing splitSpend (quota-math.ts:88) and stores the held amount under a `holds` map k
- [✓] Reservation settlement after execution
      · apps/worker/src/do/budget.ts:300-375 /settle subtracts the hold from `dayPending`, charges the measured cost to `dayNeurons`, rolls the billable delta into the month and writes the spend row; gateway.ts:420 calls it on the one path past whi
- [✓] Unused reservation release
      · apps/worker/src/do/budget.ts:377-390 /release hands the hold back and refuses an unreadable amount rather than guessing; it is called on every pre-inference failure path — gateway.ts:383 (all attempts failed), :456 (embeddings), :544 (raw p
- [✓] Concurrent request spending protection
      · The ceiling is defended by a globally unique single-threaded Durable Object that holds reservations, which is the stated design at apps/worker/src/do/budget.ts:1-6 ('reservations are serialized. If this object says no, no tokens are spent')
- [✓] Included allowance reset rules
      · The rule is that the allowance is a query against a UTC day key, not a job — apps/worker/src/quota-math.ts:10-15 states it, :20 dayKey, :25 monthKey, :33-39 nextResetIso (including the 'exactly midnight returns the FOLLOWING midnight' case)
- [~] Purchased credit expiration disclosure
      · Disclosed in three places and enforced. Public pricing page: packages/shared/src/index.ts:1512-1516 carries the PLAN_FEATURES row 'Buy extra credits' with the note 'Purchased credits never expire and are spent only after the daily allowance
      · REFUTED: REFUTED on two independent grounds, both about reachability rather than the citations (every repo line number is exact: shared/src/index.ts:1512-1516, pricing.astro:203, usage.tsx:313, usage-meter-model.ts:196, quota.ts:
- [~] Failed-request charging rules
      · The platform-side rule is implemented and tested; the user-facing rule is published and not implemented. Implemented: a call that never reached the model releases its hold (apps/worker/src/gateway.ts:383) and the user is told nothing was ch
      → Either implement the refund or delete the promise. To implement: add a POST /refund handler to apps/worker/src/do/quota.ts beside /spend (:111) that takes {credits, kind, runId}, inserts a NEGATIVE-signed row into `ledger` (so the append-only property survives and /history still sums correctly) and 
- [~] Metering reconciliation
      · Per-call, two independent cost figures are reconciled: apps/worker/src/gateway.ts:419 takes `Math.ceil(Math.max(usage.reportedNeurons ?? 0, computed))` — the provider's own neuron figure versus our price-table computation, never billing les
      → Add a reconciliation report and put the existing script in the gate. (1) In apps/worker/src/index.ts add GET /api/admin/reconciliation that reads BudgetDO /report (do/budget.ts:398) for the last 30 days and, for the same window, sums the stored `model_call` events from fetchStoredEvents (analytics-s
- [☐] Usage and credit transaction export
      · There is a spec for it and no route that runs it, and the table it names has no writer. apps/worker/src/user-export.ts:70-76 declares a `usage_events` export with fields id/owner_id/project_id/kind/credits/input_tokens/output_tokens/model/c
      → Build the export against the ledgers that actually hold the data, not the dead table. Add GET /api/me/export/usage to apps/worker/src/index.ts beside /api/me/usage (:2009): read QuotaDO /history (do/quota.ts:221) for the day totals and add a new /ledger endpoint to apps/worker/src/do/quota.ts that r

## 38. CHECKOUT AND PAYMENT METHODS  —  48%   ✓2 ~15 ☐3

- [~] Plan-specific checkout
      · apps/worker/src/index.ts:1869 POST /api/billing/checkout reads {plan} and rejects anything isPlanId says no to (index.ts:1872). apps/worker/src/billing.ts:366 priceIdFor maps builder->STRIPE_PRICE_BUILDER, studio->STRIPE_PRICE_STUDIO, and r
      · REFUTED: Code and tests check out: /Users/moshe/Desktop/RbxAI/apps/worker/src/index.ts:1869 reads {plan} (the isPlanId 400 is at :1873, not :1872), billing.ts:366 maps builder/studio to env price ids and returns null for free/ent
- [✓] Server-validated checkout pricing
      · The client sends only a plan id — no price, no amount. apps/worker/src/index.ts:1872 400s an unknown plan; the Stripe Price id comes from env via apps/worker/src/billing.ts:366 and is never read from the body; the caller's returnTo is disca
- [~] Currency display before payment
      · apps/worker/src/index.ts:1969 /api/billing/config returns currency from PRICE_CURRENCY (packages/shared/src/index.ts:1340); apps/web/src/routes/usage.tsx:383 passes it into PlanLadder; apps/web/src/components/plans.tsx:171 renders 'All pric
      · REFUTED: The server half is NOT deployed. The live worker is buildSha e66fac3 (88 commits behind HEAD); `git show e66fac3:apps/worker/src/index.ts` shows /api/billing/config returning only {checkout, purchasable} — no currency fi
- [☐] Applicable tax display
      · Searched apps/ and packages/ for automatic_tax, tax_id_collection, customer_update, 'tax' and 'VAT': the only hits are prose (apps/worker/src/index.ts:1865, apps/worker/src/billing.ts:349, apps/worker/src/router.ts:53). buildCheckoutRequest
      → In apps/worker/src/billing.ts buildCheckoutRequest, set automatic_tax[enabled]=true, customer_update[address]=auto (Stripe requires it when automatic tax is on for a reused customer) and tax_id_collection[enabled]=true so business buyers can enter a VAT/GST id. Then state on apps/web/src/components/
- [~] Discount code validation
      · Built but untested, and the code that would explain it points elsewhere. apps/worker/src/billing.ts:435 sets allow_promotion_codes=true, so Stripe's hosted page shows a promotion-code field and validates the code server-side — the capabilit
      → Add to apps/worker/tests/billing-checkout.test.mjs an assertion that params(build(LIVE)).get('allow_promotion_codes') === 'true', and rewrite the misplaced comment at apps/worker/src/billing.ts:433-434 so it describes the flag it sits above. If in-app code entry is wanted instead of Stripe's field, 
- [~] Order summary
      · No in-app summary or confirm step exists: apps/web/src/routes/usage.tsx:400 calls checkout.mutate(plan) on the first click and usage.tsx:253-256 redirects the moment the URL comes back — I found no dialog, no totals, no line-item render any
      → Add a confirmation step in apps/web/src/routes/usage.tsx between the PlanLadder onChoose handler (currently usage.tsx:388-403) and startCheckout: a small dialog naming the plan, formatMoney(PLAN_COPY[plan].priceUsdMonthly, {currency}) per month, the billing term, the Credit allowance it moves to fro
- [~] Payment provider hosted payment entry
      · apps/worker/src/index.ts:1898 POSTs the built body to https://api.stripe.com/v1/checkout/sessions and returns only session.url (index.ts:1912); apps/web/src/routes/usage.tsx:253-256 does window.location.assign(url), with the comment that ca
      · REFUTED: The no-card-handling half is true and I confirmed it: index.ts:1898 POSTs to https://api.stripe.com/v1/checkout/sessions and returns only session.url (index.ts:1913, not :1912); usage.tsx:253-256 does window.location.ass
- [~] Strong customer authentication handling
      · apps/worker/src/billing.ts:143 maps Stripe status 'incomplete' to state 'needs_action' BEFORE the lapse test (so it is not swallowed), grants plan 'free', and sets needsAttention. apps/web/src/lib/billing-copy.ts:134-142 renders 'Your payme
      · REFUTED: In HEAD the code is right and tested: billing.ts:143 maps 'incomplete' to needs_action before the lapse test, billing-copy.ts:134-142 carries "Nothing has been charged and no plan has started yet", needs_action is delibe
- [☐] Checkout expiration handling
      · interpretStripeEvent (apps/worker/src/billing.ts:283-340) switches on customer.subscription.created/updated/deleted and checkout.session.completed only; the default branch at billing.ts:329 returns 'unhandled event type', so checkout.sessio
      → Add a 'checkout.session.expired' case to interpretStripeEvent in apps/worker/src/billing.ts (returning userId from metadata with no subscription and no creditsDelta, so entitlement stays untouched) and raise a notification for it from the webhook handler at apps/worker/src/index.ts:1806-1819 with ki
- [~] Checkout cancellation recovery
      · cancel_url is set at apps/worker/src/billing.ts:419 to ${returnTo}?checkout=cancelled; apps/web/src/routes/usage.tsx:239-247 reads the flag and strips it back out of the URL so a reload or a shared link cannot replay it; usage.tsx:370-374 r
      · REFUTED: cancel_url at billing.ts:419 and the URL-stripping effect at usage.tsx:238-247 are real, and billing-checkout.test.mjs:101 genuinely asserts both return URLs. But a cancellation can only be recovered from if a checkout c
- [~] Successful payment confirmation
      · success_url at apps/worker/src/billing.ts:418; apps/web/src/routes/usage.tsx:360-368 renders 'Thanks — your payment went through. The plan changes when Stripe confirms it…', prints the plan the SERVER currently reports, and offers a 'Check 
      · REFUTED: The copy is honest and the worker-side assertion is strong — billing-checkout.test.mjs:101 checks success_url exactly and that it carries no plan=/grant/upgrade — and usage.tsx:359-368 does print the SERVER's plan with a
- [~] Pending payment status
      · The pending-APPLICATION half is built and tested: apps/web/src/routes/usage.tsx:360-368 tells the user the plan has not moved yet and lets them re-check (apps/web/tests/usage-page-wiring.test.mjs:121), and SCA-pending has its own state at a
      → Add a 'pending' member to BillingState in apps/worker/src/billing.ts:82 and set it in subscriptionView when status is 'incomplete' and the event's latest_invoice payment_intent status is 'processing'; also handle checkout.session.async_payment_succeeded / async_payment_failed in interpretStripeEvent
- [~] Failed payment recovery
      · Three parts, all wired. (1) apps/worker/src/billing.ts:60 keeps past_due entitling so a failed renewal does not cut service. (2) The webhook interprets invoice.payment_failed and notifies the user: apps/worker/src/index.ts:1806-1819 calls i
      · REFUTED: Part 1 is true and tested (ENTITLING_STATUSES keeps past_due at billing.ts:60; billing.test.mjs:86 passes). Part 3 exists in HEAD and billing-status.test.mjs:71 is a real behavioural assertion. Part 2 does not exist in p
- [~] Duplicate checkout protection
      · checkoutGuard (apps/worker/src/billing.ts:182) returns 409 whenever the account's state is active/trialing/cancelling/past_due, and it is enforced in the ROUTE, not only in the browser: apps/worker/src/index.ts:1888. Proven over HTTP at app
      · REFUTED: Refuted on deployment, hard. checkoutGuard does not exist in the deployed worker: `git show e66fac3:apps/worker/src/billing.ts | grep -c checkoutGuard` returns 0, and the deployed /api/billing/checkout body (printed from
- [✓] Payment webhook signature verification
      · apps/worker/src/billing.ts:214-247 implements Stripe's v1 scheme with Web Crypto HMAC-SHA256 over `${t}.${rawBody}` and a constant-time compare (timingSafeEqual, billing.ts:189). The route reads the RAW body with c.req.text() and parses aft
- [~] Payment webhook replay protection
      · Two independent layers. Time: SIGNATURE_TOLERANCE_SECONDS=300 at apps/worker/src/billing.ts:30, enforced at billing.ts:235, tested at apps/worker/tests/billing.test.mjs:59 'a stale signature is refused, so a captured webhook cannot be repla
      · REFUTED: The time layer is real and deployed (SIGNATURE_TOLERANCE_SECONDS at billing.ts:30, enforced at :235, billing.test.mjs:59 passes). The identity layer is not deployed: `git show e66fac3:apps/worker/src/do/quota.ts` contain
- [~] Stored payment method management
      · Delegated to Stripe's Billing Portal, but the path is real and reachable. POST /api/billing/portal (apps/worker/src/index.ts:1916) opens a portal session for the caller's own customer and returns its URL; the user reaches it two ways — the 
      · REFUTED: The route is real (index.ts:1916) and buildPortalRequest is properly tested (billing-checkout.test.mjs:145,:152,:158 all pass), and there is indeed no in-app card list. But no person can reach the portal on the deployed 
- [~] Default payment method selection
      · Nothing in the repo names it. Grepped apps/ and packages/ for default_payment_method, 'default payment', invoice_settings — zero hits; the only payment-method strings are copy at apps/web/src/lib/billing-copy.ts:131 and :149. buildPortalReq
      → Pin the portal configuration instead of inheriting the dashboard default: add STRIPE_PORTAL_CONFIGURATION to apps/worker/src/env.ts beside the other STRIPE_ fields (env.ts:32-46), set p.set('configuration', <id>) in buildPortalRequest at apps/worker/src/billing.ts:449 when it is present, and assert 
- [☐] Expiring payment method notifications
      · Searched the whole webhook path. apps/worker/src/dunning.ts:25-32 EVENT_TO_KIND handles exactly three events (invoice.payment_failed, invoice.payment_action_required, invoice.payment_succeeded); customer.source.expiring and payment_method.a
      → Add a fourth DunningKind 'card_expiring' to apps/worker/src/dunning.ts, mapped from 'customer.source.expiring' and 'payment_method.automatically_updated', with copy saying the card on file expires this month and the billing portal is where to replace it; raise it as a 'billing_issue' notification fr
- [~] Secure customer billing portal access
      · POST /api/billing/portal (apps/worker/src/index.ts:1916) accepts no customer parameter at all: the customer id is read from the caller's own QuotaDO, addressed by idFromName(user.userId) where userId is the verified JWT subject (index.ts:19
      · REFUTED: The security property itself is correct and I confirmed it in both trees: the route takes no customer parameter, reads customerId from the caller's own QuotaDO addressed by idFromName(user.userId) from the verified JWT s

## 39. INVOICES AND BILLING RECORDS  —  68%   ✓13 ~1 ☐6

- [✓] Invoice list
      · No invoice data of our own anywhere: the only two Stripe API calls in the repo are apps/worker/src/index.ts:1898 (checkout/sessions) and apps/worker/src/index.ts:1927 (billing_portal/sessions) — nothing calls /v1/invoices. The user's only p
      · VERIFIED 2026-09-15 — the `·` above predates the invoices branch and is stale. GET /api/billing/invoices (apps/worker/src/index.ts:2390) reads the caller's customerId from QuotaDO and pages Stripe /v1/invoices?customer=…&limit=24; mapInvoiceList (apps/worker/src/billing.ts) maps to a nine-field allowlist, never a spread; InvoiceList renders the rows (apps/web/src/routes/usage.tsx). Proof: apps/worker/tests/billing-invoices.test.mjs and apps/web/tests/invoices.test.mjs, both green.
- [✓] Invoice detail view
      · Same single delegation as the list: apps/web/src/routes/usage.tsx:419 opens Stripe's portal, where an invoice can be opened. Nothing in the repo models an invoice — grep for 'invoice' across apps/ and packages/ returns only apps/worker/src/
      · VERIFIED 2026-09-15 — stale. GET /api/billing/invoices/:id (apps/worker/src/index.ts:2425) shape-checks the id with isInvoiceId BEFORE it reaches a Stripe URL, then refuses with 404 unless invoiceBelongsTo() matches the caller's own customerId — the id in the path is never the authorisation. mapInvoiceDetail returns line items, subtotal, tax and total; InvoiceRow expands them in apps/web/src/routes/usage.tsx. Proof: apps/worker/tests/billing-invoices.test.mjs, apps/web/tests/invoices.test.mjs.
- [✓] Invoice PDF download
      · Reachable only inside Stripe's hosted portal (apps/web/src/routes/usage.tsx:419 -> apps/worker/src/index.ts:1916). The repo never reads Stripe's `invoice_pdf` / `hosted_invoice_url` fields: grep for 'pdf' across apps/worker/src and apps/web
      · VERIFIED 2026-09-15 — stale. mapInvoice carries Stripe's invoice_pdf through as pdfUrl, guarded by stripeLink() which admits only https URLs on a stripe.com host, so `javascript:` is unrenderable by construction; usage.tsx renders it as a plain <a href={invoice.pdfUrl}>PDF</a> per row and as no link at all for a draft, rather than a dead one. Not proxied through the worker, exactly as the → asked. Proof: apps/worker/tests/billing-invoices.test.mjs, apps/web/tests/invoices.test.mjs.
- [✓] Invoice payment status
      · The failure half is built and wired: apps/worker/src/dunning.ts:25-31 maps invoice.payment_failed / payment_action_required / payment_succeeded, apps/worker/src/index.ts:1805-1818 raises a mandatory 'billing_issue' notification deduped on t
      · VERIFIED 2026-09-15 — both halves of the → are built. (1) apps/worker/tests/dunning.test.mjs exists (46 tests, green) and asserts exactly what was asked: the subscription_details.metadata fallback finds the userId, a first-attempt invoice.payment_succeeded returns null, and a forged type cannot reach a kind through the prototype chain. (2) The paid half is rendered: invoiceStatusPill (apps/web/src/lib/billing-copy.ts) turns Stripe's word into Paid/Due/Draft/Unpaid/Voided and usage.tsx shows it per row; an unknown status falls back rather than being asserted.
- [✓] Billing recipient management
      · Searched apps/web/src/routes/settings.tsx (no billing section at all — the only email control is the account address change at settings.tsx:391-441), apps/worker/src/preferences.ts (PREF keys at preferences.ts:45-46 are notify_delivery and 
      · BUILT 2026-09-15 — as a billing record, NOT a preference. The → said apps/worker/src/preferences.ts, and that is the wrong home: those rows are agent-facing memory with org/project layering and export, and a billing contact is per-account and is not context for a model. Stored instead on QuotaDO (`/billing-details`, apps/worker/src/do/quota.ts) beside the Stripe customer id; PUT /api/billing/details (apps/worker/src/index.ts:2336) validates via readBillingDetails and writes `email` to the Stripe customer; the checkout passes it as customer_email so it applies to the FIRST invoice, not from the second on. Proof: apps/worker/tests/billing-details.test.mjs, billing-details-store.test.mjs, billing-routes-live.test.mjs.
- [✓] Billing address management
      · Repo-wide grep for 'billing address', 'billing_address', 'postal', 'address_collection' across apps/worker/src, apps/web/src, apps/site/src and packages returns nothing. apps/worker/src/billing.ts:414-435 builds the Checkout Session with mo
      · VERIFIED 2026-09-15 — stale; done exactly as the → specified. buildCheckoutRequest sets `billing_address_collection=required` (apps/worker/src/billing.ts), with the comment recording why editing afterwards belongs to the portal rather than to a second address form here that would drift from the one Stripe prints. Proof: apps/worker/tests/billing-checkout.test.mjs, test "THE CHECKOUT COLLECTS A BILLING ADDRESS, because an invoice without one is not a document".
- [✓] Business name management
      · No 'business name', 'company', 'legal name' or 'organisation name' field exists: searched apps/web/src/routes/settings.tsx (profile fields are display_name only, read at settings.tsx:61), apps/worker/src/preferences.ts (key allowlist), infr
      · BUILT 2026-09-15 — and THE → LINE IS WRONG. It asked for `customer_update[name]=auto`; Stripe accepts customer_update only alongside `customer`, and this session names the buyer by customer_email, so that parameter would make Stripe refuse every checkout — the feature would read as enabled while no checkout opened at all. apps/worker/tests/billing-checkout.test.mjs already asserts customer_update is never sent in any form. Built the way that works instead: a Business name on the billing page, written to the Stripe customer's `name` by PUT /api/billing/details, which also fixes it for customers who already bought. Proof: apps/worker/tests/billing-details.test.mjs, billing-routes-live.test.mjs.
- [✓] Tax identification fields
      · Searched for 'tax', 'vat', 'tax_id', 'automatic_tax' across apps/worker/src, apps/web/src and apps/site/src: every 'tax' hit is 'taxonomy' or 'syntax' (e.g. apps/worker/src/asset-import.ts:389, apps/worker/src/luau-review.ts:68). apps/worke
      · VERIFIED 2026-09-15 — stale; both parameters the → named are set in buildCheckoutRequest (apps/worker/src/billing.ts): `automatic_tax[enabled]=true` and `tax_id_collection[enabled]=true`, with the comment recording that this REQUIRES Stripe Tax to be active on the account and fails loudly at the first checkout otherwise, rather than quietly selling untaxed. Proof: apps/worker/tests/billing-checkout.test.mjs, test "THE CHECKOUT ASKS STRIPE TO CALCULATE TAX, and lets a business enter its VAT id".
- [✓] Purchase order reference support
      · Grep for 'purchase order', 'po_number', 'PO number' across the whole repo (apps/, packages/, infra/, docs/) returns nothing. The checkout body built at apps/worker/src/billing.ts:414-435 carries no custom fields, and apps/worker/src/do/quot
      · BUILT 2026-09-15 — and NOT as the → described. A Checkout `custom_fields[0]` is collected onto the SESSION and never reaches the invoice, so a PO gathered that way is invisible on the document it exists to be matched against. Built as the Stripe customer's `invoice_settings[custom_fields][0]` (label "Purchase order"), which Stripe prints on every invoice thereafter, editable on the billing page. Removing it clears the whole custom-fields LIST rather than emptying one row, because a custom field with an empty value still prints its label. Proof: apps/worker/tests/billing-details.test.mjs, billing-routes-live.test.mjs.
- [☐] Invoice delivery preferences
      · The notification preference machinery exists and is the obvious home for this, but has no billing-document kind: NOTIFICATION_KINDS at apps/worker/src/notifications.ts:46-56 is run_complete, run_failed, automation_failed, approval_requested
      → Decide the delivery channel first: this product has an in-app inbox (apps/worker/src/notification-store.ts) and no outbound email of its own, so 'delivery preferences' can only mean Stripe's invoice emails. Either (a) document in apps/site/src/pages/docs/credits-and-limits.astro that invoice emails 
- [☐] Receipt delivery
      · No receipt is ever sent or shown. Grep for 'receipt' in apps/worker/src and apps/web/src finds only the Roblox developer-product prefab (apps/worker/src/prefabs.ts:392 RECEIPTS_SOURCE — Luau the agent writes into a game, unrelated to our bi
      → Build the credits checkout the webhook is already waiting for: add a `buildCreditsCheckoutRequest` to apps/worker/src/billing.ts that sets mode=payment, the credit-pack price, `metadata[userId]`, `metadata[credits]` and `payment_intent_data[receipt_email]`, expose it as `POST /api/billing/credits` i
- [☐] Credit note records
      · BLOCKED, and the → cannot be followed as written (checked 2026-09-15): a credit_note event object carries `invoice`, `customer`, `amount` and its own `metadata`, and NOT metadata.userId — we only ever set that on the SUBSCRIPTION. So interpretStripeEvent has nobody to attribute the outcome to, and the row could not be written to any account's QuotaDO. Unlike the invoice events dunning.ts mines through subscription_details.metadata, there is no such field here. This needs a Stripe customer→user reverse index, which does not exist in the repo (stripeCustomerId is stored per user in QuotaDO with no reverse lookup) and whose write path is the entitlement webhook. Build the index first, as its own item.
      · The existing [~] mark points at apps/worker/src/asset-library.ts, which is a false positive — 'credit' there is asset attribution (licence credit), see the licence-verbatim comment at asset-library.ts:16 and the attribution artefact returne
      → Add 'credit_note.created' and 'credit_note.voided' to a new branch of interpretStripeEvent in apps/worker/src/billing.ts returning a {kind:'credit_note', amount, currency, invoiceId} outcome, have apps/worker/src/index.ts:1846 write it to QuotaDO's billing_events table (apps/worker/src/do/quota.ts:3
- [☐] Refund request tracking
      · No refund path exists in either direction. Grep for 'refund' in apps/worker/src returns only credit-reservation refunds inside the inference budget (apps/worker/src/pricing.ts:62, apps/worker/src/imagegen.ts:150, apps/worker/tests/speech.te
      → Smallest honest version: add a 'Request a refund' row to the billing card in apps/web/src/routes/usage.tsx that POSTs {invoiceId, reason} to a new `/api/billing/refund-request` in apps/worker/src/index.ts, which writes a row to QuotaDO billing_events with kind='refund_requested' (widen the kind colu
- [☐] Refund status visibility
      · BLOCKED for the same reason as Credit note records (checked 2026-09-15): a charge.refunded event carries `customer` and the charge's own metadata, and a subscription invoice's charge does not inherit subscription metadata — so metadata.userId is absent and the refund cannot be attributed to an account. The billingChangeLine half of the → is straightforward once attribution exists; the event half is not. Downstream of a Stripe customer→user reverse index.
      · Nothing tells a user what happened to a refund. 'charge.refunded' and 'charge.refund.updated' are absent from the handled event list (apps/worker/src/billing.ts:295-331, default branch returns `unhandled event type`) and from apps/worker/sr
      → Handle 'charge.refunded' in interpretStripeEvent (apps/worker/src/billing.ts) and record it in QuotaDO billing_events alongside the refund_requested row, then add a `case 'refund'` to billingChangeLine in apps/web/src/lib/billing-copy.ts:188 producing 'Refund of <amount> issued on <date>.' and cover
- [~] Billing adjustment history
      · A complete vertical slice. Store: the billing_events table created at apps/worker/src/do/quota.ts:30 and written by `record()` at quota.ts:82, called on every plan change and every credit grant (quota.ts:207). Read: `https://do/billing` ret
      · REFUTED: Every file:line in the evidence checks out, the tests pass, and the slice is genuinely deployed — I verified all of it — but it is a plan-change log, not an adjustment history, so the item does not survive. WHAT IS TRUE 
- [☐] Seat charge breakdown
      · Deliberately descoped, not overlooked. docs/design/TENANCY.md records the decision (option 3, 'the product stays single-user with per-project sharing'), and the checklist line itself is marked [✗] not planned dated 2026-09-15. Consistent wi
      → No action while the single-user decision in docs/design/TENANCY.md stands. If seats are ever built, this item is downstream of the whole tenancy hierarchy (organizations, membership, per-seat price ids) and must not be started before it — a seat breakdown over a product with no seats would be a fabr
- [✓] Usage charge breakdown
      · Usage is broken down by DAY and nothing else. QuotaDO's ledger stores a `kind` per spend (insert at apps/worker/src/do/quota.ts:121) but the history query throws it away — `select day, sum(credits), count(*) ... group by day` at quota.ts:22
      · VERIFIED 2026-09-15 — stale; built, and better than the → asked. Rather than replacing the daily totals with one row per (day, kind) — which would have made every bar report the last kind of that day as if it were the whole day — QuotaDO /history (apps/worker/src/do/quota.ts) runs a SECOND grouped query and hangs a `kinds` breakdown off each day row, so the parts always sum to the whole they are shown under. Rendered as a share bar per kind under the 30-day chart (spend-kinds, apps/web/src/routes/usage.tsx). Proof: apps/web/tests/usage-meter.test.mjs (spendByKind, usageKindLabel) and usage-page-wiring.test.mjs.
- [✓] Billing period comparison
      · Nothing anywhere holds a previous period's figure. apps/worker/src/quota-math.ts exposes dayKey/monthKey only (quota-math.ts:19) and quotaState computes spentToday/spentThisMonth for the CURRENT period (apps/worker/src/do/quota.ts:92-102). 
      · VERIFIED 2026-09-15 — stale. QuotaDO /history returns `thisMonth` and `previousMonth` from the month_totals rollup, and REFUSES the comparison (null, and the sentence simply not rendered) whenever monthTotalComplete says the rollup was not already running when that month began — a partial month presented as a month is a fabricated comparison. periodComparisonLine turns it into one sentence in apps/web/src/routes/usage.tsx. Proof: apps/web/tests/usage-meter.test.mjs:340-364, which asserts null for an absent, unreadable or unmeasured previous month and a real line for a measured one.
- [✓] Billing record export
      · There is no export of billing records in any format. The export machinery that exists is for other things: apps/worker/src/export.ts renders conversation transcripts, and the only export routes are /api/memory/:scope/:scopeId/export (apps/w
      · VERIFIED 2026-09-15 — stale; done exactly as the → specified. billingHistoryCsv (apps/web/src/lib/billing-copy.ts) formats the already-fetched rows client-side and the "Download billing history (CSV)" button in usage.tsx hands them over as a Blob — no new worker route, so nothing can ask the server for somebody else's history. RFC 4180 quoting, ISO dates rather than the viewer's locale, and a leading apostrophe on any value beginning = + - @ tab or CR so a Stripe event id cannot execute as a spreadsheet formula. Proof: apps/web/tests/billing-status.test.mjs:275-310.
- [✓] Payment provider reconciliation reports
      · Nothing reconciles our record of a subscription against Stripe's. The worker only ever POSTs two Stripe endpoints (apps/worker/src/index.ts:1898 checkout/sessions, :1927 billing_portal/sessions) — there is no read of /v1/invoices, /v1/charg
      · BUILT 2026-09-15. GET /api/admin/billing-reconcile (apps/worker/src/index.ts:2961, owner-key gated by the existing /api/admin/* middleware) pages Stripe /v1/subscriptions?status=all and, for each one naming a userId, compares it against that account's stored subscription. reconcileSubscription (apps/worker/src/billing.ts) reads the tier through planOfStripeSubscription — the SAME function interpretStripeEvent uses, extracted for this, so the report cannot agree with the drift it exists to find. Four verdicts: unattributed (somebody is paying and no account can ever be entitled), missing_here, plan_differs, status_differs. It reads and compares only; nothing is repaired automatically. The report carries `checked` and `truncated` set from the branch that decided to stop, so "no findings" over zero subscriptions is not readable as a clean account, and a failure to page Stripe is a 502 rather than an all-clear. Proof: apps/worker/tests/billing-reconcile.test.mjs and the reconciliation tests in apps/worker/tests/billing-routes-live.test.mjs.

## 40. LOCALIZATION AND RIGHT-TO-LEFT SUPPORT  —  60%   ✓10 ~4 ☐6

- [☐] Centralized translation catalog
      · No catalog exists anywhere. `find apps packages -type d -name i18n|locales|lang|translations|messages` returns nothing outside vendored data (packages/corpus/raw, packages/training/.venv). No i18n dependency in apps/web/package.json or apps
      → Create apps/web/src/lib/i18n/catalog.ts exporting a frozen MESSAGES map keyed by locale and a `t(key, vars?)` that reads the active UI locale, plus apps/web/src/lib/i18n/en.ts holding every literal currently inline under apps/web/src/routes/ and apps/web/src/components/. Add apps/web/tests/i18n-cata
- [☐] Stable translation keys
      · There is no key namespace because there is no catalog (see above). Grep for msgid|defineMessages|t('|translationKey across apps/web/src and apps/site/src returns nothing. The nearest thing in the tree is apps/web/src/lib/settings-search.ts:
      → In the catalog created for the previous item, declare keys as an `as const` object with a derived `MessageKey` union so a rename is a typecheck failure, and commit a snapshot of the key set with a test in apps/web/tests/ that fails when a key disappears or changes meaning without a version bump.
- [✓] Complete English interface
      · The whole product is written in English and is reachable: apps/web/src/routes/ (dashboard, workspace, settings, usage, admin, roadmap, auth-pages) plus the 18 Astro pages in apps/site/src/pages. apps/web/src/lib/direction.ts:46 declares UI_
- [☐] Complete Hebrew interface
      · Zero Hebrew interface strings. Grepping apps/web/src and apps/web/tests for Hebrew characters returns exactly three hits, all of them prose in comments about bidi (apps/web/tests/bidi-content.test.mjs:14, apps/web/tests/relative-time.test.m
      → Create apps/web/src/lib/i18n/he.ts translating every key in the English catalog, then add 'he' to UI_LANGUAGES at apps/web/src/lib/direction.ts:46. apps/web/tests/direction.test.mjs already contains the test 'the mirroring turns on the day the interface is translated', which proves the direction and
- [✓] Supported locale selection
      · A 13-locale allowlist with a real control and real consequences: REGIONS at apps/web/src/lib/prefs.ts:50 (system, en-US, en-GB, en-AU, de-DE, fr-FR, es-ES, pt-BR, ru-RU, ja-JP, ko-KR, zh-CN, he-IL), rendered as a select at apps/web/src/rout
- [✓] Locale fallback rules
      · A resolution chain exists at every layer and is tested. apps/web/src/lib/prefs.ts:314 resolveLocale returns undefined (= the browser's own) for 'system' or any tag outside the allowlist; :319 resolveTimeZone does the same for an unknown IAN
- [✓] Browser language detection
      · apps/web/src/lib/direction.ts:78 detectDirection and :89 detectLanguage read navigator.languages; both are called via resolveDirection/applyDirection from initDirection (direction.ts:134), which apps/web/src/main.tsx:10 invokes before creat
- [~] User language override
      · The CONTENT half is fully wired; the INTERFACE half is built and dead. Content: apps/web/src/components/ws/instructions-panel.tsx:246-260 renders an 'Answer me in' select over 10 languages, writing through savePreferences (apps/web/src/lib/
      → apps/web/src/routes/settings.tsx has no interface-language/direction control. Add a Row id='interface-language' inside the existing 'Language and region' Section (line 546) whose select writes a new `uiLanguage` field added to Prefs in apps/web/src/lib/prefs.ts and then calls setDirection() from app
- [~] Organization default language
      · The layering mechanism exists and is tested; the tenant it would belong to does not. apps/worker/src/preferences.ts:339-348 mergePreferences layers org -> user -> project and reports which layer won, and apps/worker/tests/preferences.test.m
      → Do not build: organizations are descoped per docs/design/TENANCY.md. If that decision is ever reversed, the preference layer in apps/worker/src/preferences.ts:339 already merges an org-scoped `language` correctly and is tested — the only missing piece is an organization row to hang the scope id on p
- [~] Full right-to-left layout support
      · The stylesheet half is genuinely complete and proven; the reachability and the non-CSS surfaces are not. Proven: apps/web/tests/rtl-workspace.test.mjs passes 4 tests over styles.css, styles/workspace.css and components/roadmap/roadmap.css —
      → Three changes. (a) Wire the control described under 'User language override' so setDirection at apps/web/src/lib/direction.ts:124 actually has a caller. (b) Convert the inline physical styles: marginLeft:'auto' -> marginInlineStart:'auto' at apps/web/src/components/layout.tsx:104, apps/web/src/compo
- [✓] Bidirectional text handling
      · User-written strings carry dir="auto" on every surface that renders them: apps/web/src/components/ws/turn.tsx:154 (the user's message) and :198 (the reply), apps/web/src/routes/dashboard.tsx:545 (project card name), apps/web/src/components/
- [✓] Left-to-right code presentation
      · apps/web/src/styles.css:4707-4714 declares `pre, code, kbd, samp { direction: ltr; unicode-bidi: isolate; text-align: start; }` — on the elements rather than on class names, so an unclassed <pre> is covered. apps/web/tests/bidi-content.test
- [✓] Locale-aware date formatting
      · apps/web/src/lib/format.ts:59 dateFormat builds Intl.DateTimeFormat from the user's resolved locale and time zone; :124 relativeTime and :150 shortRelative use Intl.RelativeTimeFormat with numeric:'auto' (so 'yesterday'/'אתמול' comes from I
- [✓] Locale-aware number formatting
      · apps/web/src/lib/format.ts:119 formatNumber routes every printed number through Intl.NumberFormat with the resolved locale (numberFormat at :67 wrapped in try/catch); :221 formatBytes and :103 unitAmount build on it. Proven to change output
- [✓] Locale-aware currency formatting
      · packages/shared/src/index.ts:1356 formatMoney with PRICE_CURRENCY at :1340, consumed by apps/web/src/components/plans.tsx:88 (and the standing 'All prices in {currency}' line at :171) and by the marketing pricing/landing pages (apps/site/sr
- [✓] Timezone-aware timestamps
      · Client: apps/web/src/lib/prefs.ts:114 stores an IANA zone validated at :149, resolved at :319, selected at apps/web/src/routes/settings.tsx:581-598 with a 'Match my device' default; apps/web/src/lib/format.ts:59 passes it to every date form
- [☐] Translated transactional emails
      · There is no transactional email at all in this tree, so there is nothing translated or untranslated. apps/worker/src/notifications.ts:32 records that NOTIFICATION_CHANNELS has one entry and the normaliser REFUSES 'email' and 'push', and :14
      → Nothing to translate until mail exists. Two paths: (a) commit the Supabase auth email templates under infra/supabase/ as versioned files with an English and a Hebrew variant, selected from the user's stored language; (b) if worker-sent mail is ever added, put subjects and bodies in the i18n catalog 
- [☐] Translated validation messages
      · Every validation and error string reaching a user is an English literal with no locale parameter. Client: apps/web/src/lib/auth-flows.ts:98 'Wrong email or password. Try again.' and :100 'Confirm your email first — check your inbox for the 
      → Route user-facing failures through the catalog once it exists: change apps/web/src/lib/error-taxonomy.ts so Explained carries message KEYS (title/safety/next) that the render site resolves with t(), and do the same for the strings in apps/web/src/lib/auth-flows.ts:85-110. Leave the worker's 400-leve
- [☐] Translation completeness checks
      · There are no catalogs, so there is nothing to check, and no checker exists. The existing [~] mark cites apps/worker/src/public-api.ts — that is a keyword false positive: the word 'translation' there means OpenAI-compatible request/response 
      → After catalogs exist, add scripts/check-translations.mjs modelled on scripts/check-copy.mjs that exits non-zero when a key in apps/web/src/lib/i18n/en.ts is absent from another locale file, when a locale file holds a key English does not, or when a translated string drops an interpolation placeholde
- [~] Long-text and mixed-language layout testing
      · Long-text has one real, hard-won test; mixed-language has none. Long-text: apps/web/tests/topbar-layout.test.mjs:43-51 pins `flex: none` on .gx-pill and overflow:hidden/text-overflow:ellipsis on the label, both found by rendering the worksp
      → Add tests/e2e/bidi-layout.spec.ts (Playwright, so it actually renders — apps/web mounts nothing in node --test) that loads the dashboard and workspace with document.dir forced to 'rtl' and again to 'ltr', and for each asserts no horizontal document overflow and correct punctuation placement on three

## 44. PUBLIC API  —  68%   ✓9 ~9 ☐2

- [~] Documented API resource model
      · Served and tested, but it documents paths only, not resources. apps/worker/src/public-api.ts:823 openApiDocument() builds OpenAPI 3.1 from PUBLIC_ROUTES; served at apps/worker/src/index.ts:3101 and proven live in apps/worker/tests/public-ap
      → In apps/worker/src/public-api.ts add a `components.schemas` block to openApiDocument() defining Project, Message, Run, ChatCompletionRequest/Response and the Error envelope (errorBody at public-api.ts:687 is the shape), and extend openApiOperation() (public-api.ts:790) to reference them in each resp
- [☐] Organization-scoped API credentials
      · Deliberately out of scope, not an oversight. api_keys rows are keyed on user_id only (apps/worker/src/api-keys.ts:407 schema; ApiKeyRecord at api-keys.ts:84 has userId and projects, no org). docs/design/TENANCY.md records the owner's decisi
      → No work. Out of scope per docs/design/TENANCY.md — leave it marked not planned rather than not started.
- [~] Project-scoped API credentials
      · Server half complete and tested; nobody can create one from the product. Grants are proven under RLS once at mint (apps/worker/src/index.ts:2856, getOwnedProject per id, frozen into the row) and enforced as set membership at call time (apps
      → Create apps/web/src/components/api-keys-panel.tsx and mount it in a new 'Developer' section of apps/web/src/routes/settings.tsx: list from GET /api/keys, and a create form (name, mode live/test, scope checkboxes from API_SCOPES, a checkbox list of the user's projects, optional expiry) that POSTs to 
- [✓] Scoped API permissions
      · Every route declares the scope it demands in one table (apps/worker/src/public-api.ts:85-107 PUBLIC_ROUTES, with `scope: null` spelled explicitly for discovery routes), the middleware enforces it before the handler runs (apps/worker/src/ind
- [~] API credential expiration
      · Enforced, but unreachable without curl. `expiresAt` is a column (apps/worker/src/api-keys.ts:407), set at mint from a strictly validated expiresInDays (apps/worker/src/index.ts:2878-2886 — a string, NaN, 0, 366 and 1.5 are all refused, each
      → Add an expiry control to the API-keys panel described under 'Project-scoped API credentials' (a select: 30/90/365 days or never, sent as expiresInDays) and render `expires_at` from publicKeyShape (apps/worker/src/api-keys.ts:532) on each listed key. Separately, in apps/worker/src/index.ts add a cron
- [~] API credential rotation
      · The planner is fully tested; the route that uses it is not, and no UI calls it. planRotation (apps/worker/src/api-keys.ts:321) has a dedicated suite covering inherit-exactly, never-resurrect and never-extend plus corrupt clocks — apps/worke
      → Add a rotate case to apps/worker/tests/public-api.test.mjs alongside the mint test at line 1227: mint a key with expiresInDays, POST /api/keys/{id}/rotate with graceHours, then assert (a) the new key works on the granted project, (b) the old key still works before retireAt and is refused with expire
- [~] API credential revocation
      · The server path is complete and proven end to end; there is no button. revokeApiKey scopes the UPDATE by owner in one statement (apps/worker/src/api-keys.ts:508), DELETE /api/keys/:id is wired with a securityNotice (apps/worker/src/index.ts
      → Add a 'Revoke' action per key in the settings API-keys panel (see 'Project-scoped API credentials') that DELETEs /api/keys/{id} behind a confirm dialog, then refetches the list and shows the key greyed with its revoked_at date from publicKeyShape (apps/worker/src/api-keys.ts:534).
- [✓] Versioned endpoints
      · Two-axis versioning, implemented and enforced: the /v1 prefix is the compatibility promise and a dated `Golem-Version` header is the change ledger (apps/worker/src/public-api.ts:30 API_VERSIONS, :44 resolveApiVersion). The middleware resolv
- [✓] Consistent error responses
      · One envelope for the whole surface: errorBody (apps/worker/src/public-api.ts:687) emits `{error:{message,type,code,param}, request_id}` with the type derived from the status by errorTypeFor (public-api.ts:676), and it is what every /v1 refu
- [~] Pagination
      · Wired but the cursor it hands back cannot be fed back in, and no test exercises it. GET /v1/projects/:id/messages forwards `before` and `limit` with a 100 clamp (apps/worker/src/index.ts:3321-3331) to the session's keyset query (apps/worker
      → In apps/worker/src/index.ts:3321 return pagination metadata: add `has_more` (ask the session for limit+1 rows and trim) and `next_before` as the epoch-ms created_at of the oldest returned row, and reject a malformed `limit`/`before` with errorBody 400 param 'limit'/'before' instead of silently defau
- [☐] Filtering
      · No /v1 route accepts a filter of any kind. The only query parameters the public surface reads are `before`, `limit` (messages) and `poll_ms` (events) — grep for c.req.query and searchParams across the whole /v1 block, apps/worker/src/index.
      → Add filters to GET /v1/projects/:id/messages in apps/worker/src/index.ts:3321 — `role` (one of user, assistant) and `since` (epoch ms) — validated with errorBody 400 naming the param, forwarded to the session, and applied in the SQL at apps/worker/src/do/session.ts:958 as extra WHERE clauses. Declar
- [~] Stable sorting
      · A deterministic ORDER BY exists but has no tiebreaker and nothing tests it. The transcript is ordered at apps/worker/src/do/session.ts:958 (`order by created_at desc limit ?`, reversed to newest-last at session.ts:960) and the public route 
      → Change the query at apps/worker/src/do/session.ts:958 to `order by created_at desc, id desc` and make the cursor composite (accept the last id alongside `before` and compare `(created_at, id) < (?, ?)`), so equal timestamps page deterministically. Add a test in apps/worker/tests that inserts three m
- [✓] Request validation
      · The completion body is validated field by field before anything runs: parseChatCompletionRequest (apps/worker/src/public-api.ts:255) refuses non-object bodies, unknown models by name, empty/oversized message arrays (200 messages, 60k chars)
- [~] Idempotency support
      · Implemented for completions, DECLARED BUT NOT IMPLEMENTED for the one route that starts billable work. The route table marks three routes idempotent (apps/worker/src/public-api.ts:87, :93, :103) but that flag is read by nobody — grep for 'i
      → In apps/worker/src/index.ts:3337, before the stub.fetch('/agent-run'), apply the same block handleCompletion uses at index.ts:3156-3181: validate with idempotencyKeyValid, fingerprint `${method} ${path}\n${bodyText}` with keyHash, consult idemLoad/idempotencyVerdict (replay -> return the stored 202 
- [✓] Rate-limit headers
      · rateLimitHeaders (apps/worker/src/public-api.ts:612) emits X-RateLimit-Limit/-Remaining/-Reset always and Retry-After only on refusal, and the response middleware attaches them to successes as well as 429s (apps/worker/src/index.ts:3036-303
- [✓] Usage response metadata
      · Both in the body and on the headers. The OpenAI usage block is built from the gateway's counts (apps/worker/src/public-api.ts:413 usageBlock, used by chatCompletionBody :417 and legacyCompletionBody :430) and X-Golem-Usage-Input-Tokens/-Out
- [✓] Request correlation identifiers
      · Every /v1 response carries X-Request-Id, and the same id is carried inward to the Durable Objects. The middleware adopts a caller's id only if it matches a character allowlist — otherwise it mints one, which closes the header-injection and 
- [✓] Streaming response support
      · Two real streams. Completions: `stream: true` produces an OpenAI chunk sequence (role frame, content delta, terminating frame with finish_reason, optional usage frame) from chatCompletionChunks (apps/worker/src/public-api.ts:454), framed by
- [~] Backward compatibility policy
      · The machinery that would enforce a policy is built and tested; the policy itself is published nowhere. Implemented: a dated version list with an unknown value refused rather than upgraded (apps/worker/src/public-api.ts:30-49, tested at apps
      → Publish the policy the code already implements: add a `compatibility` object to discoveryDocument (apps/worker/src/public-api.ts:768) stating what may change without a new dated version (new fields, new enum members, new routes), what may not (removing or retyping a field, narrowing an enum), and th
- [✓] API deprecation notices
      · RFC 8594 signalling on the response of the exact call that will break, not just a changelog line. Deprecation metadata lives on the route entry (apps/worker/src/public-api.ts:75 and :91-97 for /v1/completions, sunset 2027-09-15 with a named

## 41. ACCESSIBILITY  —  65%   ✓6 ~14 ☐0

- [~] Keyboard access to every primary workflow
      · Broad and real: apps/web/src/lib/shortcuts.ts:30 is a single chord map guarded by apps/web/tests/shortcuts.test.mjs (18 tests, incl. 'no two shortcuts claim the same chord'); the command palette is operable mouse-free and tested at apps/web
      → In apps/web/src/components/asset-source-dialog.tsx, wrap the dialog in the shared accessible primitive instead of hand-rolling it: import { Modal } from './modal' and render the choices as its children (Modal at apps/web/src/components/modal.tsx already does role/aria-modal/aria-label, focus-in, two
- [✓] Visible keyboard focus
      · App-wide rule at apps/web/src/styles.css:282 (bare :focus-visible) plus a workspace-scoped one at apps/web/src/styles/workspace.css:2498 ('.gx :focus-visible { outline: 2px solid var(--gx-amber); outline-offset: 2px }'), and the site's at a
- [~] Logical focus order
      · The structural preconditions hold and were checked: grep for tabIndex across apps/web/src returns only tabIndex={-1} (modal.tsx:70, primitives.tsx:129/136, onboarding-tour.tsx:169, milestone-card.tsx:69) — no positive tabindex anywhere — an
      → Add tests/e2e/app-focus-order.spec.ts (a new Playwright spec beside tests/e2e/landing.spec.ts) that loads the signed-in shell in MOCK_MODE, presses Tab ~15 times from document.body and records document.activeElement's getBoundingClientRect() at each stop, then asserts the sequence is non-decreasing 
- [~] Skip navigation links
      · Marketing site: DONE and proven. apps/site/src/layouts/Base.astro:81 and apps/site/src/pages/index.astro:209 each emit <a href="#main" class="skip-link">Skip to content</a>; I scanned every built page and all 18 of apps/site/dist/**/*.html 
      → In apps/web/src/components/layout.tsx:350 change className="gx-sr" to className="skip-link" so the link uses the reveal-on-focus rule that already exists at apps/web/src/styles.css:435-450 (verify --accent/--accent-ink and --r-sm resolve inside the .gx shell; if they do not, move the rule into apps/
- [~] Accessible page landmarks
      · Marketing site: enforced in CI. scripts/check-site-semantics.mjs:141-154 requires exactly one <main> per page and at most one page-level <footer> (correctly ignoring <footer> nested in article/section/aside/nav) and flags h1-h3 left outside
      → In apps/web/src/components/layout.tsx:161, nest the conversation list inside the aside as <nav aria-label="Conversations"> (keep the <aside> as the rail container, or change the element to <nav> outright and drop the aside) so the app exposes a navigation landmark. Then generalise scripts/check-site
- [~] Correct semantic headings
      · Marketing site: enforced in CI over all 18 built pages by scripts/check-site-semantics.mjs — exactly one <h1> (:96), no empty heading (:99), no level skip h(n)->h(n+2) (:102-106), and a heuristic for titles written as <span> (:115); run at 
      → Change apps/web/src/routes/not-found.tsx:10 from <h2>This apple is lost</h2> to <h1 className="page-title">This apple is lost</h1> (or add a page-level h1 above it), so the route has exactly one h1 like every other route. Then add apps/web/tests/headings.test.mjs that reads every file in apps/web/sr
- [✓] Form field labels
      · I scanned all 61 <input>/<textarea>/<select> in apps/web/src and found none without an accessible name. Three patterns, all valid: wrapping labels (apps/web/src/routes/auth-pages.tsx:191-202, 203-214, 306-330, 382-394, 516-539, 651-661 — <l
- [~] Accessible validation feedback
      · One panel does it properly: apps/web/src/components/roblox-key-panel.tsx:145-146 and :165-166 set aria-invalid and aria-describedby pointing at the per-field problem text (ids rk-key-problem / rk-id-problem). Elsewhere it stops short. apps/
      → In apps/web/src/routes/auth-pages.tsx, give FormError (:147) an id prop, render it as <p id={id} className="form-error" role="alert">, and on each input in LoginPage/SignupPage/ForgotPage/ResetPage set aria-invalid={!!error || undefined} and aria-describedby={error ? id : undefined}. Add role="alert
- [✓] Screen-reader status announcements
      · Built, wired and tested end to end. apps/web/src/lib/announce.ts exports replyAnnouncement()/speakableBody()/ANNOUNCE_MAX; it is imported at apps/web/src/routes/workspace.tsx:35 and its output is rendered into a real live region at apps/web
- [~] Accessible dialogs
      · Two shared primitives are correct. apps/web/src/components/modal.tsx has role="dialog", aria-modal, aria-label, focus into the first focusable on mount (:19-28), a two-way Tab trap that filters offscreen nodes (:36-48), Escape, and focus re
      → Rewrite apps/web/src/components/asset-source-dialog.tsx to render its contents inside the shared <Modal title="Where should Apple get assets from?" onClose={onCancel} locked={…}> from apps/web/src/components/modal.tsx, deleting its own role/aria-modal/aria-labelledby/onKeyDown and the unstyled .asrc
- [~] Accessible menus
      · The shared Popover at apps/web/src/components/ws/primitives.tsx:39-75 gives role="menu" + aria-label, Escape, capture-phase outside-click dismissal, and focus restore to the opener in its cleanup; every trigger is correctly annotated — apps
      → In apps/web/src/components/ws/primitives.tsx (Popover, :39-75) add a roving-focus implementation: on open, query the panel for [role="menuitem"], focus the first, and set tabIndex -1 on all of them; handle ArrowDown/ArrowUp (wrapping), Home and End in the existing document keydown handler alongside 
- [~] Accessible tab controls
      · Three tablists exist and are announced: apps/web/src/routes/dashboard.tsx:473-489 (role="tablist" aria-label="Project scope", two role="tab" buttons with aria-selected), and apps/web/src/lib/generative-ui/render.tsx:417-423 ('Comparison mod
      → For apps/web/src/routes/dashboard.tsx:473-489, give each tab id={`scope-tab-${s}`} and aria-controls="scope-panel", wrap the project grid that follows (dashboard.tsx:495 onward) in <div id="scope-panel" role="tabpanel" aria-labelledby={`scope-tab-${scope}`} tabIndex={0}>, set tabIndex={scope === s ?
- [~] Accessible tables
      · The marketing site is exemplary and shipped: apps/site/src/pages/pricing.astro:191-206 has <caption class="visually-hidden">, th scope="col" for plan columns and th scope="row" for each capability, inside a .table-scroll container, and :281
      → In apps/web/src/components/ws/files-panel.tsx, change FilePreview's table branch (:330-347) to render preview.rows[0] inside <thead><tr>{cells.map(c => <th scope=\"col\">{c}</th>)}</tr></thead> and the remainder in <tbody>, and add a <caption className="gx-sr">{path}</caption>; if previewOf (same fi
- [~] Accessible code presentation
      · Real and well tested, but tested for fidelity rather than for access. apps/web/src/components/ws/code-block.tsx names the language in a header, and its copy control carries aria-label={copied ? 'Copied to the clipboard' : 'Copy this code'} 
      → In apps/web/src/components/ws/code-block.tsx, add tabIndex={0} plus role="region" and aria-label={name ? `${name} code` : 'Code'} to the <pre className="gx-code__body"> (line 68), so the scrollable region is focusable and named; give it a :focus-visible outline in apps/web/src/styles/workspace.css b
- [✓] Non-color status indicators
      · The requirement is asserted directly: apps/web/tests/status-icon.test.mjs:61 'success and error are visibly different shapes, not the same path recoloured' asserts STATUS.success.path !== STATUS.error.path and STATUS.warning.path !== STATUS
- [✓] Text contrast validation
      · Two independent checks, both in CI. Token-level: apps/web/tests/contrast.test.mjs computes WCAG relative luminance and asserts the app ink ramp clears 4.5:1 against the LIGHTEST surface each colour sits on in BOTH themes (:59), the status t
- [✓] Reduced motion support
      · Honoured at three levels and ratcheted. CSS: @media (prefers-reduced-motion: reduce) at apps/web/src/styles.css:5496 and five blocks in apps/web/src/styles/workspace.css (:2534, :3109, :3232, :3417, :3833, :4228, :4321), plus apps/site/src/
- [~] Browser zoom compatibility
      · Marketing site: proven in CI. tests/e2e/landing.spec.ts:386 'text enlargement scrolls rather than clipping' injects html{font-size:32px} (200%), asserts getComputedStyle(main).overflow !== 'hidden' and that the primary CTA is still visible;
      → Add tests/e2e/app-zoom.spec.ts alongside tests/e2e/landing.spec.ts that loads the app shell in MOCK_MODE, applies page.addStyleTag({content:'html{font-size:32px !important}'}), and asserts (a) document.documentElement.scrollWidth <= innerWidth + 1 (no horizontal scroll), (b) the composer textarea #g
- [~] Touch target sizing
      · Only one of the three stylesheets does it. apps/web/src/styles/workspace.css:2515-2531 is a deliberate '@media (pointer: coarse)' block ('A mouse can hit 36px; a thumb cannot') sizing .gx-icon-btn and .gx-send to 44x44 and giving .gx-btn/.g
      → Add a '@media (pointer: coarse)' block to apps/web/src/styles.css (next to the cursor block at :5581) giving .btn, .btn-sm, .icon-btn, .menu-pop [role="menuitem"], .scope-tab and .settings-row control a min-height of 44px and .icon-btn a 44x44 box, mirroring apps/web/src/styles/workspace.css:2515-25
- [~] Manual assistive technology verification
      · A real manual pass exists and is written up: docs/evidence/2026-09-01-accessibility-pass.md audits the live DOM of six app routes (36 focusables and 26 buttons on the workspace with 0 unlabelled; 0 images without alt; 0 SVGs neither aria-hi
      → Run one screen reader end to end over the two flows that matter — sign in -> create a project -> send a message -> read the reply (VoiceOver + Safari on macOS, then NVDA + Firefox on Windows) — and record it as docs/evidence/<date>-screen-reader-pass.md in the same shape as docs/evidence/2026-09-01-

## 42. RESPONSIVE INTERACTION AND UI STATES  —  83%   ✓13 ~7 ☐0

- [✓] Desktop workspace layout
      · apps/web/src/styles/workspace.css:95-97 `.gx-shell { display:grid; grid-template-columns: var(--gx-rail-w) minmax(0,1fr) }` with --gx-rail-w:320px (workspace.css:51). Rendered by apps/web/src/components/layout.tsx:349 (`gx gx-shell`) around
- [~] Laptop workspace layout
      · There is no separate laptop rule and none is needed: the live shell has exactly one breakpoint above phone/tablet (apps/web/src/styles/workspace.css:2593 `@media (min-width:861px)`), so 1280x800 and 2560x1440 both get `grid-template-columns
      · REFUTED: The conclusion happens to be right but nothing was built or verified for laptops, and the exhaustiveness argument the claim rests on is itself incomplete. (1) The sweep is not exhaustive: main.tsx imports styles.css and 
- [~] Tablet workspace layout
      · BUILT HALF: apps/web/src/styles/workspace.css:2664-2720 `@media (max-width:860px)` collapses .gx-shell to one column, turns .gx-rail into a fixed off-canvas panel (`transform: translateX(-100%)`, `width: min(320px, 86vw)`), reveals `.gx-rai
      → Either delete the dead tablet CSS or wire it. apps/web/src/styles.css:5253-5311 defines `.ws-body`/`.ws-lane`/`.ws-mobile-tabs`/`.ws-mobile-tab` for a 1023px single-lane layout that no component renders — the live workspace is apps/web/src/routes/workspace.tsx using `gx-ws`/`gx-thread`. Decide: (a) 
- [~] Mobile project overview
      · CONTENT HALF WORKS: apps/web/src/routes/dashboard.tsx:458 renders `.page` (fluid padding, apps/web/src/styles.css:1175-1180 `clamp()`), the project list is `.card-grid` = `repeat(auto-fill, minmax(min(100%,19rem),1fr))` (styles.css:1234-123
      → apps/web/src/components/layout.tsx has no mobile header. Add one inside the `gx-shell` div (before <main id="main-content">, layout.tsx:370) containing a button with className="gx-icon-btn gx-rail-toggle" aria-label="Open navigation" that calls `openRail` from useShell() — the same control apps/web/
- [✓] Mobile conversation access
      · apps/web/src/routes/workspace.tsx:549-554 renders `<button className="gx-icon-btn gx-rail-toggle" onClick={openRail}>`; apps/web/src/styles/workspace.css:958 hides it by default and :2693-2696 shows it under `@media (max-width:860px)`. The 
- [~] Mobile approval workflows
      · THE DESTRUCTIVE-CONFIRM HALF IS RESPONSIVE: apps/web/src/components/confirm-dialog.tsx builds on components/modal.tsx, whose `.modal-panel` is `width: min(30rem, 100%)` (apps/web/src/styles.css:3950-3952) and is forced to `width:100%` below
      → Two things. (1) Add the missing rules for apps/web/src/components/asset-source-dialog.tsx to apps/web/src/styles/workspace.css: `.asrc__scrim { position:fixed; inset:0; z-index:200; display:grid; place-items:center; background:var(--scrim); padding:1rem; }` and `.asrc { width:min(34rem,100%); max-he
- [✓] Responsive settings pages
      · apps/web/src/routes/settings.tsx:~ renders `.page page-narrow`: `.page` has fluid `clamp()` padding (apps/web/src/styles.css:1175-1180) that drops to 1rem below 899px (styles.css:5374-5376); `.page-narrow` is `max-width:56rem; width:100%` (
- [✓] Responsive billing pages
      · IN-APP (/app/usage, apps/web/src/routes/usage.tsx:275): `.usage-grid` is `repeat(auto-fit, minmax(min(100%,17rem),1fr))` (apps/web/src/styles.css:4348-4353) so it collapses to one column; the wide chart card's `grid-column: span 2` (styles.
- [~] Touch-friendly controls
      · ONE STYLESHEET DOES IT: apps/web/src/styles/workspace.css:2515-2532 `@media (pointer: coarse)` raises `.gx-icon-btn` and `.gx-send` from 36px (workspace.css:~ base rules, both `width:36px; height:36px`) to 44x44 and sets `min-height:44px` o
      → apps/web/src/styles.css has no touch-target block. Add one next to the existing coarse-pointer rule at styles.css:5581: `@media (pointer: coarse) { .icon-btn { width:44px; height:44px; } .btn, .btn-sm, .theme-btn, .scope-tab, .pill { min-height:44px; } }`. Then add apps/web/tests/touch-targets.test.
- [✓] Loading states for asynchronous actions
      · FETCHES: apps/web/tests/ui-states.test.mjs:57-65 'every fetching surface handles the in-flight state' sweeps every .tsx under src that uses useQuery and requires isPending/aria-busy/Spinner/Forge; ui-states.test.mjs:70-90 additionally pins 
- [✓] Skeleton states for content loading
      · apps/web/src/styles.css:617-645 defines `.skeleton` (shimmer gradient), `.skeleton-title`, `.skeleton-line`, `.skeleton-line.short` and `@keyframes shimmer`; `.skeleton-card` at styles.css:1315. Rendered in the isPending branch of the dashb
- [✓] Empty states with relevant next actions
      · apps/web/src/components/empty-state-model.ts defines ten canonical states, each with a `body` that is the next action ('Open your place in Roblox Studio and pair it', 'Build something first — the roadmap is read out of your place'), and app
- [✓] Partial data states
      · Search results say when the scan did not reach the end: apps/web/src/components/ws/search-panel.tsx:391-396 renders 'the oldest records were not scanned — there may be more' with role="status" off `res.scanTruncated` (apps/web/src/lib/api.t
- [✓] Offline states
      · apps/web/src/lib/connectivity.ts models three reaches — 'offline' (navigator.onLine === false, the one direction it is trusted in), 'unreachable' (a request observed to never leave, recorded by noteReachability from lib/api.ts), 'online' (n
- [✓] Reconnecting states
      · apps/web/src/lib/use-project-socket.ts:128 `type ConnState = 'connecting' | 'open' | 'reconnecting' | 'offline'`; the socket sets 'reconnecting' and arms an exponential-backoff retry at use-project-socket.ts:797-801, exposes `reconnectNow` 
- [~] Expired session states
      · THE STATE EXISTS AND IS CORRECT: apps/web/src/lib/error-taxonomy.ts:102-113 classifies 401 as kind 'signed_out', title 'Your session has expired', safety 'Your work is saved. Signing in again brings you back to it.', retryable:false (so no 
      → apps/web/src/lib/error-taxonomy.ts:108 has `href: '/app/sign-in'`. Change it to `href: '/login'` — apps/web/src/components/failure.tsx:33 renders it through react-router's <Link> inside a BrowserRouter with basename="/app" (apps/web/src/app.tsx:58), so the value must be router-relative, and /login i
- [~] Permission loss states
      · REACTIVE HALF IS WIRED AND TESTED: apps/web/src/lib/error-taxonomy.ts:115-125 turns a 403 into kind 'not_permitted', 'You do not have access to this', safety 'The request was refused before it changed anything.', retryable:false; rendered b
      → apps/web/src/routes/workspace.tsx does not fetch the caller's role. Add `const access = useQuery({ queryKey:['access',projectId], queryFn:()=>fetchProjectAccess(projectId) })` (client already exists at apps/web/src/lib/api.ts:538), map it with `normaliseAccess` from apps/web/src/lib/capabilities.ts,
- [✓] Retryable error states
      · apps/web/src/lib/error-taxonomy.ts carries an explicit `retryable` flag per kind (status 0, 500, 502/504 and the rate-limit 429 are true) and apps/web/src/components/failure.tsx:37-41 renders the Try again button only when `onRetry && e.ret
- [✓] Non-retryable error states
      · apps/web/src/lib/error-taxonomy.ts marks 401 (:110), 403 (:121), 404 (:132), the out-of-credits 429 (:148) and 503 (:167) `retryable: false`, each with a different `next` in place of a button — 429-credits points at /app/usage, 503 says not
- [✓] Success confirmation for consequential actions
      · The ceremony is decided by a tested ladder, not per-component taste: apps/web/src/lib/confirm-model.ts `confirmationFor()` returns 'none' | 'undo' | 'dialog' | 'typed' and treats an unreadable consequence as the worse one (confirm-model.ts:

## 43. DESIGN SYSTEM AND INTERFACE CONSISTENCY  —  50%   ✓3 ~14 ☐3

- [~] Shared color tokens
      · Colour tokens exist on every surface but there is no shared source — five independent palettes reuse the SAME token names with different values. apps/site/src/styles/landing.css:33-74 (--ground #080a0f, --blue #2f7dff); apps/site/src/styles
      → Create one token source — packages/design/src/tokens.css (or a .mjs that emits it) — defining the ramp ONCE per theme under a single namespace, and have apps/site/src/styles/global.css, apps/site/src/styles/landing.css, apps/web/src/styles.css and apps/web/src/styles/workspace.css each `@import` it 
- [~] Shared typography tokens
      · Family tokens exist on all four stylesheets and DISAGREE. Site: --font-display 'Archivo' / --font-body 'Figtree' / --font-mono 'Geist Mono' (apps/site/src/styles/global.css:40-46, apps/site/src/styles/landing.css:78-81). App: --font-display
      → Two changes. (1) apps/web/index.html:16 — replace the Inter+JetBrains Mono Google Fonts link with the same Archivo+Figtree+Geist Mono load the site uses (apps/site/src/layouts/Base.astro), and update apps/web/src/styles.css:31-33 to the stacks in apps/site/src/styles/global.css:40-46 including the c
- [☐] Shared spacing tokens
      · Searched every stylesheet and source tree for a spacing scale and found none: `grep -rnE '^\s*--(sp|space|spacing|gap|s[0-9])[a-z0-9-]*\s*:' apps/web/src apps/site/src packages/design/src` returns zero rows. The only rhythm tokens that exis
      → Add a spacing scale to the shared token file (e.g. --sp-1 .25rem through --sp-8 3rem, plus --sp-gutter) and adopt it in apps/web/src/styles/workspace.css first, since that is the newest layer and the one the workspace renders from. Then add apps/web/tests/spacing-tokens.test.mjs that parses workspac
- [~] Shared elevation tokens
      · A real 3-step elevation scale exists in two of the four stylesheets and is theme-aware: --lift-1/--lift-2/--lift-3 plus --inset at apps/web/src/styles.css:78-81 (light), :126-129 (dark), :172-175 (prefers-color-scheme fallback), and apps/si
      → Move --lift-1/2/3 and --inset into the shared token file, and in apps/web/src/styles/workspace.css replace the literal box-shadows at lines 567, 2323 and 3311 with --lift-3 (adding a --lift-4 / --lift-drawer step if the drawer's directional shadow genuinely needs one, defined as a token rather than 
- [~] Shared motion tokens
      · Motion IS tokenised, and the reduced-motion policy is genuinely enforced — but the tokens are declared four separate times with different values and no shared source. apps/web/src/styles/workspace.css:63-67 (--gx-ease + --gx-t-press 90ms / 
      → Hoist one ease + one duration ladder into the shared token file and have all four stylesheets reference it; reconcile 130/140ms, 240/260/220ms and 520/620ms to single values. Then widen apps/web/tests/activity-motion.test.mjs to read apps/web/src/styles.css as well as workspace.css, so the older lay
- [~] Standard icon library
      · apps/web/src/components/icons.ts:15 exports ICON_PATH, one map of 30 named paths at a single 24x24/1.7-stroke spec, and it is the only path map in the app: apps/web/tests/icons.test.mjs:32 ('every icon path is defined in exactly one module'
      · REFUTED: The module is real — /Users/moshe/Desktop/RbxAI/apps/web/src/components/icons.ts:15 exports ICON_PATH, and both renderers draw it at 24x24/1.7 (ws/primitives.tsx:11-17 Icon, glyphs.tsx:68-74 NavIcon). ws/primitives.tsx:2
- [~] Standard button variants
      · Four unrelated button families ship, and seven call sites in apps/web use variant classes that have NO CSS rule at all. Families: apps/web/src/styles.css:649-807 (.btn + -primary/-ghost/-quiet/-danger/-sm/-lg/-block), apps/web/src/styles/wo
      → Either add `.btn--primary`/`.btn--danger` as aliases in apps/web/src/styles.css next to .btn-primary:704 and .btn-danger:761, or (better) change the five call sites to the single-dash names: apps/web/src/components/asset-source-dialog.tsx:104, roblox-key-panel.tsx:118, :217, :224. Add `.gx-btn--ghos
- [~] Standard input components
      · Input styling is standardised by element selector rather than by component and does apply app-wide: apps/web/src/styles.css:902-940 styles input[type=text|email|password], bare input, textarea and select with one border, radius, --inset sha
      → In apps/web/src/styles.css, add an `input[aria-invalid='true'], textarea[aria-invalid='true'], select[aria-invalid='true']` rule after the :focus block at :925 giving border-color: var(--bad) and a var(--bad-soft) focus ring, so the attribute has a visible consequence. Then set aria-invalid + aria-d
- [~] Standard form layouts
      · There is one field layout convention and it is genuinely adopted: .field (apps/web/src/styles.css:884), .field-label (:889) and .field-hint (:898), used 33 / 36 / 7 times across settings.tsx, auth-pages.tsx, admin.tsx, roblox-key-panel.tsx 
      → Add apps/web/src/components/field.tsx exporting <Field label hint error required htmlFor> that renders the .field/.field-label/.field-hint markup plus an error paragraph with a generated id, and wires aria-invalid and aria-describedby onto its child input automatically. Migrate apps/web/src/routes/a
- [~] Standard table components
      · Tables exist and are styled, but there are three unrelated implementations and no shared one. (1) .admin-table — apps/web/src/styles.css:4952-4984, used only at routes/admin.tsx:138, :156, :199; it is the only one with a .table-wrap overflo
      → Rename .admin-table to a neutral .table in apps/web/src/styles.css:4952 (keeping .table-wrap as its required scroll container) and make it the single table skin: repoint apps/web/src/components/ws/files-panel.tsx:332 and apps/web/src/lib/generative-ui/render.tsx:273 at it, keeping only genuinely blo
- [~] Standard status badges
      · The status MARK half is done and tested: apps/web/src/components/status-icon-model.ts:24 defines STATUS as nine canonical I-series marks with tone bound to meaning, apps/web/src/components/status-icon.tsx:20 renders them, and apps/web/tests
      → Add apps/web/src/components/badge.tsx exporting <Badge status label> that composes StatusIcon with one pill skin, taking its tone from status-icon-model.ts so a badge can never be toned against its meaning. Consolidate .pill (styles.css:514) and .gx-pill (workspace.css:782) into that one skin and de
- [~] Standard dialogs and drawers
      · Both standards exist and are good. apps/web/src/components/modal.tsx:15 Modal has a focus trap, Escape, overlay-click, focus restore and a `locked` mode for in-flight mutations; it is used by six dialogs (confirm-dialog.tsx:11, shortcuts-di
      → Rewrite apps/web/src/components/asset-source-dialog.tsx to render its body inside <Modal title="Where should Apple get assets from?" onClose={onCancel} locked={save.isPending}> from ../modal, deleting the hand-rolled .asrc__scrim wrapper at :47-56 (Modal already declines overlay-click dismissal when
- [☐] Standard tooltips and popovers
      · Searched for a component, a class and a library. No file in apps/web/src or apps/site/src is named tooltip or popover; `grep -ril 'tooltip\|popover' apps/web/src` returns six files and every hit is prose in a comment (apps/web/src/styles/wo
      → Add apps/web/src/components/tooltip.tsx: a <Tooltip content> wrapper that renders the trigger with aria-describedby pointing at a positioned [role=tooltip] element, shown on hover AND focus, dismissed on Escape, with a delay token from the motion scale; style it as .tip in apps/web/src/styles/worksp
- [✓] Standard notification components
      · One notification system, modelled, wired and tested. apps/web/src/components/toast-model.ts:26-28 fixes the kind vocabulary (info/success/error) and :53 caps the stack; apps/web/src/components/toast.tsx:38 ToastProvider is the single render
- [✓] Standard empty-state components
      · apps/web/src/components/empty-state-model.ts:53 defines EMPTY_STATES as the canonical M-series with tone bound to the state rather than passed as a prop, plus M06_NOT_MODELLED recorded as reserved-with-a-reason instead of silently dropped. 
- [✓] Standard error presentation
      · apps/web/src/components/failure.tsx:11 is the one failure renderer, fixing the order what-happened / what-was-lost / what-to-do, offering Try again only when e.retryable, and keeping the server's words in a <details> rather than as the head
- [☐] Shared terminology glossary
      · Searched `grep -rn 'glossary\|GLOSSARY'` across apps/, packages/, docs/ and scripts/: the only hits are inside the vendored Roblox corpus (packages/corpus/raw/...) and the checklist line itself. docs/ has 30 markdown files (DESIGN-SPEC.md, 
      → Create docs/GLOSSARY.md with one row per product noun — the user-facing term, its definition, and the terms it must NOT be called — covering at minimum: Credit (vs Spark), project (vs place, game, experience), run (vs build, session, generation), checkpoint (vs save, snapshot, version), Studio conne
- [~] Consistent action naming
      · For the AGENT's step names this is done and enforced: apps/web/src/components/ws/tool-vocabulary.ts:28 is one table mapping every tool to one written activity label, its header records that it replaced three drifted copies (TOOL_KIND, STEP_
      → Add the UI action verbs to the docs/GLOSSARY.md proposed above (or a dedicated ACTION_LABELS constant in apps/web/src/lib/), pinning the pairs the product has already chosen — Try again not Retry, Sign out not Log out, Save not Save changes/Update/Apply, Delete for irreversible and Remove for detach
- [~] Theme consistency across all surfaces
      · The MECHANISM is shared and correct: both surfaces write the same attribute and the same storage key, and both paint before first frame — apps/web/index.html:19-25 reads localStorage 'apple-theme' and sets data-theme on <html>, and apps/sit
      → Two steps. (1) Decide whether apps/web follows ADR-020 to blue-black/azure or ADR-020 is amended; then make apps/web/src/styles.css:64-155 and apps/web/src/styles/workspace.css:19-45 agree with each other and with apps/site/src/styles/global.css, ideally by both importing the shared token file. (2) 
- [~] Visual regression coverage for shared components
      · A real visual-regression checker exists and is itself tested: scripts/check-pixels.mjs captures every route at 1440x900 and 390x844 in light and dark (:102-106), fails a frame that is >92% one colour, a body font that fell back to a system 
      → In scripts/check-pixels.mjs, extend routes() at :84-99 to accept a second source — the app's own routes, built and served from apps/web/dist — and include /ui-lab, /settings, /usage and /dashboard at both viewports and both schemes; capture the lab's specimen sections as their own clipped frames so 

## 46. SDK, CLI, AND DEVELOPER EXPERIENCE  —  53%   ✓4 ~13 ☐3

- [~] Published OpenAPI specification
      · apps/worker/src/index.ts:3101 serves `GET /v1/openapi.json`, generated by openApiDocument() at apps/worker/src/public-api.ts:823 from the PUBLIC_ROUTES table (public-api.ts:80). Two tests: apps/worker/tests/public-api.test.mjs:716 walks eve
      · REFUTED: The document itself is real and deployed — every citation checks out (apps/worker/src/index.ts:3101 is verbatim the route; openApiDocument is at apps/worker/src/public-api.ts:823 exactly; PUBLIC_ROUTES is at :83 not :80;
- [☐] Interactive API reference
      · Searched apps/site/src/pages (all 18 .astro pages listed — index, pricing, changelog, status, terms, privacy, 404 and docs/{index,getting-started,connect,modes,plugin,faq,credits-and-limits,troubleshooting,updating,build-from-source,privacy
      → Create apps/site/src/pages/docs/api.astro using DocsLayout. Inline the Scalar or Redoc standalone bundle (or hand-render from a build-time fetch of the spec) pointed at https://<worker origin>/v1/openapi.json, and add the page to the docs nav in apps/site/src/layouts/DocsLayout.astro. It must render
- [~] Authentication examples
      · Examples exist only for the JWT `/api/*` surface, and only inside an unpublished package README: packages/sdk/README.md:37 (`new AppleClient({ token: process.env.APPLE_TOKEN })`), :48 (`AppleClient(token=os.environ["APPLE_TOKEN"])`), :53 (L
      → Add an 'Authentication' section to a new apps/site/src/pages/docs/api.astro showing (a) a curl request `curl -H 'Authorization: Bearer gk_live_…' -H 'Apple-Version: 2026-09-15' https://<origin>/v1/models`, (b) the same in JS and Python, and (c) how to obtain the key. (c) requires a UI first: add an 
- [~] JavaScript client library
      · packages/sdk/src/client.mjs:33 `export class AppleClient` — ~25 methods over the worker's `/api/*` routes, all built on the single transport at packages/sdk/src/http.mjs:36. Proof it works, not just exists: packages/sdk/tests/client.test.mj
      · REFUTED: The code and tests are genuinely real — I ran `node --test` in packages/sdk: 83 pass, 0 fail, 0 SKIPPED. AppleClient is at src/client.mjs:33 with 27 methods on one transport, and tests/client.test.mjs:38 really does driv
- [✓] TypeScript type definitions
      · packages/sdk/types/index.d.ts, 349 lines, hand-written and pinned to the runtime two ways by packages/sdk/tests/types.test.mjs:35 — every runtime export of src/index.mjs is declared and no declared value is absent at runtime (asserts >20 ex
- [~] Python client library
      · packages/sdk/python/golem_sdk/ — client.py (287 lines, AppleClient at :67 with request/request_full, retry and a 30s timeout), errors.py (ApiError at :18, should_retry at :45), numbers.py, studio.py. Proven by packages/sdk/tests/python.test
      · REFUTED: The evidence is all literally true and the test is as rigorous as claimed — python/golem_sdk/client.py has AppleClient at :68 (claim said :67, off by one), errors.py has ApiError at :18 and should_retry at :45 exactly, a
- [~] Supported Luau integration examples
      · The Luau CLIENT is real and tested: packages/sdk/luau/AppleClient.luau (307 lines; claim() at :253, poll() at :271, injectable HttpService), with packages/sdk/luau/tests/client.spec.luau run from packages/sdk/tests/luau.test.mjs:35, which a
      → Create packages/sdk/luau/examples/ with at least two runnable files: a command-bar snippet that requires AppleClient, calls :claim(code) and prints the project name, and a minimal Studio plugin (init.server.luau plus a default.project.json for Rojo) that pairs and then polls :poll() in a loop. Refer
- [~] Command-line authentication
      · Authentication works: packages/sdk/bin/apple.mjs:54 resolves the credential from `--token`, then APPLE_TOKEN, then GOLEM_TOKEN, and packages/sdk/tests/cli.test.mjs:102 spawns the real binary and asserts the fake server saw `authorization: B
      → Add a `login` command to COMMANDS in packages/sdk/src/cli-args.mjs:17 and a branch in packages/sdk/bin/apple.mjs. Simplest correct version: `apple login --key gk_live_…` validates the key with `GET /v1` (apps/worker/src/index.ts:3100) and writes it to ~/.config/apple/credentials.json at mode 0600; `
- [~] Command-line project management
      · Per-project commands exist and every one is exercised end-to-end: packages/sdk/src/cli-args.mjs:17 declares memory, checkpoints, checkpoint, restore, pair, roadmap, attribution, export, search, messages and purge, and packages/sdk/tests/cli
      → Add a `projects` command to COMMANDS in packages/sdk/src/cli-args.mjs:17 (no positional args) and a `projects()` method to packages/sdk/src/client.mjs that GETs /v1/projects (apps/worker/src/index.ts:3291), printing id and name per row so a user can discover the UUID every other command demands. Wir
- [~] Command-line run execution
      · Built and wired: `apple chat <projectId> <text> [--mode] [--json]` at packages/sdk/bin/apple.mjs:113 opens a SessionStream, waits for the socket to open (rejecting on 'gave_up'), sends the turn, awaits waitForRun() and prints the reply; the
      → Extend packages/sdk/tests/cli.test.mjs to cover `chat` by importing `run()` from packages/sdk/bin/apple.mjs (it is exported for exactly this) rather than spawning, and injecting a fake socket the way packages/sdk/tests/stream.test.mjs:59 already does. Assert three cases: no token exits 2 with no soc
- [~] Command-line run inspection
      · Partial in a specific way: `apple chat --json` (packages/sdk/bin/apple.mjs:132) prints the full run record — text, tools[], phase, stopReason, stopReasonRecognised, creditsSpent, orphanDeltas, per emptyRun() at packages/sdk/src/stream.mjs:3
      → Add a `runs` command to COMMANDS in packages/sdk/src/cli-args.mjs:17 taking a projectId, backed by a new `currentRun(projectId)` method on packages/sdk/src/client.mjs that GETs /v1/projects/:id/runs/current (apps/worker/src/index.ts:3391) and prints the run or 'idle'. Add `--follow` that consumes th
- [~] Command-line artifact export
      · `apple export <projectId> --format json|md --out <file>` at packages/sdk/bin/apple.mjs:106, backed by AppleClient.exportTranscript() (packages/sdk/src/client.mjs:161), which takes the filename from the server's Content-Disposition rather th
      · REFUTED: The command is real and the test is honestly end-to-end: bin/apple.mjs:106 is exactly `case 'export': {`, tests/cli.test.mjs:144 spawns the real binary, asserts the written file's exact bytes and JSON.parse(stdout).writt
- [~] SDK timeout configuration
      · The Python client has it: packages/sdk/python/golem_sdk/client.py:81 takes `timeout: float = 30.0` and applies it at client.py:169 (`self._open(req, timeout=self.timeout)`). The JavaScript client does not. TransportOptions at packages/sdk/t
      → Add `timeoutMs` to createTransport's options in packages/sdk/src/http.mjs:36 (default 30000, admitted through finiteInt like maxAttempts at http.mjs:45). In raw(), build an AbortController per attempt, start a timer, pass the signal to fetchImpl at http.mjs:84, and clear the timer in a finally. An a
- [✓] SDK retry configuration
      · Configurable on three axes and tested on all of them. packages/sdk/src/http.mjs:45 admits `maxAttempts` through finiteInt (default 3, clamped 1-10, so a NaN cannot turn the cap into no cap); `retryNonIdempotent` is per-request at http.mjs:9
- [☐] SDK pagination helpers
      · grep -rni 'cursor|paginat|nextPage|before=|hasMore|next_cursor' over all of packages/sdk (JS, Python, Luau, types and tests) returned zero hits. The only paging control anywhere is the bare `limit` on AppleClient.messages() at packages/sdk/
      → Add an async-iterator helper to packages/sdk/src/client.mjs, e.g. `async *allMessages(projectId, { pageSize = 100 })`, that calls the `before`+`limit` form of the messages route (apps/worker/src/public-api.ts:100) and yields pages until a short page comes back, plus a `collect()` convenience with a 
- [✓] SDK streaming helpers
      · packages/sdk/src/stream.mjs (317 lines): SessionStream at stream.mjs:154 with connect, backoff reconnect (:246), waitForRun, sendChat and close, plus the pure folds parseServerMsg (:27), emptyRun (:39) and applyServerMsg (:70) so malformed 
- [✓] Structured SDK errors
      · packages/sdk/src/errors.mjs:13 `export class ApiError extends Error` carrying status (0 meaning transport, distinct from every HTTP status), body, retryAfter, attempts and an `isTransport` getter, with every numeric field admitted through f
- [☐] Versioned example applications
      · No examples anywhere. `find . -type d -name 'example*'` outside node_modules and .git matches only vendored third-party corpora under packages/corpus/raw/ and a file inside packages/training/.venv — nothing authored here. packages/sdk ships
      → Create packages/sdk/examples/ with at least two self-contained apps, each with its own package.json declaring a version and a `@golem/sdk` dependency pinned to an exact version: (1) node-transcript-export — authenticates, lists messages with pagination and writes a markdown transcript; (2) node-run-
- [~] Developer changelog
      · A product changelog exists and is unusually well-enforced: docs/RELEASES.json is the ledger, scripts/release.mjs --check regenerates and verifies CHANGELOG.md and docs/releases/v0.1.0.md and v0.2.0.md against it (rules as pure functions in 
      → Add an `api` section to each entry in docs/RELEASES.json (or a parallel `apiReleases` array keyed by the dated versions in apps/worker/src/public-api.ts:30), extend scripts/lib/release-rules.mjs with a rule that every value in API_VERSIONS has a ledger entry and every route carrying a `deprecated` b
- [~] SDK-to-API compatibility verification
      · One real half exists: packages/sdk/tests/protocol-parity.test.mjs pins MODES, CLIENT_MSG_TYPES, STOP_REASONS and PLAN_IDS to the actual declarations parsed out of packages/shared/src/index.ts (anchored to each declaration, not to a substrin
      → Add packages/sdk/tests/route-parity.test.mjs that reads apps/worker/src/index.ts, extracts every `app.<verb>('/api/…')` literal into a set, extracts the paths AppleClient can build (export a route manifest from packages/sdk/src/client.mjs so this need not be a regex over method bodies), and asserts 

## 45. WEBHOOKS AND EVENT DELIVERY  —  23%   ✓0 ~9 ☐11

- [☐] Webhook endpoint registration
      · No outbound webhook subsystem exists. Searched: all 138 route registrations in apps/worker/src/index.ts (the only match for 'webhook' is apps/worker/src/index.ts:1768 `app.post('/api/billing/webhook')`, which RECEIVES Stripe events); the pu
      → Create apps/worker/src/webhook-store.ts (D1, following apps/worker/src/automation-store.ts for shape and the owner_id-binding rule) with a `webhook_endpoints` table: id, owner_id, project_id, url, secret_hash, event_types (json), enabled, created_at, failure_count, paused_at. Add owner-authenticated
- [☐] Webhook endpoint verification
      · Nothing proves ownership of a destination URL, because no destination URL can be registered (see previous item). The only verification in the tree is inbound signature checking: verifyStripeSignature at apps/worker/src/billing.ts:213, calle
      → After the registration route exists, add POST /api/webhooks/:id/verify in apps/worker/src/index.ts: generate a nonce, POST a `webhook.verify` event to the registered URL through guardedFetch (apps/worker/src/net-policy.ts:255) so the private-IP and redirect rules apply, and mark the endpoint verifie
- [~] Event type selection
      · Typed events exist but a consumer cannot choose which ones it gets. projectEvents (apps/worker/src/public-api.ts:516) emits four types — state, run.status, messages, studio — proven by apps/worker/tests/public-api.test.mjs:643 ('projectEven
      → Publish one event-type list and honour it in both places. Export EVENT_TYPES from apps/worker/src/public-api.ts next to projectEvents (line 516), accept `?events=run.status,studio` on GET /v1/projects/:id/events in apps/worker/src/index.ts:3423 (refuse an unknown name with a 400 rather than ignoring
- [☐] Organization-scoped event subscriptions
      · No event subscription of any scope is stored, so no org-scoped one exists. Org machinery itself is partial: memory_orgs / memory_org_members tables (apps/worker/src/memory-store.ts:540,548) and /api/orgs routes (apps/worker/src/index.ts:872
      → Build nothing here while the single-user disposition in docs/design/TENANCY.md stands. If it is ever revisited, the org subscription must hang off memory_org_members (apps/worker/src/memory-store.ts:540) for membership and reuse the same webhook_endpoints table with org_id in place of project_id, wi
- [~] Project-scoped event subscriptions
      · The PULL half is built, wired and tested; the stored/push half does not exist. GET /v1/projects/:id/events (apps/worker/src/index.ts:3423) is per-project, requires scope `events:read` (route table entry apps/worker/src/public-api.ts:105) an
      → Add project_id to the webhook_endpoints table proposed above and reuse the existing grant check: the delivery fan-out must call the same authorizeKey/grantedStub path (apps/worker/src/index.ts:240) so a subscription cannot outlive the key's project grant. Emit from the two places that already know a
- [~] Versioned event schemas
      · The API is dated-versioned and the version is enforced on the event stream, but the event payloads themselves carry no schema and no version. API_VERSIONS / resolveApiVersion at apps/worker/src/public-api.ts:30-49, enforced for every /v1 re
      → Define the event payload shapes in apps/worker/src/public-api.ts beside projectEvents (line 516) as named schemas, reference them from openApiOperation (public-api.ts:483) under `text/event-stream` so /v1/openapi.json stops describing the stream as an untyped body, and put the API version inside eac
- [~] Signed webhook payloads
      · INBOUND is done and well tested; OUTBOUND does not exist. verifyStripeSignature (apps/worker/src/billing.ts:213-246) does HMAC-SHA256 over `timestamp.rawBody`, compares in constant time (billing.ts:194) and rejects outside a 300s window; wi
      → Add a signOutboundEvent(body, secret, timestampSeconds) helper to apps/worker/src/billing.ts's neighbour (new apps/worker/src/webhook-sign.ts) using the same crypto.subtle HMAC-SHA256 construction as billing.ts:236-244, emit it as `Golem-Signature: t=<epoch>,v1=<hex>` on every delivery, and publish 
- [☐] Signing secret rotation
      · There is exactly one signing secret in the product and it cannot be rotated without a verification gap. STRIPE_WEBHOOK_SECRET is a single optional string (apps/worker/src/env.ts:32), read once per request (apps/worker/src/index.ts:1769) and
      → Two changes. (1) In apps/worker/src/billing.ts:220-231 collect ALL v1 values from the Stripe-Signature header and accept if any matches, and let apps/worker/src/env.ts:32 hold a comma-separated STRIPE_WEBHOOK_SECRET so a Stripe roll has an overlap window instead of a cutover. (2) For outbound webhoo
- [☐] Delivery attempt history
      · Nothing anywhere records an attempt to deliver an event, because nothing delivers. Searched every `create table` in apps/worker/src: the two tables that look adjacent are automation_runs (apps/worker/src/automation-store.ts:83 — it has fire
      → Add a `webhook_deliveries` table in the new apps/worker/src/webhook-store.ts with endpoint_id, event_id, event_type, attempt, requested_at, status_code, duration_ms, outcome, error — copy the column discipline of automation_runs (apps/worker/src/automation-store.ts:83). Serve it at GET /api/webhooks
- [☐] Delivery response inspection
      · No response from a delivery is ever captured or shown — there are no deliveries (see registration). The only place in the worker that reads and keeps an upstream response body is guardedFetch, which takes a redacted 200-character excerpt fo
      → When webhook_deliveries lands, store the response status, the selected response headers, and a redacted, truncated body excerpt produced exactly as apps/worker/src/net-policy.ts:322-330 does it (redactSecrets FIRST, then slice — that order is load-bearing), and render the latest attempt per endpoint
- [~] Configurable retry behavior
      · A real, well-argued retry policy exists and is unreachable. retryVerdict (apps/worker/src/automations.ts:496) takes a per-record maxRetries validated to 0..MAX_RETRIES=3 (automations.ts:103, normaliseAutomation at automations.ts:305) and re
      → Reuse rather than rewrite: import retryVerdict from apps/worker/src/automations.ts into the new delivery loop, add a per-endpoint max_attempts column (default 5, capped) to webhook_endpoints, and translate an HTTP outcome into a FireOutcome (a 5xx or timeout is retriable, a 4xx other than 429 is not
- [~] Exponential retry backoff
      · Exponential backoff is implemented and tested for CONSUMING events, never for delivering them. backoffMs (packages/sdk/src/errors.mjs:91) is exponential with jitter and honours a server Retry-After; tested at packages/sdk/tests/retry.test.m
      → In the delivery loop, schedule the next attempt with a doubling delay plus jitter capped at ~1 hour, and honour a Retry-After header from the endpoint the way packages/sdk/src/errors.mjs:92 does. Do not reuse RETRY_DELAY_MS (apps/worker/src/automations.ts:487): its fixed-interval justification is ab
- [☐] Delivery timeout enforcement
      · No delivery exists, so nothing bounds one. The two timeouts in the tree are for other subsystems: guardedFetch aborts an outbound agent request via AbortController after timeoutMs and reports `kind: 'timeout'` (apps/worker/src/net-policy.ts
      → Deliver through guardedFetch (apps/worker/src/net-policy.ts:255) rather than a bare fetch, passing an explicit timeoutMs of about 10s; it already gives an AbortController deadline, manual redirect handling and the private-address refusal. Record the resulting `kind: 'timeout'` failure as a delivery 
- [~] Duplicate event identifiers
      · Inbound events are deduplicated by id and consumers dedupe by message id, but the events this product EMITS carry no identifier. Inbound: claimEvent (apps/worker/src/do/quota.ts:71) claims each Stripe event id in an applied_events table (qu
      → Give every emitted event a stable id. In apps/worker/src/public-api.ts:516 have projectEvents return an `id` per event (project id + monotonic sequence, not a timestamp), pass it through at apps/worker/src/index.ts:3456 as `sseFrame(ev.data, { event: ev.event, id: ev.id })`, honour `Last-Event-ID` o
- [☐] Out-of-order event documentation
      · Out-of-order HANDLING exists and is documented internally; there is no consumer-facing statement of ordering or delivery semantics. Internal: apps/web/src/components/ws/activity-model.ts orders by real time and tolerates a tool_end before i
      → Write the delivery contract where integrators will see it: add apps/site/src/pages/docs/events.astro (and link it from the docs nav) stating that events may arrive out of order and more than once, that receivers must dedupe on the event id and ignore unknown event types, and that the stream ends whe
- [☐] Manual event redelivery
      · Nothing can replay an event to anyone. Searched apps/worker/src and apps/web/src for redeliver|replay|resend: the only hits are the billing path, where a redelivery is deliberately made a no-op (apps/worker/src/do/quota.ts:71-79, apps/worke
      → Once webhook_deliveries exists, add POST /api/webhooks/:id/deliveries/:deliveryId/redeliver in apps/worker/src/index.ts near the other owner-authenticated key routes (index.ts:2856+). It must re-send the stored payload with the SAME event id, so a receiver that already processed it can discard the d
- [☐] Test event delivery
      · There is no way to fire a sample event at anything. Searched for 'test event', 'send test', 'sample event', 'ping event' across apps/, packages/ and docs/ — nothing. Test-mode API keys are sandboxed for completions and runs (apps/worker/src
      → Add POST /api/webhooks/:id/test in apps/worker/src/index.ts that sends a signed `webhook.test` event through the normal delivery path and returns the response status and redacted body inline, so registration can be proven from the settings UI in one click. Separately, make a gk_test key on GET /v1/p
- [~] Repeated failure alerts
      · The coalescing machinery for repeated failures is built and tested in the worker; nothing emits a delivery-failure alert, and no human surface displays notifications at all. Built: dedupeKeyFor keys on recipient+kind+subject so the same thi
      → Emit the kind that already exists: when an endpoint's consecutive-failure counter in webhook_endpoints crosses a threshold (e.g. 5), call notify() from apps/worker/src/notify.ts with kind 'integration_failure' and subject = endpoint id, so apps/worker/src/notification-store.ts:183 collapses the repe
- [☐] Endpoint pause and resume
      · Nothing delivery-shaped can be paused and resumed. API keys can be revoked outright (DELETE /api/keys/:id, apps/worker/src/index.ts:3004) or rotated with a grace window (index.ts:2941) — neither is a pause. The only enabled/disabled flag in
      → Give webhook_endpoints an `enabled` column plus `paused_at`/`paused_reason`, a PATCH /api/webhooks/:id route in apps/worker/src/index.ts that toggles it, and a toggle in the settings webhook section. Have the delivery loop skip a disabled endpoint the way startVerdict refuses a disabled automation (
- [~] Secret-redacted delivery logs
      · The redactor is real, wired and hard-tested, but there is no delivery log for it to protect. redactSecrets (apps/worker/src/redaction.ts) is wired in exactly three places — outbound requests and upstream error excerpts in guardedFetch (apps
      → When webhook delivery rows are written in the new apps/worker/src/webhook-store.ts, pass every stored string — request body excerpt, response body excerpt, error message — through redactSecrets from apps/worker/src/redaction.ts in the redact-then-truncate order used at apps/worker/src/net-policy.ts:

## 47. INTEGRATIONS AND CREDENTIAL MANAGEMENT  —  40%   ✓1 ~14 ☐5

- [☐] Integration catalog
      · There is no catalog of integrations anywhere. apps/web/src/routes/settings.tsx:506-510 is the entire "Connections" section and it hard-codes one child, <RobloxKeyPanel/>. apps/web/src/lib/settings-search.ts:34-56 registers 12 settings, exac
      → Create apps/worker/src/integrations.ts exporting a single INTEGRATIONS array (id, name, provider, what it does, which scopes it can request, whether it is connected for this user) and serve it at GET /api/integrations in apps/worker/src/index.ts next to the /api/me/roblox-key routes at line 2376. Th
- [~] Integration capability descriptions
      · Descriptions exist and are good: apps/web/src/lib/roblox-key.ts:46-86 gives every Open Cloud scope a title, a consequence sentence and an `undoable` flag, rendered at apps/web/src/components/roblox-key-panel.tsx:190-203. THE HALF THAT IS MI
      → Two changes. (1) In apps/web/src/lib/roblox-key.ts:46-86 add an `implemented: boolean` field to ScopeExplanation, set it true only for 'asset:write', and in apps/web/src/components/roblox-key-panel.tsx:192 either hide unimplemented scopes or label them 'not used yet' — a checkbox that grants real ac
- [☐] Organization integration installation
      · There are no organizations. docs/design/TENANCY.md records the schema as flat (profiles → projects, owner_id) and ends with the owner's decision; the checklist line itself records that option 3 (single-user with per-project sharing) was cho
      → Nothing to build: this is a recorded not-planned item, not an unfinished one. If the tenancy decision is ever reversed, the work is to add an owner_scope ('user'|'org') plus owner_id pair to the user_credentials table in apps/worker/src/user-credentials.ts:158-170, change every query in that file fr
- [☐] Project integration binding
      · The one integration credential is account-wide with no project dimension: apps/worker/src/user-credentials.ts:158-170 declares `primary key (user_id, provider)` and every query in the file (lines 240, 264, 288) filters on user_id alone. The
      → Add a nullable `project_id` column to the user_credentials table in apps/worker/src/user-credentials.ts:158-170 and a project-scoped lookup order in useRobloxCredential (apps/worker/src/user-credentials.ts:286): prefer a credential bound to the calling project, fall back to the account-wide one, and
- [☐] OAuth authorization flows
      · No OAuth anywhere for any integration. Grepped case-insensitively for oauth, authorization_code, redirect_uri, client_secret and pkce across apps/worker/src, apps/web/src and packages/shared/src: the only hits are apps/web/src/lib/auth-flow
      → If integrations are to grow beyond one, add apps/worker/src/oauth.ts with a start route (GET /api/integrations/:id/authorize — mints a state nonce, stores it against the user, redirects to the provider) and a callback route (GET /api/integrations/:id/callback — verifies state, exchanges the code, se
- [✓] Explicit requested scope display
      · apps/web/src/components/roblox-key-panel.tsx:190-203 renders every Open Cloud scope as a checkbox with its title, its consequence and, where the effect cannot be reversed, a caution — the words come from apps/web/src/lib/roblox-key.ts:46-86
- [~] Integration account identification
      · The account is DISPLAYED but never VERIFIED. apps/web/src/lib/roblox-key.ts:164-173 renders 'Connected to Roblox account <id>, key ending <hint> — last used <date>', fed by apps/worker/src/user-credentials.ts:238 which returns creator id, c
      → In apps/worker/src/index.ts:2376 (PUT /api/me/roblox-key), after putRobloxCredential succeeds, call Roblox `GET https://apis.roblox.com/cloud/v2/users/{id}` with the submitted key and store the returned display name alongside roblox_creator_id (add a `creator_name` column in apps/worker/src/user-cre
- [~] Connection health checks
      · THE CLASSIC SHAPE THIS AUDIT IS LOOKING FOR — fully built, fully tested, wired to nothing. apps/web/src/lib/studio-connection.ts:104-163 implements lastSeenLabel, latencyLabel, queueLabel and linkDetail (place mismatch, last poll, round-tri
      → In apps/web/src/lib/use-project-socket.ts:401-410 keep msg.lastSeenAt, msg.queuedOps, msg.place and msg.placeMismatch on the studio state object, and at line 727 replace `case 'pong': break;` with `setStudio(s => ({...s, rttMs: Date.now() - msg.t}))` using the echoed `t`. Then call linkDetail(state,
- [~] Credential expiration visibility
      · For Golem's own API keys the expiry is captured and served but never displayed: apps/worker/src/api-keys.ts:523-535 (publicKeyShape) returns expires_at, last_used_at and revoked_at as ISO strings, GET /api/keys serves them at apps/worker/sr
      → Add an `expires_at` column to the user_credentials table in apps/worker/src/user-credentials.ts:158-170, an optional date field to the connect form in apps/web/src/components/roblox-key-panel.tsx (Roblox shows the expiry when the key is created), and surface it in describeStored at apps/web/src/lib/
- [~] Credential refresh handling
      · The existing ✓ is a keyword false positive: packages/corpus/src/intake/security.test.mjs:299 ('.ROBLOSECURITY handling is credential theft') is a Luau malware scanner asserting that a cookie-stealing script is classified as credential-theft
      → Correct the checklist citation first — it points at a malware-scanner test. Then either mark this not-applicable while the only integration is an API key, or, if Roblox OAuth is adopted (see 'OAuth authorization flows'), add a refresh_token column and a refresh-before-use step at the top of useRoblo
- [~] Encrypted credential storage
      · apps/worker/src/user-credentials.ts:108-116 seals with AES-GCM under a fresh random 96-bit IV per record, stored as `<b64 iv>.<b64 ciphertext>`; apps/worker/src/user-credentials.ts:92-106 REFUSES to store at all when CREDENTIAL_KEY is absen
      · REFUTED: The code and tests are exactly as described (sealSecret with a fresh 12-byte IV at user-credentials.ts:108-115; wrappingKey refusing at :93-105) and all 30 cases in apps/worker/tests/user-credentials.test.mjs + asset-imp
- [~] Credential rotation
      · Both credentials rotate. Integration key: apps/web/src/components/roblox-key-panel.tsx:225 renders 'Replace key' when one is already connected, PUT /api/me/roblox-key (apps/worker/src/index.ts:2376) upserts, and the upsert's own clause rese
      · REFUTED: Both halves fail the reachability test. (a) Roblox key: 'Replace key' at roblox-key-panel.tsx:225 only renders when `credential` is non-null, and the replacing PUT goes through the same putRobloxCredential that cannot st
- [~] Credential revocation
      · Two halves, each missing a different piece. Golem API keys: revocation is complete and enforced — apps/worker/src/api-keys.ts:508 (revokeApiKey), DELETE /api/keys/:id at apps/worker/src/index.ts:3004, refused at apps/worker/src/api-keys.ts:
      → Build the missing screen: add apps/web/src/components/api-keys-panel.tsx listing GET /api/keys (id, name, mode, scopes, projects, created, expires, last used) with a Revoke button calling DELETE /api/keys/:id and a Rotate button calling POST /api/keys/:id/rotate, mount it as a new <Row id="api-keys"
- [~] Integration disconnect
      · apps/web/src/components/roblox-key-panel.tsx:116-123 renders a Disconnect button, wired through deleteRobloxKey in apps/web/src/lib/api.ts:862-863 to DELETE /api/me/roblox-key at apps/worker/src/index.ts:2398, which calls deleteRobloxCreden
      · REFUTED: Every file:line is accurate — the Disconnect button (roblox-key-panel.tsx:116-123), deleteRobloxKey (api.ts:862-863), DELETE /api/me/roblox-key (index.ts:2398), deleteRobloxCredential (user-credentials.ts:262), and the t
- [~] Disconnect impact preview
      · The existing ✓ cites apps/worker/tests/membership-lifecycle.test.mjs:648, which is a preview of what a departing PROJECT MEMBER holds — a different feature in a different section; it says nothing about disconnecting an integration. What the
      → Add GET /api/me/roblox-key/impact in apps/worker/src/index.ts next to the DELETE at line 2398, returning the count of assets imported into this creator id and the last-used timestamp, and render it inside the disconnect confirmation in apps/web/src/components/roblox-key-panel.tsx:116-127 as 'Apple h
- [~] Least-privilege credential usage
      · The scope check happens where the key is handed out, not at the call site: apps/worker/src/user-credentials.ts:286-300 (useRobloxCredential) takes a required scope and refuses with 'the connected Roblox key was not declared with the <scope>
      · REFUTED: The mechanism is real and correctly described: useRobloxCredential (user-credentials.ts:286-300) checks the scope before openSecret at :302 and before the last_used_at write at :308, asset-import.ts:236 asks for exactly 
- [~] Per-integration activity history
      · The only per-credential trace is a single overwritten timestamp. apps/worker/src/user-credentials.ts:308-310 does `update user_credentials set last_used_at = ?` on every successful handover, surfaced as 'last used 2026-09-15' in apps/web/sr
      → Two changes. (1) Call securityNotice (apps/worker/src/index.ts:2819) from the PUT and DELETE handlers at apps/worker/src/index.ts:2376 and 2398 — 'A Roblox account was connected/disconnected', subject `roblox:<creatorId>` — so the integration produces the same trail API keys already do. (2) Build th
- [~] Integration error diagnostics
      · The diagnostics are produced and then have nowhere to go. apps/worker/src/roblox-upload.ts:165-172 deliberately returns Roblox's error body verbatim (truncated to 400 chars) so that 'the key lacks a scope' stays distinguishable from 'the cr
      → Add a per-integration error mapper in apps/web/src/lib/roblox-key.ts that turns the worker's three credential messages plus a Roblox 401/403 body into a titled explanation with a next action, and render it in place of the bare toast at apps/web/src/components/roblox-key-panel.tsx:56. Add an 'integra
- [☐] Revoked-access recovery guidance
      · Nothing tells a user what to do when Roblox has revoked or expired the key underneath them. Searched: apps/web/src/lib/roblox-key.ts has four states (loading/failed/none/connected — line 156) and none of them is 'the stored key no longer wo
      → Add a fifth state to apps/web/src/lib/roblox-key.ts:156, 'rejected', entered when the health check (see 'Connection health checks') or an import returns 401/403 from Roblox, and give describeStored at line 164 a branch that says: 'Roblox is refusing this key — it was revoked or it expired. Create a 
- [~] Prevention of credential exposure in AI context
      · Most of this is genuinely built and tested. The stored key is write-only from the outside and never enters a prompt — apps/worker/src/user-credentials.ts:238 returns a fingerprint and last-four only, asserted by apps/worker/tests/user-crede
      → In apps/worker/src/do/session.ts:2268, move the `verdict.action === 'allow'` early return to AFTER handling disclosures: when verdict.disclosures is non-empty, recordEvent it and broadcast a non-blocking notice to the client carrying verdict.signals.find(s => s.code === 'secret_in_prompt').detail, t

## 48. PRIVACY AND DATA LIFECYCLE  —  25%   ✓0 ~10 ☐10

- [~] Personal data inventory
      · apps/worker/src/user-export.ts:30-98 is a real, column-by-column inventory of 7 tables (every column either exported or withheld with a stated reason), and infra/supabase/tests/export-completeness.mjs:83-115 audits it against a live Postgre
      → Extend apps/worker/src/user-export.ts's USER_EXPORT to cover studio_pairings, waitlist, project_members and membership_events, and add a second exported constant (e.g. NON_POSTGRES_STORES) naming every other store that holds user data — SessionDO messages/checkpoints, AdminDO events, D1 memory_entri
- [~] Data purpose documentation
      · Two served pages state per-category purposes: apps/site/src/pages/privacy.astro:26-40 ('What we collect', each item with why) and apps/site/src/pages/docs/privacy-and-data.astro:23-31 ('What Apple stores, and why'); tests/e2e/landing.spec.t
      → Edit apps/site/src/pages/privacy.astro and apps/site/src/pages/docs/privacy-and-data.astro: add rows for (1) the encrypted Roblox Open Cloud key (purpose: uploading assets to the user's own account; stored AES-GCM in D1, never returned), (2) the analytics event log (purpose: operations; content: use
- [~] User-visible privacy settings
      · Real controls exist and are reachable: the training opt-in switch at apps/web/src/routes/settings.tsx:605-624 (writes profiles.training_opt_in via RLS, allowed by infra/supabase/migrations/0001_init.sql:119), the Roblox key panel at setting
      → Add a memory_mode control (auto / review / off) to the Privacy section of apps/web/src/routes/settings.tsx (user scope) and to apps/web/src/components/ws/instructions-panel.tsx (project scope), saving via the existing savePreferences(scope, scopeId, { memory_mode }) in apps/web/src/lib/api.ts:361 — 
- [☐] Required consent recording
      · The signup form at apps/web/src/routes/auth-pages.tsx:302-338 collects email and password only — no link to /terms or /privacy, no acceptance checkbox, nothing recorded. public.profiles (infra/supabase/migrations/0001_init.sql:5-12) has no 
      → Add a migration infra/supabase/migrations/0007_consent.sql creating public.consents (user_id uuid references profiles(id) on delete cascade, kind text check (kind in ('terms','privacy')), version text not null, accepted_at timestamptz not null default now(), primary key (user_id, kind, version)) wit
- [☐] Optional analytics consent controls
      · The worker records an analytics event carrying the raw Supabase user id on EVERY /api/* request (apps/worker/src/index.ts:355-372, actorId at :362, plus an error event at :371), flushed to AdminDO and kept 30 days / 5000 rows (apps/worker/s
      → Add 'analytics_opt_out' to PREFERENCE_KEYS in apps/worker/src/preferences.ts:32-56 (boolean, layered like the rest), read it in the /api/* middleware at apps/worker/src/index.ts:355-372 and, when set, either skip recordEvent entirely or pass actorId: null so the event stays a service-wide counter; e
- [~] Consent withdrawal
      · The one consent the product can take can be revoked from the same control it was given at: apps/web/src/routes/settings.tsx:274-283 mutates training_opt_in in both directions and confirms with 'Opted out — your work stays fully private.' Wh
      → Once the consents table from 'Required consent recording' exists, make withdrawal write a row rather than flip a boolean: in apps/web/src/routes/settings.tsx:274-283 insert a consent row with withdrawn_at set instead of only updating profiles.training_opt_in, so the history survives; and add the cor
- [~] User data export
      · Two exports exist and are reachable by a person: the per-project transcript, GET /api/projects/:id/export (apps/worker/src/index.ts:1171-1187, rendered by apps/worker/src/export.ts, ownership and auth-exemption both tested at apps/worker/te
      → Add GET /api/me/export to apps/worker/src/index.ts that iterates USER_EXPORT from apps/worker/src/user-export.ts: for each store:'postgres' table, select exactly spec.fields where ownerColumn = the caller's id using the caller's JWT through supa.ts (so RLS applies); for the store:'d1' api_keys row, 
- [☐] Organization data export
      · No organization export exists: there is no organizations table in any of the 6 files under infra/supabase/migrations, and the only org-shaped thing in the tree is the memory scope (memory_org_members in apps/worker/src/memory-store.ts:1047,
      → No code work intended: the owner descoped organizations on 2026-09-15 (docs/design/TENANCY.md). The correct action is to strike this line from docs/backlog/CHECKLIST-V2.md along with the other 76 organization/workspace/seat items, not to build it. If orgs ever return, an org export would follow the 
- [☐] Export identity verification
      · Both existing export routes are gated by ordinary bearer-JWT auth plus ownership and nothing more: apps/worker/src/index.ts:1171 calls withOwnedProject, index.ts:1077 calls memoryScopeAccess, and apps/worker/tests/export.test.mjs:191 assert
      → Add 'export-data' to SENSITIVE_ACTIONS in apps/web/src/lib/auth-flows.ts:376 with a WHY string in apps/web/src/components/reauth-dialog.tsx:17-22, and gate the export buttons (downloadExport in apps/web/src/routes/dashboard.tsx and the new /api/me/export button in settings.tsx) behind ReauthDialog t
- [☐] Export availability expiration
      · Neither export produces a stored artefact or a link that could expire: apps/worker/src/index.ts:1171-1187 and :1077-1090 both stream the bytes synchronously in the response with Content-Disposition attachment (the memory one sets Cache-Cont
      → This only becomes real once the account-wide export exists. When adding GET /api/me/export to apps/worker/src/index.ts, if it is made asynchronous (job writes a bundle to KV), write it with expirationTtl of 72 hours exactly as apps/worker/src/audio-store.ts:91 does, record expiresAt inside the store
- [☐] Account deletion request
      · There is no account deletion anywhere, and three published pages promise it. The complete route list in apps/worker/src/index.ts (all routes are defined there; no other src file registers one) contains no account/user delete — only /api/pro
      → Build the path end to end. (1) apps/worker/src/index.ts: add POST /api/me/delete that, for the caller's id, purges every SessionDO for their projects (the same https://do/purge the project route uses), deletes their D1 rows (memory_entries where scope='user' and scope_id=userId and where scope='proj
- [☐] Account deletion status
      · Nothing tracks a deletion because no deletion exists. There is no deletion_requests/erasure table in infra/supabase/migrations (10 tables, none related), no status field on profiles (0001_init.sql:5-12), no route in apps/worker/src/index.ts
      → When the deletion route above is built, make it a record rather than a fire-and-forget: create public.deletion_requests (user_id uuid primary key references profiles(id), requested_at timestamptz not null default now(), scheduled_purge_at timestamptz not null, completed_at timestamptz, stores_done t
- [☐] Organization deletion request
      · No organizations exist to delete: no organizations table in infra/supabase/migrations, and docs/design/TENANCY.md records the owner's 2026-09-15 decision that organizations and workspaces are not being built. The only org-shaped rows are me
      → No code work intended — descoped on 2026-09-15 per docs/design/TENANCY.md. Strike the line from docs/backlog/CHECKLIST-V2.md rather than building it. (If the org memory scope stays, the one real gap is that nothing deletes a whole memory scope; that is covered by the scope-purge fix under 'Deletion 
- [☐] Retention policy configuration
      · Every retention window is a hard-coded constant with no configuration surface, and they are scattered: apps/worker/src/do/admin.ts:14-16 (5000 events / 30 days), apps/worker/src/automation-store.ts:40 (RETAIN_RUNS_MS 90 days), apps/worker/s
      → Create apps/worker/src/retention.ts exporting one RETENTION object that names every window in one place (events, automationRuns, notificationsRead, notificationsUnread, quotaLedger, spend, checkpointsKept, imageTtl, audioTtl), have each of the files listed above import from it instead of declaring i
- [☐] Conversation retention controls
      · Chat is kept forever and there is no control over it. SessionDO never prunes the messages table — the only delete is the edit-resend truncation at apps/worker/src/do/session.ts:1499 (delete from messages where created_at >= the edited messa
      → Add 'conversation_retention_days' to PREFERENCE_KEYS in apps/worker/src/preferences.ts:32-56 (validated like ttlDays in memory-store.ts:218-222: a finite number 1..730, or null for keep-forever, narrowing across scopes like memory_mode does at preferences.ts:399-407); in apps/worker/src/do/session.t
- [~] Artifact retention controls
      · The retention RULES exist and demonstrably run: checkpoints keep the newest 25, enforced at write time inside the same transaction that inserts one (apps/worker/src/do/session.ts:3333-3337, deleting both checkpoint_chunks and checkpoints); 
      → Two changes. (1) State the cap: add a line to apps/site/src/pages/docs/credits-and-limits.astro and to the checkpoint list header in apps/web/src/components/ws — 'Apple keeps your 25 most recent checkpoints' — importing the number from the worker constant rather than retyping it, the way apps/web/te
- [~] Log retention controls
      · One log is genuinely governed: AdminDO evicts events by age and by row count and RECORDS the eviction so a truncated window renders as truncated rather than as a quiet day (apps/worker/src/do/admin.ts:13-16 constants, prune() at :43-53, eve
      → Give the three sweeps a caller. Add a cron trigger to apps/worker/wrangler.jsonc ({"triggers":{"crons":["0 3 * * *"]}}) and a scheduled(event, env, ctx) export in apps/worker/src/index.ts that awaits purgeExpired(env), pruneNotifications(env) and pruneExecutions(env, Date.now()) and records the coun
- [~] Deletion propagation to derived indexes
      · Project deletion propagates through two stores and stops. apps/web/src/routes/dashboard.tsx:304-307 purges the SessionDO first (POST /api/projects/:id/purge → do/session.ts:1153-1163, which closes sockets, deletes the alarm and calls storag
      → Extend the purge into a real fan-out. In apps/worker/src/index.ts, change the POST /api/projects/:id/purge handler so that after the DO purge it also runs, against c.env.CORPUS: delete from memory_entries where scope='project' and scope_id=?; delete from notifications where project_id=?; delete from
- [~] Backup deletion lifecycle documentation
      · The claim is published twice — apps/site/src/pages/privacy.astro:73 ('Residual copies in backups expire on the backup rotation schedule (at most 30 days)') and apps/site/src/pages/docs/privacy-and-data.astro:67 ('backup copies expire within
      → Write docs/design/BACKUPS.md stating, per store, the real regime: Supabase Postgres (which plan, daily backup retention, whether PITR is on), Cloudflare Durable Object storage (point-in-time recovery window), D1 CORPUS (time-travel window), KV and Vectorize (no backups); then state for each how a de
- [~] Data processing and subprocessor disclosures
      · A disclosure exists and is served: apps/site/src/pages/privacy.astro:52-56 names Cloudflare and Supabase with what each processes, apps/site/src/pages/docs/privacy-and-data.astro:34-37 repeats it in plain language, and tests/e2e/landing.spe
      → Update the 'Who processes your data' section of apps/site/src/pages/privacy.astro:52-56 and the 'Where it lives' list of apps/site/src/pages/docs/privacy-and-data.astro:34-37 to add Stripe (purpose: subscriptions and credit purchases; data: email, billing identifiers, payment method held by Stripe n

## 49. APPLICATION SECURITY  —  75%   ✓12 ~6 ☐2

- [✓] Server-side input validation
      · Three enforced layers, each with a test that names it. (1) Tool arguments: apps/worker/src/tool-contract.ts:154 validateArgs — type/enum/bounds/unknown-key/forbidden-key checks, output built on a null prototype; 24 tests in apps/worker/test
- [✓] Output encoding
      · apps/web/src/lib/markdown.tsx:37 — model prose goes marked -> DOMPurify.sanitize with an explicit ALLOWED_TAGS/ALLOWED_ATTR allowlist and ALLOWED_URI_REGEXP /^(?:https?|mailto):/i (:44) before dangerouslySetInnerHTML (:50). Fenced code neve
- [~] Content security policy
      · A CSP exists on exactly two routes and on no HTML document. Present: apps/worker/src/index.ts:640 (generated image) and :701 (generated audio) both send "default-src 'none'; sandbox", asserted by apps/worker/tests/audio-route-live.test.mjs:
      → In apps/worker/src/static.ts, extend withSecurityHeaders (line 100) to set a Content-Security-Policy on HTML responses only (branch on the resolved Content-Type starting with text/html). Start with: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; 
- [✓] Cross-site request forgery protection
      · Defended by having no ambient credential to forge with, not by a token. The application sets no cookie anywhere — grep for Set-Cookie / document.cookie / SameSite / HttpOnly across apps/worker/src, apps/web/src, apps/site/src, packages/sdk 
- [~] Cross-origin access restrictions
      · The effective policy is deny-by-default, but nothing in the repository states, configures or tests it. There is no CORS code at all: grep for Access-Control-Allow-Origin, 'cors', or an OPTIONS/preflight handler across apps/worker/src return
      → Decide the policy explicitly and encode it. In apps/worker/src/index.ts, add a middleware before the auth middleware (around line 325) that reads the Origin header: for /api/* and /v1/*, answer OPTIONS preflights and emit Access-Control-Allow-Origin only for an explicit allowlist (the worker's own o
- [✓] Secure cookie configuration
      · Not applicable by architecture, and the absence is verified rather than assumed: grep for Set-Cookie, document.cookie, SameSite and HttpOnly across apps/worker/src, apps/web/src, apps/site/src and packages/sdk returns zero hits. Sessions ar
- [✓] Session fixation protection
      · For the one session this product mints itself — the Studio plugin pairing token — the token is server-generated, never client-chosen, and rotates on every re-authentication. apps/worker/src/index.ts:1638 mints it with crypto.getRandomValues
- [✓] Server-side request forgery protection
      · apps/worker/src/net-policy.ts — a host allowlist plus a per-hop egress gate, and it is the only way any tool reaches the network. guardedFetch (net-policy.ts:247) and fetchBinary (:394) refuse http:, URL credentials, IP literals in every sp
- [~] File upload content inspection
      · The one user-facing upload is inspected; the admin one is not. Done half: the memory JSON import (UI at apps/web/src/components/ws/instructions-panel.tsx:456, route at apps/worker/src/index.ts:1100) is parsed by parseImport (apps/worker/src
      → In apps/worker/src/index.ts:2764 (/api/admin/static-upload), validate the path the same way apps/worker/src/static.ts:42 does (reject control characters, '..', length > 512) and reject any `contentType` that is not in the MIME table at static.ts:6. Then add magic-byte verification for the types that
- [✓] Path traversal protection
      · Two stores, two guards, both tested. Static serving: apps/worker/src/static.ts:42 refuses control characters, '..' and paths over 512 chars, and wraps decodeURIComponent so malformed %-encoding is a 400 rather than a 500 — this is finding 7
- [✓] Command execution isolation
      · apps/worker/src/sandbox.ts:572 admitProgram is a single admission gate for all four runtimes (luau, node, python, roblox-spec) with a per-backend enforcement profile that declares which ceilings are actually kept and marks the unenforceable
- [~] Dependency vulnerability scanning
      · It runs, but it cannot fail and cannot tell a clean scan from a scan that never happened. .github/workflows/ci.yml:295-298 — "Dependency audit": `pnpm audit --audit-level moderate || echo "::warning::pnpm audit reported advisories"`. The `|
      → In .github/workflows/ci.yml replace the one-line step at :298 with a script that distinguishes the three outcomes: run `pnpm audit --audit-level moderate --json > audit.json`, capture `$?` in a variable, and then — exit 0 means clean; exit 1 means advisories found, so emit ::warning:: and print the 
- [✓] Secret scanning
      · scripts/secret-scan.py scans every blob on every ref (not just the working tree) against 11 vendor-prefixed patterns, fails closed on anything not listed in scripts/known-exposures.json, and fails when a register entry stops matching anythi
- [✓] Sensitive log redaction
      · One scanner, three consumers, all wired. apps/worker/src/redaction.ts defines 17 disclosure kinds with a per-rule confidence, compiled fresh per scan so a /g regex's lastIndex cannot make a second call miss. Consumers: the error log — apps/
- [~] Encryption in transit
      · The outbound half is enforced and tested; the inbound half is entirely delegated to the platform with no header and no test. Outbound: apps/worker/src/net-policy.ts refuses http: and never upgrades it — apps/worker/tests/net-policy.test.mjs
      → Add `out.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')` to withSecurityHeaders in apps/worker/src/static.ts (line 100) and to the /api/* response middleware in apps/worker/src/index.ts (line 325-329, beside the existing X-Content-Type-Options set). Add a test beside
- [~] Encryption at rest
      · The one high-value customer secret is encrypted by the application, not merely by the platform. apps/worker/src/user-credentials.ts:104-125 wraps a customer's Roblox Open Cloud key with AES-GCM under CREDENTIAL_KEY, with a fresh random 96-b
      · REFUTED: REFUTED on deployment. The code is real — user-credentials.ts:94-125 refuses without CREDENTIAL_KEY and otherwise AES-GCM-wraps with a fresh 12-byte IV, routes exist at index.ts:2376/2392/2398, the panel is mounted (rout
- [✓] Administrative access restrictions
      · apps/worker/src/index.ts:427 — every /api/admin/* request must present X-Admin-Key, compared by secretEquals (index.ts:420), a whole-length constant-time compare with a comment stating that no test in the repository can prove the timing pro
- [✓] Security configuration review
      · A real adversarial review exists and its conclusions are held in place by executable checks. docs/SECURITY.md records a four-reviewer audit of the deployed service (2026-08-30) in which every claimed finding was handed to an independent age
- [☐] Vulnerability reporting channel
      · Nothing anywhere invites or routes a security report. Searched: no SECURITY.md at the repository root (docs/SECURITY.md is an audit record, not a reporting policy, and GitHub only surfaces a root, .github/ or docs/ SECURITY.md as a policy —
      → Create SECURITY.md at the repository root stating: where to send a report (a dedicated address, e.g. security@ on the product domain, or apple.labs.app@gmail.com if no other mailbox exists), what to include, the acknowledgement target (e.g. 3 business days), that testing must stay on the reporter's 
- [☐] Security incident response procedures
      · The mechanisms exist; the procedure does not. Mechanisms found: a kill switch at apps/worker/src/index.ts:2420 POST /api/admin/kill-switch (checked inside the spend reservation, packages/evals/src/security.test.mjs:1881); a tested automatic
      → Write docs/INCIDENT-RESPONSE.md covering, in order: (1) severity ladder with an example per level, keyed to what this product can actually suffer — cross-tenant read, credential exposure, agent code execution in a customer's place, runaway spend; (2) containment actions with the exact command or rou

## 53. PRODUCT ANALYTICS  —  35%   ✓3 ~8 ☐9

- [~] Defined analytics event catalog
      · A catalog exists but it is an INFRASTRUCTURE catalog, not a product one. apps/worker/src/analytics.ts:258 defines EVENT_KINDS = ['request','model_call','error','build','audit'] as the runtime allowlist, with a typed interface per kind at an
      → Extend apps/worker/src/analytics.ts: add a sixth event kind 'lifecycle' to EVENT_KINDS (line 258) with interface LifecycleEvent { kind:'lifecycle'; step: string; actorId: string|null } where `step` is validated against an exported PRODUCT_STEPS allowlist (signup, email_verified, onboarding_complete,
- [✓] Event schema validation
      · apps/worker/src/analytics.ts:363 normalizeEvent is the single boundary: it refuses a non-object, an unknown kind (including a prototype key), an absent-or-unreadable timestamp and a missing required field, returning a typed RejectReason ins
- [☐] Registration funnel
      · Signup never touches the worker: apps/web/src/routes/auth-pages.tsx:255 calls supabase.auth.signUp directly from the browser, so no /api/* request is made and the request-log middleware at apps/worker/src/index.ts:344 never sees it. No reco
      → Two pieces. (1) Emit the events: add a worker route POST /api/lifecycle in apps/worker/src/index.ts (authed, so actorId is the JWT subject) that recordEvent({kind:'lifecycle', step}) for an allowlisted step, and call it from apps/web/src/routes/auth-pages.tsx after a successful supabase.auth.signUp 
- [☐] Email verification funnel
      · Searched for verify-email, email_verified, emailVerified, verifyEmail across apps/ (--include *.ts,*.tsx,*.mjs): zero hits. Verification is Supabase's: apps/web/src/routes/auth-pages.tsx:281 calls supabase.auth.resend and ConfirmEmailPage (
      → Emit two lifecycle events through the POST /api/lifecycle route described for the registration funnel: 'verification_sent' from apps/web/src/routes/auth-pages.tsx:281 (the resend handler and the initial signUp), and 'email_verified' from ConfirmEmailPage in the same file once supabase.auth.getSessio
- [☐] Onboarding completion funnel
      · The onboarding tour is entirely client-local: apps/web/src/lib/onboarding.ts:157 writeProgress persists {seen, dismissed} to window.localStorage (line 159) and nothing posts it anywhere — no fetch, no api.ts call. Confirmed no analytics cli
      → In apps/web/src/lib/onboarding.ts, have writeProgress (line 157) also fire-and-forget POST /api/lifecycle with step 'onboarding_step:<id>' on each newly seen step and 'onboarding_complete' when every TOUR_STEPS id is seen or the tour is dismissed. Add the matching funnel over those step labels in th
- [~] Studio pairing conversion
      · The two raw counters exist and reach a human: apps/worker/src/index.ts:1390 `count(c.env, 'pairing_create')` in POST /api/projects/:id/pairing, and index.ts:1666 `count(c.env, 'studio_paired')` after the plugin registers; both land in the A
      → Attribute the pairing completion: in apps/worker/src/index.ts:1666, after the plugin registers, recordEvent({kind:'lifecycle', step:'studio_paired', actorId: <the project owner resolved from the pairing code>, projectId}) — the claim route knows the project from the code even though the caller has n
- [~] First successful run activation
      · The feeding event is instrumented and durable but no activation metric is computed from it. apps/worker/src/do/session.ts:2420 writes one build event per run from the branch that ends it, carrying outcome, steps, opsApplied/opsFailed, durat
      → Add `export function activationRollup(events, opts:{now:number})` to apps/worker/src/analytics.ts that, per actorId, finds the earliest build event with outcome 'done' and the actor's earliest event of any kind, and reports the activated share plus a median time-to-first-success — returning unknown(
- [☐] First verified change activation
      · There is no 'verified change' concept anywhere in the event schema or the run loop. BuildEvent (apps/worker/src/analytics.ts:322-331) carries only outcome/steps/opsApplied/opsFailed/durationMs/neurons — no verification flag. Searched apps/w
      → In apps/worker/src/do/session.ts, at the point where the spec-runner/run_and_check verdict is settled for a run, recordEvent({kind:'lifecycle', step:'verified_change', actorId: agent.userId, projectId, runId: agent.msgId}) — only when the check actually passed, never on an unreadable verdict. Then c
- [☐] Trial conversion
      · Billing knows about trials but records nothing: apps/worker/src/billing.ts:60 ENTITLING_STATUSES includes 'trialing', billing.ts:89 defines the 'trialing' BillingState and billing.ts:161 maps Stripe status to it — but grep for recordEvent|a
      → In the Stripe webhook handler that updates subscription state (apps/worker/src/billing.ts, where status is written — see the `status: deleted ? 'canceled' : status` branch at billing.ts:312), recordEvent({kind:'lifecycle', step:'trial_started'|'subscribed', actorId: <the mapped user id>}) on the tra
- [☐] Paid conversion
      · Same gap as trial conversion, from the other end. Checkout (apps/worker/src/billing.ts:405-430) and the webhook that flips the subscription row (billing.ts:312) emit no analytics event — no recordEvent call exists in billing.ts at all. The 
      → Emit recordEvent({kind:'lifecycle', step:'subscribed', actorId}) from the checkout-completed branch of the Stripe webhook in apps/worker/src/billing.ts:312, and 'checkout_started' from the checkout-session creation at billing.ts:405. Expose funnelRollup(events, ['signup','checkout_started','subscrib
- [☐] Subscription retention
      · The only retention in the repo is ACTIVITY retention, not subscription retention: retentionRollup (apps/worker/src/analytics.ts:995) cohorts actors by the first day they produced any event and asks whether they produced another event on day
      → Record each subscription-state transition as an event in the Stripe webhook at apps/worker/src/billing.ts:312 — recordEvent({kind:'lifecycle', step:'sub_renewed'|'sub_lapsed'|'sub_cancelled', actorId}) — and add `export function subscriptionRetention(events, opts:{now:number})` to apps/worker/src/an
- [☐] Subscription cancellation reasons
      · Cancellation is delegated wholesale to Stripe's Billing Portal and no reason is ever captured on this side: apps/worker/src/billing.ts:348 'Downgrades and cancellations go to Stripe's Billing Portal rather than to anything written here', an
      → Add a cancellation-reason step in the app before the portal redirect: in apps/web/src/routes/usage.tsx's manage/downgrade handler, show a short reason picker (too expensive / not using it / missing feature / switching / other + free text) and POST it to a new worker route POST /api/billing/cancel-re
- [✓] Cohort retention analysis
      · apps/worker/src/analytics.ts:995 retentionRollup builds day cohorts keyed on each actor's first-seen day and a day-1..day-N retained/rate grid; it is wired into summarize() at analytics.ts:1183 and served by GET /api/admin/analytics at apps
- [✓] Feature adoption
      · apps/worker/src/analytics.ts:935 featureUsage returns one row per feature label (featureLabel at analytics.ts:593: the route for a request, the spend `feature` string for a model call, build:<outcome>, audit:<action>, error:<scope>) with ev
- [~] Collaboration adoption
      · Collaboration traffic is logged but only as generic route rows. The collab endpoints are registered at literal paths under /api/shared/:id/... (apps/worker/src/index.ts:4243-4256 explains why they are literal), so the request middleware (in
      → Emit lifecycle events at the membership transitions in apps/worker/src/membership.ts — 'collab_invited' where an invite row is created and 'collab_accepted' where a member becomes active — with actorId set to the invitee for the accept. Then add a collaborationAdoption rollup to apps/worker/src/anal
- [~] Run success trends
      · The success RATE exists; the TREND does not. apps/worker/src/analytics.ts:774 successRollup returns builds/modelCalls/requests as ok/failed/unclassified plus a rate whose denominator excludes unclassified outcomes (analytics.ts:747-757), it
      → In apps/worker/src/analytics.ts add `byDay: { day: string; builds: SuccessRollup }[]` to SuccessAnalytics (interface at analytics.ts:759) by grouping build events with dayKey(e.at) — the helper costBuckets already uses at analytics.ts:652 — and calling successOf per day, so a day with no classifiabl
- [☐] Verification success trends
      · Blocked by the same absence as 'First verified change activation': no verification outcome is ever recorded. BuildEvent (apps/worker/src/analytics.ts:322) has no verification field, and the verification code paths — apps/worker/src/spec-run
      → Add `verified: boolean | null` to BuildEvent in apps/worker/src/analytics.ts:322 (null when no check ran — never false, which would read as a failed check) and populate it at the build-event write in apps/worker/src/do/session.ts:2420 from the run's spec-runner verdict, adding the field to normalize
- [~] Cost per successful run
      · Both halves are in one event and nothing joins them. The build event carries the settled run cost and the outcome together — apps/worker/src/do/session.ts:2420 writes `neurons: agent.neuronsUsed ?? null` next to `outcome: reason`, and the n
      → Add `export function costPerRun(events)` to apps/worker/src/analytics.ts that sums the `neurons` of build events with outcome 'done' using sumMetric (analytics.ts:93) and divides by the count of those runs, returning unknown('no_readable_samples') when every run's neurons are null and reporting the 
- [~] Permission-aware internal analytics access
      · Gated and tested, but the permission model is one shared secret with no identity. GET /api/admin/analytics and /api/admin/logs sit behind the /api/admin/* middleware at apps/worker/src/index.ts:440-459, which compares the key in constant ti
      → Make the analytics gate identity-bearing: in apps/worker/src/index.ts:440, accept a user JWT whose profile carries is_admin (verified server-side against Supabase, not read from the client) as an alternative to X-Admin-Key, and set actorId on the audit recordEvent at index.ts:457 to that user id so 
- [~] Analytics data quality monitoring
      · The quality SIGNALS are unusually complete and are exposed; nothing monitors them. Computed: per-reason rejects at the isolate boundary (logStats, apps/worker/src/analytics.ts:541) and at the durable ingest (apps/worker/src/do/admin.ts:88);
      → Two changes. (1) Make the figure global: persist the reject/drop/lost counters into AdminDO alongside the events table (apps/worker/src/do/admin.ts, next to the eventsEvicted counter at admin.ts:50) by having flushEvents (apps/worker/src/analytics-sink.ts:38) send logStats() with each batch, and ret

## 50. AI SAFETY, ABUSE, AND SPENDING PROTECTION  —  73%   ✓12 ~5 ☐3

- [✓] User request rate limits
      · apps/worker/src/index.ts:401 — the auth middleware calls ipLimited(`user:${user.userId}`, 240) on every /api/* request and returns 429. Proven live, not statically: packages/evals/src/security.test.mjs:1391-1393 floods /api/me 300 times on 
- [☐] Organization request rate limits
      · No organization scope exists to rate-limit. Searched: `grep -rn "organization" infra/supabase/migrations` — the schema (0001_init.sql .. 0006_membership_lifecycle.sql) has profiles, projects, messages, checkpoints, studio_pairings, usage_ev
      → Blocked on a decision, not on code. If docs/design/TENANCY.md option 3 (single-user) stands, change this line in docs/backlog/CHECKLIST-V2.md to ✗ not-planned with the same wording the other two org items carry. If organizations are ever built, the limiter to extend is ipLimited() in apps/worker/src
- [✓] IP-based abuse controls
      · apps/worker/src/index.ts:312 ipLimited(), keyed on CF-Connecting-IP (which Cloudflare sets and a client cannot forge) at every unauthenticated or credential-guessing surface: admin-fail at :452, the unauthenticated studio claim at :1632 (10
- [~] Automated account abuse detection
      · Detection is built and wired but it is PER-PROJECT, not per-account, and it names no account. apps/worker/src/abuse.ts:159 scoreSubmission() scores burst / duplicate / near-duplicate / link-stuffing / character-flood / oversized and returns
      → Two changes. (1) apps/worker/src/do/session.ts:2269 — add `actorId: <the run's userId>` and `projectId` to the recordEvent({ kind: 'error', scope: 'chat:ingress', ... }) call so a refusal is attributable; the user id is already on the agent record as agent.userId. (2) Add per-account accumulation: a
- [~] Credential stuffing protection
      · The disclosure half is built and tested; the rate half does not exist. BUILT: account-existence is not leaked — apps/web/src/lib/auth-flows.ts signupOutcome/resetRequestOutcome/emailChangeOutcome answer uniformly, with apps/web/tests/auth-f
      → Two parts. (1) apps/web/src/lib/auth-flows.ts — add a branch to signInOutcome() that recognises Supabase's rate-limit error (status 429 / 'over_request_rate_limit') and returns a distinct outcome so apps/web/src/routes/auth-pages.tsx:177 can say 'too many attempts, wait a minute' instead of 'invalid
- [~] Free-tier exploitation controls
      · The bill is bounded; the free allowance is not tied to a person. BUILT: the free plan has a hard daily AND monthly ceiling (packages/shared/src/index.ts:1300 free: {creditsPerDay: 231, creditsPerMonth: 2_310}, enforced by quotaState() at ap
      → apps/worker/src/index.ts — add a gate in the /api/* auth middleware (beside the ipLimited call at line 401) that refuses run-starting routes when the verified JWT's email_confirmed_at claim is absent, returning a 403 with a code the web app can render as 'confirm your email to start building'; verif
- [✓] Prompt injection boundary enforcement
      · A per-run unguessable fence id, named in the system prompt as the only thing that makes a marker real. apps/worker/src/prompts.ts:188 untrustedContentRule(fenceId) writes the rule into the prompt and :312 throws if the id is empty ('an empt
- [✓] Tool output trust separation
      · One builder, one call site, and the bytes are never edited. apps/worker/src/do/session.ts:2192 `const fenced = fenceToolOutput({ fenceId: this.fenceIdFor(agent), tool: call.name, body: out.resultForLlm })`, pushed at :2200 as the tool-role 
- [✓] Retrieved content trust separation
      · Every retrieval path in a real run is a tool, so it lands inside the same fence, and the set of non-tool transcript writes is pinned closed. Retrieval tools: search_docs at apps/worker/src/tools.ts:2747 (Roblox docs corpus via searchDocsDet
- [✓] Tool argument validation
      · apps/worker/src/tool-contract.ts:154 validateArgs() is a real runtime contract — numbers must be typeof number AND Number.isFinite (so a NaN cannot defeat a later bounds check), enums are checked against an explicit list rather than by tabl
- [✓] Sandbox execution limits
      · apps/worker/src/sandbox.ts:572 admitProgram() is admission control plus a DECLARED ENFORCEMENT PROFILE: per runtime (luau/node/python/roblox-spec) and per backend it resolves wallMs/memoryMb/outputBytes/sourceBytes against floors and ceilin
- [✓] External destination controls
      · An allowlist that cannot fail open, re-checked on every redirect hop. apps/worker/src/net-policy.ts:78 compileHostPolicy() refuses the WHOLE list if any entry is `*` or a one-label suffix (a partially-applied allowlist is the dangerous outc
- [✓] Secret and personal data leakage checks
      · One scanner (apps/worker/src/redaction.ts:323 scanText, 17 kinds across secret and pii classes, each rule carrying a confidence) with four live consumers: the EGRESS gate (checkEgress at redaction.ts:455, called on every outbound hop includ
- [✓] Run duration limits
      · apps/worker/src/do/session.ts:272 RUN_WALL_MS gives clay/stone/rune a wall-clock ceiling, :303 runDurationVerdict() computes it with the clock as an argument, and it is ENFORCED at :1855 — checked before the step-limit branch on purpose, so
- [~] Per-run spending caps
      · There is no ceiling on what ONE RUN may spend. What is enforced is a per-INFERENCE-CALL cap — apps/worker/src/pricing.ts:93 MAX_NEURONS_PER_REQUEST = 1_200, refused in BudgetDO at apps/worker/src/do/budget.ts:274 with reason 'request_too_la
      → Two changes. (1) apps/worker/src/do/session.ts — add `const RUN_NEURON_CAP: Record<GolemMode, number>` beside STEP_LIMITS at line 208 (a sane start: clay 1,800 / stone 6,000 / rune 9,000, all under the 10,000 free daily allocation), and after `agent.neuronsUsed = (agent.neuronsUsed ?? 0) + res.neuro
- [✓] Daily spending caps
      · Two independent daily ceilings, both enforced. PER USER: apps/worker/src/quota-math.ts:62 quotaState() computes dailyLeft from PLAN_LIMITS[plan].creditsPerDay (packages/shared/src/index.ts:1300, free = 231/day) against a UTC-day-keyed ledge
- [✓] Monthly spending caps
      · Also two, and the pair is tested for which one bites first. PER USER: apps/worker/src/quota-math.ts:65 monthlyLeft from PLAN_LIMITS[plan].creditsPerMonth, and allowanceLeft = min(daily, monthly) — apps/worker/tests/quota-day-boundary.test.m
- [☐] Organization emergency execution stop
      · There is no organization to stop — same search as the org rate-limit item: no org or workspace table in infra/supabase/migrations, and docs/design/TENANCY.md records the absence. The capability DOES exist at the only two scopes that exist i
      → Blocked on the same decision as organization rate limits. If TENANCY.md option 3 stands, change this line in docs/backlog/CHECKLIST-V2.md to ✗ not-planned. If organizations are built, the stop to extend is apps/worker/src/do/budget.ts:163 — today `killed` is one flag on a singleton; it would need to
- [~] Suspicious usage review queue
      · The signals are emitted and stored; there is no queue, no attribution and no UI. EMITTED: apps/worker/src/do/session.ts:2269 records an error event with errorKind 'abuse_refused' or 'abuse_throttled' on every non-allow verdict, and :2198 re
      → Three steps. (1) apps/worker/src/do/session.ts:2269 — add actorId and projectId to that recordEvent call (see the Automated-account-abuse-detection fix; do it once, both items depend on it). (2) apps/worker/src/index.ts — add GET /api/admin/abuse beside the events route at :2129 that reads AdminDO e
- [☐] Abuse restriction appeal workflow
      · Nothing to appeal and nowhere to appeal it. There is no account-level restriction state at all: grep -rni 'suspend|banned|restrict|appeal' across apps and packages returns only project-membership suspension (apps/web/src/components/ws/membe
      → Order matters: an appeal workflow needs something to appeal, so build it after the restriction it answers. Minimum honest version, in two files. (1) apps/site/src/pages/terms.astro:78 — extend that paragraph with the actual path: that a suspended account is told the reason in-product, that replying 

## 51. HELP, SUPPORT, AND CUSTOMER EDUCATION  —  45%   ✓5 ~8 ☐7

- [✓] In-product help access
      · apps/web/src/components/layout.tsx:101 — the account popover renders a "Docs" menuitem to /docs (same origin; the SPA is mounted at /app per apps/web/src/lib/auth-flows.ts:286). layout.tsx:327 binds SHORTCUTS.help to the shortcuts dialog (a
- [~] Contextual help links
      · Exactly one context is wired: every in-app install affordance routes to /docs/plugin via STUDIO_PLUGIN_INSTALL_HREF (packages/shared/src/index.ts:1268), used by apps/web/src/components/ws/connect-studio.tsx:27 and apps/web/src/routes/dashbo
      → Add a `href`/`hrefLabel` to the failing states that have a doc behind them. In apps/web/src/lib/error-taxonomy.ts give kind 'upstream' and kind 'ours' `href: '/docs/troubleshooting'` and 'out_of_credits' a second link to '/docs/credits-and-limits'. In apps/web/src/components/ws/turn.tsx:209, when `i
- [☐] Searchable knowledge base
      · Searched: apps/site/src/layouts/DocsLayout.astro (lines 16–51 are a hand-maintained nav list; there is no input, no form, no search script); apps/site/astro.config.mjs (integrations = [sitemap()] only — no Pagefind or equivalent); grep -ri 
      → Build a search over Apple's own 11 docs pages. Add a build step that walks apps/site/src/pages/docs/*.astro, strips frontmatter and tags, and emits apps/site/public/docs-index.json (path, title, heading, text). Then add a search input to apps/site/src/layouts/DocsLayout.astro above the nav that fetc
- [✓] Getting-started tutorials
      · apps/site/src/pages/docs/getting-started.astro is a complete six-step signup-to-first-build walkthrough, linked from the docs index (apps/site/src/pages/docs/index.astro:18), the sidebar (DocsLayout.astro:20) and the site footer (apps/site/
- [✓] Studio connection troubleshooting
      · apps/site/src/pages/docs/troubleshooting.astro:15–90 documents every message the Studio panel can emit ("Invalid or expired code", "Could not reach Apple", "Session ended", version-too-old, the amber advisory, "Connection hiccup") plus the 
- [~] Billing troubleshooting
      · The in-product half is built and tested: apps/web/src/lib/billing-copy.ts:124 ('past_due' — "Your last payment did not go through… Update it to keep the plan") and :134 ('needs_action' — SCA, "Nothing has been charged"), each with an action
      → Create apps/site/src/pages/docs/billing.astro using DocsLayout, and add { href: '/docs/billing', label: 'Billing & payments' } to the 'Using Apple' section of apps/site/src/layouts/DocsLayout.astro:26. It must answer the four states apps/web/src/lib/billing-copy.ts already models — past_due (access 
- [~] Model error troubleshooting
      · Three model-failure paths produce real, actionable user sentences in apps/worker/src/do/session.ts: :1809 an inference failure past step 1 -> "The model dropped that step. Everything up to here is saved — send another message and I will pic
      → In apps/worker/src/do/session.ts:1826 stop interpolating the raw error into user-visible finalText. Route it through the same shape as the branch above it: set finalText to a fixed sentence ("That step failed on our side. Everything up to here is saved — send another message and I will pick up where
- [✓] Failed-run troubleshooting
      · apps/web/src/components/ws/turn.tsx:26 OUTCOME maps every non-'done' stopReason (incomplete/stopped/quota/error) to a sentence, rendered at turn.tsx:209 with a "Try again" button that is deliberately suppressed on a quota stop (turn.tsx:215
- [☐] Known issue directory
      · Searched every candidate surface. apps/site/src/pages/status.astro is a live probe of /api/health from the visitor's browser (status.astro:16) with a three-state legend at :50 — there is no incident list, no history, no per-subsystem breakd
      → Add a known-issues list to apps/site/src/pages/status.astro below the live probe, sourced from a checked-in data file (e.g. apps/site/src/data/known-issues.json with {id, title, impact, workaround, openedAt, resolvedAt|null}) so publishing one is a commit rather than a deploy of new markup. Render u
- [~] Support request submission
      · THE DEAD-SCHEMA PATTERN. infra/supabase/migrations/0001_init.sql:67 creates public.feedback (id, owner_id, kind check in ('feedback','bug','support'), content 1..5000, page, status, created_at), 0001_init.sql:141 and 0003_security_hardening
      → Add POST /api/feedback to apps/worker/src/index.ts (authenticated, near the /api/me routes) taking {kind:'feedback'|'bug'|'support', content:string<=5000, page:string} and inserting into public.feedback via apps/worker/src/supa.ts with owner_id from c.get('user'), returning {id}. Then add the submit
- [~] Support request categorization
      · The taxonomy is declared and never used. infra/supabase/migrations/0001_init.sql:70 — `kind text not null default 'feedback' check (kind in ('feedback','bug','support'))` — is the only categorization in the product, and apps/worker/src/user
      → Once POST /api/feedback exists, validate `kind` against the DB's three values server-side in apps/worker/src/index.ts and reject anything else with 400 (the CHECK constraint would otherwise surface as an opaque 500). In the web submit dialog, present the three as a labelled radio group with plain-la
- [~] Support request status
      · Schema-only, and the checklist's [✓] is a false positive. infra/supabase/migrations/0001_init.sql:73 declares `status text not null default 'open' check (status in ('open','closed'))`, and apps/worker/src/user-export.ts:82 deliberately EXCL
      → After submission exists, give the submitter the status back: have GET /api/feedback (new, in apps/worker/src/index.ts) return the caller's own rows (id, kind, content, status, created_at) under the existing 'own feedback read' RLS policy, and list them in the submit dialog so a user can see whether 
- [☐] Support conversation history
      · There is no thread model anywhere. public.feedback (infra/supabase/migrations/0001_init.sql:67) has no parent_id, thread_id, reply or author column — it is a single flat row per report with no way to attach a response. I checked all six mig
      → This needs a thread model, not a column. Add a migration infra/supabase/migrations/0007_support_threads.sql creating public.support_messages (id uuid pk, request_id uuid references public.feedback(id) on delete cascade, author_id uuid null, from_staff boolean not null default false, body text not nu
- [☐] User-approved diagnostic attachment
      · Nothing anywhere collects a diagnostic bundle, asks the user's permission, or attaches one to anything. The nearest capability is built and orphaned: GET /api/projects/:id/studio/diagnostics (apps/worker/src/index.ts:1451 -> apps/worker/src
      → Surface the existing endpoint and make attaching it an explicit choice. Add fetchStudioDiagnostics(projectId) to apps/web/src/lib/api.ts calling GET /api/projects/${id}/studio/diagnostics, and render it in a 'Connection details' disclosure inside apps/web/src/components/ws/connect-studio.tsx (visibl
- [✓] Diagnostic secret redaction
      · apps/worker/src/redaction.ts is one scanner with an explicit DISCLOSURE_KINDS vocabulary (redaction.ts:42) and a per-rule confidence field so the log's wide net and the egress gate's narrow one cannot be collapsed. It is wired into four liv
- [☐] Support identity verification
      · No support flow exists, so nothing verifies a requester, and there is no operator-side tool to verify one either. Searched: apps/worker/src/index.ts's /api/admin/* block (lines 2095–2801) has analytics, logs, stats, model-test, models, mode
      → Make identity structural rather than claimed: the support submission route added for Support request submission must take owner_id from the verified JWT (c.get('user') in apps/worker/src/index.ts) and never from the request body, so every stored request is already attributable. For the email channel
- [☐] Support escalation routing
      · Nothing routes, queues, prioritises or escalates. There is no support request to escalate (see Support request submission), no severity or priority field on public.feedback (infra/supabase/migrations/0001_init.sql:67-75), no on-call or owne
      → Once requests are stored, add routing as a stored decision, not a convention: extend public.feedback with `priority text not null default 'normal' check (priority in ('normal','urgent'))` and `assignee text null` in a new migration, set priority='urgent' server-side in the POST /api/feedback handler
- [~] Plan-specific support expectations
      · Exactly one plan says anything about support, and the page built to prevent that omission omits it. packages/shared/src/index.ts:1398 gives Enterprise the highlight 'Direct support' (and blurb :1396 '…their own limits, terms and support nee
      → Add a support row to PLAN_FEATURES in packages/shared/src/index.ts (after the 'Invoicing and negotiated terms' entry at :1527): { id: 'support', label: 'Support', note: '…', values: { free: 'Email, best effort', builder: 'Email', studio: 'Email', enterprise: 'Direct support' } }. It renders automati
- [~] Feedback submission
      · Same dead schema as Support request submission, and the column layout shows an in-app widget was designed and never built: public.feedback has `page text` (infra/supabase/migrations/0001_init.sql:72) — a field that only makes sense for a fo
      → Covered by the same route and dialog as Support request submission: POST /api/feedback in apps/worker/src/index.ts inserting {owner_id, kind, content, page} into public.feedback, and a dialog in apps/web opened from a new item in the account popover in apps/web/src/components/layout.tsx. The one thi
- [☐] Feature request tracking
      · No tracker, no board, no votes, no status. The product's only 'roadmap' is a different thing entirely: apps/worker/src/roadmap.ts generates a build plan for the user's own Roblox GAME, served at /api/projects/:id/roadmap (apps/worker/src/in
      → Decide the surface first — a public request board is a product, not a table. Minimum honest version: add 'feature' to the kind CHECK in a new migration and let the submit dialog file one, then publish what was actually accepted rather than a tracker: extend apps/site/src/pages/changelog.astro with a

## 52. OWNER AND ADMIN OPERATIONS  —  45%   ✓6 ~6 ☐8

- [✓] Administrative dashboard
      · apps/web/src/routes/admin.tsx:345 `AdminPage`, lazy-registered at apps/web/src/app.tsx:113 on path /admin, reachable from the account menu at apps/web/src/components/layout.tsx:120 and the command palette at layout.tsx:335, both gated on `p
- [☐] Organization lookup
      · No organization entity exists to look up. `grep -rn "create table" infra/supabase/migrations/*.sql` returns profiles, projects, messages, checkpoints, usage_events, feedback, studio_pairings, waitlist, project_members, membership_events — n
      → No work intended. If the decision in docs/design/TENANCY.md is ever reversed to option 1 or 2, this item becomes: add a `public.organizations` table plus RLS in a new infra/supabase/migrations/00NN_organizations.sql, then add `GET /api/admin/organizations/:id` in apps/worker/src/index.ts returning t
- [~] Account lookup
      · Searched: every `/api/admin/*` route in apps/worker/src/index.ts:2095-2801 (34 routes, none reads a profile); `getProfile` in apps/worker/src/supa.ts:210 is called only three times (index.ts:1984 for the caller's own /api/me, and index.ts:3
      → Add `app.get('/api/admin/account/:userId')` to apps/worker/src/index.ts in the admin block (after the `/api/admin/stats` route at :2133). It must call supaRest with the SERVICE key (not a user JWT — see apps/worker/src/supa.ts:210 for the shape) to read `/profiles?id=eq.<userId>&select=id,display_na
      · BUILT, AND HONESTLY PARTIAL. `GET /api/admin/account/:userId` (apps/worker/src/index.ts) returns quota state, billing, the credit ledger and this actor's usage window, and the Account lookup panel in apps/web/src/routes/admin.tsx calls it. WHAT IS STILL MISSING is the profile row itself — display_name, is_admin, created_at — because public.profiles is own-row-only under RLS (infra/supabase/migrations/0001_init.sql:115) and this worker holds SUPABASE_ANON_KEY with no service key in Env (apps/worker/src/env.ts); the audit's → assumed a service key that does not exist. Closing that needs either a new secret the owner must set with wrangler or a migration, so it was left. The response therefore carries `profile: {known:false, why}` and the panel prints the reason rather than showing a partial record as a whole one. A non-uuid is refused 400 instead of minting an empty QuotaDO that reads exactly like a real free account nobody has used. Tests: apps/worker/tests/admin-account-lookup.test.mjs (13 pass).
- [✓] Subscription lookup
      · The data exists and the operator cannot reach it. QuotaDO serves a complete subscription record at apps/worker/src/do/quota.ts:167-192 (`GET /billing` — plan, Stripe customerId, the full Subscription object with status/currentPeriodEnd/canc
      · DONE: the stored Stripe record — status, currentPeriodEnd, cancelAtPeriodEnd, customerId and subscriptionId — plus the full billing change history, per account, without a terminal. `GET /api/admin/account/:userId` in apps/worker/src/index.ts forwards QuotaDO's `/billing`; the Account lookup panel in apps/web/src/routes/admin.tsx renders it, saying 'Access ends' rather than 'Renews' when the cancel flag is set. Test: apps/worker/tests/admin-account-lookup.test.mjs 'the subscription record comes through whole'.
- [✓] Usage investigation
      · BUILT AND TESTED AT THE API, NOT REACHABLE FROM ANY UI, AND INCOMPLETE. What exists: `GET /api/admin/analytics?by=actorId` (apps/worker/src/index.ts:2095, dispatching to `breakdownBy` at apps/worker/src/analytics.ts:867 whose allowlist incl
      · DONE, in both directions, both reachable from /app/admin. WHO: a 'Heaviest accounts' table from `GET /api/admin/analytics?by=actorId` through the new `adminAnalytics` in apps/web/src/lib/api.ts, one click from the full record — calls with no actor are COUNTED separately rather than bucketed under a tenant-shaped key that would send an operator after an account that does not exist. WHAT: per-account calls, cost, neurons and success rate plus that account's runs and errors, filtered on actorId inside `GET /api/admin/account/:userId`. An account with nothing in the window returns null, not a row of zeroes, and a cut event window is reported as cut so the figures are never read as totals they are not. Tests: apps/worker/tests/admin-account-lookup.test.mjs (13 pass), apps/web/tests/admin-operations.test.mjs (16 pass).
- [✓] Credit transaction investigation
      · The ledger exists; nothing lets an operator read it. `ledger(day, kind, credits, created_at)` is created at apps/worker/src/do/quota.ts:26-29 and written on every charge at quota.ts:121, with a per-day rollup served by `GET /history` at quo
      · DONE: QuotaDO gained `GET /ledger` (apps/worker/src/do/quota.ts) returning INDIVIDUAL charges — id, day, kind, credits and a millisecond timestamp — newest first, with `total`, `truncated` and `retentionDays` beside them, so an empty list reads as "nothing in the last 35 days" rather than "never spent" and a capped read cannot pass as a short ledger. Surfaced as the 'Credit charges' table in the Account lookup panel. The 35-day horizon is now ONE constant shared by the prune and the answer, so the window a reader is told about cannot drift from the window that deletes rows. Test: apps/worker/tests/quota-ledger.test.mjs (8 pass).
- [~] Failed-run investigation
      · The full loop exists at the API and is exercised by real callers. LIST failed runs: `GET /api/admin/logs?kind=build` (apps/worker/src/index.ts:2121) returns BuildEvents carrying outcome ('failed'|'error'|'stopped'|'quota'|'incomplete'), pro
      · REFUTED: Refuted. The half the claim calls LIST does not exist in production, has no caller anywhere in the repository, and its named test cannot fail. NOT DEPLOYED. The live worker is buildSha e66fac3 (BUILD_SHA comes from `git 
- [~] Integration failure investigation
      · ONE INTEGRATION IS INVESTIGABLE, THE OTHERS ARE NOT. Built: `GET /api/admin/model-routing` (apps/worker/src/index.ts:2219) returns per-provider health — calls, ok, failed, last and median latency, and `lastError: {kind, at}` (index.ts:2246-
      → In apps/worker/src/index.ts:1779, replace the bare `console.warn` in the Stripe webhook's signature-failure branch with a `recordEvent({ kind: 'error', scope: '/api/billing/webhook', errorKind: 'stripe_signature', message: verdict.reason, fatal: false })` so the reason reaches /api/admin/logs (impor
      · PARTLY CLOSED: the → is done. apps/worker/src/index.ts no longer drops a webhook signature failure into `console.warn` — i.e. `wrangler tail`, live-only and unreadable by the owner — it records `{kind:'error', scope:'/api/billing/webhook', errorKind:'stripe_signature', fatal:false}`, so a signing secret rotated in Stripe and not here (every webhook refused, nobody upgraded or downgraded, paying customers sitting on free) is visible in /api/admin/logs on the first refusal. The reason is still withheld from the response so it cannot be used as a forging oracle. Test: apps/worker/tests/webhook-failure-visibility.test.mjs (5 pass). STILL OPEN: Discord and Roblox failures have no equivalent.
- [~] Abuse case review
      · DETECTION IS BUILT AND WELL TESTED; REVIEW IS NOT. Detection: `scoreSubmission` in apps/worker/src/abuse.ts, wired at apps/worker/src/do/session.ts:2259 inside `refuseAbusive`, with 'refuse' blocking the run and 'throttle' recorded-and-allo
      → First, in apps/worker/src/do/session.ts:2269 add `actorId: agent.userId` and `projectId: this.bind.projectId` to that recordEvent call (both are already in scope at that point — see the same two fields being passed at session.ts:2428), otherwise every downstream review surface is blind. Then add an 
      · PARTLY CLOSED: the first half of the → is done. apps/worker/src/do/session.ts passes `{actorId: me?.userId ?? null, projectId: bind.projectId}` into `refuseAbusive`, so every abuse finding now carries WHO — the socket's own verified sender, not the project owner, who is frequently not the person typing — instead of landing anonymous. Null stays null for a socket with no readable identity rather than becoming a placeholder. They are readable per account in the new Account lookup panel's Errors table. Test: apps/worker/tests/abuse-attribution.test.mjs (5 pass, each falsified). STILL OPEN: no cross-account abuse queue.
- [☐] Account suspension controls
      · Nothing can suspend an Apple ACCOUNT. `public.profiles` has exactly six columns — id, display_name, plan, is_admin, training_opt_in, created_at (infra/supabase/migrations/0001_init.sql:4-11) — with no status, suspended_at or disabled column
      → Add `suspended_at timestamptz`, `suspended_reason text`, `suspended_by uuid` to public.profiles in a new infra/supabase/migrations/00NN_account_suspension.sql, and make the RLS policies on projects/messages/checkpoints deny when the owner's profile is suspended. Then add `POST /api/admin/account/:us
- [☐] Account restoration controls
      · There is nothing to restore from — see 'Account suspension controls'; public.profiles carries no suspension state (infra/supabase/migrations/0001_init.sql:4-11) and no /api/admin route writes one (inventory pinned at packages/evals/src/secu
      → Add `POST /api/admin/account/:userId/restore` to apps/worker/src/index.ts alongside the suspend route described in the previous item, clearing suspended_at/suspended_reason/suspended_by and writing a restoration row to whatever audit table the suspension writes to. Model the behaviour on apps/worker
- [☐] Organization suspension controls
      · There is no organization to suspend. No organizations table exists in infra/supabase/migrations/*.sql, and the `/api/orgs*` routes at apps/worker/src/index.ts:872-887 are memory scopes rather than tenants (docs/design/TENANCY.md, 'THE NAMIN
      → No work intended — do not build this against the memory-scope `/api/orgs` routes, which are a different concept at a different level. If docs/design/TENANCY.md is ever revised to option 1 or 2, this becomes a POST /api/admin/organizations/:id/suspend in apps/worker/src/index.ts that bars every membe
- [☐] Manual credit adjustment with reason
      · No admin route grants or removes credits, with or without a reason. The only credit grant in the system is `https://do/grant-credits` (apps/worker/src/do/quota.ts:194), and its single caller is the Stripe webhook at apps/worker/src/index.ts
      → Add a `reason` parameter end to end. In apps/worker/src/do/quota.ts:194 extend the `/grant-credits` body to `{credits, eventId, reason, actor}` and pass reason through to `this.record(...)` at quota.ts:207 (which needs the new column from the 'Billing exception tracking' item). Then add `app.post('/
- [~] Billing exception tracking
      · THE EXISTING ✓ IS A FALSE POSITIVE: scripts/check-escape-hatches.mjs:1-20 is about ways a green test suite can be bought ('`|| true`, a `.skip`, a deleted test'), not about billing. WHAT ACTUALLY EXISTS: a change log. `billing_events(id, at
      → Add `reason text` and `actor text` columns to the billing_events table definition at apps/worker/src/do/quota.ts:30 and to the `record()` signature at quota.ts:82, and map them in the `/billing` response at quota.ts:184-191 (the BillingChange shape). Have `/set-plan` (quota.ts:127) accept and store 
- [✓] Administrative action confirmation
      · THE MECHANISM IS BUILT AND TESTED; NO ADMINISTRATIVE ACTION USES IT. Built: `confirmationFor()` / `confirmMatches()` / `canConfirm()` in apps/web/src/lib/confirm-model.ts, which grades ceremony from consequence ('none' | 'undo' | 'dialog' |
      · DONE: apps/web/src/lib/admin-actions.ts declares what each spend control actually costs and grades it through the existing `confirmationFor`; SpendPanel in apps/web/src/routes/admin.tsx routes every click through it instead of at the mutation. 'Stop all AI generation' (irreversible for anyone mid-build) and 'Double the caps' (the only control that raises the bill — the dialog shows worst case before and after) open a ConfirmDialog; 'Resume' and 'Halve the caps' deliberately do NOT, because a dialog on a reversible, free action is how an operator learns to click through the expensive one. An undeclared action falls to 'dialog', never 'none'. Tests: apps/web/tests/admin-operations.test.mjs (16 pass).
- [✓] Administrative action audit logs
      · THE LOG EXISTS AND IS TESTED; IT RECORDS NEITHER WHO ACTED NOR ON WHOM. Built: the admin gate writes an audit event on BOTH branches — refused at apps/worker/src/index.ts:450 and allowed at index.ts:457 — persisted through the durable sink 
      · DONE: the admin gate in apps/worker/src/index.ts now files `action` as "<METHOD> <route>", `subject` as the id the path addresses (new `pathSubject` in apps/worker/src/analytics.ts — routeLabel's twin, same id detection, null when nothing is addressed, so a populated subject can be trusted), and `actorId` as the VERIFIED operator behind the call — on BOTH the allowed and the refused branch. `subject` used to be `c.req.method`, so the stream was a column of the word GET. /api/admin/set-plan and /api/admin/quota-reset address a user through the BODY, which a middleware must not consume, so those two file their own row naming the account. Test: apps/worker/tests/admin-audit-trail.test.mjs (13 pass). CAVEAT: a caller presenting the shared key with no session records actorId null — deliberately; one static key has no identity of its own, which is 'Role-restricted administrative tools' below.
- [~] Role-restricted administrative tools
      · ONE BINARY ROLE ON THE UI, NO ROLE AT ALL ON THE API. UI side: `profile.is_admin` (column at infra/supabase/migrations/0001_init.sql:8) hides the nav entry (apps/web/src/components/layout.tsx:296) and the command-palette action (layout.tsx:
      → Introduce scoped admin credentials in apps/worker/src/index.ts. Replace the single `c.env.ADMIN_KEY` comparison at index.ts:446 with a lookup over a small set of keys, each carrying a scope list ('read' | 'billing' | 'danger'), still compared with `secretEquals` (index.ts:424) so the timing property
- [☐] Time-limited support access
      · No support-access concept exists anywhere. Searched apps/, packages/*/src and docs/design for: impersonat, 'act as', actAs, assumeUser, act_as, masquerade, sudo, 'on behalf of the user', supportAccess, operatorAccess, break-glass, breakglas
      → Build this only after 'Explicit user consent for support impersonation' exists — a time-limited grant with no consent step is worse than none. The shape: a `support_grants(id, user_id, granted_at, expires_at, reason, revoked_at)` table in a new infra/supabase/migrations file, a user-initiated `POST 
- [☐] Explicit user consent for support impersonation
      · There is no impersonation feature, so there is nothing to consent to. Same exhaustive search as the previous item (impersonat/actAs/act_as/masquerade/sudo/assumeUser/'on behalf'/supportAccess across apps/, packages/*/src, docs/design — zero
      → If impersonation is ever built, the consent step must come first and must be user-initiated. Add a 'Support access' section to apps/web/src/routes/settings.tsx (beside the existing privacy controls near settings.tsx:61) with an explicit, off-by-default control that POSTs to a new `/api/me/support-ac
- [☐] Complete support impersonation audit history
      · Nothing to audit, and the audit log that does exist could not record it anyway. No impersonation code exists (search terms and results as in the two previous items). The existing audit stream — AuditEvent at apps/worker/src/analytics.ts:331
      → Build only alongside the impersonation feature itself. Copy the shape of public.membership_events (infra/supabase/migrations/0006_membership_lifecycle.sql:111) into a `support_sessions` table: subject_id (the customer), actor_id (the operator), grant_id, started_at, ended_at, reason, and a child tab

## 54. LOGGING AND OBSERVABILITY  —  60%   ✓7 ~10 ☐3

- [✓] Structured application logs
      · A typed, validated event log, not ad-hoc strings. Five kinds declared at apps/worker/src/analytics.ts:258 (`request`, `model_call`, `error`, `build`, `audit`) with per-kind interfaces at analytics.ts:277-341; every write crosses a boundary 
- [~] Request correlation
      · Built and tested for the PUBLIC API only. apps/worker/src/index.ts:3026 mints/sanitises an id in the `app.use('/v1/*')` middleware, echoes it at :3029, puts it in every error body via public-api.ts:688, and carries it inward to Durable Obje
      → apps/worker/src/index.ts mints a request id only inside the `/v1/*` middleware at line 3026. Add a matching `app.use('/api/*', …)` registered BEFORE the request-log middleware at index.ts:342 that does `const requestId = sanitizeRequestId(c.req.header(REQUEST_ID_HEADER)) ?? newRequestId(); c.set('re
- [~] Run correlation
      · One id (`agent.msgId`) ties the model calls, the queued Studio ops and the run record together. Model traces: apps/worker/src/do/session.ts:1976 passes `runId: agent.msgId` into the gateway, which writes it onto every `model_call` event at 
      · REFUTED: The id threading is real in source (session.ts:1976 passes runId: agent.msgId into the gateway, gateway.ts:334 writes it onto every model_call, session.ts:2430 writes it onto the build event; msgId is crypto.randomUUID()
- [~] Tool invocation correlation
      · LIVE correlation exists: apps/worker/src/do/session.ts:2124 takes `toolId = call.id` and broadcasts it on both `tool_start` (:2157) and `tool_end` (:2167), and the reconnect snapshot replays it from `agent.uiTools` (:2170). A per-run trace 
      → Add a `tool_call` kind to `EVENT_KINDS` in apps/worker/src/analytics.ts:258 with an interface carrying `{tool: string, toolId: string, ok: boolean, durationMs: number | null}` on top of EventBase, validate it in `normalizeEvent` (analytics.ts:363), and emit it from the tool loop in apps/worker/src/d
- [✓] Studio operation correlation
      · An op id is minted by the worker, echoed verbatim by the plugin, and used to resolve the caller. apps/worker/src/do/session.ts:2852 mints `id: 'op_' + seq + '_' + base36(now)` on the `PendingOp` (packages/shared/src/index.ts:234) and regist
- [~] Provider request correlation
      · Every inference attempt is written as a `model_call` event carrying provider, model, feature, outcome, latency, tokens and neuron cost, attributed to the run, project and actor that caused it: apps/worker/src/gateway.ts:327-335 builds the t
      · REFUTED: The load-bearing sentence 'Every inference attempt is written as a model_call event' is false. `recordEvent({kind: 'model_call'})` exists at exactly ONE call site in the whole worker — gateway.ts:327, inside chat() — and
- [~] Distributed request tracing
      · The outbound half is built and tested; the receiving half ignores it. apps/worker/src/index.ts:258-266 `traced()` sets `X-Request-Id` on every worker-to-Durable-Object subrequest, and apps/worker/tests/public-api.test.mjs:1145-1167 proves t
      → In apps/worker/src/do/session.ts's `fetch()` handler (and the same in do/quota.ts and do/admin.ts), read `req.headers.get('X-Request-Id')` alongside the `X-User-Id` read at session.ts:595, hold it for the duration of the handler, and pass it into every `recordEvent` written on that path (session.ts:
- [✓] Error aggregation
      · apps/worker/src/analytics.ts:820 `errorBreakdown` groups over BOTH explicit error events and failed model calls, bucketed `byKind` and `byScope` with each bucket's share as a `Metric` (analytics.ts:786-809); a failure with no stated kind la
- [~] Error severity classification
      · Two rich failure TAXONOMIES exist and are tested — `ProviderErrorKind` with a `retryable` flag at apps/worker/src/providers/types.ts:94-110, and `OpFailureKind` with a retry verdict at apps/worker/src/op-failure.ts:59-80 (tested in apps/wor
      → In apps/worker/src/analytics.ts replace `ErrorEvent.fatal: boolean` (line 318) with `severity: 'info' | 'warn' | 'error' | 'fatal'`, read through `readEnum` in `normalizeEvent` at analytics.ts:425-432 and defaulting to 'error' only when the caller stated nothing. Set it explicitly at each emitter: '
- [~] Failed background job visibility
      · The agent run is this system's only background job (alarm-driven, apps/worker/src/do/session.ts:1764) and every terminal branch of that alarm routes through `finishRun(agent, reason)` — 'stopped' (:1770), 'error'/'run interrupted' on a stal
      · REFUTED: The branch inventory is accurate (every terminal path in alarm() at session.ts:1764-1829 routes through finishRun, which writes the build event at :2420-2432 and flushes at :2503 before eviction), but the capability does
- [~] Streaming interruption metrics
      · Per-stream counters exist and reach the user; nothing aggregates them and the agent socket has none at all. apps/worker/src/playtest-stream.ts:81-82 increments `framesDelivered`/`framesDropped`, driven from apps/worker/src/do/session.ts:277
      → In apps/worker/src/do/session.ts, when a playtest reaches a terminal phase (the `advance(...)` call at :2746), emit `recordEvent` with a new `stream` kind carrying `{framesDelivered, framesDropped, freshness, durationMs}` plus runId/projectId/actorId; and in `webSocketClose()` at session.ts:1552 emi
- [✓] Provider latency metrics
      · Measured at two levels and served on two routes. Per call: apps/worker/src/gateway.ts:352-366 times each attempt and calls `recordProviderCall(adapter.id, {model, latencyMs, ok, errorKind})` on both the success and the catch path, feeding t
- [☐] Database latency metrics
      · Nothing times a database call. I grepped apps/worker/src for `Date.now()` around every D1 and Supabase call site: `env.CORPUS.prepare(...)` is used at apps/worker/src/memory-store.ts:610, :671, :701, :708, :746, :750, :804, :816, :823, :828
      → Create apps/worker/src/db-timing.ts exporting `timed<T>(label: string, fn: () => Promise<T>): Promise<T>` that measures the await and calls `recordEvent` with a new `db_query` kind carrying `{target: 'd1' | 'supabase', label, durationMs, ok, rows}` plus EventBase. Declare that kind in `EVENT_KINDS` 
- [☐] Queue delay metrics
      · The Studio op queue is the one real queue in the system and its wait is never measured. `PendingOp` (packages/shared/src/index.ts:234-245) carries `id`, `seq`, `studioOp` and `runId` — no enqueue timestamp. The id minted at apps/worker/src/
      → Add `queuedAt: number` to `PendingOp` in packages/shared/src/index.ts:234 (optional, like `runId`, so ops persisted by an older deploy stay valid and report unknown rather than zero). Set it in `execStudioOp` at apps/worker/src/do/session.ts:2853 where the op object is built. Where the poll hands op
- [~] Webhook delivery metrics
      · There is one webhook, inbound Stripe at apps/worker/src/index.ts:1768, and it is covered only by the generic request log: the `/api/*` middleware at index.ts:342 records a `request` event with the labelled route, status and durationMs (and 
      → In apps/worker/src/index.ts's `/api/billing/webhook` handler, replace the bare `console.warn('billing webhook rejected:', verdict.reason)` at line 1780 with `recordEvent({ kind: 'error', scope: 'webhook:stripe', errorKind: verdict.reason, message: 'signature rejected', fatal: false })` so a rejected
- [☐] Usage metering anomaly alerts
      · Hard caps exist; detection and alerting do not. apps/worker/src/do/budget.ts enforces a per-request ceiling (:206-218), a daily cap (:216), a monthly cap (:217) and a manual kill switch (:214, :256), but every one of those is a limit, not a
      → Two steps. (1) In apps/worker/src/do/budget.ts, at the two `console.warn` sites (lines 330 and 345), also call `recordEvent({ kind: 'error', scope: 'budget:settle', errorKind: 'unreadable_reservation' | 'unreadable_cost', fatal: false })` so the leak lands in the error breakdown served by `/api/admi
- [✓] Log access controls
      · Both log surfaces sit behind the admin gate at apps/worker/src/index.ts:444-459: a constant-time `secretEquals` check against `ADMIN_KEY`, with a per-IP failure limiter at :456 (`ipLimited('admin-fail:…', 120)`) that throttles guessing with
- [✓] Log retention enforcement
      · Enforced on the write path, in two dimensions, with the eviction counted rather than hidden. apps/worker/src/do/admin.ts:16 sets `EVENT_RETENTION_DAYS = 30` and :14 sets `EVENT_TABLE_LIMIT = 5000`; `prune()` at admin.ts:43-52 deletes by age
- [✓] Production debugging without secret exposure
      · The error log redacts at the boundary, through the same scanner the egress gate uses. apps/worker/src/analytics.ts:430 runs every incoming error message through `redactMessage` (analytics.ts:210), which delegates to `redactSecrets` in apps/
- [~] Links from user-visible failures to internal diagnostics
      · Half of one path exists. For PUBLIC API callers, apps/worker/src/public-api.ts:687-688 `errorBody` puts `request_id` in every error body and the middleware echoes it as a header (index.ts:3029), tested at apps/worker/tests/public-api.test.m
      → Three connected edits. (1) Mint a request id for `/api/*` and put it on `EventBase` — see the fix under 'Request correlation'; without a stored id there is nothing to link TO. (2) In apps/worker/src/index.ts, include that id in the `/api` error responses: add a small helper beside the request-log mi

## 55. PERFORMANCE AND SCALING  —  50%   ✓4 ~12 ☐4

- [~] Page load performance budgets
      · Two enforced payload budgets, measured from real build output and failing CI on regression. scripts/check-landing-budget.mjs:19-20 sets BUDGET_GZIP_BYTES=12_000 and ALLOW_JS_BYTES=0 against apps/site/dist and also fails if a three.js chunk 
      · REFUTED: The two scripts and the CI wiring exist roughly as cited (/Users/moshe/Desktop/RbxAI/scripts/check-landing-budget.mjs, BUDGET_GZIP_BYTES=12_000 at :18 and ALLOW_JS_BYTES=0 at :19 — cited 19-20, one line off; three.js gua
- [☐] Application interaction performance budgets
      · Nothing budgets or measures in-app interaction latency. Searched apps/web/src and apps/web/tests for INP/interaction/frame-budget/latency/performance/rAF-timing: the only hits are accessibility motion rules (apps/web/tests/activity-motion.t
      → Add apps/web/tests/interaction-budget.test.mjs plus the instrumentation it needs: wrap the three interactions that can block the main thread — composer send (apps/web/src/components/ws/composer.tsx), transcript re-render on a `delta` (apps/web/src/lib/use-project-socket.ts:~660), and files-panel dir
- [~] Time-to-first-response monitoring
      · Latency IS recorded and rolled up, but not time-to-FIRST-response, and no UI reads it. Recorded: apps/worker/src/index.ts:343-361 writes a `request` event with durationMs for every /api/* call; apps/worker/src/gateway.ts:357-374 records lat
      → In apps/worker/src/do/session.ts, stamp `agent.firstOutputAt` the first time a run broadcasts anything the user can see (the first `phase`, `tool` or `delta` after msg_start, around line 2011), and include `firstResponseMs: agent.firstOutputAt - agent.startedAt` on the `build` event recorded at sess
- [~] Streaming responsiveness targets
      · Targets exist and are tested for two of the three streaming surfaces, and are absent for the one the user watches most. Playtest frames: apps/worker/src/frame-bus.ts:66-72 sets PLAYTEST_FRAME_MIN_INTERVAL_MS=1500, PLAYTEST_FRAME_BUDGET=40, 
      → Define a chat-stream target where the run loop can enforce it: add `const FIRST_OUTPUT_TARGET_MS = 3_000;` next to the poll constants in apps/worker/src/do/session.ts:370, and make the run loop broadcast a `phase` frame within that window of msg_start even when the first model call has not returned 
- [☐] Search latency targets
      · Search is bounded in RESULT COUNT but has no latency target anywhere. apps/worker/src/search.ts:180 MAX_SEARCH_LIMIT=100 and :282 clamps a caller's limit; apps/worker/src/rag.ts:206 and apps/worker/src/asset-library.ts:1045 both carry `limi
      → Add a latency assertion to the search path's existing live test: in apps/worker/tests/search.test.mjs add a target constant (e.g. SEARCH_P95_TARGET_MS = 800) and, in infra/healthcheck.mjs, time GET /api/docs/search and GET /api/projects/:id/search and fail the healthcheck when either exceeds it — he
- [~] Large conversation rendering
      · The transcript is BOUNDED but there is no way to reach past the bound and no test. Server: apps/worker/src/do/session.ts:956-957 clamps GET /messages to `Math.min(100, limit || 50)`. Client: apps/web/src/lib/api.ts:132 fetches limit=100, an
      → Add backwards paging to the workspace transcript. apps/worker/src/do/session.ts:955 already accepts `before`; extend apps/web/src/lib/api.ts:132 to `fetchMessages(projectId, limit, before)`, add `loadOlder()` + `hasOlder` to apps/web/src/lib/use-project-socket.ts (next to loadHistory at :310) which 
- [~] Large project directory rendering
      · File PREVIEWS are bounded and honest; the file LISTING is not. Bounded: apps/web/src/components/ws/files-model.ts:211-212 MAX_PREVIEW_LINES=200 / MAX_TABLE_ROWS=50, with `truncated` reported (:234, :244). Unbounded: apps/worker/src/webtools
      → Cap and paginate the listing. In apps/web/src/components/ws/files-model.ts add `export const MAX_BROWSE_ROWS = 300;` and have browseRows return `{ rows, truncated, total }` instead of a bare array, cutting files (never folders) at the cap. Update apps/web/src/components/ws/files-panel.tsx:111/162 to
- [~] Large file upload handling
      · Every server-side ingest path has a real byte cap with a named refusal — apps/worker/src/audio.ts:91,230 (12 MB, 'too_large'), apps/worker/src/webtools.ts:153,1281 (48 KiB workspace file), apps/worker/src/roblox-upload.ts:28,113 (20 MB), ap
      → Guard both ends of the memory import. In apps/web/src/components/ws/instructions-panel.tsx:181, before `file.text()`, refuse `file.size > MEMORY_IMPORT_MAX_BYTES` (define it as 1_000_000 in apps/web/src/lib/api.ts next to importMemory) with the same toast vocabulary the panel already uses for a reje
- [~] Large artifact download handling
      · The size is bounded and truncation is reported honestly; nothing streams. Bounded and tested: apps/worker/src/do/session.ts:1093-1101 caps /export at EXPORT_MAX=5000 messages, reports `messageCount`/`totalMessages`/`truncated`, and apps/wor
      → Make the two largest downloads stream rather than buffer. In apps/worker/src/static.ts:74-86, replace the concatenate-then-respond block with a ReadableStream that enqueues each row from the `select data from static_chunks ... order by idx` cursor, so a 10 MB asset never sits whole in the isolate. I
- [~] Bounded database queries
      · Most reads are bounded and the clamp is a real convention — apps/worker/src/search.ts:282 (Math.min(MAX_SEARCH_LIMIT,…)), apps/worker/src/do/session.ts:957, apps/worker/src/notification-store.ts:245, apps/worker/src/do/admin.ts:121-122, app
      → Add scripts/check-query-bounds.mjs modelled on scripts/check-app-bundle.mjs: walk apps/worker/src/**/*.ts, extract every template-literal SQL string containing `select` that does not also contain `count(`, `sum(`, `limit`, `sqlite_master`, or `.first<`, and fail with the file:line list; seed it with
- [~] Database connection management
      · There are no connections to pool on this platform (D1 and DO SQLite are bindings; Supabase is reached over HTTP), and the work that occupies that role is real and tested: apps/worker/src/schema-once.ts `oncePerIsolate` removed the per-reque
      → Add apps/worker/src/d1-retry.ts exporting `withD1Retry(fn)`: retry up to twice on an error whose message matches /overloaded|exceeded its CPU time limit|Requests queued for too long/ with 120 ms then 360 ms of jitter, rethrowing anything else unchanged (the classify-then-retry shape already exists a
- [~] Background queue concurrency limits
      · One queue is bounded and live; the queue the concurrency policy was written for is not wired. LIVE: the Studio op queue hands the plugin at most 10 ops per poll (apps/worker/src/do/session.ts:3127 `this.opQueue.splice(0, 10)`) and applies b
      → Wire the dispatcher that already exists. Add a `crons` trigger (one per minute) to apps/worker/wrangler.jsonc and export a `scheduled(event, env, ctx)` handler from apps/worker/src/index.ts that calls `dueAutomations(env, Date.now())` (apps/worker/src/automation-store.ts:327), evaluates each with `s
- [~] Per-tenant workload fairness
      · Per-tenant CEILINGS exist; fairness over the shared scarce resource does not. Ceilings: apps/worker/src/index.ts:401 applies a per-account HTTP ceiling (`ipLimited('user:'+user.userId, 240)`, commented 'stops a single credential driving a f
      → Give BudgetDO a per-tenant share of the day. In apps/worker/src/do/budget.ts, track `spentTodayByActor: Record<string, number>` alongside `dayNeurons` and refuse a reservation in /reserve (budget.ts:283) with a new reason `tenant_share` once one actorId exceeds, say, 25% of `dayCeiling` while `dayRe
- [☐] Provider concurrency limits
      · Nothing counts or caps calls in flight to a provider. What exists is adjacent but different: apps/worker/src/gateway.ts:349-389 is a RETRY ladder (MAX_RATE_LIMIT_WAITS=3) that reacts after the provider has already rejected with error 3021; 
      → Put the counter in the one object that is already globally unique and already consulted by every inference call: apps/worker/src/do/budget.ts. Add an in-memory `inFlightByProvider: Map<string, number>` incremented in /reserve and decremented in /settle and /release, and refuse with a new reason `pro
- [~] Cache invalidation rules
      · Rules exist across three caches and run in production; the load-bearing one is untested. Written and running: apps/worker/src/static.ts:90 gives content-hashed assets `public, max-age=31536000, immutable` and everything else `public, max-ag
      → Add a case to tests/deploy-content-type.test.mjs (which already reads the uploader and the worker route as source): assert that the /api/admin/static-upload handler in apps/worker/src/index.ts contains the `caches.default.delete` call and that it is NOT inside a conditional branch, in the same stati
- [✓] Permission-aware caching
      · User-scoped content is marked private with a lifetime bounded by the object, and the property is asserted from both directions. apps/worker/src/index.ts:628-635 serves generated images as `private, max-age=${remainingLife(metadata)}` with t
- [☐] Autoscaling thresholds
      · Specified in a design document, implemented nowhere. docs/SCALE-V2.md:481-505 gives exact thresholds (projected > 20,000 neurons → maxInFlight 4; > 25,000 → defer Free builds; > 32,000 → questions only) plus an hour-of-day 1.5×-trailing-mea
      → Implement the smallest useful piece: add a `/projection` route to apps/worker/src/do/budget.ts returning `projectedDayNeurons = dayNeurons * (86400 / secondsElapsedTodayUTC)` computed from the day's own ledger (the `spend` table written at budget.ts:~350), and a `tier` field of 'normal' | 'throttle'
- [✓] Capacity planning
      · A runnable, tested capacity model, not a prose estimate. packages/evals/src/economics.mjs:504-529 `queueModel(requestsPerDay)` concentrates daily traffic into a peak minute (PEAK_HOUR_SHARE_OF_DAY=0.15, PEAK_MINUTE_BURSTINESS=2.0 at :160-16
- [✓] Peak workload testing
      · infra/loadtest.mjs drives production with 30 real Supabase accounts through six phases — concurrent sign-in, concurrent project create + /api/me, 30 simultaneous WebSocket connects, 12 concurrent real Workers AI inferences, tenant-isolation
- [✓] Cost monitoring during scaling
      · Continuous, authoritative, and visible to an operator. apps/worker/src/do/budget.ts is a single globally-unique object every inference must reserve against (:1-5); it tracks dayNeurons, dayPending, monthBillableNeurons, `estimatedMonthUsd`,

## 57. RELIABILITY AND INCIDENT MANAGEMENT  —  35%   ✓3 ~8 ☐9

- [✓] Service health checks
      · Route: apps/worker/src/index.ts:462 `GET /api/health` returns {ok,version,buildSha,time}, auth-exempt at index.ts:392. Test: apps/worker/tests/image-route-live.test.mjs:159 'health reports the build sha, so drift is observable without crede
- [~] Dependency health checks
      · BUILT for exactly one dependency: apps/worker/src/providers/health.ts (32-sample ring, median latency, last error kind), recorded on every inference at apps/worker/src/gateway.ts:357 and :362, tested at packages/evals/src/providers.test.mjs
      → Add `GET /api/admin/dependencies` in apps/worker/src/index.ts that runs, each under an AbortSignal.timeout(2000), a `select 1` against env.CORPUS, a HEAD to `${env.SUPABASE_URL}/rest/v1/` with the anon key, an env.KV.get of a sentinel key, and a 1-vector env.VEC.query, returning {name, ok, latencyMs
- [~] Defined service reliability objectives
      · A target table is WRITTEN: docs/SCALE-V2.md:320 '### 2.5 SLA targets' gives p50/p95 queue-wait and hard-cap numbers per class (Clay question <200ms/≤5s, Pro build <2s/≤60s, Free build <5s/≤10min, 45-min hard floor). But docs/SCALE-V2.md:3 s
      → Create docs/RELIABILITY-OBJECTIVES.md stating objectives for the service that actually ships (e.g. /api/health availability, /api/me p95, agent-run success rate, a monthly error budget), each naming the metric already computed in apps/worker/src/analytics.ts (latencyRollup at :696, successRollup, er
- [~] Availability monitoring
      · A real, well-built probe exists and is proven: infra/healthcheck.mjs probes /api/health, /, /pricing, /app/ asserting status AND content type AND body shape, has a third 'unobserved' verdict with its own exit code, and wires auto-rollback —
      → Add `"triggers": { "crons": ["*/5 * * * *"] }` to apps/worker/wrangler.jsonc and export a `scheduled()` handler from apps/worker/src/index.ts that runs the same probe set as infra/healthcheck.mjs against its own origin and POSTs one `{kind:'request', route:'/api/health', ok, durationMs}` event per c
- [☐] Error rate alerting
      · Error events are counted and rolled up — apps/worker/src/analytics.ts:820 errorBreakdown, included in summarize() at :1179 and served by apps/worker/src/index.ts:2095 `GET /api/admin/analytics` — but nothing compares a rate to a threshold a
      → In apps/worker/src/analytics.ts add `evaluateAlerts(summary, thresholds)` returning breached rules (e.g. error events / request events > 5% over a 15-minute window, agent-run failure rate > 20%); call it from the new scheduled() handler in apps/worker/src/index.ts and, on a breach, POST to a new `OP
- [☐] Latency alerting
      · Latency is measured in two places and thresholded for an operator in neither: apps/worker/src/analytics.ts:696 latencyRollup gives p50/p95 for model calls, requests and builds (served at index.ts:2095, no UI consumer), and apps/worker/src/p
      → Extend the `evaluateAlerts` function added for error-rate alerting (apps/worker/src/analytics.ts) with latency rules driven by the existing latencyRollup output — e.g. request p95 > 3000ms or model-call p95 > 30000ms sustained over two consecutive 5-minute scheduled runs — and emit through the same 
- [~] Queue backlog alerting
      · The one queue in the system is the per-project Studio op queue in apps/worker/src/do/session.ts:486 (`opQueue`), persisted at :2862 and drained 10 at a time at :3127. Its DEPTH IS surfaced and proven: broadcast as `queuedOps` (session.ts:71
      → In apps/worker/src/do/session.ts, when `this.opQueue.length` crosses 100 in enqueue (around :2858), emit one `recordEvent({kind:'error', code:'op_queue_backlog', projectId, depth})` through the analytics sink so backlog becomes an operator-visible series, and cap the queue (reject beyond ~500 with a
- [✓] Graceful provider failure handling
      · Classified at the gateway: apps/worker/src/gateway.ts:380-392 converts a dead provider into typed errors (BudgetError for 4006/neurons, RateLimitedError for 3021/429, `inference failed` otherwise) rather than letting a raw provider string e
- [~] Graceful database degradation
      · REAL for the retrieval path: apps/worker/src/rag.ts:84 uses Promise.allSettled over Vectorize and FTS so one backend dying degrades to the other, only a DOUBLE failure is fatal (:86-98), and a miss is reported as `certain:false` rather than
      → Add `app.onError((err, c) => ...)` in apps/worker/src/index.ts that maps a thrown fetch/D1 error to 503 with `Retry-After: 30` and a body of {error, reason:'upstream_unavailable'} saying nothing was lost, and wrap the fetch in apps/worker/src/supa.ts:20 in try/catch with `signal: AbortSignal.timeout
- [~] Bounded retry policies
      · The one retry that ships is real and bounded: apps/worker/src/gateway.ts:349 `MAX_RATE_LIMIT_WAITS = 3` with linear backoff at :379 (1.2s/2.4s/3.6s), admitted only when `adapter.classifyError(e).retryable` (:377), and a BILLED failure is ne
      → Add a test in packages/evals/src/providers.test.mjs with a fake AI binding that throws 'AiError 3021' on every call and assert G.chat rejects with RateLimitedError after exactly 4 invocations, so the bound at apps/worker/src/gateway.ts:349 is falsifiable. Separately, wire apps/worker/src/op-failure.
- [☐] Circuit breaker behavior
      · Searched apps/worker/src/gateway.ts, apps/worker/src/providers/*.ts, apps/worker/src/do/budget.ts and apps/worker/src/do/session.ts for breaker/circuit/consecutiveFailures/openUntil/halfOpen/failover — zero hits. docs/SCALE-V2.md:355 states
      → Implement docs/SCALE-V2.md §3.5 in apps/worker/src/do/budget.ts, which every inference already round-trips through: store `{consecutiveFailures, openUntil}` per model id, increment on a non-rate-limit failure reported by a new `/breaker-fail` call from apps/worker/src/gateway.ts's catch at :360, ope
- [✓] Emergency feature disablement
      · Global AI kill switch, end to end. State: apps/worker/src/do/budget.ts:393 `/kill` persists {killed, killedReason}; every reservation is refused at budget.ts:214 and :256 with the operator's own reason carried to the caller. Worker: apps/wo
- [☐] Incident severity classification
      · No incident record type exists anywhere, so nothing can be classified. Searched apps/, packages/, docs/, scripts/, infra/ for 'incident', 'severity', 'sev1', 'SEV-', 'P0/P1', 'impact' — the only severity vocabularies found are unrelated: ap
      → Create docs/INCIDENT-SEVERITY.md defining SEV1..SEV3 for this product in terms the system can actually observe — SEV1 = /api/health failing or agent runs failing service-wide, SEV2 = one dependency degraded (provider rate-limited, Vectorize down so retrieval is keyword-only, Studio op queue backed u
- [☐] Incident ownership
      · Nothing assigns an incident to anyone. Searched docs/, apps/, packages/, scripts/, infra/ for 'on-call', 'oncall', 'pager', 'escalat', 'rota', 'responder' — the only hits are unrelated (reasoning-effort escalation in docs/DECISIONS.md:139, 
      → Add an Ownership section to docs/INCIDENT-SEVERITY.md (or a new docs/INCIDENT-RESPONSE.md) naming, for a single-operator service, who owns each severity, the single contact address alerts are delivered to, and the rule that the first responder owns the incident until they hand it over in writing. Wi
- [~] Incident response runbooks
      · Exactly one incident class has a written AND executable procedure: a bad deploy. docs/MISSION-PROMPT.md:195 §12.6 states the sequence (record the deployed version id first; within 120s probe /api/health, /, /app, infra/smoke.mjs and check-p
      → Create docs/runbooks/ with one file per class, each written as numbered commands a reader can paste: provider-outage.md (read GET /api/admin/model-routing health block, flip config:models via POST /api/admin/config, kill switch as the last resort), database-outage.md (which routes fail, how to tell 
- [☐] Customer incident notifications
      · The notification system is real and good (apps/worker/src/notifications.ts policy, notify.ts the single delivery door, notification-store.ts storage, tested in apps/worker/tests/notifications.test.mjs) but it has no service-incident concept
      → Two parts. (1) In apps/web/src/components/layout.tsx (which already renders OfflineBanner at :355), read `service.paused` and `service.capacityRemaining` from the existing /api/me response and render a persistent banner when paused or when capacity is near zero, reusing the net-banner styles in apps
- [☐] Public incident status updates
      · apps/site/src/pages/status.astro is a live client-side liveness probe and nothing else: its whole data source is one `fetch('/api/health')` at :275, and the page holds no incident list, no history, no operator-authored message and no 'past 
      → Add `GET /api/incidents` (public, add it to AUTH_EXEMPT at apps/worker/src/index.ts:392) reading a D1 `incidents` table of {id, startedAt, resolvedAt, severity, title, body, updates[]}, plus admin routes POST /api/admin/incidents and POST /api/admin/incidents/:id/update to open, update and close one
- [☐] Incident resolution confirmation
      · Nothing records an incident anywhere in the tree (see 'Incident severity classification' and 'Public incident status updates'), so there is nothing whose resolution could be confirmed. The nearest capability is scoped to one remediation, no
      → Once the incidents table from 'Public incident status updates' exists, make closing an incident require evidence rather than a click: in apps/worker/src/index.ts, have POST /api/admin/incidents/:id/resolve re-run the probe set from infra/healthcheck.mjs against the origin and refuse to set resolvedA
- [~] Post-incident review
      · A genuine, maintained review log exists: docs/FAILURES.md, required by the mission spec (file header: 'the internal knowledge base must carry every confirmed Golem failure'), newest-first, each entry stating 'what was believed, what was tru
      → Add a Production incidents section to docs/FAILURES.md with a fixed template — incident id, severity per docs/INCIDENT-SEVERITY.md, detected at / started at / resolved at, customer impact in plain language, how it was detected (and whether monitoring or a customer found it first), root cause, and co
- [☐] Corrective action tracking
      · No artifact tracks a follow-up action to closure with a state and an owner. docs/FAILURES.md records fixes inline in prose with no open/closed field, no owner and no due date. docs/BLOCKERS.md tracks human-blocked items (each with a Status 
      → Create docs/CORRECTIVE-ACTIONS.md as a single table with columns id, source incident, action, owner, opened, due, state (open/done/dropped-with-reason), and add a check to scripts/ (alongside scripts/check-backlog.mjs, which already validates docs/backlog/ shape) that fails the gate when any row is 

## 56. DATA STORAGE, BACKUP, AND RESTORATION  —  55%   ✓8 ~6 ☐6

- [✓] Defined authoritative data stores
      · docs/DECISIONS.md:67 (ADR-009 "Zero-secret data plane") names each store and its job: per-project Durable Object SQLite = messages/gzipped checkpoints/op logs, Supabase = auth + registry via the user's own JWT + RLS, QuotaDO = authoritative
- [✓] Durable conversation storage
      · Transcript rows live in the per-project SessionDO's SQLite: table created at apps/worker/src/do/session.ts:497, written at :1616 (user turn) and :2402 (assistant turn with tool_trace), read at :954. Served live at apps/worker/src/index.ts:5
- [✓] Durable run state storage
      · The agent's run state is written to DO storage under the 'agent' key through apps/worker/src/persist.ts (persistWithShedding), called at apps/worker/src/do/session.ts:2327, and re-read on every path that resumes a run (session.ts:724, :1345
- [~] Durable artifact storage
      · Durable half: checkpoint snapshots are gzipped and chunked into the DO's own SQLite (apps/worker/src/do/session.ts:501-507, written at :3316-3331), and workspace files are versioned in KV with no expiry on the current version (apps/worker/s
      → Decide and implement durability for generated media. In apps/worker/src/imagegen.ts (storeImage, line 696) and apps/worker/src/audio-store.ts (line 91), stop relying on a 1-hour KV TTL as the only copy: write the bytes into the owning project's SessionDO SQLite as a chunked blob table alongside chec
- [✓] Durable billing ledger storage
      · QuotaDO keeps three SQL tables in its own storage — ledger, billing_events and applied_events — created at apps/worker/src/do/quota.ts:25-32; spend appends to ledger at :121, plan/credit changes append to billing_events via record() at :82,
- [~] Transactional critical updates
      · Built and tested on the migration path only: scripts/lib/migration-runner.mjs:89-92 wraps each pending migration and its ledger row in one begin/commit, and tests/migration-runner.test.mjs:156 asserts 'every pending migration runs in its ow
      → In apps/worker/src/do/quota.ts, make the /spend handler's two writes one unit: compute fromAllowance/fromCredits first, then perform the ledger insert (sql.exec at line 121) and the credits write in a single synchronous block with no await between them — use this.ctx.storage.transactionSync(() => { 
- [✓] Database constraint enforcement
      · Postgres carries real constraints, not conventions: infra/supabase/migrations/0001_init.sql gives every table a primary key, foreign keys with on delete cascade, not null columns and check constraints (e.g. profiles.plan check at :7, projec
- [✓] Schema migration tracking
      · A real ledger with per-file checksums exists: scripts/lib/migration-runner.mjs:18 declares LEDGER_TABLE = 'public.schema_migrations' with its DDL at :27, readLedger at :49 and the ledger row written inside each migration's own transaction a
- [☐] Automated database backups
      · Nothing in the repository takes a backup on a schedule. The worker has no scheduled handler — apps/worker/src/index.ts ends at :4369 with `export default app` and exports no `scheduled`, and apps/worker/wrangler.jsonc has no `triggers`/`cro
      → Create a scheduled backup path and stop the unsupported public claim. (1) Add `"triggers": { "crons": ["0 4 * * *"] }` to apps/worker/wrangler.jsonc and change apps/worker/src/index.ts:4369 from `export default app` to `export default { fetch: app.fetch, scheduled: runNightlyJobs }`, with a new apps
- [☐] Object storage backup strategy
      · There is no object store to back up and no strategy document for the blobs that exist. R2 was deliberately rejected — docs/DECISIONS.md:67 ADR-009 'Zero-secret data plane (R2 pivot)': 'R2 requires dashboard enablement + card on file → rejec
      → Write the strategy down and implement the copy. Add a section to docs/DECISIONS.md stating, per blob class (checkpoint_chunks in SessionDO SQLite, ws:/wsv:/wst: keys in KV, generated image/audio KV objects), whether it is backed up, to where, and for how long — and if a class is deliberately not bac
- [☐] Backup encryption
      · Checkpoint payloads are compressed, not encrypted: apps/worker/src/do/session.ts:3311 gzips the snapshot and :3316 inserts the raw gz bytes into checkpoint_chunks. Workspace files (apps/worker/src/webtools.ts:315 kvWorkspace) and generated 
      → Reuse the existing envelope. apps/worker/src/user-credentials.ts already exports the AES-GCM key derivation (line 104) and seal/open helpers; extract them into a small apps/worker/src/envelope.ts and call it from apps/worker/src/do/session.ts:3311-3321 so checkpoint chunks are sealed before insert a
- [✓] Backup access restrictions
      · The snapshot store is reachable only through ownership- and role-gated routes, and that is tested rather than asserted. Routes: apps/worker/src/index.ts:1332 (GET checkpoints), :1366 (POST checkpoints) and :1373 (POST restore) all go throug
- [~] Backup retention enforcement
      · Two of three retention rules are enforced and one of those is tested. Enforced: checkpoints keep the newest 25 per project — apps/worker/src/do/session.ts:3333 'retention: keep last 25' with the chunk delete at :3335 and the row delete at :
      → Add a retention test for checkpoints: in apps/worker/tests/ (a new checkpoint-retention.test.mjs, bundling apps/worker/src/do/session.ts the way apps/worker/tests/billing-persistence.test.mjs bundles do/quota.ts) create 27 checkpoints against a modelled sql fake and assert that exactly the newest 25
- [✓] Point-in-time recovery capability
      · A user can restore their project to any of its last 25 snapshots. Snapshot: apps/worker/src/do/session.ts:3303 createCheckpoint gzips a full game snapshot into checkpoint_chunks; taken automatically before every builder run at session.ts:17
- [☐] Documented recovery objectives
      · No RPO, RTO or any stated recovery target exists. Grepping the whole tree (excluding node_modules and packages/corpus/raw) case-insensitively for 'rpo', 'rto', 'recovery objective', 'point-in-time' and 'disaster' returns only: docs/backlog/
      → Create docs/RECOVERY.md stating, per store the product depends on (SessionDO SQLite, QuotaDO SQLite, Supabase Postgres, D1 golem-corpus, KV, Vectorize), the maximum tolerable data loss (RPO) and the maximum tolerable time to restore (RTO), and next to each the mechanism that currently meets it or th
- [~] Restore procedure documentation
      · The user-facing procedure is documented and matches a real control: apps/site/src/pages/docs/getting-started.astro:80-81 ('Apple checkpoints your place before every agent run. You can restore any checkpoint from the workspace sidebar — even
      → Write the operator half into the docs/RECOVERY.md proposed above: one numbered procedure per store, each ending in a verification command that already exists. For Supabase: resume-or-recreate the project, then `node infra/supabase/migrate.mjs --apply --url <conn> --yes` followed by `--verify` (scrip
- [☐] Scheduled restoration drills
      · Nothing schedules anything, and no script performs an unconditional restore. Schedules: .github/workflows holds only ci.yml and plugin-release.yml and neither has a `schedule:` trigger; apps/worker/wrangler.jsonc has no crons; apps/worker/s
      → Add infra/restore-drill.mjs, modelled on infra/checkpoint-test.mjs (same .env credential loading and Supabase password grant at lines 1-27): create a checkpoint, make a known mutation through /api/admin/studio-op (add a uniquely named Part in a dedicated folder), POST /api/projects/:id/restore with 
- [~] Restored data integrity checks
      · A restore reports what it actually put back and refuses to claim success it cannot prove. apps/worker/src/do/session.ts:3390-3427: the plugin's fidelity report (instancesCreated, scriptsRestored/scriptsExpected, failedInstances, failedScrip
      · REFUTED: REFUTED on two independent grounds. (1) The named test asserts nothing about behaviour: apps/worker/tests/restore-fidelity.test.mjs reads src/do/session.ts as a STRING (line 18) and slices out the restoreCheckpoint body,
- [☐] Cross-service restoration consistency checks
      · Nothing checks that the stores agree after a restore, and one pair is already known to diverge. A checkpoint restore (apps/worker/src/do/session.ts:3350) rewrites the Roblox place and touches nothing else — it writes no transcript marker, n
      → Two things, in this order. (1) Close the divergence: in apps/worker/src/do/collab-store.ts restoreVersion (line 431), make the version row a consequence of a real restore rather than a substitute for one — have the SessionDO perform restoreCheckpoint for the checkpoint the version names before inser
- [~] Backup failure alerts
      · The user is told; nobody operating the service is. Told: when the pre-run protective checkpoint fails, apps/worker/src/do/session.ts:1744-1758 broadcasts an error with code 'checkpoint' and the text "Couldn't snapshot your project before st
      → Emit an operator signal on snapshot failure. In apps/worker/src/do/session.ts createCheckpoint (line 3303), on every early-return error path (:3304 Studio not connected, :3306 snapshot failed, :3309 too large) call the existing counter used elsewhere in the worker (`count(env, 'checkpoint_failed')`,

## 58. TESTING AND QUALITY ASSURANCE  —  63%   ✓6 ~13 ☐1

- [✓] Unit tests for critical business rules
      · packages/evals/src/economics.test.mjs:136 asserts the eval economics constants equal apps/worker/src/pricing.ts (plus :110 USD_PER_NEURON, :121 creditsFor rounding, :96 'a quality-gated build does not fit in a Free day'). tests/check-offer.
- [✓] Integration tests for service boundaries
      · apps/worker/tests/billing-routes-live.test.mjs:33-36 esbuild-bundles the real src/index.ts and drives it with real Requests, real ES256 JWTs (jose) and a real HMAC-signed Stripe webhook body (:246 signedWebhook). Same harness for the shared
- [~] End-to-end registration tests
      · Two halves exist and neither submits a form. tests/e2e/landing.spec.ts:273 is a real browser test but only asserts the CTA's href is /app/signup; the Playwright webServer (playwright.config.ts:63) serves only `astro preview` of apps/site, s
      → Add apps/web/tests/e2e or a Playwright project that builds apps/web and serves it, then drive /app/signup: fill the address and password fields rendered by apps/web/src/routes/auth-pages.tsx:235 (SignupPage), intercept the Supabase POST to /auth/v1/signup, and assert the check-email screen (CHECK_EM
- [~] End-to-end Studio pairing tests
      · The worker middle of the flow is genuinely covered: apps/worker/tests/studio-link-routes-live.test.mjs:291 'THE CLAIM CARRIES THE OPEN PLACE INTO THE SESSION, and confirms it back to the plugin' drives the real bundled index.ts; studio-plac
      → Add apps/plugin/tests/pairing.spec.luau covering apps/plugin/src/init.server.luau's claimCode (line 409): stub HttpService, assert the POST body carries {code, place:{placeId,gameId,placeName}}, that a placeId of 0 is still sent (the server reads it as 'cannot tell'), and that a non-token response l
- [~] End-to-end AI run tests
      · The public /v1 path IS end to end in CI: apps/worker/tests/public-api.test.mjs:827 sends a real request through the bundled index.ts and asserts an OpenAI-shaped completion, usage headers, and that QUOTA_DO /spend was called. The AGENT run 
      → Extend apps/worker/tests/mode-ingress.test.mjs's SessionDO harness (line 54) into a run-loop test: give env.AI a scripted two-turn response (first a tool_call for create_instances, then a text answer), stub the plugin poll so the op resolves, and assert the socket received msg_start, at least one de
- [~] End-to-end approval tests
      · The worker half is complete and tested; the UI half does not exist. apps/worker/src/collab-threads.ts:247 implements review requests and approvals and apps/worker/tests/collab-threads.test.mjs:200-313 covers 9 approval cases (self-approval 
      → Build the approval surface before testing it: add requestReview/listReviews/approveReview to apps/web/src/lib/api.ts POSTing to /api/shared/:id/reviews and /api/shared/:id/reviews/approve (the route table is apps/worker/src/index.ts:4234-4236), surface it in the workspace turn UI, and gate the contr
- [✓] End-to-end rollback tests
      · tests/rollback-static.test.mjs runs the REAL infra/rollback-static.mjs and infra/deploy-static.mjs as child processes against a real HTTP origin on 127.0.0.1 (harness at tests/rollback-static.test.mjs:37), including the failure the undo exi
- [~] End-to-end checkout tests
      · Each leg is exercised over real HTTP through the bundled index.ts, but nothing joins them and Stripe is never contacted. apps/worker/tests/billing-routes-live.test.mjs:144 'CONTROL: a free user can still start a checkout', :153 second check
      → Add one chained test to apps/worker/tests/billing-routes-live.test.mjs: POST /api/billing/checkout as a free user, read the metadata off the recorded stripeCalls entry (the array at line 59), build a checkout.session.completed event carrying exactly that metadata, POST it to /api/billing/webhook sig
- [~] End-to-end subscription change tests
      · Every state a change produces is tested, but never as one transition. apps/worker/tests/billing-subscription.test.mjs:156-232 covers renewing/cancelling/trial/past_due/incomplete/lapsed as pure views; billing-persistence.test.mjs:208 'EVERY
      → Add to apps/worker/tests/billing-routes-live.test.mjs a transition test: seed doBilling as an active 'builder', POST a signed customer.subscription.updated event naming 'studio', then GET /api/me and assert both the tier and the subscription block moved; repeat for a cancel_at_period_end=true event 
- [✓] Cross-tenant isolation tests
      · Database layer: infra/supabase/tests/rls-isolation.mjs applies infra/supabase/migrations/*.sql in order to a throwaway postgres:16-alpine and asks, as each of two tenants through the same request.jwt.claim.sub GUC production uses, whether e
- [✓] Role and permission matrix tests
      · The matrix is asserted three ways. apps/worker/tests/effective-permissions.test.mjs:42 'CONTROL: the answer AGREES with can() for every role and every action' loops all four granted roles x COLLAB_ACTIONS. apps/worker/tests/collab-membershi
- [~] Concurrent spending tests
      · The primitive is tested for true concurrency and its integration is tested by nothing. apps/worker/tests/single-flight.test.mjs:48 'a second call started before the first finishes does not run' and :74 'the guard holds across an await insid
      → Add a test to apps/worker/tests/mode-ingress.test.mjs (its SessionDO harness at line 54 already has real storage and a stubbed QUOTA_DO recording calls): call s.webSocketMessage twice with a {type:'chat'} frame WITHOUT awaiting the first, then assert exactly one QUOTA_DO /spend call was recorded, ex
- [✓] Payment event replay tests
      · Three layers, all executing real code. apps/worker/tests/billing-persistence.test.mjs:168 'A REDELIVERED EVENT DOES NOT CREDIT THE ACCOUNT TWICE' and :196 'A REDELIVERED SUBSCRIPTION EVENT IS NOT APPLIED TWICE EITHER' run against the real Q
- [☐] Interrupted streaming recovery tests
      · Neither the recovery nor a test for it exists. apps/web/src/lib/use-project-socket.ts has exponential-backoff reconnect (:797, :801, :809) but the hello handler at :393 sets only quota and Studio state, and `running` is set solely by msg_st
      → Two pieces. (1) In apps/worker/src/do/session.ts, extend the hello frame at line 774 to carry the in-flight run when one exists — the msgId, the mode, and the text broadcast so far — read from the same 'agent' storage key startRunInner uses at :1595. (2) In apps/web/src/lib/use-project-socket.ts:393
- [~] Browser refresh recovery tests
      · The localStorage-backed pieces are tested; no test performs a reload, and a run in progress is not recovered at all. apps/web/tests/draft.test.mjs:58-238 exercises the real draft helpers against a fake localStorage including the throwing ca
      → Add a Playwright project serving the built apps/web (a second webServer entry in playwright.config.ts alongside the astro one) and a spec that: types into the composer, reloads, and asserts the text is still there; opens the checkpoints drawer and switches the scope tab, reloads, and asserts both su
- [~] Accessibility workflow tests
      · The marketing site has real browser a11y checks; the signed-in app has none that execute. tests/e2e/landing.spec.ts:367 'is keyboard reachable and keeps a visible focus ring', :386 'text enlargement scrolls rather than clipping', :399 'ever
      → Add @axe-core/playwright and a spec that runs an axe scan on the built apps/web routes (dashboard, workspace, settings, usage) once apps/web is served by Playwright, and convert apps/web/tests/drawer-a11y.test.mjs's source assertions into DOM assertions: open the Checkpoints drawer, Tab through it a
- [~] Hebrew and right-to-left workflow tests
      · Layout and content direction are covered; no workflow is walked. apps/web/tests/rtl-workspace.test.mjs:28 forbids physical text-flow properties in every workspace stylesheet and :46 requires the logical replacements to be present (gated as 
      → Once apps/web is served by Playwright, add a spec that loads the workspace with the document direction forced to rtl (set dir="rtl" on <html> before load) and asserts at 1440x900 and at 375px that the rail, composer and drawer mirror, that a Hebrew message bubble reads right-to-left while a fenced c
- [~] Supported browser tests
      · One engine, one app. playwright.config.ts:32-36 declares three projects — desktop and laptop are both devices['Desktop Chrome'] and mobile is devices['Pixel 7'] — so all three are Chromium; there is no firefox or webkit project, and CI inst
      → Decide and write down the supported set (a short section in docs or apps/site/src/pages/docs/faq.astro), then add matching projects to playwright.config.ts:32 — at minimum { name: 'firefox', use: devices['Desktop Firefox'] } and { name: 'safari', use: devices['Desktop Safari'] } — and change .github
- [~] Load and failure-injection tests
      · Load: infra/loadtest.mjs signs in 30 real accounts concurrently (:38), creates 30 projects (:59), opens 30 WebSockets at once (:80), fires 12 concurrent real inferences (:96), probes isolation under that load (:115), and exits non-zero unle
      · REFUTED: The failure-injection half is fully proven; the load half is not, and the item bundles both. PROVEN: every injection point is at the exact line cited and each suite passes. asset-ingest-resilience.test.mjs:49 and :55-56 
- [~] Measured coverage of critical user journeys
      · The journeys are defined and the measurement protocol exists; ten of twelve have no probe. docs/MISSION-PROMPT.md:41-53 names twelve stations S1..S12 (Land, Sign up, Create, Chat, Pair, Build, See, Keep, Undo, Hit the limit, Pay, Return), e
      → Write the missing station probes as scripts/probe-s<n>.mjs alongside scripts/probe-s1.mjs, starting with the funnel S2 (sign up), S3 (create survives reload) and S4 (chat yields a streamed reply with a rendered cost), each writing a fingerprinted capture the way probe-s1.mjs does, and add one GATES.

## 59. DEPLOYMENT AND RELEASE OPERATIONS  —  53%   ✓6 ~9 ☐5

- [~] Separate development environments
      · Local dev commands exist: apps/worker/package.json:6 `dev: wrangler dev`, apps/web/package.json `dev: vite`, apps/site/package.json `dev: astro dev`, plus a genuine dev/QA fixture mode at apps/web/src/lib/mock.ts:41 (VITE_APPLE_MOCK=1 / ?mo
      → Add an `env.dev` block to apps/worker/wrangler.jsonc setting ENVIRONMENT:"development" and pointing SUPABASE_URL/SUPABASE_ANON_KEY at a separate Supabase project, and commit apps/worker/.dev.vars.example listing every optional secret in apps/worker/src/env.ts with placeholder values. Then give ENVIR
- [☐] Separate staging environments
      · Searched `staging` case-insensitively across apps/, packages/, scripts/, infra/, tests/, .github/ and docs/ — every hit is inside vendored third-party data (packages/corpus/data/sources.json, template-seeds.json, library/iconify.json). No `
      → Create a staging tier in apps/worker/wrangler.jsonc as an `env.staging` block: a distinct worker name (`golem-staging`), its own D1 database_id, KV namespace id and Vectorize index (staging must not share the production data plane the way wrangler.apple.jsonc does), ENVIRONMENT:"staging", and a stag
- [✓] Separate production environments
      · Production is real, deployed and independently verified: I probed the live origin on 2026-09-15 and `GET https://golem.moshe-barami111.workers.dev/api/health` returned HTTP 200 with `{"ok":true,"version":"0.1.0","buildSha":"e66fac3","time":
- [~] Environment-specific secrets
      · Secret hygiene is real and enforced. .gitignore:6-13 excludes .env, .env.* and .dev.vars; .github/workflows/ci.yml:282-289 fails the security job if any of those three is tracked by git; ci.yml:279 runs scripts/secret-scan.py over the FULL 
      → Create docs/SECRETS.md listing every optional binding declared in apps/worker/src/env.ts against the environment it is set in (production / staging / local) and the command that sets it (`wrangler secret put NAME --env <env>`), and add a checker scripts/check-secret-inventory.mjs that parses the `En
- [~] Reproducible builds
      · Build INPUTS are pinned hard: `pnpm install --frozen-lockfile` in all five CI jobs (.github/workflows/ci.yml:65, 124, 238, 293, 318), NODE_VERSION '22' and PNPM_VERSION '11.13.0' (ci.yml:41-43), LUAU_VERSION '0.663' and ROJO_VERSION '7.7.0'
      → Add a `reproducible` job to .github/workflows/ci.yml that builds twice from a clean checkout and compares: run `pnpm --filter @golem/site build && pnpm --filter @golem/web build`, record `find apps/site/dist apps/web/dist -type f -exec sha256sum {} +` sorted into a manifest, `rm -rf` both dist direc
- [✓] Dependency lockfile enforcement
      · pnpm-lock.yaml is committed (lockfileVersion '9.0') and complete — all eleven workspace members declared in pnpm-workspace.yaml appear as importers (apps/benchmark/crystal-canyon, apps/plugin, apps/site, apps/web, apps/worker, packages/corp
- [~] Build artifact versioning
      · The mechanism exists and reaches production: apps/worker/package.json:9 defines `deploy:api` as `wrangler deploy --var BUILD_SHA:$(git rev-parse --short HEAD)`, apps/worker/src/index.ts:476 serves it unauthenticated on /api/health, apps/wor
      → Delete the `BUILD_SHA` line from apps/worker/wrangler.jsonc (line 32) and from apps/worker/wrangler.apple.jsonc (line 81) so a deploy that does not inject one honestly reports 'unknown' instead of a stale literal, and change README.md:49 and docs/DEPLOY-INTEGRATION.md:10 to read `cd apps/worker && p
- [✓] Automated type checking
      · .github/workflows/ci.yml:83-84 runs `pnpm -r typecheck` on every push to main, EVERY pull request (the trigger was widened from `branches: [main]` deliberately, ci.yml:24-32) and workflow_dispatch. Seven workspace members define a typecheck
- [~] Automated quality checks
      · The battery is unusually thorough — internal link resolution (ci.yml:135), heading/landmark semantics (:148), backlog disposition honesty (:156), web-app bundle budget (:162), landing payload budget (:168), workspace coverage (:248), full-h
      → Change `.github/workflows/ci.yml:142` from `node scripts/check-spark-figures.mjs` to `node scripts/check-credit-figures.mjs`. Then prevent the class: add tests/ci-workflow.test.mjs that parses .github/workflows/*.yml, extracts every `run:` command matching `node scripts/<name>.mjs` or `python3 scrip
- [~] Pre-deployment migration validation
      · The validator is built and genuinely well tested. infra/supabase/migrate.mjs offers --status / --apply / --adopt / --verify, refuses to guess a database (no DATABASE_URL fallback) and requires --yes to write; the rules are pure functions in
      → Add a `migrate:verify` script to the root package.json running `node infra/supabase/migrate.mjs --verify --url $DATABASE_URL`, and insert it as the FIRST step of the deploy runbook in README.md:47-52 and docs/DEPLOY-INTEGRATION.md:8-12, ahead of `wrangler deploy` — a schema drift must be refused bef
- [~] Deployment approval policies
      · A written policy exists and is not vacuous: docs/MISSION-PROMPT.md §12.6 (line 195) permits at most one deploy per pass, only as the last action of a pass whose §10 block is fully green on a clean committed tree, requires recording the live
      → Add a preflight program scripts/preflight-deploy.mjs that exits non-zero unless: `git status --porcelain` is empty, HEAD is on main and pushed, `node scripts/gate-check.mjs` reports every gate met, and `node scripts/release.mjs --check` is clean — then change the `deploy:api` script in apps/worker/p
- [☐] Progressive release controls
      · Every deploy promotes to 100% instantly. The only deploy commands in the repository are `wrangler deploy` (README.md:49, docs/DEPLOY-INTEGRATION.md:10) and `wrangler deploy --var BUILD_SHA:…` (apps/worker/package.json:9); `wrangler versions
      → Build the precondition first: in apps/worker/src/do/session.ts replace the in-memory `opWaiters` Map (line 487, used at 2823-2877 and 3033) with an `op_results` table in the SessionDO SQLite storage — handlePluginPoll writes the result row and sets an alarm, and the resumed step reads it — so an in-
- [☐] Feature flag targeting
      · There is no flag store, no evaluation function and no per-user or per-cohort targeting anywhere. Searched feature_flag|featureFlag|feature-flag|FEATURE_FLAG across apps/, packages/, scripts/, infra/ and tests/ — zero hits. What exists is gl
      → Create apps/worker/src/flags.ts exporting `evaluateFlags(userId: string, profile: {plan, is_admin}): Record<string, boolean>` that reads a `config:flags` JSON document from KV (written through the existing POST /api/admin/config route at apps/worker/src/index.ts:2425) where each entry is `{enabled, 
- [✓] Post-deployment smoke tests
      · infra/smoke.mjs (342 lines) runs against the DEPLOYED worker with a real account over a real WebSocket and asserts, among others: a real Supabase sign-in returns a JWT (smoke.mjs:131), /api/me refuses an unauthenticated caller with 401 (:13
- [~] Deployment health monitoring
      · The checker is real and rehearsed. infra/healthcheck.mjs probes /api/health plus /, /pricing and /app/, asserting status AND content-type AND response SHAPE AND clock skew (healthcheck.mjs:74-110) — content-type because /pricing once answer
      → Add a `triggers: { crons: ["*/5 * * * *"] }` block to apps/worker/wrangler.jsonc and change apps/worker/src/index.ts:4369 from `export default app` to `export default { fetch: app.fetch, scheduled: runHealthSweep }`, where runHealthSweep (new file apps/worker/src/health-sweep.ts) applies the same pr
- [✓] Application rollback procedures
      · Three programs, and the undo is rehearsed rather than trusted. infra/capture-rollback.mjs captures the bytes a static deploy is about to overwrite and ASSERTS every captured file (status, non-empty, content type consistent with extension), 
- [☐] Database compatibility during rollback
      · Migrations are forward-only and nothing considers the rolled-back case. infra/supabase/migrations/ holds 0001_init.sql through 0006_membership_lifecycle.sql with no down/revert counterpart for any of them, and infra/supabase/migrate.mjs sup
      → Write docs/MIGRATION-POLICY.md stating the expand/contract rule (a migration may only add nullable columns or new tables; a column is dropped only in a later migration, at least one deploy after the last build that reads it) and add scripts/check-migration-compat.mjs that parses infra/supabase/migra
- [✓] Plugin and server release compatibility
      · apps/worker/src/plugin-version.ts decides admission by wire PROTOCOL and never by version string, and treats an unknown protocol as compatible at every value of the floor (pluginCompatibility, line 159) — because Roblox has no automatic plu
- [~] Release notes linked to shipped changes
      · The ledger and its checker are real. docs/RELEASES.json is the source of truth; scripts/release.mjs --check reconciles it against CHANGELOG.md, docs/releases/v0.1.0.md and v0.2.0.md, apps/site/src/pages/changelog.astro and package.json, in 
      → Add a required `commit` field to every entry in docs/RELEASES.json (the sha the release was cut at) and an optional `commits: []` per change. Extend scripts/lib/release-rules.mjs with `validateLedgerAgainstGit(releases, tags, log)` asserting that each release's tag exists in `git tag`, that its comm
- [☐] Retirement of temporary feature flags
      · There is no flag registry to retire from and no expiry mechanism of any kind. No flag definitions exist at all (see the Feature flag targeting row — feature_flag|featureFlag|feature-flag|FEATURE_FLAG returns zero hits across apps/, packages
      → Create docs/FLAGS.md as a table of every runtime toggle — name, file:line, owner, the date it was introduced, and a removal-by date or the word PERMANENT with a reason — seeded with MOCK_MODE (apps/web/src/lib/mock.ts:41), the `config:models` KV override (apps/worker/src/gateway.ts:142) and the kill

## 60. END-TO-END RELEASE ACCEPTANCE  —  63%   ✓6 ~13 ☐1

- [✓] New user completes registration and enters a usable workspace
      · Registration: apps/web/src/routes/auth-pages.tsx:255 calls supabase.auth.signUp with emailRedirectTo('/confirm'); /confirm, /login, /forgot, /reset are all real routes in the same file (:1). Entry: apps/web/src/routes/dashboard.tsx:171-183 
- [☐] Invited member joins the intended organization with correct access
      · No organization tenancy exists. docs/design/TENANCY.md states the schema is flat (profiles -> projects.owner_id) and records the owner's 2026-09-15 decision not to build organizations or workspaces. The /api/orgs routes at apps/worker/src/i
      → No work warranted. The owner dispositioned this as not-planned on 2026-09-15 (docs/design/TENANCY.md); the equivalent capability is per-project sharing, audited under item 15 of this section. If the disposition is ever reversed, the entry point is infra/supabase/migrations plus apps/worker/src/colla
- [✓] Returning user resumes the correct project and conversation
      · apps/web/src/routes/workspace.tsx:50 loads the project by route param from Supabase; apps/web/src/lib/api.ts:133 fetches /api/projects/:id/messages (served at apps/worker/src/index.ts:544). A run still in flight is replayed rather than lost
- [~] User installs the Studio plugin and pairs the intended place
      · Install: apps/web/src/components/ws/connect-studio.tsx (mounted from workspace) points at STUDIO_PLUGIN_INSTALL_HREF and deliberately never claims the plugin is installed. Pair: apps/web/src/components/pairing-dialog.tsx mounted at apps/web
      · REFUTED: REFUTED on the install half, which is half the item. packages/shared/src/index.ts:1251 sets STUDIO_PLUGIN_STORE_LIVE = false (comment: last probed 2026-08-31, 404 for this asset against 200 for a listed control), so STUD
- [~] User sees accurate connection and capability status
      · CONNECTION is done: apps/web/src/lib/studio-connection.ts:29 derives exactly four states from real wire signals and refuses to invent an 'installed' state; apps/web/tests/studio-connection.test.mjs asserts each honesty rule; apps/web/src/li
      → Two changes. 1) Create apps/web/tests/capabilities.test.mjs: esbuild-bundle apps/worker/src/collab.ts and import apps/web/src/lib/capabilities.ts, then assert COLLAB_ROLES and the per-role action allowlists are identical in both, for every role x action pair — the file capabilities.ts already claims
- [✓] User submits a request with relevant project context
      · apps/worker/src/do/session.ts:1656-1686 builds the system prompt from projectName, the plugin-reported placeName, studioConnected, the asset-library availability, memory summary/facts (gated by memoryMode) and the user's typed personalisati
- [~] Agent presents an actionable plan with visible cost expectations
      · The plan half is real: apps/worker/src/do/session.ts:1625 computes runIntentFor(text) (summary + checklist + open questions, derived free of any model by intentCheck in semantic.ts) and :1726 broadcasts 'run_intent' exactly once per run; ap
      → Pick one producer and wire it. Either (a) add a build_plan emitter to the worker: in apps/worker/src/do/session.ts, after runIntentFor, attach a {v:1,blocks:[{type:'build_plan',steps:[...]}]} document to a tool_end detail (the same channel apps/worker/src/tools.ts:1159 and :2046 already use, which a
- [~] User approves the exact operations that require consent
      · ONE consent gate is fully built and unskippable: apps/web/src/components/asset-source-dialog.tsx (no X, no click-outside, no pre-ticked default) is mounted at apps/web/src/routes/workspace.tsx:775, saves through savePreferences('user', user
      → Add a consent gate for irreversible Studio mutations. In apps/worker/src/tools.ts, tag the mutating defs (delete_instances, run_luau, edit_script when it replaces a whole file) with a `needsConsent` flag; in apps/worker/src/do/session.ts, before execStudioOp for a flagged tool, broadcast a new Serve
- [~] Approved operations execute against the intended Studio session
      · apps/worker/src/studio-place.ts is the whole answer: it compares the plugin's reported placeId/gameId against the project's stored binding and returns bind | match | mismatch | unverified, with the stated rule that a failure to identify the
      · REFUTED: The code is real — but nobody can reach it, and the word "approved" is unevidenced. REACHABILITY: every mutating Studio tool is gated by ToolImpl.studio (tools.ts:209 'requires studio connection'), filtered out of the ro
- [~] Studio changes produce persisted and inspectable results
      · PERSISTED: apps/worker/src/do/session.ts:1744 takes an automatic 'before Apple changes' checkpoint before any builder run; checkpoints are chunked into checkpoint_chunks (session.ts:3367) and listed at GET /api/projects/:id/checkpoints (ind
      · REFUTED: REFUTED twice. (1) REACHABILITY: createCheckpoint (session.ts:3303-3304) opens with `if (!(await this.pluginConnected())) return { error: 'Studio is not connected — connect Studio to create checkpoints.' }` and then issu
- [~] Verification reports distinguish passed, failed, and unverified outcomes
      · The three-way split exists at every layer and is carried, not collapsed. Worker: apps/worker/src/vision.ts:36-47 defines VisualCritique with `passed` and a separate `unavailable` ('true when the model's verdict could not be read — a tooling
      · REFUTED: The three-way split is genuinely implemented — and no user can run a verification to see it. REACHABILITY: all five checkers are studio:true in tools.ts (check_composition, audit_build, run_spec, run_and_check, inspect_v
- [✓] User can inspect supporting evidence and operation history
      · EVIDENCE: apps/web/src/components/ws/evidence-cards.tsx:189 <EvidenceCard>, mounted from activity.tsx:158, renders four kinds and four states from the tool's own structured result; apps/web/tests/evidence-model.test.mjs pins the refusals (n
- [~] User can reverse changes and verify restored state
      · REVERSE is done. The checkpoints drawer (apps/web/src/routes/workspace.tsx:112, command at :293-307) calls restoreCheckpoint, which sends {type:'checkpoint_restore'} over the socket (apps/web/src/lib/use-project-socket.ts:912-914); apps/wor
      → Carry the fidelity report to the client. In packages/shared/src/index.ts add a ServerMsg variant `{ type: 'checkpoint_restored'; checkpointId: string; ok: boolean; fidelity?: {instancesCreated;scriptsRestored;scriptsExpected;failedInstances;failedScripts;failedProperties}; note?: string }` next to '
- [✓] Interrupted runs recover without duplicate writes or duplicate charges
      · NO DUPLICATE CHARGE: apps/worker/src/single-flight.ts establishes the guard synchronously before any await, held at apps/worker/src/do/session.ts:1561 (`private readonly startGate = singleFlight()`); apps/worker/tests/single-flight.test.mjs
- [~] Collaborators receive only the access granted to them
      · ENFORCEMENT is done and well tested. apps/worker/src/collab.ts resolves a role from projects.owner_id plus project_members and exposes can()/capabilitiesFor(); every /api/shared route names the action it performs (apps/worker/src/index.ts:3
      → Mount the members UI. In apps/web/src/routes/workspace.tsx, add 'members' to the Drawer union at :71 and the DRAWERS array at :73, import MembersPanel from '../components/ws/members-panel', render it beside the other drawers at ~:888, and add a rail button plus a command-palette entry ('Share projec
- [✓] Plan limits are enforced consistently across UI, API, and background jobs
      · One table, three call sites, no second copy. PLAN_LIMITS lives at packages/shared/src/index.ts:1285 and is re-exported by apps/worker/src/pricing.ts:106, consumed by the enforcement arithmetic in apps/worker/src/quota-math.ts:63 and by the 
- [~] Purchases update entitlements and credit balances accurately
      · apps/worker/src/index.ts:1768-1852 verifies the Stripe signature before parsing (verifyStripeSignature with a timestamp window), then recomputes entitlement from status and period via entitlementFor rather than trusting the event's plan fie
      · REFUTED: REFUTED as not-in-what-is-deployed, proven by probe rather than inference. `POST https://golem.moshe-barami111.workers.dev/api/billing/webhook` returns 503 {"error":"billing not configured"} right now — that is index.ts:
- [~] Cancellation, downgrade, and payment failure produce documented behavior
      · PAYMENT FAILURE: apps/worker/src/dunning.ts maps invoice.payment_failed / payment_action_required / payment_succeeded to three DunningKinds, deduped on the INVOICE so three Stripe retries are one notice, and deliberately returns no plan so 
      · REFUTED: REFUTED on the same live finding as claim 11, and it lands harder here because all three behaviours enter through the dead door. Payment failure is read at index.ts:1806 `const dunning = interpretDunningEvent(event)` — i
- [~] Data export and deletion complete across primary and derived storage
      · PROJECT-LEVEL works, partially. Export: GET /api/projects/:id/export (apps/worker/src/index.ts:1171) returns the transcript as JSON or Markdown with a Content-Disposition attachment, called from apps/web/src/lib/api.ts:486. Delete: apps/web
      → Three changes. 1) Extend purge: in apps/worker/src/index.ts:1381, before forwarding to the DO, list and delete every KV key prefixed `ws:<projectId>:`, `image:<projectId>:` and the audio equivalent (the key builders are kvWorkspace in webtools.ts:316, imageKvKey in imagegen.ts, audioKvKey in audio-s
- [~] Production incidents are detected, communicated, and recoverable
      · RECOVERABLE is genuinely done, and better than most: infra/rollback-static.mjs audits the capture before writing anything, uploads through deploy-static.mjs so the content-type fix cannot drift, reads every restored path back and compares s
      → Close the detection loop. 1) Add a scheduled probe: either a `"triggers": { "crons": ["*/5 * * * *"] }` block in apps/worker/wrangler.jsonc with a scheduled() handler in apps/worker/src/index.ts that self-probes and writes the verdict to KV, or a scheduled GitHub workflow (a new .github/workflows/he

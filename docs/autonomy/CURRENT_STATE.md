# CURRENT STATE

Directly measured facts only. Re-measure at the start of every session; this file is a snapshot.

**Measured:** 2026-09-22 ~21:45 IDT (18:45 UTC).

## Repository

- HEAD `bd6ab348930453fac72ccd92e721f964420cad4b`; origin/main `33d2f377a3f94a3224129aea21d5d2accfdb3c41`
  (local is 13 commits ahead, 0 behind); nothing pushed.
- Working tree very dirty (~390 porcelain entries) — the authoritative product state is the working
  tree, most of it uncommitted work of earlier sessions plus four implementation tracks running now.
- Recovery baseline: `.autonomy/backups/pre-autonomy-20260922T183608Z.patch` (+ untracked tar).
- Baseline matrix before today's tracks (17:44–17:54 UTC): gate suite SUITE GREEN 9,059 / 0; only
  `gate-check --lint` red (12 ledger-shape problems, identical at HEAD).

## Production (https://apple.moshe-barami111.workers.dev)

- `/api/health` → `{"ok":true,"buildSha":"bd6ab34-dirty"}` (worker version b477cd57…, deployed
  2026-09-22T16:57:50Z by an earlier session). SPA bundle `index-BSdMW2lW.js`.
- The public site in production is an OLDER build (green horizon) — not redeployed since the rewrite.
- Creator Store: "Apple Studio" 107230158271368 listed, free, visible (probe 200 with controls,
  18:02:59Z); the store build is 1.0.0 from 2026-09-19.
- Supabase npqvyijsvzkuwddyhtpm: RLS on for all 15 public tables; rls-isolation 43/43.
- Sentry moshe-s6: 9 unresolved issues in 7 days (see CUSTOMER_FINDINGS F-016).

## Studio

- Roblox Studio (no-update copy) open on /Users/moshe/Documents/Place1.rbxl, Apple Studio 1.0.0
  plugin loaded, paired to project 81b7c2f8-cb7d-45e6-875a-b4cfa883182d, edits allowed.
- StudioMCP hub reachable from a local stdio client (scratch `smcp.mjs`).

## Work in flight (this session)

- Implementation workflow `wf_c5472c17-bf0`, four disjoint tracks: A AI Elements chat migration
  (apps/web), B public site redesign (apps/site), C worker run-loop fixes (apps/worker, packages/evals),
  D plugin canonicalisation + store copy. Not yet finished; nothing from it is deployed.
- packages/shared STUDIO_PLUGIN_STORE_LIVE flipped to true (uncommitted, not deployed).

## Autonomy harness

- Installed and verified: see docs/autonomy/evidence/20260922T184444Z-harness-setup/README.md.
- Driver: this interactive session (D-AUT-1); Product-Owner lock held by pid 97997.
- Supervisor branch blocked on one human step: `claude auth login` (CLI logged out).

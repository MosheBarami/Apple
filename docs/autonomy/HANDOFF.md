# AUTONOMY HANDOFF

Timestamp: 2026-09-22T18:46Z
Session: interactive desktop session (pid 97997), first OWNER_PROMPT run
Phase: implementer (setup complete; entering the reality loop)

## Repository truth

HEAD: bd6ab348930453fac72ccd92e721f964420cad4b
origin/main: 33d2f377a3f94a3224129aea21d5d2accfdb3c41
working tree: ~390 entries dirty (earlier sessions + four running tracks)
commits created: none yet this session (harness commit next)
push state: nothing pushed

## Production truth

worker version: b477cd57-1595-42f0-9124-724cae18822b (buildSha bd6ab34-dirty)
web bundle: index-BSdMW2lW.js
site version: older build (green horizon) — not redeployed since the rewrite
health: ok
database state: RLS on 15/15 tables; rls-isolation 43/43
Studio pairing state: Place1.rbxl paired to 81b7c2f8…, edits allowed, plugin 1.0.0

## Facts discovered

- The no-verifier propose_plan trap is fixed in production (E-1).
- A truncated create_instances call deterministically kills real builds (F-001, E-1, E-2).
- The store listing is live; STUDIO_PLUGIN_STORE_LIVE flipped (D-STORE-1).
- apps/apple-plugin is the shipped plugin (D-PLUGIN-1).
- The standalone claude CLI is logged out (supervisor branch blocker).

## Customer observations

See CUSTOMER_FINDINGS.md F-001..F-017.

## Decisions taken

D-AUT-1, D-STORE-1, D-PLUGIN-1, D-RUN-1 — see DECISIONS.md.

## Changes made

Path: docs/autonomy/**, scripts/autonomy-{supervisor.py,gate.sh,review-gate.py,mcp.json},
.claude/hooks/autonomy_guard.py, .claude/settings.json, tests/autonomy-harness.test.mjs, .gitignore
Change: the harness from docs/autonomy/RESEARCH-REPORT.md
Why: the owner's instruction to make the report the repository's primary artifact and run it

Path: packages/shared/src/index.ts
Change: STUDIO_PLUGIN_STORE_LIVE true, refusal record null
Why: D-STORE-1

## Validation

Command: node --test tests/autonomy-harness.test.mjs — Exit: 0 — 17/17 — Evidence: evidence/20260922T184444Z-harness-setup/
Command: node infra/supabase/tests/rls-isolation.mjs — Exit: 0 — 43/43 — Evidence: same dir

## Deployments

None yet this session.

## Failures

Failure: real Agent build (lamp) ended `error` twice. Root cause: truncated tool call (F-001).
Whether external state may have changed: two checkpoints (snapshot ops) and two viewport_info reads
in Place1.rbxl; no mutation applied (opsApplied counted the snapshot + read); credits refunded.

## Unverified assumptions

- That the payment provider's webhook no longer targets the retired golem host (F-016).
- That the store build 1.0.0 refuses run_mode (inferred from HEAD source at 09-19).

## Current blockers

Technical: F-001.
Human-only: `claude auth login` for the unattended supervisor; publishing a plugin update to the
Creator Store (public publish — needs the owner).

## Next action

See NEXT_ACTION.md.

## Safety state

Secrets printed: NO
External destructive actions: NONE
Recovery artifacts: .autonomy/backups/pre-autonomy-20260922T183608Z.patch, …-untracked-….tar.gz;
unlazy/nonstop removal backups in the session scratchpad; removed files in ~/.Trash.

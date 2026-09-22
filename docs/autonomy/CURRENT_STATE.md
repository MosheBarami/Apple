# CURRENT STATE

Directly measured facts only. Re-measure at the start of every session; this file is a snapshot.

**Measured:** 2026-09-23 ~02:00 IDT (23:00 UTC 2026-09-22).

## Repository

- HEAD = origin/main `fd3edc0`; pushed. 157 porcelain entries — the BYOK/model-catalogue track of
  workflow `wf_46d0bb34-725` (apps/worker, packages/shared, apps/web, apps/site) is in flight and
  uncommitted, together with the wiring of the F-039 read-stall bound and the larger transcript budget in
  apps/worker/src/do/session.ts (worker 3814/0, evals 1354/0 with both in the tree).
- CI has not run since 2026-09-21 (GitHub billing, OWNER_QUEUE Q-001); local suites are the gate.

## Production (https://apple.moshe-barami111.workers.dev)

- `/api/health` → buildSha `09229aa-dirty` (worker 5790b892, deployed 2026-09-23 ~01:35 IDT). It does
  NOT carry the F-039 fix yet.
- Web app and site redeployed ~01:40 IDT with STUDIO_PLUGIN_STORE_LIVE = false; both say public
  installation is unavailable (verified in the served bytes).
- Creator Store: Apple Studio 107230158271368 removed — "Misusing Roblox Systems", violation
  3JhaXRZAqvmSw5iIhea5QZgT67R, appealable until 2026-10-23 01:23 IDT (F-038, D-STORE-2: appeal with the
  final build). toolbox details 404 beside healthy controls.
- Claude CLI logged in (Q-004 done).

## Studio

- One Studio instance (no-update copy) on /Users/moshe/Documents/Place1.rbxl, relaunched 01:44 IDT;
  plugin panel reads 1.1.0 (local build sha256 1e04e884…). Paired to project "Coin Rush 23 Sep"
  (8baee89b-de6e-4857-b000-c0636475a3e5), edits allowed. The place holds the Collectibles module from the
  stopped F-039 run and no coins.

## Work in flight

- `wf_46d0bb34-725` — BYOK keys, OpenRouter provider, model catalogue (worker done; web + site running;
  then review and fix).
- `wf_5391a084-5f4` — component gallery for the owner (7 libraries), output in the session scratchpad.

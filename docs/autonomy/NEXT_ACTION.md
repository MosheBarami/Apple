# NEXT ACTION (V3)

Pre-V3 queue archived in `archive/pre-v3/NEXT_ACTION.md`. Order follows `v3/Apple_RbxAI_EXECUTION_V3.md`.
Owner consent on record for the rest of V3 (2026-09-29): Cloudflare deploy to existing production, bounded
paid GLM runs, driving Roblox Studio, push to GitHub `main`. Stripe (L01) and public plugin release (L02) stay held.

Landed in code (pushed to `main`, NOT yet deployed, so no gate is evidenced yet):
G01 single engine, mode removal, training retirement, G05 native-readiness consumer, G06 library
namespace, G03 hard Studio gate + pause/Continue + steering + acknowledged Stop (G10), English-only
output (G08), G02 pre-launch account gate, Q21 critique-loop removal, Stop abandons in-flight model calls.

1. **Finish in-flight work.** Branding (G15), game independence (G13/G14) and cleanup (workflow
   wejim95fb); G12 evidence renderers (workflow wp4lz7sb4) then one integration into `ws/turn.tsx`.
   Commit each piece separately after worker + web tests and tsc pass.
2. **Deploy.** `node infra/deploy-worker.mjs apple`, then `node infra/deploy-static.mjs` (needs
   `API_BASE`/`GOLEM_ADMIN_KEY` from the repo `.env`, read by the script only). Set secrets
   `LIBRARY_APPROVED_USER_IDS` (and optionally `RELEASE_LIBRARY_OWNER_ID`). Verify `/api/health`
   `buildSha` equals `main` and one real GLM request (G01 evidence).
3. **Library publish (G06).** `packages/owner-corpus/publish_native_readiness.py --live` with the owner's
   `APPLE_OWNER_JWT` (201/203 units ready in dry run; 2 skipped for open refs).
4. **Live Studio checks (G03/G10).** Install the local test plugin build, then: unpaired composer locked
   → pair unlocks → wrong place locks → disconnect mid-run pauses → reconnect offers Continue with no
   duplication → steering applies at the next step → offline Stop works.
5. **Three complete games** (G07/G08/G09/G13/G14): Steal a Brainrot, Grow a Garden, Arm Wrestle
   Simulator families, each in its own project, played in Studio.
6. **Final audit (G16)** and update `ACCEPTANCE.json` gate statuses with live evidence only.
7. Move the working copy back to `~/Desktop/RbxAI` (owner request): swap the evicted Desktop `.git`
   for the local one; private data stays in iCloud.

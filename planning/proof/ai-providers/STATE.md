# Current truth, 2026-10-08

Branch: `codex/ai-provider-integration`; worktree:
`/Users/moshe/.codex/worktrees/ai-provider-integration/StudPilot`.
Groundwork commit `ae4cca51` is based on GitHub main `209650f4`; newer integration/UI changes
are in the worktree and are not deployed. The shared local main and its unrelated edits remain intact.

## Implemented so far

- Exactly three central route labels, central engine release/config/prompt/policy identity.
- Fixed-origin API protocols for 19 providers; discovery and documented catalogs; unknown metadata stays null.
- AES-GCM private multi-connection storage with owner/connection/provider AAD, replace/delete/revision guards,
  authenticated routes, account erasure and export inventory coverage.
- Private user/project selection persistence, explicit new wire field, run-start pinning, real gateway dispatch,
  separate user-paid provider cost, owned key lookup per call, signed replay state and partial-stream failures.
- Task/structural complexity routing, manual BYOK default, allowed-connection auto opt-in, capability filtering,
  bounded per-actor/connection/revision availability state and no silent cross-route/paid fallback.
- Session/history route metadata, cancellation propagation, Settings Connections and workspace selectors.
- 24 unchanged official source brand assets and manifest; 19 provider choices have local assets.
- Isolated pinned OpenCode CLI service groundwork: signature/replay protection, fresh HOME/XDG, denied internal
  tools, no plugins/MCP/personal skills, bounded queue, timeout/cancel, complete NDJSON and reconnect result cache.
- Independent BYOK/OpenCode rollout switches default off and stop pinned runs at their next call.
- AES-GCM SQLite runner receipts and immutable catalog snapshots survive restart; prompts are not journaled.

## Evidence observed

- Local web production build passed (before the most recent small edits; rerun before completion).
- UI fixtures: 5 desktop/mobile screenshots, three exact options, BYOK model choice, keyboard focus,
  OpenCode unavailable state, password field cleared after submission, no key in browser storage/URL, no page errors.
  These are UI fixtures only: `ui-fixture/result.json`. They do not prove real provider or Studio inference.
- Real HF discovery: 137 base models / 311 explicitly pinned upstream-host routes. HF inference returned 402
  (credits required), no purchase made. `HUGGINGFACE.md` and `huggingface-catalog.json` record it.
- Real Cloudflare discovery returned 69 models. The existing authorized key completed an actual
  GPT-OSS-20B inference and all five fixed JSON/schema/Luau-compiler/syntax-repair/native-tool probes.
  This is local API proof, not website/Studio/deployment proof. Published-rate token estimate is below $0.001.
- Real isolated OpenCode inference returned 403 FreeTierError. Official hosted terms prohibit public third-party
  service use without further permission. No bypass, identity spoofing or service credential deployment occurred.
- Full local worker suite: 5,378 pass, 5 skip, 0 fail; web: 2,747 pass, 0 fail; root: 716 pass, 0 fail.
  These preceded the latest rollout/security changes. Fresh 88 focused security/protocol/session tests
  and 32 runner/matrix tests passed after those changes; worker type checking passed.
- Disk reached 116 MB free during editing. Removed only 71 generated temporary test directories containing
  this task's exclusive code (875 MB); free space then measured 1.5 GiB. No unrelated cache/source/data was removed.

## Outstanding

Rebase on current main, run integrated checks/build, review the complete diff, prepare and attach a draft PR.
HTTP connection actions, late key replacement, rollback, persisted Retry-After and private admin-run boundaries
are now executed contract tests. The five UI screenshots were inspected. Pagination/replay coverage and
actual process/container lifecycle proof still need broadening.

Further source gaps: task-quality samples are not yet populated by a live StudPilot matrix; public-use OpenCode
permission and isolated runtime proof are absent; runner container lifecycle remains unverified;
all-provider live proof is absent where no key exists; official model-family branding beyond the verified
publisher set remains unresolved. Keep unavailable models/routes honest, not silently routed elsewhere.

Final required live acceptance still needs: approved OpenCode
service access, integrated deployment from clean main with AI_CREDENTIAL_KEY provisioned, real website requests
and a paired evaluation Studio place. A valid existing Cloudflare account completed local runtime proof.
Studio MCP currently lists no connected instances; launching the installed app returned OS timeout,
and the alternate registered installation path no longer exists. No Play or place mutation was attempted.
Do not mark the Codex goal complete or claim the integration is deployed.

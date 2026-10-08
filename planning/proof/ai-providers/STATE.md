# Current truth, 2026-10-08

Branch: `codex/ai-provider-integration`; worktree:
`/Users/moshe/.codex/worktrees/ai-provider-integration/StudPilot`.
Integration is rebased onto GitHub main `8969fc07` and saved in draft PR #138.
No production deployment is claimed. The shared local main and its unrelated edits remain intact.

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
- Real local HTTPS Worker proof also passed: actual Supabase JWT, encrypted user-owned connection save,
  69-model discovery, selected GPT-OSS-20B inference and native tool verification, then connection deletion.
  Published token estimate for these two calls: $0.0000664. See `local-authenticated-byok.json`.
  A real workerd redirect-mode incompatibility was found and fixed; Node fixtures alone had missed it.
- Real isolated OpenCode inference returned 403 FreeTierError. Official hosted terms prohibit public third-party
  service use without further permission. No bypass, identity spoofing or service credential deployment occurred.
- Integrated local worker suite: 5,384 pass, 5 skip, 0 fail; web: 2,747 pass, 0 fail.
  Worker/shared/web type checking and web production build passed. Latest protocol suite: 24 pass,
  including pagination, signed thinking replay and three native stream protocols. Runner/matrix: 32 pass.
  Root suite previously measured 716 pass; current root rename-guard regression passed separately.
- First GitHub run passed all four worker shards, web integration, runner contracts and plugin artifact.
  It found a legacy Studio source-expression pin, eight official third-party icon URL name hits,
  and one undeclared fabricated credential test value. Repairs use executed engine configuration,
  exact-count third-party provenance allowance and an exact path/value hash declaration. Local guards pass;
  fresh GitHub checks are required for the repair commit.
- GitHub checks subsequently all passed at `ad417fcc`. New current-frontend/Flue changes are later
  work and need their own complete checks. The current Studio contracts measured 23 pass; latest
  private provider/bridge contracts measured 51 pass. Worker/current frontend and pinned Flue source
  type checks passed in their recorded runs.
- Disk reached 116 MB free during editing. Removed only 71 generated temporary test directories containing
  this task's exclusive code (875 MB); free space then measured 1.5 GiB. No unrelated cache/source/data was removed.

## Outstanding

Run repaired GitHub checks, finish authenticated website runtime and evaluate the Studio build path.
HTTP connection actions, late key replacement, rollback, persisted Retry-After and private admin-run boundaries
are now executed contract tests. The five UI screenshots were inspected. Native replay and pagination
are tested; actual process/container lifecycle proof remains outstanding.

Further source gaps: task-quality samples are not yet populated by a live StudPilot matrix; public-use OpenCode
permission and isolated runtime proof are absent; runner container lifecycle remains unverified;
all-provider live proof is absent where no key exists; official model-family branding beyond the verified
publisher set remains unresolved. Keep unavailable models/routes honest, not silently routed elsewhere.

Final required live acceptance still needs: approved OpenCode
service access, integrated deployment from clean main with AI_CREDENTIAL_KEY provisioned, real website requests
and a paired evaluation Studio place. A valid existing Cloudflare account completed local runtime proof.
The installed Studio eventually started after the OS timeout. `EvalBaseplate.rbxlx` is now connected
in Edit mode, with placeId/gameId zero and Baseplate/SpawnLocation/Terrain/Camera observed. An unrelated
owner build was visible in the live website; it was not stopped or modified. No Play or place mutation
was performed for this task.
Do not mark the Codex goal complete or claim the integration is deployed.

## Current frontend discovery and adaptation

Parallel main work replaced the active SPA with `apps/www` and a Flue `apps/studio` agent. Live
inspection exposed this: the legacy SPA/gateway changes alone do not satisfy website acceptance.
The current frontend now has its own widgets/assets/API helpers, preference loading, frozen send
headers and idempotent delivery ids. The Studio service pins through authenticated `StudioGate`
before admitting a structured creator delivery; model calls use the main gateway while the existing
Flue executor/ledger still handles Studio actions. Delegates inherit the submission's pinned model.
Private provider usage is not charged as the managed GLM provider. Root data parts report operational
route/model/connection evidence without native replay or hidden provider thinking.

These adaptations are not deployed or accepted live. Development UI fixtures and actual Flue
runtime/restart/cancellation proof remain required. Native replay is bounded and expires after one
hour; complete current-turn Google signatures are preserved, without fake validator signatures.
Current-frontend type checking/build are now included in required CI. Production requires all three
existing Worker releases and the independent rollout switches/secrets.

Current frontend UI review: five new JPEG captures in current-ui-fixture. Desktop and390x844 mobile inspected; a truncated mobile route label was fixed, model options collapse with keyboard focus returned to their trigger, official host/maker logos loaded, fake key field cleared, and unavailable Free state displayed. These are development fixtures. The current website connection form and selectors are now mounted; actual current Flue runtime and authenticated website acceptance still remain.

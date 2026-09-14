# APPLE EXECUTION LEDGER

Ground truth for transforming the Golem Roblox-creation platform (`/Users/moshe/Desktop/RbxAI`) into "Apple".
Synthesised from 10 independent code-level audits, re-verified against the working tree on 2026-09-14.

**Rule applied throughout:** a capability is listed under CURRENT STATE only if a reachable product path
executes it and its effect persists or is observed. Code that compiles, is tested, and has no caller is a
DEAD END, not a feature.

**Verification method:** claims marked `[verified]` were re-checked in this session by reading the file or
querying live Cloudflare documentation. Everything else is carried from the audits with its file:line cite.

---

## 1. CURRENT STATE — what genuinely works end-to-end

### 1.1 Agent execution engine (real, complete, tested)

| Capability | Evidence |
|---|---|
| Full lifecycle: HTTP → WS → alarm loop → model call → tool → Studio op → response | `apps/worker/src/index.ts:66-80` (JWT mw), `:133-146` (ownership + DO init), `:148-157` (WS upgrade); `apps/worker/src/do/session.ts:326-364` (accept/replay), `:557-559` (chat→startRun), `:619-753` (startRunInner), `:755-822` (alarm), `:823-1150` (runStep); `apps/worker/src/gateway.ts:198-355`; `session.ts:1507-1544` (queue op), `:1572-1680` (drain on poll) |
| Step-bounded autonomy — no unbounded loop | `apps/worker/src/do/session.ts:130` `STEP_LIMITS {clay:3, stone:16, rune:24}`, enforced `:843` |
| Concurrent-run race closed by synchronous in-memory gate | `apps/worker/src/single-flight.ts:26-39`; `session.ts:591,607-617`; `apps/worker/tests/single-flight.test.mjs` |
| Stop signal under its own storage key with one writer — cannot be lost to a step's tail write | `apps/worker/src/stop-signal.ts:38-64`; `session.ts:560-570, 1136-1150, 1162` |
| Oversized run state sheds transcript instead of throwing (prevents alarm-retry re-billing + duplicate mutating tools) | `apps/worker/src/persist.ts:65-99`; `session.ts:1151-1153`; `tests/persist.test.mjs`, `tests/transcript-budget.test.mjs` |
| Per-run randomised prompt-injection fence — tool output cannot forge a closing tag | `session.ts:653` (`randomUUID().slice(0,8)`), `:1140-1146`; `apps/worker/src/prompts.ts:178-196`; `tests/prompt-fence.test.mjs` |
| Ops queued by an ended run are dropped, not applied late | `apps/worker/src/op-attribution.ts:1-54`; `session.ts:1491-1505, 1164-1183, 1647`; `tests/op-attribution.test.mjs` |
| Reconnect snapshot replaces in-flight assistant message by id (idempotent replay) | `session.ts:519-538, 336-352, 553-556`; `apps/web/src/lib/use-project-socket.ts:512-566` |
| Worker unit suite green | `apps/worker/tests` — 16 files, `node --test` 162 pass / 0 fail |

### 1.2 Spend enforcement (real hard gate, not a counter)

| Capability | Evidence |
|---|---|
| All 5 `env.AI.run` call sites reserve budget **before** invoking | `gateway.ts:264` (chat, invoke `:286`), `:361` (embed, run `:364`), `:450` (rawProbe, run `:454`), `imagegen.ts:629` (run `:638`). Transport is `providers/workers-ai.ts:211`, reachable only via `gateway.ts:286` |
| Denied reservation **throws** before the model is contacted | `do/budget.ts:212-220` → `gateway.ts:132-137` `BudgetError` |
| Reservations serialise — single globally-unique single-threaded DO | `gateway.ts:116-118` `idFromName('singleton')`; `do/budget.ts:63`; `wrangler.jsonc:12,17` **[verified]** |
| Per-request ceiling 1,200 neurons, enforced twice (caller + DO) | `pricing.ts:93`; `gateway.ts:261-263,443-445`; `imagegen.ts:624-626`; `do/budget.ts:201-207` **[verified]** |
| Kill switch checked inside the DO before cap arithmetic | `do/budget.ts:193-200, 263-267`; `index.ts:649` |
| Settlement on ACTUAL usage; never releases after the model ran | `gateway.ts:339-343`; release only on pre-run failure `gateway.ts:306`, `imagegen.ts:640-642` |
| Per-user Spark quota in a per-user DO addressed by verified JWT `sub` | `do/quota.ts:30-52,58-66`; `session.ts:1749-1755`; `index.ts:432` |
| No paid third-party provider is callable | `providers/openai.ts:234-238` throws before `postJson`; `env.ts:26-39` **[verified: all three keys declared optional and unset]**; `wrangler.jsonc` vars sets none |
| CI cannot spend | `.github/workflows/ci.yml:5-14` cost policy, `:41` `permissions: contents: read`, no secrets, no eval-runner step |

### 1.3 Authentication and tenancy (100% Supabase; zero Clerk)

| Capability | Evidence |
|---|---|
| ES256 JWT verified against remote JWKS; issuer + audience pinned; worker holds no auth secret | `apps/worker/src/auth.ts:8-29`; global enforcement `index.ts:72-83` |
| Tenancy decided by Postgres RLS — caller's own JWT reaches PostgREST | `apps/worker/src/supa.ts:10-16, 36-44` |
| Forged JWT rejected by signature, not claims | `packages/evals/src/security.test.mjs:159-166, :900` — suite runs 54/54 pass |
| DO addressed by canonical DB row id, not URL param (no casing fan-out) | `index.ts:139-147`; `security.test.mjs:877` |
| DB triggers force server-generated ids + block self-escalation of `plan`/`is_admin` | `infra/supabase/migrations/0003_security_hardening.sql:3-12`; `0001_init.sql:120-130` |
| Admin key compared constant-time, fails closed when unset | `index.ts:86-92, 117-119`; `security.test.mjs:955` |
| Pairing: single-use 10-min code, token `<uuid>.<48hex>`, only SHA-256 stored, timing-safe compare | `do/pairing.ts:33-39`; `index.ts:340-347`; `session.ts:388` |
| Unauth plugin poll validates token SHAPE before any storage touch (cannot materialise arbitrary DOs) | `index.ts:364-371`; `security.test.mjs:1487` |
| Zero Clerk anywhere | `grep -ril clerk` over repo incl. node_modules = 0 files; `pnpm-lock.yaml` count 0 |

### 1.4 Studio plugin ↔ worker contract

| Capability | Evidence |
|---|---|
| 26 typed op handlers dispatched from one table; unknown op refused by name | `apps/plugin/src/Ops.luau:122-638, 640-645` |
| Every op in the wire union has a plugin handler, asserted by a source-level parity test | `packages/shared/src/index.ts:37-74`; `apps/worker/tests/studio-op-parity.test.mjs` |
| Every mutating op wrapped in ChangeHistoryService; mutation **refused** if no recording can open; handler throw → Cancel not Commit | `Ops.luau:17-21, 643-696` |
| Per-op asset allow/deny window opened before and closed after the handler on every exit path | `Ops.luau:35-57, 681-683`; `Paths.luau:166-297` (nil policy is CLOSED) |
| `run_code` refuses non-yielding infinite loops before executing (string/comment-stripped block scan) | `Ops.luau:336-346, 355-372, 374-443` |
| Model-emitted Luau filtered for asset-ingress primitives before it runs in the user's place | `apps/worker/src/tools.ts:630-641`, invoked `:821`; admin route applies the same filter `index.ts:871-889` |
| Plan mode's read-only promise enforced by withholding tools, not prompt | `apps/worker/src/router.ts:59-73`; `session.ts:873`; `tests/tools-for-mode.test.mjs` |
| Op delivery is deliberately at-most-once and the run is TOLD on loss | `session.ts:1650-1674, 1524-1533` |
| Exactly one Studio paired per project | `do/pairing.ts:33-40`; `index.ts:339-359`; `session.ts:370,380-385` |
| Plugin Luau spec suite runs outside Studio against byte-identical source | `node apps/plugin/tests/run.mjs` — 10 suites, 168 assertions, all pass |

### 1.5 Creator Store asset path (the one asset route that works)

| Capability | Evidence |
|---|---|
| Key-gated v2 search with unauthenticated v1 fallback; missing `ROBLOX_API_KEY` degrades, never errors | `assets.ts:518-520, 869-925, 927-968` |
| Verification gate: provenance → type allowlist (Image 1 / Decal 13 / MeshPart 40; Model 10 always refused) → script count → shouldSandbox → free/purchasable → triangle budget | `assets.ts:432-441, 578-693, 714-776` |
| `insert_asset` re-runs the full gate, inserts via `game:GetObjects`, re-reads the hierarchy out of the place, scans/strips Luau, re-lists to prove clean, discards the whole asset if it cannot | `tools.ts:1165-1247, 310-360`; `assets.ts:1465-1540, 1344-1420` |
| Calibrated against a dated real-world sample (4 free "rock" listings: 2 carried scripts, 2 shared a MeshId, 1 was 419 primitives — all 4 stopped by the type rule) | `packages/evals/src/asset-marketplace-sample.test.mjs:29-75`; `docs/evidence/2026-09-01-rock-palette-supply.md` |

### 1.6 Visual evidence pipeline (rasteriser → worker → browser)

| Capability | Evidence |
|---|---|
| Software rasteriser produces real pixels (perspective, per-pixel depth buffer, backface cull, Lambert + material response, fog) | `apps/plugin/src/Render.luau:78-110, 206-300, 312-340` |
| Admission gate rejects (never repairs) empty payloads, bad dimensions, >320×240, >320 KB base64, short payloads | `apps/worker/src/frame-bus.ts:227-275, 45-46` |
| Re-encode picks the smaller of raw RGB vs RLE24 — compressor can never inflate | `frame-bus.ts:130-190, 195-201` |
| Playtest rate gate: interval floor (no burst), hard 40-frame budget, consumed on take | `frame-bus.ts:63-69, 284-341`; `session.ts:1407, 1437-1439` |
| Replay ring double-bounded (6 frames AND 512 KB), DO memory only — **never** in storage, D1, `messages`, or the LLM transcript | `frame-bus.ts:72-74, 344-381`; `session.ts:1335, 1302-1309`; `tools.ts:992-995` strips pixels from the tool result |
| Browser refuses any frame that does not decode exactly; absent `encoding` defaults to rgb24 | `apps/web/src/lib/frame-decode.ts:41-106` |
| Decoder proven in CI against a real 160×100 plugin frame on both wire encodings | `apps/web/tests/real-frame.test.mjs:31-140` |
| Vision critic receives REAL images: PNG encoded in-worker (CRC32 + `CompressionStream`), ≤3 data-URL frames, plus statistics over the decoded buffer | `apps/worker/src/vision.ts:243-320, 24, 256-262`; `apps/worker/src/png.ts:1-104`; `apps/worker/src/pixel-stats.ts:21-60` |
| Playtest safety: census before/after, protective checkpoint, destructive-delta detection, **verified** restore by re-census | `apps/worker/src/playtest.ts:38-60, 104-139`; `tools.ts:844-861, 922-941` |

### 1.7 Web frontend — the parts with real data behind them

| Capability | Evidence |
|---|---|
| Vite 5 + React 18 + react-router-dom v6 SPA at basename `/app`, 8 routes render, `tsc --noEmit` clean, 262 tests pass | `apps/web/vite.config.ts:5-17`; `apps/web/src/app.tsx:57-108` |
| Astro 5 static site, 18 pages, sitemap, D1-backed serving with `/app/*` SPA fallback | `apps/site/astro.config.mjs:6-17`; `apps/worker/src/static.ts:64-65` |
| Chat over WebSocket with subprotocol auth, exponential-backoff reconnect, typed `ServerMsg` fan-out, history hydration from REST | `use-project-socket.ts:618, 326-440`; `apps/web/src/lib/api.ts:76-77`; `index.ts:148,159` |
| Studio diagnostic-render strip renders real forwarded frames with timestamp/subject/dimensions and prev/next stepping; explicitly refuses "live feed" framing | `apps/web/src/components/ws/studio-view.tsx:47-118`; `workspace.tsx:358` |
| Playtest still-frame card is a pure function of the worker's run record; staleness derived from worker-stamped times | `playtest-card.tsx:64-120`; `apps/web/src/lib/playtest-view.ts:49-59,107-113`; `packages/shared/src/index.ts:517,525` |
| Roadmap page hits real owner-scoped endpoints; returns 409 (not a fake template) with no Studio place attached | `api.ts:104-139`; `index.ts:252-256, 295-299, 317-330` |
| Credits/clearance drawer renders the worker's own attribution report | `credits-panel.tsx:39-45`; `index.ts:185-198` |
| Dashboard does real Supabase CRUD on `projects` under the user's session | `apps/web/src/routes/dashboard.tsx:19, 100-101, 175` |
| Three-state theme with no-flash pre-paint script | `apps/web/index.html:19-27`; `apps/web/src/lib/theme.tsx:5` |

### 1.8 Retrieval corpus (live in production)

| Capability | Evidence |
|---|---|
| `data/chunks.jsonl` is real extracted text: 8,326 chunks / 10.8 MB **[verified: `wc -l` = 8326, 10,836,520 bytes]** | `packages/corpus/data/chunks.jsonl` |
| Indexed in production D1 `golem-corpus`: 8,327 rows in both `chunks` and `chunks_fts`, 2,194 doc slugs (api 1,318 / guide 7,009) | live query; `wrangler.jsonc` CORPUS `32c9471e-a7d7-49ee-a8fe-0a7def2c68bd` **[verified]**; `index.ts:661-691` |
| Vectorize half wired; 3,394 of 8,326 chunks embedded | `wrangler.jsonc` VEC → `golem-docs` **[verified]**; `index.ts:677-680`; `apps/worker/src/rag.ts:32-49` |
| RAG reachable from product UI, not just admin scripts | `tools.ts:6, 1349-1359` (`search_docs`); `index.ts:455-470` (`/api/docs/search`, Spark-charged) |
| 38 real pinned git checkouts with SPDX read from each LICENSE **[verified: 38 dirs + `_registries` + manifest; 9,151 `.luau`, 2,334 `.lua`]** | `packages/corpus/raw/manifest.json:1-40` |
| 316 MB of `raw/` is gitignored; only derived metadata tracked (`git ls-files packages/corpus` = 40 files) | `.gitignore:19-38` |
| Corpus intake policy modules green | `node --test packages/corpus/src/intake/*.test.mjs` → 231 pass / 0 fail |

### 1.9 Evaluation harness

| Capability | Evidence |
|---|---|
| 84 graded tasks / 12 categories / total weight 154; schema-validated at load, ids deduped, closed topic vocabulary **[verified: 12 task files, 28 reference answers]** | `packages/evals/tasks/*.json`; `packages/evals/src/tasks.mjs:64-80, 115-150` |
| Checks proven satisfiable: 28 reference answers each score exactly 1.0, and a reference with the security removed stops scoring 1.0 | `packages/evals/src/scripting-curriculum.test.mjs` → 39 pass |
| Offline self-test green and wired into CI | `node packages/evals/src/selftest.mjs` → PASS; `.github/workflows/ci.yml:88, 217` |
| Real execution evidence against the deployed worker with per-task scores + token usage | `packages/evals/results/with-rag-20260830-201526.json` (11 result files) |
| Genuine deterministic held-out split — **but only over synthetic composition fixtures** | `packages/evals/src/composition-splits.mjs:1-19, 24, 68`; `composition-generalization.test.mjs:91-122` |

---

## 2. DEAD ENDS — the actual work

Ordered by (severity, unblocking value). Severity: **P0 blocker** (a shipped feature is broken or absent),
**P1 major**, **P2 minor**. "Unblocks" names what else becomes possible once it is fixed.

### P0 — must fix before anything is called shipped

**D1. `render_view` crashes the entire workspace UI to the error boundary.**
Missing link: `apps/web/src/lib/generative-ui/adapters.ts:119` reads `result.boundsSize.map(...)`; the worker
sends `boundsSizeStuds` (`apps/worker/src/tools.ts:995`) **[verified: both sides read in this session]**.
`looksLikeRenderResult` (`adapters.ts:271-273`) only checks `subject` + `views`, so the mismatched payload is
accepted then dereferenced → `TypeError: Cannot read properties of undefined (reading 'map')`. Thrown inside
`Turn`'s `useMemo` (`turn.tsx:79-85`) via unguarded `panelFromTool` (`panels.ts:41-54`) → caught only by the
app-wide boundary (`app.tsx:53`, `error-boundary.tsx:19-38`). Two more mismatches sit behind it:
`adapters.ts:102` reads `view.meta.width` (production views are flat) and `view.rgbBase64` (deliberately
stripped at `tools.ts:992-993`). `tsc` cannot catch it — the type predicate lies. Mock mode hides it because
`mock.ts:564-571` feeds an already-valid `{v:1,blocks}` document that early-returns at `adapters.ts:287`.
*Fix:* try/catch `panelFromTool`; require `boundsSize` AND `views[0].meta` in the predicate; then pick one
contract (see D2). *Unblocks:* any use of the visual loop in the product at all.

**D2. The entire generative-UI registry is unreachable in production.**
Missing link: `adapters.ts:284-299` accepts exactly three shapes — a `{v:1,blocks}` document, a render result,
or a critique with `defects[]` + `summary`. No worker code ever emits `{v:1,blocks}` (zero matches in
`apps/worker/src`); no prompt instructs the model to emit the ```golem-ui fence (it exists only in
`validate.ts:965-971` and one test); `inspect_visually` returns `{text,score,passed}` (`tools.ts:1065`) and
`check_composition` returns `{structure,passed,failures,guidance}` (`tools.ts:1032-1041`) — neither satisfies
`looksLikeCritique`. Net: 2,843 LOC and 17 of 19 block types render only in `/ui-lab` fixtures.
*Fix:* per-tool adapters in `adapters.ts` for the shapes the worker actually returns, plus a contract test
feeding every tool's real result shape through `documentFromToolDetail`.
*Unblocks:* D3 (Validation stage), D4 (QA fixtures), asset picker, code diff, build plan, test report.

**D3. No cheap-chat vs heavy-build classification — a greeting costs a full build cycle and ends in an apology.**
Missing link: `session.ts:1021-1043` — `owesWork = mode !== 'clay' && !agent.mutated && studioConnected` has
no notion of a question. A greeting in Agent mode with Studio connected: `reasoning.ts:99` flags any text
under 25 chars `ambiguousRequest` → `:139` escalates to `'high'` effort → `session.ts:637` spends a Spark →
`:705-725` takes a full `snapshot root:'game' includeScripts:true` (60s op) → model replies with prose →
`:1022` fires the nudge twice (`MAX_NUDGES=2` at `:137`, two more paid calls) → `:1043` finishes `'incomplete'`
printing *"I did not change anything in your project… which is a fault on my side rather than a result."*
(`:1212-1216`). No classifier exists anywhere.
*Fix:* classify in `startRunInner` before the checkpoint (`semantic.ts` intentCheck already runs at
`session.ts:648`) into `converse|inspect|build`; for `converse` skip the checkpoint, withhold tools beyond
`search_docs`/`remember`, force `effort='low'`, `maxSteps=1`, `owesWork=false`. Make `owesWork` a property of
classified intent, never of `!mutated`. *Unblocks:* the single largest per-request cost saving and the worst
first-impression bug in the product.

**D4. `search_asset_library` can never return a hit, and its honest error branch is unreachable dead code.**
Missing link: `asset-library.ts:458` `ensureAssetTables` and `:562` `upsertAssets` have zero callers repo-wide
(asserted by `apps/worker/tests/asset-library-availability.test.mjs:60-85`). No migration creates
`asset_library` — `infra/supabase/migrations/*.sql` are Supabase-only and `/api/admin/corpus-init`
(`index.ts:661-669`) creates only `chunks`/`chunks_fts`. All 20 `SEED_MANIFEST` rows carry
`robloxAssetId: null`, so even after ingest none would be insertable (`asset-library.ts:775`). **Worse:**
`asset-library.ts:729-732` wraps both retrievers in `.catch(() => [])`, so the `no such table` error never
escapes, the honest branch at `tools.ts:1104-1125` can never fire, and the tool returns `[]` — which the model
reads as *"the curated library has nothing like that"*. The pinning test only regex-greps the SOURCE TEXT of
`tools.ts`, so it passes while the behaviour is broken. The system prompt (`prompts.ts:31-32`) tells the model
to try this tool FIRST, and every call pays for an embedding (`asset-library.ts:781` → `gateway.ts:357-372`).
*Fix:* re-throw on `no such table`; change the test to call `searchAssetLibrary` against a throwing D1 stub;
then either ship the ingest or withhold the tool from `toolDefs` when the table is absent.

**D5. The shipped plugin binary is older than the source and has no asset-policy gate.**
Missing link: `apps/plugin/release/golem-plugin.rbxm` decodes to `VERSION "0.1.0"` while
`apps/plugin/src/Version.luau:36` is `0.2.0`; it contains ZERO occurrences of `GenerateModelAsync`,
`setAssetPolicy`, or `verifiedAssetIds`. Independently corroborated by a first-party measurement in the worker:
`tools.ts:1015-1018` records that *the plugin installed in the owner's Studio returns `render_view` WITHOUT a
`layout` field* — a field `Render.luau:335` has emitted since. The released build a user installs has no asset
gate at all. *Fix:* rebuild + republish from current source; add a CI assertion that the artifact's embedded
VERSION equals `Version.luau`, or drop the artifact from the repo.

**D6. No user can install the plugin.**
Missing link: `packages/shared/src/index.ts:869` `STUDIO_PLUGIN_STORE_LIVE = false` **[verified]** →
`:886-888` makes `STUDIO_PLUGIN_INSTALL_HREF` resolve to `/docs/plugin`, so the install buttons
(`connect-studio.tsx:74`, `pairing-dialog.tsx:134`) point at a docs page.
`.github/workflows/plugin-release.yml:1-48` states publishing is manual-only (Open Cloud cannot update a
Plugin asset). The only real install path is `rojo build` from source — a developer path, not a product path.
*Fix:* owner action (Creator Dashboard → Distribution → Distribute on Creator Store), then flip the flag.
*Blocked on owner.* See §7.

**D7. `generate_model` output cannot be saved, published, or checkpointed.**
Missing link: chain ends at `Generation.luau:222-229` returning `sessionScoped = true` (a hardcoded literal at
`:160` and `:231`). `AssetService:CreateAssetAsync` appears nowhere in `apps/` — only in a comment
(`Generation.luau:21`) and docs. Geometry exists only in the live edit DataModel and is lost on save/publish.
It cannot even be checkpointed: `Serializer.luau:23` records only `MeshId`/`TextureID` for a MeshPart and
`GenerateModelAsync` output carries an Opaque Content with empty `MeshId`, so restore recreates a blank
MeshPart while `Serializer.luau:266-274` still reports `restored: true`.
*Fix:* `CreateEditableMeshAsync(part.MeshContent)` → `CreateAssetAsync(Enum.AssetType.Mesh)` →
`CreateMeshPartAsync`, then register the id into `sessionVerifiedAssets` and write a provenance row.

**D8. Checkpoint restore can silently lose state while reporting success.**
Missing link: `Serializer.luau:17-65` is a hand-written per-class property whitelist — everything outside it is
lost silently. `Serializer.luau:13` excludes Terrain from `SKIP_CLASSES` entirely, so terrain (which
`tools.ts:813` advertises as a `run_luau` use case) is never snapshotted. `:222-232` destroys the live tree
before rebuilding. `:264-267` counts failed property writes in `failedProps` but **excludes them from the
`restored` predicate**, so a restore that recreated every instance with the wrong Size/CFrame/Material reports
`restored: true`, `Ops.luau:690-692` passes it as ok, and `session.ts:1744` reports success to the user.
*Fix:* include Terrain; fail the op or surface the count when `failedProps > 0`.

**D9. `pnpm chunk` cannot find its inputs and silently overwrites the only local corpus copy.**
Missing link: `packages/corpus/src/chunk.mjs:19-20` looks for `raw/creator-docs/content/en-us` and
`raw/luau-site`; `fetch.mjs:76-80` writes `owner__repo`, so the real directories are
`raw/Roblox__creator-docs` and `raw/luau-lang__site` **[verified on disk]**. `main()` at `:475-512` does not
abort on empty input — it writes `chunks.jsonl` unconditionally at `:504-507`, replacing the 10.8 MB /
8,326-chunk artifact with a single newline. `package.json:12` wires this into `pnpm all` **[verified]**.
Second defect behind it: `chunk.mjs:443` reads `manifest.sources['luau-site'].license`; the manifest key is
`luau-lang__site` and the field is spelled `licence` — so the licence gate would skip Luau docs even after the
path fix. *Fix:* resolve directories via `raw/manifest.json` by `corpusId`; refuse to write below a floor of
the previous file's count. *Unblocks:* §5 entirely — the corpus is currently frozen at one build.

**D10. `generate_image` is a paid no-op.**
Missing link: `tools.ts:1340` → `imagegen.ts:691-694` writes KV key `image:<uuid>` with a 1 h TTL. `imageKey`
appears at exactly three places in the repo: the tool description (`tools.ts:1293`), the write (`:1335`), the
return (`:1337`). No HTTP route serves it, no web component renders it, the plugin never fetches it. There is
also no upload leg to build on: no Open Cloud assets API call exists anywhere, and `Paths.luau:188-205` would
refuse a `Texture`/`Image` assignment for an id that never went through `insert_asset`. Every call is spend
with zero retained value, and `imagegen.ts:612-614` states it settles against the global ledger only — user
Sparks are untouched. *Fix:* either build the upload leg (Studio-side `CreateAssetAsync`, or Open Cloud under
a credential that does not exist yet) or delete the tool.

**D11. No audio, sound, music, or voice capability of any kind.**
Missing link: absent throughout. `assets.ts:53-69` `ASSET_NEEDS` has ten kinds, none audio. No tool touches
audio. `Paths.luau:196` gates `SoundId` as an asset reference but the verify gate refuses every type except
Image/Decal/MeshPart (`assets.ts:432-441`), so setting `SoundId` is **structurally impossible**. Voice input is
a hard-disabled button (`composer.tsx:185-191`, title *"Voice input isn't supported yet"*); no
`getUserMedia`/`MediaRecorder`/speech API in `apps/web/src`. *Fix:* greenfield — new asset kind, new
moderation rules (Roblox audio is privacy-restricted; most uploads are not Open Use), new Creator Store
category, and for generation a new paid third-party dependency plus a licence class the provenance model does
not cover.

### P1 — major

**D12. Provenance sets are lost between steps, so the intended library→insert flow cannot work.**
`ctx.discoveredAssetIds` / `ctx.libraryAssetIds` are plain fields on `AgentCtx` (`tools.ts:83,90`) populated at
`:1130-1133, 1154`, but `AgentCtx` is rebuilt from scratch every step (`session.ts:1051`) and `agentCtx()`
(`:1294-1317`) sets neither. Search in step N + insert in step N+1 arrives with both undefined → provenance
degrades to `user_supplied`, the library waiver at `tools.ts:1207` is skipped, and the full Creator Store gate
runs against an asset that by construction has none of its attributes.
*Fix:* persist both sets on `AgentState` and rehydrate in `agentCtx()`.

**D13. Per-user metering does not cover tool-invoked inference.**
`session.ts:925-941` charges Sparks only from the step's own `llmChat`. Vision critique
(`vision.ts:313-330`, effort `high`, 2,000 max tokens, reached from `tools.ts:1063` AND the automatic gate at
`session.ts:965-972`), image generation (`imagegen.ts:615-643`, explicitly *"NOT CHARGED TO USER SPARKS"* at
`:614`), and embeddings (`gateway.ts:357-373`) all settle against the global BudgetDO only. A user driving
`inspect_visually`/`generate_image` consumes the whole service's daily allocation while their own meter barely
moves. *Fix:* give `AgentCtx` a `chargeNeurons(n)` the DO wires to `quotaSpend`.

**D14. BudgetDO reservations leak capacity permanently.**
`do/budget.ts:188-226` increments `dayPending` on reserve; only `/settle` (`:229-231`) or `/release`
(`:256-258`) decrement it, both fire-and-forget with `.catch(() => {})` (`gateway.ts:143-152`). Any throw
between a successful invoke and settle (`adapter.decode` at `gateway.ts:318`, isolate eviction, client
disconnect) leaves the reservation pending forever. No reaper; the only reset is the UTC rollover
(`budget.ts:88-92`). Leaked neurons count against the day ceiling (`:213-216`), so repeated decode failures
progressively shrink service capacity with no operator signal — reading as an outage, not a budget event.
*Fix:* id + timestamp per reservation, expire >5 min in `/reserve`'s prologue; stop swallowing settle failures.

**D15. The persisted transcript does not match what the user was shown.**
`session.ts:947-948` sets `finalText = res.text` (last step only) while `streamedText` accumulates every step.
`finishRun` persists `content = agent.finalText` (`:1217, 1222-1230`), so every earlier step's narration is
dropped from the SQL row that `/api/projects/:id/messages` replays. And `:1218-1221` compares
`content !== agent.streamedText`, so on any multi-step run that emitted text more than once it re-broadcasts
the final step's text a second time — connected clients render the tail twice, refreshed clients see only the
tail. *Fix:* persist `streamedText`; broadcast only `content.slice(streamedText.length)`.

**D16. `uiTools` is never shed, so an oversized run state can reject its final put.**
`session.ts:1099-1108` pushes up to 60 `uiTools` entries each carrying up to `MAX_DETAIL_CHARS = 24,000`
(`tools.ts:1404`) into `AgentState` (`:112`), persisted through `persistWithShedding` (`:1152`).
`persist.ts:74-80` sheds `llm`, `trace`, `seenCalls`, `lastCalls` — never `uiTools` — and the terminal fallback
`:85-91` keeps them too. A run exceeding the 128 KiB DO value cap cannot be shed down, the put rejects, the
alarm retries, and the retry re-runs that step's **paid** LLM call and its **mutating** tools. This is exactly
the failure `persist.ts:1-8` exists to prevent. *Fix:* shed `uiTools` (detail first, then entries) and cap
total bytes, not only entry count.

**D17. Terminal shed writes a run the browser will spin on forever.**
`persist.ts:86-96` writes `{status:'idle', finalText: TOO_LARGE_MESSAGE}` and returns. The caller
(`session.ts:1151-1153`) ignores the `PersistOutcome`, so `runStep` still calls `setAlarm` (`:1149`); the next
alarm loads `'idle'` and returns at `:758`. No assistant row is inserted, no `msg_end` is broadcast.
*Fix:* return the outcome and call `finishRun(agent, 'error', TOO_LARGE_MESSAGE)` on `'terminal'`.

**D18. Assistant turns with more than four tool calls orphan their tool_call ids.**
`session.ts:1048` pushes ALL of `res.toolCalls` into the transcript but `:1053` iterates only
`res.toolCalls.slice(0, 4)`, and the loop can `break` early on stop (`:1116-1119`). Calls past the fourth get
no `tool` message, leaving assistant tool_call ids with no matching result for the rest of the run. Nothing
caps `toolCalls` upstream (`gateway.ts:322-347`), and `orphanedToolMessages` (`transcript.ts:101-107`) only
checks the opposite direction. *Fix:* emit a synthetic `not executed — step limit` result for every skipped call.

**D19. `run_code` ignores its declared timeout and blocks the plugin's only poll loop.**
`tools.ts:820` sends `timeoutMs: 10_000` and `packages/shared/src/index.ts:57` declares it, but
`Ops.luau:437-469` never reads it — it requires the module synchronously with no deadline. When model-authored
Luau runs long, the worker's 25 s op timeout fires while the plugin keeps executing; the single poll loop is
blocked, and since `pluginConnected()` treats the plugin as gone after 8 s (`session.ts:303-307`), everything
after reads as *"Studio is not connected"*. Same blocking applies to `generate_model` (90 s) and `restore`
(120 s). `Render.luau` contains zero `task.wait` **and** `view:"all"` runs the full-workspace loop five times
under a 90 s worker timeout — the renderer is exempt from the rule `Ops.luau:326-334` enforces on `run_code`.
*Fix:* `task.spawn` with a deadline (as `Generation.withTimeout` does); yield every N scanlines in
`renderView`; raise the staleness window above the longest blocking op.

**D20. `render_view` / `inspect_visually` do not frame the requested target.**
`Render.luau:312-321` resolves `rootPath` only for bounds/framing; `renderView:228` iterates
`workspace:GetDescendants()` unconditionally. "Render this model" renders the whole place from a close camera,
and the critique (`vision.ts:243-357`) judges the whole scene against the target's intent — `subjectCoverage`
and `partsVisible` describe the wrong subject. *Fix:* iterate `root:GetDescendants()`.

**D21. The rasteriser draws every part as a box — the critic never sees real geometry.**
`Render.luau:19-27` defines one unit-cube vertex/face table and `:233-278` rasterises every renderable
BasePart through it. No branch on Shape, ClassName, WedgePart, MeshPart or CSG; surface colour is `part.Color`
only (`:254`), no texture/decal/SurfaceAppearance sampling. Every MeshPart (including every `generate_model`
and `insert_asset` result), wedge, sphere, cylinder, truss and union is a coloured box.
`docs/MISSION-LEDGER.md:57` records a world built from 84 wedges + 14 corner wedges — the critic saw cubes.
Nothing in the UI copy or the critic prompt states this, though `Render.luau:372-375` already does exactly
that for lighting. *Fix:* add a wedge triangle table at minimum; state the box approximation in the critic
prompt and the StudioView caption.

**D22. `inspect_visually`'s measured-layout half silently disappears on skewed plugins.**
`vision.ts:276-278` calls `analyseLayout(result.layout, …)`; `layout` is optional on the wire
(`packages/shared/src/index.ts:197`) and `composition.ts:453-462` records the MEASURED finding that the
installed plugin does not return it — which is why `check_composition` was rewritten to use `run_code`.
`vision.ts` never got the same treatment, so the grid-clone / mechanical-spacing / flat-plate hard fails
(`layout.ts:103-116`) never fire and the critique degrades to pixels + opinion with no error anywhere.
*Fix:* fetch geometry with `LAYOUT_LUAU` when `result.layout` is absent, or say "layout analysis unavailable".

**D23. The QC verdict `generate_model` calls "authoritative" is arbitrarily truncated.**
`Ops.luau:619-627` returns the full Verdict (~13 checks × name/status/detail/remediation, 18 measurement
fields, `failures[]`, `remediation[]`) AND `qcText` repeating all of it as prose. `tools.ts:1447` truncates the
serialized result at `MAX_RESULT_CHARS = 3000` (`:131`). The payload routinely exceeds that, and because the
plugin returns a Lua table with string keys, `JSONEncode` key order is not guaranteed — which half survives is
arbitrary. `run_and_check` orders its safety fields first for exactly this reason (`tools.ts:951-953`);
`generate_model` and `inspect_model` do not. *Fix:* return `qcText` only, verdict-first.

**D24. Checkpoint restore is not serialised against a running agent.**
`session.ts:576-580` handles the browser's `checkpoint_restore` with no check that a run is in flight — unlike
`startRun`, which is single-flight gated (`:613-627`). The restore op is queued on the same `opQueue`
(`:1521`) and applied FIFO between two agent ops; the agent then builds onto a rolled-back tree with a stale
mental model and no error. Same gap on `checkpoint_create` (`:571-575`) and `POST /checkpoint` (`:429-434`).
*Fix:* refuse while `agent.status !== 'idle'`, or request a stop and restore after `finishRun`.

**D25. No idempotency or redelivery for Studio ops.**
Op ids are stable (`session.ts:1517`) but nothing on the plugin records applied ids — `Ops.execute`
(`Ops.luau:640`) takes an `id` and only echoes it. `session.ts:1650-1672` documents at-most-once as a
deliberate decision; a plugin that dies between receiving and reporting loses the batch, surfacing as a 30 s
timeout. The only dedup is run-scoped and semantic (`seenCalls`, `session.ts:1052-1076`, bounded 40).
*Fix:* bounded applied-op LRU in `Ops.luau` replying with the cached result; requires a PROTOCOL bump
(`apps/worker/src/plugin-version.ts:53-62`).

**D26. Property-assignment failures report success and COMMIT the undo waypoint.**
`Ops.luau:241-254` (`create_instances`) and `:255-274` (`set_props`) collect every per-property failure into
`propIssues` and return a table with **no `error` key**. `Ops.execute:686-692` only fails an op carrying
`error`, so an op in which every property — including every asset-gate refusal from `Paths.setProp:291-296` —
failed still returns `ok = true` and commits. The agent sees a success.
*Fix:* set `result.error` when nothing was set, or when the refusal came from the asset gate.

**D27. `verifiedAssetIds` is read by the plugin and set by nobody.**
`Ops.luau:48-56` reads `opBody.verifiedAssetIds`, but `tools.ts:793` and `:802` emit no such field and the
`StudioOp` union (`packages/shared/src/index.ts:55-56`) does not declare it. It exists only in tests and at
`index.ts:888` where it is stripped. The only permitted ids in production come from the in-memory
`sessionVerifiedAssets` table (`Ops.luau:30`, written only at `:601`), lost on every Studio restart.
*Fix:* populate it from worker provenance and add it to the type; or persist `sessionVerifiedAssets`.

**D28. `brokerAsset` and its 14-step orchestration have no caller — ~1,500 of 3,393 lines of `assets.ts` are unreachable.**
`assets.ts:3123-3383` (`brokerAsset`, `BROKER_STEPS` at `:2758-2774`), plus `scoreAssetStyle`,
`rankAssetsByStyle`, `buildPaletteContext`, `scoreAssetCoherence`, `buildNormaliseLuau`, `buildTransformLuau`
— grep finds only `assets.ts` itself and one comment at `tools.ts:181`. `tools.ts:9-12` imports exactly four
symbols. `COHERENCE_FLOOR` (`:2314`), `BIOME_PROFILES` (`:2050`), `SCALE_ENVELOPES` (`:330`) gate nothing.
An inserted Creator Store asset gets **no style, scale, or palette check at all**.
*Fix:* route `insert_asset` through `brokerAsset`, or delete the orchestration and keep the pure scorers.

**D29. The adversarial six-lens critic is an eval component, not a product gate.**
`critic.ts:852` `runCriticPanel` is imported only by `packages/evals/src/critic.mjs:220`. Its `CriticInput`
(`critic.ts:120-144`) carries **no pixels** and its `Judge` type (`:146`) is text-only, so even the
`request_fidelity` lens sees no image. The product path is `critiqueViews` (`vision.ts:243`), the single-model
critic `critic.ts:4-9` was written to replace ("the measured failure mode is agreeable vague praise").
*Fix:* wire it with an image channel, or label it explicitly as an offline harness.

**D30. `recordVerification` — the audit log that makes "never guess asset IDs" provable — has no caller.**
`asset-library.ts:599-639` writes the append-only `asset_verification_log` described at `:481-484` as *"what
makes never guess asset IDs provable after the fact rather than merely asserted"*. Neither
`verifyCreatorStoreAsset` (`assets.ts:714`) nor `insert_asset` (`tools.ts:1199`) persists its verdict, and the
table is created only by the never-called `ensureAssetTables`.

**D31. Provenance has no dependency chain — a MeshPart's separately-licensed texture is credited under its parent.**
`provenance.ts` models one row per (project, asset) (`:81-97`, iterated flat at `:294, 457`);
`AssetProvenance` (`asset-library.ts:90-138`) has no children/textures field. `insertAndProveClean` walks the
hierarchy for SCRIPTS (`tools.ts:310-335`) and discards the `MeshId`/`TextureID` values it sees;
`recordPlacedAsset` (`:710`) writes one row for the top-level id. Downstream, `tools.ts:687-689` hits the
missing library table so every placement is written `unaccounted:roblox:<id>`, graded `missing_provenance` at
severity `blocker` (`provenance.ts:293-305`) — the credits surface is permanently red and `ok` is never true.

**D32. Five Supabase tables have RLS policies and no writer.**
`messages`, `checkpoints`, `usage_events` (`0001_init.sql:28-65`), `feedback` (`:67-84`, zero writers),
`studio_pairings` (`:112`, RLS enabled with **zero policies** = total deny, and the worker has no service-role
key). `supaRest` is called from exactly two places (`index.ts:136, 431`) plus one PATCH (`session.ts:1277`).
The API routes named for these tables read DO storage instead (`index.ts:159-169`, `:445`). The comment at
`0001_init.sql:144` claiming pairings are "managed via the Worker (service role)" is false.
*Consequence:* chat history and checkpoints do not survive DO eviction, and the schema describes a system that
does not exist.

**D33. Admin surface is full cross-tenant control behind one static key.**
`index.ts:69-71` exempts `/api/admin/*` from user auth entirely; the only gate is `ADMIN_KEY` compared at
`:113-121`. That key grants: mutating any user's place without consent (`POST /api/admin/run-tool/:id` →
`:814-816` → `session.ts:476-480` with the full toolset), spending as any project (`:798-805`), wiping any
user's Spark ledger (`:701-709`), upgrading any user to pro (`:710-717`), and raising the service spend ceiling
(`:622-628` → `budget.ts:132-146`). The brute-force throttle is per-isolate and self-wiping: `index.ts:50-61`,
where `if (ipHits.size > 5000) ipHits.clear()` lets an attacker reset the counter at will.
*Fix:* split into a read-only ops key and a rotatable mutating key (or Cloudflare Access); exclude
`admin-fail:` keys from the sweep or move the counter into `ADMIN_DO`.

**D34. No per-tool argument schema validation.**
`tools.ts:1438-1442` JSON-parses model output into `Record<string, unknown>` and hands it to `impl.run`. The
only validation is "is it valid JSON". Dangerous sinks are individually defended
(`refuseLuauIngress:821`, asset gate `assets.ts:612`, `isSafeLuauPath`), so this is a missing systemic guard
rather than an open hole. The fixture harness already exists at `security.test.mjs:649`.

**D35. Three divergent CSS token sets and three brand marks ship simultaneously.**
(1) `apps/web/src/styles.css:28-199` — `--paper #100e0c`, `--acc-ember #ff9a4d`, Inter.
(2) `apps/web/src/styles/workspace.css:18-66` — `--gx-ground #0b0a09`, `--gx-amber #c98a3c`, scoped to `.gx`.
(3) `apps/site/src/styles/global.css:20-110` — Fraunces, its own `--paper`/`--acc-ember`.
So `body` is `#100e0c` but `.gx-shell` is `#0b0a09`; `.btn-primary` is `#ff9a4d` but the workspace accent is
`#c98a3c`. Routes split by system: `workspace.tsx`/`layout.tsx`/`ws/*` are all `gx-`;
dashboard/usage/settings/admin/auth/ui-lab use ZERO `gx-` classes; roadmap uses `rm-`; generative UI uses `gu-`
(225 selectors). Marks: `glyphs.tsx:17-45` and `GolemMark.astro:31` (hexagon + cube) vs
`apps/web/index.html:12` favicon (hexagon + amber dot) vs `apps/site/public/favicon.svg` (a different
"monolith" path the mark files say is superseded). **The rebrand is the natural moment to collapse this.**

**D36. No held-out split for the 84 model-facing eval tasks, and every committed result predates the current set.**
`tasks.mjs:115-150` filters only by `categories`/`limit` — no split, seed, or set assignment. The split
machinery in `composition-splits.mjs` operates on synthetic geometry fixtures only. All 11 files in
`packages/evals/results/` are dated 2026-08-30/31 and report `taskCount 56`; `tasks/` now holds 84
**[verified: 12 task files]**, and the four `scripting-*.json` files carrying 89 of the 154 total weight appear
in no result. Every quoted score is an in-sample number on a task set authored alongside the prompts.

**D37. Corpus upload is not idempotent.**
`index.ts:684` `insert into chunks_fts(...)` has no `ON CONFLICT` and FTS5 has no unique constraint, while the
sibling insert into `chunks` (`:681-683`) upserts. The only guard is `data/upload-progress.json` (gitignored,
keyed on a sha1 of `chunks.jsonl`, reset by any regeneration). Production is currently clean (8,327 = 8,327).

**D38. `PROVENANCE.md` under-reports the corpus by 36 sources.**
It documents `Roblox/creator-docs` and `luau-lang/site` only and closes "nothing from the corpus is committed
to this repository" — accurate for `raw/`, but silent on the other 36 checkouts (30 MIT, 7 Apache-2.0) and the
43 MB `_registries` clone. The real machine-verified ledger is `raw/manifest.json` + generated
`docs/SOURCE_MANIFEST.md`, which `PROVENANCE.md` does not reference.

### P2 — minor

- **D39.** `selectProvider` (`providers/registry.ts:128-190`) is never on an inference path — `gateway.ts:203`
  uses `adapterForModelId(cfg.id)`. Its only callers are `index.ts:424` (a `ready` bool) and `:536` (admin table).
- **D40.** Alternate providers are unusable: `env.ts:32-39` keys unset **[verified]**; `deepseek.ts:79-90`
  throws before any network call; pointing a model key at a non-Workers-AI id requires an admin KV write.
- **D41.** Reconnect never replays build renders — `session.ts:357-362` replays the ring only inside
  `if (this.playtestRun)`, contradicting the comment at `:1302-1306`. The ring is also never cleared between
  runs, so it can mix stale build renders with playtest frames.
- **D42.** Worker-side `frameFreshness`/`elapsedMs` (`playtest-stream.ts:95-122`) are dead code; the browser
  duplicates the implementation (`playtest-view.ts:49-59`). The header comment at `:20-25` overstates.
- **D43.** `worldbuilding.ts` `SCENE_PLAN_SCHEMA` (`:466-521`) and `moodLuau` (`:424-457`) have no callers —
  only `worldBuildingBrief` (`:413`) is consumed, at `prompts.ts:4`.
- **D44.** `staleAssets`/`markHealth` (`asset-library.ts:837, 847`) feed "the nightly health-check cron" that
  does not exist — `wrangler.jsonc` has no `triggers` block **[verified]**.
- **D45.** `VEC_ASSETS` declared (`env.ts:24`) but not bound **[verified]**, so `asset-library.ts:783` always
  falls back to the DOCS index with `filter {ns:'asset'}` and returns nothing — after paying for an embedding.
- **D46.** `assetThumbnailUrl` (`assets.ts:522-524`) and every verdict's `thumbnailUrl` are never read;
  `find_verified_asset` strips it (`tools.ts:1160`).
- **D47.** `/ui-lab` has no link from product UI (`app.tsx:98-105` registered; grep finds no NavLink) and is
  the only place 17 of 19 block types can be seen.
- **D48.** Roadmap `?polish=1` spends 1 Spark (`index.ts:262-268`) and is never sent —
  `api.ts:104-109` accepts it, `roadmap.tsx:69` never passes it. A latent cost waiting to be wired.
- **D49.** `/api/waitlist` is in `AUTH_EXEMPT` (`index.ts:71`) with no handler — a pre-opened hole.
- **D50.** `MOCK_MODE` build-time flag is not DEV-gated: `mock.ts:40` `FLAG = VITE_GOLEM_MOCK === '1'`, so a
  production build with that env var ships a bundle where `auth.tsx:22-28` fabricates a session. Backend is
  unaffected (still demands a real JWT), so the failure mode is UI chrome + 401s.
- **D51.** Plugin has no backoff: any failure → fixed `task.wait(3)` forever (`init.server.luau:297-301`), and
  every HTTP failure collapses to "Connection hiccup" (`:84-86`), so a user with no HTTP permission is
  misdiagnosed.
- **D52.** Headless-pairing loop (`init.server.luau:399-415`) reads no generation counter and survives a plugin
  reload, polling ServerStorage forever. Opt-in per machine, so bounded.
- **D53.** Generation rate limit is module-local in-memory (`Generation.luau:56`), reset on Studio restart and
  not shared across windows; `:181` consumes a slot BEFORE the call, so a timed-out generation burns it.
- **D54.** Zero test coverage for the adapter path: `adapters.ts:17-18` uses extensionless relative imports
  that Node's test runner cannot resolve, and no test file imports it. Same for `GenerateModelAsync` —
  `generation.spec.luau:101-105` states plainly it does not fake `GenerationService`.
- **D55.** 10 orphan `--gl-*` CSS tokens in `apps/site/src/styles/global.css:104-109, 157-161` under the
  comment "WebGL scene reads these" — nothing reads them (cancelled 3D mascot).
- **D56.** Native Studio viewport capture is **not obtainable in-engine** — measured, not inferred:
  `ThumbnailGenerator` is not a valid service name and `CaptureService:CaptureScreenshot`'s callback never
  fires in edit mode (`docs/VISUAL-LOOP.md:15-17`, re-verified `docs/MISSION-LEDGER.md:57`). The only native
  path is Roblox's own Studio MCP `screen_capture` — a local developer tool, and
  `docs/evidence/2026-09-01-capture-transport-discriminated.md` records it timing out and taking the whole MCP
  transport down across five attempts. A real capture requires either a Roblox PluginSecurity readback API
  (does not exist) or a signed companion desktop app with OS screen-recording permission. **This is a product
  decision, not a bug. Do not let copy drift toward "viewport."**
- **D57.** `lemonade-har-analysis.md` does not describe the HAR on disk. SHA-256 mismatch
  (`576ec182…` actual vs `8b56f9f1…` claimed), 18,748,641 bytes vs 10,699,961, 228 entries vs 203, 39 JS vs 65,
  181 WS frames vs 202, 90 messages vs 61, and a status census of `{200:226, 206:1, 101:1}` — **no 560, no 5xx
  of any kind**. The cited "~65 s HTTP 560 door failure" is REFUTED for this file: the only `/api/agent` entry
  is one POST that SUCCEEDED (200, 152.55 s). No Sentry host is contacted. *Action: stop citing its numbers.*
  The raw HAR remains useful — see §3 and §6 for what it genuinely supports.

---

## 3. COST LEDGER

### 3.1 Plan floor — settled with live documentation

| Resource | Free plan? | Verdict |
|---|---|---|
| **Durable Objects (SQLite-backed)** | **YES** | Live Cloudflare docs: *"Durable Objects are available both on Workers Free and Workers Paid plans. Workers Free plan: Only Durable Objects with SQLite storage backend are available."* `wrangler.jsonc` migrations use `new_sqlite_classes` for all five classes **[verified]** → **DO does NOT force a paid plan.** |
| **Vectorize** | **YES** | Live Cloudflare docs, Vectorize intro: *"Vectorize is available to all users on the Workers Free or Paid plans."* Free caps: 30M queried / 5M stored dimensions, hard. **`docs/research/spend-caps.md:156` is WRONG; `docs/research/cf-free-limits.md:67` is RIGHT. Correct the former.** → **Vectorize does NOT force a paid plan.** |
| **D1, KV, Workers, Workers AI binding** | YES | Free-tier hard caps, no overage on Free. |
| **`@cf/zai-org/glm-5.3-flash` — the sole production model** | **NO** | Cloudflare, verbatim (`docs/research/spend-caps.md:206`): *"Some models require a paid billing method. This applies to … `@cf/zai-org/glm-5.3-flash` … You can access these models with either the Workers Paid plan or prepaid AI Gateway credits."* On Workers Free: HTTP 403 / error 5035 (`:218`). **This — and only this — is what forces a paid plan.** |

**Verdict: zero recurring cost and a running product are mutually exclusive *as currently configured*, and the
single cause is the model choice, not the infrastructure.** All five model keys resolve to `glm-5.3-flash`
(`gateway.ts:84-94` **[verified]**). `pricing.ts:29-33` already carries priced entries for
`@cf/openai/gpt-oss-120b`, `@cf/openai/gpt-oss-20b` and `@cf/qwen/qwen3-30b-a3b-fp8`, **none of which appear on
Cloudflare's paid-billing-required list**. Switching `DEFAULT_MODELS` to one of those makes true $0/month
reachable — at a quality cost that must be measured, not assumed (see §6 step 4).

### 3.2 What the code actually budgets for

The repo does **not** enforce zero cost and never intended to — it enforces **~$10.06/month**:

| Constant | Value | Meaning |
|---|---|---|
| `FREE_NEURONS_PER_DAY` (`pricing.ts:80`) | 10,000 | Cloudflare's included allocation |
| `BILLABLE_NEURONS_PER_DAY` (`pricing.ts:84`) | **15,000** | Deliberate spend beyond free ≈ $5.02/mo |
| `BILLABLE_NEURONS_PER_MONTH` (`pricing.ts:87`) | **460,000** | Independent backstop ≈ $5.06 |
| `MAX_NEURONS_PER_REQUEST` (`pricing.ts:93`) | 1,200 | One request cannot drain the day |
| `NEURONS_PER_SPARK` (`pricing.ts:105`) | 30 | User-facing unit |
| `PLAN_LIMITS.free` (`pricing.ts:108`) | 60 Sparks/day | = 1,800 neurons/user/day |
| Workers Paid seat | $5.00/mo | Forced by the model choice |
| **Documented hard maximum** | **$10.06/mo** | `docs/COST-MODEL.md:190`; asserted by `packages/evals/src/economics.test.mjs:129-134` |

**To make it zero:** set `BILLABLE_NEURONS_PER_DAY = 0` and `BILLABLE_NEURONS_PER_MONTH = 0`. The DO arithmetic
already supports it — `budget.ts:211` computes `dayCeiling = FREE + limits.billableNeuronsPerDay`, so zero
yields a 10,000-neuron/day ceiling that never bills. Then lower the clamp floor at `budget.ts:136-137`.

### 3.3 Billable resources — does it bill or does it block?

| Resource | Behaviour at the limit | Risk |
|---|---|---|
| Workers AI inference | **BLOCKS** — `BudgetError` thrown before invoke (`gateway.ts:132-137`) | Capacity cliff, not a bill. 25,000 neurons/day service-wide ÷ 1,800/free-user = **~13 fully-active free users exhaust the entire day**; every further user gets `daily_cap`. |
| **Durable Object residency** | **BILLS, uncapped, and is the largest recurring line item** | `session.ts:1628-1645` holds every plugin poll 6,000 ms (4,000 ms mid-run) then re-polls after 1,000 ms (`:1676`) — a paired SessionDO is in-flight ~85% of wall-clock, continuously, per project. ~128 MB × ~2.2 M active s/month ≈ **285,000 GB-s per always-connected project**; one project roughly consumes the entire 400,000 GB-s monthly allowance. The in-code comment claiming "one request per ~13 s" is stale. **This dwarfs the ~$5/mo AI ceiling the budget code is built around.** No idle timeout, no disconnect-after-N-minutes; the plugin never stops polling (`init.server.luau:265-302`). |
| D1 rows, KV ops, Workers requests/CPU, Vectorize dimensions | **No platform hard cap on a paid plan** (`docs/research/spend-caps.md:279`) | Only limiter is the per-isolate best-effort `ipLimited` (`index.ts:51-62`), which the code itself labels defence-in-depth. **BudgetDO bounds neurons and nothing bounds the other five meters.** |
| Checkpoint storage | Bounded per project (25 retained, `session.ts:1716-1718`) but churns constantly | Each from a payload capped at 12 MB uncompressed (`session.ts:142`), stored as gzip chunks in DO SQLite. A pre-agent checkpoint is taken on **every** non-Plan run (`:735`) — including runs triggered by a greeting (D3). |
| KV writes | Free-plan cap 1,000/day | Two write sites only (`imagegen.ts:693`, `index.ts:657`). Safe today, but image gen is metered on **neurons, not KV writes**, so a neuron-cheap/image-heavy pattern hits the KV cap first. |
| AI Gateway logging | Bills on retained volume | `collectLog: true` on every call (`providers/workers-ai.ts` gatewayOpts). |
| Supabase | Free project pauses on inactivity rather than bills | JWKS fetch cached 12 h (`auth.ts:11`), unmetered. |
| Roblox APIs, `GenerationService` | Free | `ROBLOX_API_KEY` is a free read-scope credential and optional (`env.ts:16-21` **[verified]**). `GenerationService` free-while-in-beta is a **code comment** (`Generation.luau:19`), not verified. Exposure is rate-limit refusals, not a bill. |
| Third-party model providers | **Cannot fire** | All three keys unset; adapters throw before the network **[verified]**. |
| Frontend | No recurring bill | Static Vite + Astro served from the worker's D1-backed store. Two Google Fonts stylesheets on every page view — free, but uncontrolled third-party requests on the critical path. |

### 3.4 Specific zero-cost risks

1. **`ADMIN_KEY` can raise the ceiling ~22×.** `POST /api/admin/spend-limits` (`index.ts:622-628`) clamps only
   at 2,000,000 billable neurons/day and 20,000,000/month (`budget.ts:136-137`) = **$22/day, $220/month**.
   Single static secret, exempt from user auth, throttled only by the self-wiping per-isolate limiter (D33).
2. **No platform backstop below the application.** Cloudflare has no account-level hard spend cap; budget
   alerts do not pause usage and fire up to ~24 h late (`spend-caps.md:10, 29`). AI Gateway spend limits — the
   only hard dollar block — are documented for Unified Billing/BYOK only, and `spend-caps.md:286` says assume
   they do **not** cover Workers AI Standard billing. **If BudgetDO is wrong, nothing catches it.**
3. **The gateway's billing mode is unverifiable from the repo.** `wrangler.jsonc:27` sets
   `AI_GATEWAY_ID = "golem"` **[verified]** and every call attaches it, but Standard (uncapped overage) vs
   Unified prepaid credits (hard ceiling) lives only in the dashboard. **This single unknown decides whether
   $10.06 is platform-enforced or only application-enforced.**
4. **The spend-constant regression test is inert.** `economics.test.mjs:136` claims to verify the gates
   "match `apps/worker/src/pricing.ts`" but compares hardcoded literals to hardcoded literals in
   `economics.mjs:37,40,46`; **neither file imports `pricing.ts`**. A cap raised in `pricing.ts` ships green.
5. **Leaked BudgetDO reservations consume the day's capacity** until UTC rollover with no operator signal
   (D14) — reads as an outage, not a budget event.
6. **Per-user Sparks cannot protect the shared ledger** — vision, image gen and embeddings bypass QuotaDO (D13).
   `PLAN_LIMITS.free` grants 60 Sparks/day per user with **no cap on user count and no payment integration
   anywhere** (no stripe/paddle/lemonsqueezy in the repo). N signups grant N×60 Sparks against one
   owner-funded pool; BudgetDO is the only thing between signups and the bill.
7. **The cost model understates real spend ~3.5×.** `docs/COST-MODEL.md:27` records 511 neurons for a full
   Stone build; `docs/BLOCKERS.md:381` measures a real feature build at ~1,800, and `:338-340` records one
   Agent request consuming the entire 60-Spark free daily allowance without finishing. The $10.06 **ceiling**
   holds (BudgetDO enforces it); every derived **capacity** figure downstream of 511 — including the public
   pricing page (`BLOCKERS.md:346-349`, "15× out") — is optimistic.
8. **Documented-but-undeployed resources.** `docs/DECISIONS.md:25` claims R2 for checkpoints/uploads/assets —
   `wrangler.jsonc` has no `r2_buckets` key **[verified]**. Good for cost, bad for accuracy.
9. **From the Lemonade HAR — do not copy the blocking request.** Their `/api/agent` POST held a serverless
   function for **152.5 s of pure wait** (`timings.wait = 152,546.8 ms`, `receive = 1.6 ms`). Their own
   observed economics for one small edit ("add a ProximityPrompt to a door"): `totalCostUsd 0.0872`,
   `tokenUsage {input: 316,485, output: 6,724, cacheRead: 292,831}`, `toolCallCount: 25`, `num_turns: 16`.
   **~93% of input was cache reads** — a very large resident context re-read every turn. Adopt the
   decoupling (progress over the socket, durable `generatingSince` flag) but dispatch to a DO and return
   immediately. Budget against 300k+ input tokens per generation, not 6.7k output. **Tool-call count, not
   output length, is the cost driver.**

---

## 4. REBRAND SURFACE

322 tracked files contain "golem" **[verified]**. They split cleanly.

### 4.1 SAFE TO CHANGE — user-visible strings

These are product copy and brand identity. Nothing in the wire protocol, no deployed identifier.

| Surface | Locations |
|---|---|
| Page titles / OG metadata | `apps/web/index.html:7` (`Golem — Describe it. Golem builds it.`); `apps/site/src/layouts/Base.astro:32` and `Landing.astro:40` (`og:site_name`); every `apps/site/src/pages/**.astro` `title=`/`description=` (18 pages, ~11 under `/docs`) |
| Nav / footer / brand word | `apps/site/src/components/Nav.astro:20-22, 76`; `Footer.astro:10-15, 55` (`Golem Labs`, `Describe it. Golem builds it.`) |
| Brand mark components | `apps/site/src/components/GolemMark.astro`; `apps/web/src/components/glyphs.tsx:17-45` (`GolemGlyph`) — **rename the component AND unify the three marks (D35)** |
| Favicons / OG images | `apps/web/index.html:12`; `apps/site/public/favicon.svg` (the stale "monolith"); `apps/site/public/og.svg` |
| Docs prose | `apps/site/src/pages/docs/*.astro` — "Install Golem for Studio", "the Golem panel", "one Golem project", etc. (~11 files) |
| Changelog / pricing / status copy | `apps/site/src/pages/changelog.astro`, `pricing.astro`, `status.astro`, `404.astro:13`, `SparkMeter.astro:645` |
| In-app copy | `apps/web/src/components/ws/*`, `routes/*` — 12 + 9 files |
| Mode vocabulary | `packages/shared/src/index.ts:721` `MODE_INFO` and `PRODUCT_MODE_INFO` — user-facing names only, **not** the `GolemMode` type (see 4.2) |
| Plugin panel title | `apps/plugin/src/init.server.luau` toolbar/button labels |
| Repo docs | `docs/**` (20 + 18 + 31 evidence files) — lowest priority, rename last |

### 4.2 MUST NOT RENAME — infrastructure identifiers

Renaming any of these breaks production, invalidates deployed state, or de-pairs every installed plugin.

| Identifier | Value | Why it is load-bearing |
|---|---|---|
| Worker name | `golem` (`wrangler.jsonc:2`) | Determines the `*.workers.dev` hostname. Renaming orphans the deployment and breaks every plugin's `DEFAULT_API`. |
| Production URL | `https://golem.moshe-barami111.workers.dev` | Hardcoded in `apps/plugin/src/init.server.luau:14` — **every already-installed plugin points here**. Also `apps/site/astro.config.mjs:11`, `robots.txt:5`, `asset-library.ts:402`, `scripts/inspect-plugin-build.py:227,283`. |
| D1 database | name `golem-corpus`, id `32c9471e-a7d7-49ee-a8fe-0a7def2c68bd` | Holds the live 8,327-row corpus. The **id** is the binding; renaming the database is a migration. |
| KV namespace id | `cc341a7db4d748139f161fdc292e6e84` | Opaque id; carries `config:models` and image keys. |
| Vectorize index | `golem-docs` | Holds ~3,394 vectors. Index names are not renameable in place. |
| DO class names | `SessionDO`, `QuotaDO`, `PairingDO`, `AdminDO`, `BudgetDO` | **Class names are the storage identity.** `wrangler.jsonc` migrations `v1`/`v2` pin them via `new_sqlite_classes`; renaming a class strands every existing object's SQLite storage (chat history, checkpoints, quotas, the spend ledger). |
| DO bindings | `SESSION_DO`, `QUOTA_DO`, `PAIRING_DO`, `ADMIN_DO`, `BUDGET_DO` | Renameable only in lockstep with `env.ts` + every `env.X_DO` call site; no upside. |
| BudgetDO singleton name | `'singleton'` (`gateway.ts:117`) | Changing it resets the spend ledger to zero. |
| Env vars | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ENVIRONMENT`, `AI_GATEWAY_ID`, `ADMIN_KEY`, `ROBLOX_API_KEY`, `VEC_ASSETS`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `DEEPSEEK_API_KEY` | Set in `wrangler.jsonc` vars + Cloudflare secrets; renaming requires re-setting every secret. |
| AI Gateway id | `golem` (`wrangler.jsonc:27`) | Names an existing gateway that carries log history and (possibly) prepaid credits. |
| **Plugin wire headers** | `X-Golem-Token`, `X-Golem-Plugin-Version`, `X-Golem-Plugin-Protocol` (`init.server.luau:77-79`) | Read by `index.ts:376-380`. **Installed plugins send the old names forever** — any rename needs both accepted for at least one release. |
| **WebSocket subprotocols** | `golem.v1`, `golem.jwt.<token>` (`use-project-socket.ts:618`, `auth.ts:36-40`) | Bumping `golem.v1` breaks every open client mid-session. |
| **Plugin setting key** | `golem_session` (`init.server.luau:34, 256, 355`) | Renaming logs out every paired Studio and forces re-pairing. |
| Plugin Roblox asset id | `packages/shared/src/index.ts:832` | The one literal; the store asset id cannot change. |
| Supabase project ref | `npqvyijsvzkuwddyhtpm` | Holds `projects`, `profiles`, the RLS policies, and `auth.users` FKs. |
| ```golem-ui fence | `validate.ts:965-971` | Currently unused (D2), but if D2 is fixed by teaching the model to emit it, pick the final name **before** it reaches a prompt. |

### 4.3 Renameable with care (mechanical, one commit, no runtime state)

npm package names — root `golem`, then `@golem/{plugin,site,web,worker,shared,corpus,design,evals}` and
`@golem/crystal-canyon` **[verified]** — plus every `import … from '@golem/shared'` (≈30 files in `apps/web`
alone). Private workspace packages; a single rename + `pnpm install` is sufficient. Do this **after** the
functional P0 work, not during it.

---

## 5. TRAINING FOUNDATION

### 5.1 Honest verdict: `packages/corpus` is NOT usable as training data today

It is a **retrieval** corpus. Specifically:

- **No instruction/response pairs exist anywhere.** `find . -name '*.jsonl' -not -path '*/node_modules/*'`
  returns exactly two files **[verified]**: `packages/corpus/data/chunks.jsonl` and
  `packages/evals/tasks-visual/props/regression/confirmed.jsonl`. Zero `.parquet`. Zero HuggingFace checkouts
  in `raw/manifest.json`. `chunks.jsonl` records are
  `{vecId, docSlug, title, url, kind, text, embed}` — **documents, not pairs**.
- **The only prompt→answer pairs in the repo are the eval set:** 84 tasks + 28 reference answers
  **[verified: 12 task files, 28 reference `.md`]**. That is both far too small for SFT **and** precisely the
  set that training on would destroy as an evaluation.
- **Only 2 of 38 checkouts are processed.** `chunk.mjs` reads exactly `creator-docs` and `luau-site`
  (`:19-20, 482-484`); `chunks.jsonl` URL domains are only `create.roblox.com` (8,056) and `luau.org` (270).
  The other 36 (~270 MB, **9,151 `.luau` + 2,334 `.lua`** **[verified]**) reach licence classification and
  security scanning and stop there. `docs/SOURCE_MANIFEST.md:98` states it plainly: *"15 of 38 checkouts have
  had patterns extracted from them"* — and that extraction is 113 prose rules in
  `packages/design/src/rules.mjs` (1,690 lines **[verified]**), not retrievable chunks and not training pairs.
- **The pipeline that would regenerate it is broken and destructive** (D9).
- **A standing written decision opposes fine-tuning at all:** `docs/research/hf-specialists.md:5`. That
  contradicts any SFT plan and must be resolved by the owner before spending on data collection.

### 5.2 What exists that IS a real asset for training

| Asset | Volume | Licence status | Shape |
|---|---|---|---|
| 36 unindexed checkouts | 9,151 `.luau` + 2,334 `.lua` | 30 MIT, 7 Apache-2.0, machine-read from each LICENSE (`raw/manifest.json`) | **Completion / FIM**, not instruction |
| `creator-docs` + `luau-site` | 8,326 chunks / 10.8 MB | CC-BY-4.0 / MIT | Grounding for **synthesised** Q&A |
| 113 hand-written design rules | `packages/design/src/rules.mjs` | First-party | Preference / rubric signal |
| Eval tasks + references | 84 + 28 | First-party | **HELD OUT — never train on these** |
| Agent run transcripts | Live in SessionDO SQLite (`messages` table, `session.ts:237-239`) | First-party | **The highest-value source and it has no export path today** — D32 means it is not in Supabase either |

**Two checkouts must be excluded by gate, not by hand:** `Quenty__NevermoreEngine` (flagged
remote-payload-loader) and `Roblox__react-luau` (unscannable), per `docs/SOURCE_MANIFEST.md`.

### 5.3 Hardware reality — M2 Pro, 32 GB unified, 19 GPU cores, 216 GB free **[verified: `Mac14,10`, 34,359,738,368 bytes, 216 Gi free]**

- **MLX is NOT installed.** The only `python3` on PATH is **3.9.10** (`/Library/Frameworks/Python.framework`)
  **[verified]** — old enough to be a problem for current `mlx-lm`. **Create a 3.11 or 3.12 venv.**
- No CUDA → MLX LoRA is the only local training path. Correct call.
- **Practical envelope on 32 GB unified:** a 7–8 B base in 4-bit (~4–5 GB weights) trains LoRA comfortably at
  seq 2048–4096. A 12–14 B 4-bit (~8 GB) is fine. A 32 B 4-bit (~18 GB) is feasible for LoRA at batch 1 /
  seq 2048 but peaks around 22–26 GB — tight, and it will page. Budget hours, not minutes.

### 5.4 The serving constraint — and the one path that resolves it

**A locally-trained model has no production home in the current architecture.** `gateway.ts:203` resolves a
model via `adapterForModelId(cfg.id)`; every id is `@cf/...`; Workers AI serves only Cloudflare-hosted models.

**However — Cloudflare Workers AI accepts custom LoRA adapters.** Per live Cloudflare documentation
(`/workers-ai/features/fine-tunes/`, expanded per the 2025-04-11 changelog): **rank up to 32, 300 MB
safetensors limit**, on a fixed list of base models that includes:

- `@cf/qwen/qwen2.5-coder-32b-instruct` — **already priced in `pricing.ts:32`** ($0.66/$1.00 per M)
- `@cf/meta/llama-3.2-11b-vision-instruct` — **already priced in `pricing.ts:33`** ($0.049/$0.68 per M)
- `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, `@cf/meta/llama-3.1-8b-instruct-fast`,
  `@cf/qwen/qwq-32b`, `@cf/mistralai/mistral-small-3.1-24b-instruct`, `@cf/google/gemma-3-12b-it`,
  `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`, `@cf/meta/llama-guard-3-8b`

**This is the deployment path: MLX LoRA locally → export PEFT-format safetensors → upload as a Workers AI
finetune → reference the adapter name in the inference request.** It is the single fact that makes local
training on this hardware worth doing at all.

Three caveats that must be tested, not assumed:
1. **Quantisation mismatch.** Training a LoRA against an MLX 4-bit base and serving it on Cloudflare's
   differently-quantised base usually works but is a fidelity risk. It must be eval-verified, not trusted.
2. **Rank ≤ 32 and ≤ 300 MB** constrain the adapter — this is a style/format/tool-discipline adapter, not a
   capability transplant.
3. **Cost consequence.** `qwen2.5-coder-32b` is $0.66/M input vs glm-5.3-flash's $0.15/M — **4.4× more
   expensive input**. `llama-3.2-11b-vision` at $0.049/M is **3× cheaper** than glm and is also a vision model.
   Model choice here is a budget decision, not only a quality one.

### 5.5 What must be built to make training real

1. **Fix D9** (chunker paths + licence-gate key + write floor) — otherwise nothing can be regenerated.
2. **Add a third builder to `chunk.mjs`** walking each checkout's `.luau`/`.lua`/`.md` with `kind='code'|'lib'`,
   gated on `manifest.sources[x].licence.classifiedAs === 'COMMERCIAL_REUSABLE'` **and**
   `security.class === 'clean'`. This yields the completion corpus.
3. **Build a transcript export path.** Add an admin route that dumps a SessionDO's `messages` +
   `tool_trace` as JSONL. This is the only source of *in-distribution* agent behaviour — user request →
   tool calls → tool results → outcome — and it is exactly the signal a LoRA should carry. Today it is trapped
   in DO storage and D32 means Supabase does not have it either.
4. **Synthesise doc-grounded instruction pairs** from the 8,326 chunks (question + grounded answer + cited
   slug), generated offline. Cost: this uses the paid model, so it must run against a budget the owner
   authorises — it is a one-time spend, not recurring.
5. **Apply the held-out discipline that already exists** (`composition-splits.mjs`) to `tasks/`: assign each
   task id to DEV/HELD-OUT by a written-down seed, exclude HELD-OUT from anything that informs a prompt,
   routing, or adapter change, and have `report.mjs` print both aggregates. **Do this before training, or the
   training has no honest scoreboard** (D36).
6. **Re-run and commit a tagged 84-task baseline** on the current prompts, before any adapter exists.

---

## 6. CRITICAL PATH

Each step names its acceptance evidence. Steps 1–6 are the product; 7–11 are the rebrand; 12–16 are training.
**Do not start the rebrand until step 6 passes** — renaming a broken product just makes the breakage harder to
find.

### Phase A — stop the bleeding (no new capability, only truth)

**A1. Guard the panel path and fix the render contract.** (D1, D2, D54)
- `try/catch` around `panelFromTool` (`panels.ts:41-54`); tighten `looksLikeRenderResult` to require
  `boundsSize` AND `views[0].meta`; add `.ts` extensions to `adapters.ts:17-18`.
- Decide the contract: worker emits `{v:1, blocks}` documents, or per-tool adapters map the real shapes.
- **Acceptance:** a new test feeds the literal `tools.ts:995` payload through `documentFromToolDetail` and gets
  a document or `null`, never a throw. `node --test apps/web/tests` green. A manual `render_view` run does not
  show the error boundary.

**A2. Classify intent before spending.** (D3)
- `converse | inspect | build` in `startRunInner` before the checkpoint. `converse` ⇒ no checkpoint, tools
  limited to `search_docs`/`remember`, `effort='low'`, `maxSteps=1`, `owesWork=false`.
- **Acceptance:** a unit test asserting a greeting classifies `converse`; a measured run where "hi" with Studio
  connected costs **1 model call, 0 snapshots, 0 nudges** and finishes `done` — read from
  `/api/admin/spend` before/after.

**A3. Make the cost gates honest.** (D14, D16, D17, and cost-risk 4)
- Id + timestamp per BudgetDO reservation, 5-minute expiry in `/reserve`'s prologue; stop swallowing settle
  failures (increment an `AdminDO` counter).
- Shed `uiTools` in `persist.ts` and cap total bytes; return `PersistOutcome` to `session.ts` and call
  `finishRun(agent,'error',…)` on `'terminal'`.
- Make `packages/evals/src/economics.mjs` **import** `apps/worker/src/pricing.ts`.
- **Acceptance:** a test that a reserve with no settle is reclaimed after expiry; a test that a 60×24,000-char
  `uiTools` state persists without rejecting; `economics.test.mjs` **fails** when
  `BILLABLE_NEURONS_PER_DAY` is edited.

**A4. Cap Durable Object residency — the largest recurring cost.** (§3.3)
- Add an idle disconnect: if no run and no browser socket for N minutes, tell the plugin to back off to a long
  interval (e.g. 30 s) instead of a 6 s hold + 1 s re-poll. Add exponential backoff on the plugin side (D51).
- **Acceptance:** measured GB-s per idle paired project over one hour, from Cloudflare observability
  (`wrangler.jsonc:29` has observability enabled), **before and after**, published in `docs/COST-MODEL.md`.
  Target: an idle paired Studio costs ≲10% of the current figure.

### Phase B — make the visual loop tell the truth

**B1. Frame the requested target and stop blocking Studio.** (D19, D20)
- `renderView` iterates `root:GetDescendants()`; yield every N scanlines; `run_code` honours `timeoutMs` via
  `task.spawn` + deadline; raise the `pluginConnected` staleness window above the longest blocking op.
- **Acceptance:** a plugin spec asserting a targeted render's `partsVisible` excludes out-of-subtree parts;
  a long `run_code` returns a timeout **and** the next op still sees Studio connected.

**B2. Name the rasteriser's limits where the model and the user can see them.** (D21, D22)
- Add the box-approximation statement to the critic prompt and the StudioView caption, the way
  `Render.luau:372-375` already does for lighting. Add a wedge triangle table.
- Have `critiqueViews` fall back to `LAYOUT_LUAU` via `run_code` when `result.layout` is absent, or say
  "layout analysis unavailable" rather than omitting the section.
- **Acceptance:** `apps/web/tests/playtest-viewport.test.mjs` extended to grep `studio-view.tsx` and the critic
  prompt for banned "viewport/live" phrasing and for the presence of the limitation statement.

**B3. Make restore trustworthy.** (D8, D24)
- Include Terrain in the serializer; fail the op (or surface the count) when `failedProps > 0`; refuse
  `checkpoint_restore` while `agent.status !== 'idle'`.
- **Acceptance:** a plugin spec where a restore with a forced property failure returns `ok:false`; a worker
  test where `checkpoint_restore` during a run returns a "stop the run first" error.

### Phase C — close or delete the asset dead ends

**C1. Decide each asset path: ship or delete.** (D4, D10, D28, D30)
- `search_asset_library`: **either** run the ingest **or** stop swallowing `no such table` and withhold the
  tool from `toolDefs` when the table is absent. Rewrite the availability test to execute code, not grep source.
- `generate_image`: build the upload leg or delete the tool. It is currently pure spend.
- `brokerAsset`: route `insert_asset` through it, or delete ~1,500 lines.
- `recordVerification`: call it from `insert_asset` on pass **and** fail.
- **Acceptance:** for each of the four, either a passing end-to-end test, or the code is gone from the repo and
  the tool no longer appears in `toolDefs`. **No third state.**

**C2. Persist provenance across steps.** (D12)
- **Acceptance:** a test where `find_verified_asset` in step N and `insert_asset` in step N+1 yields provenance
  `search_result`, not `user_supplied`.

### Phase D — the plugin release gate

**D-1. Rebuild and republish the plugin; add the version assertion.** (D5, D6, D7)
- Rebuild `release/golem-plugin.rbxm` from current source; add CI asserting the embedded VERSION equals
  `Version.luau`. Owner republishes the Creator Store asset and enables distribution; flip
  `STUDIO_PLUGIN_STORE_LIVE`. Implement `CreateAssetAsync` persistence for `generate_model` or make the UI say
  the geometry is throwaway.
- **Acceptance:** CI job fails on a stale artifact; a fresh Studio install from the store pairs and returns
  `render_view` **with** a `layout` field — which is the direct measured contradiction in `tools.ts:1015-1018`.
  **Blocked on owner (§7).**

### Phase E — rebrand (only after A–D)

**E1.** Collapse the three token sets into one accent + one ground; migrate the legacy `.page/.card/.btn`
routes onto the `gx` layer (D35). *Acceptance:* one `--accent` and one ground token reachable from every route;
a visual pass over all 8 routes at 400 px and desktop width.
**E2.** Unify the brand mark; regenerate both favicons and `og.svg` from one SVG. *Acceptance:* three files,
one source path.
**E3.** Replace user-visible strings per §4.1, in this order: web app → site → docs prose.
*Acceptance:* `git grep -i golem -- apps/web/src apps/site/src` returns only `@golem/*` import specifiers.
**E4.** Rename npm packages (§4.3) in one commit + `pnpm install`. *Acceptance:* `pnpm -r test` and
`pnpm -r typecheck` green.
**E5.** Leave every §4.2 identifier untouched. *Acceptance:* a CI guard asserting `wrangler.jsonc` `name`,
`database_id`, KV id, `index_name`, DO class names, and the three `X-Golem-*` headers are unchanged.
*(Note: the plugin wire headers and `golem_session` key keep their names permanently; accept both if ever
changed.)*

### Phase F — training (independent track; can run in parallel with A–D)

**F1. Environment.** Python 3.11/3.12 venv; `pip install mlx mlx-lm`; verify Metal with a tiny generation.
*Acceptance:* `mlx_lm.generate` produces tokens on a 4-bit 7 B model; `python -c "import mlx.core as mx;
print(mx.default_device())"` reports GPU.

**F2. Fix and extend the corpus builder.** (D9, §5.5 items 1–2)
*Acceptance:* `pnpm chunk` resolves directories from `raw/manifest.json`, refuses to write below a floor, and
produces a `chunks.jsonl` whose `kind` histogram now includes `code`/`lib` rows from ≥30 checkouts — with
`Quenty__NevermoreEngine` and `Roblox__react-luau` **excluded by gate**, asserted in a test.

**F3. Build the transcript export.** (§5.5 item 3)
*Acceptance:* an admin route dumps a real project's `messages` + `tool_trace` as JSONL; ≥1 real multi-step
build run round-trips into `{messages:[…]}` training records with tool calls and results intact.

**F4. Establish the honest scoreboard BEFORE training.** (D36, §5.5 items 5–6)
*Acceptance:* `tasks.mjs` assigns DEV/HELD-OUT by a committed seed; `report.mjs` prints two aggregates; a
tagged 84-task baseline result file is committed with `runMeta.taskCount === 84`, and `report.mjs` refuses any
result whose `taskCount` does not match the current `loadTasks()`.

**F5. Choose the base model against the serving constraint.** (§5.4)
Pick from Cloudflare's LoRA-capable list. Recommended first target: **`@cf/meta/llama-3.2-11b-vision-instruct`**
— it is on the adapter list, already priced at `pricing.ts:33`, **3× cheaper input than glm-5.3-flash**, and
multimodal (so it can also serve the critic). Fallback for pure code quality:
`@cf/qwen/qwen2.5-coder-32b-instruct` (4.4× more expensive input; 4-bit LoRA at batch 1 / seq 2048 is the
32 GB ceiling).
*Acceptance:* a one-page decision note recording the chosen base, its Cloudflare price, and the measured
**zero-adapter** baseline score on the DEV split — so the adapter's contribution is attributable.

**F6. Train the LoRA.** Rank ≤ 32 (Cloudflare's hard limit), seq 2048–4096, batch 1–2. Data mix: transcript
records (F3) as the primary instruction signal, doc-grounded synthesised pairs as the grounding signal,
completion data from F2 only if the adapter under-fits on format.
*Acceptance:* training completes without swap thrash (watch resident memory); loss curve committed; adapter
safetensors **≤ 300 MB** and rank ≤ 32, asserted by a script before any upload.

**F7. Verify transfer across the quantisation boundary.** (§5.4 caveat 1)
*Acceptance:* upload the adapter as a Workers AI finetune; run the **DEV** split through it via
`/api/admin/model-test`; only then run **HELD-OUT once**. Ship the adapter only if HELD-OUT beats the F5
zero-adapter baseline. If MLX-local and Cloudflare-served scores diverge materially, that divergence is the
finding — record it and stop, rather than shipping on the local number.

---

## 7. OPEN QUESTIONS / BLOCKERS REQUIRING THE OWNER

Nothing below can be resolved from the repository. Each names the decision and what unblocks.

### Spend authorisation

1. **Is the target $0/month or $10/month?** The code enforces $10.06 by design (`pricing.ts:84,87`;
   `docs/COST-MODEL.md:190`). True zero requires switching off `glm-5.3-flash` — the only thing forcing a paid
   plan — to `gpt-oss-20b`, `gpt-oss-120b` or `qwen3-30b-a3b-fp8` (all already priced, none on Cloudflare's
   paid-billing list), **and** setting both billable constants to 0. This is a quality/cost trade with a
   measurable answer (run the 84-task eval on both), but it is the owner's call, not an engineering one.
2. **What is the `golem` AI Gateway's billing mode — Standard, or Unified with prepaid credits?** Not
   expressible in the repo and not inspectable from it. **This single answer decides whether $10.06 is
   platform-enforced or only application-enforced.** The repo's own research prescribes Unified + prepaid
   credits + spend-limit rules + auto-top-up OFF (`spend-caps.md:12`). *Needs: dashboard check, then record it.*
3. **Authorise a one-time spend for synthesised training data** (§5.5 item 4) and for re-running the 84-task
   eval baseline (F4). Both use the paid model. Name a neuron budget so the runs can be gated.
4. **`ADMIN_KEY` can raise the ceiling to $220/month** (`budget.ts:136-137`). Approve lowering the clamp to the
   compiled defaults so the route can only ratchet **down** — or state the reason to keep headroom.

### Entitlements and credentials

5. **Creator Store distribution for the plugin.** Creator Dashboard → Development Items → Golem → Configure →
   Distribution → *Distribute on Creator Store*. **Until this is done no user can install the plugin** (D6) and
   the whole Studio half of the product is unreachable. Owner-only action.
6. **Republish the plugin asset from Studio.** Open Cloud cannot update a Plugin asset
   (`.github/workflows/plugin-release.yml`). The checked-in artifact is version 0.1.0 with no asset gate and no
   generation code (D5) — the currently-installed plugin is provably older than source.
7. **Open Cloud asset-upload credential** — required for any path that puts a generated image or mesh into
   Roblox (D7, D10). Does not exist today. Alternative is Studio-side `CreateAssetAsync` under the user's own
   account, which needs no new credential but is a different design. Owner chooses.
8. **`ROBLOX_API_KEY`** (free, read-scope `creator-store-product:read`) is optional — its absence degrades
   Creator Store search to the unauthenticated v1 endpoint. Worth setting; not blocking.

### Product decisions

9. **Does "Apple" survive legal review?** *Apple* is a registered trademark of Apple Inc. across software and
   developer tools. Renaming a public-facing SaaS to it is a legal exposure, not a technical one. **Confirm the
   name before Phase E touches 322 files** — reversing a rebrand costs more than deferring it.
10. **Viewport capture: companion app, or hold the honest framing?** (D56) Real capture is impossible in-engine
    — measured, not inferred. The only options are a signed companion desktop app with an OS screen-recording
    permission prompt per machine, or keeping the rasteriser and its stated limits. This determines whether
    D21/D22 are "fix the copy" or "build a new product surface."
11. **Fine-tuning: proceed or not?** `docs/research/hf-specialists.md:5` is a standing written decision
    **against** fine-tuning. §6 Phase F contradicts it. Resolve the contradiction before F3 (transcript export)
    is built.
12. **Which Supabase store is authoritative?** Five tables have RLS and no writer (D32). If the DO is
    authoritative (it currently is), delete `messages`/`checkpoints`/`usage_events` from the migrations so the
    schema stops describing a system that does not exist — **and accept that chat history does not survive DO
    eviction.** If Supabase should be authoritative, that is a new writer plus INSERT policies plus a decision
    about the missing service-role key.
13. **Audio: in scope?** (D11) Entirely greenfield — new asset kind, new moderation surface (Roblox audio is
    privacy-restricted; most uploads are not Open Use), and for generation a new paid dependency and a licence
    class the provenance model does not cover. Currently `SoundId` is structurally unassignable.
14. **`lemonade-har-analysis.md` is unverifiable against the HAR on disk** (D57). Either locate the Sep-9
    capture it was written from, or regenerate the analysis from the Sep-14 file. Until then its numbers must
    not be cited in any planning document.

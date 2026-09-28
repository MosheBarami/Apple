# DEEPSEEK / WORKBUDDY FINAL HANDOFF

**Date:** 2026-09-22 (session ran approximately 16:00–20:20 IDT / 13:00–17:20 UTC)
**Repository:** `/Users/moshe/Desktop/RbxAI`
**Current HEAD:** `bd6ab348930453fac72ccd92e721f964420cad4b` (`bd6ab34`)
**Remote HEAD:** `33d2f377a3f94a3224129aea21d5d2accfdb3c41` (`origin/main`, fetched 2026-09-22 20:00:07 local)
**Working tree status:** dirty — **358 entries**: 247 modified, 17 deleted, 94 untracked. `git diff --shortstat` = 264 files changed, 7544 insertions(+), 13314 deletions(-). `git diff --check` clean. **Local `main` is 13 commits AHEAD of `origin/main`, 0 behind. Nothing pushed.**
**Production deployment/version:** worker `apple` — Cloudflare version `b477cd57-1595-42f0-9124-724cae18822b`, deployment `953cbf78-142b-44a4-8ce2-e1bdb7db39ec`, created `2026-09-22T16:57:50Z`. `/api/health` → `{"ok":true,"buildSha":"bd6ab34-dirty"}`. SPA bundle `assets/index-BSdMW2lW.js`.

---

## 1. Starting state I found

- **git HEAD:** `bd6ab34` on `main`, 13 commits ahead of `origin/main`, nothing pushed.
- **Dirty file count:** 358 entries at the end; it was already dirty when I started (~102 files / 5490 insertions / 185 deletions at takeover, growing as other workers edited).
- **Test failures:** 44 eval failures at the point I took over `packages/evals`; everything else green. The worker's `MODE_ALIASES` removal had silently broken two CLIs with no test importing them.
- **Production version:** `89becd9` (3 commits behind local HEAD). The deployed worker's `do/session.ts` read `const VALID_MODES = new Set<GolemMode>(['clay','stone','rune'])`; the deployed SPA bundle `index-D5BNsDFW.js` contained `Lt={plan:"clay",agent:"stone",super:"rune"}` and **put the legacy names on the wire**.
- **Database state:** schema complete; the `supabase_migrations.schema_migrations` ledger reported only **8** rows.
- **Known blockers at takeover:** the mode rename was a breaking wire change against 102 projects / 32 profiles; G92 (site E2E) red; G-BACKLOG-1 red; every gate STALE because the tree is dirty.
- **A concurrent worker was editing `apps/site`** throughout (see §15).

---

## 2. Everything I changed

### Worker — prompts
- **`apps/worker/src/prompts.ts`** — restored the asset-refusal sentence (`run_luau refuses GetObjects, InsertService, rbxassetid://, Content.fromAssetId, loadstring and require of an asset id`), and added an **unknown-mode throw**:
  ```ts
  if (!Object.prototype.hasOwnProperty.call(MODE_RULES, opts.mode)) {
    throw new Error(`systemPrompt: unknown mode "${String(opts.mode)}" — the product has ${Object.keys(MODE_RULES).join(' / ')}`);
  }
  ```
  **Why:** `MODE_RULES[opts.mode]` + `.filter(Boolean)` meant an unknown mode silently shipped a prompt with **no mode block at all** — no persona, no verification rules. Before deploying I traced every path: `systemPrompt(` has exactly **one** call site (`do/session.ts:3016`), and all three `startRun` call sites refuse a bad mode first (`/agent-run` line 2203 `if (!runMode)`; both WS paths lines 2627/2708 `if (!mode) return`). The throw is unreachable from any request.
- **`apps/worker/tests/prompt-tool-names.test.mjs`** — my first guard forbade the `run_luau` *token* and fired on the correct prompt (`asset-safety.test.mjs` requires `run_luau refuses`). Replaced with a usage guard (`/\breach for run_luau\b/i` etc.) plus a planted control, and added `an unknown mode is REFUSED, not silently stripped of its rules`.

### Worker — mode ingress
- **`apps/worker/src/do/session.ts`** — added `const MODE_SKEW_REFUSAL = 'This connection is out of date — reload the page to keep building.'` and pointed both `bad_mode` sites at it. The code stays `bad_mode` (the browser maps it via `refusalFor('bad_mode').field === 'mode'`). **This is the migration mechanism for the wire rename** — see §10.
- **`apps/worker/tests/mode-ingress.test.mjs`** — added `THE REFUSAL TELLS THE PERSON WHAT TO DO, because the common cause is a stale tab`.

### Evals — re-aimed, not relaxed
- **`packages/evals/src/preserved.test.mjs`** — the playtest helper stubbed `run_code` + `CENSUS_LUAU`, but the product moved to the typed `project_census` op, so **every census returned the harness default**. Re-aimed to `op.op === 'project_census'`. B4 re-aimed from "reads geometry with run_code" to the minimum-size `render_view` (48×32) pin. B6's static `MUTATING_TOOLS` check replaced with the registry-derived property (`out.mutatedProject === true` → `agent.mutated = true`, plus `toolMutatesProject` non-vacuity).
- **`packages/evals/src/providers.test.mjs`** — fixtures gained `baselineModel: 'stone' | 'rune'`; the "product-model split" test restated against the shared-foundation reality (`DEFAULT_MODELS` keys = `agent, memory, plan, vision`).
- **`packages/evals/src/security.test.mjs`** — 4× `model:'stone'`→`'agent'`; key loop → `['plan','agent','memory','vision']`; added nine missing `TOOL_ARGS` fixtures (`clone_instances`, `group_instances`, `ungroup_instances`, `move_instances`, `transform_instances`, `rename_instance`, `set_locked`, `set_visible`, `edit_terrain`); whitelisted `autonomous`/`totalSteps` **with code-anchored assertions**.
- **`packages/evals/src/acceptance.mjs`** — added `gateway: W_SRC('gateway.ts')`; replaced `estimateNeurons('stone', …)` (a **MODE passed where a MODEL id belongs** — `neuronsFor` silently falls back to the **most expensive** price row) with `W.gateway.DEFAULT_MODELS.agent.id` + a price-row precondition.
- **`packages/evals/src/prompts.test.mjs`**, **`asset-safety.test.mjs`** — mode vocabulary.

### Shared contract
- **`packages/shared/src/index.ts`** — corrected the stale `GOVERNED_TOOLS` comment (23 declared writers ⊂ 28 governed; the `MUTATING_TOOLS` set no longer exists) and extended `STUDIO_PLUGIN_STORE_LIVE`'s comment with the 2026-09-22 re-probe, **without flipping the constant** (see §4/§14).

### Web
- **`apps/web/tests/customer-journey-state.test.mjs`** — 5× fixture `mode:'stone'`→`'agent'`.
- **`apps/web/src/routes/nonworkspace-minimal.css`** — **`--nm-faint` fixed**: dark `#6f6f6f`→`#8a8a8a`, light `#858581`→`#6b6b67`. Measured before: 3.94:1 dark, 3.79:1 on `--nm-panel-soft`, **3.28:1 light**. After: 5.88 / 5.51 / 4.73.
- **`apps/web/tests/contrast.test.mjs`** — added a guard for the `nm-*` token set (discovered, not hardcoded; every ink × every panel × both themes; ramp-descent assertion; non-vacuity floors).

### Repository ledger
- **`GATES.md`** — G7's CHECK named `tests/asset-library-gating.test.mjs`, deleted with the asset library on 2026-09-20; the gate stayed ticked because its EVIDENCE predated the deletion. Re-aimed to `tests/plugin-capabilities.test.mjs`, floor 7 → 12, recorded as `CHECK-CHANGE`.

### Evidence and memory written
- `docs/evidence/2026-09-22-deploy-bd6ab34-dirty.md`
- `docs/evidence/2026-09-22-browser-qa.md` (+ `2026-09-22-browser-qa/` — 32 screenshots + `report.json`)
- `docs/evidence/2026-09-22-studio-acceptance.md`
- `docs/evidence/2026-09-22-customer-review.md`
- `docs/evidence/2026-09-22-ai-elements-surface-audit.md`
- `docs/evidence/2026-09-22-plugin-store-listing-flipped.md`
- `.workbuddy-ai/memory/2026-09-22.md`
- `~/.workbuddy-ai/skills/rbxai-deploy-and-verify/SKILL.md` (new skill: the deploy ordering rule, the ledger trap, the QA measurement traps)

---

## 3. Bugs / regressions I discovered

| # | Symptom | Root cause | Fix | Guard |
|---|---|---|---|---|
| 1 | 44 eval failures | Retired mode keys in fixtures; the dead `run_code` census stub never matched so every census silently returned the harness default; `MUTATING_TOOLS` removed; missing `TOOL_ARGS` for nine new tools; a MODE passed to `estimateNeurons` | Re-aimed each at the real property | The re-aimed assertions themselves; `estimateNeurons` now asserts its price row exists |
| 2 | An unknown mode silently shipped a prompt with **no mode block** | `MODE_RULES[opts.mode]` + `.filter(Boolean)` | Explicit throw | `an unknown mode is REFUSED, not silently stripped of its rules` |
| 3 | `--nm-faint` below WCAG AA on every account screen | Token set in `routes/nonworkspace-minimal.css` was never read by `contrast.test.mjs` — the app's **second** palette was unguarded | Raised both values | New `nm-*` guard; falsified red-first (**exactly one** test turns red) |
| 4 | The landing composer shows **no focus ring** | `outline-style: none` with `outline-width: 3px` declared — paints nothing | **NOT FIXED** (`apps/site`, in flight) | Recorded in the QA evidence |
| 5 | 10 × `.micro` labels at **4.35:1** on `/` and `/pricing` | Token below the floor | **NOT FIXED** (`apps/site`) | Recorded |
| 6 | `/pricing`'s CTA contradicts `/pricing`'s own tier rows | "Start building — free" button while the same page says "public installation removed by Roblox moderation, appeal filed" | **NOT FIXED** (`apps/site`) | Found by the fresh-context reviewer; **independently verified** |
| 7 | `/` and `/pricing` give **two different reasons** the plugin is unavailable | `/` = "Roblox has not approved it for distribution"; `/pricing` = "removed by Roblox moderation, appeal filed" | **NOT FIXED** (`apps/site`) | **Independently verified** |
| 8 | My own QA harness produced **false findings** | (a) counted off-canvas elements inside scrollers as overflow; (b) counted *declared* transitions as running animations; (c) a key collision overwrote run labels | Fixed all three before concluding anything | The corrected run reports 0/0 |

**A correction to my own earlier report.** I stated that `StudioCapture` "does not exist anywhere in `apps/plugin`". **That was wrong because I scoped the search to one directory.** `apps/apple-plugin/src/StudioCapture.luau` exists and implements §H/§I in full (see §6).

---

## 4. Database state

**Remote Supabase — verified by direct schema query, not by the ledger.**

`supabase_migrations.schema_migrations` contains **8 rows** and does **NOT** contain `0013_product_modes_only` or `0007`–`0011`, because `infra/supabase/migrate.mjs` applies SQL and records **no versions**. The ledger is not the source of truth.

Verified present in the live schema:

| object | from | value |
|---|---|---|
| `messages_mode_check` | 0013 | `CHECK (((mode IS NULL) OR (mode = ANY (ARRAY['plan'::text, 'agent'::text]))))` |
| `public.messages` rows / with a mode / with a retired mode | 0013 | `0 / 0 / 0` |
| `profiles_plan_check` | 0012 | `free, builder, studio, enterprise` |
| `projects.pinned_at` | 0007 | present |
| `projects.tags` | 0008 | present |
| `membership_access_outbox` | 0009 | present |
| `usage_events.credits` + `sync_usage_event_credit_columns()` | 0010 | present |
| `project_for_link_grant()` | 0011 | present |
| `projects_owner_pinned_idx`, `projects_tags_idx` | 0007/0008 | both present |

**Every migration 0001–0013 is applied. Nothing needed to run before the deploy. No drift found.**

`public.messages` is a deprecated mirror — the transcript lives in `SessionDO`'s SQLite (`user-export.ts` records `recordedElsewhere: 'messages'`) — so the old worker cannot violate the new constraint either.

**RLS:** `infra/supabase/tests/rls-isolation.mjs` (43 checks, self-falsifying, starts its own `postgres:16-alpine`) was **NOT run in this session**. The last verified result I have is from an earlier session. **UNVERIFIED.**

---

## 5. AI Elements / visual implementation

**Live chat/thinking surface, as it stands in the deployed bundle:**

- **Official AI Elements IS the real surface.** `apps/web/src/components/ws/thinking.tsx` imports `Reasoning`, `ReasoningTrigger`, `useReasoning` from `components/ai-elements/reasoning` — a **vendored copy of Vercel AI Elements' `reasoning.tsx`** at upstream commit `6a9d5b1822ffb10bba4bd97175f01edd7d8651cd`, with the upstream file's **SHA-256 `f138cddde35854f73632ff51d48230f8d6e16e0a49a74b44a93b51993a65550e`**, the Apache-2.0 LICENSE, and a NOTICE enumerating every local modification (React 18 primitives for Radix/shadcn, inline SVGs for lucide, the app's marked+DOMPurify renderer for Streamdown, scoped CSS for Tailwind, CSS sweep for motion/react).
- **Content discipline is enforced in prose and in code.** `thinking.tsx` opens: *"Minimal observable reasoning: one live status line, progressive disclosure on demand, and only facts the worker actually emitted. The activity reducer remains the audit source; this renderer intentionally does not expose private chain-of-thought or retry noise."* It filters to `active`/`done` only, labels the region `aria-label="Observed run activity"`, and keeps failed/unknown attempts in `ActivityRun` for audit while never letting them become the headline.
- **AICSS is a separate, legitimately-licensed library**, not a home-grown clone: `github.com/kvnkld/aicss` @ `a78d3c308d10972e5196331162c5c2c870b1a69f` (`@aicss/react` 0.1.4), MIT, license verbatim, plus three components from the AICSS shadcn registry with a table recording which slugs were **refused as Pro-licensed**. It supplies the orb, streaming text, thinking state, code block, text response, file diff, comparison table, data table, inline citations.
- **Two honest gaps:** `ReasoningContent` (the upstream content region) is exported and tested for existence but **never used in the product** — the app hand-rolls the content region behind `useReasoning().isOpen`. And `aicss/thinking-reasoning/ThinkingReasoning.tsx` is vendored but **unreferenced** (only re-exported from `aicss/index.ts`).
- **Guards:** `ai-elements-reasoning.test.mjs` pins the four exports and the `ReasoningContentProps` signature; `aicss-vendor.test.mjs` pins the vendored files by hash. Both green (17/17 together with `thinking-redesign.test.mjs`).
- **Playtest integration:** `ReasoningDetails` renders `PlaytestCard` with the real run and frames. `apps/web/src/lib/playtest-view.ts` documents the honesty rule — a stale frame is shown, dimmed, over its real age, never hidden and never unmarked; and *"any notion of 'live video', any frame interpolation, any smoothing between frames, and any placeholder image"* is deliberately absent.
- **Is the requirement "chat/thinking comes from AI Elements" fully satisfied?** **Mostly, and honestly.** The Reasoning surface is the official component with full provenance. It is a **vendored/adapted copy, not the npm package** — so "comes from the AI Elements project" is satisfied, "is the upstream package unmodified" is not (and the NOTICE says exactly which parts differ).
- **Remaining visual defects:** the two `apps/site` findings (§3 #4, #5) are not in the app; the app itself measured **0 AA failures** and **0 controls without a focus ring** after the `--nm-faint` fix. Responsive behaviour is covered in §9.

---

## 6. Roblox Studio capability

**Typed operations only.** `assets.ts` / `roadmap.ts` use `transform_instances`, `set_props`, `get_instance`, `get_tree`, `insert_asset`, `list_scripts`, `read_script` — **no `run_code`/`run_luau`**. `Ops.luau:173` serialises `Position`/`Size`/`CFrame`/`Anchored`/`Color`/`Material`/`Transparency`/`Text`/`Value`/`Image`/`SoundId` per node, so `get_tree` carries geometry.

**`run_code`/`run_luau` status:** `run_luau` is a shipped, advertised tool whose description states the refusal; it is **not** a general escape hatch and refuses `GetObjects`, `InsertService`, `rbxassetid://`, `Content.fromAssetId`, `loadstring`, and `require` of an asset id. Assets enter a place through `insert_asset` and nowhere else.

**Real Studio tests performed** — `Place1.rbxl`, `5d1aafd5-11c0-4eab-a75e-004ea7c8d618`, Edit mode, read-only:
- `game:GetService('ThumbnailGenerator')` → **error: `'ThumbnailGenerator' is not a valid Service name`** — re-verifies the premise `apps/plugin/src/Render.luau` records as "verified against real Studio".
- `CaptureService` exists and `.CaptureSaved` is a member.
- **§J on real data:** 3 BaseParts, **all 3** exposing `Vector3` Position and Size. Sample: `Workspace.Baseplate`, `Position 0, -8, 0`, `Size 2048, 16, 2048`, `Material Plastic`.
- `workspace.CurrentCamera.ViewportSize` → **`1531, 755` (2.028:1, not 16:9)**.
- The place contains **exactly a 2048-stud Baseplate**, which is what `GROUND_PLANE_STUDS = 600` in `Render.luau` exists for.

**§H/§I — corrected.** There are **two plugin directories**:

| | `apps/plugin/` | `apps/apple-plugin/` |
|---|---|---|
| tracked | yes | **no — untracked** |
| src | `Companion`, `Generation`, `Ops`, `Paths`, `Render`, `Serializer`, `Version`, `init.server` | `Bridge`, `Commands`, `GenerationService`, `Render`, `StudioCapture`, `init.server` |
| release artifact | `apple-plugin.rbxm`, **Sep 15 20:12** | `apple-studio.rbxm`, **Sep 22 00:58** + 7 `.rbxl` proofs (newest Sep 22 05:26) |

`apps/apple-plugin/src/StudioCapture.luau` (177 lines) implements §H/§I **exactly**:
- reads `workspace.CurrentCamera.ViewportSize` (`activeViewportSize`)
- `Position = Vector2.new(0, 0)`, `CaptureSize = Vector2.new(sourceW, sourceH)` (full viewport), `OutputSize = Vector2.new(w, h)` — with the comment *"CaptureScreenshot does not infer the source region from OutputSize… Roblox requires an explicit ResampleMode whenever those sizes differ."*
- `ResamplerMode.Default` applied **only when the sizes differ**
- `StudioCaptureScreenshotFormat.PNG`, `UICaptureMode.None`
- `fitOutputSize` preserves aspect and **never upscales**, with the stated reason: *"Distorting a 16:9 Studio viewport into the software renderer's older 16:10 request would make the native path look 'live' while changing what the user actually sees."*
- bounded: `MAX_WIDTH 320`, `MAX_HEIGHT 240`, `MAX_PNG_BYTES 240*1024`, `MAX_BASE64_CHARS 320*1024` (matching `frame-bus.ts`'s admission ceiling)
- verifies the PNG magic bytes (`0x89 P N G 0x0d 0x0a 0x1a 0x0a`) and destroys the capture object on every exit path
- returns `source = "studio_viewport"`, `encoding = "png"`

**Software-render fallback identifies itself:** every frame-emitting path stamps `source: 'software_render'` (`do/session.ts:4762`, `tools.ts:694`, `frame-bus.ts:291,301`, `web/routes/studio-preview.tsx:44`). `StudioFrame.source?: 'studio_viewport' | 'software_render'`, and *"Absent means a legacy software-render frame"* — a correct inference, since software was the only renderer before this.

**Capability mismatch remaining:** §H/§I are implemented, but I could not confirm **which plugin the product actually ships**. AGENTS.md names `release/apple-plugin.rbxm` (Sep 15); the newer artifact is `apps/apple-plugin/release/apple-studio.rbxm` (Sep 22). **UNRESOLVED.**

**Not performed:** the paired loop (plugin → `SessionDO` → agent → Studio) end to end — needs the plugin installed and a signed-in session. **No rendered image was produced.**

---

## 7. propose_plan / verifier regression

**Reproduced historically, then fixed — and I verified the fix, not the reproduction.**

The historical regression is recorded in `apps/worker/src/tools.ts` around line 398 with the measured tool trace:

```
✗ propose_plan — this plan never checks its own work. Add at least one verification…
✗ propose_plan — this plan never checks its own work. Add at least one verification…
✗ propose_plan — this plan never checks its own work. Add at least one verification…
→ "I reached the step limit for this run."   8 Credits asked, 8 returned
```
project `52a4b8c5`, 2026-09-21, one part requested. A run before it died after `get_project_tree, get_selection, get_project_tree, propose_plan` — 26 Credits asked, 26 returned.

**Final behaviour:** `readProposedPlan` no longer refuses. If no step names one of the five verifiers (`run_and_check`, `run_spec`, `audit_build`, `check_composition`, `inspect_visually`), it **appends** `inspect_visually` and sets `verifierAdded`, announcing the addition to the model in the tool result and to the user in the checklist. The stated principle: *"The PROPERTY this guard defends is 'the plan that runs contains a check'. It is not 'the model must be the one to write the check down.'"*

**Tests proving it** — `apps/worker/tests/propose-plan.test.mjs` + `run-plan.test.mjs`, **32/32 pass**:
- `a plan with no verification step is COMPLETED with one, and the addition is announced`
- `a plan that already checks its own work is left exactly alone`
- `each of the five verifiers on its own satisfies the rule`
- `propose_plan is a registered tool, so nothing below passes vacuously`
- `a step naming a tool that does not exist is REFUSED`; `a plan cannot name propose_plan as one of its own steps`; `an over-long plan is refused rather than truncated into a lie`

**Caveat:** proven as code and as a guard. **Not** proven as a surviving real run — that needs the paired loop.

---

## 8. Validation results

All measured in this session, final state:

| suite | result |
|---|---|
| web typecheck | `tsc --noEmit` **exit 0** |
| web tests | **2072 / 2072 pass, 0 fail** |
| web build | **✓ built in 1.49s** → `dist/assets/index-BSdMW2lW.js` (477.85 kB / gzip 145.03 kB) |
| worker typecheck | `tsc --noEmit` **exit 0** |
| worker tests | **3706 / 3706 pass, 0 fail** |
| site tests | **246 / 246 pass, 0 fail** |
| site build | **20 page(s) built in 6.10s, exit 0** |
| training tests | **588 / 588 pass, 0 fail** |
| root tests | **526 / 526 pass, 0 fail** |
| sdk tests | **90 / 90 pass, 0 fail** |
| shared tests | **0 tests discovered** (no test files in the package) |
| evals | **1415 / 1415 pass, 0 fail**; `selftest.mjs` exit 0 |
| plugin | ops 45 · paths 32 · rasteriser 13 · render 12 · serializer 8 · snapshot 14 · companion 1 · **mutation-check: all 56 mutations caught** |
| `git diff --check` | **clean** |
| gate-suite | `gate-check.mjs --status` → **44 gates, all recorded MET, 37 STALE** (tree dirty, by design); "37 need(s) work" |
| security / RLS proofs | **NOT RUN this session — UNVERIFIED** |

**Falsifications performed (red-first, all restored byte-identical):** removing the asset-refusal sentence → only test 5 red; re-adding the usage instruction → only test 5 red; weakening the mode refusal → only test 6 red; the `render_view` 48×32 pin widened to 1920×1080 → only test 14 red; `needsProtection` → false → 7 B1/B3 tests red; reverting the skew message → only the new guard red; restoring `--nm-faint: #6f6f6f` → **exactly one** test red.

---

## 9. Browser / visual QA

**URL:** production — `https://apple.moshe-barami111.workers.dev` (not a local build).
**Harness:** 36 runs. **Artifacts:** `docs/evidence/2026-09-22-browser-qa/` (32 screenshots + `report.json`).

**Covered:** viewports **320×720, 390×844, 768×900, 1440×900**; **dark + light**; **LTR + RTL**; **`prefers-reduced-motion: reduce`**; **keyboard tab walk** (30 stops); pages `/`, `/pricing`, `/app`.

**Results:** horizontal scroll **0/36**; real overflow **0**; animations under reduced motion **0/4**; keyboard 30 stops in DOM order, all visible when focused.

**Tested and NOT covered** (stated, not implied): streaming, Plan mode, Agent mode, Autonomous, Studio connected/disconnected, Playtest, failures/retries, long messages, attachments, code/diffs/citations — **none of these were exercised**, because `/app` was measured as a signed-out stranger. Also **not** covered: contrast over gradients/images (the resolver walks to the first opaque `background-color`), and the app's **light theme**, which is unreachable for a first-time visitor because the app serves `data-theme="dark"` regardless of the OS setting.

**Visual/product bugs found:**

| finding | fixed? |
|---|---|
| `--nm-faint` below AA on every account screen (3.94 dark / 3.28 light) | **FIXED and redeployed**; re-probed live → **0 AA failures on `/app`** |
| Landing composer shows no focus ring (WCAG 2.4.7 on the first control a stranger touches) | **NOT FIXED** — `apps/site`, in flight |
| 10 × `.micro` at 4.35:1 on `/` and `/pricing` | **NOT FIXED** — `apps/site` |
| `/pricing` CTA "Start building — free" contradicts its own tier rows | **NOT FIXED** — `apps/site` |
| `/` and `/pricing` give two different reasons the plugin is unavailable | **NOT FIXED** — `apps/site` |

---

## 10. Deployment

**Commands, exactly:**
```
node infra/deploy-worker.mjs apple
node infra/deploy-static.mjs --only web
```
Run as one shell chain to minimise the window.

- **Worker:** `deploying apple as BUILD_SHA=bd6ab34-dirty` · Total Upload 3907.32 KiB / gzip 1066.75 KiB · Worker Startup 40 ms · Uploaded in 13.08s · triggers 4.20s · **Current Version ID `b477cd57-1595-42f0-9124-724cae18822b`** · `verified — https://apple.moshe-barami111.workers.dev is serving bd6ab34-dirty`.
- **Web:** `/app` — **14 files**, `done — 14 file(s)`, `verified — every page serves the bytes just uploaded`. Re-run after the contrast fix.
- **Site:** **NOT DEPLOYED** — see §14.
- **Showcase:** not deployed.
- **Database:** nothing applied; schema already complete.
- **Production URL:** `https://apple.moshe-barami111.workers.dev`

**Proof the deployed bytes are the intended build** (fetched back, not read from logs):
```
/api/health  → {"ok":true,"version":"0.1.0","buildSha":"bd6ab34-dirty", ...}
/app         → assets/index-BSdMW2lW.js
```
Served bundle searched: `plan:"clay"` / `agent:"stone"` → **0 occurrences**; `clay` / `rune` / `super-agent` → **0 occurrences**. Served CSS searched: `6f6f6f` / `858581` → **0 occurrences**; `nm-faint:#8a8a8a` and `nm-faint:#6b6b67` present.

**Independent corroboration via the Cloudflare API:** latest deployment `953cbf78-142b-44a4-8ce2-e1bdb7db39ec`, created `2026-09-22T16:57:50.403406Z`, version `b477cd57-1595-42f0-9124-724cae18822b` — the same version wrangler reported. Previous deployment `1ec649bd-66f3-4dc1-b1ea-0730b7bf8bf8` (2026-09-21T20:51:26Z, version `925eabdc-…`).

**Full public surface, live:** `/` 200 · `/pricing` 200 · `/docs` 200 · `/changelog` 200 · `/privacy` 200 · `/terms` 200 · `/showcase` 200 · `/proof` 200 · `/status` 200 · `/app` 200 · `/app/assets/index-uqDfSY7l.js` 200 · `/api/health` 200 · `/app/signup?start=…` 200.

**Why worker-first.** The rename is a breaking wire change and the live SPA is served **from D1**, so a worker-only deploy does not change it. Both orders leave a window where an open tab cannot send. Worker-first wins because the person is then refused with the **actionable** `MODE_SKEW_REFUSAL` — *"reload the page to keep building"* — whereas web-first would be refused by the old worker with `'Unknown mode for this request.'`, which is true and useless. **The refusal message is the migration mechanism**, which is why it was reworded *before* the deploy.

---

## 11. Cloudflare state

**The Cloudflare MCP is configured and works.** `~/.workbuddy-ai/mcp.json` (mtime 2026-09-22 18:49) lists six servers: `context7`, `sentry`, `supabase`, `hugging-face`, `roblox-studio` (`/Applications/RobloxStudio.app/Contents/MacOS/StudioMCP`), and `cloudflare` (launched via `npx`, i.e. `mcp-remote`, per the setup the user described).

**I verified it works during this session** with two read-only calls — `GET /accounts/{accountId}/workers/scripts/apple/deployments` and `.../settings` — both `success: true, status: 200, errors: []`. Account id used: `e9b8acf2e89a1de289a1ee4abb0f3f8d`. The result corroborates the deployment (see §10).

**Honest qualification: I did NOT use the Cloudflare MCP for the deployment or for production inspection.** Both were done with `wrangler` via `infra/deploy-worker.mjs` and with `curl` against the live origin. The MCP was exercised only at the end, as a cross-check. So the correct statement is: **the connection was verified working at the end of the session; it was not relied upon during the work.** I have no evidence either way about whether it stayed connected throughout.

No tokens, cookies, credentials, secrets or cached OAuth values are recorded here or anywhere in the evidence files.

---

## 12. Files intentionally deleted / retired

**17 deletions present in the working tree** (not made by me — they are part of the in-flight redesign, listed so the next session does not resurrect them):

`apps/web/src/components/ws/activity.tsx`, `evidence-cards.tsx`, `evidence-cards.css`, `project-stage.tsx`, `project-stage.css`, `studio-view.tsx`, `thinking.css`; `apps/web/src/design/relaunch.css`, `workspace-cinematic.css`; `apps/web/tests/activity-motion.test.mjs`; `apps/site/src/components/CreditMeter.astro`, `FlowField.astro`, `Horizon.astro`; `apps/site/src/styles/relaunch.css`; `apps/site/tests/flow-field-runs.test.mjs`, `horizon-runs.test.mjs`, `withdrawn-modes.test.mjs`.

**Why:** the workspace was rebuilt as a cinematic chat canvas and the site relaunched as a minimal design; these are the superseded components and their tests. `activity.tsx`'s replacement is `activity-model.ts` — the **data model was kept deliberately** so the audit trail survives even though the old renderer is gone.

**Retired earlier (by the previous session, still relevant):** the entire asset library — the harvest directory under `packages/corpus/data/`, the `asset_library` D1 table's code, the ingest/import pipelines, the `search_asset_library` tool and the `/api/assets/*` routes. Replaced by `find_verified_asset` (live Creator Store, verified per id), `insert_asset`, `generate_image`, `generate_model`, `create_instances`.

**Also removed by me, in code:** the `MODE_ALIASES` mechanism (retired mode names as aliases) — its removal silently broke two CLIs that no test imported, which is how I found it.

---

## 13. Historical / provenance data intentionally preserved

**Active-code residue — inspected, and legitimate in each case:**

| location | token | why it stays |
|---|---|---|
| `apps/worker/src/do/session.ts:408` | `clay`/`stone`/`rune` | a comment recording the rename and its measurement |
| `apps/worker/src/prompts.ts:384` | `stone`, `clay`, `rune` | a comment explaining the `.filter(Boolean)` silent-degradation bug |
| `apps/worker/src/semantic.ts:548` | `rune` | a **fantasy-genre keyword** in scene classification — an ordinary word |
| `apps/web/src/routes/ui-lab.tsx:249` | `Rune Ring` | a **Roblox Creator Store asset name** |
| `apps/worker/src/providers/index.ts:7`, `pricing.ts:28`, `apps/web/src/components/ws/composer.tsx` | `specialist` | a **model role**, in code comments (the composer hit is inside a `{/*[[ … ]]*/}` comment, not customer copy) |
| `packages/evals/src/history.test.mjs`, `selftest.mjs`, `economics.mjs` | `clay`, `rune` | **historical model ids** in fixtures and `MEASURED` cost records |

**No active runtime branches on any retired name.** `VALID_MODES = new Set<ProductMode>(['plan','agent'])`, `asProductMode` refuses everything else, and the live bundle contains zero legacy tokens. Counts across shipped source: `clay` 46, `rune` 23, `specialist` 9, `super-agent` 1, `Golem Mode` 0, `stone` 87 excluding `milestone` — **every one of them a comment, an ordinary word, an asset name, or an eval fixture.**

**Preserved deliberately as provenance, not touched:** `packages/training/data/**`, `packages/training/runs/**`, `packages/training/prompts/**`, `packages/training/discovery/**`, `packages/corpus/**`, `docs/evidence/**`. These carry the retired vocabulary because they are records of runs that actually happened. Per the instruction, they were **not** rewritten.

**Wire literals deliberately NOT renamed:** `golem.v1`, `X-Golem-`, `golem_session`, `@golem/`, worker name, D1 `golem-corpus`, KV `golem-kv`. Renaming any of them breaks live sessions and stored rows.

---

## 14. Current unresolved issues

| # | severity | where | evidence | next action |
|---|---|---|---|---|
| 1 | **HIGH** | `apps/site` | `pricing.astro` mtime 19:45:48, three more files 18:26; `tests/e2e/landing.spec.ts` uncommitted and **red** (15 mobile failures) | Wait for the site worker to stop, then re-aim the spec and deploy the site |
| 2 | **HIGH** | `apps/site` | `/pricing` carries a "Start building — free" CTA while the same page says "public installation removed by Roblox moderation, appeal filed" | One-line copy fix; owner decision |
| 3 | **HIGH** | `apps/site` | `/` says "Roblox has not approved it for distribution"; `/pricing` says "removed by Roblox moderation, appeal filed" | Pick one true story; owner decision |
| 4 | **MEDIUM** | `apps/site` landing hero | `:focus-visible` matches, `outline-style: none` — no visible focus change on the composer | Add a focus style |
| 5 | **MEDIUM** | `apps/site` | 10 × `.micro` at **4.35:1** on `/` and `/pricing` | Raise the token |
| 6 | **MEDIUM** | two plugin directories | `apps/plugin/release/apple-plugin.rbxm` (Sep 15, tracked) vs `apps/apple-plugin/release/apple-studio.rbxm` (Sep 22, untracked). AGENTS.md names the former | Determine which ships; reconcile AGENTS.md |
| 7 | **MEDIUM** | `packages/shared/src/index.ts` | `STUDIO_PLUGIN_STORE_LIVE = false`, but the Creator Store listing answers **200** (flipped 404→200 between 09-19 and 09-22; controls: Rojo 7 → 200, Moon Animator 2 → 200, garbage id → 404) | Owner decision; the appeal window runs to 2026-10-19. Flipping changes copy in nine files |
| 8 | **MEDIUM** | `infra/supabase/tests/rls-isolation.mjs` | 43 tenant-isolation checks exist and self-falsify, but were **not run this session** | Run it |
| 9 | **LOW** | `packages/evals/src/` | `clay`/`rune` remain as historical model ids in fixtures | Leave — provenance |
| 10 | **LOW** | `apps/web/src/components/ai-elements/reasoning.tsx` | `ReasoningContent` exported and tested but never used | Either use it or stop exporting it |
| 11 | **LOW** | `apps/web/src/components/aicss/thinking-reasoning/` | vendored, unreferenced | Leave (it is a vendored library, hash-pinned) |
| 12 | **LOW** | `scripts/gate-check.mjs --lint` | 12 problems on 4 gates (G-S1, G-SEC-1, G-ORACLE-7, G90) — a **documented disagreement between two checkers** (`gate-check --lint` demands `git-sha=`+`tree-clean=`+`at=`; `check-escape-hatches.mjs` accepts that triple **or** `output-sha256=`+`output-bytes=`) | Reconcile the two checkers |
| 13 | **LOW** | `packages/shared` | 0 tests discovered | Confirm that is intended |

**One failure I diagnosed as NOT a defect:** `tests/e2e/landing.spec.ts:718` (`no link anywhere on the site points at a section that no longer exists`) reports `/showcase` → HTTP 404 on six pages. `/showcase` is **not an Astro page** — `infra/deploy-showcase.mjs` uploads it to D1 via `deploy-static.mjs --file`. It returns **200 in production** (verified). The test resolves links against the local Astro build only, so this failure is a **local artifact**.

---

## 15. Current repository safety notes

- **Dirty:** 358 entries — 247 modified, 17 deleted, 94 untracked. `git diff --shortstat`: 264 files, +7544 / −13314.
- **Committed:** nothing by this session. The last commits are `bd6ab34` ("Rebuild workspace as cinematic chat canvas") and `6731d5b` ("Redesign Apple frontend end to end") from an earlier session.
- **Pushed:** **nothing.** Local `main` is **13 commits ahead** of `origin/main` (`33d2f377`), 0 behind.
- **Remote main does NOT match local.**
- **Files another agent must not overwrite:**
  - `apps/site/**` and `tests/e2e/landing.spec.ts` — **actively being edited by another worker**. Do not deploy the site and do not re-aim that spec until that worker stops.
  - `apps/web/src/routes/nonworkspace-minimal.css` — untracked, new; I changed `--nm-faint` in it.
  - `apps/web/tests/contrast.test.mjs` — I extended it; do not revert the `nm-*` block.
- **`git add -A` is forbidden**, as are `git reset`, `checkout`, `switch`, `stash`, and `pnpm install`. The dirty checkout is authoritative.
- **External state that must not be reset/recreated:** the live `CORPUS` D1 database still holds ~511,208 orphaned asset-library rows that the product no longer reads or writes — **do not drop them without asking**; the owner may want the audit trail. The Supabase `messages_mode_check` constraint now accepts only `plan|agent`. Worker version `b477cd57-…` is live; rolling back requires `wrangler rollback`, and the SPA would then be ahead of the worker.
- **Do not rename** `golem.v1` / `X-Golem-` / `golem_session` / `@golem/` / the worker name / `golem-corpus` / `golem-kv`.

---

## 16. Exact next actions for a fresh Claude session

1. **Wait for the `apps/site` worker to stop** (check `find apps/site -type f -newermt '-20 minutes'`). Then re-aim `tests/e2e/landing.spec.ts` at the committed relaunch and run G92. **Do not do this while it is still writing.**
2. **Deploy the site** once (1) is done: `pnpm --filter @golem/site build && node infra/deploy-static.mjs --only site`.
3. **Fix the `/pricing` CTA contradiction** (unresolved issue #2) and the two conflicting "why not installable" statements (#3).
4. **Add a focus style to the landing composer** (#4) and raise the `.micro` token (#5).
5. **Run `node infra/supabase/tests/rls-isolation.mjs`** and record the result (#8).
6. **Decide which plugin ships** — `apps/plugin` or `apps/apple-plugin` — and reconcile AGENTS.md (#6).
7. **Get the owner's decision on `STUDIO_PLUGIN_STORE_LIVE`** (#7).
8. **Commit.** Nothing is committed and nothing is pushed; the tree is 13 commits ahead of `origin/main`.
9. **Optional:** run `infra/deploy-static.mjs` for the showcase if `/showcase` changed (it did not).

**Do not redo:** the worker/SPA deploy, the mode-rename migration, the eval re-aiming, the `--nm-faint` fix, the AI Elements audit, the `propose_plan` fix, the browser QA sweep. All are verified complete above.

---

## 17. Final factual status

**IMPLEMENTATION:** **PARTIAL** — worker + SPA are live and green; the site's own defects (focus ring, `.micro` contrast, the `/pricing` CTA contradiction) are unfixed because `apps/site` is being rewritten by another worker and was deliberately not deployed.

**VALIDATION:** **COMPLETE** — worker 3706/3706, web 2072/2072, evals 1415/1415, site 246/246, training 588/588, root 526/526, sdk 90/90, plugin 56/56 mutations caught, both typechecks exit 0, `git diff --check` clean.

**DATABASE:** **COMPLETE** — every migration 0001–0013 verified present in the live schema by direct query; `messages_mode_check` = `plan|agent`; 0 rows carrying a mode. RLS proof **NOT re-run** this session.

**CLOUDFLARE:** **PARTIAL** — the MCP connection was verified working at the end of the session (two read-only calls, both 200) and corroborated the deployment; it was **not** used during the deploy or the production inspection.

**DEPLOYMENT:** **COMPLETE for the worker and SPA** — `bd6ab34-dirty`, version `b477cd57-1595-42f0-9124-724cae18822b`, deployment `953cbf78` at `2026-09-22T16:57:50Z`, bytes fetched back and searched. **Site NOT deployed**, deliberately.

**REAL STUDIO:** **PARTIAL** — live `Place1.rbxl` in Edit mode confirmed the renderer's premise, the §J geometry contract on 3/3 BaseParts, and a real 2.028:1 viewport; `StudioCapture.luau` implements §H/§I in full. The **paired loop was not exercised** and no rendered image was produced.

**VISUAL QA:** **PARTIAL** — 36 production runs across 4 viewports, 2 themes, RTL, reduced motion and a keyboard walk, with 32 screenshots and `report.json`; **0** horizontal scroll, **0** reduced-motion violations, **1** app defect found and fixed. Signed-in surfaces, streaming, Plan/Agent/Autonomous, Studio-connected states and Playtest were **not** tested.

**FRESH CUSTOMER REVIEW:** **COMPLETE** — a subagent with no prior context reviewed the live site; its two sharpest claims (the `/pricing` CTA contradiction and the two conflicting reasons for non-installability) I **independently verified**.

**REMAINING BLOCKERS:** the `apps/site` worker is mid-rewrite, which blocks the site deploy and G92; the owner must decide `STUDIO_PLUGIN_STORE_LIVE` and which of the two plugin directories ships; nothing is committed or pushed.

# HANDOFF: Apple / RbxAI (2026-10-02, evening — supersedes the afternoon handoff)

Start here. Everything that was running was stopped cleanly at ~17:55 IDT so a fresh agent can continue from exactly this
point. The restore kit (workflow scripts, finished-workflow reports, prompts of the stopped agents) is in
`docs/handoff/2026-10-02/`. The owner (Moshe) is non-technical and reads Hebrew (he also writes English); lead with what
changed for him, never claim more than you measured, and end every reply with the meter (§2).

---

## 0. First 10 minutes for the next agent

1. Read this file, then `CLAUDE.md`, `AGENTS.md`, `.claude/skills/rbxai-working-rules/SKILL.md`, and the owner's memory
   `~/.claude/projects/-Users-moshe-Developer-RbxAI/memory/MEMORY.md` (esp. `generalize-not-patch.md`,
   `frontier-meter-every-turn.md`, `owner-standing-consent-2026-10-02.md`, `apple-github-remote.md`).
2. Re-set the owner's goal (§1.3) with `/goal` if the session supports it — the owner set it last session; it is the
   definition of done.
3. `git worktree list`, then check the state table in §4.2 still matches (`git -C <path> log -1`).
4. Continue at §6 "Next steps", step 1.

---

## 1. Goal

### 1.1 Product
**Apple**: an AI agent that builds Roblox games inside the user's own Roblox Studio. A Cloudflare Worker (`apps/worker`,
SessionDO per project, GLM `@cf/zai-org/glm-5.3-flash`) plus a Studio plugin (`apps/apple-plugin`) paired by a 6-character
code; web app `apps/web` (served at `/app`), marketing site `apps/site` (at `/`). The owner library (565 games, ~97k assets)
is served by a local Python gateway on the owner's Mac at `127.0.0.1:63747` (`packages/owner-corpus/gateway.py`).
Live: `https://apple.moshe-barami111.workers.dev` (`/api/health` shows `buildSha`; at handoff it was `76c30935-dirty`).

### 1.2 The owner's binding directive (2026-10-02; memory `generalize-not-patch`)
1. Never hand-fix one result; never add code that recognises a specific request or subject. Every failure is a missing
   agent **capability** (knowledge, tool, instruction) — fix that.
2. **Generalization test**: after each fix, ≥3 different, never-tried requests of that category, each in a fresh clean chat.
3. Expand the agent, don't restrict it. 4. The harness never decides taste; the agent decides; the harness gives information,
   tools and checks. 5. Every project is new: nothing copied from the agent's own earlier projects (the library and the
   Creator Store are preferred sources, not banned).
Plus: asset order (library → Creator Store, Roblox-owned/quality first → combine/adapt → build from scratch only as a last
resort, highly detailed); rich visuals checked by the agent with multi-angle screenshots before answering; genre-fitting UI;
RigEdit animation; SoundGroups sound design; context VFX; a huge knowledge base and skills library; website rebuilt from
zero (Claude Design when available) at landing-page quality everywhere with motion, speed, dark mode, a11y and a gimmick.

### 1.3 The owner's `/goal` (verbatim; it was active as a session Stop hook)
```
Work non-stop on the whole Apple product until ALL of these hold, measured, not claimed:
1) Method (binding): never hand-fix one result or add code that recognises a request/subject. Every failure = a missing agent capability (knowledge, tool, instruction); fix that. Each fix passes a generalization test: >=3 unseen requests of that category, fresh clean chats. Expand the agent, never restrict it. The harness never decides taste; the agent decides, the harness gives information, tools and checks.
2) Library: all 565 games classified (models, maps, systems, UI packs, kits, animations, VFX, SFX) with description, tags, image, size, colour, quality; semantic search by meaning/style/colour/size/type, >=90% top-3 on labelled queries; the agent picks the candidate that truly matches.
3) Asset order: library, then Creator Store (Roblox-owned/quality first; search, insert, inspect, modify, combine, strip unsafe scripts, verify in Play), then combine/adapt, then build from scratch only as a last resort and highly detailed.
4) Visual quality: rich maps (depth, layers, terrain, lighting, atmosphere, post-processing, sky, points of interest); the agent checks its own work with multi-angle screenshots and improves it before answering.
5) UI fits genre/style/audience, mobile + desktop, accessible; never copied from the agent's earlier projects (library and Store are allowed).
6) Systems from ready kits, understood deeply; real animation (RigEdit), real sound design (music, SFX, ambience, SoundGroups), context-fitting VFX.
7) Knowledge: all Creator Docs, Luau, Studio services, game design, optimization; a skills/recipes library; a full toolbox incl. play-test, screenshots, output reading, self-repair. The agent decides ambiguous requests itself and explains briefly.
8) Frontier: the fixed 30+ request bench (and a held-out bank), each in a fresh chat, scores >=11/12 on the core criteria; harsh critique, framework fix, re-test until green.
9) Website rebuilt from zero (Claude Design when available): new design language and logo, every page at landing-page quality, motion, speed (Lighthouse >=90), responsive, dark mode, accessible, a memorable gimmick.
10) GitHub: green CI on main, rulesets, Codespaces, GitHub Packages, clean organised repo and docs, "golem" removed everywhere incl. Cloudflare/Supabase/Sentry.
11) A final giant integration PR containing everything, reviewed with ultrareview, findings fixed.
Report every turn: the fixed meter (25% agent, 20% knowledge+library, 15% visual, 10% UI, 10% sound/anim/FX, 20% website), measured vs estimated, done / in progress / next. Never overclaim.
```
The owner's full original Hebrew message (8,393 chars) is the source; the goal above is its condensed form he approved.

### 1.4 The owner's phase plan (0–7)
0 measurement/baseline (**done**) → 1 strip request-specific code (**done on integration**) → 2 library classification +
semantic search (**built, 76% top-3 vs 90% target**) ∥ 6 website rebuild (**round 1 done, round 2 WIP**) → 3 Creator Store
pipeline (designed, M6 in the plan) → 4 agent capabilities (self-check, behaviour, dup-names built; rest in the plan) → 5
visual/UI quality → 7 frontier loop throughout. Plan for 3+4: `docs/autonomy/PHASE-3-4-PLAN.md` (M0–M8).

---

## 2. Meter (fixed formula, memory `frontier-meter-every-turn`; computed by `packages/evals/owner-bench/score.mjs`)

Total = 25% agent + 20% knowledge & library + 15% visual + 10% UI + 10% sound/anim/FX + 20% website.

| Domain | Value | Source |
|---|---|---|
| Agent (mean works, matches, noErrors /2) | 59.6% | measured, baseline (old code) |
| Knowledge & library | 15% | estimate (phase 2 not live) |
| Visual (professional) | 15.8% | measured |
| UI (polished on ui+game) | 37.5% | measured (3 UI + 1 game) |
| Sound/anim/FX | 17.3% | measured (sound 0.08) |
| Website | 10% | estimate (committed formula; new design not live) |
| **Total** | **27.8%** | |

It moves only after the integrated code is deployed and the bench is re-run.

---

## 3. Current progress (what is DONE, with evidence)

### 3.1 Phase 0 — baseline (closed)
- Bank `packages/evals/owner-bench/requests.json` (owner-30-v1, frozen). Held-out bank `heldout-v1.json` (21 items,
  written blind; 11 near-duplicates of the bank replaced before freezing). Never edit an item after seeing its score.
- Results `packages/evals/owner-bench/results/2026-10-02-baseline.json`; report `BASELINE.md`: 26/30 measured, mean
  7.27/18, 3,423 credits; objects matched 0.33/2, maps 5.3/18, sound 0.08. Unmeasured: p19 (skipped to save credits),
  g28 (tab reload), g29/g30 (deferred to the integrated code). Judge-only (photos expire after 1 h; use `review.mjs` next time).
- Tools: `runner.js` (browser, owner's Chrome tab), `run.mjs` (headless Node runner with `--max-credits`, resume,
  dry-run), `review.mjs` (photo review, lower-only), `score.mjs` (meter).
- Status docs fixed: `docs/autonomy/NEXT_ACTION.md` and `vision-status.json` no longer claim "frontier".
- Decision `docs/autonomy/DECISIONS.md` **D-MODELLIB-3** supersedes D-MODELLIB-2.

### 3.2 Root causes found (framework level; see BASELINE.md)
1. A pre-model library step chose by **name** and added the same stage/wobble/counter/"Click it!" kit to everything.
2. **D-MODELLIB-2** refused any Parts build named by one of ~130 nouns; the prompt said "take the closest hit".
3. A harness nudge **spoke as the user**: "build geometry from Parts rather than looking for assets".
4. Maps: ~100–130 small model steps × ~35k input tokens, 25 min, 430–584 credits; failed build calls retried with new
   coordinates; loop guards ended runs.
5. Library pieces arrive with scripts/sounds stripped; nothing re-adds requested behaviour.
6. No self-check before answering (false claims about colour, hidden text, sounds).
7. Sound design absent.
8. The plugin refuses writes/deletes on duplicate-named siblings (`path is ambiguous`) — breaks editing and the bench reset.

### 3.3 The integration branch `integration/giant` (worktree `/Users/moshe/Developer/RbxAI-integration`, HEAD `6aa3c4bc`)
Merged and green at merge time (worker 4,908/4,908 after world-building; root 588/588; web 2,453/2,453; site 309/309):
- **Credits** (cuts wasted steps: failure streak per tool once per step, length-cut bounds, `more_tools` by name, back-and-forth
  window; + fixes for all 4 ultrareview findings on PR #11).
- **Phase 1** (no pre-model step, no forced routing, `preview_library_models`, `dress_object`, build ledger, labelled memory,
  subject-literal guard tests).
- **Website round 1 "Ember Rail"** (tokens, brick logo, landing + Baseplate toy, app shell; + fixes for all 5 ultrareview
  findings on PR #12; app tool labels).
- **Phase 2** (`packages/owner-classify`: 95.9% of items classified, hybrid search 38/50 = 76% top-3 — target 90% NOT met;
  `browse_owner_library mode:"find"`; gateway patch NOT applied to the live gateway). Pre-model wiring dropped in phase 1's favour.
- **World-building** (`pushHarness` "[Harness note, not the user]"; the phantom "Parts rather than assets" nudge removed;
  asset-order gate in `model-rule.ts` — a parts Model held back ≤2× until the library was tried, no word lists; reliable
  library inserts; typed/located build errors; `clone_instances at/along/within`, `create_instances origin/group`,
  `edit_terrain path` + `waterLevel`; loop-guard messages; subject leakage removed).
- **Main** (baseline, status docs) and **GitHub platform** (`.devcontainer/` Codespaces, `publish-packages.yml` +
  `scripts/github/publish-packages.mjs` for GitHub Packages, `.github/rulesets/main.json` + `scripts/github/apply-rulesets.mjs`
  — NOT applied, CODEOWNERS, PR/issue templates, dependabot, `docs/operations/GITHUB.md`).
- Owner-classify manifest + workspace-coverage checker fix (`4b52b029`).
- CI agent (stopped): `def76bd5` security pin for the bench-reset admin route (evals A4), `6aa3c4bc` web lazy-route chunk
  naming (app bundle budget). Unverified as a whole.
Context-budget note: the tool-definition budget test (floor 60,000 chars of context left) sits ~60,1xx; every new tool text
needs an equal cut elsewhere (measure with esbuild, see `docs/handoff/2026-10-02/agent-prompts/02-*.md`).

### 3.4 Built on branches, NOT yet in integration
| Branch / worktree | What | State |
|---|---|---|
| `worktree-wf_90b4b7a1-0cd-2` | Self-check M1 (`SELF_CHECK`): ledger, `look`, gate, claim audit | review PASS; fix the 96 KB vs 240 KB PNG cap while merging |
| `worktree-wf_90b4b7a1-0cd-3` | Duplicate-named siblings fixable/deletable/clonable; benchClean empties such a place | review PASS; plugin change → release |
| `worktree-wf_90b4b7a1-0cd-4` | Behaviour M4 (`BEHAVIOUR_V2`): AppleBehave, model_anatomy, add_behaviour, lint | review PASS |
| `worktree-wf_90b4b7a1-0cd-1` | Asset-order variant | **REJECTED** (refused 2–5-part Models; 6-part taste floor). Do not merge. |
| `worktree-wf_1cadd7fe-3c0-6` (HEAD `431779ce`) | Golem removal A + B1 (+ fixes): codemod `scripts/rename-golem.mjs`, guard `scripts/check-no-golem.mjs` (CLEAN), env `APPLE_*` with `GOLEM_*` fallback, server accepts both wire spellings, runbook `docs/operations/GOLEM-REMOVAL-RUNBOOK.md` (cloud steps C/D, not executed) | ready; apply by RE-RUNNING the codemod on the final integration tree, not by merging |
| `golem-rename-b2` (`e4b0fd96`) | B2: clients send the new spellings | merge ONLY after B1 is deployed and `/api/health` shows `compat: wire-both` |
| `worktree-wf_73a32ca7-af0-6` (HEAD `d9354ed2`) | Repo organisation: `scripts/reorg-repo.mjs` + `scripts/reorg/plan.json` (moves, deletions, reference rewrites), docs/ restructure, `platforms/`, scripts/ split, AGENTS.md map, `docs/operations/REPO-CLEANUP-PENDING.md` (untracked deletions + GitHub actions) | implemented (9 commits); its verify step was stopped; apply by re-running the engine on the final tree |
| `design/round-2` (worktree `/Users/moshe/Developer/RbxAI-design2`, `f0ab5be6`) | Website round 2: audit done; motion system/gimmick/landing fill and some app shell work in progress | **WIP, unverified**; 50 MB of screenshots uncommitted in `docs/evidence/ember-rail-round2/` |
| `integration/caps` (worktree `/Users/moshe/Developer/RbxAI-caps`, clean at `4b52b029`) | where the three approved tracks were being merged | merge aborted cleanly; redo per prompt 02 |
| `credits-waste-cut` / `design-ember-rail` | draft PRs [MosheBarami/Apple#11](https://github.com/MosheBarami/Apple/pull/11), [MosheBarami/Apple#12](https://github.com/MosheBarami/Apple/pull/12) (ultrareviewed; superseded by integration) | close as superseded when the giant PR opens |

**Backups on GitHub** (all pushed at handoff): `integration/giant`, `design/round-2`, `golem-rename-a-b1`
(= `worktree-wf_1cadd7fe-3c0-6`), `golem-rename-b2`, `repo-organize` (= `worktree-wf_73a32ca7-af0-6`), `cap-self-check`
(= `-0cd-2`), `cap-dup-names` (= `-0cd-3`), `cap-behaviour` (= `-0cd-4`). If a local worktree is missing, `git fetch` and
use these. Phase 1, phase 2, world-building, credits and website round 1 live inside `integration/giant`.

### 3.5 Other things done today
- **Repo chat tool** `tools/repo-chat` (committed `e853a090` on main): local read-only AI chat about the repo, Next.js + AI SDK
  + all AI Elements, model `stealth/space-bunny-alpha` via OpenRouter (free, verified). Key in `tools/repo-chat/.env.local`
  (gitignored; NEVER print or commit it; the owner pasted it in chat — recommend he rotates it). Run: launch config
  `repo-chat` (port 4790) or `npm run dev` in that folder. 39 tests; knowledge index of 490 docs; 10 skills.
- **GitHub**: repo `MosheBarami/Apple` was PUBLIC → made **private** (owner approved). Before that GitHub secret scanning
  found 3 alerts — all fake test fixtures (resolved "used in tests"). Dependabot alerts + security updates enabled. Free
  plan: no secret scanning/push protection on private repos; Actions quota 2,000 min/month (CI ~30–40 min/push — reduce).
- **Dependabot**: 64 open alerts (2 critical Astro RCE via AVIF image optimisation, 18 high) — needs one coordinated
  dependency upgrade (see §6).
- `CLAUDE.md` gained Commands + Architecture sections. Phase 3+4 plan committed.

---

## 4. Environment and state

### 4.1 Live system (unchanged today)
- Deployed worker `76c30935-dirty` (10:49 UTC). Cloudflare Workers Builds uploads a **preview version** (not production) for
  every PR branch — verified with `wrangler versions/deployments list`.
- Studio: process 83647 "Place1" is paired to the project "Owner benchmark" `b7249560-4868-4c59-96d6-95eb1322d4e7` with edits
  allowed; the place holds the last bench run's build. Checkpoint `bench-baseline` = `fe4de41c-6c8d-48b4-acca-e1b8aaea6546`.
- Owner's Chrome tab on `https://apple.moshe-barami111.workers.dev/app/projects/b7249560-…` holds the bench results in
  localStorage key `ownerBench:owner-30-v1` (also saved in the repo). Runner state there is gone (tab reloads kill it).
- `wrangler dev --remote --port 8799` from `apps/worker` has been running for >1 day; not started by this session — left alone.
- `.env` (repo root) exists again (owner restored it): `APPLE_ADMIN_KEY`, `APPLE_E2E_*`. Admin routes usable, e.g.
  `GET /api/admin/logs?kind=model_call&days=1&limit=2000` (per-call latency/tokens/cache — this is how the map slowness was diagnosed).

### 4.2 Worktrees (restore map)
`git worktree list` shows ~19; the relevant ones are in §3.3–3.4. Main checkout `/Users/moshe/Developer/RbxAI` is on `main`.
Integration-style worktrees use node_modules DIRECTORIES of symlinks into the main checkout, with `@apple/*` pointing at the
worktree's own packages (see how `/Users/moshe/Developer/RbxAI-integration/apps/worker/node_modules` is built). The
`.claude/worktrees/wf_*` worktrees belong to finished/stopped workflows; delete them only after their branches are merged.

### 4.3 Uncommitted in the main checkout (NOT mine — owner/other sessions)
- `.claude/settings.json`: someone removed the permission **deny rules** (incl. `Read(**/.env)` and keychain/ssh denies) and
  many tool denies. `.codex/hooks.json`: content removed. Ask the owner whether that was intended; do not commit or revert blindly.
- `.claude/launch.json`: has new entries `new-design-site` (port 4331, serves the integration site dist), `new-design-app`
  (5183, vite with `--config` of the integration web app; mock mode `?mock=1`, base `/app/`) and `repo-chat` (4790). Do not commit.

### 4.4 Restore kit `docs/handoff/2026-10-02/`
- `workflow-scripts/*.js` — every workflow script of this session (re-run with the Workflow tool via `scriptPath`; resume
  across sessions is not possible, so re-run from the stage you need, editing the script).
- `workflow-results/*.json` — the full final reports of the finished workflows (plans, implementation reports, reviews), and
  the journals of the two stopped ones (`stopped-wf_73a32ca7-af0-journal.jsonl` = repo organisation;
  `stopped-wf_45acd734-01e-journal.jsonl` = website round 2, contains the page-by-page audit and the gimmick spec).
- `agent-prompts/01-ci-green.md`, `02-merge-capability-tracks.md` — prompts for the two stopped agents, updated to now.

---

## 5. What worked / what didn't

### Worked
- **Fixing the framework, not the request**: diagnosing from the run's own logs + model-call telemetry (admin logs) found the
  real causes (D-MODELLIB-2, the user-voice nudge, duplicate names) in minutes.
- **Workflows in worktrees + adversarial reviewers**: reviewers caught real problems (a regression and a taste floor in the
  asset-order track, subject leakage in prompts, a set_mood loop escape, a drag bug, PNG caps). Keep "default to fail".
- **One integration branch, merge one track at a time, full suites after each**; restate (never delete) tests whose
  behaviour was deliberately changed; record each in the merge commit.
- **Red-first**: every guard shown failing on the old code (or with a planted fault) before trusting it.
- Pairing without the owner: `POST /api/projects/<id>/pairing` from his signed-in Chrome tab (Bearer = `access_token` from the
  `sb-*-auth-token` localStorage entry, never printed), type the code into Studio's Apple panel, click "Enable edits" twice.
- File → New in Studio gives a fresh place in a new process with the newest plugin; bring a process forward with
  `osascript -e 'tell application "System Events" to set frontmost of (first process whose unix id is <pid>) to true'`.
- Studio command bar: type Luau with `computer_batch` type + cmd+Return (autocomplete mangles some typing; long lines OK).
- Getting large data out of Chrome: append a `<pre>` to `<main>` and read with `get_page_text` (javascript_tool output
  truncates at ~1000 chars), or POST to a local receiver on 127.0.0.1 (worked for 98 KB).
- Keep the benchmark tab's session alive while hidden: the runner overrides `document.visibilityState`.
- Showing the website: preview_start on a static server for `apps/site/dist` and vite for the app in mock mode; Playwright
  (`node_modules/.pnpm/playwright@1.62.1/...`) for full-page screenshots.

### Didn't work (don't repeat)
- **Fitted tests and declaring frontier** ("5 of 5 green") — rejected by the owner. Only the bank + held-out bank count.
- A 12-minute turn cap in the runner: the run went on server-side and every later item failed with 409 "a run is in
  progress". Now 25 min + `/stop` + wait-for-idle.
- Hidden Chrome tab: Supabase stopped refreshing the session (401 after an hour).
- The browser tab reloading mid-run kills the in-page runner (g28 lost). Prefer the headless `run.mjs` next time.
- `benchClean` cannot empty a place with duplicate-named objects (plugin refuses) — cleared by hand from the command bar;
  fixed on the dup-names branch (needs plugin release/local install).
- Running the full benchmark on code about to be replaced — wastes credits (maps 430–584 each). Owner wants to save credits.
- Merging branches built on different bases without care: phase 2 had wired search into the pre-model step phase 1 removed.
- `pnpm install` in the shared checkout or in symlinked worktrees — never (F-68). For dependency upgrades use a fresh clone.
- Tool-definition growth: three times the context-budget test went red after a merge; compress text, never remove info.
- Chaining `sleep` in Bash is blocked; use background sleeps or Monitor.
- zsh does not word-split `$var` lists — use `xargs -0` or arrays.
- The pattern-based secret scan missed fixtures GitHub flagged; use GitHub's scanner (public) or gitleaks.

---

## 6. Next steps (in order; owner's standing consent covers deletions, GitHub branches, Cloudflare/Supabase/Sentry, legacy removal)

1. **CI green on integration**: relaunch the agent with `docs/handoff/2026-10-02/agent-prompts/01-ci-green.md` (worktree
   `/Users/moshe/Developer/RbxAI-integration`). Done = every `ci.yml` job passes locally.
2. **Merge the three capability tracks** (prompt `02-merge-capability-tracks.md`) — self-check, dup-names, behaviour; fix the
   PNG cap; add web labels; keep the budget test green by compressing text.
3. **Website round 2**: continue from `design/round-2` (`f0ab5be6`, WIP). Re-read the audit in
   `workflow-results/stopped-wf_45acd734-01e-journal.jsonl`; finish tracks C (motion + gimmick + landing fill), A (every site
   page), B (every app page, entry chunk < 150 KB), then verify (screenshots 1440/768/390 both themes, Playwright perf proxy;
   Lighthouse is not installed). Script: `workflow-scripts/website-round-2-*.js`. Merge into integration. Claude Design needs
   the owner to run `/design-login` in a real terminal.
4. **Repo organisation**: re-run `scripts/reorg-repo.mjs` (from `worktree-wf_73a32ca7-af0-6`, `--dry-run` first) on the final
   integration tree; then execute `docs/operations/REPO-CLEANUP-PENDING.md` (untracked deletions incl. abandoned
   `.claude/worktrees/*` once merged; GitHub branch cleanup) under the owner's standing consent.
5. **Apple A + B1**: bring the hand-written files from `worktree-wf_1cadd7fe-3c0-6` (guard, codemod, compat shims, runbook,
   dashboard + crystal-canyon fixes), then `node scripts/rename-golem.mjs --phase A` and `--phase B1` (dry-run first) on the
   final tree; `check-no-golem.mjs` CLEAN; the package-scope rename needs one `pnpm install` → do it in step 6's fresh clone.
6. **Dependencies** (64 Dependabot alerts, 2 critical Astro): in a FRESH CLONE (`git clone` the integration branch to a new
   folder with its own node_modules), `pnpm install`, upgrade astro/sharp/undici/devalue/fast-uri etc., run all suites, commit
   the lockfile; this also settles the `@apple/*` rename install.
7. **Push `integration/giant` and open the giant PR** against main (draft first); close #11/#12 as superseded; reduce CI
   minutes (heavy jobs on PRs only, path filters). The owner runs `/code-review ultra <PR#>` himself (billed; it refused a
   whole-repo bundle as "too large"). Fix every finding.
8. **Deploy** (after tests): worker via `node infra/deploy-worker.mjs apple` from a detached clean checkout (the old pattern:
   `/private/tmp/claude-501/deploy-wt`, `git checkout -q --detach <sha>`), static site `node infra/deploy-static.mjs`, plugin
   build `node apps/apple-plugin/scripts/build.mjs` and install locally in the owner's Studio (Creator Store publishing needs
   the owner). Check `/api/health` `buildSha` and `compat: wire-both`. Then merge B2 (`golem-rename-b2`) and run the golem
   runbook's cloud steps C (Cloudflare/Supabase/Sentry/GitHub) — gate C2 on the legacy DO evidence.
9. **Measure**: apply the GitHub ruleset only once main is green (`scripts/github/apply-rulesets.mjs`). Re-pair Studio, recreate
   `bench-baseline` on a fresh place, run the bank + `heldout-v1.json` with `run.mjs --max-credits <budget agreed with the
   owner>`; photo review with `review.mjs`; update the meter. Expect maps to cost the most.
10. **Frontier loop**: harsh critique → framework fix → generalization test (≥3 unseen per category, fresh chats) → re-run,
    until every item ≥11/12 (core six criteria). Phase 2 search to ≥90% top-3; Creator Store pipeline (M6); knowledge base
    (docs corpus `packages/corpus/data/chunks.jsonl` is missing on this Mac — rebuild); sound/VFX/RigEdit (M5/M7).

Open owner decisions: whether the `.claude/settings.json` deny-rule removal was intended; credit budget for the next bench run;
approve the "Ember Rail" direction (he has not rejected it); publishing GitHub Packages (repo is now private → packages private).

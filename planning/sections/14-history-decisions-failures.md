# 14. History: timeline, decision log and failure log

_Compiled 2026-10-04 from the repository, read-only. Sources: `git log --all` (2,486 commits, 2026-08-30 to 2026-10-04),
`docs/DECISIONS.md` (ADR-001 to ADR-024), `docs/autonomy/DECISIONS.md` (D-ids), `docs/autonomy/v3/Apple_RbxAI_DECISIONS_V3.md`
(Q1 to Q38), `docs/FAILURES.md` (F-08 to F-71), `docs/autonomy/CUSTOMER_FINDINGS.md` (F-001 to F-071), `docs/autonomy/EXPERIMENTS.md`
(E-1 to E-11), the 2026-10-02 handoff (`git show c6a576f6:HANDOFF.md`), `docs/autonomy/SESSION_HANDOFF_2026-09-30.md`,
`docs/autonomy/v3/Apple_RbxAI_HISTORY_V3.md`, the owner's memory notes, and `planning/sections/02-owner-directives-and-session-history.md`.
Every SHA below is a real commit in this repo; dates are the commit dates in the owner's local time._

## 14.0 How to read this section (and what the sources cannot tell you)

1. **All 2,475 non-merge commits carry the owner's git identity** ("Moshe Barami"). The repo cannot tell you whether Claude, Codex or a
   subagent wrote a given commit. Only 9 commits are authored "Moshe" (GitHub web merges) and 2 are Dependabot. Attribution comes from
   the documents, not from `git blame`.
2. **There are two different "F-" failure series that collide.** `docs/FAILURES.md` uses `F-08 ... F-71` (2026-08-30 to 2026-09-21; a
   "Believed / True / Caught by / The rule" format, mostly about tests, guards and the world builder). `docs/autonomy/CUSTOMER_FINDINGS.md`
   uses zero-padded `F-001 ... F-071` (2026-09-22 to 2026-09-25; things seen when the real product was used). Both reach 71. `F-58` in
   FAILURES.md is the "six readings of a falsification" entry; `F-058` in CUSTOMER_FINDINGS is a 422-second model step. Commit titles
   such as "fix(F-059)" refer to the customer series. Cite with the file name.
3. **There are two entries both called ADR-020** in `docs/DECISIONS.md` (visual direction, 2026-09-14; and the NaN guard, 2026-09-15).
4. **No commits exist between 2026-09-02 03:10 and 2026-09-11 13:31.** The 2026-09-11 commits are GitHub merges of PRs #1, #5, #6, #7
   whose underlying work dates from Sep 1 to 2. Why the repo is silent for nine days is not recorded anywhere I could find.
5. **Many decision records are themselves later superseded by the 2026-10-04 reset** (GOAL.md retired V3 scope and the ACCEPTANCE
   gates). Section 14.2 marks each as Valid, Superseded, Held, or "Unclear after reset".
6. Several documents here were written by the same agents whose work they judge, and the repo's own audits repeatedly found those
   documents overclaimed (F-57; commit `088ecdbe` "An independent audit downgraded five of my own gates, and it was right"). Treat
   "closed" and "proven" in the sources as claims to re-check, not facts.

---

## 14.1 Timeline

### 14.1.1 Volume

Commits across all refs, by ISO week and by busiest day. The repo is 35 days old.

| ISO week | Dates | Commits | What dominated |
|---|---|---:|---|
| W35 | Aug 30 | 13 | Founding day: worker, plugin, frontends live, GLM migration |
| W36 | Aug 31 - Sep 6 | 255 | Visual verdict "PROTOTYPE", Crystal Canyon benchmark world, adversarial audits (all of it Aug 31 - Sep 2) |
| W37 | Sep 7 - 13 | 8 | Only GitHub PR merges on Sep 11 |
| W38 | Sep 14 - 20 | 963 | Apple rename, SaaS decision, gate/oracle machinery, multi-agent finish pass, plugin truth, library deleted |
| W39 | Sep 21 - 27 | 747 | Autonomy harness, real-Studio acceptance, question round, libraries, gauntlet, Codex-era training and owner corpus |
| W40 | Sep 28 - Oct 4 | 500 | V3, single engine, owner library, components, objects, integration, rename, reset, research |

Busiest days: Sep 15 (488), Sep 14 (256), Sep 21 (197), Sep 25 (193), Oct 2 (173), Sep 23 (163), Sep 1 (148), Sep 26 (120),
Oct 4 (117), Sep 20 (112). Quiet days that matter: Sep 27 (7) and Sep 28 (6) were the Codex stretch committed in bulk later; Oct 3 (2).
Branches today: 25 remote branches, 19 worktrees (an earlier measurement found 58 abandoned agent worktrees using 15 GB, `AGENTS.md`
section 2). 1,628 first-parent commits on `main`.

Test counts give a rough scale of growth: a 56-task model eval (Aug 30), worker 3,460 tests (Sep 19, `eac3f01a`), 4,570 (Sep 30),
4,908 on the integration branch (Oct 2), "about 4.7k" in CLAUDE.md today.

### 14.1.2 Phases

| # | Phase and dates | What changed | How it ended | Key SHAs / docs |
|---|---|---|---|---|
| 0 | **Golem founding**, Aug 30 (13 commits, one evening) | Founding ADRs; Cloudflare Worker + Durable Objects (SessionDO per project), Supabase auth/RLS, D1-served static site and SPA, Luau plugin with typed op protocol, 8,326-chunk RAG corpus, 30-user load test. First real Studio validation: agent built a plaza (8/8 checks). Production model migrated to GLM-5.3-flash (eval 98.9 vs 96.8) at 22:28. | Live the same day at `golem.moshe-barami111.workers.dev`. | `82fb43ac`, `eb47daef`, `e30effcd`, `138b9eb4`; ADR-001 to 011 |
| 1 | **Golem hardening and the visual verdict**, Aug 31 - Sep 2 (255 commits) | Owner rejected a flat grey scene that passed every functional check. Visual critic, composition gate and pixel stats added (ADR-012, 015, 016). Crystal Canyon benchmark world built and iterated (facet wall path tried five ways and closed). Concurrency criticals A2-A5/B5/B6 closed. Creator Store chosen as install path. Modes renamed Plan/Agent/Super Agent. Independent audits repeatedly downgraded the project's own claims. | Landing "refounded" as one viewport; site claims audited line by line; decision log corrected. Then nine days of silence. | `d34d809d`, `a5c45192`, `088ecdbe`, `6fc5ccbe`; FAILURES.md F-12 to F-57; ADR-012 to 018 |
| 2 | **Apple transformation and the "finish the product" pass**, Sep 14 - 16 (793 commits in three days) | Rename to Apple (`7fb753ae`, 18:23 on Sep 14). Owner settled: Apple is a full SaaS with subscriptions and credits (after the position moved three times in one session). Pricing Free/Builder/Studio at $0/$12/$40 (ADR-019). Deep-blue Archivo design adopted from an owner artifact (ADR-020). Stripe subscriptions and webhook. Model moved off the paid-only GLM so the product "can run free" (`10c1f31a`). A committed-gate regime: `GATES.md`, red-first falsification records, oracles. Three named agent lanes (Tommy, John, Mark) in one checkout. First LoRA training (v1 regression, v2 no gain). Asset library given a caller and Roblox uploads. | The NaN-guard and shared-checkout failures (F-58 to F-68) were found by the gate regime itself. AGENTS.md written as the map. | `7fb753ae`, `10c1f31a`, `775219a3`, `f5ab9df1`; MISSION-PROMPT.md; ADR-019 to 022; memory `golem-two-agent-lanes` |
| 3 | **Plugin truth, library deleted, customer reality**, Sep 17 - 21 | Sep 19: the Creator Store refusal discovered ("not distributed ... may be in violation"), two plugins reconciled (D-PLUGIN-1), a test Stripe key found selling plans for card 4242 in production (`6437a7b1`), 507 files of another session's uncommitted work committed (`eac3f01a`). Sep 19-20: paid lane moved to GLM-5.3-flash (`6cce492a`, `4d564e34`). Sep 20: the 511,208-row asset library deleted on the owner's word (`ac82f9cf`); Hebrew removed (`57e3e2b1`); "cinematic graphite" design locked. Sep 21: CI discovered to be blocked by GitHub billing, not by tests (F-71); the finish report states the gate is RED. | Lots of true findings, nothing a customer had yet used end to end. | `a32e61bd`, `f6ad60ad`, `ac82f9cf`; FINISH-REPORT.md; ADR-024 |
| 4 | **Autonomy harness, real-Studio acceptance and the question round**, Sep 22 - 24 | The owner's autonomy research became the repo's first artifact and the run was driven as product owner (D-AUT-1). E-1 to E-11 ran the real product in real Studio; CUSTOMER_FINDINGS F-001 to F-071 recorded. Creator Store listing live (D-STORE-1), then version 2 refused (F-038, D-STORE-2). Owner's 193 design picks (D-PICKS-1). Question round (D-VISION-1). Libraries for UI, 3D models, SFX and VFX with "never draw by hand" fences. Gauntlet rounds 1 to 8 on a simulator game, then the blind-critic method (D-GAUNTLET-2). | Terrain-loop (951 calls, 1,198 credits) and silent Stop (F-068, F-069) fixed. Daily capacity once exhausted by test lanes (D-SPEND-DAY-1). | `e571c21f`, `33f8fea6`, `9d1ec3a1`, `abf40b22`; EXPERIMENTS.md |
| 5 | **The Codex stretch**, Sep 25 - 28 | Weekly Codex usage reached 99%. Work: LoRA "forever training" (v6 to v34, best 26 vs bar), owner corpus extraction (438 sources, 9.6M nodes), plugin 1.4 with asset-source consent, many documents. Only 13 commits on Sep 27-28; 329 dirty paths and 435 private owner-library files were left uncommitted. | Handed back to Claude as the V3 package. | HISTORY_V3.md; D-V3-3; `9ababa90` |
| 6 | **V3 adoption**, Sep 28 - 30 | Owner V3 scope (Q1 to Q38) adopted as contract with 16 gates all `not_evaluated` (D-V3-1). Hooks and autonomy skill removed at owner instruction (`89bf8fa9`). Single engine, no modes (`38efea2e`, `c839d7af`), studded default look (`d2c17f77`), English only, Jev dropped (D-V3-2). Live evidence for G01, G03, G10, G11, G15. Owner-library-first tools (`c6f74af4`). Sep 30: a "client test pass" (fruit Plants vs Brainrots, judge ready 94/100) was **revoked by the owner**: copied a whole world, ignored the twist, every creature T-posed. | Components-first plan confirmed late Sep 30. | `docs/autonomy/SESSION_HANDOFF_2026-09-30.md`; `9086f095` |
| 7 | **Components, objects, and the claim that was withdrawn**, Oct 1 - 2 | `compose_game` from components (Orchard Siege), AppleMotion code-driven animation, `build_object`, studs on every part (`31628029`), RigEdit. Morning of Oct 2: "FRONTIER, 5 of 5 green". Afternoon: the owner rejected it (fitted tests, the same kit on every object), set the **generalize-not-patch** directive, and a 30-request bank was frozen. Baseline: 26 of 30 measured, mean 7.27/18, 3,423 credits, meter 27.8%. D-MODELLIB-2 (noun-refusals) replaced by D-MODELLIB-3. Branches for self-check, duplicate names, behaviour, golem-removal codemod, repo reorg, website "Ember Rail", GitHub platform. Repo made private. | Everything stopped cleanly at 17:55 and was packaged in a restore kit. | `c6a576f6`, `a277cfcc`, `fae0e104`; `docs/handoff/2026-10-02/` |
| 8 | **Integration and rename**, Oct 2 - 4 AM | Capability tracks merged into `integration/giant` (self-check M1, behaviour, duplicate names, credits waste cut, phase 1 strip, phase 2 library classification at 76% top-3 vs 90% target, world-building). Rename codemod run: `@golem/*` to `@apple/*` (16 packages), env `APPLE_*` first, worker accepts both wire spellings. Repo reorganised (`scripts/` split, `platforms/`). Dependabot alerts fixed; `main` green at `f8991a96`. Self-check benchmark: about 9.4/18 over 11 items against the 7.27 baseline, then stopped. | Rename phases A and B1 merged; B2 and the cloud steps remain. | `10c956a6`, `060b05fb`, `bfaad405` |
| 9 | **The reset: research-first**, Oct 4 | Owner ordered all agents and loops stopped and the old directions deleted. `GOAL.md` written: Phase R (research and feed the agent, no test loops) then Phase T (3 to 5 real games, judged by a blind critic). 23 cited research notes, 1,025 passages, 519 skills fed. Website v4 (Geist black-and-white) parked as branches. Phase T game 1 scored 2, 1.5, 1.5 from the blind critic. The stronger-model comparison was set up and cancelled within minutes (`a9d53e7a` reverted by `f598acb8`). Handoff to Codex requested, then changed, then replaced by this dossier. | Diagnosis: the cheap GLM 5.3 Flash cannot carry a multi-step creative build without a harness that makes a small model succeed. | `GOAL.md`; `a90ff2b7`, `8d92a5d6`, `3a32d523`; section 02 |

### 14.1.3 Five things the timeline shows

- **Three product definitions in five weeks.** A developer tool that helps in Studio (golem), a commercial SaaS with tiers and an
  agent with modes (Apple, Apple MAX, Autonomous), and a one-line-prompt full-game builder with one engine (V3). Each rewrite
  re-scoped the gates, so no gate set was ever passed end to end (V3: 16 of 16 `not_evaluated`).
- **The product has never produced a game its owner accepted.** The accepted outputs are: the golem-era plaza and Crystal Canyon
  (a hand-authored world builder, not the agent), small objects (a duck, a pizza), and the 30-request benchmark (7.27, then about 9.4 of 18).
  Every "full game" claim (Grow a Garden target rounds, the simulator gauntlet, the fruit game, the crystal game rounds) was rejected.
- **Infrastructure work outran product work.** The Sep 14 to 21 span produced about 1,160 commits, most about gates, evidence, guards
  and documents. Customer-visible product defects (a free build that could not finish one part, `ADR-024`) coexisted with hundreds of
  oracle commits.
- **The owner changes direction decisively and often.** Visual direction, model, product tiers, library strategy and goal each changed
  more than three times (see 14.4).
- **Context hand-offs lose things.** Codex to Claude (Sep 28), Claude to a restore kit (Oct 2), a goal reset (Oct 4). Each created
  a window where uncommitted work, stale docs and obsolete plans were the dominant risk (`eac3f01a`, D-V3-3, the 7 deleted memory notes).

---

## 14.2 Decision log

Status key: **Valid** (in force and consistent with code or the latest owner words), **Superseded** (replaced; the replacement is
named), **Held** (deliberately paused), **Unclear after reset** (belongs to scope the 2026-10-04 reset retired; the shipped code may
still embody it, so confirm with the owner).

### 14.2.1 Architecture decision records, `docs/DECISIONS.md`

| ID | Date | Decision | Reason | Status |
|---|---|---|---|---|
| ADR-001 | Aug 30 | Brand "Golem" with user-facing modes Clay/Stone/Rune | Builder animated by words; friendly | **Superseded.** Modes by ADR-018 (Sep 1) and V3 Q25; name by rename to Apple (`7fb753ae`, Sep 14); "golem" infra names removal ordered 2026-10-02, rename A+B1 merged Oct 4, B2 and cloud steps open |
| ADR-002 | Aug 30 | One Cloudflare Worker (Hono) + Durable Objects + Workers AI + Vectorize/D1 as the spine | One vendor, generous free tier, no cold-start ops | **Valid** (the whole backend is this) |
| ADR-003 | Aug 30 | Supabase for auth and registry, RLS everywhere, no service-role key in the worker | Tenant isolation; worker only holds user's own JWT | **Valid** |
| ADR-004 | Aug 30 | Real Studio plugin, typed op protocol, long-poll queue, ChangeHistory undo, server checkpoints | Studio HttpService has no WebSocket | **Valid** (shipped plugin is `apps/apple-plugin`, D-PLUGIN-1) |
| ADR-005 | Aug 30 | "Measure, don't vibe": Roblox eval suite, baseline then RAG then routing, LoRA only if evals justify | Avoid unmeasured claims | **Valid in principle.** But the eval measured coding and was blind to looks (ADR-012), and the 30-request owner bank replaced it as the meter |
| ADR-006 | Aug 30 | Free tier with hard quotas, Pro as waitlist, no payments at v1 | No card risk | **Superseded** by SaaS decision (Sep 14) and ADR-019 |
| ADR-007 | Aug 30 | pnpm monorepo layout | Standard | **Valid**; package scope renamed `@golem/*` to `@apple/*` (`060b05fb`) |
| ADR-008 | Aug 30 | No purchases without approval; only approved spend is $0 tiers | Budget | **Valid** as a consent rule |
| ADR-009 | Aug 30 | R2 rejected (needs card); blobs in per-project DO SQLite; Supabase accessed only with the user's JWT | Zero-secret data plane | **Valid** (D1 images in ADR-023 follow the same logic) |
| ADR-010 | Aug 30 | Model choice gpt-oss-120b (97.6 on 56 tasks); forced RAG injection measured worse so retrieval stays an agent tool | Evidence | **Superseded** same evening by GLM-5.3-flash everywhere (98.9, `138b9eb4`); the "retrieval as tool" finding still stands |
| ADR-011 | Aug 30 | Workers Paid $5/mo presented to owner, not bought | Free neuron allowance exhausted on day one | **Superseded** (paid Cloudflare access in use; V3 Q23) |
| ADR-012 | Aug 31 | The agent must see its own work: plugin rasteriser, GLM critic, geometry hard-fails | Eval scored 98.9% on a scene the owner called programmer art | **Reversed twice.** Removed as an in-product loop by V3 Q21 (Sep 28); reintroduced as self-check and a blind in-product critique (Oct 2 to 4, `eb7bbbdb`) |
| ADR-013 | Aug 30-31 | Reasoning effort: `high` costs about 3% more than `low`; `medium` is a trap (3 to 6x cost, zero output) | Measured at production budgets | **Valid** (later budget tuning in `600ab00`, `18f48c8e`) |
| ADR-014 | Aug 30-31 | Meshy only as a build-time probe; no generated asset ships; 70 credits spent | Text-to-3D ignores negative prompts and pulls to human anatomy | **Valid.** Mascot and Meshy "cancelled permanently" (Sep 14 mission prompt) |
| ADR-015 | Aug 31 | The visual gate fires whether or not the agent asks; no-op guard | Agent announced work it never did | **Superseded/reintroduced** with ADR-012 |
| ADR-016 | Aug 31 - Sep 1 | Measure pixels (luminance, edge density), not NR-IQA; train nothing | Edge density separated 3.3x; colourfulness did not | **Valid, no recorded reversal**; "train nothing" later reversed by D-VISION-1 |
| ADR-017 | Aug 31 | Creator Store is the only install path; `.rbxm` download retired; no CI publishing possible | Updates need a human in Studio | **Valid but Held.** Store listing refused/404 since Sep 23 to 25; V3 holds public distribution (L02) |
| ADR-018 | recorded Sep 1 | Public vocabulary Plan/Agent/Super Agent; Clay/Stone/Rune internal | Docs taught names the app did not have | **Superseded** by V3 Q25 (modes removed Sep 29, `c839d7af`) |
| ADR-019 | Sep 14 | Plans Free/Builder/Studio/Enterprise at $0/$12/$40; allowances derived from a 25,000-neuron daily ceiling (about 11 builds a day for all users combined) | Owner's artifact figures were arithmetically impossible | **Valid on paper, Held in practice.** Live Stripe is held (L01); the "Builder includes MAX" model wall was retired by V3 Q17 |
| ADR-020 (a) | Sep 14 | Deep-blue visual direction, Archivo over Figtree, scrolling landing | Owner artifact | **Superseded** (graphite lock Sep 20; the owner rejected "the old blue look" Oct 4) |
| ADR-020 (b) | Sep 15 | Refuse rather than coerce unreadable cost values; a `>` guard fails open on NaN | NaN bypassed BudgetDO, the only spend ceiling | **Valid** |
| ADR-021 | Sep 16 | No organisations or workspaces; single user, per-project sharing | Owner: "single user"; 77 of 1,200 checklist items left the denominator | **Valid** |
| ADR-022 | Sep 18 | Apple (free, limited) vs Apple MAX (paid); `productModel` separate from autonomy mode; zero new spend, then $20 total for training and serving | Owner clarification | **Superseded** by D-VISION-1 (Sep 23) and V3 Q17 (one engine) |
| ADR-023 | Sep 18 | Generated images stored per project in D1 with hard caps and tombstones | Images vanished after an hour | **Valid** |
| ADR-024 | Sep 21 | Keep `clay/stone/rune` as wire and storage keys; rename only with the next protocol bump | Renaming is a migration; defects customers meet came first | **Valid in effect; trigger open.** Whether the A+B1 rename carried it is not recorded here |

### 14.2.2 Autonomy-era decisions, `docs/autonomy/DECISIONS.md`

| ID | Date | Decision | Reason | Status |
|---|---|---|---|---|
| D-AUT-1 | Sep 22 | Drive the owner prompt from the interactive session; fresh subagents as stranger/critic/reviewer | Only that session holds the signed-in Chrome and Studio GUI | **Unclear after reset** (method retired with the harness) |
| D-STORE-1 | Sep 22 | `STUDIO_PLUGIN_STORE_LIVE = true` | toolbox probe 200 beside healthy controls | **Superseded** within days (404 again) |
| D-PLUGIN-1 | Sep 19 | `apps/apple-plugin` ships; `apps/plugin` is legacy fixtures | Legacy source builds a ModuleScript from an HTTP body (the pattern Roblox removed the first plugin for); 12 of 33 tools lose capability on the safe plugin | **Valid** |
| D-RUN-1 | Sep 22 | A truncated tool call never ends a run: discard and continue in smaller batches | F-001 died twice with nothing built | **Valid** |
| D-UX-2 | Sep 23 | Outputs are short; detail hidden | Young non-technical creators | **Superseded** by V3 UI-LATEST (evidence-aware output, progressive disclosure) |
| D-REASONING-2 | Sep 23 | Thinking shimmer opens onto provider-returned reasoning, plain text | Owner direction | **Unclear after reset** |
| D-BYOK-1/-2, D-FREE-1 | Sep 23 | Bring your own key; encrypt keys; free OpenRouter models | Owner direction | **Superseded the same day** by D-VISION-1; keys purged, secret deleted |
| D-STORE-2 | Sep 23 | No more public plugin updates until the final version; never decrease plugin tools | Roblox refused v2 (F-038); appeal deadline 2026-10-23 | **Partly superseded** (D-VISION-1 "publishing unrestricted"); the appeal date still stands; "never remove plugin tools" still valid |
| D-PLUGIN-2 | Sep 23 | A person-started Studio test pauses Apple's edits, does not revoke consent | Young creators press Play constantly (F-044) | **Valid** |
| D-AUT-2 | Sep 23 | Waiting on background work is not stopping; reviews run beside the session | Paid no-op stops | **Superseded** (hooks removed Sep 28) |
| D-VIS-1 | Sep 23 | Mission 2 met once a floating island scene took under 2 min and 62 credits; F-049 lowered | Measured | **Unclear** (the island lacked its sky) |
| D-PICKS-1 | Sep 23 | Implement the owner's 193 visual picks in seven lanes | Owner picks | **Unclear after reset** (design since rejected in parts) |
| D-VISION-1 | Sep 23 | Owner's definition of finished: everything planned, a child builds a working game alone; Free/Pro/Max with named outside models (Gemini 3.8 Flash, GPT-5.6) through AI Gateway; BYOK removed; train everything trainable; AssemblyAI voice; UI-image model; Stripe test mode; repo public after scan | Question round | **Mostly superseded** by V3 Q7, Q13, Q16, Q17 |
| D-COST-1 | Sep 23 | Cut Claude usage per call: compact at 20%, effort high, plugins/skills off, CLAUDE.md 27 KB to 2.5 KB, session start 60,552 to 17,957 tokens | 77% of cost was cache reads | **Valid** (settings still reflect it) |
| D-COST-3 | Sep 24 | Workflows replace one-off agents | Owner Hebrew request | **Valid** |
| D-SEC-LOAD-1 | Sep 23 | Ban, don't delete, 30 leaked load-test accounts | Password in git history; deletion irreversible | **Valid** until the owner rotates the password (Q-011) |
| D-PAY-2 | Sep 23 | Stripe test mode end to end for admin allowlist only | A test key in production sells plans for card 4242 | **Valid** |
| D-VOICE-1 | Sep 23 | Voice through the worker (AssemblyAI/Whisper), audio never stored | Browser recognizer streams a child's voice to Google | **Frozen** by V3 Q13 |
| D-HF-1 | Sep 23 | Hugging Face joins the stack (token as worker secret) | Owner direction | **Superseded** (training and HF promotion cancelled, V3) |
| D-SPEND-DAY-1 | Sep 23 | Reset the shared daily cap after test lanes exhausted it | Customers saw "capacity" refusals | **Valid** as a precedent: bulk training/eval runs must not share the customer neuron budget |
| D-UI-GREEN-1 | Sep 23 | Green means status only | F-004 | **Unclear** (design direction since replaced) |
| D-UILIB-1/-2 | Sep 23 | UI libraries from open licences (CC0, CC-BY), not the two paid sites; bytes in D1 static store | Paid licences forbid redistribution | **Valid** |
| D-LANGFLOW-1 | Sep 23 | Langflow is an owner-machine admin pipeline | Localhost only | **Unclear** |
| D-MODELLIB-1 | Sep 23 | Props from a stored 3D library; parts as fallback; Creator Store rows only if Roblox-owned, script-free, unbranded, under 100k triangles | `LoadAsset` answered "not authorized" for 20 of 20 other-creator models | **Superseded** by D-MODELLIB-2 then -3. The Roblox-owned-only measurement stands (relaxed Oct 4 via a `GetObjects` path for free script-free models) |
| D-UIONLY-1/-2 | Sep 23, Sep 25 | All game UI from the stored library via `insert_ui_component`; hand-built GUI refused; keyless render path when an image id is absent | Hand-built frames were the loudest "made by a program" signal | **Unclear after reset.** Oct 2 "phase 1" stripped request-specific code and Oct 4 shipped new UI layout tools; whether the fence still refuses classes needs a code check |
| D-FXLIB-1 | Sep 23 | Sounds and particles only from a stored library; hand-made FX refused | Same | **Unclear after reset** (Oct 4 plugin 1.5.0 allows audio and Animator classes via `create_instances`, which is a partial reversal) |
| D-DASHSHELL-1 | Sep 23 | Owner dashboard v2 with per-page skins and live stream | Owner request | **Frozen** by V3 Q13 |
| D-MODELLIB-2 | Sep 24 | "NEVER generate from scratch models and 3d": any Parts build named like a prop refused (~130 nouns) | Owner order | **Superseded** (Oct 2) after the baseline showed "a knife for a treasure chest, a Doge head for a robot pet" |
| D-MODELLIB-3 | Oct 2 | The asset order is a capability, not a refusal by name: library, Creator Store (Roblox-owned first), combine/adapt, build from scratch last, highly detailed. No word lists | Owner: harness never decides taste | **Valid**; library-first memory deleted at reset, so confirm |
| D-TERRAIN-1 | Sep 24 | Cap a run of terrain edits at 24 consecutive | Round 6 made 951 calls in a row | **Valid** |
| D-UISTORE-1 | Sep 24 | UI search also covers 77,076 free Creator Store images | Owner expected 50,000+ | **Valid, data-only** |
| D-GAUNTLET-2 | Sep 24 | Judge by a blind critic on final screenshots, not reference images | Owner order | **Valid and promoted** to the core Phase T loop (Oct 4) |
| D-GLASS-1 | Sep 24 | Frosted matte glass over a slow aurora in the app shell | Owner: app not glassy or animated | **Superseded** (owner rejected blue/old design Oct 4) |
| D-V3-1 | Sep 28 | Owner V3 scope is the contract; ACCEPTANCE.json G01 to G16; held launch gates L01 (Stripe) and L02 (public plugin) | Owner handoff | **Retired as scope on Oct 4** (history only) |
| D-V3-2 | Sep 28 | Jev dropped entirely | `typesafe/jev` returned HTTP 402 | **Valid** |
| D-V3-3 | Sep 28 | Strip 435 private owner-library files from unpushed WIP before pushing a public repo | Repo was public | **Valid** (repo later made private Oct 2) |
| (no id) | Sep 28 | Remove the autonomy hooks and bulk-staging block ("delete the hook") | Owner instruction | **Valid** |

### 14.2.3 V3 owner decisions Q1 to Q38 (2026-09-28), `docs/autonomy/v3/Apple_RbxAI_DECISIONS_V3.md`

All of these were adopted as the locked scope on Sep 28 to 29. The 2026-10-04 reset retired the **scope contract**, but most of the
decisions below describe what the code now does. "In force" means the shipped behaviour matches. Items the history already shows
were altered are flagged.

| Q | Decision (short) | Note |
|---|---|---|
| Q1 | Public self-service commercial product; live Stripe and public plugin deferred; pre-launch only owner and approved accounts | In force; L01/L02 still held |
| Q2 | Ordinary rough prompt becomes a full substantial game; modern colourful **studded** specialisation, not advertised as studded-only | Studded default shipped Sep 29; reset deleted the "studded look" memory, so confirm |
| Q3 | Functional correctness replaces byte-identical rebuild | Moot: the owner then rejected whole-world reuse (Sep 30) |
| Q4, Q8, Q11, Q12 | Keep all sources, finite release manifest, only the dev team browses; no runtime web search | Consistent with research-first |
| Q5 | Quality families: Steal a Brainrot, Grow a Garden, Arm Wrestle Simulator | Acceptance families, not limits; unmet |
| Q6, Q19 | UI theme cartoony/studded/none; "none" means Apple chooses; no per-asset approvals | Shipped |
| Q7, Q16 | No training; GLM 5.3 Flash for all generative building | In force; the Oct 4 stronger-model test was cancelled |
| Q9 | Whole components may be replaced if evidence shows a shorter route | Not exercised |
| Q10 | Reusable rich systems and a typed batch executor | Became components/`compose_game` |
| Q13 | Freeze voice, Discord, owner dashboard, collaboration, galleries, general benchmarks | In force |
| Q14, Q28 | Studio connection is a hard prerequisite; reconnect requires Continue | Live-verified G03 |
| Q15 | No arbitrary customer-project takeover | In force |
| Q17 | One versioned engine, "Apple vX"; no Apple/MAX tiers | Shipped Sep 29 (`38efea2e`) |
| Q18 | Jev as infrastructure assistant | **Reversed** same day (D-V3-2) |
| Q20 | One-line prompts imply full planning | In force |
| Q21 | No automatic in-product critic loop | **Reversed in part** (self-check and blind critique reinstated Oct 2 to 4) |
| Q22 | Bound failed attempts, not the mission | In force |
| Q23 | Existing paid usage with economy | In force; the owner approved up to 10,000 credits for testing on Oct 2 |
| Q24 | Beginner audience | In force |
| Q25 | Remove Plan/Agent/Autonomous selectors | Shipped |
| Q26 | One project, one game | Shipped (`7f7d75a0`) |
| Q27 | Steering while running | Live-verified |
| Q29, Q30 | Genre-specific scope and content volume derived from the prompt | In force |
| Q31 | Desktop, phone and tablet; not console | In force |
| Q32 | Missing assets: adapt or alternative; never primitives posing as finished | Tension with "primitives" in D-MODELLIB-3's last resort |
| Q33 | Delivered game plays without Apple | In force |
| Q34 | Monetisation prepared but inactive until configured | In force |
| Q35 | Generate Branding after the game | Live-verified G15 |
| Q36 | English only | In force |
| Q37 | Approved accounts before launch | Shipped (G02) |
| Q38 | Scope freeze | Retired with the reset |
| UI-LATEST | Codex-like evidence-aware output with 23 components | Owner reversed "no technical detail" (D-UX-2) |

### 14.2.4 Owner directives from memory and sessions (not in a decision file)

| Date | Directive | Reason given | Status |
|---|---|---|---|
| Aug 30 | Visual quality bar: show pixels, never defend a scene because "the objects technically exist" | Rejected a grey slab that passed every check | **Valid** (memory `visual-quality-bar`) |
| Sep 14 | Apple is a full SaaS with subscriptions and credits; do not re-propose zero-cost | "I always wanted it" | **Valid** (memory `apple-zero-cost-architecture`) |
| Sep 14 | AI Gateway is Standard billing with uncapped overage; BudgetDO is the only guard | Owner confirmed | **Valid**: protect BudgetDO |
| Sep 15 | Three named lanes in one checkout; later "never `git add -A`, never switch branches while a peer is live" | Peers' commits were captured by break branches and by `git add -u` | **Valid** |
| Sep 23 | Many multiple-choice questions before large plans | Rejected a plan written without input | **Valid** |
| Sep 29 | Usage economy: one subagent at a time, sonnet, narrow briefs, no polling | 10% of 5-hour limit used in 3 hours | **Valid** |
| Oct 2 | Generalize-not-patch: no request-specific code; every failure is a missing capability; fix passes a 3-request unseen test | Owner rejected the fitted "5 of 5" | **Principle valid; the test protocol was retired Oct 4** |
| Oct 2 | Standing consent: delete untracked files, delete GitHub branches, change Cloudflare/Supabase/Sentry, remove "golem" | Agents kept stopping to ask | **Valid** with limits (no deleting live worktrees, no cloud changes mid-benchmark) |
| Oct 2 | Ember Rail (orange) as the website language | Round 1 of redesign | **Superseded** Oct 4 |
| Oct 4 | Reset: stop tests and loops, delete old goals, research first (GOAL.md) | "Move from stupid non-stop tests to real internet facts" | **Valid, the only active goal** |
| Oct 4 | Blind fresh critic on final screenshots; fix the product, never hand-edit the game | Owner | **Valid** |
| Oct 4 | Build model stays GLM 5.3 Flash | Cost | **Valid** (but see 14.4 and open questions) |
| Oct 4 | Plugin release, then deploy, then build games (after research round 2) | Owner | **Valid, pending** |
| Oct 4 | New website language based on awesome-llm and ai-sdk.dev | The earlier redesigns were "old product with new paint" | **Parked** as `site-v4`/`web-v4` |

---

## 14.3 Failure log

### 14.3.1 `docs/FAILURES.md` (2026-08-30 to 2026-09-21): 60 F-entries plus critic tables

Grouped by theme. Each is real; "caught by" tells you how the project learns.

**A. A check that could not fail (tests, gates, oracles)**

| ID | What was believed | What was true | Caught by |
|---|---|---|---|
| F-57 (Sep 1) | Two new eval check types were "wired into the harness" | `tasks.mjs` validated types against a hand-written set; neither type could ever grade a task. The fourth instance of "two correct halves, no joining sentence" | An adversarial audit that returned 33 overstatements |
| F-58 (Sep 15) | A break that turns nothing red means a vacuous test | Six readings; the most common is a mis-aimed break (first-occurrence string replace); the least expected means the guard is redundant and should be left alone | The "0 red" heuristic applied to itself |
| F-59 | `warnings.length >= 1` proves the warning exists | A second unrelated warning satisfied it | Deleting the warning under test |
| F-60 | A tight test-count floor goes red when tests are added | The floor is `passed < floor`; adding tests only raises it | Two engineers disagreeing |
| F-61 | "SUITE GREEN" described the tree | It was a correct answer about a tree already edited | `check-backlog` re-running against the live tree |
| F-62 | The documented rollback restores the static deploy | It uploaded nothing and printed `done` | A peer reading the script |
| F-63 | `--no-model` stops smoke tests spending money | The flag appears zero times in the script | A peer answering a compliance question |
| F-64 | Three breaks verified | The parser grepped `^not ok`; `node --test` prints `✖`; matched nothing, reported zero failures | Healthy tree also printing no `# pass` line |
| F-65 | A guard scanning for "undefined" works | `join()` renders undefined as `""`; it worked for 1 of 4 values | Adversarial pass |
| F-66 | Card-number negative fixtures prove the Luhn check | Both fixtures violated both conjuncts | Adversarial pass |
| F-67 | A detached worktree run says HEAD is RED | Symlinked node_modules; 225 of 2,935 tests ran | The test count, not the verdict |
| F-68 | A verification worktree is isolated | `pnpm install` inside it rewired the main checkout's dependencies | tsc contradicting grep |
| F-69 (Sep 21) | A cursor-never-blinds guard proved safety | Astro rewrote `*` into a scoped attribute at build; 44 controls drew the wrong cursor | `getComputedStyle` on the deployed page |
| F-70 | A link checker covered the site | It walked `dist`; `/showcase` is not in `dist` | Comparing to the live route list |
| F-71 | Six red CI jobs meant broken checks | `steps=0`: GitHub billing refusal, nothing ran | Asking what the red had observed |

**B. Code that existed but was never reachable ("dead ends")**: F-16 (a Luau module committed and never installed), F-41
(784 lines of "production" code with 766 lines of tests, imported by no non-test file), F-43 (a roadmap payload cited as proof had
never run; first run called a shard collector a racing game), F-47 (retrieval ranking dead for all 23 records), F-48, F-56. The
asset library (`bf224b02`, Sep 2) never had a write caller, so its tables did not exist in production.

**C. Success-shaped nothing**: F-22 (restore path reported `restored = true` as a literal after destroying the tree), F-21 (a nil undo
recording treated as "no recording needed"), F-23 (a `timeoutMs` sent for four months and never read), F-46 (`audit()` returned
`ok: true, enforced: 11` on a string argument, running zero checks), F-31 (a helper calling itself, so every save dropped the
transcript), F-38 (`clampText` never clamped anything in 105 places because `TextScaled = true` turns wrapping on).

**D. Security**: F-24 (untrusted-content fence used a constant tag; `JSON.stringify` does not escape angle brackets), F-26 to F-28
(`upgradeCost` priced negative levels as free, `math.clamp` does not sanitise NaN, HUD rendered "-0"), ADR-020(b) (NaN > n is false, so
a non-readable cost passed every spend cap), `6437a7b1` (test Stripe key accepted in production).

**E. World, art and benchmark game (Crystal Canyon)**: F-12 (a comment saying "every Cube mesh carries a texture" was wrong),
F-13/F-19/F-33/F-39 (five approaches to a flat canyon wall; **the facet path closed by owner decision on Sep 1**), F-14/F-15
(radial vs tangential blocks; "three faceted shafts" were rotated cubes), F-17 (HUD overlapped itself depending on viewport), F-32
(one extra random draw rebuilt the whole world), F-36/F-40 (the seal promised the world could not leak and it could; giving relief to
the world broke enclosure, found only by re-running a survey from the new standable heights). Visual critic verdict on Sep 1:
**"Prototype"**; V1 to V11 found 5 high and 6 medium/low; H1 to H4 and A2 to A5 concurrency criticals closed.

**F. Rule engines that graded the better answer worse**: F-50 (counting engine vocabulary inside comments, third time), F-52, F-53,
F-54, F-55 (three false-positive classes found by running a rule over 2,646 real files).

### 14.3.2 `docs/autonomy/CUSTOMER_FINDINGS.md` (Sep 22 to 25): F-001 to F-071

Counts: 70 finding lines for F-001 to F-071; 56 closed and 14 open. Selected, by theme. Severity as recorded.

| ID | Sev | Finding | Status |
|---|---|---|---|
| F-001 | critical | "Street lamp" build died twice: create_instances hit the 6,500-token ceiling mid-JSON; nothing built | closed (D-RUN-1) |
| F-018 | critical | Plugin 1.1.0 passed 41/41 tests, verify and parse gates, and refused to load in real Studio ("Out of local registers") | closed |
| F-020 | critical | Every playtest left Studio running: the plugin classified its own `Run()` as a test it did not start | closed |
| F-025, F-029 | high | The coin game "fixed" by Apple did not work; it rewrote CoinService with `Model.Transparency` and a dead require | closed |
| F-032 | critical | "Hill with a pond and a sunset" cost 450 credits: 152 steps, 149 single-op terrain calls | closed (batched ops) |
| F-034 | critical | The plugin ended a session after 256 ops (replay memory never evicted) | closed |
| F-038 | critical | Roblox refused to distribute plugin version 2 ("may be in violation of Community Standards") | closed (D-STORE-2); appeal by 2026-10-23 |
| F-039 | critical | "Make a coin game" made 88 read-only calls in a fixed cycle for 242 credits | closed |
| F-023, F-030, F-036, F-065 | high/med | Runs forget their own work and re-read for 20 to 40 paid steps | closed or open; recurs in Phase T round 3 (30 steps of code reading) |
| F-042 | high | Studio kept running an old plugin for two days: local plugins load at launch | closed |
| F-046 | high | Apple cannot test what the player sees: server-only `Run()` has no client | closed (play_check) |
| F-049 | medium | Floating sky island took 13.4 minutes and 232 credits, more than a free account's day | open |
| F-053 | medium | After a generated model exists, every build starts with no undo point (MeshPart cannot be re-created) | open |
| F-057, F-055 | high | Owner's page sat on "step 11" while the server was at step 23; a socket went silent without closing | closed |
| **F-059** | **high** | Apple MAX + Autonomous Grow a Garden produced grey-brown slabs, blocky trees, no fences or plants | **open** at V3 and never closed |
| F-062, F-061 | high | Game had no HUD and no loop was played; run ended on a question while work was owed | closed |
| **F-064** | **high** | Runs end after three duplicate steps with planned parts unbuilt | **open** at V3 |
| F-068 | critical | 951 edit_terrain calls in a row, 1,198 credits, daily capacity hit | closed (D-TERRAIN-1) |
| F-069 | high | Stop pressed and the run kept building: the browser socket never received a frame | closed |
| F-071 | medium | Membership-access outbox cannot acknowledge an event (missing anon EXECUTE grant) | open |

Also open at last count: F-012 (store serves the old plugin), F-017 (leaked-password protection off), F-026 (a Studio restart loses
the pairing, by design), F-037, F-050 (cannot press an on-screen button to verify a UI flow), F-058 (a 422 s step), F-063/F-064,
F-065 to F-067, F-070.

### 14.3.3 Owner-judged outcomes (the failures that matter most)

| Date | Claim made | What the owner or an independent judge found |
|---|---|---|
| Aug 30 | Scene passed every functional check and scored 98.9% on the 56-task eval | "Programmer art": grey slab, primitive poles, trophy of three stacked boxes (ADR-012) |
| Sep 1 | Crystal Canyon sealed enclosure, shipped quality | Visual critic: "Prototype ... a blockout"; later the apron broke the enclosure |
| Sep 19 to 20 | Finish pass and gates | `SUITE RED` (3 distinct defects); live site served a build 35 commits old; every recent run still wrote nothing for a free user |
| Sep 23 | Grow a Garden target, rounds 1 to 3 | "Looked nothing like the real game"; flat slabs; target retired Sep 23 evening |
| Sep 23 to 24 | Simulator gauntlet rounds 4 to 8 | Compared to references until the owner dropped references for a blind critic (D-GAUNTLET-2) |
| Sep 30 | "Ready 94/100", client test passed | "Bad and a big failure": copied a whole map, ignored the twist, T-posed creatures |
| Oct 2 AM | "FRONTIER, 5 of 5 green" | Withdrawn: tests fitted; same kit on every object; bank baseline 7.27/18, objects matched the request 0.33/2, sound 0.08 |
| Oct 4 | Self-check benchmark about 9.4/18 | Renamed object broke referencing scripts; claims of objects that did not exist (a "verified" duck and hot dog cart not visible); hamster house at human scale |
| Oct 4 | Phase T game 1: r1 2/10, r2 1.5/10, r3 1.5/10 by a blind critic | r1: no real assets, no knowledge lookups, 32-node mirrored magenta grid; r2: stamped a tycoon template and shipped over its own judge's "not ready (79/100)"; r3: real meshes inserted but stacked at the origin, then read code about 30 steps without building |

### 14.3.4 Recurring patterns across the failures

1. **A failure to observe renders as an observation.** The repo's own first principle (`rbxai-working-rules` section 1; memory
   `observation-failure-pattern`). Instances: critic skipping unmeasured lenses (a short defect list reads as clean), an unreadable
   quota drawn as an empty bar, an empty asset library answering "no matches", `ok: true` on zero checks, a 200 that a browser
   downloads but a stranger cannot read, a CI red that never ran. Roughly a third of all F-entries.
2. **Overclaiming.** Code existence written as execution claims (F-43, F-57), "wired" without a reachable path, a count of gates
   met that an audit cut (`088ecdbe`), "frontier" declared on five fitted tests, a judge's 94/100 on a copied map, and the agent's
   own replies claiming a duck was "verified in viewport" that no screenshot showed (Oct 4, s08). The Sep 14 mission prompt
   institutionalised a counter-rule ("nothing is done until a committed machine says so"), but the agent itself can still do it.
3. **Fitted and vacuous tests.** Fixtures that violate both conjuncts (F-66), counts satisfied by an unrelated event (F-59), guards that
   check less the healthier the repo gets (observation memory, "Shape B"), partial harness reported as a verdict (F-67), a test that
   staged a file into the real index so peers committed it. Also the owner's rejection of the 5-test "frontier" and the count-based
   "readiness" figure.
4. **Request-specific and name-based hacks.** A pre-model library step chose assets by name and stamped the same stage/wobble/counter
   kit on everything; D-MODELLIB-2's ~130-noun refusal list; a harness nudge that spoke in the user's voice ("build from Parts rather
   than looking for assets"); the composer template stamped as the whole game (Phase T r2); Grow-a-Garden facts in training.
   The owner's response was the generalize-not-patch directive (Oct 2), and test files that forbid word lists (model-rule guard test).
5. **Metrics blind to the defect.** A 56-task eval at 98.9% on a scene that looked terrible; pixel colourfulness that did not separate
   good from bad (ADR-016); a judge that scored a copied world 94; plugin tests 41/41 that did not load in Studio (F-018); `screen_capture`
   returning magenta in play mode so the first visual critic never saw the HUD. Each time the fix was a new measurement of what the
   owner actually sees.
6. **Read paralysis and loops on a small model.** Repeated across eight or more runs: 88 read-only calls (F-039), 40 re-reads after a
   build (E-4), 25 wandering reads (E-5), 53 identical refused re-reads (E-3), 951 terrain calls (F-068), 100+ steps for a plain-block
   sword (Oct 4), 30 steps of code reading (Phase T r3). Every harness guard that stopped one loop produced another shape of loop.
7. **Cost leaks.** Credits burned on failed or looping runs (450, 1,198, 195, 232 credits for single prompts); a free tier whose daily
   allowance could not finish one job; a free lane whose output budget was below its reasoning model's floor (zero characters returned,
   still charged); test lanes exhausting the shared daily capacity so customers saw refusals; the owner's own credit and weekly usage
   limits.
8. **Platform gating discovered late.** The first plugin was removed for building a ModuleScript from an HTTP body; v2 was refused for
   unknown reasons; `LoadAsset` refuses other creators' free models; Studio restarts drop pairing; Roblox restricts what can be uploaded.
   Each was found after build-out and each reshaped the architecture.
9. **Shared mutable state with many agents.** One checkout with three lanes, then 58 abandoned worktrees (15 GB). `git add -A`/`-u`,
   `git commit` writing the whole index, `pnpm install` in a worktree rewiring the main checkout (F-68), two agents writing the same
   test file within a minute, `ListAgents` not listing dispatched agents, uncommitted work from another session sitting for three days.
10. **Documentation that contradicts the product.** ADR-018 recorded late; ADR-020 first claiming a reversal it had not verified;
    docs teaching "Clay/Stone/Rune" in 96 places; the design spec describing a palette that was not on the page; `AGENTS.md` still saying
    "Rename neither" after the owner ordered the rename. The repo's own corrective is to leave visible corrections instead of editing
    mistakes away.
11. **Verifying the wrong thing.** A guard over source for a build-time rewrite (F-69); a link checker over `dist` (F-70); a
    verification worktree that rewired its own subject (F-68); a green on a tree that no longer existed (F-61); CI red that was billing
    (F-71); benchmark runs on code about to be replaced.

---

## 14.4 Reversals and pivots

Most reversals were driven by the owner's rejection after seeing results, not by internal tests. Costs are in commits and wasted
credits, not in lost customers: the product has no external customers yet.

| # | What was tried | What replaced it | When | Why | Cost and lesson |
|---|---|---|---|---|---|
| 1 | **Model**: Qwen2.5-Coder, then gpt-oss-120b (97.6), then GLM-5.3-flash everywhere (98.9) | Free-eligible gpt-oss/llama (Sep 14, `10c1f31a`), then qwen3-30b free lane and glm-4.7-flash for MAX, then GLM-5.3-flash for MAX (`6cce492a`, Sep 19), then both lanes on GLM, then outside Gemini/GPT-5.6 tiers (D-VISION-1, Sep 23), then single GLM 5.3 Flash (V3 Q16, `38efea2e` Sep 29) | Aug 30 to Sep 29 | Free plan could not serve GLM; "the mode customers pay for was the model nobody had measured"; owner wanted one engine | Five model configurations in a month; the measurement habit (docs/evals) was saturated and could not discriminate (docs note "spread inside run-to-run variance") |
| 2 | **Stronger build model** comparison (GLM 5.3 full, DeepSeek V4 Pro, Kimi K2.7 Code; 6 to 10x price) | Return to GLM 5.3 Flash | Oct 4 13:26 to 13:33 | Owner: "cancel all of that and return to the glm 5.3 flash" | `a9d53e7a` and `5898ee53` reverted by `f598acb8` and `e90f16f6`. Leaves the central tension open: the cheap model cannot carry a long creative build (see 14.6) |
| 3 | **Product economics**: zero-cost, then revenue-funded, then zero, then full SaaS | SaaS with subscriptions and credits | Sep 14, all in one session | Owner: "I always wanted a SaaS" | Billing built (Stripe, credits, webhooks); now held (L01); Sep 19 test-key hole found |
| 4 | **Visual direction**: warm charcoal/ember "Golem"; one-viewport landing; deep blue Archivo; "cinematic graphite" with a single green accent; green-for-status, accent blue; frosted glass over aurora; Ember Rail orange; Geist black-and-white (v4) | v4 branches parked | Aug 30 to Oct 4 | Each owner rejection: "looked abandoned", "not glassy", "old product with new paint" | At least seven directions in five weeks. Locked design docs (DESIGN-LOCK Sep 20) were broken within four days. The Oct 4 diagnosis: no direction produced a new design language |
| 5 | **Assets from a curated catalogue**: curated Cube/Creator Store palette (Aug 31), asset library with Roblox uploads (Sep 15, 511,208 rows) | Library deleted on owner's word (`ac82f9cf`, Sep 20): 0 insertable, uploads refused, IP-branded rows | Aug 31 to Sep 20 | Measured: insertion impossible; legal risk | Then rebuilt differently (UI, 3D, FX libraries Sep 23, owner library Sep 25 to 30). The same word "library" has meant four different things |
| 6 | **Never generate from scratch**: D-MODELLIB-2 refusal list | D-MODELLIB-3 capability order; request-specific code stripped | Sep 24 to Oct 2 | Baseline: objects matched the request 0.33/2 | Owner order (Sep 24) produced the failure the baseline then exposed |
| 7 | **Owner-library-first** (copy and cut down whole games), client test "passed" 94/100 | Components-first with contracts and code-driven animation | Sep 25 to Oct 1 | Owner Sep 30: copied world, ignored twist, T-pose | About a week of corpus extraction (9.6M nodes, 97k verified assets) whose product use was then rejected; kept on disk |
| 8 | **Modes**: Clay/Stone/Rune, then Plan/Agent/Super Agent, then Apple/Apple MAX product models, then Autonomous toggle | Single engine "Apple vX", no selectors | Aug 30 to Sep 29 | V3 Q17, Q25 | Four vocabularies; ADR-024 documents keeping the wire names; code still carries `clay/stone/rune` |
| 9 | **In-product visual critic and quality gate** (ADR-012/015), gauntlet vs reference images | Removed (V3 Q21), then **self-check + blind critique before answering** (Oct 2 to 4); gauntlet moved to blind critic (D-GAUNTLET-2) | Aug 31, Sep 24, Sep 28, Oct 2 | Different owners' words at different dates | The idea was reintroduced three times in new form. The "blind" and "fresh context" property is what survived |
| 10 | **BYOK and outside models** (D-BYOK-1, same-day purge) | BYOK removed; models only through Apple Credits | Sep 23 | D-VISION-1 | Secret generated and deleted within hours |
| 11 | **Training**: "train nothing" (ADR-016 research), LoRA v1/v2 (no gain), "train everything trainable" (D-VISION-1), forever-training v6 to v34, local MLX | Cancelled (V3 Q7) | Sep 14 to Sep 28 | GLM 5.3 refuses LoRA (`docs/model-serving-reality.md`); v34 promoted at 26 of 38 on the pinned held-out set (bar 25), never served | A month of local GPU time with no production use. 8 of the 28 logged versions died to the Metal watchdog |
| 12 | **Plugin distribution**: `.rbxm` download, then Creator Store, then removal ("Misusing Roblox Systems"), appeal accepted Sep 19, live Sep 22, v2 refused Sep 23, 404 by Sep 25 | Local install only; public release held (L02); appeal by 2026-10-23 | Aug 30 to Oct 4 | Roblox moderation | Plugin 1.5.0 exists only locally; the "final build then appeal" plan is still open |
| 13 | **Jev** routing assistant | Dropped | Sep 28 | HTTP 402 | Adopted and dropped inside one day |
| 14 | **Repo visibility**: private, public (secrets scan, D-SEC-LOAD-1; D-V3-3), private again | Private | Sep 23, Sep 28, Oct 2 | Leaked load-test password; 435 private library files; owner approval | Reminder: the owner library, training runs and evidence are private data |
| 15 | **Hebrew/RTL**: RTL support and Hebrew UI (Sep 14) | English-only product (`57e3e2b1`, Q36) | Sep 14 to Sep 20 | "A promise the product broke" | Owner still talks to agents in Hebrew |
| 16 | **Agent process**: three lanes in one checkout, worktrees, 36 mods, blocking hooks and autonomy skill, one-agent-at-a-time usage economy | Hooks removed; Workflows; mods | Sep 14 to Oct 3 | Peers stole commits; cost; owner "delete the hook" | Process changed seven times; every version created its own failure class |
| 17 | **Goal and meter**: 12-station finish gates, ACCEPTANCE G01 to G16, an 11-point goal with a fixed 25/20/15/10/10/20 meter (27.8%, then 35.6%), the frontier benchmark loop | GOAL.md research-first | Sep 14, Sep 28, Oct 2, Oct 4 | Owner: stop non-stop tests; research | Four completion definitions, none passed. The meter itself was an estimate in part (knowledge 15% est., website 10% est.) |
| 18 | **World builder wall gate**: five geometry attempts | Closed by owner (Sep 1); framework wins kept | Sep 1 | Ambient light flattens any purely geometric answer | Lesson: change what ambient cannot compress; the same lesson recurs in "studs everywhere" |
| 19 | **Studded as the specialty**: smooth plastic world (896 of 896 SmoothPlastic, Sep 1), "stylised Roblox look" (Sep 23), studded default (Sep 29), studs on every part (Oct 1) | Look memory deleted at reset | Sep 1 to Oct 4 | V3 Q2 | Whether studded is still the default direction is unclear |
| 20 | **Website**: refounded Aug 31, redesigned Sep 14, Sep 20, Sep 23 (193 picks), Sep 24, Oct 2, v4 Oct 3 | Parked | five times | See row 4 | Website carried 20% of the owner's meter and sat at 15% on Oct 4 |

---

## 14.5 Lessons a planner must respect

1. **Decide the product first, and let it stay decided.** Three product definitions in five weeks rewrote every gate. Any plan that
   changes scope again must say which existing gates, docs and branches die and who deletes them (D-V3-1, GOAL.md retirements, 7 memory
   notes deleted).
2. **Judge by what the owner sees in the game, not by tests, counts or the agent's own report.** Pass counts, 94/100 judges, eval scores
   of 98.9 and "5 of 5 green" were all rejected. Lead with screenshots and a blind critic; treat green tests as plumbing.
3. **Use a fresh, blind critic on final screenshots and make it the gate.** This is the only judge the owner has accepted twice
   (D-GAUNTLET-2, Oct 4). Never let the builder write "verified in viewport" without an image that shows it; the Oct 4 benchmark caught
   exactly that claim.
4. **Fix the framework, not the request.** Request-specific code (noun lists, kits stamped on every object, template stamping, nudges in the
   user's voice) produced all the worst benchmark results. Every fix needs a never-seen request in a fresh chat to prove it.
5. **Do not refuse by name or by noun; give the agent information and tools.** D-MODELLIB-2 failed in 8 days. The harness should offer
   candidates, sizes and checks and let the agent choose (D-MODELLIB-3).
6. **A small model needs a harness that does the long-horizon work.** The cheap model's failure shapes (read paralysis, template
   stamping, loops, stalling) repeated for ten days regardless of guards. Expect to design concrete numbered build steps, auto-placement,
   batching and bounded read budgets, or reopen the model decision with real economics. Do not assume that one more guard fixes it.
7. **Prevent loops structurally.** Every loop was found only after credits were spent (450, 1,198, 242, 195). Budget per tool class,
   per step type and per run, and make every failure return a reason (`70fbc134`).
8. **Protect BudgetDO; it is the only hard spend ceiling.** AI Gateway is Standard billing with uncapped overage; NaN guards, shared
   daily capacity, and test lanes consuming customer capacity were all real incidents.
9. **A failure to observe must not render as an observation.** Treat any empty, zero, short list, `ok: true` or red CI as unproven
   until you know what was examined. Report "not measured" in those words.
10. **Do not claim existence as execution.** "Wired", "shipped", "closed" and "passed" require a reachable path and observed effect;
    an audit found 33 overstatements in one handoff. Never mark a finding closed without production evidence.
11. **Tests that read source text will bite.** Many worker tests assert on source characters; moves and reorders fail them. Run the whole
    suite, restate (never delete) tests whose behaviour changed deliberately, and record why in the commit.
12. **Roblox gates the architecture.** The plugin may not build code from HTTP bodies; `LoadAsset` only loads Roblox-owned or
    authorised assets; uploads of images and decals are refused; Creator Store distribution is a moderation decision, not a click;
    plugins do not auto-update; a Studio restart drops pairing. Plan release as: publish once, then appeal, before 2026-10-23.
13. **Keep the owner's data private.** Owner library files, training runs and evidence must stay out of any public repo
    (D-V3-3, `9ababa90`); never read `.env`; the Creator Store plugin id and keys are consent-gated.
14. **Do not run full benchmarks on code about to be replaced.** Maps cost 430 to 584 credits each; the baseline cost 3,423 credits; the
    daily shared cap was once exhausted by test lanes. Test lanes need their own budget (D-SPEND-DAY-1).
15. **Research and knowledge only help if the build harness can use them.** After 23 research notes, 1,025 passages and 519 skills, game 1
    still scored 1.5 to 2. Knowledge is necessary and demonstrably not sufficient.
16. **Never edit a bank item after seeing its score**, and never make a bench item request-specific. Version the bank instead. Keep a
    held-out bank written blind.
17. **Visual direction needs a decision rule, not a vibe.** Seven directions in five weeks, each "locked" and then abandoned. If the
    website is rebuilt, fix the owner's two references (ai-sdk.dev and awesome-llm), put them in the spec, and stop after one round of review.
18. **Never share one checkout among agents.** Use worktrees outside the repo, never `git add -A/-u`, use `git commit -- <paths>`, and
    copy any untracked peer file aside before touching it (F-67, F-68, lanes memory).
19. **Hand off with a restore kit and keep a short "what not to redo" list.** The 2026-10-02 handoff worked because it recorded what
    failed; the Sep 27 to 28 Codex stretch (329 dirty paths) is the counter-example.
20. **The owner is not a reader of docs or code.** He decides by seeing and playing; give him multiple-choice questions with a recommended
    option, screenshots over text, and honest numbers. He expects pushback once on legal or account risk, then obedience.
21. **Cost-awareness is a product constraint, not a footnote.** He approved 10,000 credits for testing but cancelled the stronger-model run
    in minutes. Any plan that needs a pricier model must present per-build cost beside the benefit.
22. **Delete dead directions explicitly.** Retired scope kept in docs misleads later agents (the V3 files still say "start here"; CLAUDE.md as loaded in
    this session still says START HERE `docs/autonomy/` while AGENTS.md says `GOAL.md`). When a direction is retired, edit the entry docs in the same commit.

---

## 14.6 Open questions this section raises for the planners

1. **Which of the V3 decisions Q1 to Q38 still stand after the 2026-10-04 reset?** The reset says V3 scope is "history", but single
   engine, English-only, no selectors, studded default, one project one game, Generate Branding and the Studio-connection gate are all
   shipped. Does the final product keep them, and should the 16 gates be rewritten or dropped?
2. **Is "studded" still the specialty?** The reset deleted the studded-look and visual-bar memory, but the prompts, kits and Q2 still
   say studded. Needs one clear owner answer before any visual work.
3. **Does the model decision get reopened with economics?** Section 02 and the history show GLM 5.3 Flash cannot carry a multi-step
   creative build, yet the owner cancelled the stronger-model test on price. Is the product a small model plus a heavy harness, a hybrid
   (strong planner, cheap executor), or genre kits where the kit carries the quality?
4. **What is the "final product"?** Full game from one line (today's promise, 0 of 5 accepted), genre kits, a Studio co-pilot, or a hybrid
   (section 15 offers these). History says the full game has never been accepted.
5. **Are the "never draw by hand" fences still in the code?** D-UIONLY-1 (GUI), D-FXLIB-1 (sound/particles) and D-MODELLIB-1 are
   documented as hard refusals; Oct 2 and Oct 4 commits relaxed model rules and plugin 1.5.0 allows audio/animation classes. Someone must
   read `apps/worker/src/library-guard.ts` and `tools.ts` to state the real policy.
6. **What happens to the owner library and the 565 sources?** Whole-world reuse was rejected, yet 9.6M nodes and 97k verified assets exist
   locally and privately. Do components derive from it, or does research plus Creator Store replace it?
7. **What is the plugin release plan before 2026-10-23?** The appeal deadline is fixed; the owner said "plugin release, then deploy,
   then build games". The listing is 404 and v2 was refused for unstated reasons. Who submits, what is in the final build, and what
   should be removed to pass review given D-STORE-2 forbids removing tools?
8. **Which website language, and when?** v4 (Geist black-and-white) is parked; the earlier rounds were rejected. Does the next round
   precede or follow Phase T?
9. **Do F-059 and F-064 (game visual quality; runs ending with planned parts unbuilt) have a defined closure test?** They have been open
   since Sep 23 and were carried into V3 and into the reset. Does the blind critic's "every area at least 8/10" bar replace them?
10. **What is the rename's true end state?** A+B1 are merged; B2, the Cloudflare/Supabase/Sentry steps and the gate on the old
    worker's Durable Objects are open, and ADR-024 ties the `clay/stone/rune` keys to the next protocol bump. Is the next protocol
    version the moment, and who owns the migration?
11. **Which meter, if any?** The fixed 25/20/15/10/10/20 meter (35.6% on Oct 4, partly estimated) was retired by the reset, yet the owner
    asked for a visible total-completion bar (mod #38). Planners need one honest definition of "done" that mixes research coverage, blind-critic
    score and release readiness without estimates.
12. **How should concurrent agents work from now on?** The history shows five incompatible regimes. Section 15 lists parked branches
    (`site-v4`, `web-v4`, `search-90`, `repo-reorg`, `fixes-0410`, `fix-r3`). Which merge first, who deploys, and who may touch
    `main`?
13. **Who owns the numbering?** Two F-series and two ADR-020s exist. A planner should decide whether to renumber, prefix (FA-/FC-) or
    stop writing new F-entries in favour of the blind-critic reports.

---

## Appendix A. Key commits referenced

| SHA | Date | Subject (short) |
|---|---|---|
| `82fb43ac` | 08-30 | Founding decisions, shared protocol, Supabase schema |
| `eb47daef` | 08-30 | Worker LIVE with verified inference + RAG |
| `138b9eb4` | 08-30 | Production model migration to GLM-5.3-flash |
| `d34d809d` | 08-31 | Conversation-first workspace, adversarial critic, composition eval verdict |
| `ac82f9cf` | 09-20 | The asset library is gone, on the owner's decision |
| `a5c45192` | 09-01 | Gate 2: record the wall result as measured, not as claimed |
| `088ecdbe` | 09-01 | An independent audit downgraded five of my own gates |
| `6fc5ccbe` | 09-02 | The decision log still said Clay, Stone and Rune were user-facing |
| `7fb753ae` | 09-14 | Rename the product to Apple and adopt the mark's palette |
| `10c1f31a` | 09-14 | Move off the paid-only model so the product can run free |
| `775219a3` | 09-14 | Subscriptions, credits and a signature-verified Stripe webhook |
| `f5ab9df1` | 09-14 | Licence-gated dataset pipeline + Apple v1 LoRA (not promoted) |
| `eac3f01a` | 09-19 | Three days of another session's work sitting uncommitted |
| `f6ad60ad` | 09-19 | Two Studio plugins; the one the worker was built for is the one Roblox removed |
| `a32e61bd` | 09-19 | The Creator Store step was never un-done, Roblox is refusing |
| `6437a7b1` | 09-19 | Test keys in production sell Studio to anyone who knows 4242 |
| `6cce492a`, `4d564e34` | 09-19/20 | Apple MAX moves to glm-5.3-flash |
| `33f8fea6` | 09-24 | D-GAUNTLET-2: blind critic, retire the reference comparison |
| `38efea2e`, `c839d7af` | 09-29 | V3 single engine; remove Plan/Agent/Autonomous |
| `89bf8fa9` | 09-29 | Remove autonomy hooks, skill, and Jev code at owner instruction |
| `d2c17f77` | 09-29 | Studded default look first |
| `9086f095` | 09-30 | Owner revoked the library client-test pass |
| `31628029` | 10-01 | Studs on every part, RigEdit, lighting recipe |
| `a277cfcc` | 10-02 | Phase 1: the model rule becomes advice |
| `c6a576f6` | 10-02 | The 2026-10-02 evening handoff and restore kit |
| `10c956a6` | 10-04 | Merge apple-rename-ab1 into integration/giant |
| `a9d53e7a`, `f598acb8` | 10-04 | Stronger-model pricing added, then reverted |
| `3a32d523` | 10-04 | WIP handoff to Codex (fix-r3 round 3 E2) |

## Appendix B. Source index

- `docs/DECISIONS.md` (ADR-001 to 024), `docs/autonomy/DECISIONS.md` (D-ids), `docs/autonomy/v3/Apple_RbxAI_DECISIONS_V3.md` (Q1 to Q38)
- `docs/FAILURES.md`, `docs/autonomy/CUSTOMER_FINDINGS.md`, `docs/autonomy/EXPERIMENTS.md`, `docs/audit/TRAINING-V1-REPORT.md`,
  `docs/training/FOREVER-LOG.md`, `docs/model-serving-reality.md`, `docs/WORLD-BUILDER-HISTORY.md`, `docs/FINISH-REPORT.md`,
  `docs/MISSION-PROMPT.md`, `docs/DESIGN-LOCK.md`, `docs/gauntlet/visual/GAUNTLET.md`
- `docs/autonomy/SESSION_HANDOFF_2026-09-30.md`, `docs/autonomy/v3/Apple_RbxAI_HISTORY_V3.md`, `docs/autonomy/CURRENT_STATE.md`,
  `docs/autonomy/NEXT_ACTION.md`, `docs/autonomy/ACCEPTANCE.json`, `GOAL.md`, `docs/handoff/2026-10-04/`, `docs/handoff/2026-10-02/`
- `git show c6a576f6:HANDOFF.md` (the 2026-10-02 handoff; the file was touched by `bfaad405` and deleted from the working tree on Oct 4 at the owner's order)
- Memory notes under `~/.claude/projects/-Users-moshe-Developer-RbxAI/memory/` and `-Users-moshe-Desktop-RbxAI/memory/` (the Desktop
  copy additionally holds `owner-library-v2` and `usage-economy`; the Developer copy holds `owner-standing-consent-2026-10-02`)
- `planning/sections/02-owner-directives-and-session-history.md`, `planning/sections/15-open-decisions-risks-planning-frame.md`

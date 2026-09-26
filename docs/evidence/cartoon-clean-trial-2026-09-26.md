# Independent full-game trial preparation — 2026-09-26

## Strategic finding
An independent strategic review found the main product gap is unproven autonomous production. Precisely supplied assets, positions and tool sequences prove instruction following; they do not establish full-game creation. Existing flower integration remains useful local evidence, with commercial visual findings unresolved.

## Actual preparation
- Created Apple project `474abb3f-0f0f-4d97-954e-934b50048857`, titled “Cartoon v2 — garden farming r1”.
- Kept the frozen `cartoon-v2-garden-farming-r1` prompt unchanged. No prompt submitted, model run, manual asset import or detailed geometry added to this trial.
- Generated baseline: 1,059 bytes, SHA256 `d2ca1f51b7f74b56c38aabf25cf043dd75cf8420686d5eaf1764d2d815edcb68`. Data-only inventory: two parts, zero scripts, zero ScreenGuis.
- Native UI identified the exact `AppleFrontierFreshBaseplate.rbxlx` path and showed the fresh grey Baseplate. Closed unused review windows via native controls to resolve Studio instance selection. The previously saved garden file was not overwritten.
- Studio pointer remains blocked: a click on the visible pairing field fails with `windowNotFoundAtPosition`; native zoom changed geometry but did not repair input. Correct active place is now verified; pairing is not.
- Live read-only observation at 12:06:14 UTC: disconnected, idle, zero queued ops, no messages/turns, zero recorded Credits and neurons. Global provider logs are truncated; zero refers to this empty project's recorded run IDs, not total account usage.

## Observer implementation and verification
`observe-run.mjs` initializes a private manifest and reads existing admin diagnostics. It never submits a prompt, pairs Studio, mutates the game or stops an agent. Proposed monitoring bounds: 300 Credits / ten minutes, requiring actual UI Stop when reached; these are not a server-enforced spending cap. Active-turn Credit spend is unavailable, and recorded spend remains a lower bound. Missing message coverage triggers a conservative stop flag; log truncation is explicitly exposed.

Independent review caught and corrected: preparation messages counted as trial initiation; fixed-size history losing start time; automatic HTTP redirects forwarding a custom credential. Exact frozen prompt identification, persisted start time, bounded message pagination and `redirect:error` now address these. Seven focused regressions passed; actual API observation remained `not-started`/`unmeasured`.

## Remaining acceptance
No new full-game or visual pass. F-059/F-064 and independent product reviews 0/3 remain. Native Claude strategic-owner activation still awaits Q-024 existing account access. Latest pushed head `52847a8` passed all six GitHub Actions jobs (run 36240301034). CPU supervisor 35962 and child 91102 remain active; v33 last measured iteration 350/400, without a completed paired score or publication.

Evidence: `cartoon-clean-trial-20260926/fresh-place.png`, `observation.json`, `baseline-scan.json`. Private manifest: `/private/tmp/apple-cartoon-clean-trial/manifest.json` (contains the frozen holdout prompt; not a game completion result).

Follow-up review found timestamp boundary ties; overlapping pagination now deduplicates IDs and explicitly marks an unresolved 100-message tie as incomplete. The seventh regression covers 101 messages sharing a timestamp. Studio startup logs show other local editor plugins; the generated zero-script baseline is a file inventory, not a claim about the loaded DataModel. Save and audit the actual loaded place before any trial run.

## Loaded native baseline checkpoint
At 12:08 UTC, native read-only inventory and Save to File As captured the loaded place. The Save As name field interpreted an absolute path as a colon-containing filename; the actual reported saved path is retained in `loaded-checkpoint.json`, with a byte-identical review copy at `/private/tmp/apple-cartoon-clean-trial/before-loaded.rbxl`. Native file: 50,570 bytes, SHA256 `d567475902f5e6f0a82d52e6b4fd74903353970ec061df339db781db340757f4`.

Data-only audit: two saved parts (Baseplate/SpawnLocation), one pre-existing `TestService.LuauLSP_Settings` ModuleScript, zero ScreenGuis/remotes. `ServerStorage.__PanicGitFastV5` is an editor checkpoint folder. These are baseline helpers, not game content or an Apple mutation. In-memory whole-DataModel counts include editor UI (15 BaseParts/one script/eight ScreenGuis); canonical gameplay services had zero scripts/ScreenGuis. Full saved inventory provides the authoritative before comparison. No imported script was executed by the inspector. Trial remains unpaired/not-started.
Latest CI for new observer commit `1dbf95f` is run36240954658, in progress at last check; previous52847a8 passed all six jobs.

## Live trial start and ordinary preview continuation
At 12:13 UTC, native fullscreen repaired actual pointer/keyboard input. The normal project pairing flow connected the isolated place and ordinary plugin confirmation allowed edits. No Experience Setting changed. The exact frozen prompt was submitted once at **12:14:40.104 UTC**, with Apple MAX / Agent / Autonomous. Monitoring bounds apply to the whole trial, including preview continuations: 300 Credits / ten minutes.

First turn `20f2ca9c-a7e5-4687-9740-a1fe4386f20e` ended `incomplete` at 12:18:34.975 awaiting a normal visual choice. Its persisted trace has 42 successful tools: plan, tree, mechanic lookup, checkpoint, Profile module installation, one heightmap + 23 terrain edits, terrain/spatial reads, five simple plaza/path parts, empty market-stall search, and tree preview. It spent **152 Credits / 4,559 retained provider neurons / 35 calls**. This establishes partial changes, not gameplay completion.

One ordinary preview choice selected Oak Tree at approximately 12:19 UTC; the product submitted “Use visual option 1 and continue.” No asset IDs, coordinates, construction hints, manual imports or hand-built content were supplied after start. This is the single recorded normal preview intervention. No third-party insertion proved at this checkpoint.

The active observer initially showed zero neurons because it only matched completed assistant IDs. Project-scoped numeric epoch-ms provider events proved active spend. The fix includes calls since the persisted trial start without waiting for the assistant row and explicitly labels totals lower bounds; eight focused regressions passed, including prior-project/time exclusion and secret-field exclusion. Provider retention truncation remains explicit.

Latest pushed head `f14c009` passed all six jobs (run36241026842). Sole CPU supervisor35962 completed v33 training400 iterations at12:18:40 and began evaluation, without a measured completed pair, private upload or next-version start yet.

## Sealed trial outcome — actual evidence
The second turn `07c4d292-8229-463d-9998-927e1116d07f` ended incomplete at 12:24:05.844 UTC after 20 tools and 115 Credits. It never attempted `insert_library_model` for the selected Oak Tree. Instead it searched for shop/building variants and attempted two detailed primitive shop constructions, which the policy correctly refused. Its final preview offered unrelated red/blue flag stands. No further preview was selected.

At 12:24:29 UTC the agent was idle with zero queued operations. The trial was sealed at its ten-minute bound, 12:24:40.104 UTC; no agent Stop was required or performed because the agent had already paused. Totals: **267 Credits / 8,007 retained provider neurons / 56 calls / 62 tool traces**. Retention is truncated, so provider totals are lower bounds; invoice dollars were not measured. Native Play was observed at approximately 12:25:51 UTC with only ground, a player and default Roblox controls visible. No later Stop timestamp was captured. Fresh process verification after resumption finds the original Studio process missing; a current different Place1 cannot establish a Stop action for that historical trial.

Saved after file: **82,251 bytes**, SHA256 `ab5bc8e72e369751d5f7a567aaa95742e427c7744d8ab2d2d932a850107a57f5`. Data-only audit: seven parts, two ModuleScripts (pre-existing editor helper plus Profile), zero ScreenGuis, zero remotes and no executable gameplay Script/LocalScript. Delta from loaded baseline: five simple structural parts plus Profile and terrain. Purchasing, planting, growth, harvesting, selling, upgrades, saved game inventory and mobile HUD were not established. This is a failed full-game trial, not a commercial visual pass; F-059/F-064 and 0/3 independent release passes remain.

An independent blind reviewer received only the requested visual outcome and after-native/after-wide screenshots. Verdict: CRITICAL visual failure: bare sand platform, flat wooden extensions, muted olive/beige/grey terrain, no recognizable crops, shop, farming stations, signs or HUD. Screenshot-only review cannot prove unseen gameplay, rights, saving or mobile controls. It contributes failure evidence and does not increment independent release passes.

The observer now counts active project-scoped provider calls and limits sealed trials to endedAt. The sealed-bound regression failed before the fix (366 instead of 267 Credits) and all nine observer tests passed after it. These are measurement repairs, not full-game product completion.

## Fresh training verification
The sole supervisor PID35962 completed v33 (21/38 versus paired23, not promoted), then v34 (26/38 versus paired23, promoted) and automatically started v35. Fresh local comparison verifies 38 matching row IDs and identical base results. Private Hugging Face v34 contains the adapter/config/candidate score; the paired comparator was missing from the cached supervisor publication and was added separately without interrupting training. Private readback matched all 12,211 bytes, SHA256 `c1969fc21e57b03f80897432697eb1593ece187916fbcdd0dd4f4f8dc0887d71`. v29's original generation drift remains unresolved; no Frontier claim follows from v34's local score. Latest remote head f14c009 still has six successful CI jobs (36241026842).

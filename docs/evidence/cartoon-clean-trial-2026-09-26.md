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

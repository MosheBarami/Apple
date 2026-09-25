# Studio round 8: connected scratch place, asset sources, Stop

Measured 2026-09-25 09:12–09:15 UTC. Project `395e5b9f-193a-4d6e-b5fb-714e4869a2d7`, an owner-created isolated project named “Gauntlet Round 8 — Studio verification,” was paired through the ordinary web and Studio code flow. The pairing code was transferred between the signed-in browser and Studio without printing or recording it. Studio's title identified `/private/tmp/apple-codex-gauntlet-place.rbxl`; edits were enabled for that connection only. The place was saved through Studio after this test.

## Asset-source boundary (F-059, partial)

With no source preference set, the admin-gated single-tool harness called `insert_library_model` for an oak tree. Studio's 1.4.0 independent-preview dock visibly opened “Where should Apple get assets from?” with Creator Store selected and “Make it from scratch” unselected. Selecting “Use these sources” showed “Saving...” and then closed the question. This was a direct tool call, not a Studio-started model run, so it does not prove the answer reaches the same agent run.

The library search returned Creator Store model `cs-18717544` and `cs-56449132`. The former was inserted, failed the script safety scan and was removed; its tool result was `ok:false`. The latter was inserted into the scratch Workspace at `[20,0,30]`, with `scan:"clean"`, no stripped scripts and `ok:true`; the tree was visible in the Studio viewport. No new asset was uploaded to the owner's Roblox account. This proves a real Studio question, a saved source choice, safe rejection, and successful local insertion after consent. F-059 remains open for the same-run Studio-started build requirement and the larger visual result.

## Run and Stop (F-069, partial)

The signed-in web workspace started an Agent/Apple MAX run: “Build a small forest patch ... Use 8 ready-made trees ... add a short walkable path, and a simple welcome sign.” The worker's session-info reported `agentStatus:"running"`. During the run, the web page still showed an active assistant thinking card but temporarily replaced the Stop control with a disabled Send control. Reloading restored Stop from the worker's run snapshot. Pressing Stop through the web immediately made `stopRequestedAt` non-null while the worker still reported running; the run subsequently became idle. The oplog remained at 13 entries after the click. The persisted assistant message recorded `stopReason:"stopped"`, `creditsSpent:32`, and three tool-trace entries. This verifies that the HTTP/worker stop path worked in this run; it also exposes another web presentation failure while a run is live.

The follow-up in commit `8d6c662` keeps the Stop control visible when a streamed assistant turn is still active even if the local running flag drifts. Its regression test failed first, then 23 focused web tests, the full 2,429-test web suite and TypeScript check passed. A clean-export web deployment verified all 38 served files byte-for-byte. The transient disappearance has not been reproduced after that deployment, so F-069 stays open pending a new live run.

The run was intentionally stopped before the forest, path and sign could be judged; F-064 remains open. The Creator Store public plugin listing still returns 404 and is separate from this local preview test.

# Roblox Frontier Studio benchmark

This is a **product benchmark**, not a claim that a text model knows how to build a game. It asks
Apple to take one ordinary customer prompt through its actual paired Studio plugin and complete a
playable game. The first fixed bank has 12 genres × 3 independent fresh-place attempts = **36
full-game runs per product lane**. Each run names eight genre-specific gameplay requirements and
four or five purpose-built Roblox asset roles, plus eleven cross-cutting gates. A pretty blockout,
passing Luau, or a chat reply saying “done” cannot pass it.

The original bank is frozen in `missions.mjs`. After the owner narrowed Apple to
colorful cartoon games on 2026-09-25, a distinct bank was frozen in
`missions-cartoon-v2.mjs`: twelve cartoon game genres, three fresh-place attempts
each. Its visual-style gate needs an independent blind verdict that the finished
world and UI are colorful, coherent and commercially polished. A code pass or
asset thumbnail cannot supply that verdict. Score it with
`node score.mjs evidence-bundles.json cartoon-v2`; the default remains the original
bank, and the output identifies which bank was scored. Keep both banks' prompts
out of training, RAG, system prompts and
demonstrations. Do not edit a prompt after looking at its score; version the bank and start a new
series. Repeating the same prompt three times on independent fresh Baseplates measures stability,
not three different questions. Also run the existing `roblox-frontier-bench.mjs` for executable
Luau/API failures; its code-only score cannot stand in for this game benchmark.

## Per-run protocol

1. Record the exact live build SHA, model route, plan, mode, prompt, project ID, place baseline hash,
   time and run ID. Use a fresh, isolated Baseplate. `node make-baseplate.mjs` produces a local
   `.rbxlx` plus a SHA-256 baseline manifest with only Workspace, Baseplate and SpawnLocation;
   open that file in Studio and verify the active place before pairing. Do not clear a customer's
   existing place. The generator itself does not open or publish anything.
2. Submit the fixed prompt once with Agent and Autonomous enabled. Allow at most three normal
   asset/style preview choices (`preview-approval` or `preview-rejection`); a human code edit,
   freeform hint or manual place repair invalidates the run. A preview choice may continue the
   same mission in another assistant turn: retain every segment's messages and tool trace.
3. Persist the worker's tool trace with run ID. It must show a successful `propose_plan`, then
   `find_library_model` or `find_verified_asset`, then insertion, then `play_check` or
   `play_check_ui` and `inspect_visually`. A refused or disconnected tool is not a success.
4. Independently read the Studio place back. For each asset role, identify the Roblox-specific
   source, rights, why it fits the brief, the inserted instance and its placement. Audit that
   complex models and UI came from the approved Roblox library, while only simple geometry was
   built from parts. A generic 3D pack converted to Roblox is out of scope. Test scripted assets for behavior and safety; a
   thumbnail is not a working object.
   Save separate before/after place files and run Lune 0.10.5 with
   `lune run packages/evals/frontier-studio/inspect-place.luau <place> <report>`
   on each. The inspector deserializes without executing scripts and counts all services, including
   `ServerScriptService` and `StarterGui`; record pre-existing editor helpers separately from new
   game content. On this host use the actual binary under
   `~/.rokit/tool-storage/lune-org/lune/0.10.5/lune`, since the `~/.rokit/bin/lune` shim has
   no project manifest. It is structural evidence, not proof that a script works.
5. In Play mode, execute every feature from the task bank as a player. Probe money, persistence,
   multiplayer isolation and remote authority where applicable. Capture server/client errors and
   a phone-width UI view. For the colorful-cartoon bank, also record the first ten seconds and
   the first guided action as a sequence: the instruction is visible, the player can activate
   its highlighted control, the world and HUD respond, and a legible next objective appears.
   Record the before/after images, actual input, and changed state. The native Roblox Player
   observation of Ride A Pet documented this chain, but its art and mechanics are reference
   observations only; the Apple benchmark must use original work and independently verify its
   own Play session. If Apple shows a tutorial label but its button has no effect, fail the
   `first-action` proof; if the next objective or interface is unreadable, fail `visual-ui` too.
   Store the exact operations and observed outcomes, including failures.
6. Take 4–8 final Studio shots with neutral filenames. Give **only** those images to an independent
   blind visual critic using `docs/gauntlet/visual/BLIND_CRITIC.md`. Separately audit feature
   completeness against the prompt, so blindness does not hide missing requested features.
7. Grade the evidence with `node score.mjs evidence-bundles.json cartoon-v2` for the
   current product scope. Every pass needs an independent
   examiner, a run-bound proof record and SHA-256-matched nonempty artifact. Missing evidence is
   **unmeasured**, never a pass. A trace-proven run that ends before completion is a measured
   failure even though no finished-game Play or visual proof exists. Any observed failed
   requirement fails the game, even when other proofs remain missing. The report retains the
   missing list so the reviewer can see what was not checked. Invalid run identity or altered
   prompts remain unmeasured.

`score.mjs` checks the envelope and proof inventory. It does **not** understand a screenshot or
execute a Studio probe. An independent reviewer must inspect the cited artifacts and attest to
each named requirement; the scorer cannot make a dishonest attestation true. For subjective visual
gates, periodically calibrate the blind critic against separately labeled pass/fail screenshots;
track its false-pass and false-fail rates, not only overall agreement. Keep those calibration
images separate from benchmark shots.

## Evidence bundle contract

The CLI accepts an array of bundles in one JSON file. Artifact paths are relative to that file's
directory. A minimal bundle has the shape below; every `criteriaFor(task)` key needs a proof:

```json
{
  "taskId": "farming-r1",
  "run": {
    "id": "real-run-id", "projectId": "isolated-project-id", "buildSha": "deployed-sha",
    "promptSha256": "SHA-256 of the exact task prompt", "baselineSha256": "SHA-256 of the fresh place before the run",
    "startedAt": "ISO timestamp", "endedAt": "ISO timestamp", "finalized": true, "start": "fresh-baseplate",
    "mode": "agent", "autonomous": true, "stopReason": "done", "interventions": []
  },
  "proofs": {
    "run": {
      "kind": "run-trace", "runId": "real-run-id", "observer": "independent-examiner",
      "artifact": "trace.json", "sha256": "64 lowercase hex characters", "passed": true
    }
  }
}
```

`trace.json` must be `{ "runId": "real-run-id", "tools": [{"tool":"...","ok":true}, ...] }`
in actual call order. This checks the agentic route from a plan through discovery and placement
to functional and visual verification; the trace alone does not prove the game works.
Each `asset:<role>` proof additionally needs
`asset: {source: "library"|"creator-store", sourceRef: "Roblox asset ID or library row",
rightsUrl: "https://…", robloxSpecific: true, rightsVerified: true, placed: true,
instancePath: "Workspace.ActualInstance", selectionReason: "specific visual and functional fit",
placementReason: "why this location serves gameplay", scriptDisposition: "no-scripts"|
"audited-and-tested"|"stripped"}`. The external artifact must substantiate those fields;
"audited-and-tested" requires a real behavior probe. UI, world, playtest, security and
persistence are separate gates.

For `cartoon-v2`, `visual-style` is an additional `blind-review` proof. Its
verdict must contain three booleans: `colorfulCartoon`, `coherentArtDirection`,
and `commerciallyPolished`. All must be true for a pass; missing values leave
the task unmeasured. Reviewers should inspect first spawn, a gameplay action,
at least one UI interaction and the end-of-loop state at desktop and mobile
sizes. Preserve the actual images and concrete observations, including rejections.
The separate `first-action` playtest proof must include `firstAction: {input,
instructionVisible, activated, worldChanged, hudChanged, nextObjectiveVisible}`.
The five observations are booleans and all must be true for a pass; a missing
observation leaves the mission unmeasured. Its hashed artifact should be the
examiner's timestamped first-ten-second report with before/after screenshots,
the exact input and observed state changes. A tutorial label alone cannot pass.

The suite reports `passRate: null` until all 36 tasks have measured results. A complete 36/36
pass is **a pass on this benchmark version**, not by itself proof of universal Roblox frontier
ability. Report the exact lane, build, bank version, sample count, confidence limits, observed
failures, blind-review calibration and cost. Publish failed runs alongside passes. Refresh the
bank with new customer failure types and reserve unseen tasks for a later holdout.
The scorer rejects altered prompts, missing place hashes, impossible time intervals, duplicate
task submissions and reuse of a project or run ID across independent attempts.
An intermediate `incomplete` assistant turn waiting for a preview choice has `finalized: false`
and remains unmeasured; a terminal stop after all permitted choices have been tried has
`finalized: true`, a failed run proof and a measured failure.

## Current state

The original bank has **1 of 36** measured: `simulator-r1` ended without a complete
game and failed on its persisted trace (`docs/evidence/frontier-studio/simulator-r1/report.md`).
The current cartoon-v2 bank has **0 of 36** measured. Neither has a reportable
pass rate yet. The next real step is a fresh isolated, paired Studio run from the
cartoon bank, followed by readback, gameplay checks and blind screenshots. The
owner's visual rejection remains a product failure, not an unmeasured success.

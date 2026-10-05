# StudPilot evaluation harness

The harness measures what the real product builds. For one dev request it runs the agent through the real path
(admin API, worker, plugin, the open Studio place), photographs the result with Roblox's own Studio MCP, play-tests it,
and saves the evidence. Two fresh Claude Code subagents then score the pictures against `planning/critic-rubric.md`,
a third audits the reply, and `lib/verdict.mjs` applies the pass rule of plan 4.3. It builds nothing and fixes
nothing: it only measures (handoff M3).

```
run-piece.mjs <id>  ->  planning/proof/<milestone>/<id>/   (request, reply, steps, credits, timing, console, shots, manifest)
prepare-critics.mjs ->  args  ->  Workflow tool runs critics.workflow.js  ->  results.json
write-verdicts.mjs  ->  critic-a.json, critic-b.json, claims.json, verdict.json   in each folder
baseline.mjs        ->  planning/proof/<milestone>/baseline.md
```

| File | What it is |
|---|---|
| `run-piece.mjs` | The capture runner (one request). `--init-baseline` records the pristine place once. |
| `pair.mjs` | Mints a pairing code with no sign-in (`POST /api/admin/pairing/:id`). |
| `spend.mjs` | Prints the Workers AI spend state; exit 3 at the ceiling. |
| `prepare-critics.mjs`, `critics.workflow.js`, `write-verdicts.mjs` | The critic pipeline. |
| `baseline.mjs` | Aggregates every verdict into `baseline.md`. |
| `lib/verdict.mjs` | The pass rule, a pure function (unit-tested clause by clause). |
| `lib/studio-mcp.mjs` | A minimal MCP stdio client for `StudioMCP`, with a timeout on every request. |
| `lib/dev-set.mjs` | Reads the 60 frozen requests by id. It has no way to write. |
| `luau/world-state.luau` | Capture, reset, verify, measure and show a switched-off UI in the place (sent through `execute_luau`). |
| `lib/world.mjs` | Builds that Luau, reading the property list from the plugin's own write allowlist (`PROPERTY_ALLOW` in `Commands.luau`). |
| `lib/capture-plan.mjs` | Pure rules: the cameras, world / UI / terrain, which pictures a piece is planned to have, the play-test evidence. |

Nothing here is deployed, nothing is published to Roblox, and no secret is printed or written. The admin key is read
from the environment (`STUDPILOT_ADMIN_KEY`) or an env file (`--env-file`, `$STUDPILOT_ENV_FILE`, or the repo's `.env`).

## One-time setup

1. **A Studio that is signed in (the owner does this).** The harness never signs in, creates an account or opens a place
   itself. On 2026-10-05 Studio on this Mac was getting 401 from Roblox on every call: its session had expired. A second
   Studio started by `open -a RobloxStudio <file>` logged `Authenticated : NO` and never opened the file. So the owner
   signs in to Roblox Studio on this Mac first, by hand, and keeps it signed in for the whole batch.
2. **A local Baseplate place, never published.** `node packages/evals/frontier-studio/make-baseplate.mjs` writes a fresh
   `.rbxlx` and prints a JSON manifest with its `placePath` (it needs `rojo`). Open it: `open -a RobloxStudio <that file>`. Do not use "Save to Roblox"
   or "Publish": the pairing is tied to the open place (`apps/worker/src/studio-place.ts`), so every reset must clear the
   SAME place, never open a new file. The owner opens it in the signed-in Studio and keeps that window open for the whole
   batch.
3. **Install the plugin.** `node apps/studpilot-plugin/scripts/build.mjs` writes
   `apps/studpilot-plugin/release/studpilot-studio.rbxm` (it installs and publishes nothing). Copy it into
   `~/Documents/Roblox/Plugins/` and remove any older StudPilot plugin file from that folder (one named after a former
   product name), so two copies do not load. Restart Studio, or reopen the place.
4. **Deploy the worker once** if `POST /api/admin/pairing/:id` or `POST /api/admin/conversation-reset/:id` is not live yet
   (both are new in the M3 harness branch; `node infra/deploy-worker.mjs studpilot`, an owner or orchestrator step, then
   check `buildSha` at `/api/health`). Until the pairing route is live, mint the code in the web app signed in as the test
   user instead; a real run cannot start without the conversation route (a dry run does not need it).
5. **Mint a code, and the owner types it into the plugin.** `node scripts/eval/pair.mjs` (defaults: the test project and
   user below) prints a 6-character code. A person types it into the plugin's pairing box in Studio within ten minutes:
   computer-use access to Studio was refused in the session that built this, so nothing automated can type it. It is
   single-use and a credential for those ten minutes: do not paste it anywhere. It refuses a project whose session has a
   different owner (403) or no owner on record yet (409: open the project once in the web app). Closing Studio ends the
   pairing; a new code is needed after that.
6. **Record the pristine place.** With the place still untouched:
   `node scripts/eval/run-piece.mjs --init-baseline --milestone M3`. This writes
   `planning/proof/M3/place-baseline.json` (format 2): every instance under the 13 services the plugin can write to, and
   for each of them, and for the services, every property the plugin may write (read from `Commands.luau`, plus Gravity and
   ShowDevelopmentGui) and every attribute, and whether the Terrain is empty. It is the harness's definition of "clean" and
   every manifest carries its sha256. It warns if the place does not look pristine. A baseline of the earlier format (it
   recorded only the services' properties and the parts directly in Workspace) is refused at preflight: record it again.
7. **Prove it on nothing.** `node scripts/eval/run-piece.mjs U01 --dry-run --milestone M3-dry --proof-root <a scratch dir>`.
   A dry run resets, photographs the empty Baseplate and play-tests it, starts no run and grants no credit. Read its
   output: the play test of an empty place must show 0 errors, and the `viewport` it reports is the real picture size (see
   below). If the play test shows errors on an empty place, the console filter needs adjusting before any real run.

Defaults: user `8722e4df-ab9c-47f6-8a57-02f5a5dd1d44` (the free-plan test account), project
`1ea443f2-6232-43c1-a8bd-f425e2df4f4d` (its most recent). Override with `--user` and `--project`; both are echoed at
the start of every run.

## Running a piece

```
node scripts/eval/spend.mjs                      # before the batch; log the line in planning/proof/ops/spend.md
node scripts/eval/run-piece.mjs U01 --milestone M3
node scripts/eval/spend.mjs                      # after the batch; log it
```

Steps, each timed in `timing.json`:

1. **preflight**: `/api/health` buildSha; a Studio with a place open (`get_studio_state`; with several, `--studio-id`);
   the plugin connected for the project (`session-info.pluginConnected`; a dry run only notes it and goes on); no run in
   progress; spend before; the month's spend under `--max-month-usd` (default 20, the owner's test ceiling) and the
   kill switch off; the baseline file exists. Any refusal stops here, before anything is spent.
2. **reset**: stop play if it is on; `reset` the place to the baseline, then `verify` it. The reset destroys everything
   under the 13 services that the baseline does not list, puts back every recorded property and attribute of EVERY kept
   instance (the Baseplate, the SpawnLocation, Lighting and its Sky, Atmosphere and effects, the services themselves; a
   spawn a run disabled, a locked Baseplate, a changed ColorGrading contrast, an attribute a run set on Workspace), rebuilds a
   Baseplate or SpawnLocation a run deleted, and clears the Terrain if it was empty. It never touches the camera, the
   Terrain or engine-made `TouchTransmitter`s. Engine-owned `RBX...` attributes are not tracked (nobody can set them). If
   `verify` still finds a difference, the piece stops (no credits granted) and names a sample of what is left. A property
   that was readable and no longer is counts as a difference, never as "unchanged". What a reset cannot recreate (a deleted
   Sky, the Baseplate's `Texture`) is reported as missing rather than hidden; reload the place file and run
   `--init-baseline` again. Not tracked: properties whose values are of a type the script does not record (a Font, an
   instance reference), and anything outside the 13 services.
3. **conversation** (real runs only; a dry run leaves the chat alone and says so): `POST /api/admin/conversation-reset/<project>`
   with the owner named in the body. The product has no clear-chat button (New chat starts another project), so the route
   does what its own actions already do, in one step: the messages and their model picks go, as `edit_resend` on the first
   message discards them; the memory the chats produced is emptied, as the memory editor can; the build ledger and the game
   plan go, as they do when a place is put back. The pairing, the checkpoints, the op log, the place and the settings stay
   (this is not `bench-reset`, which M4 removes and which also clears Lighting). It refuses a wrong owner (403), an owner
   who may not build (403) and a run in progress (409), and the piece then stops before anything is spent. The runner
   re-reads the message count and refuses to go on unless it is 0; the run is measured against that count. The manifest
   records it under `conversation` (what was removed, memory and ledger cleared or already empty) and `baseline.md` prints
   how many pieces ran in a fresh chat. One thing it cannot reach: the dashboard's mirror of the memory (`memory_summary`,
   `memory_facts` in Supabase), which is only a display copy (the agent reads the session's own).
4. **credits**: the plan is set to free and 3000 ledger units (20 credits; `--grant` to change) are granted once with
   event id `eval-<milestone>-<id>-<time>`. A displayed credit is 150 ledger units (`INTERNAL_PER_CREDIT`).
5. **agent-run**: the request text exactly as written, nothing else. From the moment the start request is sent the worker may have a
   run going, so the run is recorded first (`manifest.run`: `startConfirmed` is true only when the worker answered 200, and
   `startError` holds the error otherwise) and treated as live. A 5xx, a 408, a 429 or no answer on the start request is NOT "the
   run did not start": the runner stops the run it may have started (`endedBy: start-failed`), and the piece counts as attempted.
   A 403 or 409, and any other 4xx the worker answers with (a 400, 401 or 404), is the worker saying no: no run of ours exists,
   none is recorded, nothing is stopped and the piece does not count as attempted. Then it polls `session-info` every 5 s.
   A poll that fails with something a retry can fix (no answer, a 5xx, a 429) is tried again up to four times; a poll that cannot be
   read at all, a signal (below), and any other way out of the runner while the run is live STOP the run (`agent-stop`, then waits
   for it to go idle) and record it under `manifest.run.stop` (why, when, whether the stop was accepted, whether the run went idle);
   `manifest.run.endedBy` says which (`poll-failed`, `interrupted`, `harness-stopped`) and the piece cannot pass. After 15
   minutes (`--timeout-minutes`) it does the same and records `endedBy: timeout`. A run that was never seen as running within
   60 s is stopped too (`never-started`), so a late start cannot run on unseen; a run that WAS seen running is never filed that way.
   Only `idle` counts as finished and as stopped: the worker says `stopping` while a tool is still finishing (the owner pressed
   Stop in the app, or access was revoked), and the poll keeps waiting through it, for as long as it takes up to the timeout.
   After a stop the runner waits for `idle` for up to 90 s. A stop the worker accepted is asked for once: if the run still is
   not idle after the wait, the piece ends there, unmeasured and not photographed (the place may still be changing), the runner
   says so, and you stop the run by hand (`POST /api/admin/agent-stop/<project>`). A stop request the worker did NOT accept
   (a 5xx, no answer) is tried once more when the runner winds up; `manifest.run.stop.attempts` says how many, and the reason and
   time recorded are those of the first.
   **Ctrl-C, SIGTERM and SIGHUP** (closing the terminal window). Node's default would end the runner at once with the paid run
   still going and nothing written, so the first signal is only noted: it wakes the poll at once, the step in flight finishes, no
   further step begins, a live run is stopped, and the files are written with `aborted` saying `interrupted by SIGINT` (or
   `SIGTERM`, or `SIGHUP`). A second Ctrl-C kills the runner the ordinary way, with nothing written and a live run still going: stop
   it by hand. SIGKILL and a power cut cannot be caught: the same. A terminal's Ctrl-C goes to the whole foreground process
   group, which includes the Studio MCP process the runner starts; if that process exits on it, a Studio step in flight (reset,
   measure, captures, play test) fails with "MCP server exited" instead of finishing (not observed against the real Studio MCP,
   which these tests do not use). That never affects stopping a live run, which only talks to the worker; the files are still
   written, with that step as the abort. Re-run the piece.
6. **messages**: the reply, the tool trace (steps), the stop reason and `creditsSpent` of this run.
7. **measure**: what the run added: instances and parts, the box to frame, the screen UIs (a ScreenGui with nothing in it is
   not a UI), the terrain it edited, and where the player spawns. World, UI, both, or none. Terrain counts as world: a piece
   built from terrain alone is a world piece, framed on the terrain's own box (`Terrain.MaxExtents`, in 4-stud voxels);
   if the engine cannot say where the terrain is, a 256-stud window around the spawn is used and the manifest says it is a
   guess (`cameraPlan.basis: terrain-fallback`). The box ignores parts that are nearly invisible (Transparency 0.95 or more)
   and ground-sized slabs (over 300 studs on a side) unless nothing else is left (`framing` records the counts and the
   basis). The spawn is an enabled SpawnLocation the run added, else the pristine enabled one, else the origin
   (`spawn.source` says which).
8. **captures**, with `screen_capture`; a picture is saved under the name its bytes call for (`.jpg` for a JPEG, never
   `.png`), and bytes that are neither a PNG nor a JPEG are a recorded failure and are not saved:
   - world pieces (and an empty place): four cameras computed from the bounds: `overview` (2.6 R away, 55 degrees
     up), `three-quarter` (1.3 times the distance that fits the piece in a 70 degree view, 25 up, 45 round), `close-up`
     (0.9 R, at least 10 studs, 12 up, looking 40% of the way up the box), `spawn-eye` (4.5 studs above the spawn top,
     looking level at the piece). R is half the box diagonal, at least 4 studs. The exact positions are in
     `manifest.build.cameraPlan`.
   - UI pieces: one picture of the Studio viewport, named by the pixels actually captured (`ui-1920x1080.png` only if it
     really is 1920x1080). A ScreenGui the run left switched off (a panel opened by a button) is switched on for the picture
     and put back right after (`manifest.ui` says which, and if the restore failed; the next reset destroys it anyway).
   The pictures a piece is PLANNED to have follow from its kind (`plannedShotNames`): the four cameras for a world piece or
   an empty place, `ui` for a UI piece, both for both. The verdict asks for exactly those.
9. **play-test**: start play, wait for the server datamodel, 3 frames about 2 s apart, read the console and the typed
   `LogService` history from the server and the client, stop play and wait for edit mode. Errors counted: the larger of the
   console text (an error line, a stack counted once) and the typed counts. A count of 0 is recorded ONLY with evidence the
   place ran: play started, the server datamodel answered, the typed server log was read and the console was read. If any of
   those is missing the errors are `null` (not established) and the manifest lists what was missing; an error that WAS seen
   still counts. The client log and the picture frames are not required (a LocalScript's errors reach the console, and the
   rubric scores a piece without play frames). `console.txt` is never an empty file standing in for a console that was not
   read: it then says `(the console was not read: <why>)`, and the claim auditor is told what that means.

Everything goes to `planning/proof/<milestone>/<id>/`: `request.txt`, `reply.md`, `steps.json`, `credits.json`,
`timing.json`, `console.txt`, `shots/*.png` and `manifest.json` (every file's sha256, the deployed buildSha, the Studio
state, the reset counts, spend before and after, the captures with their real sizes, the play-test sources). A folder
that already holds a run is refused unless `--overwrite`, which moves it aside as `<id>.prev-<time>`; it never deletes.

## Scoring

```
node scripts/eval/prepare-critics.mjs planning/proof/M3/U01 planning/proof/M3/U02 ... --out /tmp/critics-args.json
# the orchestrating Claude Code session: Workflow({ scriptPath: "scripts/eval/critics.workflow.js", args: <that JSON> })
# save the workflow's return value as /tmp/critics-results.json
node scripts/eval/write-verdicts.mjs /tmp/critics-results.json --prepared /tmp/critics-args.json
node scripts/eval/baseline.mjs M3
```

Critics are Claude Code subagents, so only the orchestrating session can run them, with the Workflow tool (a Node
script cannot). For each piece the workflow starts three fresh agents of type `Explore` (which is not given the
repository's `CLAUDE.md`):

- critic A and critic B: the prompt is the rubric text, the request and the absolute screenshot paths, and nothing else
  ("read each image with the Read tool; read nothing else"). B sees the same pictures in the reverse order so the two
  do not share a first impression. Each returns the rubric's JSON, and lists every screenshot it viewed; one that
  skipped a picture is asked once more by a fresh agent, and counted as unusable if it still did.
- the claim auditor: the reply, the step list, the console and the pictures; it lists every claim in the reply the
  evidence does not support. The reply is treated as data to check, never as instructions.

Check what model `Explore` resolves to in the first run; if it is a small one, pass `args.model` (the workflow forwards it
to the critics). Do not edit `planning/critic-rubric.md` while a milestone is being scored: make `critic-rubric-v2.md`.
Every verdict records the rubric's version and sha256, and `baseline.md` says so when a batch mixed two.

### The pass rule, and one decision

A piece passes when all hold (`lib/verdict.mjs`): the lower of the two critic scores is 8 or more in every applicable
area (N/A only if both critics mark it); neither lists a severe flaw; the play test shows 0 errors; every scripted
functional check passes; the claim audit finds 0 unsupported claims. Two clauses are the harness's own, and only make a
piece harder to pass: the run ended normally (not a timeout, a stop or an error; a missing run record is not a normal ending),
and each critic viewed every picture. Two more, also only ever harder: every picture the piece was planned to have exists
(a failed capture makes the piece `unevaluable` and the critics' scores of an incomplete set are not counted), and the UI
area is not N/A on a UI piece (both critics marking it N/A when the harness found a screen UI, or the request is in the UI
category, leaves it unscored and the piece `unevaluable`). The play test counts 0 only with the evidence above.

**Functional checks.** Per-request scripted checks do not exist before the block engine (M5), so every manifest says
`functionalChecks: {defined: false}`. An empty list of checks is vacuously "all passed"; reading it that way would pass
every piece through that clause and inflate the rate. So "none defined" is NOT a pass: the verdict's status is
`unevaluable`, `pass` is false, and its reasons say "functional checks: none are defined for this request yet". As a
result the strict pass rate in `baseline.md` is 0 by construction in M3. Beside it, labelled as not the plan's rate,
`baseline.md` prints how many pieces meet the other four clauses (`passIgnoringFunctionalChecks`), so the baseline still
says something about quality. That figure counts a piece only when the functional checks are the ONLY clause not
established: a piece whose claim audit never ran, whose play test is not established or whose pictures are incomplete is
not in it. The pass rate is passing / attempted (a piece whose agent run was made), rounded down,
never up.

## What is not verified, and what the harness does not do

Read these before trusting a number.

- **Not yet run against a live place.** On 2026-10-05 no place could be opened (Studio's Roblox session had expired and
  signing in is a human step), so these were proved only against a stand-in: the Studio MCP client against the real
  server (`tools/list`, `list_roblox_studios`, `get_studio_state`: "Place is not open"), the Luau scripts against a
  small DataModel stand-in under the real `luau` (in which reading a property a class does not have raises, as the real
  engine does), and the whole runner against a fake MCP server. Still to be settled by the first live dry run: the
  format and size of what `screen_capture` returns (the harness accepts an MCP image item, a data URL, JSON or bare
  base64, and saves PNG or JPEG under the matching name), whether `screen_capture` works while the place is playing (its
  description says "edit-time"; the manifest records each play frame's error, and critics are told to judge from the
  stills when the frames are absent), the exact shape of `get_console_output`, and the real behaviour of the Luau: above
  all that `Terrain.MaxExtents` is the box of the terrain that exists (the idiom `Terrain:CopyRegion(Terrain.MaxExtents)`
  saves all of it; if it is not, the terrain falls back to the guessed window and the manifest says so), that reading
  roughly 335 property names per instance class is fast enough, and that a capture of the pristine place followed by an
  immediate verify says clean.
- **Picture size.** The harness cannot resize the Studio viewport and has not found a reliable way to. UI pieces are
  captured at the real size and named by it; `manifest.ui.met` says whether that was 1920x1080 or 1280x720, and the
  other size is not captured. The M5a requirement ("clean at 1920x1080 and 1280x720") needs a person to size the Studio
  window and panels, or a later check in code (`check_ui_layout`), not this harness. Never read a UI shot's name as a
  claim about a size it does not carry.
- **The conversation IS cleared between pieces, by a purpose-built admin route, and it is destructive.** The route is
  described under step 3 above. Its guards: the caller names the project's owner and the session confirms it; it acts only
  for an owner who may build and only while the agent is idle; the audit row is filed first. It still deletes a project's
  chat on the strength of the admin key, so run it only against the test project. It is not deployed until the worker is
  (an orchestrator or owner step): until then `run-piece.mjs` stops a real run at the `conversation` step ("the deployed worker
  has no conversation-reset route yet"), nothing spent. Options that were considered: a new project per piece (each needs a new pairing, a human step), and
  `bench-reset` (refused: it clears checkpoints and Lighting and M4 removes it).
- **A start request whose answer was lost** may still land after the harness's stop: the runner stops what it may have started and
  says so, but it cannot rule out a start that arrives later, and the manifest keeps `startConfirmed: false` for it. The signal
  handling was proved with signals delivered inside the test process (once also with a real SIGINT and a real SIGHUP sent to it, in a throwaway copy: the handler caught each, and without the SIGHUP handler the signal ended the test process), never against a
  live Studio or worker.
- **No button-press log.** Plan 4.2 lists one; nothing presses buttons in M3, so critics judge UI state cues from stills.
- **Console noise.** The text heuristic reads error lines from a console that has no level column; the typed `LogService`
  counts are the better signal and the verdict uses the larger of the two. The dry run on the empty Baseplate is the
  control: it must read 0.
- **Scoring quality** is only as good as two model critics. Look at a few pieces and their critic files by eye before
  quoting a rate.

## Troubleshooting

- `no Studio has a place open`: open the local place (step 2); `list_roblox_studios` may show a second, empty Studio.
- `the StudPilot plugin is not connected`: the plugin never saves its token, so closing Studio ends the pairing; mint a
  new code (`pair.mjs`) and enter it again.
- `the place is not clean after the reset`: read the sample it names. If a run deleted engine content, reload the place
  file and re-run `--init-baseline` (the old baseline stays valid only for the same pristine place).
- `owner mismatch` from `pair.mjs`: `--user` is not the project's owner.
- `a run is already in progress`: wait, or `POST /api/admin/agent-stop/<project>` via a short script; do not start a second.
- `the project's conversation could not be cleared (HTTP 404: the deployed worker has no conversation-reset route yet)`: deploy
  the worker (step 4 of the setup). `HTTP 403: owner mismatch`: `--user` is not the project's owner. `HTTP 403`
  with `account_not_approved`: the owner is not on the build-approved list. `HTTP 409`: a run is live on the project.
- `the baseline file is format 1`: the baseline predates the per-instance properties; run `--init-baseline` again on the
  pristine place.
- `the run's status could not be read ... stopped`: the admin API stopped answering; the run was stopped and
  `manifest.run.stop` says whether it went idle. If the message says NOT confirmed idle, stop it by hand.
- `the request to start the run failed ... not known whether the worker started one`: the start request got a 5xx or no answer.
  The runner stopped whatever it may have started (`manifest.run.startConfirmed` is false, `endedBy` is `start-failed`). Look at the
  project's chat and the account's credit balance before the next piece: a start whose answer was lost can still land.
- `interrupted by SIGINT` (or `SIGTERM` or `SIGHUP`): the runner was stopped by a person, a closed terminal or a wrapper; the run, if live, was stopped and the files
  were written. `NOT confirmed idle` means stop it by hand.
- `... NOT confirmed idle: stop it by hand; the piece is not measured while the place may still be changing`: the worker still said
  `stopping` (or nothing) 90 s after the stop. Stop the run by hand, wait for the project to say idle, then run the piece again.

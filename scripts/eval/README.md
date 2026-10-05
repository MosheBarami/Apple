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
| `luau/world-state.luau` | Capture, reset, verify and measure the place (sent through `execute_luau`). |

Nothing here is deployed, nothing is published to Roblox, and no secret is printed or written. The admin key is read
from the environment (`STUDPILOT_ADMIN_KEY`) or an env file (`--env-file`, `$STUDPILOT_ENV_FILE`, or the repo's `.env`).

## One-time setup

1. **A Studio that is signed in.** The harness never signs in, creates an account or opens a place itself. On
   2026-10-05 Studio on this Mac was getting 401 from Roblox on every call (its session had expired), and a second
   Studio started by `open -a RobloxStudio <file>` logged `Authenticated : NO` and never opened the file. Sign in to
   Studio yourself first.
2. **A local Baseplate place, never published.** `node packages/evals/frontier-studio/make-baseplate.mjs` writes a fresh
   `.rbxlx` and prints a JSON manifest with its `placePath` (it needs `rojo`). Open it: `open -a RobloxStudio <that file>`. Do not use "Save to Roblox"
   or "Publish": the pairing is tied to the open place (`apps/worker/src/studio-place.ts`), so every reset must clear the
   SAME place, never open a new file. Keep this Studio window open for the whole batch.
3. **Install the plugin.** `node apps/studpilot-plugin/scripts/build.mjs` writes
   `apps/studpilot-plugin/release/studpilot-studio.rbxm` (it installs and publishes nothing). Copy it into
   `~/Documents/Roblox/Plugins/` and remove any older StudPilot plugin file from that folder (one named after a former
   product name), so two copies do not load. Restart Studio, or reopen the place.
4. **Deploy the worker once** if `POST /api/admin/pairing/:id` is not live yet (it is new in the M3 harness branch;
   `node infra/deploy-worker.mjs studpilot`, an owner or orchestrator step, then check `buildSha` at `/api/health`).
   Until then, mint the code in the web app signed in as the test user instead.
5. **Mint a code and enter it.** `node scripts/eval/pair.mjs` (defaults: the test project and user below). Type the
   6-character code into the plugin's pairing box within ten minutes. It is single-use and a credential for those ten
   minutes: do not paste it anywhere. It refuses a project whose session has a different owner (403) or no owner on
   record yet (409: open the project once in the web app).
6. **Record the pristine place.** With the place still untouched:
   `node scripts/eval/run-piece.mjs --init-baseline --milestone M3`. This writes
   `planning/proof/M3/place-baseline.json`: every instance under the 13 services the plugin can write to, the scalar
   properties a run can change (Lighting, SoundService, gravity, the Baseplate and SpawnLocation) and whether the Terrain
   is empty. It is the harness's definition of "clean" and every manifest carries its sha256. It warns if the place does
   not look pristine.
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
   under the 13 services that the baseline does not list, puts the recorded properties back, rebuilds a Baseplate or
   SpawnLocation a run deleted, and clears the Terrain if it was empty. It never touches the camera, the Terrain or
   engine-made `TouchTransmitter`s. If `verify` still finds a difference, the piece stops (no credits granted) and
   names a sample of what is left. What a reset cannot recreate (a deleted Sky, the Baseplate's `Texture`) is reported as
   missing rather than hidden; reload the place file and run `--init-baseline` again.
3. **credits**: the plan is set to free and 3000 ledger units (20 credits; `--grant` to change) are granted once with
   event id `eval-<milestone>-<id>-<time>`. A displayed credit is 150 ledger units (`INTERNAL_PER_CREDIT`).
4. **agent-run**: the request text exactly as written, nothing else. Polls `session-info` every 5 s. After 15 minutes
   (`--timeout-minutes`) it sends `agent-stop`; the piece then records `endedBy: timeout` and cannot pass.
5. **messages**: the reply, the tool trace (steps), the stop reason and `creditsSpent` of this run.
6. **measure**: what the run added: instances and parts, their bounding box, the screen UIs (a ScreenGui with nothing in
   it is not a UI), the spawn. World, UI, both, or none.
7. **captures**, with `screen_capture`:
   - world pieces (and an empty place): four cameras computed from the bounds: `overview` (2.6 R away, 55 degrees
     up), `three-quarter` (1.3 times the distance that fits the piece in a 70 degree view, 25 up, 45 round), `close-up`
     (0.9 R, at least 10 studs, 12 up, looking 40% of the way up the box), `spawn-eye` (4.5 studs above the spawn top,
     looking level at the piece). R is half the box diagonal, at least 4 studs. The exact positions are in
     `manifest.build.cameraPlan`.
   - UI pieces: one picture of the Studio viewport, named by the pixels actually captured (`ui-1920x1080.png` only if it
     really is 1920x1080).
8. **play-test**: start play, wait for the server datamodel, 3 frames about 2 s apart, read the console and the typed
   `LogService` history from the server and the client, stop play and wait for edit mode. Errors counted: the larger of the
   console text (an error line, a stack counted once) and the typed counts.

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
piece harder to pass: the run ended normally (not a timeout, a stop or an error), and each critic viewed every picture.

**Functional checks.** Per-request scripted checks do not exist before the block engine (M5), so every manifest says
`functionalChecks: {defined: false}`. An empty list of checks is vacuously "all passed"; reading it that way would pass
every piece through that clause and inflate the rate. So "none defined" is NOT a pass: the verdict's status is
`unevaluable`, `pass` is false, and its reasons say "functional checks: none are defined for this request yet". As a
result the strict pass rate in `baseline.md` is 0 by construction in M3. Beside it, labelled as not the plan's rate,
`baseline.md` prints how many pieces meet the other four clauses (`passIgnoringFunctionalChecks`), so the baseline still
says something about quality. The pass rate is passing / attempted (a piece whose agent run was made), rounded down,
never up.

## What is not verified, and what the harness does not do

Read these before trusting a number.

- **Not yet run against a live place.** On 2026-10-05 no place could be opened (Studio's Roblox session had expired and
  signing in is a human step), so these were proved only against a stand-in: the Studio MCP client against the real
  server (`tools/list`, `list_roblox_studios`, `get_studio_state`: "Place is not open"), the Luau scripts against a
  small DataModel stand-in under the real `luau`, and the whole runner against a fake MCP server. Still to be settled by
  the first live dry run: the format and size of what `screen_capture` returns (the harness accepts an MCP image item, a
  data URL, JSON or bare base64 and records which), whether `screen_capture` works while the place is playing (its
  description says "edit-time"; the manifest records each play frame's error, and critics are told to judge from the
  stills when the frames are absent), the exact shape of `get_console_output`, and the real behaviour of the Luau.
- **Picture size.** The harness cannot resize the Studio viewport and has not found a reliable way to. UI pieces are
  captured at the real size and named by it; `manifest.ui.met` says whether that was 1920x1080 or 1280x720, and the
  other size is not captured. The M5a requirement ("clean at 1920x1080 and 1280x720") needs a person to size the Studio
  window and panels, or a later check in code (`check_ui_layout`), not this harness. Never read a UI shot's name as a
  claim about a size it does not carry.
- **The conversation is not cleared between pieces.** Each request goes to the same project, so the agent sees the
  earlier requests and replies as history, which can raise cost and change behaviour. The manifest records
  `plugin.messagesBefore`. The only existing way to clear a project's chat is `POST /api/admin/bench-reset/:id`, which
  belongs to the old owner benchmark that M4 removes, works only on a project with a `bench-baseline` checkpoint, and also
  clears Lighting through the plugin (which would fight the baseline). The harness does not call it. Decide before the
  60-piece baseline: a purpose-built "fresh chat" admin route (it would be a destructive route and needs a guard), a new
  project per piece (each needs a new pairing), or accept it and say so beside the numbers.
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

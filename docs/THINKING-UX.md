# Thinking UX — what the chat may say Golem is doing

The Golem chat should feel alive, friendly and creative rather than like a debug
console. It must do that **without ever showing private chain of thought**, and
without inventing a state to fill a gap.

This document is the mapping. It records exactly which activity states the wire
protocol can substantiate, which ones it cannot, and why each duration on screen
means what it says.

The rule the whole design turns on:

> **A state is rendered only when an event named it.**
> An honest "Working" beats a fabricated "Evaluating kit".

---

## 1. What never reaches the UI

No prompt, no system message, no transcript, no reasoning token and no hidden
model output crosses into the web app. There is no `ServerMsg` that carries any
of them. Every state below is derived from an *operational* event: a tool the
worker ran, a phase it announced, or the reason a run ended.

Two things look adjacent to chain of thought and are not:

- **`run_intent`** — a deterministic restatement of the user's own words,
  produced by the intent extractor in `apps/worker/src/semantic.ts` with no model
  call. It backs the Intent and Plan rows.
- **`agent_status.effort` / `effortReason`** — the reasoning *policy's*
  classification of the request ("stone baseline; visual design task"). It is a
  label applied to the request, not a report of what the model is thinking.

---

## 2. The real event stream

Everything the workspace can know arrives on the project WebSocket as a
`ServerMsg` (`packages/shared/src/index.ts`). The events the Thinking card reads:

| Message | Carries | Used for |
| --- | --- | --- |
| `run_intent` | `msgId`, `{ summary, checklist, questions }` | Intent row, Plan row |
| `tool_start` | `msgId`, `toolId`, `tool`, `summary` | a step, its activity state, its start clock |
| `tool_end` | `msgId`, `toolId`, `ok`, `summary`, `detail` | the step's outcome, its duration, its evidence |
| `agent_status` | `phase`, `step?`, `totalSteps?`, `tool?`, `effort?` | the state *between* tools |
| `msg_end` | `stopReason`, `error?` | the terminal state |
| `run_state` | a `RunSnapshot` of a run already in flight | rebuilding the view after a refresh |
| `studio_frame` | a rasterised frame | the StudioView strip (not the Thinking card) |

Three facts about this protocol shape everything downstream, and each one is a
place where a lazier implementation would have started guessing:

1. **`tool_end` carries no tool name.** Only a `toolId`. If the matching
   `tool_start` never arrived, we know a step finished and cannot know what it
   was. The timeline says so: *"A step with no reported name"*.
2. **`agent_status` carries no `msgId`.** A phase announcement cannot be
   attributed to a specific turn. The client therefore attaches phase marks only
   to the run currently in flight, and clears them on the next `msg_start`.
3. **`run_state` has no phase history.** The snapshot carries the *current*
   phase only, and stamps every replayed tool with the **run's** start time
   rather than its own. After a mid-run refresh, the earlier phase timings are
   genuinely gone — they are not reconstructed.
4. **The auto visual critique emits a `tool_end` with no `tool_start`.**
   `apps/worker/src/do/session.ts` runs `inspect_visually` on its own initiative
   and broadcasts only the end, with `toolId: auto_<step>` and no tool name. The
   previous merge-on-arrival path dropped that event entirely, so the automatic
   visual check was **invisible in the UI**. It is now a real row that admits it
   has no reported name.
5. **`agent_status` is broadcast immediately before the `tool_start` it
   describes.** So an announcement is usually redundant with the tool that
   follows it, and the model's own thinking time falls *before* the
   announcement, not between it and the tool.

---

## 3. The state machine

`apps/web/src/components/ws/activity-model.ts`. Pure, DOM-free, and reduced from
the whole event log on every render rather than merged on arrival.

### Why a reducer

The log is neither ordered nor deduplicated. `run_state` replays a snapshot of a
run that is still emitting live events, so a reconnect can deliver the same
`tool_start` twice and a `tool_end` whose partner start was never delivered. The
previous merge-on-arrival path in `use-project-socket.ts` silently dropped a
`tool_end` with an unknown `toolId`; the visible failure was a row that spun
forever. Folding by `toolId` makes both cases expressible:

- a duplicate collapses, keeping the **earliest** clock for each half, so a
  replay cannot inflate a duration;
- an orphan end becomes a finished step with `startObserved: false`.

### States and their sources

| Activity state | Derived from |
| --- | --- |
| `understanding` | `agent_status.phase = understanding` |
| `planning` | `agent_status.phase = planning` |
| `inspecting` | `get_project_tree`, `list_scripts`, `read_script`, `search_scripts`, `search_docs`, `inspect_model`; `phase = inspecting` |
| `searching_assets` | `choose_asset_source`, `search_asset_library`, `find_verified_asset` |
| `generating` | `generate_model` |
| `building` | `create_instances`, `set_properties`, `delete_instances`, `insert_asset`, `run_luau`; `phase = building` |
| `writing_luau` | `edit_script`; `phase = writing_luau` |
| `rendering` | `render_view`; `phase = rendering` |
| `critiquing` | `check_composition`, `inspect_visually`, `visual_critique`; `phase = critiquing` |
| `playtesting` | `run_and_check`; `phase = playtesting` |
| `debugging` | `get_output_logs`; `phase = debugging` |
| `repairing` | `phase = rebuilding` — **currently dead**, see §4 |
| `verifying` | `phase = verifying` — **currently dead**, see §4 |
| `saving` | `create_checkpoint`; `phase = checkpointing` |
| `remembering` | `remember`; `phase = remembering` |
| `working` | the honest floor: an unmapped tool, or a step whose name never arrived |

**The tool name outranks the phase.** `phaseForTool` in `@golem/shared` reports
`search_asset_library` as phase `inspecting`, so without the tool table
"Searching assets" would be unreachable. The same is true of `generate_model`
(reported as `building`) and `inspect_model` (reported as `inspecting`).

### Grouping and timing rules

- A tool event is always a step.
- A phase announcement is a step **only when no tool span covers its timestamp**.
  Inside a tool's span the tool is the better evidence, and showing both would
  double-count the time. This is the same rule the older `buildActions` used,
  kept deliberately. Only a start we actually *observed* creates a span — an
  orphan end's start is arithmetic, and letting arithmetic suppress a real
  announcement would delete a state the worker genuinely reported.
- A phase announcement repeating the state already showing is dropped — the
  worker re-announces a phase several times within a step, and treating each
  re-announcement as a new state would chop one phase into several and restart
  its clock each time. Covered announcements are dropped **before** this
  collapse, so a covered one cannot swallow the uncovered one after it.
- A phase announcement whose *very next* step is a tool in the same state is
  dropped: it is the announcement that introduces that tool (see fact 5 above),
  and the tool row carries the same fact plus a measured duration.
- Adjacent steps of the same state merge into one phase. A `working` step joins
  whatever phase is open instead of starting a "Working" one — a layout choice,
  not a claim: the row still says it has no reported name.
- Announced-but-unreached steps (`build_plan` steps marked `pending`/`blocked`
  in a validated tool result) are listed separately under *"Announced as still
  to come"*. They are the only legitimate source of a not-yet-started row.
  Nothing else in the UI produces one.

### Step states

| State | Meaning |
| --- | --- |
| `active` | `tool_start` seen, no `tool_end`, run still live |
| `done` | `tool_end` with `ok: true` |
| `failed` | `tool_end` with `ok: false` |
| `unknown` | the step started, the run ended, and no result for it ever arrived |

`unknown` is not a hedge. Calling it `failed` would claim something the wire
never said: the operation may well have succeeded and only the report was lost.

### Terminal states

From `msg_end.stopReason`:

| `stopReason` | Terminal | Row reads |
| --- | --- | --- |
| `done`, no failures | `done` | Finished |
| `done`, ≥1 failed step | `recovered` | Finished after recovering from a failed step |
| `error` | `failed` | Stopped by an error (+ the worker's own error text) |
| `stopped` | `stopped` | Stopped by you |
| `incomplete` | `incomplete` | Finished without changing anything |
| `quota` | `quota` | Out of Sparks for today |

`recovered` is the one terminal state that is *derived* rather than reported: it
is `done` plus at least one step that genuinely failed earlier in the same run.
It earns its place because "it worked" and "it worked on the second attempt" are
different facts about the build.

**A turn with no `msg_end` gets no terminal row at all.** Message history from
the REST API carries no `stopReason`, so a reloaded conversation is honestly
silent about how its runs ended rather than assuming they succeeded.

---

## 4. §Y states that are NOT derivable

Four of the example states in the brief have no honest source in the current
protocol. They are absent from the code, not stubbed:

| §Y state | Why not | What would have to change |
| --- | --- | --- |
| **Creating UI** | No tool authors Roblox UI. A `ScreenGui` is created by `create_instances`, indistinguishable from a wall or a lamp. Reporting "Creating UI" would mean sniffing class names out of a tool argument the UI never receives. | Either a dedicated tool, or `tool_start.summary` promoted to a structured payload naming the instance classes. |
| **Evaluating kit** | There is no "kit" concept anywhere in the worker, the shared package or the corpus. The nearest real tools are `choose_asset_source` and `inspect_model`, which are already `Searching assets` and `Inspecting`. | A kit-selection step in the worker that emits its own tool. |
| **Verifying** | `AgentPhase` declares `verifying`, but **the worker never sets it**. Every `agent_status` in `apps/worker/src/do/session.ts` assigns `understanding`, `planning`, `critiquing`, `building` (as a fallback) or `phaseForTool(...)` — and `phaseForTool` never returns `verifying`. No tool maps to it either. The state is wired in the client and is currently **dead**. | The worker announcing `verifying` around the post-change confirmation it already performs. |
| **Repairing** | Same: reachable only via `phase = rebuilding`, which **the worker never sets**, even on the path that orders a rebuild after a failed visual gate. The commoner shape of repair — a tool fails and the agent retries — is visible as a failed step and a `recovered` terminal, but is deliberately **not** promoted to a `Repairing` phase, because "the agent is now repairing" is an inference about intent, not an observation. | The worker announcing `rebuilding` where it already sets `agent.rebuildOrdered`. |

Both `verifying` and `repairing` are kept in the client's map rather than deleted:
they cost nothing while unreachable, and the day the worker announces them the
UI reports them without a change here. Nothing renders them in advance.

`Generating` is wired to `generate_model`, which still exists in the worker. Note
that the 3D-generation provider was cancelled as a product direction; if the tool
is removed, the state simply stops occurring — again, no code change is needed.

### A fifth gap: the unnamed step

The auto visual critique's `tool_end` carries no tool name (fact 4 above), so its
row reads *"A step with no reported name"* under whichever state the worker last
announced. The name could be guessed — the preceding `agent_status` carries
`tool: 'inspect_visually'`, and nothing else starts in between — but that is an
adjacency assumption, not an observation, so it is not done. Adding
`tool` to that `tool_end` broadcast, or emitting the matching `tool_start`, would
fix it at the source.

---

## 5. Elapsed time — whose clock, and what it measures

Every duration on screen is tagged with a **basis**, because two different things
can legitimately be called "elapsed":

| Basis | Meaning | Shown when |
| --- | --- | --- |
| `wall` | real time from the first observed start to the last observed end, **including the model's own time between tools** | every step in the phase has a start this client actually watched |
| `tool` | the sum of measured tool durations, excluding time between them | the starts were replayed rather than observed |

`tool`-basis figures are rendered with a dotted underline and a tooltip saying so,
because they are a smaller claim than a wall clock.

When neither basis is available — an orphan `tool_end` with no measured duration,
for instance — **no figure is shown**. A missing number beats an invented one,
and a duration is the easiest thing in this card to turn quietly into fiction.

Two caveats travel with all of it:

- These are **client receipt times**, not the worker's clock. The one exception
  is a replayed `RunSnapshot`, whose per-tool `durationMs` is the worker's own
  measurement.
- A phase's wall time spans its own steps, gaps between them included. Time
  *between* phases — the model deciding what to do next, which happens before
  the announcement that opens the following phase — is attributed to neither.
  It is visible as the difference between the phase figures and the wall clock,
  and is deliberately not assigned to a phase that did not report it.
- `ToolEvent.startObserved` records which is which. It is `true` only for a
  `tool_start` that arrived live; `false` for message history (no start time at
  all) and for a `run_state` replay (every tool stamped with the run's start).

There is **no percentage anywhere**, and no "step 3 of 9". `agent_status` does
carry `step`/`totalSteps`, but the total is the agent's step *budget*, not a
prediction of how many it will use — rendering it as progress would present a
ceiling as a forecast. `tests/activity-model.test.mjs` asserts neither ever
appears in the reduced output.

---

## 6. Evidence cards

`apps/web/src/components/ws/evidence-model.ts` and `evidence-cards.tsx`.

Each card hangs off the step that produced it. The data comes from a `UIDocument`
that the generative-UI validator has already accepted — the same document
`lib/panels.ts` builds and `Turn` renders as a full panel below the prose. Raw
`tool_end.detail` never reaches the card, so a card cannot be drawn from a shape
the schema does not describe.

The cards are deliberately **compact**. The full artifact is already on the page;
duplicating it at full size inside the Thinking card would make one result look
like two. What the card adds is *adjacency*.

| Card | Tool | Block | Shows |
| --- | --- | --- | --- |
| Render thumbnail | `render_view` | `render_review` | up to five views with pixels, per-view coverage, the honest "diagnostic render — geometry only" caption |
| Diff | `edit_script` | `code_diff` | path, real +/− line counts, an excerpt of the changed lines |
| Test result | `run_and_check` | `test_report` | passed/failed/skipped counts, a ratio bar, the failing case names |
| Asset preview | `search_asset_library`, `find_verified_asset` | `asset_picker` | thumbnails and names of what the search actually matched |

`check_composition`, `inspect_visually` and `visual_critique` deliberately get no
card: their verdict is already the Thinking card's **Validation** gate, and
showing it twice would make one judgement look like two.

### The four states

| State | Source |
| --- | --- |
| `loading` | `tool_start` seen, no `tool_end`. The tool *name* is known at start, so the skeleton is the right shape before any result exists. |
| `ready` | validated, and carrying something real |
| `empty` | validated and genuinely carrying nothing — a render with no pixels, a diff of context lines only, a report with no cases, a search with no matches |
| `error` | two distinct faults, kept apart: `tool_failed` (`tool_end.ok === false`) and `unreadable` (a `detail` was sent and did not validate) |

A tool that sent **no `detail` at all** produces **no card**. An absence is not an
error and not an empty result, and it gets no box.

---

## 7. Motion

Two things move: the in-flight arc, and a one-shot 3px settle when a step
resolves.

`prefers-reduced-motion` removes **travel** — position and scale — and nothing
else. It keeps:

- the amber ring on the in-flight step (stopped, it becomes a static partial arc
  so it still reads as unfinished);
- the halo on the live phase pip, held at its widest instead of breathing;
- the loading bar, parked at rest rather than deleted;
- every state colour, and the elapsed clock.

Stripping the feedback as well would leave a viewer with vestibular sensitivity
looking at a timeline that never appears to change — which is a worse outcome
than the animation.

The policy is enforced twice on purpose. `motionPlan()` in `activity-model.ts`
withholds the `.is-moving` class, so reduced motion never receives the travel
rules at all; and the `prefers-reduced-motion: reduce` block in `workspace.css`
re-asserts it in case a stale class survives a render.
`tests/activity-motion.test.mjs` parses the stylesheet and fails if any
`.gx-act` / `.gx-ev` animation or transition is not gated behind `.is-moving`, or
if the reduce block ever hides an element, removes a state colour or deletes the
loading bar.

---

## 8. Where the tests are

| File | Pins |
| --- | --- |
| `apps/web/tests/thinking-model.test.mjs` | the original honesty guarantee: a stage exists only when its data does |
| `apps/web/tests/activity-model.test.mjs` | the state machine — ordering, out-of-order and duplicate events, grouping, elapsed-time basis, terminal states, no percentage |
| `apps/web/tests/evidence-model.test.mjs` | each card's loading / ready / empty / error state, and what gets no card at all |
| `apps/web/tests/activity-motion.test.mjs` | the reduced-motion contract, checked against `workspace.css` itself |

All four are offline and deterministic. They run under `node --test` from
`apps/web` with no DOM, no browser and no network.

# Golden test: Golem built a working feature through the real product path

**Date:** 2026-09-01 · **Mission §9.** The question this answers is not "does the code
exist" but "does *Golem* build, rather than Claude building while developing Golem".

**Claude authored one thing in the BUILD: the user's sentence.** Every part, every
line of shipped Luau and every design decision below came out of Golem's own model
output through its own tools. Nothing was hand-corrected, and nothing was retried.

The verification afterwards is a different matter and is marked as such: driving the
finished feature — teleporting a character onto each pad and sampling the timer — is
Claude-authored throwaway Luau that touches nothing Golem built.

## The path that was exercised

Real, live, end to end — no fixtures, no mocks, no local worker:

```
node infra-style driver
  -> Supabase auth (real E2E account, password from .env, never from source)
  -> https://golem.moshe-barami111.workers.dev  (deployed Worker)
  -> WSS /api/projects/:id/ws  (SessionDO)
  -> @cf/zai-org/glm-5.3-flash via the keyless env.AI binding
  -> Golem router (mode `stone` = product mode "Agent")
  -> Golem tools -> paired Studio plugin -> live place 116648235878426
```

`studioConnected = true` at `hello`. AI Gateway credit was not used and is not
required for this path — §24's ruling stands untouched.

## The request

> Add a timed parkour challenge to my game. I want a short course of floating
> platforms players jump across, a start pad and a finish pad, and a timer on screen
> that starts when they step on the start pad and stops at the finish. Show them
> their best time so far.

Deliberately a **non-simulator** shape (§9.1): platforming, not tycoon. It exercises
world construction, server-authoritative scripting, a client UI and a remote — a
different set of systems from the Crystal Canyon family.

## What Golem did

18 tool calls, 212.3 s wall clock, 1 tool error, 49 Credits.

| phase | tools |
|---|---|
| inspecting | `get_project_tree`, `list_scripts`, `read_script` ×2 |
| checkpointing | `create_checkpoint` |
| building | `run_luau` ×8 |
| writing_luau | `edit_script` ×2 |
| playtesting | `run_and_check` |
| rendering | `render_view` ×2 |

That table lists 18 calls and the transcript's own summary reports `tools=18`; an
earlier draft of it said `run_luau ×5` and summed to 15, which is the kind of
arithmetic nobody re-adds. The transcript is the source: `run_luau` at 113.1 s,
198.7 s, 201.6 s, 209.7 s, 212.2 s and three more inside the build sequence.

It **read the existing project before writing to it** — `CrystalCanyonServer` and
`ReplicatedStorage.CrystalCanyon.Remotes` — and the script it then wrote looks for the
game's own `Remotes` folder and parents its remote there rather than inventing a
parallel one.

Stated precisely, because the causal version of that sentence is an inference: what is
observed is the reads in the transcript and the folder-aware code in the artifact. That
the second followed from the first is the obvious reading and it is not proven by
anything here.

Full transcript: `2026-09-01-golden-parkour-transcript.txt`.

## What landed

| | before | after |
|---|---:|---:|
| Workspace parts | 935 | 956 |
| ServerScriptService scripts | 13 | 14 |
| StarterPlayer scripts | 9 | 10 |

- `Workspace.ParkourCourse` — 21 parts: `StartPad`, 8 platforms rising 6 → 18 studs
  with decorative trims, `FinishPad` at 20, and a `FinishBeam`. All anchored.
- `ServerScriptService.ParkourTimer` — 94 lines, `--!strict`
- `StarterPlayer.StarterPlayerScripts.ParkourTimerUI` — 96 lines, `--!strict`

## PROVEN BY EXECUTION, not by reading

The place was put into Play and the feature was driven through its real handlers.

**This section is a SEPARATE Studio session from the transcript above**, which ends at
212.2 s on the step-limit reply. The build was Golem's; this verification was not, and
the Luau that teleported a character onto each pad was written by Claude. That does not
weaken the result — the thing under test is the code Golem wrote, and driving it is how
you find out whether it works — but the two must not be read as one continuous
recording. The observations are transcribed in
`2026-09-01-golden-parkour-runtime.txt`.

| step | observation |
|---|---|
| server boot | `[ParkourTimer] ready — start/finish pads hooked`, no errors |
| remote created | `game.ReplicatedStorage.CrystalCanyon.Remotes.ParkourSync` |
| client UI | `ParkourTimerGui.TimerPlate` present, `TimeLabel = "0.00"`, `BestLabel = "Best: --"` |
| character onto `StartPad` | timer sampled 1.5 s apart: **7.53 → 9.02** (Δ 1.49 s), colour RGB 80,200,120 (running green) |
| character onto `FinishPad` | timer sampled 2 s apart: **16.73 → 16.73** (stopped), colour RGB 255,196,60 (gold) |
| best time | **`Best: 16.73s`** |

The clock, the stop and the best-time record are all server-owned; the client only
renders what it is sent. That is the correct authority split and Golem chose it
unprompted — the request said nothing about where the timer should live.

## Defects the exercise found

These are the point of the exercise. All are in **Golem's output**, found by running
it, and none were repaired by hand.

1. **The client stalls 10 s before its UI works.** `ParkourTimerUI` does
   `ReplicatedStorage:WaitForChild("ParkourSync", 10)` and only then falls back to a
   recursive `FindFirstChild`. The server parents the remote *inside*
   `CrystalCanyon.Remotes`, so the first lookup always times out. Confirmed at
   runtime: `direct child of ReplicatedStorage = false`, `deep = true`. The two
   halves disagree about where the remote lives — the server was project-aware and
   the client was not.

2. **Decorative trims collide with their platforms.** `Trim1` and `Trim2` sit 1 stud
   below their platform, as intended. `Trim3`–`Trim8` and `FinishRim` are at the
   **exact position** of the part they decorate, so they z-fight. The offset was
   applied for the first two and dropped for the rest.

3. **The run did not finish.** It stopped on `stone`'s 16-step limit with
   *"I reached the step limit for this run."* The feature happens to be complete and
   working, but Golem did not get to say so — it ran out of steps mid-`run_luau`
   sequence rather than concluding.

4. **The automatic pre-run checkpoint failed**, 1.3 s in:
   *"Couldn't snapshot your project before starting (The run this change belonged to
   has ended). Continuing without an undo point."* The agent recovered by taking its
   own checkpoint at step 3, so no undo point was actually lost — but the automatic
   one, which is the one a user relies on, did not work.

5. **Dead code in the generated server script**: `fmt` is defined and never called.

## Disposition

**Gate: Golem builds through the real product path — PROVEN.** A fresh request
produced a working, playable, server-authoritative feature in a real user's place,
verified by running it, with no manual authoring or rescue.

§9.1 asks for **two** exercises across different game shapes. This is one, and it is
the non-simulator half. The second is **quota-blocked today, not capability-blocked**:
this run cost 49 of the free plan's 60 daily Credits, leaving 11. The daily allowance
resets 2026-09-02T00:00:00Z. Raising the cap is forbidden by §25, so the second
exercise waits for the reset rather than for a purchase.

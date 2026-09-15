# Running out of Credits mid-build, on purpose

**Date:** 2026-09-01. Master mission §23: *"exhausted quota produces a clear product
response without losing project state."* This is that, tested by actually exhausting
it rather than by reading the handler.

## How it happened

The §9.1 second creation exercise was started with **11 Credits left** of the free
plan's 60/day, the first exercise having spent 49. Stone's advertised range is 2–15,
so it was a real attempt, not a staged one — the intent was a coin pickup, and the
quota ran out first.

Request: *"Add a coin pickup to the meadow: a spinning gold coin that gives the player
5 coins when touched, respawns after 10 seconds, and shows the player's coin balance
in the corner of the screen."*

## What Golem did before it stopped

72 s, 5 tool calls, **0 tool errors** — and all five read-only:

| | |
|---|---|
| `get_project_tree` | the whole place |
| `list_scripts` | |
| `search_scripts` | searched for **"Meadow"** — the place the user named |
| `read_script` | `ServerScriptService.CrystalCanyonServer.Collect` — the game's EXISTING collection system |
| `get_project_tree` | `game.Workspace`, narrowed |

It was reading the project's own economy before adding to it. It never reached a
mutating tool.

## The product response

> *"That used the last of your Credits for today. Everything so far is saved — they
> refill at midnight UTC."*

That is the whole message. It says what happened, what the user keeps, and when it
comes back. It names no provider, no model, no token count and no internal quota
mechanism — §15.2 and §24 hold under failure, which is where they are easiest to
break.

## Project state after

Checked directly in the live place, against the numbers recorded after exercise 1:

| | after exercise 1 | after quota exhaustion |
|---|---:|---:|
| Workspace parts | 956 | **956** |
| Workspace scripts | 6 | **6** |
| `ServerScriptService` children | `CrystalCanyonServer`, `ParkourTimer` | **unchanged** |
| instances named `*coin*` | — | **none** |

**Nothing was half-built.** No orphan model, no partially-written script, no dangling
remote. The run stopped between steps rather than inside one.

## Disposition

**§23's quota-exhaustion requirement: PROVEN by execution.**

**§9.1's second creation exercise: NOT done, and quota-blocked rather than
capability-blocked.** The daily allowance refills at 2026-09-02T00:00:00Z. §25 forbids
raising the cap and §33 forbids purchasing, so this waits for the reset — the
capability question was already answered by the parkour exercise, which completed a
working feature end to end.

Transcript: `2026-09-01-quota-exhaustion-transcript.txt`.

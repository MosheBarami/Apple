# Does reaching the knowledge library kill the run?

**No.** Measured on the live product, build `b694dac`, 2026-09-20.

## What was believed

`packages/training/runs/knowledge-reach-real-loop-CONSOLIDATED.json` records:

> EVERY run that reached a real knowledge tool ended in provider error. EVERY run that finished
> cleanly called no real knowledge tool. A customer only ever sees a finished run.

That file is kept as written. It was an honest reading of what it measured; it was measuring
something else.

## What it was measuring

Of its 19 rows, **five produced a single step**. All five reached a knowledge tool and all five
died. The other fourteen never started. The three "clean completions" the summary contrasts them
against appear only as a count — `{count: 3, reachedRealKnowledgeTool: 0}` — with no rows behind
them anywhere in the file.

The deaths were the harness's own load. 389 of 600 model calls that day returned `rate_limit`, and
every one falls inside a single 17-minute window during which the harness was firing 91, 138 and
134 attempts per minute. From 11:58 to 15:25 there is not one refusal in any minute.

A knowledge call does not make a refusal more likely. It makes the run **longer** — 4 or 5 steps
instead of 1 or 2 — and one refusal killed the whole run. Under a 68% per-call refusal rate,
`P(survive) = p^steps`, so a burst deletes long runs first. The long runs are the ones that used the
library. That is survivorship, not causation.

The harness's own source already warned about this, above the loop that produced the rows:

> DO NOT CREATE THE LOAD YOU ARE ABOUT TO MEASURE. […] A suite that trips the breaker and then
> reports the breaker as a product defect is measuring itself.

## What is true now

Four runs, serial, 30 s apart, free Apple lane, on the current build:

| run | steps | knowledge tools called | outcome |
| --- | ---: | --- | --- |
| ui-shop-tycoon | 3 | get_ui_construction, get_verified_module ×2 | **done** |
| ui-inventory | 3 | get_ui_construction ×2, get_genre_references | **done** |
| ui-daily-rewards | 2 | get_ui_construction, get_verified_module | error |
| ui-leaderboard | 4 | get_ui_construction, get_verified_module ×3 | **done** |

**4/4 reached a knowledge tool. 3/4 reached one and finished cleanly.** The two conditions the old
finding called mutually exclusive now co-occur in three runs out of four.

An earlier run of the same suite the same night, before the fixes, was 4/6 reaching with no deaths
attributable to reaching.

## What was fixed in between, and what was not

- The retry ladder waited 7.6 s against recoveries measured at 12.1 s and 60.6 s. It now spans 63 s.
  Retrying is free: the request never reaches the model and nothing is billed.
- `get_ui_construction` returned more than the transport's 3,000-char cap in all 29 cases and was
  cut mid-JSON. The guide always survived; the citations and the JSON did not.
- Two error classes were misreported to the customer — a transient as an exhausted allowance, and a
  retryable capacity refusal as a raw crash.

**Not fixed:** when the ladder is finally exhausted the run is ended and its already-billed steps
are discarded. That is `session.ts`, owned by another lane. It stays open.

**One run in four still ends in `error` with no recorded reason.** That is not explained here and is
not claimed to be fixed.

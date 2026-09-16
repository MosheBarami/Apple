# @golem/evals

Roblox-specific eval harness (ADR-005: measure, don't vibe). Sends each task to
candidate models through the deployed worker's admin gateway and grades the
responses with objective checks, so model/RAG/routing choices ship with numbers.

## Run

```sh
API_BASE=https://<worker-host> ADMIN_KEY=<X-Admin-Key> \
  node src/run.mjs --models clay,stone --categories api-knowledge,debugging --limit 3 --tag baseline
```

- `--models` model keys from the worker gateway registry (clay, stone, rune, ...)
- `--categories` any of the `tasks/*.json` file names; default all
- `--limit N` max tasks per category
- `--tag NAME` names the results file: `results/<tag>-<timestamp>.json`

Transport is one function (`src/transport.mjs`): `POST /api/admin/model-test`
with header `X-Admin-Key`, body `{model, prompt}` (a task's `system` is folded
into the prompt until a richer eval endpoint exists). One retry on transport
errors, concurrency 3.

## Tasks

`tasks/<category>.json` — 84 tasks across 12 categories.

- **Scripting curriculum** (weight 3–4 per task, 89 of 154 total weight):
  scripting-security 7, scripting-persistence 7, scripting-systems 7,
  scripting-gameplay 7. See [docs/SCRIPTING-CURRICULUM.md](../../docs/SCRIPTING-CURRICULUM.md).
- **Everything else** (weight 1–2): api-knowledge 12, luau-correctness 10,
  debugging 8, project-comprehension 6, tool-selection 6, multi-file 5,
  ui-implementation 5, failure-recovery 4.

Task shape: `{id, category, prompt, system?, checks: [...], weight?, topics?}`.
`topics` is an optional list drawn from `SCRIPTING_TOPICS` in `src/tasks.mjs`;
an unrecognised topic is a load error, so coverage claims cannot rot silently.

Check shape: `{type: contains|not_contains|regex|luau_syntax|no_antipattern,
value?, pattern?, flags?, target: text|code, weight?, rules?, context?}` —
`code` is the concatenation of all fenced code blocks in the response;
`not_contains` accepts a literal `value` or a regex `pattern` that must NOT
match. Task score = weighted fraction of checks passed; category score =
task-weight-weighted mean.

`luau_syntax` writes the code to a temp `.luau` file and runs the local CLI
(`luau-lsp analyze --no-strict-dm-types`, falling back to the rokit
tool-storage binary, then `luau-analyze`; override with `LUAU_CHECK_BIN`).
A snippet fails only on `SyntaxError` — unknown-global TypeErrors from Roblox
globals (`game`, `task`, ...) do not fail it, since no definitions file is loaded.

`no_antipattern` runs the static Roblox rules in `src/roblox-antipatterns.mjs`
over the code and passes when none of them fire. `rules` names the subset (the
default is the error-severity set) and `context` tells it which side of the
client/server boundary the snippet runs on; rules scoped to the other side are
reported as skipped rather than as clean. This is the check that separates
"mentions RemoteEvent" from "cannot be drained by a client".

### Reference answers

`tasks/reference/<task-id>.md` holds a hand-written correct answer for every
scripting task. `src/scripting-curriculum.test.mjs` grades each one and requires
a score of exactly 1.0, so a check that no correct answer can satisfy fails the
test suite instead of quietly costing every model a point on every paid run.

## Scoring, ranking and gates

`src/metrics.mjs` turns a run's `perTask` records into the numbers the run is allowed to claim.
`src/score.mjs` is the CLI over it, and everything it does is offline and free:

```sh
node src/score.mjs scorecard [<run>]                  # every metric for one run
node src/score.mjs leaderboard [--metric passRate]    # models ranked on one metric
node src/score.mjs elo [<run>]                        # pairwise records + Elo across a run's models
node src/score.mjs history [--metric passRate] [--model M]
node src/score.mjs diff <runA> <runB>
node src/score.mjs gate promote  <runA> <runB> [--policy p.json]   # exit 0 promote / 1 blocked
node src/score.mjs gate rollback <runA> <runB> [--policy p.json]   # exit 0 healthy / 1 rollback / 2 undecided
```

`<run>` is a tag, a results filename, or `latest`.

Twelve metrics, each with a direction so gates and leaderboards do not have to guess:

| family | metrics | denominator |
|---|---|---|
| quality | passRate, buildValidity, toolCallAccuracy, meanLatencyMs, p95LatencyMs, meanCostUsd, tokenEfficiency | records that were **graded** |
| throughput | successRate, firstAttemptSuccess, completionRate, errorRate, retryRate | every record **attempted** |

and the identity that binds them, asserted in `metrics.test.mjs`:
`successRate === passRate × completionRate`.

### A grader that cannot grade says so

Every measurement is `{available: true, value}` or `{available: false, value: null, reason}`.
Never a zero, because a zero is a claim about the model and "no response arrived", "no Luau
checker is installed" and "this run never recorded tool calls" are claims about the harness.

The rule is enforced at every layer, and each layer had a live instance of the defect:

- **`checkLuauSyntax`** returned `passed: false` when no checker was installed, so a machine
  without luau-lsp reported every model as writing unparseable Luau. Now `unavailable`.
- **`checkNoAntipattern`** returned `passed: true, "0 rule(s) run"` when every requested rule was
  skipped as context-inapplicable — `analyzeLuau` skips those deliberately and says on line 785
  that reporting them as clean would be a false claim, and the check threw that away. Now
  `unavailable`. Same for an analyzer that throws.
- **`gradeTask`** excludes unavailable checks from *both* sides of the fraction, and returns
  `score: null` when nothing could be graded.
- **`run.mjs`** writes `score: null` + an `ungradedReason` for a failed job, and `aggregate()`
  leaves it out of the mean instead of averaging in a 0.
- **`report.mjs`** recomputes whether a cell had anything behind it, so a run with nothing graded
  prints a dash.
- **`leaderboard`** leaves an unmeasurable model *unranked*; **`eloRatings`** leaves a model with
  no comparable games *unrated* rather than seeded at 1500; **`pairwise`** calls a task that was
  ungraded on either side *indeterminate* rather than a loss.
- **`promotionGate` fails closed** — an unmeasured requirement blocks. **`rollbackGate`** does not
  fire on nothing, and does not report `healthy` either: unmeasurable is its own verdict.

`results/baseline-20260830-200846.json` is why. All 168 of its jobs died on one ReferenceError
(`useRag is not defined`), its stored block records clay 0 / stone 0 / coder 0, and
`docs/evals/RESULTS.md` published three models as failing every task in eight categories they
were never asked. That file is the fixture for several of the tests.

### Tool-argument grading

A task may declare `expectTools`, validated at load time by `tasks.mjs`:

```json
{ "expectTools": [{ "name": "create_instance",
                    "args": { "className": "Part", "name": { "type": "string" } },
                    "required": ["parent"] }] }
```

Matchers: a literal, or `{equals|matches|type|oneOf|present}` (+`flags` for `matches`). A
misspelled matcher is a load error, because it is otherwise the cheapest way to write a check
that can never fail. An unexpected extra call enters the denominator, so a model that sprays
every tool it can think of does not score 1.0 for including the right one somewhere in the pile.

`gradeToolCalls(expect, null)` is **unavailable** — the run never captured tool calls.
`gradeToolCalls(expect, [])` is **0** — it captured them and there were none. Those are one JSON
field apart and they mean opposite things.

## Release acceptance and success metrics

The owner's checklist (`docs/backlog/CHECKLIST-V2.md`) names twenty user-visible outcomes in
section **60. END-TO-END RELEASE ACCEPTANCE** and twenty measures in section **53. PRODUCT
ANALYTICS**. Both are implemented here, and both are offline — no model call, no network, no spend.

```sh
pnpm --filter @golem/evals acceptance    # the twenty scenarios, as tests (also runs in `pnpm -r test`)
pnpm --filter @golem/evals metrics       # the report: scenarios, completion figure, the 20 measures
pnpm --filter @golem/evals metrics -- --json
```

`src/acceptance.mjs` holds the scenarios. Each drives the real production code — the worker's
routing through the actual Hono app with a real ES256 JWT, its tool gating through the actual
`TOOLS` table, its quota arithmetic, its refusals — and each carries two sentences: `checks`, what
it asserted, and `notChecked`, the part of the brief's item no offline check can see. Thirteen of
these twenty items are marked `~` in the brief, and a harness that asserted the built half and
reported the whole item green would be pass/fail theatre.

One scenario is skipped: organizations are not planned (owner disposition, 2026-09-15,
`docs/design/TENANCY.md`). Its skip reason is guarded — the case fails if an organizations table
ever appears — so a stale excuse cannot survive the thing it excuses being built.

`src/success-metrics.mjs` is a REPORT, not a gate: it prints numbers with the date and commit it
measured, and a measure this repository cannot compute prints `not measured, because <reason>` and
never a plausible figure. Seventeen of the twenty land there, because the event catalog holds five
infrastructure events and no product event. `src/success-metrics.test.mjs` holds that rule against
the report's data.

Both were falsified: every scenario was made to go red by breaking the mechanism it names, one
uniquely-anchored edit at a time, reverted and sha-compared. The table is in
[docs/evals/ACCEPTANCE.md](../../docs/evals/ACCEPTANCE.md).

## Other commands

```sh
node src/selftest.mjs                      # offline harness self-test (also `pnpm test`)
node src/compare.mjs results/a.json results/b.json   # per-category deltas A -> B
node src/report.mjs                        # regenerates docs/evals/RESULTS.md from results/*.json
```

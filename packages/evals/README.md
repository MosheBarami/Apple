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

## Other commands

```sh
node src/selftest.mjs                      # offline harness self-test (also `pnpm test`)
node src/compare.mjs results/a.json results/b.json   # per-category deltas A -> B
node src/report.mjs                        # regenerates docs/evals/RESULTS.md from results/*.json
```

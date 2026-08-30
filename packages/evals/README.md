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

`tasks/<category>.json` — 56 tasks across 8 categories (api-knowledge 12,
luau-correctness 10, debugging 8, project-comprehension 6, tool-selection 6,
multi-file 5, ui-implementation 5, failure-recovery 4).

Task shape: `{id, category, prompt, system?, checks: [...], weight?}`.
Check shape: `{type: contains|not_contains|regex|luau_syntax, value?, pattern?,
flags?, target: text|code, weight?}` — `code` is the concatenation of all fenced
code blocks in the response; `not_contains` accepts a literal `value` or a regex
`pattern` that must NOT match. Task score = weighted fraction of checks passed;
category score = task-weight-weighted mean.

`luau_syntax` writes the code to a temp `.luau` file and runs the local CLI
(`luau-lsp analyze --no-strict-dm-types`, falling back to the rokit
tool-storage binary, then `luau-analyze`; override with `LUAU_CHECK_BIN`).
A snippet fails only on `SyntaxError` — unknown-global TypeErrors from Roblox
globals (`game`, `task`, ...) do not fail it, since no definitions file is loaded.

## Other commands

```sh
node src/selftest.mjs                      # offline harness self-test (also `pnpm test`)
node src/compare.mjs results/a.json results/b.json   # per-category deltas A -> B
node src/report.mjs                        # regenerates docs/evals/RESULTS.md from results/*.json
```

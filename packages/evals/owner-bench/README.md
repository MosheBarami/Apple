# The owner's 30-request benchmark (owner-30-v1)

The owner's measure of the product (2026-10-02): 30 varied requests covering single objects, silly requests,
modify-requests ("make it cooler"), maps, systems, UI and whole games. Each runs **in a fresh chat on a clean
Baseplate**, and is scored by fixed criteria. Frozen in `requests.json`; never edit an item after seeing its score.

## Protocol, per item
1. `POST /api/projects/:id/bench/reset`: the conversation, memory and run state go; the Studio pairing stays.
2. `POST /api/projects/:id/restore` to the project's clean-Baseplate checkpoint (label `bench-baseline`).
3. Each turn is sent over the project socket as an ordinary chat message; the next turn waits for `msg_end`.
4. `POST /api/projects/:id/bench/evaluate`: counts what the place holds, four real Studio photos round what was
   built, one play test, and the vision judge's scores (apps/worker/src/owner-bench.ts).
5. The result row (scores, critique, census, play test, photo paths, credits, time) goes to `results/`.

## Scores
Nine criteria, 0-2 each (0 bad or absent, 1 acceptable amateur, 2 professional): works, professional, matches,
polished, noErrors, performance, sound, animation, fx. An item's total is out of 18. The judge's scores are a
first pass; a human (or Claude, harshly) reviews the photos and may lower a score, never raise it without evidence.

## Feeding the meter (memory: frontier-meter-every-turn)
- Agent & capabilities = mean of works, matches, noErrors over all items.
- Visual quality = mean of professional over object, silly, modify, map and game items.
- UI = mean of polished over ui and game items.
- Sound/animation/FX = mean of sound, animation, fx over all items.
Each as a share of 2.

`runner.js` is pasted into the signed-in owner's browser tab on the benchmark project (it uses his session).

## Headless runner and review (no browser)
`run.mjs` runs any bank file with the same protocol as `runner.js` (reset, restore `bench-baseline`, each turn over the
socket, 25 minutes per turn then `/stop`, wait for idle, evaluate, credits counted after). Studio must still be running
and paired to the project. It spends real credits, so read the plan first:

    node packages/evals/owner-bench/run.mjs --dry-run [--bank <file>] [--ids o01,o05] [--from o10] [--max-credits 400]
    node packages/evals/owner-bench/run.mjs --project <uuid> --run <name> --max-credits 400 [--bank <file>] [--only o03]

- Sign-in is read from the environment or the repo `.env` (never printed): `GOLEM_BENCH_JWT` (+ `GOLEM_BENCH_REFRESH_TOKEN`
  so it refreshes), or `GOLEM_E2E_EMAIL` + `GOLEM_E2E_PASSWORD`. The account must own the project. `API_BASE` or `--base`
  overrides the worker URL. `--dry-run` needs none of it and makes no call.
- `--max-credits N` is a hard budget over everything in the results file: no item starts once the credits spent so far,
  earlier invocations included, reach N. An item already running is not cut short (its turns can still overshoot).
- Results: `results/<run>.json`, the array `score.mjs` reads; photos in `results/<run>/<id>/<angle>.png` (the server
  keeps them one hour, so they are saved straight after evaluate). Re-run with the same `--run` to resume: `done` rows are
  skipped; an errored or unjudged row runs again and its earlier credits stay counted. `--redo` re-runs done rows too.
  A quota stop or a refused account (`account_not_approved`, `studio_required`) ends the run instead of burning the bank.
- Interrupting a run mid-item leaves that row `running` and its credits uncounted; stop the agent from the app first.

`review.mjs` is the human pass over the judge's scores:

    node packages/evals/owner-bench/review.mjs sheet results/<run>.json          # writes results/<run>/review.md
    node packages/evals/owner-bench/review.mjs apply results/<run>.json adjustments.json [--dry-run] [--out f.json]

The sheet lists each item's request, scores, critique, census, play test and photo paths (missing photos are downloaded).
`adjustments.json` is `[{ "id": "o03", "scores": { "professional": 0 }, "reason": "photo 2: flat grey disc" }]`. A score
is only ever lowered, and only with a reason; the row keeps `originalScores`, `originalTotal` and an `adjustments` list.

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

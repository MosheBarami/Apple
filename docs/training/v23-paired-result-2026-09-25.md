# v23 held-out result and private Hugging Face evidence

Measured 2026-09-25 06:10 UTC. The single CPU supervisor completed 400/400
steps for v23 (`mask-prompt`); its lowest recorded validation loss was 0.784 at
step 300. Validation loss did not decide promotion.

The supervisor generated candidate, current best v22, and base answers in one
evaluation of the pinned 38-row set. `pairedComparison` was rerun independently
on `runs/eval-v23-on-v5set-scored.json` and
`runs/eval-v23-on-v5set-best-scored.json` using the recorded track counts
(23 trajectory, 8 game logic, 7 finish):

| Model | Trajectory | Game logic | Finish | Total |
| --- | ---: | ---: | ---: | ---: |
| v23 candidate | 10/23 | 0/8 | 4/7 | 14/38 |
| v22 best in the same run | 17/23 | 1/8 | 6/7 | 24/38 |

The 38 row identities and base verdicts matched; the comparison reported no
missing rows, unavailable harness, or other validity problem. v23 was correctly
not promoted (`14 < bar 26`). v22 remains the local leader. Neither adapter is
the model currently serving Apple users, and these rows do not prove frontier
quality or a finished Studio game.

The private `moshebarami/apple-lora` model repository contains v23's PEFT adapter
and candidate scored file. Its `v23/eval-v23-on-v5set-best-scored.json` was
uploaded as the paired comparator and downloaded again with identical SHA-256
bytes (9,750 bytes). The corresponding v22 best-side comparator was backfilled
and likewise byte-verified (10,072 bytes). Publication code now includes both
sides for future runs after a new supervisor process loads it; the process
training v24 was already running the old code. Discord received the v23 result,
and the supervisor started v24 at 06:10:11 UTC with the nine verified UI-state
training examples. v24 has no held-out score yet.

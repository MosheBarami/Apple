# Fresh storage transfer holdout — 2026-09-25

The measured Apple MAX code run still fails a first-save case. The four-row
`storage-outcome-verified-shard` is queued for a later local LoRA version; its
concept must not be scored only on the previously observed failure.

`packages/training/holdouts/storage-transfer-v1.jsonl` is a **separate,
diagnostic** set of three first-party, engine-independent Luau problems: a
season medal, market stock, and quest progress. Their read API and wording
differ from the four training lessons. They are absent from the training data
and the unchanged 38-row promotion set. Each problem distinguishes a failed
read from a successful empty value, and each reference module passes its own
local Luau checks. Changing the failed-read branch to a wrong outcome is caught
for all three. No prompt shares an eight-word run with the four training prompts
or the pinned promotion prompts. The committed JSONL is generated from
`src/storage-transfer-holdout.mjs` and the test checks byte-equivalent rows.

SHA-256 of the three-row JSONL:
`898a4eb9b2dd18033846558575a50f33059a123af637c4e32517b0a9af41c5cd`.
The focused tests pass 3/3; the full training source suite passes 664/664.
The diagnostic scorer rejects a generated file if any row ID, family, kind or
reference answer differs from this pinned set. A red-first test caught a
reference swap before that check was added, and a local paired-file smoke test
then scored the three references 3/3. This smoke result is **not** a model result.

After the storage-outcome version is trained, generate the **base, current
valid best and candidate answers in the same invocation** and score them
without changing the tasks:

```sh
cd packages/training
.venv/bin/python src/generate_eval.py --adapter adapters/apple-vN-best --best-adapter adapters/apple-v22-best --data holdouts/storage-transfer-v1.jsonl --out runs/eval-vN-storage-transfer.json --max-tokens 1200
node src/storage-transfer-holdout.mjs --score runs/eval-vN-storage-transfer.json runs/eval-vN-storage-transfer-scored.json
```

The result will say `diagnostic-storage-transfer-not-promotion`. It must be
reported next to the unchanged 38-row paired score and a real Studio test;
neither a local reference passing nor an improvement on these three rows is
proof of a frontier game builder. At this writing no model has answered these
new rows and v24 is still training. Replace `v22` in the example command if a
new valid best is promoted before the transfer measurement.

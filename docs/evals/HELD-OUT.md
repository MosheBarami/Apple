# Which numbers are on data the model has never seen

`docs/FINISH-REPORT-100.md` §3.9 measured the hole:

```
grep -rn -iE 'unseen' docs/evals/*.md docs/frontier-for-roblox.md → 0 matches
```

Every score this project publishes was published without saying whether the questions were
new to the thing being scored. A number that does not carry that word cannot support the
owner's sentence about a frontier Roblox model, because the most likely explanation for a
high score is always that the answers were in the training data.

This file states the split, and — separately — states which half of it is **measured** and
which half is only **argued**. Those are not the same claim and they must not be read as one.

Measured 2026-09-21 on this tree.

---

## 1. The RobloxQA gate versus the rows we fine-tune on — MEASURED, and clean

`node packages/evals/src/train-gate-overlap.mjs`, exit 0:

```
gate:     3000 questions from packages/evals/data/robloxqa
training:  404 instructions from packages/training/data (train=327 val=39 test=38)

exact shared:            0
8-word window flagged:   0  (raw 0)
near-duplicate flagged:  0  at threshold 0.6
highest score reached:   0.1985   (margin 0.4015 below the threshold)

verdict: HELD OUT
```

1,212,000 pairs were scored. The **margin** is the part that matters: "0 flagged" is also what a
detector that never fires reports, and the only thing separating those two readings is a
highest-score-reached that is neither 0 nor 1. 0.1985 is a detector that ran.

The five closest pairs in the whole cross-product are not near-misses; they are different
questions that share engine vocabulary:

```
0.1985  gate:     Which property on a GuiObject must typically be enabled for UITextSizeCons…
        training: Returns the text bounds size based on given text, label (from which proper…
0.1902  gate:     What is the primary operational difference between a regular queue and a p…
        training: Handles both priority and regular particles
```

### What this measurement does NOT prove, because falsifying it disproved the first draft

The file's own header records it: rewiring `instructionOf` to return the ASSISTANT turn —
Luau source rather than the instruction — still reported 0 flagged, at a *higher* maxScore of
0.2173, because engine identifiers are rare tokens on both sides. **A margin cannot separate
"compared the right text" from "compared the wrong text."** The field being compared is
asserted in the evidence file, not inferred from the score.

## 2. The 88-task suite versus the hosted models — ARGUED, not measured

The scores in `docs/evals/RESULTS.md` (`baseline stone 97.6`, `glm-final stone 98.9`, and the
rest) are produced by `packages/evals/tasks/*.json`. Those tasks were written in this
repository and have never been published, so they cannot be in a provider's training set by
the ordinary route.

**That is an argument, not a measurement, and this file will not print it as one.** We do not
have the training corpus of `@cf/zai-org/glm-5.3-flash` or of any other hosted model, so no
overlap can be computed. What can be said is bounded and is said here: the tasks are
unpublished; the repository is private; there is no third party to have scraped them from.
Anyone quoting 98.9 should quote that bound with it.

## 3. The frozen base gate — a third thing, and the one with a preregistered threshold

`APPLE_MAX_BASE_GATE` in `packages/evals/src/run.mjs` pins the 2026-09-18 Qwen2.5-Coder run to
88 tasks, 165 total weight, and the sha256 of its own thirteen task files. It is the only score
in the project with rejection criteria written *before* the run (`overallMin 0.9`,
`scriptingCombinedMin 0.85`, `scriptingCategoryMin 0.75`).

As of 2026-09-21 the gate hashes its own frozen file list rather than the task directory, so
the suite can grow without silently re-registering the approved test as a different one. A
task file the gate names and that changes by one byte still refuses the run — verified by
appending a real byte to `door-mechanic.json` and watching it refuse.

---

## The one sentence this file exists to make sayable

> The 3,000-question RobloxQA gate is measurably held out from every instruction the local
> adapter is trained on — 0 overlaps of three kinds, with the closest of 1,212,000 pairs
> reaching 0.1985 against a 0.6 threshold.

Anything broader than that sentence is not yet supported, and §2 above is why.

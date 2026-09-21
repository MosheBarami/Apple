# Reasoning effort: what is actually wired, measured 2026-09-21

The infra ledger carried this as "the lanes default to low while escalation machinery exists".
Measured against the tree, that sentence is true and is **not** a defect on its own. Recording what
is there so the next person starts from the wiring rather than from the sentence.

## The default in the model table is a floor, not the policy

`apps/worker/src/gateway.ts:139-145` gives `stone`, `rune` and `vision` `reasoningEffort: 'low'`.
`gateway.ts:377` resolves it:

```ts
const effort = req.reasoningEffort ?? cfg.reasoningEffort;
```

Per-call wins. So the table's `'low'` is reached **only** by callers that pass nothing.

## The agent loop always passes something

`apps/worker/src/do/session.ts:3563-3570` passes `reasoningEffort: choice.effort` on every step,
where `choice` comes from the adaptive policy (step number, prior step failed, whether the run has
mutated anything, visual defects found, `highEffortUsed`, and a `forcedEffort` override at
`session.ts:3519`). The table default is never consulted on that path.

`session.ts:3543` then does something worth preserving: it asks `reasoningEffortApplies()` and, on a
lane where the provider is not sent the knob at all, **deletes** `agent.effort` rather than
reporting `'low'`. The comment gives the reason — "low" would be a second false claim, because the
provider was told nothing, which is not the same as being told to think cheaply. That is the
observation-failure rule applied to a UI field, and it is correct.

## The call sites that do rely on the table default

| site | model | effort | reading |
|---|---|---|---|
| `apps/worker/src/vision.ts:328` | `vision` | explicit `'high'` | the visual critic; the comment argues it, and records that `medium` measured as spending the whole budget on reasoning and returning an empty string |
| `apps/worker/src/tools.ts:1101` | `vision` | **table default `'low'`** | OCR — transcribe the text in an image |
| `apps/worker/src/index.ts:3592` | from request body | table default | admin model-test |
| `apps/worker/src/index.ts:5102` | `req.internalModel` | table default | internal |
| `apps/worker/src/index.ts:2203` | `clay` | n/a | Qwen route; the adapter drops the field |
| `apps/worker/src/do/session.ts:4605` | `memory` | n/a | Qwen route |

I looked at `vision.ts:328` and `tools.ts:1101` expecting the stone-vs-rune shape — the same model
served two different settings with nothing explaining the difference. **It is not that.** One is
judgement and one is transcription; `'high'` for the critic and `'low'` for OCR both have a reason,
and only one of them is written down.

## The one thing worth changing, and it is small

`tools.ts:1101` gets `'low'` implicitly. Change `vision`'s table default and OCR's effort moves with
it, silently, for a reason that has nothing to do with OCR. Stating `reasoningEffort: 'low'` at that
call site with one line saying why costs nothing and decouples the two.

Not done here: `apps/worker/src/tools.ts` was clean, but the neighbouring decision lives in
`apps/worker/src/do/session.ts`, which is **dirty in the shared tree right now** — another lane is
mid-edit. Exact lines are named above so whoever holds that file can take it in one pass.

---

## Correction, same night: "the one thing worth changing" was already changed

The section above ends *"Not done here"*. It was done, in `ff514a6`, before this note was written —
the two lanes crossed. `apps/worker/src/tools.ts:1125` now reads:

```ts
        // STATED, not inherited. `vision` carries `reasoningEffort: 'low'` in the model table
        // (gateway.ts:139-145) and this call passed nothing, so OCR was getting 'low' by accident
        // of the default — while the visual critic on the SAME model states 'high' at
        // vision.ts:328 with its own argument. …
        reasoningEffort: 'low',
```

So the coupling the note asked to break is broken: changing `vision`'s table default no longer moves
transcription with it. The reason for `low` is written at the call site rather than inferred from a
table entry belonging to a different job.

Nothing else in the note changed. The table default is still a floor and not a policy, the agent
loop still passes `choice.effort` on every step, and `session.ts:3543` still DELETES `agent.effort`
on a lane where the provider is not sent the knob rather than reporting `'low'` — which is the same
rule as this correction, one layer up: do not report a value that was never sent.

**The row this note was filed against can be closed.** Nothing in the reasoning-effort policy is
outstanding that is not a deliberate design: three of the six call sites in the table take the
default, and two of those are admin and internal routes where the caller supplies the model.

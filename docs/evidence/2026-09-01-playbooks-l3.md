# L3: playbooks, and the measurement that makes them a rung

`docs/SOURCE-INTELLIGENCE.md` §7 lays out a ladder and puts one condition on it:

> **Every rung must beat the rung below it, measured.** An unmeasured technique is
> not a rung.

Before this change, L3 was three prose mentions in the whole repository — the ladder table
row, the `→ PLAYBOOKS` line in the §1 pipeline diagram, and one sentence of body text. No playbook
file, type, test or consumer existed. (An earlier draft of this document said "one grep hit"; there
were four, and the distinction matters only because a claim that specific should be right.) This records what was built, and, more importantly, the measurement.

---

## 1. What was already there, and what it could not see

L2 is retrieval plus mechanised checks: `composeBrief()` ranks constraints for a
brief, and `audit()` runs the eleven enforced rules over the result.

Every one of those eleven is a **violation detector**, and several are explicitly
conditional on the thing they judge being present. `checkFocusFeedback` is the
clearest case — `checks.mjs:440`:

```js
const hover = (source.match(/\bMouseEnter:Connect\b/g) ?? []).length;
if (hover === 0) continue;
```

It exists to catch a hover state that forgot its gamepad focus. A button with
*neither* passes, because there is no contradiction to find.

So this — a plausible answer to "build me a shop panel" — is clean:

```lua
local gui = Instance.new("ScreenGui")
local shop = Instance.new("Frame")
shop.Size = UDim2.fromOffset(420, 320)
local title = Instance.new("TextLabel")
title.Text = "Shop"
```

```
audit({ files: [{ path, source }] })  ->  { ok: true, findings: [], enforced: 11 }
```

It violates nothing. It is also not a shop panel, and no check in `packages/evals`
could say so.

> **A correction on how this was first measured.** The initial probe called
> `audit(source, {})`. That type-checks, destructures every field to `undefined`,
> runs **zero** of the eleven checks, and returns `ok: true` — a green verdict
> meaning "nothing was examined". The conclusion happened to be right and the
> evidence for it was worthless. Every number above comes from `audit({ files })`,
> and the test asserts `enforced === 11` so a future empty-spec regression cannot
> masquerade as a clean run.

## 2. What a playbook is

An ordered procedure for a task class. Each step names the rule ids it exists to
satisfy — never their prose — and carries two signals:

| status | meaning |
| --- | --- |
| `primitive` | the Golem-owned primitive was used; the step was done the intended way |
| `manual` | a raw equivalent is present; the step was attempted, but went around the library |
| `missing` | neither; the step did not happen |

`manual` is the state worth having. §G's complaint is that Golem "defaults to
inventing every Roblox GUI from a blank canvas" — `manual` is that defaulting,
detected. It is a warning rather than a failure, because hand-rolling is sometimes
right and the correctness checks still read the result.

Three playbooks ship, covering 13 steps: `panel.shop`, `hud.cluster`,
`button.interactive`. **There is deliberately no toast playbook.** Golem owns no
toast primitive — `Theme.toast` does not exist — so its evidence signals would have
had to name something the project does not have. An absent playbook is honest; a
playbook citing a fictional primitive is not.

Two properties keep this from becoming a third place for the same knowledge to rot:

- Steps cite rule **ids**. `composePlaybook()` pulls text from `RULES` at render
  time, and `assertPlaybookIntegrity()` fails the build the moment a step cites an
  id that no longer exists. A test drives that against a deliberate violation.
- A test asserts no step's instruction contains any rule's sentence verbatim, so
  the two cannot silently drift apart.

## 3. The measurement

Same source, both layers:

| | L2 `audit({files})` | L3 `gradePlaybook(…, 'panel.shop')` |
| --- | --- | --- |
| empty "shop panel" above | `ok: true`, **0 findings** | `ok: false`, **4 of 5 steps missing** (`footer, rows, price, transition`) |
| hand-rolled, every step present | `ok: false`, 1 finding (motion gate) | `ok: true`, **5 steps flagged as library bypass** |
| real `Panels.luau` | `ok: true`, 0 findings | `ok: true`, 5/5 `primitive`, 0 bypasses |

The first row is the rung: four defects, none of which L2 can express. The third
row is what keeps it usable — a completeness check that fired on working code would
be switched off, so the playbook is graded against the real shop panel it was
derived from and passes it 5/5.

## 4. What running it found

Grading the real client code returned two `manual` verdicts. Both were checked
against the source rather than accepted.

**`hud.cluster.z-band` on `Hud.luau` — a true finding.** `Hud.luau` writes
`parent.ZIndex + 3`, `+ 4`, `+ 2`, `+ 1` at each call site, off one shared number
line, while `zAbove()` exists in `Theme.luau` and goes unused. That is precisely
what `layout.z-order-is-bands-with-headroom-not-one-number-line` warns about. It is
now a test, with a note to delete it if `Hud.luau` is ever fixed.

**`button.interactive.press` on `Theme.luau` — a defect in the playbook.** The step
named `MouseButton1Down` as the primitive and `Activated` as the fallback.
`Theme.luau:1088` documents why that is wrong:

> ButtonA is the gamepad's activate, and it arrives through InputBegan on the
> button itself once that button holds selection. Without it the controller path
> fired `Activated` — so the game responded — while the control never looked
> pressed.

A press arrives from mouse, touch and gamepad, and only one of those is a mouse
button. The codebase had already outgrown the procedure I wrote down, and the
playbook would have taught a generator the mouse-only path. Corrected: `InputBegan`
with a device predicate is the primitive; a bare mouse-button signal is the
re-invention. `Theme.luau` now grades 4/4 `primitive`.

This is the L3 failure mode worth naming — **a playbook that encodes a procedure
the codebase has already outgrown** — and it was found by running the thing against
real code, not by reading it.

## 5. Wired into evals

`playbook_complete` is a check type in `grade.mjs` beside `no_antipattern` and
`no_design_violation`. It is the only check in `packages/evals` that can fail model
output for what it does **not** do.

> **This section was overstated when written, and the correction is F-57.** The check was
> implemented, imported by `grade.mjs`, dispatched, and unit-tested — but `tasks.mjs` validated
> `check.type` against its own hand-written `CHECK_TYPES` set, which contained neither
> `playbook_complete` nor `no_design_violation`. A task file declaring either was rejected as
> `bad type`, so **neither was reachable from the eval suite at all** while both were described as
> wired into it. That is this repository's signature defect — a capability that is real, complete
> and unreachable — committed by the person documenting the previous four instances of it. The two
> lists are now bound: `tasks.mjs` imports `DISPATCHABLE_CHECK_TYPES` from the module that
> dispatches them, and a test reads `grade.mjs`'s own `case` labels and fails if they diverge. A library bypass is reported on a pass as well
as a failure — burying it inside a green result would hide the one thing the check
exists to notice — and `allowManual: false` lets a task refuse it outright.

## 6. Suite

`pnpm -r test` — **1,547 pass, 0 fail**. `packages/design` 60 → 72,
`packages/evals` 1,006 → 1,011.

## 7. What this does not claim

- Evidence signals are **presence** tests, not correctness tests. They answer "was
  this step attempted?"; `audit()` answers "was it done right?". A signal can be
  satisfied by a comment mentioning the primitive. They catch the failure that
  actually happens — a generator silently skipping half a procedure — not an
  adversary trying to defeat them.
- Three playbooks is not coverage of Golem's task space. It is the task classes
  whose primitives exist today.
- L3's promotion criterion in §7 is "the playbook's task class improves". What is
  measured here is that the playbook **detects** what L2 cannot. Whether a
  generator handed `composePlaybook()` produces better panels than one handed
  `composeBrief()` is a model-inference comparison, and that is gate 14's blocker.

# A refusal that names no remedy gets one invented — four fixes in, still true

## The defect

Studio refuses a write without edit consent. The plugin says so. The model relays it accurately and
then invents the fix:

> **Check Permissions**: Ensure the project allows script-based writes. In Studio, go to
> `File > Project Settings > Security` and verify the "Allow Scripted Updates" setting.

and, in a later run, a different fiction:

> Go to `File > Place Settings > Security`. Uncheck **"Require explicit edit consent for scripts"**.
> Save the place and retry the operation. This is a **Studio-level safeguard**.

None of that exists in Roblox Studio — not the menu, not the page, not either checkbox. And the
refusal is not Studio's: it is Apple's own consent gate, `init.server.luau:219`, lifted by pressing
**Enable edits…** twice in the Apple panel a few inches away. So the product blames Roblox for its
own gate and sends the user hunting for a setting that was never there.

Reproduced three times tonight by me and once, independently, by a fresh-context reviewer who did
not know it was being worked on.

## What landed

1. **A closed remedy vocabulary** — `REFUSAL_REMEDIES` in `packages/shared`, six codes. Adding a
   refusal now means answering "and what does the user do about it" in a place the compiler sees.
2. **Codes at the refusal sites** — `Commands.luau` attaches `edit_consent`, `leave_test_mode` or
   the explicit `none` to the refusals that have an answer. `none` is not silence: it says *no
   setting enables this* and tells the model not to suggest one, which is much harder to contradict
   than a gap.
3. **The wire** — and this is the part that had already shipped broken. `Bridge.luau` copies only
   known `OpResult` fields, by design, so `remedy` was dropped between the two ends I had just
   tested at both ends. `tests/bridge.test.mjs` now asserts on the poll BODY, falsified both ways:
   removing the field turns it red, and widening the copy to a blind key-for-key copy turns it red
   too. **A field that exists at both ends is not a field until the wire carries it.**
4. **`fix` in the tool result** — `remedyHint` in `op-failure.ts`, beside the existing `retry`.
   `retry` answers "may I do this again"; `fix` answers "what does the PERSON do". An unclassified
   refusal gets an admission of ignorance, because "unknown" and "there is nothing to do" are
   different facts.
5. **A prompt rule** — the system prompt now names the two invented settings and forbids them, and
   says edit consent is Apple's gate, not Studio's.
6. **The refusal sentence itself** — the model quotes `error` verbatim and demonstrably ignored a
   separate field, so the remedy now rides inside the sentence it already repeats.

Every piece is guarded: 38 plugin tests, 3,473 worker tests, the artifact check requires the
`edit_consent` code in the shipped bytes.

## And it still does it

Deployed (`dc5a41b-dirty`), plugin rebuilt and installed, Studio restarted, re-paired, consent off,
same request:

> The "explicit edit consent" restriction in Roblox Studio **cannot be bypassed programmatically**.
> To resolve this, you must manually adjust the security settings in Studio: Go to
> `File > Place Settings > Security`, uncheck "Require explicit edit consent for scripts"…

So **w34 is not done**, and it is not marked done. Six changes that each look right have not moved
the observable behaviour.

## Why I could not tell which of the six failed

The decisive question is whether the model receives `fix` and the new `error` text at all, and I
could not answer it from outside the worker:

- `/api/projects/:id/messages` returns `toolTrace: null` and contains neither `retry` nor `remedy`,
  so it does not carry tool results.
- `/api/projects/:id/export?format=json` does not contain the new refusal sentence either — but it
  does not contain the OLD one as raw tool output either, so its absence proves nothing about the
  wire. That is an inconclusive probe and is recorded as one rather than as a finding.
- `/api/admin/*` refuses the local `ADMIN_KEY` in production (403, and 403 for a deliberately wrong
  key — the control says the endpoint is reachable and the key is simply not it).

**The missing thing is an instrument, not another fix.** Next step, named: a way to read back the
exact `error`, `failure`, `remedy` and `fix` of a refused op for one's own session — an authenticated
`?ops=1` on the messages endpoint, or a per-op row the project stage already half-renders as
`✗ writes require explicit edit consent`. Without it, every further attempt here is a guess with a
three-minute Studio restart attached.

## One worry raised and retired

After one restart the panel read **"Access: edits allowed for this connection"** on what looked like
a fresh load, which would have been a serious consent-persistence defect. Re-tested from a clean
restart and a fresh pairing: it reads **"Access: inspect only"**. The earlier reading was my own
misclick on a floating panel whose layout had shifted, not the product. Recorded because a
security-relevant claim that turns out to be a measurement artifact is worth saying out loud.

## Not verified

- Whether `fix` reaches the model. See above; the instrument does not exist yet.
- Whether GLM-5.3 Flash can be steered off this at all by prompt. Three prompt-level and
  message-level interventions have not moved it, which is evidence but not proof.
- Any refusal other than edit consent. `leave_test_mode` and `none` are coded and unit-tested;
  neither has been triggered live.

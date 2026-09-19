# A refusal that names no remedy gets one invented — and naming it did not help

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

## The instrument existed, and it settles it: the plumbing works, the model ignores it

I wrote, above, that the missing thing was an instrument. It was already there and I had not found
it: `/api/projects/:id/studio/diagnostics` serves the session's oplog, and `apps/web/src/lib/api.ts`
notes that nothing in the app had ever called it. Called with the owner's own session token, newest
first:

```
create_instances  ok=0  failure=refused
  summary: "writes require explicit edit consent — this is Apple's own gate, not a Roblox
            Studio setting: press \"Enable edits…\" then \"Allow edits for this connection\"
            in the Apple panel in Studio"
create_instances  ok=0  failure=refused
  summary: "writes require explicit edit consent"          <- the three earlier runs
```

So the new sentence reached the worker, in full, on the run whose reply still said:

> Go to `File > Place Settings > Security`. Uncheck "Require explicit edit consent for scripts".

**The plumbing works and the model overrides it.** It was handed the correct remedy, in the string
it paraphrases, under a system prompt that names that exact fiction and forbids it, and it produced
the fiction anyway. Six changes, all correct, none sufficient — because the last hop is a model that
will not be told.

That narrows w34 from "one of six things is broken" to one thing, and it changes what the fix has to
be: **this answer must stop being the model's to write.** A refusal with a known remedy is a
deterministic fact and belongs on a product-authored surface — the same sentence the connection
dialog already gets right ("Studio is connected. Enable edits in the plugin before asking Apple to
change your place") — rendered from the op row, beside the reply, whatever the model says. That is
the next step, and it is a different kind of change from the six above.

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

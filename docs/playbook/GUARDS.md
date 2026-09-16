# Writing a guard that survives the code getting better

Eight guards went red in one session because the code under them improved. That is the most common
test defect in this repository, and it is expensive twice: once when you debug a passing system, and
again when someone deletes the guard to make the noise stop and takes a real one with it.

---

## The rule

**Assert the property. Never the expression.**

```js
// pinned to a spelling — dies the day an argument is added
assert.match(src, /collabRefusal\(c, access\.status\)/);

// pinned to the property — survives anything that keeps the property
assert.match(src, /if \(!access\.ctx\) return collabRefusal\(c, access\.status\b/);
```

Real cases, all of which fired on an improvement:

| Pinned to | What changed | Why the change was good |
|---|---|---|
| `collabRefusal(c, access.status)` | a third argument | the refusal carries more to the user |
| an exact `withOwnedProject(…)` call | `?? ''` added | a default that fails **closed** |
| `sharedAccess(a, b, c)` | a fourth argument | the gate got **stricter** |
| `return { ok: false, error: 'checkpoint not found' }` | a second line | the user watching a blank drawer is now told |
| `waitUntil(outcome)` | — | it was pinning a **no-op** in place |
| `recoverToolCall(res.text, allowed)` | a third argument | a name the model chose can no longer reach the transcript |

The last one is mine, written an hour after I wrote this page's first draft. Expect to do it.

## When a pin fires, ask which direction the code moved

- **Code got better** → restate the property, and write in the comment what the old pin was and what
  moved. That sentence is what stops the next person re-pinning it.
- **Code got worse** → you just caught the bug the guard exists for. Do not touch the guard.

Answering that question honestly *is* the guard's value. Skipping it is how a suite becomes noise.

## Tripwires are exact on purpose, and must say so

```js
assert.equal(userPushes.length, 4, 'a user-role transcript injection was added or removed — review it');
```

This is meant to fire on *any* change, because each new user-role message is a channel by which text
becomes an instruction and needs a human review. **When it fires, write the review — do not bump the
number.** It caught a real injection hole within an hour of the fourth being added.

Say in the comment that it is a tripwire. Otherwise the next reader will "fix" it.

---

## Locating code without pinning to its neighbours

An anchor that is a *neighbour* rather than a *boundary* breaks when anything is inserted between
them — and worse, it can be **moved by the very edit the guard exists to catch**, so a slice that
stops early hides what it was written to find.

Three locators, in `packages/evals/src/security.test.mjs`:

- **`braceBlock(src, from)`** — reads `if (…) { … }` to its own closing brace, skipping strings and
  comments. Use for blocks.
- **`bodyBlock(src, from)`** — walks the parameter list, then skips any `{` in *type* position
  (after `:` `|` `&` `,` `<` `(` `=>`). Needed because
  `restoreCheckpoint(id): Promise<{ ok: boolean; … }>` puts a brace between the signature and the
  body, and a plain brace matcher reads the **type**.
- **A partition.** For a flat module, collect every top-level declaration and route registration,
  sort by position, and give each one the region up to the next. A call belongs to the region it
  lands in.

The partition replaced a model that attributed every call to *the last route registered above it*.
That is proximity, not reachability: a helper declared after a route was reported as being called
**from** that route, and the guard printed a precise, confident sentence about a call site that does
not exist.

---

## Four rules that make a guard worth its line count

**1. Assert that the read found something.**

```js
assert.ok(owners.length > 50, 'the partition is empty — this test would check nothing');
assert.ok(restore.length > 400, 'restoreCheckpoint was not found — this test would check nothing');
```

A scan that matches nothing passes. Silently. Forever. This is the single cheapest assertion you can
add and it has caught more than any other.

**2. Strip comments before scanning source.**

Four scanners here have needed this, and the failure is perverse: the better you document a fix, the
more false findings a prose-reading scanner produces — and the finding it reports is **your own
explanation of the fix**. One scanner's residue changed because a comment quoted the line it was
counting.

**3. Read what the customer reads.**

`counted-copy.test.mjs` and `links-resolve.test.mjs` read `apps/site/dist`, not `src`. A login page
once shipped a competitor's headline because the checker read source and the customer read rendered
HTML, with eleven characters of markup where the regex expected whitespace.

**4. Derive every list; never hand-write one.**

Hand-written lists outlive what they list. `check-credit-figures.mjs` carried a withdrawn mode;
`pick-asset-wall.mjs` balanced three packs perfectly and put six near-identical playing cards on the
landing page. Read from `PRODUCT_MODES_OFFERED`, `toolNames()`, the registry, a directory walk — and
then apply rule 1 to what you read.

---

## Reviewing rather than waving through

When a tripwire fires on a genuinely new thing, the output is a **written review beside the
allowlist entry**, naming what you checked:

```js
// `assumptions` REVIEWED 2026-09-16. `runIntentFor` sets it to `intentCheck(request).notes`,
// built in semantic.ts from fixed policy sentences interpolating values lifted from the request.
// Safe for the same reason `checklist` is: intentCheck takes ONE parameter and semantic.ts has NO
// imports, so there is no second source to mix in.
'assumptions',
```

Then **hold the review to the code**, so the argument cannot rot:

```js
assert.deepEqual([...readCode('semantic.ts').matchAll(/^\s*import\s/gm)].map(m => m[0]), [],
  'semantic.ts grew an import — the intent extractor can now reach something other than the request');
```

A review that is only prose is a promise. A review with an assertion under it is a fact.

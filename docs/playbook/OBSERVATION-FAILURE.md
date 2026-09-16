# A failure to observe must not render as an observation

The central pattern of this repository. Read the six instances below before you decide your
situation is different.

Every one of them looked like success from the inside. None of them threw. Most of them had a test.

---

## The six shapes

### 1. The report of an action that did not reach its target

`infra/deploy-static.mjs` printed `done — 75 file(s)` on every run. It really did upload 75 files.
`/pricing` had been serving the previous design — blue accents, 96px capitals, the word "Sparks"
this product was renamed away from — **for a day**.

The worker resolves `/pricing` by trying `/pricing`, then `/pricing.html`, then
`/pricing/index.html`. An old row sat at the bare key. The uploader writes `/pricing/index.html` and
has no delete, so the shadowing row could not be replaced, could not be removed, and won every
request forever.

Two rows existed, exactly one was reachable, and nothing in the system could tell the difference.

**Fix:** the deploy now ends by fetching the URL a reader would type and comparing a sha256 of the
served bytes to what it sent. **Uploading is not deploying.**

### 2. The value that is true of the code and false of what is running

`/api/health` answered `"buildSha":"616d84b"` while the code producing that answer was four commits
further on, because `BUILD_SHA` is a var edited by hand before a deploy and I forgot.

A health endpoint naming the wrong build is worse than one naming none: it is the first thing
anybody checks when production is behaving strangely, and a stale sha tells them the strangeness
cannot be recent — the one conclusion that stops the search.

**Fix:** `infra/deploy-worker.mjs` stamps it from git at deploy time and then asks `/api/health`
whether that is what it is serving.

### 3. The API that exists so your feature detect succeeds

```ts
if (this.ctx.waitUntil) this.ctx.waitUntil(flushEvents(this.env));
else await flushEvents(this.env);
```

Cloudflare's documentation for `DurableObjectState`: *"Unlike in Workers, `waitUntil` has no effect
in Durable Objects... available for API compatibility."* It **exists**, so it is truthy, so the
first branch always ran and did nothing, and the correct branch was dead code wearing the costume of
a careful fallback.

Measured, before believing it — `/api/admin/logs` by kind:

```
request     2,499 rows      recorded in the WORKER
audit       2,501 rows      recorded in the WORKER
build           0 rows      recorded in the session Durable Object
model_call      0 rows      recorded in the session Durable Object
error           0 rows      recorded in the session Durable Object
```

A clean split along the isolate boundary. **The product had never recorded a single build**, and the
admin surface reported that as a measurement of zero rather than as an absence.

*An API that exists only for compatibility is the worst possible shape for a feature detect.*

### 4. The absence that renders as "still working"

The dashboard showed three loading skeletons, `aria-busy="true"`, indefinitely. The project query
was returning 400: `column projects.pinned_at does not exist`. Two migrations sat in the repository,
unapplied. Code had shipped ahead of its schema and the UI's only vocabulary for it was "loading".

*An eternal loading state is the worst failure mode in a UI: it is indistinguishable from patience.*

### 5. The property that agrees with you for the wrong reason

```css
border: 1.5px solid var(--ink-2);   /* --ink-2 is not defined in this app */
```

An unresolvable `var()` invalidates the **whole declaration**; every longhand reverts to its initial
value — `border-style: none`, `border-width: 0`. And `border-color`'s initial value is
`currentColor`, which happened to be the exact grey the author intended.

So the stylesheet said the border was there. `getComputedStyle(el).borderTopColor` returned
`rgb(163,163,173)` and agreed. **Only the screen disagreed.**

The same scan then found seven undefined token names across ~30 declarations, mostly `color` — every
rule that meant "a step quieter than the line above" was rendering at the same weight as the line
above. The hierarchy those rules were written to create did not exist, and nothing reported it.

### 6. The guard that reports a defect because the code improved

`check-credit-figures.mjs` failed with five errors. Three were it demanding a price for a mode the
owner had withdrawn; two were it looking for a literal the page had stopped hard-coding in favour of
deriving. **Nothing was wrong with the page.**

A red guard is evidence of *change*, not of *regression*. See `GUARDS.md`.

---

## How to catch these before they ship

**Say what you measured, separately from what you infer.** Most of the above survived because a
sentence covered both: "the deploy succeeded" is an inference; "the URL serves the bytes I sent" is
a measurement. Write the second one, or admit you only have the first.

**Check the boundary you actually care about.** Source is not the build; the build is not what the
URL serves; the computed style is not the pixels; a test file's assertions are not their ability to
fail.

**When a system reports a count of zero, ask whether it can count.** `build: 0 rows` and "no builds
happened" are different statements, and only one of them was true.

**Look at the rendered thing.** Three defects this week were invisible to every checker and obvious
in one screenshot.

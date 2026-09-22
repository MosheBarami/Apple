---
name: rbxai-working-rules
description: How to make a change in this repository without breaking a peer, shipping a guard that cannot fail, or reporting something you did not observe. Read this before the first edit of any session in ~/Desktop/RbxAI — it is the method the whole codebase is written to, and every rule in it is here because it was learned expensively.
---

# Working rules for this repository

> **START HERE — `docs/autonomy/`.** The most important artifact in this repository is the owner's
> autonomy research (`docs/autonomy/RESEARCH-REPORT.md`) and the mission it ends in
> (`docs/autonomy/OWNER_PROMPT.md`). Read `docs/autonomy/README.md`, `MISSION.md`, `CURRENT_STATE.md`
> and `NEXT_ACTION.md` before anything below. The hard safety envelope is enforced by
> `.claude/hooks/autonomy_guard.py`; `touch .autonomy/STOP` freezes every mutating tool.

Every rule below cost something. Where a rule has a date beside it, that is the day it was
learned and there is a commit you can read.

Nothing here is style. Each rule prevents a specific defect that shipped.

---

## 1. The one idea the whole repository is built on

**A failure to observe must not render as an observation.**

The dangerous bug in this codebase is never a crash. It is a system that answers confidently
about something it did not look at. Every instance looks like success from the inside:

| What it printed | What was true |
|---|---|
| `done — 75 file(s)` from the static deploy | `/pricing` had served the previous design for a day; the upload wrote a key the worker never reads |
| `"buildSha":"616d84b"` from `/api/health` | the code answering was four commits further on |
| three loading skeletons on the dashboard | the query had failed; the columns it asks for do not exist |
| `waitUntil(flushEvents(...))` in a Durable Object | the promise is dropped; **zero** build events had ever been recorded |
| `borderTopColor: rgb(163,163,173)` in devtools | the border did not exist — the token was undefined and the colour was `currentColor` coinciding |
| `check-credit-figures: NaN` | the page was correct; the checker was demanding a figure for a withdrawn mode |

**The habit that catches all of them: state what you measured, separately from what you infer.**
If you did not look at the thing itself, say so in those words. "The build succeeded" and "the URL
serves the bytes I sent" are different claims and only the second one is a deploy.

---

## 2. Guards that fail when the code gets better

This happened **eight times in one session**. It is the most common defect in this repository's
own tests, and you will write one today if you are not watching for it.

**The tell:** a test goes red and, when you read the diff, the code under it *improved*.

Real examples, all from `packages/evals/src/security.test.mjs` and its neighbours:

- A refusal was pinned to `collabRefusal(c, access.status)`. A route began passing a third argument
  so the refusal could carry *more* information to the user. Red.
- An ownership proof was pinned to an exact `withOwnedProject(…)` call. One route added `?? ''` —
  a safe default that makes the lookup fail closed. Red.
- A checkpoint refusal was pinned to `return { ok: false, error: 'checkpoint not found' }`. The
  refusal grew a second line so the user watching a blank drawer would be told. Red.
- A notification was pinned to `waitUntil(outcome)` — the exact spelling of a **no-op**. The guard
  was holding a bug in place.
- I wrote one myself, an hour after writing this section: pinned `recoverToolCall(res.text, allowed)`
  and it went red when the call gained a third argument that makes it *stricter*.

**The rule: assert the property, never the expression.**

```js
// pinned to a spelling — dies when an argument is added
assert.match(src, /collabRefusal\(c, access\.status\)/);

// pinned to the property — survives anything that keeps the property
assert.match(src, /if \(!access\.ctx\) return collabRefusal\(c, access\.status\b/);
```

When a pin does fire, **the first question is which direction it moved.** If the code got better,
restate the property. If the code got worse, you just caught the bug it was for. Answering that
question honestly is the whole value of the guard.

**A tripwire is different and is allowed to be exact.** `assert.equal(userPushes.length, 4)` is
meant to fire on *any* change, because each new one needs a human review. Say so in the comment, and
when it fires, write the review — do not bump the number.

---

## 3. Falsification is two halves and you will skip the second

**Red-first:** break the mechanism, watch the assertion *about that mechanism* go red, restore.
This is settled practice here.

**Green-after:** run the whole suite in the state the guard was built for.

I shipped `9b243bb` having done only the first. I planted a mark, proved the new assertion could
fail, removed the mark, committed — and wrote *"Nothing is marked ⊘ yet; this commit is only the
machinery."* Two other assertions in the same file were still using the old denominator. They were
found by the next agent, using the feature for real.

> Red-first proves a guard **can** fail. It does not prove the suite **passes** when the feature is
> actually in use. A feature whose real state does not exist yet is exactly where that half gets
> skipped.

### When your break turns nothing red

Six readings, in descending order of frequency. `docs/FAILURES.md` F-58 has the full list; the two
that bite most often:

1. **Mis-aimed break.** You replaced the first occurrence of a string that appears several times.
   *Always assert the occurrence count before replacing:*
   ```python
   assert s.count(old) == 1, f'occurrences={s.count(old)}'
   ```
   I skipped this on a revert and restored the wrong line — `PRODUCT_MODES` briefly lost a mode it
   must keep. `git diff` caught it. **Read the diff after every revert.**
2. **A different guard failed first.** Your planted break tripped a neighbouring assertion, the run
   stopped, and the one you were testing never executed. It reports red and proves nothing. Make the
   planted state *internally consistent* — if you add a mark, update the totals too — so the
   assertion you are aiming at is the one that fires.

---

## 4. The shared checkout

Several agents edit **one working tree** at the same time. These are not preferences.

- **`git commit` writes the whole INDEX.** Staging explicit paths does not protect you from what a
  peer staged. Always `git commit -F <msg> -- <pathspec>` — the `--` goes **last** — and read
  `git diff --cached --stat` before committing.
- **Never** `git add -A`, `git add -u <path>`, `git checkout`, `git switch`, `git stash`, `git reset`.
- **Never `cp` a whole-file backup over a source file.** To falsify, mutate and revert with a
  uniquely-anchored string replacement. I used `cp` on `index.ts` during a falsification and
  destroyed a peer's in-flight work three times before noticing.
- **Never `pnpm install`** inside an in-repo worktree — it rewrites the main checkout's workspace
  symlinks (F-68).
- A peer's red test is not yours. Check `git diff --name-only` before assuming a failure is your
  fault, and say whose it is in your report.

---

## 5. Verify at the boundary you actually care about

Each of these pairs looks like one thing and is two:

| You checked | The customer gets |
|---|---|
| the source file | the **built** output |
| the built output | the bytes the **URL serves** |
| `wrangler deploy` printed success | what `/api/health` **answers** |
| `getComputedStyle().color` | the **pixels** |
| the test file's assertions | whether they can **fail** |

`infra/deploy-static.mjs` and `infra/deploy-worker.mjs` now both end by fetching what they deployed
and comparing it to what they sent. Do the same for anything you ship.

**And look at the rendered page.** Three defects this week were invisible to every checker and
obvious in a screenshot: a headline rendering near-black on near-black, a nav reading as one run-on
word, a login page whose grid was clipped against a seam.

---

## 6. Before you claim a bug, check

Several "bugs" this week were not:

- A dim, grey **Sign in** button — genuinely `disabled` because the form was empty. Enabled, it is
  white on black and correct.
- The workspace rendering with **no surfaces at all** — every `--gx-*` token empty. The tokens are
  scoped to `.gx`, and my test harness had omitted the class.
- A tool with **no written label** — `image_text` is a JSON schema name, not a tool. The guard that
  "missed" it was right.

**Reproduce it in the real thing before you write it down.** A finding you retract costs more than
the minute it takes to check.

---

## 7. Derive lists; never hand-write one

Every hand-written list in this repository has outlived what it lists.

- `check-credit-figures.mjs` carried three modes including one that was withdrawn; it then demanded
  a price for a mode nobody can choose and reported `NaN`.
- `pick-asset-wall.mjs` balanced three asset packs perfectly and put **six playing cards** on the
  landing page, because it took each pack's head and both packs enumerate alphabetically. It
  measured the property it was named for and none of the property that mattered.
- `Nav.astro` offered three links out of six because a comment about deleted sections outlived the
  sections coming back.

Read the list from its source of truth — `PRODUCT_MODES_OFFERED`, `toolNames()`, the registry, the
directory walk — and assert that the read found something:

```js
assert.ok(owners.length > 50, 'the partition is empty — this test would check nothing');
```

**Every scanner that reads source must strip comments first.** Four in this repo have needed it. The
better you document a defect, the more false findings a prose-reading scanner produces — and the
finding it reports will be your own explanation of the fix.

---

## 8. Reporting to the owner

He is non-technical, reads Hebrew, and reads neither `docs/` nor code.

- Lead with **what changed for him**, not what you did.
- Give a percentage of the **whole product** and of the **current task**.
- Say plainly when something is **not** deployed, or when you did not verify it.
- When you were wrong, say so in one sentence and move on. No ceremony.
- Never report a test as passing that you have not just run.

---

## 9. What to read next

- `docs/playbook/` — the patterns above with worked examples and the commits that taught them.
- `docs/FAILURES.md` — every confirmed failure, newest first. F-58 is the one to read first.
- `docs/DECISIONS.md` — architecture decisions. ADR-021 is the owner's call on tenancy and is why
  73 checklist items are marked `⊘` rather than `☐`.
- `GATES.md` — the gates, what each one checks, and the evidence ritual.

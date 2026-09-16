# How to actually get a change through this repository

---

## The loop

1. **Look at the thing first.** Not the source — the deployed page, the live log, the real account.
   The most valuable findings this week came from opening the product, not from reading it.
2. **Reproduce before you name it.** Several "bugs" were not: a grey button that was genuinely
   `disabled`; a workspace with no surfaces because my *harness* had omitted the `.gx` class; a tool
   with "no label" that was a JSON schema name, not a tool. A finding you retract costs more than
   the minute it takes to check.
3. **Write the test red-first**, against the real mechanism.
4. **Fix it.**
5. **Falsify:** break the mechanism, watch the assertion *about that mechanism* go red, restore.
6. **Green-after:** run the whole suite **in the state the feature is actually used in**. This is
   the half that gets skipped. See below.
7. **Verify at the boundary that matters** — the URL, the pixels, `/api/health`.
8. **Commit with an explicit pathspec.**
9. **Report what you measured**, and say plainly what you did not.

---

## Falsification, properly

**Red-first proves a guard *can* fail. Green-after proves the feature *works*.**

I shipped a commit having done only the first: planted a mark, watched the new assertion redden,
removed the mark, committed, and wrote *"nothing is marked yet; this commit is only the machinery."*
Two other assertions in the same file still used the old denominator. The next agent to use the
feature for real found both.

> A feature whose real state does not exist yet is exactly where green-after gets skipped.

### Mutate and revert safely

```python
# ALWAYS assert the occurrence count. A non-unique anchor silently edits the wrong site.
assert s.count(old) == 1, f'occurrences={s.count(old)}'
```

I skipped this on a *revert* and restored the wrong line: `['plan','agent','super']` appears twice,
and `PRODUCT_MODES` briefly lost a mode it must keep. **Read `git diff` after every revert.**

**Never `cp` a whole-file backup over a source file.** A peer may edit it between your backup and
your restore. I destroyed in-flight work in `index.ts` three times before noticing.

### When the break turns nothing red

Two causes account for most of it (all six are in `docs/FAILURES.md` F-58):

- **Mis-aimed break** — see the count assertion above.
- **A different guard failed first**, the run stopped, and yours never executed. It reports red and
  proves nothing. Make the planted state *internally consistent* — if you add a mark, update the
  totals too — so the assertion you are aiming at is the one that fires. This cost me three attempts
  on one guard: first a neighbouring test fired, then the file threw at load, and only the third try
  reached the assertion.

---

## The shared checkout

Several agents edit one tree simultaneously.

```bash
git diff --cached --stat          # read this BEFORE every commit
git commit -F /tmp/msg.txt -- path/one path/two    # the `--` goes LAST
```

`git commit` writes the **whole index**, so staging explicit paths does not protect you from what a
peer staged. The pathspec form is what does.

Forbidden: `git add -A`, `git add -u <path>`, `git checkout`, `git switch`, `git stash`,
`git reset`, `pnpm install` (F-68: it rewrites the main checkout's workspace symlinks).

A peer's red test is not yours — check `git diff --name-only`, and say whose it is in your report.

---

## Deploying

```bash
node infra/deploy-static.mjs            # site + web; fetches each page back and compares sha256
node infra/deploy-worker.mjs apple      # stamps BUILD_SHA from git, then asks /api/health
```

Both end by checking what they deployed, because **uploading is not deploying**. Do not bypass them
with a bare `wrangler deploy`: that is how `BUILD_SHA` went stale.

Do not deploy the worker while a peer has `apps/worker/src` mid-edit. `npx tsc --noEmit -p
apps/worker/tsconfig.json` clean plus a green suite is the minimum.

---

## Dispatching an agent

Eight ran in one session. What made the good ones good:

**Give it the hard rules verbatim.** Every brief opens with the shared-checkout rules and the
never-`cp` rule. Agents that got them broke nothing; the one session that broke a peer's work was
mine, before I wrote them down.

**Name the files it may NOT touch.** Disjoint lanes are what let eight agents run at once.

**Tell it to read what exists first.** The best result of the session began *"The bot was not a bare
stub — `/build`, `/status`, `/link` and the Ed25519 verification were all already built, so I read
it end to end and closed the three real gaps rather than rewriting working code."* Two others
reported the same shape. **The default assumption should be that the feature is half-built, not
absent.**

**Demand red-first explicitly**, in those words, and ask for the falsification table in the report.

**Say what an honest failure looks like.** "If the honest conclusion is that this needs a capability
that does not exist, say so plainly and build the part that does work." The thumbnail agent came
back with *"a full-resolution thumbnail is not reachable and I did not fake one"* — worth more than
a fabricated one.

**Let it refuse.** One agent found two defects in *my* commit and declined to fix them because they
were the guard policing its own work: *"editing the guard that polices my own marks is the one thing
that would make this change worthless."* It was right, and it flagged them instead. Brief for that.

---

## Reporting

The owner is non-technical, reads Hebrew, and reads neither `docs/` nor code.

- Lead with **what changed for him**.
- A percentage of the **whole product** and of the **current task**.
- Say plainly when something is **not deployed**, or when you did not verify it.
- When you were wrong: one sentence, then move on.
- Never report a suite as passing that you have not just run.

# Handoff: the largest failure bucket has no reason attached to it

**Written 2026-09-20 by the billing lane. Not applied here, because
`apps/worker/src/do/session.ts` was dirty in another lane's hands all evening
(89 uncommitted lines of rate-limit retry work) and the shared-checkout rule
says read it, do not edit it.**

Ledger row: `failed-runs-must-not-charge` — *"למה ריצות כל הזמן על בסיס קבוע
נכשלות וגובות קרדיטים"*. Its stated next step was two halves:

1. **Deploy HEAD so the refund path is live.** DONE. `apple` serves build
   `c74b4a7`, verified at `GET https://apple.moshe-barami111.workers.dev/api/health`
   on 2026-09-20 23:20 UTC. `run-refund.ts` and the refund block in `finishRun`
   are both in that commit. What is *not* claimed: no run was made to fail on
   purpose, so the refund has been proved present in the deployed code and has
   not been watched paying a Credit back in production.
2. **Instrument the unexplained `error` terminal state.** This document.

---

## What is actually missing

`RunFailure` is a four-value vocabulary and every call site already passes it.
From `packages/shared/src/index.ts`, `RUN_FAILURES`:

| code | means |
|---|---|
| `busy` | upstream rate limit |
| `interrupted` | run went stale between steps |
| `dropped_step` | inference failed past step 1 |
| `model_failed` | unclassified step failure |

Every `error` ending in the committed `session.ts` at `c74b4a7` carries one:

```
3221:      await this.finishRun(agent, 'error', 'interrupted');
3249:        await this.finishRun(agent, 'error', 'busy');
3262:        await this.finishRun(agent, 'error', 'dropped_step');
3284:      await this.finishRun(agent, 'error', 'model_failed');
```

It is **broadcast and then thrown away**. Line 4353 sends it to whoever has the
socket open:

```ts
this.broadcast({ type: 'msg_end', msgId: agent.msgId, stopReason: reason, error, creditsSpent: agent.creditsSpent });
```

and line 4366, eleven lines later, files all four under one label:

```ts
outcome: reason === 'done' ? (buildOutcome ?? 'done') : reason,
```

so the build event says `error` and nothing else. The refund's own oplog row,
lines 4272–4273, has the same hole:

```ts
? `run produced no usable output (${buildOutcome ?? reason}); asked ${asked}, returned ${returned}`
: `run produced no usable output (${buildOutcome ?? reason}); asked ${verdict.credits}, the ledger did not answer`
```

`buildOutcome` is `undefined` on every `error` ending, so that reads
`run produced no usable output (error)`.

**The consequence.** `error` is one of the two largest outcome buckets and the
fleet cannot say why any of it happened. The owner's question is *why do runs
keep failing and charging Credits*; the refund half now answers "they should not
charge", and the *why* half is answerable only one project at a time, by hand,
out of `messages` rows. This is the same shape as the `finishReason` defect that
`analytics.ts` already documents at line 364: a failure we can watch happening
with no number attached to it anywhere.

**It is not currently a wrong refund.** `refundVerdict` refunds on
`reason: 'error'` regardless of the code, so the decision is right today. What is
missing is the record taken *before* the decision — which is exactly what the
ledger row asks for, and what any future rule that treats `busy` differently from
`model_failed` would need.

**It matters more this week, not less.** The uncommitted `session.ts` work in
the other lane adds a 5s/15s/30s retry ladder for `busy`. Whether that ladder
works is measurable only if `busy` is distinguishable from the other three in
the build log. Right now it is not.

---

## The patch

Three edits. None of them changes a refund decision; all three write down a value
the process already has in hand.

### 1. `apps/worker/src/analytics.ts` — carry the code

The build event interface ends at line 375 with `finishReason: string | null;`.
Add beside it:

```ts
  /**
   * WHICH failure, on a run that ended `error`. Null on every other outcome and on a run
   * persisted by an older deploy.
   *
   * `outcome: 'error'` was one label over four distinct causes — an upstream rate limit, an
   * evicted instance, inference failing past step 1, and everything else — and the code that
   * tells them apart was broadcast to the open socket and then dropped. Closing the tab was
   * the only thing between us and knowing why the fleet's runs fail.
   */
  runFailure: RunFailure | null;
```

and in the parser at line ~497, next to `finishReason`:

```ts
  runFailure: isRunFailure(o['runFailure']) ? o['runFailure'] : null,
```

`isRunFailure` is already exported from `@golem/shared` (index.ts:2647). Use it
rather than a second copy of the list — the four codes must have exactly one
declaration.

### 2. `apps/worker/src/do/session.ts` line ~4366 — record it

In the `recordEvent({ kind: 'build', … })` call, beside `finishReason`:

```ts
  runFailure: error ?? null,
```

`error` is already the `RunFailure | undefined` parameter of `finishRun`; nothing
new has to be computed or plumbed.

### 3. `apps/worker/src/do/session.ts` lines 4272–4273 — say it in the ledger too

```ts
? `run produced no usable output (${buildOutcome ?? error ?? reason}); asked ${asked}, returned ${returned}`
: `run produced no usable output (${buildOutcome ?? error ?? reason}); asked ${verdict.credits}, the ledger did not answer`
```

The precedence matters and is deliberate: `buildOutcome` first because
`timeout`/`step_limit` are finer than `error`, then `error` because it is finer
than `reason`, then `reason`.

---

## How to falsify it

The guard this needs is one that fires when a failure loses its reason again.
Aim it at the property, not the spelling:

- Plant `finishRun(agent, 'error')` with no code at one of the four call sites
  above and assert the build event's `runFailure` is null while `outcome` is
  `error` — that is the state this whole document is about, and the assertion
  should name it rather than merely counting fields.
- Then assert the four call sites each still pass a code. Read them out of the
  source with a regex over `finishRun\(agent, 'error'` and assert the count is
  four **and** that every match has a second argument — a count alone passes
  when a fifth call site is added without one.
- Do not pin the exact argument spellings. The last eight guards in this
  repository that pinned an expression went red when the code improved.

## What this handoff does not know

Whether the other lane's uncommitted `session.ts` work moves any of the line
numbers above. They are taken from `git show c74b4a7:apps/worker/src/do/session.ts`,
which is the committed file, not the working tree. Re-derive them before editing:

```
git show c74b4a7:apps/worker/src/do/session.ts | grep -n "finishRun(agent, 'error'\|outcome: reason === 'done'\|run produced no usable output"
```

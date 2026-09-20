# Handoff: three defects in the agent tool loop that I could not fix myself

<!-- A and B were written 2026-09-20; C was added 2026-09-21 by a later lane that found
     session.ts still held. The count in this title is the count of sections below. -->


`apps/worker/src/do/session.ts` was being edited by another lane while this was written, so it was
read and measured but **not touched**. Both defects below are in that file. Everything here is
either quoted from the file or measured by a command written out in full, so whoever owns the file
can apply it without re-deriving anything.

Written 2026-09-20 against working-tree `session.ts` at commit `ac4a7b1`, which had 89 uncommitted
lines from the other lane. **Line numbers will have moved. Anchor on the quoted code, not the
numbers.**

Origin: the owner's screenshots of 2026-09-20 — `propose_plan` called five times and refused as a
duplicate while the model kept retrying — and his message of `2026-09-20T00:19`, recovered from
`~/.claude/projects/-Users-moshe-Desktop-RbxAI/*.jsonl`:

> למה ריצות כל הזמן על בסיס קבוע נכשלות וגובות קרדיטים
> ("why do runs constantly fail and charge credits")

Finding A sends the provider a request this repository knows to be malformed. Finding B burns a
run's whole step budget and builds nothing. **Neither is cleanly a "charged for nothing" defect any
more** — commit `1443b8f` refunds both of the endings they produce, unless the run had already
changed the place, in which case the Credits are kept and the user still has to start the build
again. That last case is the "paid twice for one build" shape `run-refund.ts`'s own header names,
and the refund rule does not catch it by design. Fixing these two removes the cause rather than
arguing about the refund.

---

## A. The 5th tool call in a turn reaches the provider as an unanswered `tool_call`

**Severity: this is not "a dropped call".** The turn is recorded as having made calls that were
never answered, and that record is what goes back to the provider on every later step of the run.

### What the code does

`session.ts` ~3883 pushes the assistant turn with **every** tool call the model emitted:

```ts
agent.llm.push({ role: 'assistant', content: res.text ?? '', toolCalls: res.toolCalls });
```

`session.ts` ~3887 then executes only the first four:

```ts
for (const call of res.toolCalls.slice(0, 4)) {
```

Only an executed call gets its `{ role: 'tool', toolCallId }` reply. Calls 5..N never get one, and
they are still in `agent.llm` on the next round trip. `grep -n "toolCalls.slice\|toolCalls.length >"`
over `apps/worker/src` finds exactly one hit — this line. Nothing trims `m.toolCalls` before encoding.

Both encoders on the live path render the full list verbatim:

- `apps/worker/src/providers/workers-ai.ts:281` — the path `apple` (`clay`) and `apple-max`
  (`stone`) actually take; both are `nativeTools: true` in `gateway.ts:104,139`.
- `apps/worker/src/providers/openai.ts:65`.

`orphanedToolMessages` in `apps/worker/src/transcript.ts:141` is the repository's only invariant
check here, and it is blind to this by construction: it collects call ids and reports `tool`
messages that answer none of them — the opposite direction. Its own doc comment claims both
("every assistant tool call must have its result"); only one half is implemented.

### Measured, not inferred

Reproduction, run from `apps/worker` (it bundles the real encoder, no network):

```bash
./node_modules/.bin/esbuild src/providers/openai.ts --bundle --format=esm --target=es2022 --outfile=/tmp/oa.mjs
node --input-type=module -e "
const { encodeOpenAiChat } = await import('file:///tmp/oa.mjs');
const calls = [1,2,3,4,5].map(i => ({ id: 'tc_'+i, name: 'create_instances', arguments: '{}' }));
const msgs = encodeOpenAiChat({ modelId: 'm', maxTokens: 100, temperature: 0, messages: [
  { role: 'assistant', content: '', toolCalls: calls },                                  // session.ts:3883
  ...calls.slice(0,4).map(c => ({ role: 'tool', content: 'ok', toolCallId: c.id, name: c.name })), // session.ts:3887
]}).payload.messages;
const ids = msgs.flatMap(m => (m.tool_calls ?? []).map(c => c.id));
const answered = new Set(msgs.filter(m => m.role === 'tool').map(m => m.tool_call_id));
console.log('tool_call ids on the wire :', ids.join(','));
console.log('tool results on the wire  :', [...answered].join(','));
console.log('UNANSWERED tool_call ids  :', ids.filter(i => !answered.has(i)).join(',') || '(none)');
"
```

`orphanedToolMessages` is checked separately, against the same `messages` array, to show it reports
nothing here:

```bash
./node_modules/.bin/esbuild src/transcript.ts --bundle --format=esm --target=es2022 --outfile=/tmp/tr.mjs
# orphanedToolMessages(llm) -> []
```

Output on 2026-09-20:

```
tool_call ids on the wire : tc_1,tc_2,tc_3,tc_4,tc_5
tool results on the wire  : tc_1,tc_2,tc_3,tc_4
UNANSWERED tool_call ids  : tc_5
```

and `orphanedToolMessages(llm)` over the same array returns `[]`.

**What that measurement does and does not establish.** It establishes that this repository puts an
unanswered `tool_call` on the wire — that is code in this tree, and it is now reproduced above.
It does **not** establish what the provider does with it. An OpenAI-shaped chat API documents a
rejection for exactly this shape, and `session.ts:3330` already has a `/inference failed/` branch
that ends the run `'error'`/`dropped_step`. Whether `@cf/zai-org/glm-5.3-flash` behind Workers AI
rejects it, tolerates it, or silently mis-reads the turn **was not probed** — doing so means a live
paid call, which CI must never make and which was not made here. Treat the provider's reaction as
unknown and the malformed request as the defect; it is one either way.

### The patch

Do not widen the slice — four concurrent mutating tools per turn is a deliberate bound. Make the
recorded turn match what was executed, so history cannot describe work that never happened:

```ts
    // record the assistant turn with STRUCTURED tool calls; the gateway renders them in whatever
    // form the target model expects.
    //
    // SLICED TO THE SAME BOUND AS THE LOOP BELOW, and that is not tidiness. Only an executed call
    // gets a `role:'tool'` reply, and both encoders on the live path
    // (providers/workers-ai.ts:281, providers/openai.ts:65) put every entry of `toolCalls` on the
    // wire. Recording five and answering four sends the provider an assistant turn with an
    // unanswered tool_call, which an OpenAI-shaped API rejects — after the step that produced it
    // was billed. `orphanedToolMessages` cannot see it: it only checks the other direction.
    const executable = res.toolCalls.slice(0, MAX_CALLS_PER_TURN);
    agent.llm.push({ role: 'assistant', content: res.text ?? '', toolCalls: executable });
```

with `const MAX_CALLS_PER_TURN = 4;` beside `MAX_NUDGES` (`session.ts:377`), and the loop reading
`for (const call of executable) {`.

The dropped calls must not vanish silently — the model asked for them. Immediately after the loop,
before the `BUILD_TOOLS` nudge:

```ts
    if (res.toolCalls.length > executable.length) {
      agent.llm.push({
        role: 'user',
        content: `Only the first ${executable.length} of your ${res.toolCalls.length} tool calls ran. The rest were not executed. Call them again next step if you still need them.`,
      });
    }
```

### Falsification this patch must survive

Extend `orphanedToolMessages` to check both directions (its comment already claims it does), then
assert over a run whose model emitted five calls that the set is empty. Watch it RED by restoring
`toolCalls: res.toolCalls` in the assistant push.

---

## B. The duplicate-call refusal spends a paid step and the model loops anyway

### What the code does

`session.ts` ~3892:

```ts
      if (agent.seenCalls.includes(sig)) {
        // the model is looping — refuse the duplicate and steer it back to building
        this.broadcast({ type: 'tool_start', ... });
        this.broadcast({ type: 'tool_end', ..., ok: false, summary: `↺ ${call.name} (already done)` });
        agent.llm.push({ role: 'tool', content: `[${call.name}] You already made this exact call earlier in this run ...`, toolCallId: call.id, name: call.name });
        continue;
      }
```

The refusal itself is right: it is cheap, it does not re-run the tool, and it does not lie. What is
wrong is what happens **after** it. `continue` falls to the end of the step; the step tail sets an
alarm (`session.ts` ~4026), `agent.step += 1` at 3384, and the next alarm makes a **full paid
inference call**. A step in which *every* call was a duplicate produced no tool result, no
mutation, and no new information — and still cost one inference and one of `maxSteps` (16 for
`stone`, `maxStepsFor` at 3384/3399).

The owner's screenshot is five of those in a row. Five paid round trips, five of sixteen steps, and
the reply the user eventually gets is written by a model that never did anything.

**Correcting a claim it would be easy to make here.** This is *not* currently a case of the customer
being charged for nothing. If the loop runs the step budget out, `session.ts:3401` exits with
`finishRun(agent, 'done', …, 'step_limit')`, and `'step_limit'` is in `REFUNDABLE_OUTCOMES`
(`run-refund.ts:81`), so since commit `1443b8f` tonight those Credits come back. What the loop
actually costs is the whole run — up to `maxSteps` paid inferences on our side, the wall-clock the
owner spends watching it, and a build that never happens. The patch below turns that from sixteen
steps into two. Whether the owner's 2026-09-20 runs pre-dated `1443b8f` and therefore *did* charge
him is not something this repository records, and is not claimed.

There is no streak counter anywhere: `grep -n "seenCalls" apps/worker/src/do/session.ts` returns
only the declaration (210) and this loop.

### The patch

Add to `AgentState`, beneath `seenCalls?: string[];` (~210):

```ts
  /** consecutive steps in which EVERY tool call was refused as a duplicate; any real call resets it */
  duplicateSteps?: number;
```

In the tool loop, before `for (const call of executable) {`:

```ts
    let progressed = false;
```

and immediately after `agent.seenCalls.push(sig);`:

```ts
      progressed = true;
```

After the loop and after the existing `agent.status === 'stopping'` check, before the `BUILD_TOOLS`
nudge:

```ts
    // A STEP THAT WAS ENTIRELY DUPLICATES BOUGHT NOTHING, AND THE NEXT ONE COSTS A FULL INFERENCE.
    //
    // MEASURED, the owner's own screenshots of 2026-09-20: propose_plan called five times, refused
    // as a duplicate five times, the model retrying identical arguments each time. The refusal
    // above is correct and cheap; what it could not do was stop. Each refused step still burned one
    // paid model round trip and one of maxSteps, and the run's final prose was written by a model
    // that had changed nothing.
    //
    // Two, not one: a single repeated call is a stumble models recover from. Two consecutive steps
    // that produced nothing but repeats is the loop, and it does not recover on its own.
    if (res.toolCalls.length && !progressed) {
      agent.duplicateSteps = (agent.duplicateSteps ?? 0) + 1;
      if (agent.duplicateSteps >= 2) {
        await this.finishRun(agent, 'incomplete');
        return;
      }
    } else {
      agent.duplicateSteps = 0;
    }
```

`'incomplete'` and not `'done'` deliberately: the run owes work, and `finishRun(agent, 'incomplete')`
is the existing verdict for exactly that (`session.ts` ~3877, "A run that still owes work has FAILED,
and must not be reported as success").

Measured against `apps/worker/src/run-refund.ts` as it stands after commit `1443b8f`, for a `stone`
run with `mutated: false`, no artifact and the product's own failure note rather than model prose:

```
incomplete  {"refund":true,"credits":30,"why":"no_usable_output"}
done        {"refund":false,"credits":0,"why":"not_a_failure"}
error       {"refund":true,"credits":30,"why":"no_usable_output"}
stopped     {"refund":false,"credits":0,"why":"not_a_failure"}
quota       {"refund":true,"credits":30,"why":"no_usable_output"}
```

So the early exit refunds. **Do not use `'done'` here** — `'done'` is `not_a_failure` and would
charge for a run that did nothing, re-opening the defect `1443b8f` closed.

### Falsification this patch must survive

A test that drives two consecutive steps whose every call repeats a `sig` already in `seenCalls`,
and asserts the run finished `incomplete` and made exactly two inference calls. Watch it RED by
raising the threshold to a number above `maxSteps`.

### What is NOT diagnosed here

**Why** the model re-emits byte-identical `propose_plan` arguments after being told not to. That
needs a live run with the transcript captured; nothing in this repository records it. Do not ship a
prompt change for it on a guess. The patch above bounds the cost of the loop; it does not explain it.

---

## What was checked and found NOT to be a defect

The brief that produced this file said the Studio plugin "appears to send no `checkpointEligible`
and no `restorable` at all". That is true of `apps/plugin/src` and irrelevant: commit `f6ad60a`
marked `apps/plugin` NOT THE PRODUCT and named `apps/apple-plugin` as what ships.
`apps/apple-plugin/src/Commands.luau:2932` emits `format`, `checkpointId`, `restorable`,
`checkpointEligible`, `truncated`, `skipped`, `protected`, `coverage` and `wholePlaceComplete` —
every field `checkpoint-evidence.ts` demands. There is no missing-field bug. The worker-side half of
that item (one sentence for three causes) was real and is fixed in commit `ac4a7b1`.

---

# Addendum, 2026-09-21: a third defect in the same file

Added by a later lane. `apps/worker/src/do/session.ts` was **still dirty** when this was written —
89 uncommitted lines from the rate-limit lane, `git status --porcelain` checked before and after —
so it was again read and measured but **not touched**. Line numbers are from that working tree and
**will have moved. Anchor on the quoted code.**

## C. A refusal ends the run on the server and says nothing about it on the wire

### What the code does

`session.ts:1401`:

```ts
  private refuseOne(origin: WebSocket | undefined, msg: ServerMsg) {
    if (origin === undefined) {
      this.broadcast(msg);
      return;
    }
    try {
      origin.send(JSON.stringify(msg));
    } catch {
      /* closed */
    }
  }
```

One frame, then return. Every caller that refuses a *start* returns immediately after it:

| line | code | situation |
|------|------|-----------|
| 2987 | `busy` | `startGate` rejected the attempt |
| 3004 | `busy` | a live run is under `STEP_STALE_MS` |
| 3009 | `forbidden` | `runAccessVerdict` said stop |
| 3014 | `product_model_unavailable` | `productModelVerdict` refused the model |
| 2743, 2817, 2822, 2827, 2832 | `bad_product_model`, `bad_mode`, `product_model_unavailable`, `busy` | the edit-message path |

No `msg_end`, no `run_state`, no terminal event of any kind. `grep -n "type: 'msg_end'\|type: 'run_state'"`
over the file returns exactly three emitters — 1805, 2722 and 4441 — and none of them is on a
refusal path.

### Measured

`infra/e2e.mjs` waited the full 150 seconds on a `product_model_unavailable` and then reported
`chat timeout after 150s`. That harness has since been fixed to reject at once and name the refusal
(commit `ffc25b3`, guarded by `tests/e2e-refusal-diagnosis.test.mjs`) — **which is the harness half,
not this one.** Its new rejection message, `refused with no terminal event: <code>`, is the standing
measurement of this defect: when the worker starts emitting a terminal event, that rejection stops
firing on its own, because `msg_end` will arrive first.

The browser half is also already fixed and is **not** a reason to close this. `apps/web/src/lib/use-project-socket.ts:873`
now clears `running` on any `error` frame, and its own comment says so explicitly: *"The worker
should also emit a terminal event after refusing … a client that stays busy because a server forgot
one message is a defect on its own, and this is the half that does not need the other half to be
right."* What remains open is every consumer that is not that one browser build — the e2e harness,
`infra/real-chat.mjs`, the Discord path, automations, and any future client — all of which are
entitled to believe a run that started has not ended until the wire says so.

### The patch

Do not invent a message type. `run_state` already exists, the client already handles it
(`use-project-socket.ts:738`), and `runSnapshot()` at `session.ts:2617` **already returns `null`
when there is no live run** — so one frame is correct in both directions:

- refused because something else is running (`busy`) → the snapshot is the live run, and the person
  who was refused finally learns what is actually running, which today they are never told;
- refused before anything started (`forbidden`, `product_model_unavailable`, `bad_mode`,
  `bad_product_model`) → `run: null`, which is the terminal event, and `use-project-socket.ts:742`
  clears `running` on it.

`runSnapshot` is async and `refuseOne` is not, so `refuseOne` has to become async and every call
site has to `await` it. That is the whole of the change:

```ts
  /** … existing comment … */
  private async refuseOne(origin: WebSocket | undefined, msg: ServerMsg) {
    const frames: ServerMsg[] = [msg];
    // A REFUSAL IS THE END OF THAT REQUEST, AND THE WIRE HAS TO SAY SO.
    //
    // Every caller below returns straight after this, so without a terminal frame a client that
    // optimistically showed "thinking" has nothing that ever contradicts it. `run_state` is the
    // right frame rather than `msg_end` because there is no message to end: `msg_end` carries a
    // msgId, a stopReason and a settled credit figure, and a request refused before `startRunInner`
    // got past its verdicts has none of the three. `runSnapshot()` returns null when nothing is
    // running, which IS the terminal answer, and returns the live run for a `busy` refusal — which
    // also happens to tell the refused person what is actually running, which today nothing does.
    //
    // MEASURED 2026-09-20: infra/e2e.mjs sat 150s on `product_model_unavailable` and then blamed a
    // timeout. See docs/backlog/HANDOFF-SESSION-AGENT-LOOP.md section C.
    if (msg.type === 'error' && msg.code !== 'role_changed') {
      frames.push({ type: 'run_state', run: await this.runSnapshot() } satisfies ServerMsg);
    }
    if (origin === undefined) {
      for (const frame of frames) this.broadcast(frame);
      return;
    }
    for (const frame of frames) {
      try {
        origin.send(JSON.stringify(frame));
      } catch {
        /* closed */
      }
    }
  }
```

`role_changed` is excluded by name: `session.ts` ~3859 sends it through a plain `ws.send`, not
through `refuseOne`, so today it cannot reach this branch — the exclusion is there so that it stays
true if someone routes it here later. It refuses nothing and announcing "no run" on it would end a
run that is still going, which is this defect's mirror image.

### Falsification this patch must survive

There is no existing test that drives `refuseOne`, which is why it shipped. The guard must be
behavioural, not a source assertion: refuse a start (a `product_model_unavailable` is the cheapest —
`productModelVerdict` refuses before any paid call), and assert the socket received a `run_state`
after the `error`. Watch it RED by deleting the `frames.push`. A source-shape assertion that only
greps for `run_state` near `refuseOne` would pass over a frame sent to the wrong socket, which is
the failure mode `refuseOne` exists to prevent in the first place.

### What is NOT claimed

That this is what the owner saw. His browser has been clearing on `error` since
`use-project-socket.ts:873` landed, so the "always thinking" symptom he reported is addressed on
his screen. This is the protocol half, and its cost today is paid by every non-browser consumer and
by the next client anyone writes.

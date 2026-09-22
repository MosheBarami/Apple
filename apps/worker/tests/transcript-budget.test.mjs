/**
 * THE TRANSCRIPT BUDGET, AND WHY ITS BLIND SPOT WAS A DUPLICATE-MUTATION BUG.
 *
 * An independent review traced this as the highest-impact defect in the worker, and the chain is
 * worth stating because none of the links look dangerous alone:
 *
 *   1. `contentChars` measured `m.content` only.
 *   2. An assistant turn that calls a tool carries its arguments in `toolCalls[].arguments` — a
 *      JSON string holding a whole script body for `edit_script`, a whole tree for
 *      `create_instances`. Routinely the largest strings in the transcript.
 *   3. So `trimTranscript` could not see, and therefore could not trim, the field that grows.
 *   4. The persisted `AgentState` goes to Durable Object storage, capped at 128 KiB.
 *   5. Over that cap the `put` rejects — and the catch path attempted the SAME put, rejected
 *      again, and the exception escaped the alarm handler.
 *   6. The platform retries the alarm from the state persisted BEFORE the step. The paid LLM
 *      call runs again and every mutating tool in that step executes against the user's place a
 *      second time.
 *
 * A budget that cannot see the field that overflows it is not a budget.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { transcriptChars, trimTranscript, turnGroups, KEEP_RECENT_GROUPS } from '../src/transcript.ts';

const sys = { role: 'system', content: 'system prompt' };
const user = { role: 'user', content: 'build me a tycoon', pinned: true };

/** An assistant turn whose SIZE is almost entirely in the tool arguments, as a real one is. */
const callTurn = (bodyChars) => ({
  role: 'assistant',
  content: '',
  toolCalls: [{ id: 'c1', name: 'edit_script', arguments: JSON.stringify({ source: 'x'.repeat(bodyChars) }) }],
});
const toolReply = { role: 'tool', content: 'ok', toolCallId: 'c1', name: 'edit_script' };

test('the budget counts tool-call arguments, not just content', () => {
  const small = transcriptChars([sys, user]);
  const withCall = transcriptChars([sys, user, callTurn(5000)]);
  assert.ok(
    withCall - small > 5000,
    `a 5000-char script body must be visible to the budget; it added only ${withCall - small}`,
  );
});

test('an assistant turn with empty content is not free', () => {
  // This is the exact shape the old metric scored at zero.
  const turn = callTurn(20_000);
  assert.equal(typeof turn.content, 'string');
  assert.equal(turn.content.length, 0);
  assert.ok(transcriptChars([turn]) > 20_000, 'content is empty but the turn is enormous');
});

test('trimming actually shrinks a transcript made of tool arguments', () => {
  const llm = [sys, user];
  for (let i = 0; i < 12; i += 1) llm.push(callTurn(4000), { ...toolReply });
  const before = transcriptChars(llm);
  assert.ok(before > 45_000, `fixture should be large, was ${before}`);
  const trimmed = trimTranscript(llm, 20_000);
  const after = transcriptChars(trimmed);
  assert.ok(after < before, 'trimming must reduce the measured size');
  assert.ok(after <= 20_000 || trimmed.length <= 2 + KEEP_RECENT_GROUPS * 2, `still ${after} over budget`);
});

test('trimming never drops the system prompt or the pinned request', () => {
  // The failure this protects against is on record: the agent kept working with no record of
  // the task. Whatever the budget says, these two survive.
  const llm = [sys, user];
  for (let i = 0; i < 20; i += 1) llm.push(callTurn(8000), { ...toolReply });
  const trimmed = trimTranscript(llm, 1000);
  assert.equal(trimmed[0].role, 'system');
  assert.ok(trimmed.some((m) => m.pinned), 'the pinned user request must survive any budget');
});

test('a trimmed transcript never orphans a tool reply from its call', () => {
  const llm = [sys, user];
  for (let i = 0; i < 10; i += 1) llm.push(callTurn(6000), { ...toolReply });
  const trimmed = trimTranscript(llm, 15_000);
  // Every tool message must be preceded, somewhere earlier, by an assistant turn.
  for (let i = 0; i < trimmed.length; i += 1) {
    if (trimmed[i].role === 'tool') {
      const priorAssistant = trimmed.slice(0, i).some((m) => m.role === 'assistant');
      assert.ok(priorAssistant, `tool message at ${i} has no assistant turn before it`);
    }
  }
});

test('turnGroups keeps the head that persistAgent sheds down to', () => {
  // persistAgent's fallback keeps exactly this head when a put rejects, so the shape matters.
  const llm = [sys, user, callTurn(100), { ...toolReply }];
  const { head, groups } = turnGroups(llm);
  assert.equal(head.length, 2, 'system + pinned user');
  assert.ok(groups.length >= 1);
});

// A trim that stops at the budget drops one group on EVERY later step, and each drop changes the
// transcript right after the system prompt, so the provider's prefix cache misses the whole history
// each time. A trim that stops at a lower target leaves room for several steps of pure appends.
test('once over the budget, a trim goes down to the target, and the next steps are appends', async () => {
  const { trimTranscriptReport, transcriptChars: chars } = await import('../src/transcript.ts');
  const turns = [sys, user];
  for (let i = 0; i < 40; i++) turns.push({ ...callTurn(900), toolCalls: [{ id: `c${i}`, name: 'edit_script', arguments: JSON.stringify({ source: 'x'.repeat(900) }) }] }, { ...toolReply, toolCallId: `c${i}` });
  const max = 20_000, target = 14_000;
  const once = trimTranscriptReport(turns, max, target);
  assert.ok(once.droppedGroups > 0, 'the fixture must be over the budget, or this checks nothing');
  // The run record of the dropped turns is added after the cut, so the target bounds what was KEPT.
  assert.ok(once.after <= target + 3000, `trimmed to ${once.after}, well above the ${target} target`);
  assert.ok(once.after < max - 2000, 'the trim left no room for the next steps to append');
  // Grow it by one step and trim again: still under the budget, so nothing is dropped this time.
  const grown = [...once.llm, { ...callTurn(900), toolCalls: [{ id: 'n1', name: 'edit_script', arguments: JSON.stringify({ source: 'y'.repeat(900) }) }] }, { ...toolReply, toolCallId: 'n1' }];
  assert.ok(chars(grown) <= max);
  assert.equal(trimTranscriptReport(grown, max, target).droppedGroups, 0, 'the step after a trim is an append, not another cut');
  // Without a target the old behaviour stands: trim only to the budget.
  assert.ok(trimTranscriptReport(turns, max).after > target);
});

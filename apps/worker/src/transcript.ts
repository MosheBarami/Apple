// Bounding the agent transcript without destroying it.
//
// THE BUG THIS REPLACES, measured against the code that shipped. The previous implementation was
// `agent.llm.splice(1, 1)` repeated until the character budget was met. Index 1 is simply whatever
// is oldest after the system prompt, so once the run's carried-over history had been evicted the
// next thing removed was THE USER'S OWN REQUEST. With the world-building brief in the system prompt
// (15,048 chars against a 24,000-char cap) and a single step able to append 12,368 chars of tool
// results, a visual Stone build reached `[system, tool, tool, tool]` from step 2 onward: the model
// was still being asked to work, with no record of what it had been asked to do.
//
// The same line had a second failure, reachable rather than constant. The old loop stopped at
// `llm.length > 4`, leaving exactly four messages. When the final step made two tool calls that is
// [system, assistant, tool, tool] and nothing is orphaned; at three or more calls — the loop allowed
// four — the assistant turn is dropped too, leaving [system, tool, tool, tool] with `tool_call_id`s
// that appear nowhere else in the request. Both are reproduced in
// packages/evals/src/transcript.test.mjs rather than asserted from memory.
//
// Both are invisible from outside: nothing errors, the agent simply gets worse the longer it works.
// That is the hardest kind of defect to attribute, and it is the shape of the "narrates instead of
// acting" and "declares the task finished" behaviour already on record for this system.
import type { GatewayMessage } from '@golem/shared';

/** How many recent turn groups are never dropped, so a step always keeps its own working context. */
export const KEEP_RECENT_GROUPS = 2;

/**
 * THE BUDGET HAS TO SEE THE BIGGEST FIELD, and it did not.
 *
 * This measured `content` only. An assistant turn that calls a tool carries its arguments in
 * `toolCalls[].arguments` — a JSON string that holds whole script bodies for `edit_script` and
 * whole instance trees for `create_instances`. Those are routinely the largest strings in the
 * transcript, and `trimTranscript` could not see any of them.
 *
 * The consequence was not a fuzzy "context gets worse". The persisted `AgentState` is written to
 * Durable Object storage, which rejects values over 128 KiB. A long build that edits scripts
 * crosses that, the `put` rejects, the catch path attempts the SAME oversized put and rejects
 * again, and the alarm handler dies. Cloudflare then RETRIES the alarm from the last state
 * persisted before the step — so the LLM call is paid for again and every mutating tool in that
 * step runs against the user's place a second time.
 *
 * A budget that cannot see the field that overflows it is not a budget.
 */
const contentChars = (m: GatewayMessage): number => {
  const body =
    typeof m.content === 'string' ? m.content.length : m.content.reduce((n, p) => n + ('text' in p ? p.text.length : 0), 0);
  const calls = (m as { toolCalls?: { arguments?: string }[] }).toolCalls;
  if (!calls) return body;
  return body + calls.reduce((n, c) => n + (c.arguments?.length ?? 0), 0);
};

export const transcriptChars = (llm: GatewayMessage[]): number => llm.reduce((n, m) => n + contentChars(m), 0);

/**
 * Split a transcript into the head that must never move (system prompt, pinned messages) and the
 * turn groups after it. A group is one assistant turn plus every `tool` message answering it, so a
 * group can be dropped whole without orphaning a tool result from its call.
 */
export function turnGroups(llm: GatewayMessage[]): { head: GatewayMessage[]; groups: GatewayMessage[][] } {
  const head: GatewayMessage[] = [];
  let i = 0;
  while (i < llm.length && (llm[i]!.role === 'system' || llm[i]!.pinned)) head.push(llm[i++]!);

  const groups: GatewayMessage[][] = [];
  while (i < llm.length) {
    const g: GatewayMessage[] = [llm[i++]!];
    while (i < llm.length && llm[i]!.role === 'tool' && !llm[i]!.pinned) g.push(llm[i++]!);
    groups.push(g);
  }
  return { head, groups };
}

/**
 * Drop whole turn groups from the oldest end until the transcript fits, never removing the system
 * prompt, any pinned message, or the most recent groups.
 *
 * When the budget still cannot be met the transcript is returned OVER budget rather than stripped
 * further. That is deliberate: the spend gates already bound what a long prompt can cost, and an
 * expensive step is a much cheaper failure than an agent that has forgotten its instructions.
 */
export function trimTranscript(llm: GatewayMessage[], maxChars: number): GatewayMessage[] {
  return trimTranscriptReport(llm, maxChars).llm;
}

/**
 * What a run's context costs, and what the trim took to make it fit.
 *
 * THE TRIM WAS SILENT, and that is the defect this exists to close. Whole turn groups were dropped
 * from the oldest end with nothing said to anyone: the user asked a follow-up question about
 * something they could still see on screen, the agent had no record of it, and the only signal was
 * an answer that read as forgetfulness. There is no way to tell that apart from a bad model.
 *
 * Two honesty rules decide the shape of this record, and both are about what a report may claim:
 *
 *   * `droppedGroups` counts TURN GROUPS, which is what is actually removed — an assistant turn
 *     plus the tool messages answering it. Counting messages would report "9 dropped" for three
 *     exchanges and make a normal trim look catastrophic.
 *   * `droppedChars` is measured as `before - after`, not summed from the groups as they are
 *     removed. A pinned message inside a dropped group is MOVED INTO THE HEAD rather than lost
 *     (see below), so summing the groups would report characters as gone that are still in the
 *     prompt. The difference of two measurements cannot disagree with the thing it measures.
 */
export interface TrimReport {
  llm: GatewayMessage[];
  /** Size before the trim ran. */
  before: number;
  /** Size of what will actually be sent — over `maxChars` when the budget could not be met. */
  after: number;
  maxChars: number;
  /** Turn groups removed from the oldest end. Zero when the transcript already fitted. */
  droppedGroups: number;
  /** Characters the trim actually removed — `before - after`, never a sum over the groups. */
  droppedChars: number;
}

export function trimTranscriptReport(llm: GatewayMessage[], maxChars: number): TrimReport {
  const before = transcriptChars(llm);
  if (before <= maxChars) {
    return { llm, before, after: before, maxChars, droppedGroups: 0, droppedChars: 0 };
  }

  const { head, groups } = turnGroups(llm);
  let first = 0; // oldest group still kept
  const size = () => transcriptChars(head) + groups.slice(first).reduce((n, g) => n + transcriptChars(g), 0);

  while (size() > maxChars && first < groups.length - KEEP_RECENT_GROUPS) {
    // A pinned message inside a later group is unexpected, but honouring it is cheap and the whole
    // point of this function is that nothing pinned is ever lost.
    if (groups[first]!.some((m) => m.pinned)) head.push(...groups[first]!);
    first++;
  }
  const trimmed = [...head, ...groups.slice(first).flat()];
  const after = transcriptChars(trimmed);
  return { llm: trimmed, before, after, maxChars, droppedGroups: first, droppedChars: before - after };
}

/**
 * A `tool` message answering an assistant turn that is no longer present. Used by the tests, and
 * cheap enough to assert in development if this ever needs debugging again.
 *
 * ONE HALF OF THE INVARIANT. This comment used to claim the other half too — "and every assistant
 * tool call must have its result" — while checking only this direction, which is the shape of
 * defect this repository exists to refuse: a check that reports what it did not look at. The
 * missing half is `unansweredToolCalls` below, and it was missing for a reason that cost something.
 */
export function orphanedToolMessages(llm: GatewayMessage[]): string[] {
  const liveCallIds = new Set<string>();
  for (const m of llm) for (const c of m.toolCalls ?? []) liveCallIds.add(c.id);
  return llm
    .filter((m) => m.role === 'tool' && m.toolCallId && !liveCallIds.has(m.toolCallId))
    .map((m) => m.toolCallId!);
}

/**
 * The other half: an assistant tool call with no `tool` message answering it.
 *
 * WHAT IT IS FOR, MEASURED 2026-09-20. `do/session.ts` records the assistant turn with every tool
 * call the model emitted and then executes `res.toolCalls.slice(0, 4)`. Only an executed call gets
 * a reply, so a turn of five calls leaves the fifth unanswered — and both encoders on the live path
 * (`providers/workers-ai.ts`, `providers/openai.ts`) put the whole list on the wire, because they
 * render `m.toolCalls` verbatim. `orphanedToolMessages` returns `[]` for that transcript: it
 * collects call ids and tests messages against them, so a call nothing answers is invisible to it
 * by construction.
 *
 * Kept separate from `orphanedToolMessages` rather than folded into it, because the two failures
 * have different causes — that one is trimming losing an assistant turn, this one is the loop
 * recording work it did not do — and a single list would say which ids, never which defect.
 *
 * Returns the unanswered call ids, in the order they appear.
 */
export function unansweredToolCalls(llm: GatewayMessage[]): string[] {
  const answered = new Set<string>();
  for (const m of llm) if (m.role === 'tool' && m.toolCallId) answered.add(m.toolCallId);
  const unanswered: string[] = [];
  for (const m of llm) for (const c of m.toolCalls ?? []) if (!answered.has(c.id)) unanswered.push(c.id);
  return unanswered;
}

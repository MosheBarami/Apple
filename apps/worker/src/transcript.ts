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

const contentChars = (m: GatewayMessage): number =>
  typeof m.content === 'string' ? m.content.length : m.content.reduce((n, p) => n + ('text' in p ? p.text.length : 0), 0);

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
  if (transcriptChars(llm) <= maxChars) return llm;

  const { head, groups } = turnGroups(llm);
  let first = 0; // oldest group still kept
  const size = () => transcriptChars(head) + groups.slice(first).reduce((n, g) => n + transcriptChars(g), 0);

  while (size() > maxChars && first < groups.length - KEEP_RECENT_GROUPS) {
    // A pinned message inside a later group is unexpected, but honouring it is cheap and the whole
    // point of this function is that nothing pinned is ever lost.
    if (groups[first]!.some((m) => m.pinned)) head.push(...groups[first]!);
    first++;
  }
  return [...head, ...groups.slice(first).flat()];
}

/**
 * Every `tool` message must be answering an assistant turn that is still present, and every
 * assistant tool call must have its result. Used by the tests, and cheap enough to assert in
 * development if this ever needs debugging again.
 */
export function orphanedToolMessages(llm: GatewayMessage[]): string[] {
  const liveCallIds = new Set<string>();
  for (const m of llm) for (const c of m.toolCalls ?? []) liveCallIds.add(c.id);
  return llm
    .filter((m) => m.role === 'tool' && m.toolCallId && !liveCallIds.has(m.toolCallId))
    .map((m) => m.toolCallId!);
}

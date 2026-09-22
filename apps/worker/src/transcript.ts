// Bounding the agent transcript without destroying it.
//
// THE BUG THIS REPLACES, measured against the code that shipped. The previous implementation was
// `agent.llm.splice(1, 1)` repeated until the character budget was met. Index 1 is simply whatever
// is oldest after the system prompt, so once the run's carried-over history had been evicted the
// next thing removed was THE USER'S OWN REQUEST. With the world-building brief in the system prompt
// (15,048 chars against a 24,000-char cap) and a single step able to append 12,368 chars of tool
// results, a visual Agent build reached `[system, tool, tool, tool]` from step 2 onward: the model
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

/**
 * `targetChars` is where a trim stops once `maxChars` is exceeded. Trimming only to `maxChars` drops
 * one group on every step once the run is at the budget, and every drop changes the transcript right
 * after the system prompt — so the provider's prefix cache (cached input is a fifth of the price)
 * misses the whole history on every one of those steps. Trimming further, to `targetChars`, makes the
 * next several steps pure appends that the cache serves.
 */
export function trimTranscriptReport(llm: GatewayMessage[], maxChars: number, targetChars: number = maxChars): TrimReport {
  // The repair runs on EVERY step, not only on a step that is over budget, because the defect it
  // answers has nothing to do with size — see `answerOnlyWhatRan`. `before` is measured after it so
  // that `droppedChars` keeps meaning exactly one thing: what the group trim below removed.
  const answered = answerOnlyWhatRan(llm);
  const before = transcriptChars(answered);
  if (before <= maxChars) {
    return { llm: answered, before, after: before, maxChars, droppedGroups: 0, droppedChars: 0 };
  }

  const { head, groups } = turnGroups(answered);
  let first = 0; // oldest group still kept
  const size = () => transcriptChars(head) + groups.slice(first).reduce((n, g) => n + transcriptChars(g), 0);

  const dropped: GatewayMessage[][] = [];
  const goal = Math.min(maxChars, targetChars);
  while (size() > goal && first < groups.length - KEEP_RECENT_GROUPS) {
    // A pinned message inside a later group is unexpected, but honouring it is cheap and the whole
    // point of this function is that nothing pinned is ever lost.
    if (groups[first]!.some((m) => m.pinned)) head.push(...groups[first]!);
    else dropped.push(groups[first]!);
    first++;
  }
  const withLedger = recordDropped(head, dropped);
  const trimmed = [...withLedger, ...groups.slice(first).flat()];
  const after = transcriptChars(trimmed);
  return { llm: trimmed, before, after, maxChars, droppedGroups: first, droppedChars: before - after };
}

/**
 * A DROPPED TURN MUST LEAVE A RECORD, or the agent repeats it.
 *
 * Measured 2026-09-22 (coin game, run 76b59615): the system prompt takes ~15k of the 24k budget, so
 * from the fourth step on only the last two turn groups survived. The run built eight coins and both
 * scripts in its first eight steps, then — holding no record that it had — tried to create the coins
 * again ("game.Workspace already contains a child named Coin1") and spent 40 more paid steps
 * re-reading the tree and its own scripts until the duplicate guard ended it. The playtest step it
 * had planned never ran. 55 groups dropped, 195 Credits.
 *
 * So each dropped group is written down as one line — the tool, what it was aimed at, and whether it
 * succeeded — in a single pinned message after the head. The record accumulates across steps (a turn
 * dropped on step four is still done on step forty) and is bounded, keeping the newest lines, so it
 * cannot become the thing that overflows the budget.
 *
 * IT CARRIES NO TOOL OUTPUT, AND IT IS THE MODEL'S OWN VOICE. Every tool result reaches the transcript
 * inside fenceToolOutput's <untrusted-tool-output> tag (packages/evals security.test.mjs, A5). The
 * first version of this record quoted the first words of each result into a USER-role message — Studio
 * content re-entering the transcript unfenced, as the user. So the record is an ASSISTANT turn (it
 * reports what "you" did, which is what an assistant turn is), a result is reduced to done/failed by
 * reading only whether its JSON carries `error`, and a target keeps only path-like characters.
 */
export const LEDGER_MAX_CHARS = 3_000;
// "Do not repeat them" is about CHANGES. A read whose result was dropped is not remembered here — only
// that it ran — and run 6133d093 (2026-09-23) answered "the earlier reads came back summarized, so I
// can't quote the part names" instead of reading the one model again. Say that a detail can be re-read.
const LEDGER_HEADER =
  'Run record: earlier steps of this run were shortened to save space. They already happened and their '
  + 'effects are in the place — do not redo those changes. Their results are no longer shown; if you need a '
  + 'detail from one, read it again with a narrow target:';

function recordDropped(head: GatewayMessage[], dropped: GatewayMessage[][]): GatewayMessage[] {
  const lines = dropped.flatMap(groupLines);
  if (lines.length === 0) return head;
  const at = head.findIndex((m) => m.ledger);
  const previous = at >= 0 ? ledgerLines(head[at]!) : [];
  const all = [...previous, ...lines];
  // Keep the newest lines; say how many older ones were folded away rather than dropping them silently.
  let kept = all;
  let omitted = 0;
  const render = () => [LEDGER_HEADER, ...(omitted ? [`- (${omitted} older steps not listed)`] : []), ...kept].join('\n');
  while (kept.length > 1 && render().length > LEDGER_MAX_CHARS) {
    const olderLine = kept[0]!;
    kept = kept.slice(1);
    omitted += /^- \(\d+ older steps not listed\)$/.test(olderLine) ? Number(/\d+/.exec(olderLine)![0]) : 1;
  }
  const ledger: GatewayMessage = { role: 'assistant', content: render(), pinned: true, ledger: true };
  const out = head.filter((m) => !m.ledger);
  out.push(ledger);
  return out;
}

function ledgerLines(m: GatewayMessage): string[] {
  const text = typeof m.content === 'string' ? m.content : '';
  return text.split('\n').slice(1).filter((l) => l.startsWith('- '));
}

const squash = (s: string, n: number): string => {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
};

const textOf = (m: GatewayMessage): string =>
  typeof m.content === 'string' ? m.content : m.content.map((p) => ('text' in p ? p.text : '')).join(' ');

/** Only characters an instance path, a script name or a search term needs — never markup or quotes. */
const plain = (s: string): string => s.replace(/[^\w .:\-\[\]]/g, '');

/** done or failed, read from whether the fenced JSON result carries `error`. Never its content. */
function outcome(reply: GatewayMessage | undefined): string {
  if (!reply) return 'no result recorded';
  const text = textOf(reply);
  const open = text.indexOf('>\n');
  const close = text.lastIndexOf('\n</untrusted-tool-output>');
  const body = open >= 0 && close > open ? text.slice(open + 2, close) : text;
  try {
    const v = JSON.parse(body) as unknown;
    return v && typeof v === 'object' && 'error' in (v as object) ? 'failed' : 'done';
  } catch {
    return 'done';
  }
}

/** What a call was aimed at, from the argument fields that name a target. Empty when none parse. */
export function aim(args: string | undefined): string {
  let a: unknown;
  try { a = JSON.parse(args || '{}'); } catch { return ''; }
  if (!a || typeof a !== 'object') return '';
  const o = a as Record<string, unknown>;
  if (Array.isArray(o.items)) {
    const names = o.items.map((i) => (i && typeof i === 'object' ? (i as Record<string, unknown>).name : undefined))
      .filter((n): n is string => typeof n === 'string').map(plain);
    return `${o.items.length} item(s)${names.length ? `: ${names.slice(0, 8).join(', ')}` : ''}`;
  }
  for (const k of ['path', 'target', 'root', 'parent', 'name', 'query', 'title']) {
    if (typeof o[k] === 'string' && o[k]) return plain(String(o[k]));
  }
  return '';
}

function groupLines(g: GatewayMessage[]): string[] {
  const [lead, ...replies] = g;
  if (!lead) return [];
  // An earlier user turn is dropped without being quoted: echoing a person's words into an
  // assistant turn would put them in the model's mouth. Only this run's own tool calls are listed.
  if (lead.role !== 'assistant') return [];
  const calls = lead.toolCalls ?? [];
  if (calls.length === 0) return [];
  return calls.map((c) => {
    const reply = replies.find((r) => r.toolCallId === c.id);
    const target = squash(aim(c.arguments), 100);
    return `- ${plain(c.name)}${target ? ` (${target})` : ''} → ${outcome(reply)}`;
  });
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

/**
 * Return a transcript in which every assistant tool call has a `tool` message answering it, by
 * removing the calls that nothing answered.
 *
 * WHY THIS LIVES HERE AND NOT WHERE THE DEFECT IS CAUSED. `do/session.ts` records the assistant
 * turn with EVERY tool call the model emitted — `agent.llm.push({ role: 'assistant', ..., toolCalls:
 * res.toolCalls })` — and then executes `res.toolCalls.slice(0, 4)`. A turn of five calls leaves the
 * fifth with no result, and both live encoders (`providers/workers-ai.ts`, `providers/openai.ts`)
 * render `m.toolCalls` verbatim, so that unanswered call goes to the provider. Measured 2026-09-20
 * against the real openai encoder: `UNANSWERED tool_call ids : tc_5`.
 *
 * THAT IS STILL A DEFECT IN THE LOOP AND THIS DOES NOT CLOSE IT. A run should not silently discard
 * the model's fifth call in the first place; the fix for that is `docs/backlog/
 * HANDOFF-SESSION-AGENT-LOOP.md` §A, in a file another lane holds. What this closes is a DIFFERENT
 * invariant, and it is this module's own to keep: whatever the loop records, what leaves here is a
 * well-formed transcript. Both are needed. If §A lands, this becomes a guard that never fires —
 * which is the correct end state for it, not a reason to delete it.
 *
 * Three decisions worth stating, because each one is a way this could have lied:
 *
 *   * It removes the CALL, never the assistant's prose. A turn that said something and then
 *     overflowed keeps what it said; only the claim to have called a tool goes.
 *   * An assistant message left with no calls AND nothing to say is dropped whole, because an
 *     assistant turn with empty content and no tool calls is not a record of anything, and some
 *     providers reject it outright.
 *   * It is NOT reported through `TrimReport`. The context_budget event tells a builder what their
 *     conversation lost; this removes a record of work that never happened, which is not a loss
 *     they took. Counting it there would describe context truncation that did not occur — the same
 *     reasoning the caller in do/session.ts already applies to `collapseArtDirection`.
 *
 * Returns the INPUT ARRAY UNCHANGED when there is nothing to repair, so the common path allocates
 * nothing and `trimTranscript(fits, huge) === fits` stays true.
 */
export function answerOnlyWhatRan(llm: GatewayMessage[]): GatewayMessage[] {
  const unanswered = new Set(unansweredToolCalls(llm));
  if (unanswered.size === 0) return llm;
  const out: GatewayMessage[] = [];
  for (const m of llm) {
    if (!m.toolCalls?.length) {
      out.push(m);
      continue;
    }
    const kept = m.toolCalls.filter((c) => !unanswered.has(c.id));
    if (kept.length === m.toolCalls.length) {
      out.push(m);
      continue;
    }
    if (kept.length > 0) {
      out.push({ ...m, toolCalls: kept });
      continue;
    }
    // No calls survived. Keep the turn only if it carries prose or is pinned, and drop the
    // `toolCalls` key entirely rather than setting it to undefined — the encoders read the field,
    // and a present-but-undefined key is one more shape for them to have to be right about.
    if (isEmptyContent(m.content) && !m.pinned) continue;
    const { toolCalls: _removed, ...rest } = m;
    out.push(rest);
  }
  return out;
}

/** Whether a message says nothing at all — either form `content` can take. */
function isEmptyContent(content: GatewayMessage['content']): boolean {
  return typeof content === 'string' ? content.trim() === '' : content.length === 0;
}

/**
 * WHAT A RUN THOUGHT, DID AND READ, IN THE ORDER IT HAPPENED — the model behind the turn's AI
 * Elements Reasoning, Task and Sources (owner, 2026-10-01).
 *
 * The worker streams three things beside the reply (packages/shared ServerMsg):
 *
 *   reasoning_delta { msgId, step, text }  the model's own reasoning, step by step
 *   tool_start / tool_end                   the work each step did
 *   sources { msgId, sources }              where the answer's facts came from
 *
 * This module is pure so `node --test` can drive it frame by frame. The socket hook calls it; the
 * turn renders what it returns. Nothing here is invented: a reasoning block exists only because
 * reasoning text arrived, and its clock is the arrival of frames this client watched.
 *
 * THE ORDER. `trace` lists reasoning blocks and tool starts as they arrived, so several steps render
 * as several Reasoning blocks with each step's tools between them. A reasoning block is OPEN while
 * its step streams and CLOSES — collapses to "Thought for N seconds" — the moment anything else
 * happens: a tool starts, another step begins reasoning, the reply's text starts, or the run ends.
 * More reasoning for the same step after a tool is a new block, because it is a new thought.
 */
import type { RunSource } from '@apple/shared';

export interface ReasoningBlock {
  /** Stable within the message: `r0`, `r1`, … in arrival order. */
  id: string;
  step: number;
  text: string;
  /** When this client saw the block's first frame. */
  startedAt: number;
  /** When it closed. Undefined while it is still streaming. */
  endedAt?: number;
}

export type TraceEntry = { kind: 'reasoning'; id: string } | { kind: 'tool'; toolId: string };

/** The fields of a chat item this module reads and writes. */
export interface TraceFields {
  reasoning?: ReasoningBlock[];
  trace?: TraceEntry[];
  sources?: RunSource[];
}

function closeOpen(blocks: ReasoningBlock[], now: number): ReasoningBlock[] {
  const last = blocks[blocks.length - 1];
  if (!last || last.endedAt !== undefined) return blocks;
  return [...blocks.slice(0, -1), { ...last, endedAt: Math.max(now, last.startedAt) }];
}

/** A `reasoning_delta`: grow the open block of this step, or open a new one. */
export function withReasoning<T extends TraceFields>(item: T, step: number, text: string, now: number): T {
  if (!text) return item;
  const blocks = item.reasoning ?? [];
  const trace = item.trace ?? [];
  const last = blocks[blocks.length - 1];
  const lastEntry = trace[trace.length - 1];
  if (last && last.endedAt === undefined && last.step === step && lastEntry?.kind === 'reasoning' && lastEntry.id === last.id) {
    return { ...item, reasoning: [...blocks.slice(0, -1), { ...last, text: last.text + text }] };
  }
  const id = `r${blocks.length}`;
  return {
    ...item,
    reasoning: [...closeOpen(blocks, now), { id, step, text, startedAt: now }],
    trace: [...trace, { kind: 'reasoning', id }],
  };
}

/** A `tool_start`: the open thought is over, and the tool takes its place in the order. */
export function withToolStart<T extends TraceFields>(item: T, toolId: string, now: number): T {
  const trace = item.trace ?? [];
  if (trace.some((entry) => entry.kind === 'tool' && entry.toolId === toolId)) return item;
  return { ...item, reasoning: closeOpen(item.reasoning ?? [], now), trace: [...trace, { kind: 'tool', toolId }] };
}

/** The reply's text started, or the run ended: whatever was still thinking has finished. */
export function withReasoningClosed<T extends TraceFields>(item: T, now: number): T {
  const blocks = item.reasoning;
  if (!blocks || blocks.length === 0 || blocks[blocks.length - 1]!.endedAt !== undefined) return item;
  return { ...item, reasoning: closeOpen(blocks, now) };
}

/**
 * A `sources` frame. Each frame is the message's whole list (the worker sends what the answer
 * cites), so it replaces rather than appends; a link that is not http(s) is dropped here, before
 * anything can render it as a link. Order is kept, because `[n]` in the answer is a 1-based index
 * into exactly this list.
 */
export function withSources<T extends TraceFields>(item: T, sources: readonly RunSource[]): T {
  return { ...item, sources: sources.filter((source) => Boolean(safeSourceUrl(source.url))) };
}

/** The URL to put in an href, or null when it is not an absolute http(s) URL. */
export function safeSourceUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}

/** Whole seconds a closed block took, as AI Elements' Reasoning says them ("Thought for N seconds"). */
export function reasoningSeconds(block: ReasoningBlock): number | undefined {
  if (block.endedAt === undefined) return undefined;
  return Math.max(1, Math.ceil((block.endedAt - block.startedAt) / 1000));
}

/** One rendered segment: a reasoning block, or a run of consecutive tool steps (one AI Elements Task). */
export type TraceSegment =
  | { kind: 'reasoning'; block: ReasoningBlock }
  | { kind: 'tools'; key: string; toolIds: string[] };

/**
 * The trace as the turn draws it: reasoning blocks, with the tools between two blocks grouped into
 * one Task. Tools the trace never saw (history from before this client connected) follow at the
 * end, in their own order, so nothing the run did is dropped.
 */
export function traceSegments(item: TraceFields, toolIds: readonly string[]): TraceSegment[] {
  const blocks = new Map((item.reasoning ?? []).map((block) => [block.id, block]));
  const known = new Set(toolIds);
  const out: TraceSegment[] = [];
  const placed = new Set<string>();
  const pushTool = (toolId: string) => {
    placed.add(toolId);
    const last = out[out.length - 1];
    if (last?.kind === 'tools') last.toolIds.push(toolId);
    else out.push({ kind: 'tools', key: `t-${toolId}`, toolIds: [toolId] });
  };
  for (const entry of item.trace ?? []) {
    if (entry.kind === 'reasoning') {
      const block = blocks.get(entry.id);
      if (block) out.push({ kind: 'reasoning', block });
    } else if (known.has(entry.toolId) && !placed.has(entry.toolId)) {
      pushTool(entry.toolId);
    }
  }
  for (const toolId of toolIds) if (!placed.has(toolId)) pushTool(toolId);
  return out;
}

/**
 * The answer's `[n]` markers, made into links to the matching source. Returns the text split into
 * plain runs and citations; `n` is 1-based into `sources`, and a marker with no such source stays
 * text — a citation that points nowhere is not drawn as one. Markers inside code (fenced or inline)
 * are left alone.
 */
export type CitationPart = { kind: 'text'; text: string } | { kind: 'cite'; index: number; source: RunSource; label: string };

export function splitCitations(text: string, sources: readonly RunSource[]): CitationPart[] {
  if (sources.length === 0 || !/\[\d+\]/.test(text)) return [{ kind: 'text', text }];
  const parts: CitationPart[] = [];
  let plain = '';
  const flush = () => { if (plain) { parts.push({ kind: 'text', text: plain }); plain = ''; } };
  // Walk once, skipping code spans, so `arr[1]` in a snippet is never mistaken for a citation.
  const re = /```[\s\S]*?(?:```|$)|`[^`\n]*`|\[(\d+)\]/g;
  let at = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    plain += text.slice(at, m.index);
    at = m.index + m[0].length;
    const n = m[1] === undefined ? NaN : Number(m[1]);
    const source = Number.isInteger(n) && n >= 1 ? sources[n - 1] : undefined;
    if (!source) { plain += m[0]; continue; }
    flush();
    parts.push({ kind: 'cite', index: n, source, label: m[0] });
  }
  plain += text.slice(at);
  flush();
  return parts;
}

/** A run of adjacent markers (`[1][2]`) is one citation with several sources, as upstream draws it. */
export const CITE_PREFIX = '#cite-';

/**
 * The answer as markdown the renderer can hand to InlineCitation: each run of adjacent `[n]` markers
 * becomes one link `[1, 2](#cite-1-2)`, read back by `citedIndexes`. Everything else is untouched.
 */
export function citationMarkdown(text: string, sources: readonly RunSource[]): string {
  const parts = splitCitations(text, sources);
  let out = '';
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]!;
    if (part.kind === 'text') { out += part.text; continue; }
    const run = [part.index];
    while (parts[i + 1]?.kind === 'cite') { i += 1; run.push((parts[i] as Extract<CitationPart, { kind: 'cite' }>).index); }
    out += `[${run.join(', ')}](${CITE_PREFIX}${run.join('-')})`;
  }
  return out;
}

/** The 1-based source indexes a citation link names, or null when the href is not one. */
export function citedIndexes(href: string | undefined): number[] | null {
  if (!href?.startsWith(CITE_PREFIX)) return null;
  const indexes = href.slice(CITE_PREFIX.length).split('-').map(Number);
  return indexes.length > 0 && indexes.every((n) => Number.isInteger(n) && n >= 1) ? indexes : null;
}

/**
 * WHO OPENS A REASONING BLOCK. Upstream's Reasoning opens itself while its step streams and closes
 * itself a second after — and, left alone, reopens itself on the next render if the reader closed it
 * mid-stream (measured 2026-09-23 on the owner's build: the card reopened 261 ms after a click, so the
 * reader could never close it). The turn therefore controls `open`, and this decides each change:
 * until the reader toggles, the component's own moves stand; once they have, only theirs do.
 */
export interface DisclosureState { open: boolean; readerTouched: boolean }

export function disclosureChange(state: DisclosureState, next: boolean, byReader: boolean): DisclosureState {
  if (byReader) return { open: next, readerTouched: true };
  if (state.readerTouched || state.open === next) return state;
  return { ...state, open: next };
}

/**
 * THE TRACE ROW OF A TOOL CALL, AND WHY A FAILED ONE KEEPS ITS REASON.
 *
 * Measured 2026-10-04 (t1 round 1): `compose_game` failed three times in a row with the row text "Could not build the game"
 * and `detail: null`. A failed tool has no panel (`detail` is for the generative-UI document a SUCCESS draws), and a tool's
 * plain summary is a fixed sentence for the person ("Could not build the game"), so nothing on the stored row said WHY.
 * The reason existed: it was the `error` of the result the model had just read. It was only copied to the row at two of
 * the places that write a row, and `String(parsed.error)` of a result whose `error` was not a string kept "[object Object]".
 *
 * So there is ONE builder for the row (`toolTraceEntry`) and every place that records a call that ran uses it. For a failed
 * call it ALWAYS sets `error`: the tool's own error text, with the short lists a composite tool reports beside it
 * (`missing`, `problems`) so "which part" survives, and — when the result carries no text at all — the row's own summary,
 * so an empty reason is never stored as no reason. Capped, because the row is persisted with the run.
 *
 * Pure: no import. The one transformation applied to the text (`scrub`) is injected by the caller, because the engine-identity
 * rule is the tool layer's.
 */
import type { ToolTraceEntry } from '@apple/shared';

export const TRACE_ERROR_CHARS = 400;
const LIST_ITEMS = 4;
const LIST_ITEM_CHARS = 60;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function textOf(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v === undefined || v === null) return '';
  try { return JSON.stringify(v) ?? ''; } catch { return ''; }
}

/** `missing: a, b` / `problems: …` from the short lists a composite tool puts beside its error. */
function listsOf(parsed: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of ['missing', 'problems']) {
    const list = parsed[key];
    if (!Array.isArray(list) || list.length === 0) continue;
    const items = list.slice(0, LIST_ITEMS).map((x) => textOf(x).replace(/\s+/g, ' ').slice(0, LIST_ITEM_CHARS)).filter(Boolean);
    if (items.length) parts.push(`${key}: ${items.join('; ')}${list.length > LIST_ITEMS ? ` (+${list.length - LIST_ITEMS} more)` : ''}`);
  }
  return parts.length ? ` [${parts.join(' | ')}]` : '';
}

/** The failure text of a call, from the result string the model saw. Never empty when there was anything to say. */
export function failureText(resultForLlm: string | undefined, scrub: (s: string) => string = (s) => s): string {
  const raw = resultForLlm ?? '';
  let text = '';
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isObj(parsed)) {
      text = textOf(parsed.error).replace(/\s+/g, ' ').trim();
      if (!text) text = textOf(parsed.message).replace(/\s+/g, ' ').trim();
      if (text) text += listsOf(parsed);
    } else text = textOf(parsed);
  } catch {
    // A result cut off by the size cap, or plain text: its start is still the reason.
    text = raw.replace(/\s+/g, ' ').trim();
  }
  return scrub(text).slice(0, TRACE_ERROR_CHARS);
}

export interface TracedCall {
  tool: string;
  summary: string;
  ok: boolean;
  resultForLlm?: string;
  detail?: unknown;
}

/** The stored row for a call that ran. A failed row carries `error`, always. */
export function toolTraceEntry(call: TracedCall, durationMs: number, scrub?: (s: string) => string): ToolTraceEntry {
  const entry: ToolTraceEntry = { tool: call.tool, summary: call.summary, ok: call.ok, durationMs, detail: call.detail };
  if (!call.ok) entry.error = failureText(call.resultForLlm, scrub) || (scrub ? scrub(call.summary) : call.summary).slice(0, TRACE_ERROR_CHARS) || 'failed without a reason';
  return entry;
}

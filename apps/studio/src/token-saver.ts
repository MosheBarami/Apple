/**
 * TOKEN SAVER (owner, 2026-10-08: "add full caching system and token saver").
 *
 * Every step re-sends the conversation, so every token a tool result adds is paid again on each later step. Four savers:
 * - a repeated read (same tool, same arguments, nothing written since) answers with one line instead of the whole result;
 * - an oversized result keeps its head and tail and says how to ask for less;
 * - knowledge lookups (docs, Creator Store) are cached for ten minutes in this agent's memory;
 * - older history is compacted before it is sent (see compactHistory).
 * The provider's prompt cache (session affinity, apps/studio/src/agent.ts) then serves the unchanged prefix at the cached rate.
 */
import type { ModelMessage } from 'ai';

/** The most characters one tool result may put into the conversation (about 3,000 tokens). */
export const MAX_TOOL_RESULT_CHARS = 12_000;

export function clampToolOutput(text: string, max = MAX_TOOL_RESULT_CHARS): string {
  if (text.length <= max) return text;
  const head = text.slice(0, Math.floor(max * 0.75));
  const tail = text.slice(text.length - Math.floor(max * 0.15));
  return `${head}\n…[${text.length - head.length - tail.length} characters left out to save tokens: ask for a narrower path, a smaller depth or a line range]…\n${tail}`;
}

/**
 * Reads within one turn. A read repeated with the same arguments and no write in between returns a short note; any write
 * clears it, because the place may have changed.
 */
export class TurnReadCache {
  private seen = new Map<string, number>();
  private step = 0;

  key(tool: string, args: unknown): string {
    return `${tool}:${JSON.stringify(args ?? {})}`;
  }

  /** The note to return instead of re-running the read, or null to run it. */
  repeat(tool: string, args: unknown): string | null {
    const at = this.seen.get(this.key(tool, args));
    return at === undefined
      ? null
      : `(Same result as your earlier ${tool} call with these arguments, call #${at}: nothing has been changed since. Use that result.)`;
  }

  remember(tool: string, args: unknown): void {
    this.step += 1;
    this.seen.set(this.key(tool, args), this.step);
  }

  /** A write happened: every earlier read may be stale. */
  invalidate(): void {
    this.seen.clear();
  }
}

/** A small time-limited cache for knowledge lookups, kept in the agent's memory between turns. */
export class TtlCache<V> {
  private items = new Map<string, { at: number; value: V }>();
  private ttlMs: number;
  private max: number;
  constructor(ttlMs: number, max = 200) {
    this.ttlMs = ttlMs;
    this.max = max;
  }

  async get(key: string, load: () => Promise<V>): Promise<V> {
    const hit = this.items.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.value;
    const value = await load();
    this.items.set(key, { at: Date.now(), value });
    if (this.items.size > this.max) this.items.delete(this.items.keys().next().value as string);
    return value;
  }
}

/** Older text kept per message once it is out of the recent window. */
const OLD_TEXT_CHARS = 1_500;
/** Messages at the end of the conversation that are always sent whole. */
const RECENT_MESSAGES = 16;
/** What an earlier turn's tool result keeps: enough to know what was built and where, not the whole payload. */
const OLD_RESULT_CHARS = 700;

/**
 * Compacts history before it is sent. The current turn (everything after the person's latest message) goes whole.
 * Earlier turns keep every tool call and result, shortened (the agent must remember what it built and where, or a
 * "continue" rebuilds or changes finished work: owner, 2026-10-09), and their words, shortened outside the recent window.
 * Compaction is deterministic, so an earlier turn compacts the same way every time and the prompt cache still serves it.
 */
export function compactHistory(messages: ModelMessage[]): ModelMessage[] {
  const cut = Math.max(0, messages.length - RECENT_MESSAGES);
  let turnStart = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i]!.role === 'user') { turnStart = i; break; }
  return messages.map((m, i) => {
    if (i >= turnStart || m.role === 'system') return m;
    const oldText = i < cut;
    if (typeof m.content === 'string') return oldText ? ({ ...m, content: shorten(m.content) } as ModelMessage) : m;
    const parts = (m.content as Array<Record<string, unknown>>).map((p) => {
      if (p.type === 'text' && typeof p.text === 'string') return oldText ? { ...p, text: shorten(p.text) } : p;
      if (p.type === 'tool-call') return { ...p, input: clipValue(p.input, 0) };
      if (p.type === 'tool-result') return { ...p, output: clipOutput(p.output) };
      return p;
    });
    return { ...m, content: parts } as ModelMessage;
  });
}

/** A tool call's arguments with long strings and lists cut, keeping their shape (names, paths, the top of each list). */
export function clipValue(v: unknown, depth: number): unknown {
  if (typeof v === 'string') return v.length <= 200 ? v : `${v.slice(0, 160)}…[${v.length} chars]`;
  if (Array.isArray(v)) {
    if (depth >= 5) return `[${v.length} items]`;
    const head = v.slice(0, 8).map((x) => clipValue(x, depth + 1));
    return v.length > 8 ? [...head, `…[${v.length - 8} more]`] : head;
  }
  if (v && typeof v === 'object') {
    if (depth >= 5) return '{…}';
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, clipValue(x, depth + 1)]));
  }
  return v;
}

function clipOutput(out: unknown): unknown {
  const o = out as { type?: string; value?: unknown } | null;
  if (!o || typeof o !== 'object' || typeof o.type !== 'string') return out;
  const text = typeof o.value === 'string' ? o.value : JSON.stringify(o.value ?? null);
  if (text.length <= OLD_RESULT_CHARS) return out;
  const short = `${text.slice(0, OLD_RESULT_CHARS)}…[earlier result shortened; read the place again if you need the rest]`;
  return { type: o.type.startsWith('error') ? 'error-text' : 'text', value: short };
}

function shorten(text: string): string {
  return text.length <= OLD_TEXT_CHARS ? text : `${text.slice(0, OLD_TEXT_CHARS)}…[shortened]`;
}

/**
 * A tool call whose arguments arrive as a JSON string of the object (the model sometimes quotes a long argument list)
 * is unwrapped here instead of failing and making the model write the whole call again.
 */
export async function unwrapQuotedToolInput<T extends { input: string }>({ toolCall }: { toolCall: T }): Promise<T | null> {
  try {
    const once = JSON.parse(toolCall.input) as unknown;
    if (typeof once !== 'string') return null;
    const twice = JSON.parse(once) as unknown;
    return twice && typeof twice === 'object' && !Array.isArray(twice) ? { ...toolCall, input: JSON.stringify(twice) } : null;
  } catch {
    return null;
  }
}

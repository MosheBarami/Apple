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

/**
 * Compacts history before it is sent: the recent window goes whole; older messages keep their words, shortened, and lose
 * tool calls, tool results and reasoning (pruneMessages has already removed those past the last two messages).
 */
export function compactHistory(messages: ModelMessage[]): ModelMessage[] {
  const cut = Math.max(0, messages.length - RECENT_MESSAGES);
  return messages.map((m, i) => {
    if (i >= cut || m.role === 'system') return m;
    if (typeof m.content === 'string') return { ...m, content: shorten(m.content) } as ModelMessage;
    if (m.role === 'tool') return m;
    const parts = (m.content as Array<{ type: string; text?: string }>).map((p) =>
      p.type === 'text' && typeof p.text === 'string' ? { ...p, text: shorten(p.text) } : p,
    );
    return { ...m, content: parts } as ModelMessage;
  });
}

function shorten(text: string): string {
  return text.length <= OLD_TEXT_CHARS ? text : `${text.slice(0, OLD_TEXT_CHARS)}…[shortened]`;
}

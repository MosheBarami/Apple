/**
 * What the user asked for in this run, in their own words: the run's pinned user message. The run also speaks to the model as the user (a
 * steer to call a tool, to keep going), and those are not the request.
 */
export function lastUserText(messages: readonly { role: string; content?: unknown; pinned?: boolean }[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]!;
    if (m.role !== 'user' || m.pinned !== true) continue;
    const text = typeof m.content === 'string' ? m.content
      : Array.isArray(m.content) ? m.content.map((c) => (c && typeof c === 'object' && typeof (c as { text?: unknown }).text === 'string' ? (c as { text: string }).text : '')).join(' ') : '';
    if (text.trim()) return text.trim();
  }
  return undefined;
}

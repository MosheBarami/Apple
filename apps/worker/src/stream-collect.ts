/**
 * LIVE REASONING (owner, 2026-10-01: "the thinking does not stream at all live, it pops up as a block"). A step is asked
 * for as a server-sent-event stream; this reads it, hands every reasoning delta to `onReasoning` the moment it
 * arrives, and rebuilds the same whole response the non-streamed call returns (content, reasoning, tool calls,
 * finish reason, usage), so decoding, billing and tool handling downstream are unchanged. Pure apart from the reader.
 */
interface ToolAcc { id?: string; name: string; args: string }

export function newAccumulator() {
  return { content: '', reasoning: '', tools: [] as ToolAcc[], finish: undefined as string | undefined, usage: undefined as unknown };
}
export type Accumulator = ReturnType<typeof newAccumulator>;

/** Folds one SSE `data:` JSON chunk (OpenAI chat-completions delta shape) into the accumulator; returns new reasoning text. */
export function foldChunk(acc: Accumulator, chunk: any): string {
  if (chunk?.usage) acc.usage = chunk.usage;
  const choice = chunk?.choices?.[0];
  if (!choice) {
    // Some Workers AI models stream {response: "..."} pieces.
    if (typeof chunk?.response === 'string') acc.content += chunk.response;
    return '';
  }
  const d = choice.delta ?? {};
  if (typeof d.content === 'string') acc.content += d.content;
  let reasoning = '';
  for (const key of ['reasoning_content', 'reasoning']) if (typeof d[key] === 'string') reasoning += d[key];
  acc.reasoning += reasoning;
  for (const tc of Array.isArray(d.tool_calls) ? d.tool_calls : []) {
    const i = typeof tc.index === 'number' ? tc.index : acc.tools.length;
    acc.tools[i] ??= { name: '', args: '' };
    if (tc.id) acc.tools[i]!.id = tc.id;
    if (tc.function?.name) acc.tools[i]!.name += tc.function.name;
    if (typeof tc.function?.arguments === 'string') acc.tools[i]!.args += tc.function.arguments;
  }
  if (choice.finish_reason) acc.finish = choice.finish_reason;
  return reasoning;
}

/** The whole response, in the shape the non-streamed call returns. */
export function assembled(acc: Accumulator): unknown {
  const tool_calls = acc.tools.filter(Boolean).map((t, i) => ({ id: t.id ?? `tc_${i}`, type: 'function', function: { name: t.name, arguments: t.args } }));
  return {
    choices: [{ message: { role: 'assistant', content: acc.content, ...(acc.reasoning ? { reasoning_content: acc.reasoning } : {}), ...(tool_calls.length ? { tool_calls } : {}) }, finish_reason: acc.finish ?? (tool_calls.length ? 'tool_calls' : 'stop') }],
    ...(acc.usage ? { usage: acc.usage } : {}),
  };
}

/** Reads an SSE byte stream to the end. */
export async function collectStream(stream: ReadableStream<Uint8Array>, onReasoning: (delta: string) => void): Promise<unknown> {
  const acc = newAccumulator();
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const line = (l: string) => {
    const t = l.trim();
    if (!t.startsWith('data:')) return;
    const data = t.slice(5).trim();
    if (!data || data === '[DONE]') return;
    try { const r = foldChunk(acc, JSON.parse(data)); if (r) onReasoning(r); } catch { /* a keep-alive or a partial line */ }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) { line(buf.slice(0, nl)); buf = buf.slice(nl + 1); }
  }
  if (buf) line(buf);
  return assembled(acc);
}

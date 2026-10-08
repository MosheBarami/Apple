import type { ApiProtocol } from '@studpilot/shared';

/** SSE framing is shared; event semantics and completion markers remain protocol-specific. */
export async function collectApiStream(body: ReadableStream<Uint8Array>, protocol: ApiProtocol,
  onText?: (text: string) => void): Promise<unknown> {
  const reader = body.getReader(), decoder = new TextDecoder();
  let pending = '', bytes = 0, done = false;
  let raw: any = {}, text = '', reason: string | null = null;
  const tools = new Map<number, any>(), blocks = new Map<number, any>();
  const accept = (block: string) => {
    const data = block.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
    if (!data) return;
    if (data === '[DONE]') { done = true; return; }
    const event = JSON.parse(data);
    if (event.error || event.type === 'error' || event.type === 'response.failed') throw new Error('Provider stream returned an error.');
    switch (protocol) {
      case 'responses':
        if (event.type === 'response.output_text.delta') onText?.(event.delta);
        if (event.type === 'response.completed' || event.type === 'response.incomplete') { raw = event.response; done = true; }
        break;
      case 'anthropic':
        if (event.type === 'message_start') raw = { ...event.message, content: [] };
        if (event.type === 'content_block_start') blocks.set(event.index, structuredClone(event.content_block));
        if (event.type === 'content_block_delta') {
          const content = blocks.get(event.index); if (!content) throw new Error('Missing Anthropic content block.');
          if (event.delta?.type === 'text_delta') { content.text = (content.text ?? '') + event.delta.text; onText?.(event.delta.text); }
          if (event.delta?.type === 'input_json_delta') content.partial = (content.partial ?? '') + event.delta.partial_json;
          if (event.delta?.type === 'thinking_delta') content.thinking = (content.thinking ?? '') + event.delta.thinking;
          if (event.delta?.type === 'signature_delta') content.signature = (content.signature ?? '') + event.delta.signature;
        }
        if (event.type === 'message_delta') { raw.stop_reason = event.delta?.stop_reason; raw.usage = { ...raw.usage, ...event.usage }; }
        if (event.type === 'message_stop') done = true;
        break;
      case 'gemini': {
        const candidate = event.candidates?.[0];
        const parts = candidate?.content?.parts ?? [];
        const previous = raw.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) if (part.text && part.thought !== true) onText?.(part.text);
        raw = { ...event, candidates: [{ ...candidate, content: { role: 'model', parts: [...previous, ...parts] } }] };
        if (candidate?.finishReason) { reason = candidate.finishReason; done = true; }
        if (reason) raw.candidates[0].finishReason = reason;
        break;
      }
      case 'cohere':
        if (event.type === 'message-start') raw = { id: event.id, message: { content: [], tool_calls: [] } };
        if (event.type === 'content-delta') { const delta = event.delta?.message?.content?.text ?? ''; text += delta; onText?.(delta); }
        if (event.type === 'tool-call-start') tools.set(event.index, structuredClone(event.delta?.message?.tool_calls));
        if (event.type === 'tool-call-delta') {
          const call = tools.get(event.index); if (!call) throw new Error('Missing Cohere tool call.');
          call.function.arguments = (call.function.arguments ?? '') + (event.delta?.message?.tool_calls?.function?.arguments ?? '');
        }
        if (event.type === 'message-end') { raw.finish_reason = event.delta?.finish_reason; raw.usage = event.delta?.usage; done = true; }
        break;
      default: {
        const choice = event.choices?.[0], delta = choice?.delta;
        if (typeof delta?.content === 'string') { text += delta.content; onText?.(delta.content); }
        if (typeof delta?.reasoning_content === 'string') raw.reasoning_content = (raw.reasoning_content ?? '') + delta.reasoning_content;
        for (const call of delta?.tool_calls ?? []) {
          const prev = tools.get(call.index) ?? { id: '', type: 'function', function: { name: '', arguments: '' } };
          if (call.id) prev.id = call.id;
          if (call.function?.name) prev.function.name += call.function.name;
          if (call.function?.arguments) prev.function.arguments += call.function.arguments;
          tools.set(call.index, prev);
        }
        if (choice?.finish_reason) reason = choice.finish_reason;
        if (event.usage) raw.usage = event.usage;
        if (event.x_groq?.usage) raw.usage = event.x_groq.usage;
        break;
      }
    }
  };
  try {
    while (true) {
      const { value, done: ended } = await reader.read();
      if (ended) break;
      bytes += value.byteLength; if (bytes > 4 * 1024 * 1024) throw new Error('Provider stream exceeded its output limit.');
      pending += decoder.decode(value, { stream: true });
      pending = pending.replace(/\r\n/g, '\n');
      let index;
      while ((index = pending.indexOf('\n\n')) >= 0) { accept(pending.slice(0, index)); pending = pending.slice(index + 2); }
    }
    pending += decoder.decode(); if (pending.trim()) accept(pending);
    if (!done) throw new Error('Provider stream ended without a completion marker.');
    if (protocol === 'anthropic') raw.content = [...blocks.values()].map(({ partial, ...content }) =>
      partial ? { ...content, input: JSON.parse(partial) } : content);
    else if (protocol === 'cohere') raw.message = { ...raw.message, content: [{ type: 'text', text }], tool_calls: [...tools.values()] };
    else if (!['responses', 'gemini'].includes(protocol)) {
      raw = { choices: [{ finish_reason: reason, message: { content: text, tool_calls: [...tools.values()],
        ...(raw.reasoning_content ? { reasoning_content: raw.reasoning_content } : {}) } }], usage: raw.usage };
      if (protocol === 'workers-http') raw = { result: raw };
    }
    return raw;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

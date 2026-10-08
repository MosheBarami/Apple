import type { AiProviderId, GatewayMessage, GatewayToolCall } from '@studpilot/shared';
import type { NormalizedRequest } from './types';
import { apiProvider } from './api-registry';

type Json = Record<string, any>;
const object = (value: unknown): Json => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
const string = (value: unknown): string => typeof value === 'string' ? value : '';
const list = (value: unknown): any[] => Array.isArray(value) ? value : [];
const count = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

export interface ApiInferenceResult {
  provider: AiProviderId; model: string; text: string; toolCalls: GatewayToolCall[];
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error'; truncated: boolean;
  usage: { inputTokens: number | null; outputTokens: number | null; cachedInputTokens: number | null };
  /** Required replay state, e.g. signed Anthropic thinking blocks or Gemini thought signatures. */
  replay: unknown;
}

export function textContent(message: GatewayMessage): string {
  if (typeof message.content === 'string') return message.content;
  if (message.content.some((part) => part.type !== 'text')) throw new Error('Images are not accepted by the StudPilot build inference routes.');
  return message.content.map((part) => 'text' in part ? part.text : '').join('\n');
}
const args = (call: GatewayToolCall) => JSON.parse(call.arguments);

export function encodeApiRequest(providerId: AiProviderId, request: NormalizedRequest): Json {
  const provider = apiProvider(providerId), tools = request.tools ?? [];
  const replayFor = (message: GatewayMessage) => message.role === 'assistant'
    && message.providerReplay?.provider === providerId && message.providerReplay.modelId === request.modelId
    ? message.providerReplay.content : null;
  if (request.requiredTool && !tools.some((tool) => tool.name === request.requiredTool)) throw new Error('Required tool was not offered.');
  // Full message objects never cross the provider boundary: omit product ids and internal flags.
  const messages = request.messages.map((message) => {
    const replay = replayFor(message);
    if (replay && typeof replay === 'object' && !Array.isArray(replay)) {
      const previous = object(replay);
      return { role: 'assistant', content: previous.content,
        ...(previous.tool_calls ? { tool_calls: previous.tool_calls } : {}),
        ...(previous.reasoning_content ? { reasoning_content: previous.reasoning_content } : {}) };
    }
    return { role: message.role, content: textContent(message),
    ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
    ...(message.toolCalls?.length ? { tool_calls: message.toolCalls.map((call) => ({ id: call.id, type: 'function',
      function: { name: call.name, arguments: call.arguments } })) } : {}) };
  });
  const base = { model: request.modelId };
  switch (provider.protocol) {
    case 'responses': {
      const input = request.messages.flatMap((message): Json[] => {
        const replay = replayFor(message);
        if (Array.isArray(replay)) return replay;
        if (message.role === 'tool') return [{ type: 'function_call_output', call_id: message.toolCallId, output: textContent(message) }];
        const content = textContent(message), items: Json[] = [];
        if (content) items.push({ role: message.role, content: [{ type: message.role === 'assistant' ? 'output_text' : 'input_text', text: content }] });
        for (const call of message.toolCalls ?? []) items.push({ type: 'function_call', call_id: call.id, name: call.name, arguments: call.arguments });
        return items;
      });
      return { ...base, input, max_output_tokens: request.maxTokens, store: false,
        ...(providerId === 'openai' ? { include: ['reasoning.encrypted_content'] } : {}),
        ...(tools.length ? { tools: tools.map((tool) => ({ type: 'function', ...tool, strict: false })),
          tool_choice: request.requiredTool ? { type: 'function', name: request.requiredTool } : 'auto' } : {}),
        ...(request.jsonSchema ? { text: { format: { type: 'json_schema', name: 'studpilot', schema: request.jsonSchema, strict: true } } } : {}) };
    }
    case 'anthropic': {
      const turns: Json[] = [];
      for (const message of request.messages.filter((message) => message.role !== 'system')) {
        const replay = replayFor(message);
        const content: Json[] = Array.isArray(replay) ? replay : message.role === 'tool'
          ? [{ type: 'tool_result', tool_use_id: message.toolCallId, content: textContent(message) }]
          : [...(textContent(message) ? [{ type: 'text', text: textContent(message) }] : []),
            ...(message.toolCalls ?? []).map((call) => ({ type: 'tool_use', id: call.id, name: call.name, input: args(call) }))];
        const role = message.role === 'assistant' ? 'assistant' : 'user';
        const previous = turns.at(-1);
        if (previous?.role === role) previous.content.push(...content); else turns.push({ role, content });
      }
      return { ...base, system: request.messages.filter((m) => m.role === 'system').map(textContent).join('\n'),
        messages: turns, max_tokens: request.maxTokens,
        ...(tools.length ? { tools: tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.parameters })),
          tool_choice: request.requiredTool ? { type: 'tool', name: request.requiredTool } : { type: 'auto' } } : {}),
        ...(request.jsonSchema ? { output_config: { format: { type: 'json_schema', schema: request.jsonSchema } } } : {}) };
    }
    case 'gemini': {
      const calls = new Map(request.messages.flatMap((message) => (message.toolCalls ?? []).map((call) => [call.id, call.name] as const)));
      const contents = request.messages.filter((message) => message.role !== 'system').map((message) => {
        const replay = replayFor(message);
        if (replay && typeof replay === 'object' && Array.isArray(object(replay).parts)) return replay;
        if (message.role === 'assistant' && message.toolCalls?.length) {
          throw new Error('Gemini tool history requires its original signed replay state. Start a new run on this model.');
        }
        return {
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: message.role === 'tool' ? [{ functionResponse: { id: message.toolCallId,
          name: message.name ?? calls.get(message.toolCallId ?? ''), response: { result: textContent(message) } } }]
          : [...(textContent(message) ? [{ text: textContent(message) }] : []),
            ...(message.toolCalls ?? []).map((call) => ({ functionCall: { id: call.id, name: call.name, args: args(call) } }))],
      }; });
      return { contents, systemInstruction: { parts: [{ text: request.messages.filter((m) => m.role === 'system').map(textContent).join('\n') }] },
        generationConfig: { maxOutputTokens: request.maxTokens, temperature: request.temperature,
          ...(request.jsonSchema ? { responseMimeType: 'application/json', responseJsonSchema: request.jsonSchema } : {}) },
        ...(tools.length ? { tools: [{ functionDeclarations: tools.map((tool) => ({ name: tool.name, description: tool.description, parametersJsonSchema: tool.parameters })) }],
          ...(request.requiredTool ? { toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [request.requiredTool] } } } : {}) } : {}) };
    }
    case 'cohere': return { ...base, messages, max_tokens: request.maxTokens, temperature: request.temperature,
      ...(tools.length ? { tools: tools.map((tool) => ({ type: 'function', function: tool })),
        ...(request.requiredTool ? { tool_choice: 'REQUIRED' } : {}) } : {}),
      ...(request.jsonSchema ? { response_format: { type: 'json_object', schema: request.jsonSchema } } : {}) };
    case 'workers-http': return { messages, max_tokens: request.maxTokens, temperature: request.temperature,
      ...(tools.length ? { tools: tools.map((tool) => ({ type: 'function', function: tool })) } : {}),
      ...(request.jsonSchema ? { response_format: { type: 'json_schema', json_schema: request.jsonSchema } } : {}) };
    default: return { ...base, messages, [provider.maxTokensField ?? 'max_tokens']: request.maxTokens,
      temperature: request.temperature,
      ...(tools.length ? { tools: tools.map((tool) => ({ type: 'function', function: tool })),
        ...(request.requiredTool ? { tool_choice: { type: 'function', function: { name: request.requiredTool } } } : {}) } : {}),
      ...(request.jsonSchema ? { response_format: { type: 'json_schema', json_schema: { name: 'studpilot', schema: request.jsonSchema } } } : {}) };
  }
}

export function decodeApiResponse(provider: AiProviderId, model: string, raw: unknown): ApiInferenceResult {
  let data = object(raw);
  if (apiProvider(provider).protocol === 'workers-http') data = object(data.result);
  const result: ApiInferenceResult = { provider, model, text: '', toolCalls: [], finishReason: 'error', truncated: false,
    usage: { inputTokens: null, outputTokens: null, cachedInputTokens: null }, replay: null };
  const calls = (items: unknown) => list(items).map((call) => ({ id: string(call.id), name: string(call.function?.name),
    arguments: typeof call.function?.arguments === 'string' ? call.function.arguments : JSON.stringify(call.function?.arguments ?? {}) }));
  let reason: unknown;
  switch (apiProvider(provider).protocol) {
    case 'responses':
      for (const item of list(data.output)) {
        if (item.type === 'message') result.text += list(item.content).filter((part) => part.type === 'output_text').map((part) => string(part.text)).join('');
        if (item.type === 'function_call') result.toolCalls.push({ id: string(item.call_id), name: string(item.name), arguments: string(item.arguments) });
      }
      reason = data.status === 'completed' ? 'stop' : data.status === 'incomplete' ? 'length' : 'error';
      result.usage = { inputTokens: count(data.usage?.input_tokens), outputTokens: count(data.usage?.output_tokens),
        cachedInputTokens: count(data.usage?.input_tokens_details?.cached_tokens) }; result.replay = data.output; break;
    case 'anthropic':
      result.text = list(data.content).filter((part) => part.type === 'text').map((part) => string(part.text)).join('');
      result.toolCalls = list(data.content).filter((part) => part.type === 'tool_use').map((part) => ({
        id: string(part.id), name: string(part.name), arguments: JSON.stringify(part.input) }));
      reason = data.stop_reason === 'max_tokens' ? 'length' : ['end_turn', 'tool_use', 'stop_sequence'].includes(data.stop_reason) ? 'stop' : 'error';
      result.usage = { inputTokens: count(data.usage?.input_tokens), outputTokens: count(data.usage?.output_tokens),
        cachedInputTokens: count(data.usage?.cache_read_input_tokens) }; result.replay = data.content; break;
    case 'gemini': {
      const candidate = object(list(data.candidates)[0]), parts = list(candidate.content?.parts);
      result.text = parts.filter((part) => part.text && part.thought !== true).map((part) => string(part.text)).join('');
      result.toolCalls = parts.filter((part) => part.functionCall).map((part, index) => ({
        id: string(part.functionCall.id) || `gemini-${index}`, name: string(part.functionCall.name), arguments: JSON.stringify(part.functionCall.args) }));
      reason = candidate.finishReason === 'STOP' ? 'stop' : candidate.finishReason === 'MAX_TOKENS' ? 'length' : 'error';
      result.usage = { inputTokens: count(data.usageMetadata?.promptTokenCount), outputTokens: count(data.usageMetadata?.candidatesTokenCount),
        cachedInputTokens: count(data.usageMetadata?.cachedContentTokenCount) }; result.replay = candidate.content; break;
    }
    case 'cohere':
      result.text = list(data.message?.content).filter((part) => part.type === 'text').map((part) => string(part.text)).join('');
      result.toolCalls = calls(data.message?.tool_calls);
      reason = data.finish_reason === 'MAX_TOKENS' ? 'length' : ['COMPLETE', 'TOOL_CALL', 'STOP_SEQUENCE'].includes(data.finish_reason) ? 'stop' : 'error';
      result.usage = { inputTokens: count(data.usage?.tokens?.input_tokens), outputTokens: count(data.usage?.tokens?.output_tokens), cachedInputTokens: null };
      result.replay = data.message; break;
    default: {
      const choice = object(list(data.choices)[0]);
      result.text = (string(choice.message?.content) || string(data.response)).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      result.toolCalls = calls(choice.message?.tool_calls ?? data.tool_calls);
      reason = choice.finish_reason ?? (data.response !== undefined ? 'stop' : 'error');
      result.usage = { inputTokens: count(data.usage?.prompt_tokens), outputTokens: count(data.usage?.completion_tokens),
        cachedInputTokens: count(data.usage?.prompt_tokens_details?.cached_tokens ?? data.usage?.prompt_cache_hit_tokens) };
      result.replay = choice.message ?? null; break;
    }
  }
  result.truncated = reason === 'length';
  result.finishReason = reason === 'length' ? 'length' : reason === 'stop' || reason === 'tool_calls'
    ? result.toolCalls.length ? 'tool_calls' : 'stop' : 'error';
  return result;
}

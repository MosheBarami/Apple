import type { GatewayToolCall } from '@golem/shared';

/**
 * A tool call is COMPLETE when its arguments are a JSON object (an empty string means no arguments).
 *
 * Two failures this exists for, both measured in production on 2026-09-22 (runs 0afe6149 and
 * 23b20096, the vis-01 street-lamp prompt): the model's create_instances call reached the 6,500-token
 * output ceiling mid-JSON. The partial call was executed and failed — that part was survivable — but
 * its arguments string was then written into the model history verbatim, sent back to the provider as
 * a structured tool_call, and the provider rejected the whole next request within ~300 ms. Both runs
 * ended in `error` with nothing built.
 */
export function isCompleteToolCall(call: GatewayToolCall): boolean {
  const raw = typeof call.arguments === 'string' ? call.arguments.trim() : '';
  if (raw === '') return true;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

/**
 * What the MODEL HISTORY may hold for a turn's tool calls. A call whose arguments do not parse keeps its
 * id and name — so its tool result still pairs with it — but carries `{}`, because the provider has to
 * be able to read its own transcript back. The tool result already tells the model the arguments were
 * not valid JSON (runTool), so nothing is hidden from it; only the unreadable bytes are.
 */
export function historySafeToolCalls(calls: GatewayToolCall[]): GatewayToolCall[] {
  return calls.map((call) => (isCompleteToolCall(call) ? call : { ...call, arguments: '{}' }));
}

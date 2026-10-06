/** What the block steps (intake, plan-fill, custom-code) need from a model: messages in, text out. */
export interface ModelMessage { role: 'system' | 'user' | 'assistant'; content: string }
export type CallModel = (messages: ModelMessage[]) => Promise<string>;

/** The one JSON object in a model's reply (fences and words around it are ignored), or null. Pure. */
export function replyObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(text.slice(start, end + 1)) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

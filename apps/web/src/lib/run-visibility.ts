/** Keep Stop available while the server's active assistant turn is still on screen. */
export function runVisible(
  running: boolean,
  messages: readonly { role: string; streaming: boolean }[],
): boolean {
  return running || messages.some((m) => m.role === 'assistant' && m.streaming);
}

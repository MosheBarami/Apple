// Stubbed gateway boundary for the rag tests. Only `embed`, which is all rag.ts imports.
export let EMBED_BEHAVIOUR = { mode: 'ok' };
export function setEmbed(b) { EMBED_BEHAVIOUR = b; }
export async function embed(_env, texts) {
  if (EMBED_BEHAVIOUR.mode === 'throw') throw new Error('embedding provider unavailable');
  if (EMBED_BEHAVIOUR.mode === 'empty') return [];
  return texts.map(() => [0.1, 0.2, 0.3]);
}

// The general craft cards (data/skill-cards.json) as corpus chunks, so search_docs and the vector
// index reach the same recipes the worker injects by itself (apps/worker/src/skill-cards.ts).
// kind 'skill', always embedded; cited to the first Creator Docs page the card was grounded in.
export function skillCardChunks(cards) {
  return cards.map((c) => ({
    vecId: `skill-${c.id}`,
    docSlug: `skill-${c.id}`,
    title: c.title,
    url: c.docs[0].url,
    kind: 'skill',
    text: [
      ...c.recipe.map((r) => `- ${r}`),
      `Avoid: ${c.avoid.join(' ')}`,
      `Check: ${c.check}`,
      `Tools: ${c.tools.join(', ')}`,
      `Sources: ${c.docs.map((d) => d.url).join(' ')}`,
    ].join('\n'),
    embed: true,
  }));
}

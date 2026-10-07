// Master plan §4.1 L7 (search only, never training): embed the search card of every A or B item with Workers AI and
// write NDJSON for `wrangler vectorize insert studpilot-library --file`. C items are never embedded (L5).
//
//   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... node packages/library/src/embed.mjs <items.jsonl> <out.ndjson>
//
// A vector id is the sha1 of the item id (Vectorize ids are at most 64 bytes); the item id is in the metadata.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { toCard, cardLine } from './card.mjs';

export const MODEL = '@cf/baai/bge-small-en-v1.5'; // 384 dimensions, the same as studpilot-docs
export const vectorId = (id) => createHash('sha1').update(id).digest('hex');

/** The text a vector stands for: the card line plus the item's tags. Pure. */
export function embedText(it) {
  const card = toCard({ ...it, themes: it.tags ?? [], triangles: it.checks?.triangles });
  // What the item is for, in the graders' words from its own README (code): the title alone ('ProfileStore') says
  // nothing to a need like 'save player data'.
  const uses = [...new Set((it.grade_notes ?? []).map((n) => n.why).filter(Boolean))].join(' ');
  return (cardLine(card) + (uses ? ` | ${uses}` : '')).slice(0, 700);
}

async function embed(texts, account, token) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${MODEL}`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ text: texts }),
  });
  const body = await res.json();
  if (!res.ok || !body.success) throw new Error(`Workers AI ${res.status}: ${JSON.stringify(body.errors ?? body).slice(0, 200)}`);
  return body.result.data;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [itemsFile, out] = process.argv.slice(2);
  const account = process.env.CLOUDFLARE_ACCOUNT_ID, token = process.env.CLOUDFLARE_API_TOKEN;
  if (!itemsFile || !out || !account || !token) { console.error('usage: CLOUDFLARE_ACCOUNT_ID=.. CLOUDFLARE_API_TOKEN=.. embed.mjs <items.jsonl> <out.ndjson>'); process.exit(2); }
  const items = readFileSync(itemsFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((i) => i.grade === 'A' || i.grade === 'B');
  const lines = [];
  for (let i = 0; i < items.length; i += 50) {
    const batch = items.slice(i, i + 50);
    const vectors = await embed(batch.map(embedText), account, token);
    batch.forEach((it, k) => lines.push(JSON.stringify({ id: vectorId(it.id), values: vectors[k], metadata: { item: it.id, kind: it.kind, grade: it.grade, family: it.family } })));
    if ((i / 50) % 10 === 0) console.log(`${Math.min(i + 50, items.length)}/${items.length}`);
  }
  writeFileSync(out, lines.join('\n') + '\n');
  console.log(`${lines.length} vectors -> ${out}`);
}

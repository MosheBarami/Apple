// Send ONLY StudPilot's research notes to the index: add or update, never prune, never touch the docs chunks.
// The full pipeline (upload.mjs) needs chunks.jsonl, which is built from raw/ sources that a given machine may not
// have; this path needs only packages/corpus/research/. Same endpoint and body as upload.mjs step 3.
//   API_BASE=https://… ADMIN_KEY=… node src/research-upload.mjs [--notes 15,16] [--dry]
import { researchChunks } from './research-chunks.mjs';
import { chunkHash } from './index-plan.mjs';

const API_BASE = process.env.API_BASE?.replace(/\/+$/, '');
const ADMIN_KEY = process.env.ADMIN_KEY;
// --notes 15,16: only those notes, so a new batch does not re-embed the ones already sent.
const at = process.argv.indexOf('--notes');
const only = at > 0 ? new Set(process.argv[at + 1].split(',').map((n) => `research-${n.padStart(2, '0')}`)) : null;
const chunks = researchChunks()
  .filter((c) => !only || only.has(c.docSlug.slice(0, 11)))
  .map(({ embed, ...c }) => ({ ...c, contentHash: chunkHash({ ...c, embed }) }));
console.log(`[research-upload] ${chunks.length} chunks from ${new Set(chunks.map((c) => c.docSlug)).size} notes`);
if (process.argv.includes('--dry')) process.exit(0);
if (!API_BASE || !ADMIN_KEY) { console.error('set API_BASE and ADMIN_KEY'); process.exit(1); }
for (let i = 0; i < chunks.length; i += 50) {
  const res = await fetch(`${API_BASE}/api/admin/embed-batch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Admin-Key': ADMIN_KEY },
    body: JSON.stringify({ chunks: chunks.slice(i, i + 50), skipVectors: false }),
  });
  const text = await res.text();
  if (!res.ok) { console.error(`[research-upload] batch ${i / 50 + 1} -> ${res.status}: ${text.slice(0, 300)}`); process.exit(1); }
  console.log(`[research-upload] batch ${i / 50 + 1}: ${text.slice(0, 160)}`);
}

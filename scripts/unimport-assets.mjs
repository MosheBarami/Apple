#!/usr/bin/env node
// Remove every asset this project uploaded to the owner's Roblox account.
//
// Run this and the 299 assets are archived on Roblox and the library rows go back to being what
// they were: a catalogue. Nothing else in the harvest is touched — the provenance, the licences and
// the search index all stay.
//
//   GOLEM_ADMIN_KEY=… node scripts/unimport-assets.mjs
import { appendFileSync } from 'node:fs';
const BASE = process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1] : 'https://golem.moshe-barami111.workers.dev';
const KEY = process.env.GOLEM_ADMIN_KEY ?? process.env.ADMIN_KEY;
if (!KEY) { console.error('GOLEM_ADMIN_KEY is not set'); process.exit(2); }

let archived = 0, failed = 0;
for (;;) {
  const res = await fetch(`${BASE}/api/admin/assets/unimport`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Admin-Key': KEY },
    body: JSON.stringify({ limit: 10 }),
  });
  if (!res.ok) { console.error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`); break; }
  const body = await res.json();
  if (body.attempted === 0) { console.error('nothing left to remove'); break; }
  archived += body.archived;
  failed += body.failed;
  for (const o of body.outcomes) if (!o.ok) appendFileSync('/tmp/unimport-failures.log', `${o.id}\t${o.error}\n`);
  console.error(`${archived} archived, ${failed} failed`);
  // A pass that archives nothing means every remaining row fails permanently — stop rather than
  // spin. Unlike the import, this selector cannot skip a stuck row, so the stop condition is here.
  if (body.archived === 0) { console.error('a full pass archived nothing — stopping'); break; }
}
console.error(`\ndone: ${archived} archived, ${failed} failed`);

#!/usr/bin/env node
// Drive the library import: upload catalogued assets to Roblox until there are none left to try.
//
// The work happens in the worker, where the Open Cloud key lives. This is the loop around it, and
// its whole job is to be honest about a long job:
//
//   * Each call is small. An upload plus its polling takes the better part of ten seconds, so a
//     request that tried fifty would be killed halfway through and the assets it had already
//     uploaded would be real, paid-for and unrecorded.
//   * IT CARRIES A CURSOR. The worker selects rows whose Roblox id is still null, and a row that
//     fails permanently — an HDRI with no diffuse map, a zip — stays null. Without stepping past
//     the last id seen, that row sits at the head of the queue for ever and blocks every row
//     behind it, while this loop looks busy and the count never moves.
//   * Failures are grouped by REASON. Eight hundred identical messages are one fact.
import { appendFileSync } from 'node:fs';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'https://golem.moshe-barami111.workers.dev');
const PREFIX = arg('--prefix', 'poly_haven/textures/');
const PER_CALL = Number(arg('--per-call', '3'));
const MAX = Number(arg('--max', '10000'));
const LOG = arg('--log', '');
const KEY = process.env.GOLEM_ADMIN_KEY ?? process.env.ADMIN_KEY;
if (!KEY) { console.error('GOLEM_ADMIN_KEY is not set'); process.exit(2); }

let imported = 0, attempted = 0, pending = 0;
let after;
const reasons = new Map();
const assetIds = [];

while (attempted < MAX) {
  let body;
  try {
    const res = await fetch(`${BASE}/api/admin/assets/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Admin-Key': KEY },
      body: JSON.stringify({ limit: PER_CALL, idPrefix: PREFIX, after }),
    });
    if (!res.ok) { console.error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`); break; }
    body = await res.json();
  } catch (e) {
    console.error(`network: ${e.message ?? e}`);
    await new Promise((r) => setTimeout(r, 5000));
    continue;
  }

  if (body.attempted === 0) { console.error('nothing left to try'); break; }
  after = body.lastId ?? after;
  attempted += body.attempted;
  imported += body.imported;
  for (const o of body.outcomes) {
    if (o.ok) { assetIds.push(`${o.id} ${o.robloxAssetId}`); continue; }
    if (o.pendingOperation) pending++;
    // The reason, with row-specific detail stripped, so a thousand rows failing for one cause read
    // as one cause. The raw message is kept in the log file when one is given.
    const key = String(o.error ?? 'unknown')
      .replace(/for \S+ —/, 'for <id> —')
      .replace(/\d{5,}/g, '<n>')
      .slice(0, 120);
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
    if (LOG) appendFileSync(LOG, `${o.id}\t${o.error}\n`);
  }

  if (attempted % 30 < PER_CALL) console.error(`${imported} imported / ${attempted} tried`);
}

console.error(`\nimported ${imported} · tried ${attempted} · still processing ${pending}`);
for (const [why, n] of [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.error(`  ${String(n).padStart(5)}  ${why}`);
if (LOG) appendFileSync(LOG, assetIds.join('\n') + '\n');

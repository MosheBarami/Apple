#!/usr/bin/env node
// One-time copy of a Vectorize index to a new one (StudPilot handoff 1.3: golem-docs -> studpilot-docs).
// Vectorize indexes cannot be renamed, so the vectors are listed, fetched with their values and
// metadata, and inserted into the destination, which must already exist with the same dimensions and
// metric. Read-only on the source. Idempotent: `insert` of an existing id is skipped by Vectorize, so a
// re-run after a failure continues; `--upsert` overwrites instead.
//
//   node infra/migrate-studpilot/copy-vectorize.mjs <from> <to> [--upsert] [--dry-run]
//
// Credentials: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID from the environment or the repo .env
// (loaded the way infra/smoke.mjs does; never printed).
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../..', import.meta.url).pathname;
if (existsSync(root + '.env')) {
  for (const line of readFileSync(root + '.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const [from, to, ...flags] = process.argv.slice(2);
if (!from || !to || flags.some((f) => !['--upsert', '--dry-run'].includes(f))) {
  console.error('usage: copy-vectorize.mjs <from> <to> [--upsert] [--dry-run]');
  process.exit(2);
}
const TOKEN = process.env.CLOUDFLARE_API_TOKEN, ACCT = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!TOKEN || !ACCT) { console.error('CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID missing'); process.exit(2); }
const api = async (path, init = {}) => {
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/vectorize/v2/indexes/${path}`, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, ...(init.headers ?? {}) } });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.success) return j.result;
    if (attempt >= 5 || (r.status < 500 && r.status !== 429)) throw new Error(`${init.method ?? 'GET'} ${path.split('?')[0]}: HTTP ${r.status} ${JSON.stringify(j.errors ?? []).slice(0, 300)}`);
    await new Promise((res) => setTimeout(res, 1000 * attempt));
  }
};

const src = await api(`${from}/info`);
const dstCfg = await api(to).catch((e) => { throw new Error(`destination ${to} not readable (create it first): ${e.message}`); });
if (dstCfg.config?.dimensions !== src.dimensions) throw new Error(`dimensions differ: ${from}=${src.dimensions}, ${to}=${dstCfg.config?.dimensions}`);
console.log(`${from}: ${src.vectorCount} vectors, ${src.dimensions} dims; ${to}: metric ${dstCfg.config?.metric}`);

const ids = [];
let cursor = null;
do {
  const page = await api(`${from}/list?count=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
  for (const v of page.vectors) ids.push(v.id);
  cursor = page.isTruncated ? page.nextCursor : null;
} while (cursor);
if (new Set(ids).size !== ids.length) throw new Error('the source listing returned duplicate ids');
console.log(`listed ${ids.length} ids (source info says ${src.vectorCount})`);
if (flags.includes('--dry-run')) process.exit(0);

let copied = 0;
for (let i = 0; i < ids.length; i += 20) {
  const batch = await api(`${from}/get_by_ids`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: ids.slice(i, i + 20) }) });
  const ndjson = batch.map((v) => JSON.stringify({ id: v.id, values: v.values, ...(v.metadata ? { metadata: v.metadata } : {}), ...(v.namespace ? { namespace: v.namespace } : {}) })).join('\n');
  await api(`${to}/${flags.includes('--upsert') ? 'upsert' : 'insert'}`, { method: 'POST', headers: { 'content-type': 'application/x-ndjson' }, body: ndjson });
  copied += batch.length;
  if (copied % 1000 < 20) console.log(`  ${copied}/${ids.length}`);
}
console.log(`sent ${copied} vectors to ${to}. Vectorize applies writes asynchronously: re-read ${to}/info until vectorCount = ${ids.length}.`);

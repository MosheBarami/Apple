#!/usr/bin/env node
// Send only the hash-verified CC0 UI sounds to the worker's private static store.
// Usage: source the repo .env in a subshell, then run this file; credentials are never printed.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const library = join(here, '..');
const rows = readFileSync(join(here, 'sources/opengameart-cc0-ui.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const base = process.env.API_BASE;
const key = process.env.GOLEM_ADMIN_KEY;
if (!base || !key) throw new Error('API_BASE and GOLEM_ADMIN_KEY are required');
const listed = await fetch(`${base}/api/admin/static-list`, { headers: { 'X-Admin-Key': key } });
if (!listed.ok) throw new Error(`static-list answered ${listed.status}`);
const have = new Set((await listed.json()).map((r) => r.path));

let sent = 0;
for (const row of rows) {
  if (row.license !== 'CC0-1.0' || !/^sfx-store\/opengameart\/(joth-ui|m1chiboi-ui)\/[^/]+\.(wav|mp3)$/.test(row.file)) {
    throw new Error(`Unexpected source row: ${row.id}`);
  }
  const bytes = readFileSync(join(library, row.file));
  if (bytes.length !== row.bytes || createHash('sha256').update(bytes).digest('hex') !== row.sha256) {
    throw new Error(`Local file checksum failed: ${row.id}`);
  }
  const remote = `/private-library/sfx/${row.file.slice('sfx-store/'.length)}`;
  if (have.has(remote)) continue;
  const res = await fetch(`${base}/api/admin/static-upload`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Admin-Key': key },
    body: JSON.stringify({ path: remote, contentType: row.file.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg', b64: bytes.toString('base64') }),
  });
  if (!res.ok) throw new Error(`${row.id}: static-upload answered ${res.status}`);
  sent++;
}
console.log(JSON.stringify({ listed: rows.length, alreadyStored: rows.length - sent, uploaded: sent }));

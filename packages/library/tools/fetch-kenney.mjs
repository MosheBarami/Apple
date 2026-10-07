// Fetch Kenney packs from a ledger (master plan §4.4 step 3): each kenney.nl asset page's own zip
// (kenney.nl/media/pages/assets/<slug>/.../kenney_<slug>.zip), at most one request a second, unpacked into
// <out>/<slug>/. Resumable: a pack folder with a fetch.json is not fetched again.
//
//   node packages/library/tools/fetch-kenney.mjs <ledger.jsonl> <out-dir>
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const UA = { 'user-agent': 'StudPilot-Library/1.0 (+https://studpilot.app; library ingestion of CC0 packs)' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** The pack's own zip on its kenney.nl page. Pure. */
export function zipLink(html, slug) {
  return [...html.matchAll(/https:\/\/kenney\.nl\/media\/pages\/assets\/[^"'\s]+\.zip/g)].map((m) => m[0]).find((u) => u.includes(`/assets/${slug}/`));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [ledger, out] = process.argv.slice(2);
  if (!ledger || !out) { console.error('usage: fetch-kenney.mjs <ledger.jsonl> <out-dir>'); process.exit(2); }
  for (const row of readFileSync(ledger, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))) {
    const slug = row.url.replace(/\/$/, '').split('/').pop();
    const dir = join(out, slug);
    if (existsSync(join(dir, 'fetch.json'))) continue;
    mkdirSync(dir, { recursive: true });
    const url = zipLink(await (await fetch(row.url, { headers: UA })).text(), slug);
    await wait(1000);
    if (!url) { console.log(`${slug}: no zip on the page`); continue; }
    const buf = Buffer.from(await (await fetch(url, { headers: UA })).arrayBuffer());
    writeFileSync(join(dir, `${slug}.zip`), buf);
    execFileSync('bsdtar', ['-xf', join(dir, `${slug}.zip`), '-C', dir], { stdio: 'ignore' });
    writeFileSync(join(dir, 'fetch.json'), JSON.stringify({ url: row.url, zip: url, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex'), at: new Date().toISOString() }, null, 1));
    console.log(`${slug}: ${(buf.length / 1e6).toFixed(1)} MB`);
    await wait(1000);
  }
}

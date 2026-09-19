#!/usr/bin/env node
// Dry by default. --check reads live D1. --apply changes ONLY missing expanded OGA URLs.
// Existing Wrangler credentials stay in process memory; neither credentials nor API error bodies
// are logged. No Roblox request, asset upload, worker deployment, or paid model call is made.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { planDownloadBackfill, verifyDownloadBackfill } from './lib/asset-download-backfill.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const worker = join(root, 'apps/worker');
const account = 'e9b8acf2e89a1de289a1ee4abb0f3f8d';
const database = '32c9471e-a7d7-49ee-a8fe-0a7def2c68bd';
const apply = process.argv.includes('--apply'), check = process.argv.includes('--check');
if (process.argv.slice(2).some(arg => !['--apply', '--check'].includes(arg))) {
  throw new Error('Only --check or --apply is supported');
}
const folder = mkdtempSync(join(tmpdir(), 'apple-asset-download-repair-'));
const bundle = join(folder, 'asset-library.mjs');
execFileSync(join(worker, 'node_modules/.bin/esbuild'), [join(worker, 'src/asset-library.ts'),
  '--bundle', '--format=esm', '--platform=neutral', '--main-fields=main,module', '--target=es2022', '--outfile=' + bundle],
  { stdio: 'pipe' });
const { validateProvenance } = await import(pathToFileURL(bundle).href);
const catalogueBytes = readFileSync(join(root, 'packages/corpus/data/library/opengameart-expanded.json'));
const catalogue = JSON.parse(catalogueBytes);
if (catalogue.failed === true) throw new Error('Catalogue harvest recorded failure');
const plan = planDownloadBackfill(catalogue.assets, validateProvenance);
const report = { at: new Date().toISOString(), mode: apply ? 'apply' : check ? 'check' : 'dry',
  database, catalogueSha256: createHash('sha256').update(catalogueBytes).digest('hex'),
  planned: plan.queries.length, rejected: plan.rejected, ambiguous: plan.ambiguous,
  batches: 0, changed: 0, complete: false };
const save = () => writeFileSync(join(folder, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ mode: report.mode, planned: report.planned, rejected: plan.rejected.length,
  ambiguousIds: plan.ambiguous.length, folder }));
save();
if (!plan.queries.length) throw new Error('No unambiguous valid records; no remote calls made');
if (!apply && !check) process.exit(0);

// Verified against installed Wrangler's documented auth token --json output shape.
let auth;
try {
  auth = JSON.parse(execFileSync(join(worker, 'node_modules/.bin/wrangler'), ['auth', 'token', '--json'],
    { cwd: worker, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
} catch { throw new Error('Unable to read existing Wrangler credentials; no credential output recorded'); }
if (!['oauth', 'api_token'].includes(auth.type) || typeof auth.token !== 'string' || !auth.token) {
  throw new Error('Existing bearer credentials required; refusing a broader authentication fallback');
}
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}`;
async function request(path, body) {
  const response = await fetch(endpoint + path, {
    method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(60_000),
    headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const value = await response.json();
  if (!response.ok || value.success !== true) {
    throw new Error(`D1 request failed (HTTP ${response.status}); stopped without automatic retry`);
  }
  return value.result;
}
const info = await request('');
if (info.uuid !== database || info.name !== 'golem-corpus') throw new Error('Live database identity mismatch');
const query = async body => {
  const results = await request('/query', body);
  if (!Array.isArray(results) || results.some(result => result.success !== true)) {
    throw new Error('Incomplete D1 query result; stopped without retry');
  }
  return results;
};
const columns = (await query({ sql: 'PRAGMA table_info(asset_library)' }))[0].results;
if (!columns.some(column => column.name === 'download_url')) {
  throw new Error('Compatibility column is missing; run the existing schema migration before repair');
}
const readSource = async () => (await query({
  sql: "SELECT * FROM asset_library WHERE source = 'opengameart' ORDER BY id",
}))[0].results;
const before = await readSource();
writeFileSync(join(folder, 'before.json'), JSON.stringify(before));
report.sourceRows = before.length;
const ids = new Map(before.map(row => [row.id, row]));
report.existing = plan.queries.filter(query => ids.has(query.params[1])).length;
report.missingUrls = plan.queries.filter(query => ids.get(query.params[1])?.download_url === null).length;
save();
console.log(JSON.stringify({ sourceRows: before.length, existing: report.existing, missingUrls: report.missingUrls }));
if (!apply) process.exit(0);
try {
  for (let from = 0; from < plan.queries.length; from += 100) {
    const batch = plan.queries.slice(from, from + 100);
    const results = await query({ batch });
    if (results.length !== batch.length) throw new Error('D1 omitted batch results');
    const changed = results.reduce((sum, result) => sum + result.results.length, 0);
    report.changed += changed;
    report.batches++;
    save();
    console.log(JSON.stringify({ processed: Math.min(from + 100, plan.queries.length), changed: report.changed }));
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  const after = await readSource();
  writeFileSync(join(folder, 'after.json'), JSON.stringify(after));
  report.verification = verifyDownloadBackfill(before, after, plan.queries);
  if (report.changed !== report.verification.changed) throw new Error('Write count disagrees with read-back');
  report.complete = true;
  save();
  console.log(JSON.stringify({ complete: true, ...report.verification, folder }));
} catch (error) {
  report.failure = error.message;
  save();
  throw error;
}

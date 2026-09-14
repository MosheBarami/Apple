// Do not OFFER a tool that cannot work in this deployment.
//
// Nothing in the repository calls ensureAssetTables or upsertAssets, so the curated library's
// tables have never been created — while the system prompt told the model to try
// search_asset_library FIRST. Every one of those calls returned `no such table:
// asset_library_fts`: a wasted inference step on every build that reaches for an asset, and a raw
// SQL string the model could do nothing with.
//
// The fix must not be to create the tables. An empty library answering "no matches" is a claim
// about a table nobody has ever filled — turning a loud failure into a quiet lie, which is the
// exact defect this codebase keeps finding elsewhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const out = join(tmpdir(), `apple-toolgate-${process.pid}.mjs`);
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
  join(WORKER, 'src', 'tools.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${out}`,
], { cwd: WORKER, stdio: 'pipe' });
const T = await import(`file://${out}`);
rmSync(out, { force: true });

const LIB = readFileSync(join(WORKER, 'src', 'asset-library.ts'), 'utf8');
const SESSION = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');

const names = (defs) => defs.map((d) => d.name);

test('the library tool is offered when the library exists', () => {
  const defs = T.toolDefs(true, undefined, { assetLibrary: true });
  assert.ok(names(defs).includes('search_asset_library'));
});

test('it is withheld when the library does not exist', () => {
  const defs = T.toolDefs(true, undefined, { assetLibrary: false });
  assert.equal(names(defs).includes('search_asset_library'), false);
  // And nothing else is lost with it — the Creator Store route must survive.
  assert.ok(names(defs).includes('find_verified_asset'), 'the remaining asset route must stay');
  assert.ok(names(defs).includes('insert_asset'));
});

test('the default is to offer it, so an un-updated caller behaves as before', () => {
  assert.ok(names(T.toolDefs(true, undefined)).includes('search_asset_library'));
  assert.ok(names(T.toolDefs(true)).includes('search_asset_library'));
});

test('availability is READ, never created', () => {
  const fn = LIB.slice(LIB.indexOf('export async function assetLibraryAvailable'), LIB.indexOf('export function resetAssetLibraryAvailability'));
  assert.match(fn, /select name from sqlite_master/, 'it must ask whether the table exists');
  assert.equal(/create\s+(virtual\s+)?table/i.test(fn), false, 'it must never create the table it is asking about');
  assert.equal(/ensureAssetTables/.test(fn), false);
});

test('a CORPUS binding that cannot be queried is not evidence the library exists', () => {
  const fn = LIB.slice(LIB.indexOf('export async function assetLibraryAvailable'), LIB.indexOf('export function resetAssetLibraryAvailability'));
  const katch = fn.slice(fn.indexOf('catch'));
  assert.match(katch, /libraryAvailable = false/, 'an error must resolve to unavailable, not available');
});

test('the session gates both the tool list and the prompt on the same fact', () => {
  // Withholding the tool while the prompt still names it would leave the model reaching for
  // something it was told to use and cannot see.
  assert.match(SESSION, /toolDefs\(studioConnected, allowed, \{ assetLibrary: hasAssetLibrary \}\)/);
  assert.match(SESSION, /assetLibraryAvailable: await assetLibraryAvailable\(this\.env\)/);
});

test('the loud missing-table branch is still there for anything that reaches the tool anyway', () => {
  const tools = readFileSync(join(WORKER, 'src', 'tools.ts'), 'utf8');
  const body = tools.slice(tools.indexOf('search_asset_library: {'), tools.indexOf('find_verified_asset: {'));
  assert.match(body, /\.includes\('no such table'\)/);
  assert.match(body, /not available in this deployment/);
});

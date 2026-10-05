/**
 * Every key a project's session keeps in durable storage is named once (project-state.ts), with what a fresh start does to it.
 * "Every project is new: nothing from one project may leak into another" (owner directive, 2026-10-02): /bench-reset used to
 * delete nine keys by hand and miss the rest (the steer queue, the asset-source question, the place mirror, the selection mirror).
 *
 * The completeness check reads session.ts: a new storage key that the registry does not name fails here, so nobody can add one
 * without deciding whether a fresh start erases it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'pstate-')), 'p.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'project-state.ts'), '--bundle', '--format=esm', '--target=es2022', '--platform=node', '--outfile=' + out], { cwd: WORKER, stdio: 'pipe' });
const S = await import(`file://${out}`);
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const session = strip(readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8'));

/** The storage keys session.ts reads, writes or deletes: quoted literals, and the named constants it declares. */
function storageKeys(text) {
  // Named constants: the ones session.ts declares, and the ledger's key it imports.
  const imported = strip(readFileSync(join(WORKER, 'src', 'build-ledger.ts'), 'utf8'));
  const consts = Object.fromEntries([...(text + '\n' + imported).matchAll(/^(?:export )?const ([A-Z_]+) = '([A-Za-z]+)';/gm)].map((m) => [m[1], m[2]]));
  const keys = new Set();
  for (const m of text.matchAll(/storage\.(?:get|put|delete)(?:<[^>()]*(?:\([^)]*\))?[^>()]*>)?\(\s*(?:'([A-Za-z]+)'|([A-Z_]+)\b)/g)) {
    const key = m[1] ?? consts[m[2]];
    if (key) keys.add(key);
  }
  return keys;
}

test('the registry reads session.ts: it found real keys (a scan that found nothing would pass)', () => {
  const keys = storageKeys(session);
  assert.ok(keys.size >= 18, `only ${keys.size} storage keys found`);
  for (const k of ['agent', 'memory', 'bind', 'opQueue', 'steerQueue']) assert.ok(keys.has(k), `${k} was not found: the scan is broken`);
});

test('every storage key session.ts uses is in the registry, and every registry key is used (so the table cannot go stale either way)', () => {
  const used = storageKeys(session);
  const named = new Set(Object.keys(S.STORAGE_KEYS));
  assert.deepEqual([...used].filter((k) => !named.has(k)).sort(), [], 'a storage key the registry does not name: decide whether a fresh start erases it, then add it to project-state.ts');
  assert.deepEqual([...named].filter((k) => !used.has(k)).sort(), [], 'a registry key session.ts no longer uses');
});

test('what a fresh start erases is the project\'s work; what it keeps is the project\'s identity and the Studio pairing', () => {
  const reset = new Set(S.RESET_KEYS);
  for (const k of ['agent', 'memory', 'memoryEditedAt', 'pendingAssetChoice', 'buildLedger', 'plannedGame', 'playtestRun', 'assetSourcesAwaitingRun', 'assetSourcesAsked', 'steerQueue', 'placeMirrored', 'pluginSelection', 'opQueue']) {
    assert.ok(reset.has(k), `${k} survives a fresh start: it would leak into the next project`);
  }
  for (const k of ['bind', 'pluginClient', 'pluginLastSeen', 'pluginPlace', 'pluginState', 'pluginSuperseded', 'pluginTokenHash', 'pluginTokenIssuedAt', 'seq']) {
    assert.equal(reset.has(k), false, `${k} would unbind the project or disconnect Studio`);
  }
  assert.equal(reset.has('builtObject') || reset.has('builtGame'), false, 'the single slots are gone');
});

test('/bench-reset uses the registry (one resetProjectState), and clears the in-memory mirrors of the keys it deletes', () => {
  const reset = session.slice(session.indexOf("path === '/bench-reset'"), session.indexOf("path === '/purge'"));
  assert.match(reset, /await this\.resetProjectState\(\);/);
  assert.equal(/storage\.delete\('/.test(reset), false, 'a hand-written list of keys is back in the handler');
  const fn = session.slice(session.indexOf('private async resetProjectState'), session.indexOf('private async liveLedger'));
  assert.match(fn, /for \(const key of RESET_KEYS\) await this\.ctx\.storage\.delete\(key\)/);
  for (const mirror of ['this.opQueue = []', 'this.assetSourcesAsked = null', 'this.pluginSelection']) assert.ok(fn.includes(mirror), `${mirror} is not cleared`);
});

test('no other Durable Object file keeps a project key the registry does not know', () => {
  const dirPath = join(WORKER, 'src', 'do');
  for (const f of readdirSync(dirPath).filter((n) => n.endsWith('.ts') && n !== 'session.ts')) {
    const keys = [...strip(readFileSync(join(dirPath, f), 'utf8')).matchAll(/storage\.(?:get|put|delete)(?:<[^>()]*>)?\(\s*'([A-Za-z]+)'/g)].map((m) => m[1]);
    for (const k of keys) assert.ok(!['buildLedger', 'plannedGame', 'memory'].includes(k), `${f} keeps ${k}, a project key, outside the registry's reach`);
  }
});

test('the user-scoped image cache read is gone: nothing writes ui-image:<user>:<asset>, so nothing reads it', () => {
  const ui = strip(readFileSync(join(WORKER, 'src', 'ui-components.ts'), 'utf8'));
  assert.equal(/ui-image:/.test(ui), false);
  assert.equal(/env\.KV/.test(ui.slice(ui.indexOf('export function uiImageResolver'), ui.indexOf('export function uiImageResolver') + 900)), false, 'the resolver reads no KV');
});

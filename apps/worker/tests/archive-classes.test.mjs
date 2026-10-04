// The former golem Worker's Durable Objects live on in this Worker (handoff 1.3, migration v4). Two
// properties: every golem class moves into an exported Archive* class while the live bindings keep the
// live classes, and nothing serves an archived object, so a leftover alarm cannot resume an old run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(mkdtempSync(join(tmpdir(), 'studpilot-archive-classes-')), 'worker.mjs');
execFileSync(join(WORKER, 'node_modules/.bin/esbuild'), [
  join(WORKER, 'src/index.ts'), '--bundle', '--format=esm', '--target=es2022',
  `--alias:cloudflare:workers=${join(WORKER, 'tests/stubs/cloudflare-workers.mjs')}`,
  `--outfile=${OUT}`,
], { cwd: WORKER, stdio: 'pipe' });
const exported = await import(`file://${OUT}`);
const config = JSON.parse(readFileSync(join(WORKER, 'wrangler.studpilot.jsonc'), 'utf8').replace(/^\s*\/\/[^\n]*$/gm, ''));

const GOLEM_CLASSES = ['AdminDO', 'BudgetDO', 'DiscordDO', 'PairingDO', 'QuotaDO', 'SessionDO'];
const LIVE = { SESSION_DO: 'SessionDO', QUOTA_DO: 'QuotaDO', PAIRING_DO: 'PairingDO', ADMIN_DO: 'AdminDO', BUDGET_DO: 'BudgetDO', DISCORD_DO: 'DiscordDO' };

test('every golem class moves into an exported Archive class; the live bindings keep the live classes', () => {
  const moves = config.migrations.flatMap((m) => m.transferred_classes ?? []);
  assert.deepEqual(moves.map((t) => t.from).sort(), GOLEM_CLASSES, 'a golem class is left behind, and golem becoming a proxy would delete it');
  for (const t of moves) {
    assert.equal(t.from_script, 'golem');
    assert.match(t.to, /^Archive/);
    assert.equal(typeof exported[t.to], 'function', `${t.to} is not exported from the main module, so the deploy is refused`);
  }
  const bindings = config.durable_objects.bindings;
  for (const [name, cls] of Object.entries(LIVE)) {
    assert.equal(bindings.find((b) => b.name === name)?.class_name, cls, `${name} must bind the live ${cls}`);
  }
  assert.deepEqual(bindings.filter((b) => /^Archive/.test(b.class_name)).map((b) => b.name), ['LEGACY_QUOTA_DO']);
  assert.equal(bindings.some((b) => b.script_name), false, 'no binding reaches into another Worker any more');
});

test('nothing serves an archived object, and a leftover alarm does nothing', async () => {
  // Any storage access fails the test: an archived object must not read or write its old state.
  const storage = new Proxy({}, { get: (_, key) => { throw new Error(`archived object touched storage.${String(key)}`); } });
  const ctx = { storage, blockConcurrencyWhile: (fn) => fn() };
  for (const name of ['ArchiveSessionDO', 'ArchivePairingDO', 'ArchiveAdminDO', 'ArchiveBudgetDO', 'ArchiveDiscordDO']) {
    const Archived = exported[name];
    assert.equal(Archived.prototype instanceof exported[name.replace('Archive', '')], false, `${name} must not run the live class's code`);
    const object = new Archived(ctx, {});
    assert.equal((await object.fetch(new Request('https://do/messages'))).status, 410, name);
    assert.equal(await object.alarm(), undefined, name);
  }
});

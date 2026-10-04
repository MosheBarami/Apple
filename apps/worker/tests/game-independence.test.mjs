/** G13/G14: inserted game scripts must not depend on StudPilot and must not fabricate purchase ids.
 *  Run with: node --test tests/game-independence.test.mjs (from apps/worker) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(join(tmpdir(), 'game-indep-'));
const bundle = (entry) => {
  const outfile = join(temp, `${entry}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
    join(WORKER, 'src', `${entry}.ts`), '--bundle', '--format=esm', '--target=es2022', '--platform=node', `--outfile=${outfile}`,
  ], { cwd: WORKER, stdio: 'pipe' });
  return outfile;
};
const G = await import(pathToFileURL(bundle('game-independence')).href);
const T = await import(pathToFileURL(bundle('tools')).href);
const PF = await import(pathToFileURL(bundle('prefabs')).href);
const P = await import(pathToFileURL(bundle('prompts')).href);
rmSync(temp, { recursive: true, force: true });
const v = (s) => T.luauScanVariants(s);

test('refuses HttpService calls to our domains and plugin requires', () => {
  assert.ok(G.refuseGameScript(v('local H=game:GetService("HttpService"); H:GetAsync("https://studpilot.x.workers.dev/api")')));
  assert.ok(G.refuseGameScript(v('H:PostAsync("https://api.z.ai/v1/chat", body)')));
  assert.ok(G.refuseGameScript(v('local b = require(plugin.StudPilotBridge)')));
});

test('refuses the plugin and host names the product had before its rename, too', () => {
  assert.ok(G.refuseGameScript(v('local b = require(game.ServerScriptService.AppleBridge)')));
  assert.ok(G.refuseGameScript(v('local p = require(game.ServerScriptService.ApplePlugin)')));
  assert.ok(G.refuseGameScript(v('local p = require(game.ServerScriptService.StudPilotPlugin)')));
  assert.ok(G.refuseGameScript(v('H:GetAsync("https://api.apple-rbx.app/x")')));
  assert.ok(G.refuseGameScript(v('H:GetAsync("https://api.studpilot-rbx.app/x")')));
});

test('allows ordinary scripts, comments and unrelated HTTP', () => {
  assert.equal(G.refuseGameScript(v('-- talks to workers.dev? no\nprint("hi")')), null);
  assert.equal(G.refuseGameScript(v('local S = require(game.ReplicatedStorage.Shared)')), null);
  assert.equal(G.refuseGameScript(v('H:GetAsync("https://example.com/x")')), null);
});

test('an existing offence may be edited but not extended', () => {
  const bad = 'H:GetAsync("https://a.workers.dev/x")';
  assert.equal(G.refuseGameScript(v(bad + '\nprint(1)'), v(bad)), null);
  assert.ok(G.refuseGameScript(v(bad + '\n' + bad), v(bad)));
});

test('refuses numeric purchase ids, accepts config-driven and 0 placeholders', () => {
  assert.ok(G.refuseGameScript(v('MarketplaceService:PromptProductPurchase(player, 1234567)')));
  assert.ok(G.refuseGameScript(v('MarketplaceService:PromptGamePassPurchase(player, 99)')));
  assert.ok(G.refuseGameScript(v('MPS:UserOwnsGamePassAsync(player.UserId, 555001)')));
  assert.ok(G.refuseGameScript(v('local GamePassId = 8675309')));
  assert.equal(G.refuseGameScript(v('MPS:PromptProductPurchase(player, Config.CoinPackId)')), null);
  assert.equal(G.refuseGameScript(v('local GamePassId = 0')), null);
  assert.equal(G.refuseGameScript(v('MPS:UserOwnsGamePassAsync(player.UserId, 0)')), null);
  assert.equal(G.refuseGameScript(v('-- PromptProductPurchase(player, 123)\nprint(1)')), null);
});

test('create_instances Source is scanned', () => {
  const items = [{ className: 'Script', props: { Source: 'MPS:PromptProductPurchase(p, 4242)' }, children: [] }];
  assert.equal(G.sourcesIn(items).length, 1);
  assert.ok(G.refuseGameScript(v(G.sourcesIn(items)[0])));
});

test('run_luau refuses a fabricated id before anything reaches Studio', async () => {
  const r = await T.TOOLS.run_luau.run({}, { code: 'MPS:PromptGamePassPurchase(p, 31337)' });
  assert.match(r.error, /G14/);
});

test('prompt states the gap, independence and monetisation rules', () => {
  const src = readFileSync(join(WORKER, 'src', 'prompts.ts'), 'utf8');
  assert.match(src, /Unresolved essential gaps:/);
  assert.match(src, /MonetizationConfig/);
  assert.match(src, /NEVER invent\s+a gamepass/);
  assert.equal(typeof P.systemPrompt, 'function');
});

test('every bundled prefab module passes both checks', () => {
  const ids = Object.keys(PF.PREFABS);
  assert.ok(ids.length > 0);
  for (const id of ids) assert.equal(G.refuseGameScript(v(PF.PREFABS[id].source)), null, id);
});

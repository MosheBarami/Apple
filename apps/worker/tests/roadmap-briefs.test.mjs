/**
 * THE CATALOGUE PROSE IS THE BUILD PROMPT.
 *
 * `executionBrief` turns a milestone into a `MilestoneBrief`, whose `request` the roadmap route
 * hands into the conversation verbatim (apps/web/src/routes/roadmap.tsx navigates with
 * `state: { seed: request }`) and whose `steps` come straight from the spec's `build` array. So
 * these strings are not documentation about the product — they ARE the instruction the model
 * builds from, and rewriting them changes what gets built with no new machinery.
 *
 * That is why asserting on their content is a behaviour test rather than the "assert a prose
 * comment exists" anti-pattern: this prose is executed. The test drives the real chain —
 * parseScan -> analyzeProject -> buildRoadmap -> executionBrief — rather than reading the source,
 * so it also proves the milestone is reachable for a real project shape.
 *
 * What is pinned is the set of Roblox failure modes where generic advice produces a game that
 * looks finished and is broken in a way the developer will not find until players do:
 *   - SetAsync silently discarding a concurrent save
 *   - saving a default over a load that errored, which wipes an account and looks like success
 *   - a client-side debounce mistaken for a rate limit
 *   - ProcessReceipt returning PurchaseGranted before the grant is persisted, so the player pays
 *     for nothing, and being non-idempotent, so a retried receipt grants twice
 *   - GetSortedAsync on player join, whose limit is per place and so fails when the server is busy
 *   - a daily reward keyed off a clock the player controls
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const out = join(mkdtempSync(join(tmpdir(), 'rm-')), 'rm.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'roadmap.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const R = await import(`file://${out}`);

/** A simulator with a currency, a shop and remotes — enough for the 'any' milestones to appear. */
const SCAN = {
  counts: { instances: 900, parts: 700, scripts: 6 },
  services: { Workspace: 700, ServerScriptService: 3, ReplicatedStorage: 2, StarterGui: 1 },
  classes: { Part: 700, Script: 3, LocalScript: 2, RemoteEvent: 2, ScreenGui: 1, SpawnLocation: 1 },
  named: [{ name: 'Shop', className: 'Model', path: 'game.Workspace.Shop' }],
  lighting: [], guis: ['HUD'], topLevel: ['Workspace', 'ServerScriptService'],
  place: 'Coin Simulator',
  scripts: [
    { path: 'game.ServerScriptService.Main', className: 'Script',
      source: 'local leaderstats = Instance.new("Folder")\nlocal c = Instance.new("IntValue")\nc.Name = "Coins"\nlocal ev = Instance.new("RemoteEvent")\nev:FireClient(p)' },
  ],
  truncated: { scan: false, named: false, scripts: false, source: false },
};

const shape = R.analyzeProject(SCAN);
const roadmap = R.buildRoadmap(shape, Date.UTC(2026, 8, 14));

/** The brief a user would actually receive for a milestone, through the shipping function. */
function brief(id) {
  const b = R.executionBrief(shape, roadmap, id);
  assert.ok(b, `${id} produced no brief — it is not reachable for this project shape`);
  return `${b.request}\n${b.steps.join('\n')}\n${b.acceptance.join('\n')}`;
}

test('the chain is live, so none of the assertions below can pass vacuously', () => {
  assert.ok(roadmap.milestones.length >= 5, `only ${roadmap.milestones.length} milestones`);
  const b = R.executionBrief(shape, roadmap, 'save_progress');
  assert.ok(b && b.steps.length > 0, 'executionBrief returned nothing to assert on');
});

test('save_progress names the four ways a DataStore silently eats an account', () => {
  const t = brief('save_progress');
  assert.match(t, /UpdateAsync/, 'the atomic write must be named');
  assert.match(t, /SetAsync/, 'and the one that clobbers, so the contrast is explicit');
  assert.match(t, /BindToClose/, 'a shutdown must still persist');
  assert.match(t, /session-lock|session lock/i, 'duplication across servers');
  assert.match(t, /pcall/, 'a transient failure must be handled, not thrown');
  assert.match(t, /failed|error/i);
});

test('save_progress forbids the wipe: never save over a load that failed', () => {
  const t = brief('save_progress');
  assert.match(t, /refuse to save|does not overwrite/i,
    'the highest-severity DataStore bug must be stated, not implied');
});

test('server_authority distinguishes a server rate limit from a client debounce', () => {
  const t = brief('server_authority');
  assert.match(t, /debounce/i, 'the wrong answer must be named to be refused');
  assert.match(t, /token bucket|timestamp/i, 'and the right one given');
  assert.match(t, /RemoteFunction/, 'a client-invoked RemoteFunction yields the server thread');
  assert.match(t, /never accept an amount|claims it earned/i);
});

test('monetisation pins both ProcessReceipt bugs that charge a player for nothing', () => {
  const t = brief('monetisation');
  assert.match(t, /ProcessReceipt/);
  assert.match(t, /PurchaseGranted/);
  assert.match(t, /PurchaseId/, 'idempotency is keyed on the receipt id');
  assert.match(t, /idempotent|grants once|granted twice|grants it twice/i);
  assert.match(t, /UserOwnsGamePassAsync/, 'and the gamepass path needs its own call named');
});

test('global_leaderboard knows GetSortedAsync is limited per place, not per player', () => {
  const t = brief('global_leaderboard');
  assert.match(t, /GetSortedAsync/);
  assert.match(t, /per place/i);
  assert.match(t, /timer|once a minute/i, 'the correct cadence must be given');
});

test('daily_return keys the day off the server clock', () => {
  const t = brief('daily_return');
  assert.match(t, /os\.time/);
  assert.match(t, /server/i);
});

test('economy keeps the truth in the save and leaderstats as a mirror', () => {
  const t = brief('economy');
  assert.match(t, /leaderstats/);
  assert.match(t, /mirror|display/i);
});

test('every brief still reads as instructions, not as a specification dump', () => {
  // The guard against the obvious failure of this change: burying the build step under API names.
  for (const id of ['save_progress', 'server_authority', 'monetisation', 'global_leaderboard']) {
    const b = R.executionBrief(shape, roadmap, id);
    assert.ok(b.steps.length <= 8, `${id} has ${b.steps.length} steps — that is a document, not a brief`);
    for (const s of b.steps) {
      assert.ok(s.length <= 320, `${id} has a ${s.length}-char step; a brief step must stay readable`);
      assert.match(s, /^[A-Z]/, `${id} step does not start as a sentence: ${s.slice(0, 40)}`);
    }
  }
});

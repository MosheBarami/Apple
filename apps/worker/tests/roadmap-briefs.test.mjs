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
import { mkdtempSync, readFileSync } from 'node:fs';
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

const pfOut = join(mkdtempSync(join(tmpdir(), 'rm-pf-')), 'pf.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'prefabs.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + pfOut],
  { cwd: WORKER, stdio: 'pipe' });
const P = await import(`file://${pfOut}`);

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

test('global_leaderboard knows GetSortedAsync is a LIST operation, the scarcest budget', () => {
  // Checked against the current Roblox docs rather than from memory. List operations get
  // 5 requests/minute + 2 per player; ordinary reads get 60 + 40. An earlier version of this brief
  // said the limit was "per place, not per player", which is the wrong mechanism — the limits are
  // per server and they SCALE with player count. The reason not to fetch on join is that list is
  // the scarcest class, not that it fails when busy.
  const t = brief('global_leaderboard');
  assert.match(t, /GetSortedAsync/);
  assert.match(t, /LIST operation/, 'the restrictive class must be named');
  assert.match(t, /5 requests a minute plus 2 per player/, 'with the actual figure');
  assert.match(t, /timer|once a minute/i, 'and the correct cadence');
  assert.doesNotMatch(t, /per place, not per player/, 'the wrong mechanism must not come back');
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


// --- the briefs and the module library have to stay in step -----------------------------------

/**
 * A brief naming a module that does not exist is worse than a brief naming none.
 *
 * The prose IS the build prompt, so `install_module("profile_stores")` is not a broken link — it is
 * an instruction the model will follow, fail, and then work around by writing the thing itself,
 * having spent a turn discovering that. These two files have no import between them on purpose,
 * which is exactly why they need a test holding them together.
 */
const WIRED = {
  save_progress: 'profile_store',
  server_authority: 'remote_guard',
  monetisation: 'receipts',
  economy: 'currency',
  global_leaderboard: 'leaderboard',
  obby_stages: 'checkpoints',
  combat_rounds: 'rounds',
  tycoon_income: 'income',
};

/** Every install_module("...") named anywhere in the catalogue. */
function modulesNamedInBriefs() {
  const src = readFileSync(join(WORKER, 'src', 'roadmap.ts'), 'utf8');
  return [...src.matchAll(/install_module\("([a-z_]+)"\)/g)].map((m) => m[1]);
}

test('every module a brief names actually exists', () => {
  const named = modulesNamedInBriefs();
  assert.ok(named.length >= 6, `only ${named.length} briefs name a module`);
  for (const id of named) {
    assert.ok(P.PREFAB_IDS.includes(id),
      `a brief tells the model to install "${id}", which is not a module. Available: ${P.PREFAB_IDS.join(', ')}`);
  }
});

test('each wired milestone names its module, through the real brief', () => {
  // The skip is real — this project shape does not reach every milestone — but a loop that skips
  // everything asserts nothing and still passes. The count is checked so this cannot quietly become
  // a test of nothing; if the shape stops reaching these, that is a change worth failing on.
  let checked = 0;
  for (const [milestone, module] of Object.entries(WIRED)) {
    const b = R.executionBrief(shape, roadmap, milestone);
    if (!b) continue;
    checked += 1;
    const text = b.steps.join('\n');
    assert.match(text, new RegExp(`install_module\\("${module}"\\)`),
      `${milestone} should offer ${module}`);
  }
  assert.equal(checked, 5, `expected 5 of the ${Object.keys(WIRED).length} wired milestones to be reachable`);
});

test('the install step comes FIRST, before the rules it would satisfy', () => {
  // A module offered after four paragraphs of how to write it yourself is a module nobody installs.
  let checked = 0;
  for (const [milestone] of Object.entries(WIRED)) {
    const b = R.executionBrief(shape, roadmap, milestone);
    if (!b) continue;
    checked += 1;
    assert.match(b.steps[0], /install_module/, `${milestone}'s first step should be the module`);
  }
  assert.equal(checked, 5, 'the same five briefs must be the ones examined');
});

test('the rules survive alongside the module, for a builder who declines it', () => {
  // Replacing the rules with "install the module" would make the brief useless the moment somebody
  // needs something the module does not do.
  const b = R.executionBrief(shape, roadmap, 'save_progress');
  const text = b.steps.join('\n');
  assert.match(text, /UpdateAsync/, 'the rules must remain');
  assert.match(text, /BindToClose/);
  assert.ok(b.steps.length >= 4, 'the brief should still teach, not just delegate');
});

test('every module in the library is offered by some brief, or is deliberately unoffered', () => {
  // The other drift direction: a module nobody is told about is a module nobody installs.
  const named = new Set(modulesNamedInBriefs());
  // ui_kit is retired by D-UIONLY-1: install_module refuses it and names insert_ui_component instead.
  const RETIRED = new Set(['ui_kit']);
  const unoffered = P.PREFAB_IDS.filter((id) => !named.has(id) && !RETIRED.has(id));
  assert.deepEqual(unoffered, [],
    `these modules exist and no brief mentions them: ${unoffered.join(', ')}`);
});

test('briefs that put things in the world send the model to the model library first (D-MODELLIB-1)', () => {
  // A landmark, a shop the player walks to and a pet are all things the library holds. A brief
  // that just says "build" gets them hand-assembled from parts, which create_instances refuses.
  for (const id of ['playable_spawn', 'shopfront', 'sim_pets']) {
    const t = brief(id);
    assert.match(t, /find_library_model/, `${id} must name the library search`);
    assert.match(t, /insert_library_model/, `${id} must name the library insert`);
  }
});

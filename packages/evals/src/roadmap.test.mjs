// The roadmap must be derived from the project, not from a list of popular Roblox features.
//
// The load-bearing test in this file is the negative one: a tower-defence place, which has a
// currency, upgrades and a progression curve, must NEVER be told to add rebirth. That is the exact
// failure §31 names, and it is the one a template-shaped roadmap commits every time.
//
// Everything runs against the bundled worker module with injected inputs. No network, no Studio,
// no model: the whole detection path is deterministic by design (§39), so the tests can be too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..', '..', '..', 'apps', 'worker');
const dest = join(tmpdir(), `golem-roadmap-${process.pid}.mjs`);
execFileSync(
  join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'roadmap.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${dest}`],
  { stdio: 'pipe', cwd: WORKER },
);
const R = await import(`file://${dest}`);
rmSync(dest, { force: true });

/** A scan with every field present, so a fixture only states what it wants to be true. */
function scan(over = {}) {
  return {
    counts: { instances: 0, parts: 0, scripts: 0 },
    services: {},
    classes: {},
    named: [],
    lighting: [],
    guis: [],
    topLevel: [],
    scripts: [],
    truncated: { scan: false, named: false, scripts: false, source: false },
    ...over,
    counts: { instances: 0, parts: 0, scripts: 0, ...(over.counts ?? {}) },
    truncated: { scan: false, named: false, scripts: false, source: false, ...(over.truncated ?? {}) },
  };
}

// ---------------------------------------------------------------------------------------------
// Fixtures. Each is what a scan of that kind of place plausibly returns: names a builder actually
// chose, class counts, and the few lines of Luau that give the systems away.
// ---------------------------------------------------------------------------------------------

const TOWER_DEFENCE = scan({
  counts: { instances: 2400, parts: 1800, scripts: 6 },
  classes: { SpawnLocation: 1, RemoteEvent: 4, ScreenGui: 2, Model: 40, Folder: 9, Humanoid: 6 },
  topLevel: ['Map', 'Towers', 'Waypoints', 'EnemySpawn', 'Base'],
  named: [
    { path: 'game.Workspace.Waypoints', class: 'Folder', name: 'Waypoints' },
    { path: 'game.Workspace.Towers', class: 'Folder', name: 'Towers' },
    { path: 'game.Workspace.Map', class: 'Model', name: 'Map' },
    { path: 'game.Workspace.Enemies', class: 'Folder', name: 'Enemies' },
  ],
  guis: ['WaveHud', 'TowerShop'],
  scripts: [
    {
      path: 'game.ServerScriptService.WaveManager',
      class: 'Script',
      lines: 120,
      source: `
        local waypoints = workspace.Waypoints
        local waveNumber = 0
        local function spawnWave(n)
          for i = 1, n * 3 do
            local enemy = game.ServerStorage.Enemy:Clone()
            enemy.Parent = workspace.Enemies
          end
        end
        local function startWave()
          waveNumber += 1
          spawnWave(waveNumber)
        end
      `,
    },
    {
      path: 'game.ServerScriptService.TowerPlacement',
      class: 'Script',
      lines: 90,
      source: `
        local placeTower = game.ReplicatedStorage.Remotes.PlaceTower
        placeTower.OnServerEvent:Connect(function(player, towerName, cframe)
          local stats = player.leaderstats.Cash
          if stats.Value < 100 then return end
          stats.Value -= 100
        end)
      `,
    },
    {
      path: 'game.ServerScriptService.Leaderstats',
      class: 'Script',
      lines: 20,
      source: `
        game.Players.PlayerAdded:Connect(function(player)
          local leaderstats = Instance.new("Folder")
          leaderstats.Name = "leaderstats"
          local cash = Instance.new("IntValue")
          cash.Name = "Cash"
          cash.Parent = leaderstats
          leaderstats.Parent = player
        end)
      `,
    },
  ],
});

const SIMULATOR = scan({
  //[[ The place NAMES itself, which is where a real Roblox simulator says what it is.
  //
  //   This fixture used to declare its genre only in a script COMMENT (`-- Coin Simulator core
  //   loop`), and that stopped counting when the index started stripping comments — because on a
  //   real place two weight-3 genre signals fired on ordinary English prose: "racing" from
  //   "waits for the profile rather than RACING it", and "roleplay" from "the rest of the LIFE".
  //
  //   Running the scanner against a real place also showed WHY the fixture had to lean on a
  //   comment: the scan never captured `game.Name`, so the single most deliberate statement of
  //   intent in a place file was invisible to a detector whose strongest signals are all "the
  //   place calls itself X". It is captured now, and this fixture says it the way a real one
  //   would. ]]
  place: 'Coin Simulator',
  counts: { instances: 900, parts: 700, scripts: 4 },
  classes: { SpawnLocation: 1, RemoteEvent: 3, ScreenGui: 2, Model: 20, Folder: 6 },
  topLevel: ['Zone1', 'Shop', 'Baseplate'],
  named: [
    { path: 'game.Workspace.Zone1', class: 'Model', name: 'Zone1' },
    { path: 'game.Workspace.Shop', class: 'Model', name: 'Shop' },
  ],
  guis: ['CoinsHud', 'ShopGui'],
  scripts: [
    {
      path: 'game.ServerScriptService.CoinService',
      class: 'Script',
      lines: 60,
      source: `
        -- Coin Simulator core loop
        game.Players.PlayerAdded:Connect(function(player)
          local leaderstats = Instance.new("Folder")
          leaderstats.Name = "leaderstats"
          local coins = Instance.new("IntValue")
          coins.Name = "Coins"
          coins.Parent = leaderstats
          leaderstats.Parent = player
        end)
        local upgradeRemote = game.ReplicatedStorage.Upgrade
      `,
    },
  ],
});

const OBBY = scan({
  counts: { instances: 1500, parts: 1400, scripts: 2 },
  classes: { SpawnLocation: 12, Model: 8, Folder: 3 },
  topLevel: ['Stages', 'Lobby'],
  named: [
    { path: 'game.Workspace.Stages.Stage1', class: 'Model', name: 'Stage1' },
    { path: 'game.Workspace.Stages.Stage2', class: 'Model', name: 'Stage2' },
  ],
  scripts: [
    {
      path: 'game.ServerScriptService.Checkpoints',
      class: 'Script',
      lines: 40,
      source: `
        local lava = workspace.Stages.Stage1.Killbrick
        lava.Touched:Connect(function(hit)
          local hum = hit.Parent:FindFirstChild("Humanoid")
          if hum then hum:TakeDamage(100) end
        end)
      `,
    },
  ],
});

/** A place with geometry and not one line of code. */
const SHOWCASE = scan({
  counts: { instances: 600, parts: 580, scripts: 0 },
  classes: { Model: 30, Folder: 4 },
  topLevel: ['Gallery', 'Courtyard'],
  named: [{ path: 'game.Workspace.Gallery', class: 'Model', name: 'Gallery' }],
});

const shapeOf = (s) => R.analyzeProject(s);

/** A recorded legacy scan payload, kept to prove old evidence still parses. */
function wire(s) {
  return JSON.stringify({
    ...s,
    named: s.named.map((n) => ({ path: n.path, class: n.className, name: n.name })),
    scripts: s.scripts.map((x) => ({ path: x.path, class: x.className, lines: x.lines, src: x.source })),
  });
}

// ---------------------------------------------------------------------------------------------
// Genre detection
// ---------------------------------------------------------------------------------------------

test('a tower-defence place is read as tower defence', () => {
  const shape = shapeOf(TOWER_DEFENCE);
  assert.equal(shape.genre, 'tower_defence');
  assert.ok(shape.genreEvidence.length > 0, 'the verdict must carry its evidence');
});

test('a coin simulator is read as a simulator', () => {
  assert.equal(shapeOf(SIMULATOR).genre, 'simulator');
});

test('an obby is read as an obby', () => {
  assert.equal(shapeOf(OBBY).genre, 'obby');
});

test('geometry with no scripts is read as a showcase, not as a game genre', () => {
  assert.equal(shapeOf(SHOWCASE).genre, 'showcase');
});

test('an empty project claims no genre rather than guessing one', () => {
  const shape = shapeOf(scan());
  assert.equal(shape.genre, 'unknown');
  assert.equal(shape.genreConfidence, 0);
});

// ---------------------------------------------------------------------------------------------
// §31: THE NEGATIVE. This is the whole reason the genre gate exists.
// ---------------------------------------------------------------------------------------------

test('a tower-defence project is NEVER recommended rebirth or pets', () => {
  const shape = shapeOf(TOWER_DEFENCE);
  const roadmap = R.buildRoadmap(shape);
  const ids = roadmap.milestones.map((m) => m.id);
  assert.ok(!ids.includes('rebirth_loop'), 'rebirth is a simulator/tycoon convention, not a universal feature');
  assert.ok(!ids.includes('sim_pets'), 'pets must not be offered to a tower-defence game');
  const text = JSON.stringify(roadmap).toLowerCase();
  assert.ok(!text.includes('rebirth'), 'the word must not reach the user anywhere in the roadmap');
  assert.ok(!/\bpets\b/.test(text), 'pets must not be mentioned either');
  // and it must still have produced a real, genre-appropriate roadmap
  assert.ok(ids.includes('td_towers') && ids.includes('td_waves'), 'the tower-defence milestones must be there');
});

test('an obby is not offered rebirth, droppers or pets either', () => {
  const ids = R.buildRoadmap(shapeOf(OBBY)).milestones.map((m) => m.id);
  for (const forbidden of ['rebirth_loop', 'tycoon_income', 'sim_pets', 'sim_zones']) {
    assert.ok(!ids.includes(forbidden), `${forbidden} does not belong in an obby roadmap`);
  }
  assert.ok(ids.includes('obby_stages'), 'the obby milestones must be there');
});

test('rebirth IS offered to a simulator — the gate is genre-specific, not a blanket ban', () => {
  const ids = R.buildRoadmap(shapeOf(SIMULATOR)).milestones.map((m) => m.id);
  assert.ok(ids.includes('rebirth_loop'));
});

// ---------------------------------------------------------------------------------------------
// Dependency ordering
// ---------------------------------------------------------------------------------------------

for (const [name, fixture] of [
  ['tower defence', TOWER_DEFENCE],
  ['simulator', SIMULATOR],
  ['obby', OBBY],
  ['showcase', SHOWCASE],
  ['empty', scan()],
]) {
  test(`every dependency precedes its milestone (${name})`, () => {
    const roadmap = R.buildRoadmap(shapeOf(fixture));
    const at = new Map(roadmap.milestones.map((m, i) => [m.id, i]));
    for (const m of roadmap.milestones) {
      for (const dep of m.dependsOn) {
        assert.ok(at.has(dep), `${m.id} depends on ${dep}, which must be in the same roadmap`);
        assert.ok(at.get(dep) < at.get(m.id), `${dep} must be listed before ${m.id}`);
      }
    }
  });
}

test('a milestone whose dependency is unfinished is blocked, and names what blocks it', () => {
  const roadmap = R.buildRoadmap(shapeOf(SIMULATOR));
  const byId = new Map(roadmap.milestones.map((m) => [m.id, m]));
  const blocked = roadmap.milestones.filter((m) => m.status === 'blocked');
  assert.ok(blocked.length > 0, 'a young project must have milestones that are not reachable yet');
  for (const m of blocked) {
    assert.ok(m.blockedBy.length > 0, `${m.id} is blocked and must say by what`);
    for (const dep of m.blockedBy) assert.notEqual(byId.get(dep).status, 'done', 'a done dependency cannot block');
  }
});

test('dependencies that fall outside the genre are dropped, never left dangling', () => {
  const roadmap = R.buildRoadmap(shapeOf(OBBY));
  const ids = new Set(roadmap.milestones.map((m) => m.id));
  // `save_progress` depends on `economy`, which an obby does not get
  const save = roadmap.milestones.find((m) => m.id === 'save_progress');
  assert.ok(save, 'saving progress is a foundation for every genre');
  for (const dep of save.dependsOn) assert.ok(ids.has(dep));
});

// ---------------------------------------------------------------------------------------------
// Detection and status
// ---------------------------------------------------------------------------------------------

test('what the project already has is marked done, with the evidence that proved it', () => {
  const withSaves = scan({
    ...SIMULATOR,
    scripts: [
      ...SIMULATOR.scripts,
      {
        path: 'game.ServerScriptService.DataService',
        class: 'Script',
        lines: 80,
        source: 'local store = game:GetService("DataStoreService"):GetDataStore("Coins")\nstore:SetAsync(key, value)',
      },
    ],
  });
  const roadmap = R.buildRoadmap(shapeOf(withSaves));
  const save = roadmap.milestones.find((m) => m.id === 'save_progress');
  assert.equal(save.status, 'done');
  assert.equal(save.detected, 'present');
  assert.ok(save.evidence.join(' ').includes('datastore'), 'the evidence must quote what was found');
});

test('the current milestone is one the scan proved missing, never one it could not check', () => {
  for (const fixture of [TOWER_DEFENCE, SIMULATOR, OBBY, SHOWCASE]) {
    const roadmap = R.buildRoadmap(shapeOf(fixture));
    const current = roadmap.milestones.filter((m) => m.status === 'current');
    assert.ok(current.length <= 1, 'there is at most one current milestone');
    for (const m of current) {
      assert.equal(m.detected, 'absent');
      assert.deepEqual(m.blockedBy, []);
    }
  }
});

test('a truncated scan reports unknown rather than absent, and says so', () => {
  const partial = scan({ ...TOWER_DEFENCE, truncated: { scripts: true, source: true } });
  const shape = shapeOf(partial);
  assert.equal(shape.features.persistence.state, 'unknown', 'a code-only signal cannot be denied from a partial read');
  assert.ok(shape.limits.some((l) => l.includes('scripts')), 'the limit must be surfaced');
  const roadmap = R.buildRoadmap(shape);
  const save = roadmap.milestones.find((m) => m.id === 'save_progress');
  assert.equal(save.detected, 'unknown');
  assert.ok(save.verify, 'an unverifiable milestone must carry a verify note');
  assert.ok(roadmap.notes.some((n) => n.includes('scripts')));
});

test('suggestions stay small and start with the current milestone', () => {
  const roadmap = R.buildRoadmap(shapeOf(TOWER_DEFENCE));
  assert.ok(roadmap.next.length > 0 && roadmap.next.length <= R.MAX_SUGGESTIONS);
  const current = roadmap.milestones.find((m) => m.status === 'current');
  assert.equal(roadmap.next[0].id, current.id);
  for (const m of roadmap.next) {
    assert.notEqual(m.status, 'done');
    assert.notEqual(m.status, 'blocked');
    assert.ok(m.why && m.impact && m.effort && m.complexity, 'a suggestion carries why/impact/effort/complexity (§32)');
    assert.ok(m.deliverables.length, 'and what it actually delivers');
  }
});

test('every milestone in every genre carries a real category', () => {
  const allowed = new Set(['core', 'world', 'systems', 'progression', 'economy', 'polish']);
  const seen = new Set();
  for (const fixture of [TOWER_DEFENCE, SIMULATOR, OBBY, SHOWCASE, scan()]) {
    for (const m of R.buildRoadmap(shapeOf(fixture)).milestones) {
      assert.ok(allowed.has(m.category), `${m.id} has category ${m.category}`);
      seen.add(m.id);
    }
  }
});

// ---------------------------------------------------------------------------------------------
// §33: a milestone a builder can actually act on
// ---------------------------------------------------------------------------------------------

test('the brief for the next zone names the zone the project already has', () => {
  const shape = shapeOf(SIMULATOR);
  const roadmap = R.buildRoadmap(shape);
  const brief = R.executionBrief(shape, roadmap, 'sim_zones');
  assert.ok(brief, 'the milestone must produce a brief');
  assert.ok(brief.request.includes('Zone1'), '"add zone 2" is useless unless it knows what zone 1 is');
  assert.ok(brief.touches.includes('game.Workspace.Zone1'), 'the brief points at the real path');
  assert.ok(brief.request.includes('Coins'), 'it must reuse the currency that exists');
  assert.ok(brief.steps.length && brief.acceptance.length, 'a brief without steps or acceptance is not actionable');
});

test('a brief for a project with no zones does not invent a zone 1', () => {
  const shape = shapeOf(scan({ ...SIMULATOR, named: [], topLevel: ['Baseplate'] }));
  const brief = R.executionBrief(shape, R.buildRoadmap(shape), 'sim_zones');
  assert.ok(!brief.request.includes('Zone1'));
  assert.ok(brief.request.toLowerCase().includes('no named zone yet'));
});

test('an unknown milestone id yields no brief rather than an empty one', () => {
  const shape = shapeOf(SIMULATOR);
  assert.equal(R.executionBrief(shape, R.buildRoadmap(shape), 'not_a_milestone'), null);
});

// ---------------------------------------------------------------------------------------------
// The scan wire format
// ---------------------------------------------------------------------------------------------

test('a recorded tagged scan payload still parses for historical evidence', () => {
  const payload = JSON.stringify({
    counts: { instances: 3, parts: 2, scripts: 1 },
    services: { Workspace: 3 },
    classes: { SpawnLocation: 1 },
    named: [{ path: 'game.Workspace.Zone1', class: 'Model', name: 'Zone1' }],
    lighting: ['Atmosphere'],
    guis: ['Hud'],
    topLevel: ['Zone1'],
    scripts: [{ path: 'game.ServerScriptService.Main', class: 'Script', lines: 2, src: 'print(1)' }],
    truncated: { scan: false, named: false, scripts: false, source: false },
  });
  const parsed = R.parseScan({ result: { t: 'string', v: payload }, prints: [] });
  assert.equal(parsed.counts.parts, 2);
  assert.equal(parsed.named[0].name, 'Zone1');
  assert.equal(parsed.scripts[0].source, 'print(1)');
});

test('a scan that is not a scan is refused rather than half-read', () => {
  assert.equal(R.parseScan({ result: { t: 'string', v: 'not json' } }), null);
  assert.equal(R.parseScan(null), null);
  assert.equal(R.parseScan({ result: { t: 'string', v: '{"nope":1}' } }), null);
});

test('the roadmap is produced from typed read-only Studio operations, with no received code execution', async () => {
  const calls = [];
  const probe = async (op) => {
    calls.push(op.op);
    if (op.op === 'project_census') {
      return {
        id: 'census', ok: true, data: {
          instances: 7, parts: 2, scripts: 1,
          services: {
            Workspace: 4,
            ServerScriptService: 1,
            ReplicatedStorage: 2,
            StarterGui: 0,
            Lighting: 0,
          },
          topLevel: ['Towers', 'Waypoints', 'Enemies', 'Spawn'],
        },
      };
    }
    if (op.op === 'get_tree' && op.root === 'game.Workspace') {
      return {
        id: 'tree-workspace', ok: true, data: {
          root: {
            path: 'game.Workspace', name: 'Workspace', class: 'Workspace',
            children: [
              { path: 'game.Workspace.Towers', name: 'Towers', class: 'Folder' },
              { path: 'game.Workspace.Waypoints', name: 'Waypoints', class: 'Folder' },
              { path: 'game.Workspace.Enemies', name: 'Enemies', class: 'Model' },
              { path: 'game.Workspace.Spawn', name: 'Spawn', class: 'SpawnLocation' },
            ],
          },
          nodeCount: 5,
          truncated: false,
        },
      };
    }
    if (op.op === 'get_tree' && op.root === 'game.ServerScriptService') {
      return {
        id: 'tree-server', ok: true, data: {
          root: {
            path: 'game.ServerScriptService', name: 'ServerScriptService', class: 'ServerScriptService',
            children: [{ path: 'game.ServerScriptService.WaveManager', name: 'WaveManager', class: 'Script' }],
          },
          nodeCount: 2,
          truncated: false,
        },
      };
    }
    if (op.op === 'get_tree' && op.root === 'game.ReplicatedStorage') {
      return {
        id: 'tree-replicated', ok: true, data: {
          root: {
            path: 'game.ReplicatedStorage', name: 'ReplicatedStorage', class: 'ReplicatedStorage',
            children: [{
              path: 'game.ReplicatedStorage.Remotes', name: 'Remotes', class: 'Folder',
              children: [{ path: 'game.ReplicatedStorage.Remotes.PlaceTower', name: 'PlaceTower', class: 'RemoteEvent' }],
            }],
          },
          nodeCount: 3,
          truncated: false,
        },
      };
    }
    if (op.op === 'get_instance' && op.path === 'game') {
      return { id: 'place', ok: true, data: { path: 'game', name: 'Tower Defence', class: 'DataModel' } };
    }
    if (op.op === 'dump_scripts') {
      return {
        id: 'scripts', ok: true, data: {
          scripts: [{
            path: 'game.ServerScriptService.WaveManager',
            class: 'Script',
            source:
              'local waveNumber = 0\nlocal waypoints = workspace.Waypoints\n' +
              'local function spawnWave() waveNumber += 1 end\nlocal placeTower = game.ReplicatedStorage.Remotes.PlaceTower',
          }],
          chars: 180,
          truncated: false,
        },
      };
    }
    throw new Error(`unexpected typed roadmap op: ${JSON.stringify(op)}`);
  };
  const out = await R.roadmapForProject(probe);
  assert.equal(out.ok, true);
  assert.equal(calls.includes('project_census'), true);
  assert.equal(calls.includes('get_tree'), true);
  assert.equal(calls.includes('get_instance'), true);
  assert.equal(calls.includes('dump_scripts'), true);
  assert.equal(calls.includes('run_code'), false, 'roadmap must use the current typed plugin surface');
  assert.equal(out.roadmap.genre, 'tower_defence');
});

test('a truncated structural read makes missing class evidence unknown rather than absent', async () => {
  const probe = async (op) => {
    if (op.op === 'project_census') {
      return {
        id: 'census', ok: true, data: {
          instances: 2, parts: 1, scripts: 0,
          services: { Workspace: 2, StarterGui: 0, Lighting: 0 },
          topLevel: ['Map'],
        },
      };
    }
    if (op.op === 'get_tree') {
      return {
        id: 'tree', ok: true, data: {
          root: {
            path: 'game.Workspace', name: 'Workspace', class: 'Workspace',
            children: [{ path: 'game.Workspace.Map', name: 'Map', class: 'Model' }],
          },
          nodeCount: 2,
          truncated: true,
        },
      };
    }
    if (op.op === 'get_instance') {
      return { id: 'place', ok: true, data: { path: 'game', name: 'Untitled Place', class: 'DataModel' } };
    }
    throw new Error(`unexpected op: ${op.op}`);
  };
  const scanned = await R.scanProject(probe);
  assert.ok(scanned.scan);
  assert.equal(scanned.scan.truncated.scan, true);
  const shape = R.analyzeProject(scanned.scan);
  assert.equal(shape.features.spawn.state, 'unknown');
  assert.match(shape.features.spawn.evidence, /not all instance/i);
});

test('an unavailable script dump makes code-only features unknown while keeping measured structure', async () => {
  const probe = async (op) => {
    if (op.op === 'project_census') {
      return {
        id: 'census', ok: true, data: {
          instances: 1, parts: 0, scripts: 1,
          services: { ServerScriptService: 1, Workspace: 0, StarterGui: 0, Lighting: 0 },
          topLevel: [],
        },
      };
    }
    if (op.op === 'get_tree') {
      return {
        id: 'tree', ok: true, data: {
          root: {
            path: 'game.ServerScriptService', name: 'ServerScriptService', class: 'ServerScriptService',
            children: [{ path: 'game.ServerScriptService.Main', name: 'Main', class: 'Script' }],
          },
          nodeCount: 2,
          truncated: false,
        },
      };
    }
    if (op.op === 'get_instance') {
      return { id: 'place', ok: true, data: { path: 'game', name: 'Untitled Place', class: 'DataModel' } };
    }
    if (op.op === 'dump_scripts') {
      return { id: 'scripts', ok: false, error: 'script reader unavailable' };
    }
    throw new Error(`unexpected op: ${op.op}`);
  };
  const scanned = await R.scanProject(probe);
  assert.ok(scanned.scan);
  assert.equal(scanned.scan.truncated.scripts, true);
  const shape = R.analyzeProject(scanned.scan);
  assert.equal(shape.features.persistence.state, 'unknown');
  assert.match(shape.features.persistence.evidence, /script source/i);
  assert.equal(shape.scale.scripts, 1, 'the exact census count remains measured');
});

test('a project Studio will not answer for produces an honest failure, not an empty roadmap', async () => {
  const out = await R.roadmapForProject(async () => ({ id: '1', ok: false, error: 'Studio is not connected' }));
  assert.equal(out.ok, false);
  assert.match(out.error, /not connected/);
});

// ---------------------------------------------------------------------------------------------
// The model pass may reorder and rephrase. It may not invent.
// ---------------------------------------------------------------------------------------------

test('a model pass reorders the suggestions and rewrites their reasons', async () => {
  const shape = shapeOf(TOWER_DEFENCE);
  const roadmap = R.buildRoadmap(shape);
  const target = roadmap.next[roadmap.next.length - 1].id;
  const polished = await R.polishRoadmap(roadmap, shape, async () =>
    JSON.stringify({ order: [target], why: { [target]: 'Because this map needs it first.' } }),
  );
  assert.equal(polished.polished, true);
  assert.equal(polished.next[0].id, target);
  assert.equal(polished.next[0].why, 'Because this map needs it first.');
  assert.equal(polished.next.length, roadmap.next.length, 'nothing may be dropped');
});

test('a model cannot add a milestone, mark one done, or change the deterministic set', async () => {
  const shape = shapeOf(TOWER_DEFENCE);
  const roadmap = R.buildRoadmap(shape);
  const polished = await R.polishRoadmap(roadmap, shape, async () =>
    JSON.stringify({ order: ['rebirth_loop', 'add_pets'], why: { rebirth_loop: 'every game needs rebirth' } }),
  );
  assert.deepEqual(polished.next.map((m) => m.id), roadmap.next.map((m) => m.id));
  assert.deepEqual(polished.milestones.map((m) => m.id), roadmap.milestones.map((m) => m.id));
  assert.deepEqual(polished.milestones.map((m) => m.status), roadmap.milestones.map((m) => m.status));
  assert.ok(!JSON.stringify(polished).toLowerCase().includes('rebirth'));
});

test('a model that fails or replies with junk leaves the deterministic roadmap intact', async () => {
  const shape = shapeOf(SIMULATOR);
  const roadmap = R.buildRoadmap(shape);
  const thrown = await R.polishRoadmap(roadmap, shape, async () => { throw new Error('upstream refused'); });
  assert.equal(thrown.polished, false);
  assert.deepEqual(thrown.next.map((m) => m.id), roadmap.next.map((m) => m.id));
  const junk = await R.polishRoadmap(roadmap, shape, async () => 'I am afraid I cannot do that');
  assert.equal(junk.polished, false);
  assert.deepEqual(junk.next.map((m) => m.why), roadmap.next.map((m) => m.why));
});


// ---------------------------------------------------------------------------------------------
// FOUND BY RUNNING THE SCANNER AGAINST A REAL PLACE, 2026-09-01.
//
// The original scanner had never executed against a real place file; the mission ledger rated the
// gate PROVEN on the payload's existence. Running it on Crystal Canyon — a shard-collecting
// simulator — produced `genre: racing, confidence: 0` and a roadmap containing `race_track`,
// `race_vehicles` and `race_results`. Three separate defects, one execution.
// ---------------------------------------------------------------------------------------------

test('a genre named only in ordinary English prose is not a genre', () => {
  // The exact two comments from the real place. "racing" and "life" are English words here, and
  // both were weight-3 "the place calls itself X" signals before comments were stripped.
  const prosey = scan({
    counts: { instances: 300, parts: 250, scripts: 2 },
    classes: { SpawnLocation: 1, RemoteEvent: 2 },
    topLevel: ['Canyon'],
    scripts: [
      {
        path: 'game.ServerScriptService.DataService',
        class: 'Script',
        lines: 40,
        source: `-- this waits for the profile it publishes rather than racing it
                 -- a walkspeed of 16 for the rest of the life, so we wait
                 local ok = pcall(function() return 1 end)`,
      },
    ],
  });
  const shape = shapeOf(prosey);
  assert.notEqual(shape.genre, 'racing', 'a thread race is not a racing game');
  assert.notEqual(shape.genre, 'roleplay', '"the rest of the life" is not roleplay');
});

test('a comment cannot declare a genre that the place itself never does', () => {
  const commentOnly = scan({
    counts: { instances: 300, parts: 250, scripts: 1 },
    classes: { SpawnLocation: 1 },
    topLevel: ['Baseplate'],
    scripts: [{ path: 'game.ServerScriptService.A', class: 'Script', lines: 3, source: '-- Obby core loop\nlocal x = 1' }],
  });
  assert.notEqual(shapeOf(commentOnly).genre, 'obby');
});

test('...but a string literal still can, because a genre announces itself in its UI', () => {
  // Comments are stripped; STRING CONTENTS are deliberately kept. A place that renders the word
  // is saying it to the player, which is the opposite of an aside to a maintainer.
  const inString = scan({
    counts: { instances: 300, parts: 250, scripts: 1 },
    classes: { SpawnLocation: 1, RemoteEvent: 2, ScreenGui: 1 },
    topLevel: ['Zone1'],
    scripts: [
      {
        path: 'game.StarterGui.Hud',
        class: 'LocalScript',
        lines: 5,
        source: 'label.Text = "Coin Simulator"\nlocal leaderstats = player.leaderstats',
      },
    ],
  });
  assert.equal(shapeOf(inString).genre, 'simulator');
});

test('a tie is reported as unknown, not resolved by the alphabet', () => {
  // `ranked` breaks ties with localeCompare, which is right for determinism and catastrophic as a
  // decision. On the real place racing and roleplay both scored 3 and R-A sorted before R-O.
  const tied = scan({
    counts: { instances: 500, parts: 400, scripts: 2 },
    classes: { SpawnLocation: 1, RemoteEvent: 2 },
    place: 'Tycoon Obby',
    topLevel: ['Baseplate'],
    scripts: [{ path: 'game.ServerScriptService.A', class: 'Script', lines: 3, source: 'local x = 1' }],
  });
  const shape = shapeOf(tied);
  assert.equal(shape.genre, 'unknown', 'two genres named equally loudly is not a verdict');
  assert.equal(shape.genreConfidence, 0);
  assert.match(shape.genreEvidence.join(' '), /tied at/, 'and it must say WHY it declined');
});

test('the place name reaches the detector at all', () => {
  const named = scan({
    counts: { instances: 400, parts: 300, scripts: 1 },
    classes: { SpawnLocation: 1, RemoteEvent: 2 },
    place: 'Ultimate Tower Defence',
    topLevel: ['Baseplate'],
    scripts: [{ path: 'game.ServerScriptService.A', class: 'Script', lines: 3, source: 'local x = 1' }],
  });
  assert.equal(shapeOf(named).genre, 'tower_defence');
});

test('a scan with no place field still parses — the field is additive', () => {
  // Older plugins send a payload without it; a missing name must degrade, never throw.
  const shape = shapeOf(scan({ counts: { instances: 10, parts: 5, scripts: 0 } }));
  assert.equal(shape.genre, 'unknown');
});

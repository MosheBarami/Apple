/**
 * WHAT IS IN THIS PLACE — the inventory the worker already computes and the UI threw away.
 *
 * `analyzeProject` walks the place in one round trip and produces the real contents: how many
 * instances, parts and scripts, which of those scripts are server, client and module, the GUIs in
 * StarterGui, the zone containers by their actual paths, the currency names the scripts create, and
 * `limits` — what the scan could not see. `publicShape` puts all of it on the wire at
 * GET /api/projects/:id/roadmap. The client type then dropped it on purpose, with a comment saying
 * so: "This view has no use for it and copying it here would invite someone to render it."
 *
 * Meanwhile the product has three partial views of a project's contents — per-checkpoint counts,
 * the agent's file store, the third-party asset credits — and no whole.
 *
 * THE RULE THESE TESTS EXIST FOR is the one apps/worker/src/roadmap.ts:19 states and that the port
 * is most likely to lose: A CAPPED SCAN READS AS UNKNOWN, NEVER AS ZERO. There are two distinct
 * absences here and rendering either as a number is the defect:
 *
 *   - no `shape` on the response at all: we were not told. The section must not appear.
 *   - a scan that hit a limit: the counts are FLOORS. "1,204 parts" is a claim the scan did not
 *     make; "at least 1,204 parts" is the one it did.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { placeInventory } from '../src/components/roadmap/model.ts';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = readFileSync(join(WEB, 'src', 'routes', 'roadmap.tsx'), 'utf8');

const shape = (over = {}) => ({
  systems: {
    currencies: ['Coins'],
    zones: [{ path: 'game.Workspace.Stage1', className: 'Model', name: 'Stage1' }],
    serverScripts: ['game.ServerScriptService.Checkpoints'],
    clientScripts: ['game.StarterPlayer.StarterPlayerScripts.Hud'],
    moduleScripts: ['game.ReplicatedStorage.Leaderstats'],
    guis: ['game.StarterGui.ShopUI'],
    topLevel: ['Workspace', 'Lighting'],
    spawns: 2,
    parts: 1204,
  },
  scale: { instances: 3810, parts: 1204, scripts: 40, scriptsRead: 12 },
  limits: [],
  ...over,
});

// ----------------------------------------------------- a failure to observe is not an observation ---

test('NO SHAPE IS NOT AN EMPTY PLACE', () => {
  // The worker sends `shape` on every roadmap answer. When it is absent — an older worker, a
  // response shaped by something else — the honest reading is "we were not told", and a section of
  // zeroes would say the project is empty on no evidence at all.
  assert.equal(placeInventory(undefined), null);
  assert.equal(placeInventory(null), null);
});

test('a scan that hit a limit reports FLOORS, not totals', () => {
  const capped = placeInventory(shape({ limits: ['the place is large enough that the scan stopped early — some of it was not read'] }));
  assert.equal(capped.capped, true, 'a truncated scan must not be read as a complete count');
  assert.equal(placeInventory(shape()).capped, false, 'an unlimited scan is not hedged for no reason');
});

test('how many scripts were READ is carried beside how many exist', () => {
  // 12 of 40 read is the difference between "this project has no shop script" and "we did not open
  // 28 of its scripts". The first is a claim; only the second is true.
  const inv = placeInventory(shape());
  assert.equal(inv.scripts, 40);
  assert.equal(inv.scriptsRead, 12);
  assert.equal(inv.scriptsPartial, true);
  assert.equal(placeInventory(shape({ scale: { instances: 10, parts: 4, scripts: 12, scriptsRead: 12 } })).scriptsPartial, false);
});

test('the named things come through as the scan named them', () => {
  const inv = placeInventory(shape());
  assert.deepEqual(inv.zones, ['Stage1']);
  assert.deepEqual(inv.currencies, ['Coins']);
  assert.deepEqual(inv.guis, ['game.StarterGui.ShopUI']);
  assert.equal(inv.serverScripts, 1);
  assert.equal(inv.clientScripts, 1);
  assert.equal(inv.moduleScripts, 1);
  assert.equal(inv.spawns, 2);
});

test('a place with nothing in it says so as itself, not as a missing section', () => {
  // An empty project is a real, reportable state — and a different one from "not scanned".
  const bare = placeInventory({
    systems: { currencies: [], zones: [], serverScripts: [], clientScripts: [], moduleScripts: [], guis: [], topLevel: [], spawns: 0, parts: 0 },
    scale: { instances: 0, parts: 0, scripts: 0, scriptsRead: 0 },
    limits: [],
  });
  assert.notEqual(bare, null, 'a scan that found nothing still ran');
  assert.equal(bare.empty, true);
  assert.equal(placeInventory(shape()).empty, false);
});

test('a half-populated shape renders fewer rows rather than throwing', () => {
  // The same tolerance buildRoadmapLayout has: a missing array is a shorter list, not a TypeError
  // deep inside a map() that blanks the whole page.
  const inv = placeInventory({ systems: {}, scale: {}, limits: undefined });
  assert.notEqual(inv, null);
  assert.deepEqual(inv.zones, []);
  assert.equal(inv.instances, 0);
  assert.equal(inv.capped, false);
});

// -------------------------------------------------------------------------------- on the page ---

test('the page renders the inventory it is handed, and only when it has one', () => {
  assert.match(PAGE, /placeInventory/, 'the inventory is computed nowhere');
  assert.match(PAGE, /inventory &&/, 'the section renders whether or not there is anything to render');
});

test('the page hedges the counts when the scan was capped', () => {
  const section = PAGE.slice(PAGE.indexOf('placeInventory'));
  assert.match(section, /capped/, 'a truncated scan is presented as a complete count');
  assert.match(section, /at least/i, 'nothing says the counts are floors');
});

test('the scan limits are not printed twice', () => {
  // `notes` on the roadmap response is already `[...shape.limits, ...]` and this page already
  // renders every note. Printing `limits` again inside the section would show the user the same
  // sentence twice and teach them to skip both.
  assert.equal(/shape\.limits\.map|inventory\.limits/.test(PAGE), false, 'the limits are rendered a second time');
  assert.match(PAGE, /roadmap\.data\.notes\.map/, 'the notes are where the limits are shown');
});

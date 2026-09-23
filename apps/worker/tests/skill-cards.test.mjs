/**
 * SKILL KNOWLEDGE THE RUN RETRIEVES BY ITSELF.
 *
 * Measured 2026-09-23 (visual gauntlet rounds vs the simulator reference images): the craft
 * recipes for outlined/gradient UI, pills, card sizing, layered maps, primitive props and lighting
 * moods existed only behind search_* tools the model rarely called. skill-cards.ts matches the
 * request (and each next plan step) against the general cards in packages/corpus/data/skill-cards.json
 * and hands the matching recipe to the run. What is pinned: the right card for the right request,
 * nothing for an unrelated one, hard size bounds, and every cited Creator Docs chunk exists.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const tmp = mkdtempSync(join(tmpdir(), 'apple-skill-cards-'));
const outfile = join(tmp, 'skill-cards.mjs');
buildSync({
  entryPoints: [join(ROOT, 'apps/worker/src/skill-cards.ts')],
  outfile,
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
});
const mod = await import(pathToFileURL(outfile));
test.after(() => rmSync(tmp, { recursive: true, force: true }));

const planOf = (...steps) => ({ toolId: 't0', steps: steps.map(([title, tool]) => ({ title, tool, status: 'pending' })) });

test('a UI request gets UI craft cards in the system prompt block', () => {
  const r = mod.skillCardsForRun('Make the shop menu look colorful with cartoon buttons and a coins counter', true);
  assert.ok(r.ids.length >= 1 && r.ids.length <= mod.MAX_PROMPT_CARDS);
  assert.ok(r.ids.includes('ui-from-library'), r.ids.join(','));
  assert.match(r.block, /insert_ui_component/);
  assert.match(r.block, /create\.roblox\.com\/docs/);
});

test('a map request gets the layered-composition card', () => {
  const r = mod.skillCardsForRun('Build a bigger map with hills, paths and trees around the spawn area', true);
  assert.ok(r.ids.includes('map-layered-composition'), r.ids.join(','));
});

test('an unrelated request, or a run that cannot build, gets nothing', () => {
  assert.deepEqual(mod.skillCardsForRun('My datastore does not save player data when they leave, fix the script', true), { block: null, ids: [] });
  assert.deepEqual(mod.skillCardsForRun('Make the shop menu look colorful with cartoon buttons', false), { block: null, ids: [] });
});

test('the prompt block is bounded', () => {
  const r = mod.skillCardsForRun('ui menu shop cards grid map terrain hills props trees lighting mood buttons currency icons', true);
  assert.ok(r.ids.length <= mod.MAX_PROMPT_CARDS);
  assert.ok(r.block.length <= mod.MAX_PROMPT_CARDS * mod.MAX_CARD_CHARS + 400, String(r.block.length));
});

test('the next plan step pulls its card once, never a card already shown, and stops at the run cap', () => {
  const plan = planOf(['Shape rolling terrain with hills', 'shape_terrain'], ['Place low-poly trees and rocks as props', 'create_instances']);
  const first = mod.skillSteerForStep(plan, [], []);
  assert.ok(first, 'first pending step must steer');
  assert.deepEqual(first.ids, ['map-layered-composition']);
  assert.match(first.message, /Shape rolling terrain/);
  assert.ok(first.message.length <= mod.MAX_CARD_CHARS + 300);
  assert.equal(mod.skillSteerForStep(plan, [], first.ids), null, 'same card is not repeated');
  const after = mod.skillSteerForStep(plan, [{ tool: 'shape_terrain', ok: true }], first.ids);
  assert.deepEqual(after.ids, ['props-low-poly-from-primitives']);
  const full = mod.SKILL_CARDS.map((c) => c.id).slice(0, mod.MAX_CARDS_PER_RUN);
  assert.equal(mod.skillSteerForStep(plan, [{ tool: 'shape_terrain', ok: true }], full), null, 'run cap reached');
  assert.equal(mod.skillSteerForStep(undefined, [], []), null, 'no plan, no steer');
  assert.equal(mod.skillSteerForStep(planOf(['Write the datastore save script', 'write_script']), [], []), null);
});

test('every card is complete and every cited Creator Docs chunk exists in the corpus', (t) => {
  assert.ok(mod.SKILL_CARDS.length >= 5);
  for (const c of mod.SKILL_CARDS) {
    for (const k of ['id', 'title', 'domain', 'check']) assert.ok(typeof c[k] === 'string' && c[k].length > 0, c.id + '.' + k);
    for (const k of ['tools', 'triggers', 'recipe', 'avoid', 'docs']) assert.ok(Array.isArray(c[k]) && c[k].length > 0, c.id + '.' + k);
    assert.ok(c.docs.every((d) => d.url.startsWith('https://create.roblox.com/docs/')), c.id);
  }
  const chunks = join(ROOT, 'packages/corpus/data/chunks.jsonl');
  if (!existsSync(chunks)) return t.skip('chunks.jsonl is a gitignored build artifact and is absent here');
  const ids = new Set(readFileSync(chunks, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).vecId));
  for (const c of mod.SKILL_CARDS) for (const d of c.docs) assert.ok(ids.has(d.vecId), c.id + ' cites missing ' + d.vecId);
});

// D-UIONLY-1: game UI comes only from insert_ui_component; create_instances refuses GuiObjects and
// UIStroke/UICorner/UIGradient. A recipe that teaches building them by hand steers a run into refusals.
test('no card recipe teaches hand-built UI, and none lists a refused UI tool', () => {
  const HAND_UI = /\b(ScreenGui|ScrollingFrame|TextLabel|TextButton|ImageLabel|ImageButton|UIStroke|UICorner|UIGradient)\b/;
  for (const c of mod.SKILL_CARDS) {
    for (const r of c.recipe) assert.doesNotMatch(r, HAND_UI, `${c.id}: ${r}`);
    assert.ok(!c.tools.includes('build_ui'), `${c.id} lists build_ui, which D-UIONLY-1 refuses`);
  }
});

/**
 * insert_ui_component and the two rules of phase T (game 1, flaws 14, 15 and 19): an action button is never left at bottom-centre
 * or in a corner (an explicit position is kept), a second button that does what one on the screen does is refused, and a currency
 * counter draws the icon of the currency it is named for.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'uic2-')), 'c.mjs');
const ENTRY = `export { compileComponent, insertUiComponent } from './src/ui-components';
export { currencyIconKey } from './src/ui-icons';`;
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), ['--bundle', '--format=esm', '--platform=neutral', '--main-fields=module,main', '--loader=ts', '--outfile=' + out], { cwd: WORKER, input: ENTRY, stdio: ['pipe', 'pipe', 'pipe'] });
const L = await import(`file://${out}`);
const lib = JSON.parse(readFileSync(join(WORKER, '..', '..', 'packages', 'asset-library', 'ui-components.json'), 'utf8'));

test('insert_ui_component: a currency counter draws the icon of the currency it is named for; an icon the agent gave wins', () => {
  const icons = (a) => {
    const plan = L.compileComponent({ component: 'currency_counter', genre: 'simulator', ...a });
    assert.ok(!('error' in plan), JSON.stringify(plan));
    return Object.entries(lib.icons).filter(([, file]) => plan.assets.includes(file)).map(([key]) => key);
  };
  assert.deepEqual(icons({ name: 'Crystals' }), ['gem'], 'crystals are a gem');
  assert.deepEqual(icons({ title: 'Gems', value: 5 }), ['gem']);
  assert.deepEqual(icons({ name: 'Coins' }), ['coin']);
  assert.deepEqual(icons({}), ['coin'], 'nothing named: the old default');
  assert.deepEqual(icons({ value: 120 }), ['coin'], 'a bare number names nothing');
  assert.deepEqual(icons({ name: 'Blorps' }), ['star'], 'an unknown currency gets the neutral icon');
  assert.deepEqual(icons({ name: 'Crystals', icon: 'heart' }), ['heart'], 'the agent\'s icon wins');
});



test('insert_ui_component: an action button defaults to the right edge; a reserved spot is moved there unless a position is given', () => {
  const plan = (a) => L.compileComponent({ component: 'button_primary', genre: 'simulator', ...a });
  assert.equal(plan({}).anchor, 'right', 'the default is no longer bottom-centre');
  assert.equal(plan({}).placement, undefined);
  for (const anchor of ['bottom', 'bottom_left', 'bottom_right', 'center', 'top', 'top_left', 'top_right']) {
    const p = plan({ anchor, name: 'Rebirth' });
    assert.equal(p.anchor, 'right', anchor);
    assert.match(p.placement, new RegExp(`Rebirth moved ${anchor} -> right`));
  }
  assert.match(plan({ anchor: 'bottom' }).placement, /hotbar/);
  const exact = plan({ anchor: 'bottom', position: [0.5, 0.9] });
  assert.equal(exact.anchor, 'bottom', 'an explicit position is the user\'s own placement');
  assert.equal(exact.placement, undefined);
  assert.equal(plan({ anchor: 'left' }).anchor, 'left');
  assert.equal(L.compileComponent({ component: 'button_icon', genre: 'simulator' }).placement, undefined, 'other components are not buttons of the HUD');
});

test('insert_ui_component: a second button that does what one on the screen does is refused and names the one there', async () => {
  const there = 'game.StarterGui.GameHUD.Region_right.Upgrades';
  const sent = [];
  const call = async (op) => {
    sent.push(op.op);
    if (op.op === 'get_instance') return op.path === 'game.StarterGui.GameHUD' ? { class: 'ScreenGui' } : { error: 'not found' };
    if (op.op === 'query_instances') return { matches: [{ path: there }, { path: 'game.StarterGui.GameHUD.Region_right.Shop' }] };
    if (op.op === 'create_instances') return { created: ['game.StarterGui.GameHUD.Codes'] };
    return { verdict: 'ok', issues: [] };
  };
  const resolve = async () => ({ ids: {}, missing: [] });
  const run = (a) => L.insertUiComponent.run(call, { component: 'button_primary', genre: 'simulator', parent: 'game.StarterGui.GameHUD', ...a }, resolve);
  const dup = await run({ name: 'UpgradesButton', text: 'Upgrades' });
  assert.match(dup.error, /Region_right\.Upgrades already does "upgrade"/);
  assert.ok(!sent.includes('create_instances'), 'nothing was built');
  const other = await run({ name: 'Codes', text: 'Codes' });
  assert.equal(other.inserted, 'game.StarterGui.GameHUD.Codes', 'a different action goes through');
});

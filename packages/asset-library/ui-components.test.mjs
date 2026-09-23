// The UI component library (D-UIONLY-1) is made of stored library files and nothing else.
//   node --test packages/asset-library
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, decodePng } from './build-ui-components.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const lib = JSON.parse(readFileSync(join(HERE, 'ui-components.json'), 'utf8'));
const index = JSON.parse(readFileSync(join(HERE, 'index.json'), 'utf8'));
const indexed = new Set();
for (const p of index.packs) for (const [folder, names] of p.folders) for (const n of names) indexed.add(`${p.id}/${folder ? folder + '/' : ''}${n}.png`);
const sourceUrls = new Set(readFileSync(join(HERE, 'sources', 'ui.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).url));
const skins = Object.entries(lib.skins);

/** Every file a component can put on screen, in every skin and colour. */
function filesOf(c) {
  const out = new Set(c.icons.map((k) => lib.icons[k]));
  for (const [, s] of skins) for (const colour of s.colours) for (const role of c.roles) out.add(s.roles[colour][role]);
  return out;
}

test('the library is not empty, so nothing below passes over an empty list', () => {
  assert.ok(lib.components.length >= 30, `${lib.components.length} components`);
  assert.equal(skins.length, 4);
  assert.ok(Object.keys(lib.images).length >= 50 && Object.keys(lib.icons).length >= 20);
  for (const [id] of skins) assert.ok(lib.components.filter((c) => c.genres.includes(id)).length >= 25, `${id} has too few components`);
});

test('the committed file is exactly what the build derives from the packs and the sources', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(build())), lib);
});

test('every component, in every skin and colour, resolves to a file the index lists and the checkout holds', () => {
  let checked = 0;
  for (const c of lib.components) {
    const files = filesOf(c);
    assert.ok(files.size > 0, `${c.id} is made of nothing`);
    for (const f of files) {
      assert.ok(typeof f === 'string' && indexed.has(f), `${c.id}: ${f} is not in index.json`);
      assert.ok(existsSync(join(HERE, 'packs', f)), `${c.id}: ${f} is not on disk`);
      assert.ok(lib.images[f], `${c.id}: ${f} was not measured`);
      checked++;
    }
  }
  assert.ok(checked > 200, `only ${checked} files checked`);
});

test('sizes, 9-slice margins and colours are the stored PNG\'s own', () => {
  for (const [asset, m] of Object.entries(lib.images)) {
    const img = decodePng(readFileSync(join(HERE, 'packs', asset)));
    assert.deepEqual([img.w, img.h], [m.w, m.h], asset);
    const [l, t, r, b] = m.slice;
    assert.ok(l > 0 && t > 0 && r > l && b > t && r < m.w && b < m.h, `${asset}: slice ${m.slice} is outside the image`);
    // The centre colour is a pixel that exists in the file.
    let found = false;
    for (let i = 0; i < img.rgba.length && !found; i += 4) {
      found = img.rgba[i] === m.centre[0] && img.rgba[i + 1] === m.centre[1] && img.rgba[i + 2] === m.centre[2];
    }
    assert.ok(found, `${asset}: centre colour ${m.centre} is not a pixel of the file`);
  }
});

test('fonts are Roblox built-ins named by import-ok font rows of the sources list', () => {
  const rows = readFileSync(join(HERE, 'sources', 'ui.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.ok(Object.keys(lib.fonts).length >= 1);
  for (const f of Object.values(lib.fonts)) {
    const row = rows.find((r) => r.url === f.source);
    assert.ok(row && row.kind === 'font' && row.use === 'import-ok' && row.style.includes(f.font), JSON.stringify(f));
  }
  for (const [id, s] of skins) assert.ok(Object.values(lib.fonts).some((f) => f.font === s.font), `${id} font ${s.font}`);
});

test('every component has at least one published reference from the sources list', () => {
  for (const c of lib.components) {
    assert.ok(c.seenIn.length >= 1, `${c.id} has no reference`);
    for (const r of c.seenIn) assert.ok(sourceUrls.has(r.url), `${c.id}: ${r.url} is not in sources/ui.jsonl`);
  }
});

test('the owner\'s checklist (23 Sep) is covered: HUD, buttons, windows, mobile, combat', () => {
  const ids = new Set(lib.components.map((c) => c.id));
  const want = [
    'currency_counter', 'stat_counter', 'health_bar', 'progress_bar', 'level_bar', 'timer', 'minimap_frame', 'notification_toast', 'tooltip',
    'button_primary', 'button_secondary', 'button_icon', 'button_close', 'tab_bar',
    'shop_window', 'item_card', 'inventory_grid', 'settings_window', 'toggle', 'slider', 'dropdown', 'dialog_confirm', 'rebirth_panel',
    'daily_reward', 'codes_entry', 'leaderboard', 'quest_list', 'loading_screen', 'main_menu',
    'mobile_action_buttons', 'crosshair', 'ammo_counter',
  ];
  for (const id of want) assert.ok(ids.has(id), `${id} is missing`);
});

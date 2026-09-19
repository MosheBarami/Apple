import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const worker = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'apple-ui-themes-'));
async function bundle(name) {
  const path = join(dir, name + '.mjs');
  execFileSync(join(worker, 'node_modules/.bin/esbuild'), [join(worker, `src/${name}.ts`), '--bundle', '--format=esm', `--outfile=${path}`], { stdio: 'pipe' });
  return import(pathToFileURL(path).href);
}
const { APPLE_UI_THEMES } = await bundle('ui-kit-themes');
const { GENRE_KIT_IDS } = await bundle('genre-kits');
const { APPLE_UI_SOURCE } = await bundle('ui-kit');
const prelude = readFileSync(join(worker, 'tests/fixtures/apple-ui-runtime.luau'), 'utf8');
let sequence = 0;
function run(body) {
  const path = join(dir, `${sequence++}.luau`);
  writeFileSync(path, `${prelude}\nlocal UI = (function()\n${APPLE_UI_SOURCE}\nend)()\n${body}`);
  return execFileSync('luau', [path], { encoding: 'utf8', timeout: 5000 });
}
function luminance(hex) {
  const c = [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
}
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);

test('every current genre has one explicit original profile, not an unknown-genre fallback', () => {
  assert.equal(new Set(APPLE_UI_THEMES.map(t => t.id)).size, APPLE_UI_THEMES.length);
  assert.deepEqual(APPLE_UI_THEMES.map(t => t.id).filter(id => id !== 'studio').sort(), [...GENRE_KIT_IDS].sort());
  for (const theme of APPLE_UI_THEMES) {
    assert.ok(contrast(theme.ink, theme.card) >= 4.5, `${theme.id}: card text contrast`);
    assert.ok(contrast(theme.muted, theme.card) >= 4.5, `${theme.id}: secondary text contrast`);
    assert.ok(contrast(theme.accentInk, theme.accent) >= 4.5, `${theme.id}: button text contrast`);
  }
});

test('an unknown profile is refused before creating a ScreenGui', () => {
  run(`assert(not pcall(UI.mount, playerGui, {theme="not-a-supported-genre"}), "unknown theme was silently accepted")
    assert(#playerGui.children == 0, "invalid profile left partial UI")`);
});

test('all genre profiles mount and expose their actual selected identity without inventing a balance', () => {
  for (const theme of APPLE_UI_THEMES) {
    run(`local ui = UI.mount(playerGui, {theme=${JSON.stringify(theme.id)}, reducedMotion=true})
      assert(ui.themeId == ${JSON.stringify(theme.id)}, "requested theme was not selected")
      assert(find(ui.gui, "Balance").Text == "—")
      assert(find(ui.gui, "Title").Text == ${JSON.stringify(theme.shopLabel)})
      ui:destroy(); assert(#playerGui.children == 0)`);
  }
});

test('genre cards preserve item identity, descriptions and explicit badges as plain display data', () => {
  run(`local requested
    local ui = UI.mount(playerGui, {theme="simulator", onRequest=function(id) requested=id; return false,"Declined" end})
    ui:setItems({{id="speed",name="Trail boots",description="Move through the course.",price="25 test coins",badge="Tier 1",icon="bolt"}})
    assert(find(ui.gui, "Description").Text == "Move through the course.")
    assert(find(ui.gui, "Badge").Text == "Tier 1")
    assert(find(ui.gui, "Description").RichText == false)
    ui:open(); find(ui.gui,"Choose").Activated:Fire()
    assert(requested=="speed" and find(ui.gui,"Status").Text=="Declined")
    assert(find(ui.gui,"Balance").Text=="—")`);
});

test('invalid visual metadata cannot replace the observed catalogue or create an external image', () => {
  run(`local ui = UI.mount(playerGui, {theme="survival"})
    ui:setItems({{id="wood",name="Wood",icon="crate"}})
    local before=find(ui.gui,"Item_1")
    for _, bad in ipairs({{id="bad",icon="http://example.invalid"},{id="bad",badge={}},{id="bad",description={}}}) do
      assert(not pcall(function() ui:setItems({bad}) end), "invalid visual record was accepted")
      assert(find(ui.gui,"Item_1")==before, "invalid visual record erased old items")
    end`);
});

test('explicit owned state disables a card and does not fabricate ownership after an acknowledgement', () => {
  run(`local calls=0
    local ui = UI.mount(playerGui, {theme="tycoon", onRequest=function() calls+=1; return true end})
    ui:setItems({{id="a",name="Owned machine",owned=true}}); ui:open()
    assert(find(ui.gui,"Choose").Text=="Owned" and find(ui.gui,"Choose").Active==false)
    find(ui.gui,"Choose").Activated:Fire(); assert(calls==0)
    ui:setItems({{id="b",name="Repeatable purchase"}})
    find(ui.gui,"Choose").Activated:Fire()
    assert(calls==1 and find(ui.gui,"Choose").Text~="Owned", "ownership inferred from acknowledgement")`);
});

test('the card grid responds to measured width and stops listening after teardown', () => {
  run(`local ui=UI.mount(playerGui,{theme="simulator"})
    local list=find(ui.gui,"Items")
    local grid=find(ui.gui,"CardGrid")
    list.AbsoluteSize={X=640,Y=400}
    assert(grid.FillDirectionMaxCells==2 and grid.CellSize[1]==0.5)
    list.AbsoluteSize={X=300,Y=400}
    assert(grid.FillDirectionMaxCells==1 and grid.CellSize[1]==1)
    local changed=list:GetPropertyChangedSignal("AbsoluteSize")
    assert(changed:count()==1)
    ui:destroy(); assert(changed:count()==0, "grid resize listener leaked")`);
});

test('a short shop fits its actual rows instead of leaving an empty full-height modal', () => {
  run(`local ui=UI.mount(playerGui,{theme="simulator",reducedMotion=true})
    local overlay=find(ui.gui,"ShopOverlay")
    local panel=find(ui.gui,"Shop")
    local list=find(ui.gui,"Items")
    overlay.AbsoluteSize={X=1200,Y=800}
    list.AbsoluteSize={X=640,Y=400}
    ui:setItems({{id="a",name="First"},{id="b",name="Second"}})
    assert(panel.Size[4]==432,"one card row should need 272px plus header/status, not a 650px modal")
    list.AbsoluteSize={X=300,Y=400}
    assert(panel.Size[4]==650,"narrow two-row shop should use the bounded scrolling height")
    list.AbsoluteSize={X=640,Y=400}
    assert(panel.Size[4]==432,"widening the shop should release unnecessary empty height")
    overlay.AbsoluteSize={X=700,Y=300}
    assert(panel.Size[4]==264,"landscape modal must respect the measured safe viewport")
    ui:setItems({})
    assert(panel.Size[4]==224,"empty state should not occupy the entire screen")
    local changed=overlay:GetPropertyChangedSignal("AbsoluteSize")
    assert(changed:count()==1)
    ui:destroy(); assert(changed:count()==0,"modal resize listener leaked")`);
});

test('row profiles and large catalogues use the same content and viewport bounds', () => {
  run(`local ui=UI.mount(playerGui,{theme="horror",reducedMotion=true})
    local overlay=find(ui.gui,"ShopOverlay")
    local panel=find(ui.gui,"Shop")
    overlay.AbsoluteSize={X=1200,Y=800}
    ui:setItems({{id="a",name="First"}})
    assert(panel.Size[4]==344,"row profile should fit one 184px item plus header/status")
    local items={}; for index=1,10 do table.insert(items,{id=tostring(index),name="Supply"}) end
    ui:setItems(items)
    assert(panel.Size[4]==650,"large catalogue height must stay bounded and scroll")
    assert(find(ui.gui,"Items").AutomaticCanvasSize==Enum.AutomaticSize.Y)
    ui:destroy()`);
});

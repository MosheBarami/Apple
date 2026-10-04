/**
 * The tycoon (compose-tycoon.ts): owner, 2026-10-02, "make me a laundry tycoon make no mistakes" came out as the
 * keyboard game's plot simulator; "he doesn't focus on what the user asks, instead on what you built for him in the past".
 *
 * RESTATED phase 1 (generalize-not-patch): the harness used to hold the trades (a laundry chain, a pizza chain, a generic
 * "Cleaner / Polisher / Packer" fallback) and read the subject off the request. A tycoon is whatever the AGENT says it is: its
 * item, dropper, machines, seller and currency are arguments, a missing one is reported by name, and names keep their
 * language. These tests use neutral and non-English fixtures.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'ty-')), 't.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'compose-tycoon.ts'), '--bundle', '--format=esm', '--platform=node', '--outfile=' + out, '--external:cloudflare:*'], { cwd: WORKER, stdio: 'pipe' });
const T = await import(`file://${out}`);
const src = (f) => readFileSync(join(WORKER, 'src', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const GIVEN = { title: 'Gadget Works', currency: 'Bucks', item: { name: 'Raw Gadget', color: '#6b4f2a' }, dropper: 'Gadget Chute',
  machines: [{ name: 'Press', becomes: 'Pressed Gadget', color: '#bde7ff', look: { gameId: 'aabbccdd1122', path: '/Workspace/Press' } }, { name: 'Polisher', becomes: 'Shiny Gadget', color: '#ffe27a', times: 3 }],
  seller: { name: 'Shop Counter' } };
const theme = (over = {}) => { const t = T.tycoonTheme({ ...GIVEN, ...over }); assert.ok(!('error' in t), JSON.stringify(t)); return t.theme; };

test('the theme is the agent\'s, every field: nothing comes from a template, a trade table or the request', () => {
  const t = theme();
  assert.equal(t.title, 'Gadget Works');
  assert.equal(t.item.name, 'Raw Gadget');
  assert.deepEqual(t.machines.map((m) => m.becomes), ['Pressed Gadget', 'Shiny Gadget']);
  assert.equal(t.machines[1].times, 3);
  assert.equal(t.machines[0].times, 2, 'a multiplier left out is 2');
  assert.deepEqual(t.machines[0].look, { game: 'aabbccdd1122', path: '/Workspace/Press' }, 'a look is a library piece the agent chose');
  assert.equal(t.machines[1].look, undefined, 'none chosen: built from parts');
  assert.equal(t.seller.name, 'Shop Counter');
  assert.equal(t.currency, 'Bucks');
  assert.equal(t.players, 4);
  const code = src('compose-tycoon.ts');
  for (const gone of ['KNOWN', 'tycoonSubject', 'isTycoonRequest', 'Cleaner', 'Polisher', 'Packer', 'Fabric', 'Clean ${', 'generic']) assert.equal(code.includes(gone), false, `${gone} is back in compose-tycoon.ts`);
  assert.equal(T.tycoonSubject, undefined);
  assert.equal(T.isTycoonRequest, undefined);
});

test('a missing field is reported by name, never filled: "missing: machines[].becomes"', () => {
  const r = T.tycoonTheme({ ...GIVEN, machines: [{ name: 'Press', color: '#bde7ff' }, { name: 'Polisher', becomes: 'Shiny' }], item: { name: 'Raw' }, currency: '' });
  assert.ok('error' in r);
  assert.deepEqual(r.missing.sort(), ['currency', 'item.color (#rrggbb)', 'machines[0].becomes', 'machines[1].color (#rrggbb)']);
  assert.match(r.error, /The tycoon is missing: .*machines\[0\]\.becomes/);
  assert.ok(T.tycoonTheme({}).missing.length >= 6, 'an empty call lists everything it needs');
  assert.ok(T.tycoonTheme({ ...GIVEN, machines: [] }).missing.some((m) => /machines \(1 to 4/.test(m)));
});

test('names keep their language and are cut only by length, said; no word is dropped and none is cut at a function word', () => {
  const t = T.tycoonTheme({ ...GIVEN, title: 'מפעל הצעצועים', currency: 'מטבעות', item: { name: 'חומר גלם', color: '#8a6d52' }, dropper: 'משפך עם חומר גלם שנופל לתוך המכונה לאורך הסרט' });
  assert.ok(!('error' in t));
  assert.equal(t.theme.title, 'מפעל הצעצועים');
  assert.equal(t.theme.item.name, 'חומר גלם', 'a Hebrew item name survives');
  assert.equal(T.clean('Hamper that drops piles of clothes', 40), 'Hamper that drops piles of clothes', 'no cut at "that"');
  assert.equal(T.clean('x'.repeat(50), 30).length, 30);
  assert.equal(T.cleanText('x'.repeat(50), 30).cut, true);
  assert.equal(T.cleanText('Short', 30).cut, false);
  assert.ok(t.notes.some((n) => /^dropper was cut to 30 characters/.test(n)), JSON.stringify(t.notes));
  assert.deepEqual(Array.from(T.clean('😀😀😀', 2)), ['😀', '😀'], 'cut by code point, never mid-character');
  assert.equal(T.clean('<b>"hi"</b>\n\t x'), 'b hi /b x', 'markup characters and control characters are out');
});

test('the item\'s look is the agent\'s (shape, size, material) and plain otherwise: no material is guessed from what it is', () => {
  const plain = T.tycoonSteps(T.tycoonRecipe(1, theme()));
  const config = plain.find((s) => s.kind === 'script' && s.name === 'AppleGameConfig').source;
  assert.doesNotMatch(config, /material|shape|size = /, 'nothing guessed');
  assert.equal(JSON.stringify(plain).includes('Fabric'), false, 'no fabric unless the agent says so');
  const styled = T.tycoonSteps(T.tycoonRecipe(1, theme({ item: { name: 'Orb', color: '#112233', shape: 'ball', size: [3, 3, 3], material: 'Metal' } })));
  const cfg2 = styled.find((s) => s.kind === 'script' && s.name === 'AppleGameConfig').source;
  assert.match(cfg2, /shape = "Ball"/); assert.match(cfg2, /material = "Metal"/);
  assert.match(JSON.stringify(styled), /"Material":"Metal"/, 'the heap in the hopper wears the item\'s own material');
  const luau = readFileSync(join(WORKER, '..', '..', 'packages', 'components', 'tycoon', 'AppleTycoon.luau'), 'utf8');
  assert.equal(luau.includes('Material.Fabric'), false, 'the Luau no longer paints every item as fabric');
  assert.match(luau, /item\.material/);
});

test('the steps build bases with a belt, droppers, machines, a seller and pads that unlock in order', () => {
  const t = theme();
  const recipe = T.tycoonRecipe(1, t);
  assert.equal(recipe.title, 'Gadget Works');
  const steps = T.tycoonSteps(recipe);
  const json = JSON.stringify(steps);
  for (const want of ['"Conveyor"', '"Seller"', '"Pads"', '"Dropper1"', '"Machine1"', '"Gate"', '"Spout"', '"TycoonHUD"', 'AppleTycoon', 'AppleEconomy', 'AppleBoot']) assert.ok(json.includes(want), want);
  const config = steps.find((s) => s.kind === 'script' && s.name === 'AppleGameConfig').source;
  assert.match(config, /Raw Gadget/); assert.match(config, /Pressed Gadget/);
  const unlocks = T.tycoonUnlocks(t);
  assert.equal(unlocks[0].after, undefined);
  assert.ok(unlocks.slice(1).every((u, i) => u.after === unlocks[i].id), 'each pad after the one before');
  assert.ok(unlocks.every((u, i) => i === 0 || u.price > unlocks[i - 1].price), 'each dearer');
  assert.ok(steps.some((s) => s.kind === 'place' && s.name === 'Look' && s.from.endsWith('TycoonMachine1')), 'the first machine wears its library look');
  assert.ok(!steps.some((s) => s.kind === 'place' && s.name === 'Look' && s.from.endsWith('TycoonMachine2')), 'the second has none chosen and is built from parts');
  const folders = steps[0].items.find((i) => i.name === 'AppleParts').children.map((c) => c.name);
  for (const s of steps.filter((x) => x.kind === 'import')) assert.ok(folders.includes(s.key), `the import folder for ${s.key} is made first`);
  assert.match(T.tycoonForUser(recipe, { missing: [] }), /Raw Gadget → Pressed Gadget → Shiny Gadget/);
});

test('the default ground and the lighting are left alone unless the agent asks', () => {
  const steps = T.tycoonSteps(T.tycoonRecipe(1, theme()));
  // RESTATED 2026-10-04 (owner's recording of round 2): only the default spawn's decal is removed and the spawn switched off.
  assert.equal(steps.some((s) => s.kind === 'delete' && s.paths.some((p) => /Baseplate|SpawnLocation/.test(p) && !/^game\.Workspace\.SpawnLocation\.(Decal|Texture)$/.test(p))), false);
  assert.ok(steps.some((s) => s.kind === 'set' && s.path === 'game.Workspace.SpawnLocation' && s.props.Enabled === false), 'the default spawn is retired');
  assert.equal(steps.some((s) => s.kind === 'set' && s.path === 'game.Lighting'), false);
  assert.equal(steps.some((s) => s.kind === 'create' && s.parent === 'game.Lighting'), false);
  const cleared = T.tycoonSteps({ ...T.tycoonRecipe(1, theme()), clearDefaultGround: true });
  assert.ok(cleared.some((s) => s.kind === 'delete' && s.paths.includes('game.Workspace.Baseplate')));
});

test('prices speak the game\'s currency: the agent\'s symbol if it gave one, else the currency name; never a built-in "$"', () => {
  assert.equal(T.short(1500, { currency: 'Bucks', symbol: '' }), '1.5K Bucks');
  assert.equal(T.short(25, { currency: 'Bucks', symbol: '' }), '25 Bucks');
  assert.equal(T.short(2_000_000, { currency: 'Bucks', symbol: '$' }), '$2M');
  assert.equal(T.short(40, { currency: 'מטבעות', symbol: '' }), '40 מטבעות');
  const written = T.tycoonSteps(T.tycoonRecipe(1, theme())).filter((x) => x.kind === 'create' || (x.kind === 'script' && /Config$/.test(x.name)));
  const json = JSON.stringify(written);
  assert.equal(json.includes('$'), false, 'no dollar sign in the screens, pads or configs the composer writes');
  assert.match(json, /Pressed Gadget|Press - \d+ Bucks/);
});

test('the economy curve: prices are the agent\'s when given, the documented defaults otherwise, and the time to afford each pad is reported as information', () => {
  const dflt = theme();
  const u0 = T.tycoonUnlocks(dflt);
  assert.deepEqual(u0.map((u) => u.price), [15, 40, 120, 220, 500]);
  const own = theme({ prices: { dropper2: 5, machines: [10, 100], dropper3: 50, fastBelt: 300 } });
  assert.deepEqual(T.tycoonUnlocks(own).map((u) => u.price), [5, 10, 50, 100, 300]);
  const econ = T.tycoonEconomy(dflt);
  assert.deepEqual(econ.map((e) => e.id), u0.map((u) => u.id));
  assert.ok(econ.every((e) => e.secondsToAfford > 0));
  assert.equal(econ[0].secondsToAfford, Math.round(15 * 1.6), 'one dropper, an item worth 1, every 1.6 s');
  assert.ok(econ[2].secondsToAfford < econ[2].price * 1.6, 'a machine bought makes the next pad cheaper in time');
  assert.equal(DEFAULT_NOT_EXPORTED_CHECK(), true);
  function DEFAULT_NOT_EXPORTED_CHECK() { return T.DEFAULT_PRICES.machines.length === 4; }
});

test('every class and property the tycoon writes is one the plugin accepts', () => {
  // Live 2026-10-02: the whole map was refused for Neutral, Duration and TextStrokeTransparency, and the run said only
  // "did not work". The plugin's allowlists are the source of truth.
  const plugin = readFileSync(join(WORKER, '..', 'apple-plugin', 'src', 'Commands.luau'), 'utf8');
  const allowed = new Set([...plugin.matchAll(/^\s*([A-Z][A-Za-z0-9]*) = true,/gm)].map((m) => m[1]));
  assert.ok(allowed.size > 100, 'the allowlists were read');
  const steps = T.tycoonSteps(T.tycoonRecipe(1, theme()));
  const bad = new Set();
  const walk = (n) => { if (!allowed.has(n.className)) bad.add(`class ${n.className}`); for (const k of Object.keys(n.props ?? {})) if (!allowed.has(k)) bad.add(`${n.className}.${k}`); (n.children ?? []).forEach(walk); };
  for (const s of steps) if (s.kind === 'create') s.items.forEach(walk);
  assert.deepEqual([...bad], []);
});

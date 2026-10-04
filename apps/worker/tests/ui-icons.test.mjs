/**
 * Which icon a counter or an upgrade card shows (phase T, game 1, flaws 15 and 16): "Crystals" drew a gold dollar coin and
 * "Pickaxe Power" drew a pointing finger. The icon follows what the piece is about; what it cannot tell gets a neutral one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'uic-')), 'i.mjs');
const ENTRY = `export * from './src/ui-icons';
export { readStudSpec } from './src/studded-ui-tool';
export { studdedScreen } from './src/stud-ui';
export { KIND_ICON, upgradeIcon } from './src/upgrades-tool';`;
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), ['--bundle', '--format=esm', '--platform=neutral', '--main-fields=module,main', '--loader=ts', '--outfile=' + out], { cwd: WORKER, input: ENTRY, stdio: ['pipe', 'pipe', 'pipe'] });
const I = await import(`file://${out}`);
const lib = JSON.parse(readFileSync(join(WORKER, '..', '..', 'packages', 'asset-library', 'ui-components.json'), 'utf8'));

test('a currency gets the icon of what it is: crystals and gems are a gem, money words are the coin', () => {
  for (const name of ['Crystals', 'Gems', 'Diamond', 'crystal shards', 'GlowCrystals']) assert.equal(I.currencyIconKey(name), 'gem', name);
  for (const name of ['Coins', 'Cash', 'Gold', 'Dollars', 'Money', 'Bucks']) assert.equal(I.currencyIconKey(name), 'coin', name);
  assert.equal(I.currencyIconKey('Hearts'), 'heart');
  assert.equal(I.currencyIconKey('Trophies'), 'trophy');
  assert.equal(I.currencyGlyph('Crystals'), '\u{1F48E}');
  assert.notEqual(I.currencyGlyph('Crystals'), '$', 'a crystal counter must not draw the dollar sign');
});

test('a currency the table does not know gets the neutral star, never the coin; nothing named keeps the old coin', () => {
  assert.equal(I.currencyIconKey('Taps'), 'star');
  assert.equal(I.currencyIconKey('Blorps'), 'star');
  assert.equal(I.currencyIconKey(undefined), 'coin', 'no subject at all is the old default');
  assert.equal(I.currencyIconKey('', ''), 'coin');
});

test('every key the table maps to is a library icon key, or is declared studded-only', () => {
  const library = new Set(Object.keys(lib.icons));
  assert.deepEqual([...I.LIBRARY_ICON_KEYS].sort(), [...library].sort(), 'the table reads the library, not a copy');
  for (const [key, glyph] of Object.entries(I.GLYPHS)) {
    assert.ok(library.has(key) || I.STUDDED_ONLY_KEYS.includes(key), `${key} is neither a library key nor declared studded-only`);
    assert.ok(glyph.length >= 1 && glyph.length <= 3, `${key} glyph`);
  }
  for (const key of ['gem', 'coin', 'star', 'heart', 'trophy']) assert.ok(library.has(key), `the library lost the ${key} icon`);
  for (const text of ['Crystals', 'Gold', 'Taps', 'Hearts', 'Wins', 'Rebirth']) assert.ok(I.GLYPHS[I.currencyIconKey(text)], text);
  for (const text of ['Pickaxe Power', 'Walk Speed', 'Lucky Find', 'Bag Size', 'Auto Miner', 'Crystal Magnet', 'Sharper Sword']) assert.ok(I.GLYPHS[I.effectIconKey(text)], text);
});

test('an upgrade card\'s icon follows its effect: a pickaxe for Pickaxe Power, boots for speed, a bag for capacity', () => {
  const key = (label) => I.effectIconKey(label);
  assert.equal(key('Pickaxe Power'), 'pickaxe');
  assert.equal(key('Walk Speed'), 'boots');
  assert.equal(key('Faster Feet'), 'boots');
  assert.equal(key('Lucky Find'), 'clover');
  assert.equal(key('Bag Capacity'), 'bag');
  assert.equal(key('Auto Miner'), 'robot');
  assert.equal(key('Crystal Magnet'), 'magnet');
  assert.equal(key('Sturdy Armor'), 'shield');
  assert.equal(key('Stronger Taps'), 'tap');
  assert.equal(key('Faster Keys'), 'boots', 'keyboard is not the key icon');
  assert.equal(key('Quantum Whatsit'), undefined, 'a name that says nothing keeps the icon of its kind');
  assert.equal(key('Bottom Line'), undefined, 'bot is a word, not a prefix');
});

test('upgradeIcon: what the agent gave wins, then the effect, then the kind', () => {
  const up = (o) => ({ id: 'X', label: 'Quantum Whatsit', kind: 'perPress', ...o });
  assert.equal(I.upgradeIcon(up({ icon: '\u{1F340}' })), '\u{1F340}', 'an icon the agent typed is kept as typed');
  assert.equal(I.upgradeIcon(up({ icon: 'gem' })), '\u{1F48E}', 'a library icon key becomes its glyph');
  assert.equal(I.upgradeIcon(up({ label: 'Pickaxe Power' })), I.GLYPHS.pickaxe, 'not the finger of its kind');
  assert.notEqual(I.upgradeIcon(up({ label: 'Pickaxe Power' })), I.KIND_ICON.perPress);
  assert.equal(I.upgradeIcon(up({})), I.KIND_ICON.perPress, 'nothing known about the name: the icon of its kind');
  assert.equal(I.upgradeIcon(up({ kind: 'multiplier' })), I.KIND_ICON.multiplier);
});

test('a counter spec: the icon follows the currency named; an icon key or a glyph the agent typed is honoured', () => {
  const spec = (p) => I.readStudSpec({ pieces: [{ kind: 'counter', name: 'Crystals', at: 'top-left', text: '0', ...p }] }).pieces[0];
  assert.equal(spec({ caption: 'Crystals' }).icon, '\u{1F48E}', 'no icon given: from the caption');
  assert.equal(spec({}).icon, '\u{1F48E}', 'no icon and no caption: from the name');
  assert.equal(spec({ name: 'Taps', caption: 'Taps' }).icon, '⭐', 'an unknown subject: the neutral star');
  assert.equal(spec({ name: 'Coins' }).icon, '$');
  assert.equal(spec({ icon: 'heart' }).icon, '❤', 'a library icon key');
  assert.equal(spec({ icon: '#' }).icon, '#', 'a glyph typed by the agent is kept');
});

test('the dollar coin is gold; any other icon sits on a cream disc, so a gem is not a coin', () => {
  const screen = I.studdedScreen({ name: 'HUD', pieces: [
    { kind: 'counter', name: 'Crystals', text: '0', icon: '\u{1F48E}', at: 'top-left' },
    { kind: 'counter', name: 'Coins', text: '0', icon: '$', at: 'top-right' },
  ] });
  const disc = (name) => JSON.stringify(screen.children.flatMap((r) => r.children).find((c) => c.name === name).children.find((c) => c.name === 'Icon').props.BackgroundColor3);
  assert.notEqual(disc('Crystals'), disc('Coins'));
  assert.equal(disc('Coins'), '"#ffd23f"');
});

test('every key a currency can map to is a library icon (insert_ui_component refuses any other)', () => {
  const library = new Set(Object.keys(lib.icons));
  for (const name of ['Gems', 'Coins', 'Hearts', 'Trophies', 'Keys', 'Gifts', 'Rebirths', 'Souls', 'Embers', 'Seconds', 'Stars', 'Blorps', '']) {
    assert.ok(library.has(I.currencyIconKey(name)), `${name} -> ${I.currencyIconKey(name)}`);
  }
});

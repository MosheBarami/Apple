/**
 * The tycoon (compose-tycoon.ts): owner, 2026-10-02, "make me a laundry tycoon make no mistakes" came out as the
 * keyboard game's plot simulator; "he doesn't focus on what the user asks, instead on what you built for him in the past".
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
const REQ = 'make me a laundry tycoon make no mistakes';

test('a tycoon request is a tycoon, about its own subject', () => {
  assert.ok(T.isTycoonRequest(REQ));
  assert.equal(T.tycoonSubject(REQ), 'laundry');
  assert.equal(T.tycoonSubject('build a pizza tycoon'), 'pizza');
  const tool = readFileSync(join(WORKER, 'src', 'compose-tool.ts'), 'utf8');
  assert.ok(tool.indexOf('isTycoonRequest(idea)) return composeTycoon') < tool.indexOf('isPlotSimRequest(idea)) return composePlotSim'), 'a tycoon never falls to the plot simulator');
});

test('the theme is the agent reading of the request, filled in only where it left a gap', () => {
  const own = T.tycoonTheme(REQ, undefined);
  assert.equal(own.item.name, 'Dirty Laundry');
  assert.deepEqual(own.machines.map((m) => m.name), ['Washing Machine', 'Dryer', 'Folding Table']);
  const agent = T.tycoonTheme(REQ, { item: { name: 'Muddy Socks', color: '#6b4f2a' }, machines: [{ name: 'Soap Tub', becomes: 'Soapy Socks', color: '#bde7ff' }, { name: 'Spin Dryer', becomes: 'Fresh Socks' }], seller: { name: 'Sock Shop' }, currency: 'Bucks' });
  assert.equal(agent.item.name, 'Muddy Socks');
  assert.deepEqual(agent.machines.map((m) => m.becomes), ['Soapy Socks', 'Fresh Socks']);
  assert.equal(agent.machines[1].color, '#ffffff', 'a colour left out comes from the trade');
  assert.equal(agent.seller.name, 'Sock Shop');
  assert.equal(agent.currency, 'Bucks');
  assert.equal(T.tycoonTheme('a rocket tycoon', undefined).machines[0].name, 'Rocket Cleaner', 'an unknown trade is still named for its subject');
});

test('the steps build bases with a belt, droppers, machines, a seller and pads that unlock in order', () => {
  const theme = T.tycoonTheme(REQ, undefined);
  const recipe = T.tycoonRecipe(REQ, 1, theme, { machines: [{ game: 'g', path: '/Workspace/WashingMachine' }] });
  assert.equal(recipe.title, 'Laundry Tycoon');
  const steps = T.tycoonSteps(recipe);
  const json = JSON.stringify(steps);
  for (const want of ['"Conveyor"', '"Seller"', '"Pads"', '"Dropper1"', '"Machine1"', '"Gate"', '"Spout"', '"TycoonHUD"', 'AppleTycoon', 'AppleEconomy', 'AppleBoot']) assert.ok(json.includes(want), want);
  const config = steps.find((s) => s.kind === 'script' && s.name === 'AppleGameConfig').source;
  assert.match(config, /Dirty Laundry/); assert.match(config, /Clean Laundry/);
  const unlocks = T.tycoonUnlocks(theme);
  assert.equal(unlocks[0].after, undefined);
  assert.ok(unlocks.slice(1).every((u, i) => u.after === unlocks[i].id), 'each pad after the one before');
  assert.ok(unlocks.every((u, i) => i === 0 || u.price > unlocks[i - 1].price), 'each dearer');
  assert.ok(steps.some((s) => s.kind === 'place' && s.name === 'Look' && s.from.endsWith('TycoonMachine1')), 'the washing machine wears its library look');
  const folders = steps[0].items.find((i) => i.name === 'AppleParts').children.map((c) => c.name);
  for (const s of steps.filter((x) => x.kind === 'import')) assert.ok(folders.includes(s.key), `the import folder for ${s.key} is made first`);
  assert.match(T.tycoonForUser(recipe, { missing: [] }), /Dirty Laundry → Clean Laundry → Dry Laundry → Folded Laundry/);
});

test('every class and property the tycoon writes is one the plugin accepts', () => {
  // Live 2026-10-02: the whole map was refused for Neutral, Duration and TextStrokeTransparency, and the run said only
  // "did not work". The plugin's allowlists are the source of truth.
  const plugin = readFileSync(join(WORKER, '..', 'apple-plugin', 'src', 'Commands.luau'), 'utf8');
  const allowed = new Set([...plugin.matchAll(/^\s*([A-Z][A-Za-z0-9]*) = true,/gm)].map((m) => m[1]));
  assert.ok(allowed.size > 100, 'the allowlists were read');
  const theme = T.tycoonTheme(REQ, undefined);
  const steps = T.tycoonSteps(T.tycoonRecipe(REQ, 1, theme, { machines: [] }));
  const bad = new Set();
  const walk = (n) => { if (!allowed.has(n.className)) bad.add(`class ${n.className}`); for (const k of Object.keys(n.props ?? {})) if (!allowed.has(k)) bad.add(`${n.className}.${k}`); (n.children ?? []).forEach(walk); };
  for (const s of steps) if (s.kind === 'create') s.items.forEach(walk);
  assert.deepEqual([...bad], []);
});

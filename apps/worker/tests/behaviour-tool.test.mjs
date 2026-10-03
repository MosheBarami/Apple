/**
 * add_behaviour: reviewed verbs on parts, written as data, played by the AppleBehave runtime.
 * Models and requests are invented for these tests (tests/behaviour-fixtures.mjs). Nothing here names a subject the product is
 * asked to build; the verbs are things done to parts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { part, inst, finalize, fakeStudio, coverModel, leafModel, anonymousModel } from './behaviour-fixtures.mjs';
import { HARNESS, MOCK, MODULE, luauAvailable, runLuau } from '../../../packages/components/tests/behave-mock.mjs';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(WORKER, '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'behaviour-tool-'));
function bundle(src, name) {
  const outfile = join(tmp, `${name}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', src), '--bundle', '--format=esm', '--target=es2022', '--platform=node', `--outfile=${outfile}`, '--external:cloudflare:*'], { cwd: WORKER, stdio: 'pipe' });
  return import(`file://${outfile}`);
}
const B = await bundle('behaviour-tool.ts', 'tool');
const C = await bundle('behaviour-config.ts', 'config');
const L = await bundle('luau-review.ts', 'review');
const T = await bundle('tools.ts', 'tools');
const SK = await bundle('creator-skills.ts', 'skills');
const hash = L.sourceHash;

const MODEL = 'game.Workspace.Unit';
const swing = (extra = {}) => ({ verb: 'swing', target: `${MODEL}.Cover`, hinge: { pivot: [0, -1, -1], axis: 'x' }, angle: -100, ...extra });
const place = () => { const m = coverModel(); return { m, studio: fakeStudio(m.root, { hash }) }; };
const call = (studio, args) => B.addBehaviour(studio, { model: MODEL, ...args });
const written = (studio) => studio.scripts.get(`${MODEL}.AppleBehaviours`);

// ------------------------------------------------------------------------------------------------ vocabulary

test('the catalogue is derived from the same table that validates: every verb, every parameter, every default, in one result', () => {
  const d = B.describeVerbs();
  assert.deepEqual(Object.keys(d.verbs).sort(), [...B.VERBS].sort());
  assert.equal(B.VERBS.length, 9);
  for (const verb of B.VERBS) {
    const line = d.verbs[verb];
    for (const [name, spec] of Object.entries(B.PARAMS[verb])) {
      assert.ok(line.includes(`${name} `), `${verb}.${name} is missing from the catalogue`);
      if (spec.t !== 'vec' || spec.def) assert.ok(line.includes(`=${Array.isArray(spec.def) ? `[${spec.def.join(',')}]` : spec.def}`), `${verb}.${name} states its default (${spec.def})`);
      if (spec.t === 'num') assert.ok(line.includes(`${spec.min}..${spec.max}`), `${verb}.${name} states its range`);
      if (spec.t === 'enum') assert.ok(line.includes(spec.values.join('|')), `${verb}.${name} lists its values`);
    }
    assert.ok(line.split('. takes:')[0].length > 20, `${verb} says what it does`);
  }
  assert.match(d.every, /trigger \{on: click\|prompt\|touch\|near\|auto/);
  assert.match(d.every, /mode toggle\|pulse\|hold\|once/);
  assert.ok(JSON.stringify(d).length < 2500, `the catalogue (${JSON.stringify(d).length}) leaves room under the 3000-character result cut`);
});

// ------------------------------------------------------------------------------------------------ one behaviour

async function read(raw, { tree = coverModel().root, ctx = {} } = {}) {
  const { parseTree } = await bundle('model-anatomy.ts', 'anatomy');
  const t = parseTree(JSON.parse(JSON.stringify({ root: tree, nodeCount: 1, truncated: false })));
  return B.readBehaviour({ tree: t, ctx: { execStudioOp: async () => ({ ok: false, error: 'none' }), ...ctx } }, raw, 0);
}

test('a swing is normalised: references become segments, every default is written out', async () => {
  const r = await read(swing());
  assert.ok(!('error' in r), r.error);
  assert.deepEqual(r.record, {
    verb: 'swing',
    target: { segs: ['Cover'] },
    trigger: { on: 'click' },
    mode: 'toggle',
    angle: -100,
    seconds: 0.6,
    hinge: { pivot: [0, -1, -1], axis: 'x' },
  });
});

test('defaults follow the verb: spin and bob start themselves, a launcher listens for touch, near holds, touch pulses', async () => {
  assert.equal((await read({ verb: 'spin' })).record.trigger.on, 'auto');
  assert.deepEqual((await read({ verb: 'spin' })).record.hinge, { pivot: [0, 0, 0], axis: 'y' });
  assert.equal((await read({ verb: 'bob' })).record.trigger.on, 'auto');
  assert.equal((await read({ verb: 'bounce' })).record.trigger.on, 'touch');
  assert.equal((await read({ verb: 'fade', trigger: 'near' })).record.mode, 'hold');
  assert.equal((await read({ verb: 'fade', trigger: { on: 'touch' } })).record.mode, 'pulse');
  assert.equal((await read({ verb: 'fade', trigger: 'prompt', mode: 'once' })).record.mode, 'once');
});

test('a bad request is refused with the reason and what to do, before anything is written', async () => {
  const bad = [
    [{ verb: 'dance' }, /verb must be one of swing, slide/],
    [{ ...swing(), speed: 3 }, /swing does not take "speed"/],
    [swing({ angle: 0 }), /angle must not be 0/],
    [swing({ angle: 720 }), /angle must be -360\.\.360/],
    [swing({ angle: 'wide' }), /angle must be a number/],
    [{ verb: 'swing', target: `${MODEL}.Cover` }, /swing needs hinge/],
    [swing({ hinge: { pivot: [0, -2, 0], axis: 'x' } }), /hinge\.pivot must be three numbers from -1 to 1/],
    [swing({ hinge: { pivot: [0, -1, 0], axis: 'w' } }), /hinge\.axis must be "x", "y" or "z"/],
    [swing({ hinge: { pivot: [0, -1, 0], axis: 'x', sideways: 1 } }), /hinge does not take "sideways"/],
    [swing({ target: `${MODEL}.Lid` }), /no child named Lid \(it has: .*Cover/],
    [swing({ target: `${MODEL}.Cover.Hold` }), /is a WeldConstraint/],
    [swing({ target: 'game.Workspace.Elsewhere.Cover' }), /not inside game\.Workspace\.Unit/],
    [swing({ trigger: 'hover' }), /trigger\.on must be one of/],
    [swing({ trigger: { on: 'click', colour: 'red' } }), /trigger does not take "colour"/],
    [swing({ trigger: { on: 'click', text: 'Open' } }), /action text and only goes with trigger "prompt"/],
    [swing({ mode: 'forever' }), /mode must be one of/],
    [swing({ ease: 'Wobbly' }), /ease must be one of/],
    [swing({ delay: 999 }), /delay must be 0\.\.60/],
    [swing({ id: 'has space' }), /id must be letters, digits and _/],
    [swing({ with: 'Knob' }), /with must be a list/],
    [{ verb: 'slide', offset: [0, 0, 0] }, /offset must not be all 0/],
    [{ verb: 'slide' }, /slide needs offset/],
    [{ verb: 'fade', to: 3 }, /fade\.to must be 0\.\.1/],
    [{ verb: 'light', color: [-0.5, 0.2, 0.2] }, /light\.color must not go below 0/],
    [{ verb: 'light', color: [2, 0.2, 0.2] }, /light\.color must stay within 0\.\.1/],
    [{ verb: 'bounce', trigger: 'click' }, /a launcher listens for touch/],
    [{ verb: 'bounce', power: 5000 }, /bounce\.power must be 10\.\.400/],
    [{ verb: 'sound', soundId: 'rbxassetid://12345' }, /Refused \(D-FXLIB-1\)/],
    [{ verb: 'sound' }, /sound needs `sound`/],
    [{ verb: 'sound', sound: `${MODEL}.Body`, soundId: 'rbxassetid://1' }, /not both/],
    [{ verb: 'sound', soundId: 'http://x' }, /soundId must be rbxassetid/],
    [{ verb: 'emit' }, /no ParticleEmitter under it/],
    [{ verb: 'sound', soundId: 'rbxassetid://12345', trigger: 'auto' }, /Refused|auto/],
    [{ verb: 'swing', ...swing(), with: [`${MODEL}.Knob`], target: `${MODEL}.Cover`, trigger: 'auto', mode: 'toggle', angle: 10, extra: 1 }, /does not take "extra"/],
  ];
  for (const [raw, why] of bad) {
    const r = await read(raw);
    assert.ok('error' in r, `accepted ${JSON.stringify(raw).slice(0, 90)}`);
    assert.match(r.error, why, JSON.stringify(raw).slice(0, 90));
  }
});

test('auto is refused for what cannot start itself, and allowed for what can', async () => {
  const id = 'rbxassetid://5';
  const ctx = { discoveredAssetIds: new Set([5]) };
  assert.match((await read({ verb: 'sound', soundId: id, trigger: 'auto' }, { ctx })).error, /"auto" starts a behaviour on its own.*one-shot sound or a burst needs click/);
  assert.ok(!('error' in (await read({ verb: 'sound', soundId: id, loop: true, trigger: 'auto' }, { ctx }))), 'a looped sound is a state');
  assert.ok(!('error' in (await read({ verb: 'swing', ...swing(), trigger: 'auto' }))));
});

test('a click on a part that cannot answer a click, or a touch on one that cannot be touched, is said (not refused)', async () => {
  const m = coverModel();
  m.cover.props.CanQuery = { t: 'bool', v: false };
  m.knob.props.CanTouch = { t: 'bool', v: false };
  const r = await read(swing(), { tree: m.root });
  assert.match(r.notes.join(' '), /CanQuery off, so a click on it will not register/);
  const t = await read(swing({ trigger: { on: 'touch', at: `${MODEL}.Knob` } }), { tree: m.root });
  assert.match(t.notes.join(' '), /CanTouch off/);
  assert.equal((await read(swing({ trigger: { on: 'click', at: `${MODEL}.Body` } }), { tree: m.root })).notes.length, 0, 'a click carried by another part is fine');
});

test('a light with none under the target says it will make one; an emitter needs one', async () => {
  const r = await read({ verb: 'light', target: `${MODEL}.Cover`, color: [1, 0, 0] });
  assert.match(r.notes.join(' '), /PointLight will be made/);
  const m = coverModel();
  m.cover.children.push(inst('Spark', 'ParticleEmitter'));
  finalize(m.root, MODEL);
  assert.ok(!('error' in (await read({ verb: 'emit', target: `${MODEL}.Cover` }, { tree: m.root }))));
  assert.match(JSON.stringify((await read({ verb: 'light', target: `${MODEL}.Cover` }, { tree: m.root })).notes), /PointLight will be made/);
});

test('a duplicate-named part is addressed by #k and stored as { name, nth }', async () => {
  const an = anonymousModel();
  const r = await read({ verb: 'fade', target: 'game.Workspace.Piece.Part#2' }, { tree: an.root });
  assert.ok(!('error' in r), r.error);
  assert.deepEqual(r.record.target, { segs: [{ name: 'Part', nth: 2 }] });
  assert.match((await read({ verb: 'fade', target: 'game.Workspace.Piece.Part' }, { tree: an.root })).error, /2 children named Part; say which one/);
});

// ------------------------------------------------------------------------------------------------ the Luau side agrees

test('everything the worker writes passes the runtime\'s own check, with the same values', () => {
  let haveLuau = true;
  try { execFileSync('luau', ['--help'], { stdio: 'pipe' }); } catch { haveLuau = false; }
  if (!haveLuau) return;
  const recs = [
    { verb: 'swing', target: { segs: ['Cover'] }, trigger: { on: 'prompt', text: 'Open', reach: 12 }, mode: 'toggle', angle: -100, seconds: 0.6, hinge: { pivot: [0, -1, -1], axis: 'x' }, ease: 'Back', with: [{ segs: ['Knob'] }] },
    { verb: 'slide', target: { segs: [{ name: 'Part', nth: 2 }] }, trigger: { on: 'touch' }, mode: 'pulse', hold: 1.5, offset: [0, 3, 0], space: 'world', seconds: 0.6 },
    { verb: 'spin', target: { segs: [] }, trigger: { on: 'auto' }, mode: 'toggle', speed: -120, hinge: { pivot: [0, 0, 0], axis: 'z' } },
    { verb: 'bob', target: { segs: ['A'] }, trigger: { on: 'auto' }, mode: 'toggle', axis: 'x', amount: 0.5, period: 3, shape: 'hop' },
    { verb: 'fade', target: { segs: ['A'] }, trigger: { on: 'near', reach: 20, cooldown: 1 }, mode: 'hold', to: 0.8, seconds: 0.4, collide: false, delay: 0.5 },
    { verb: 'light', target: { segs: ['A'] }, trigger: { on: 'click' }, mode: 'toggle', color: [1, 0.5, 0], brightness: 3, range: 20, seconds: 0.2, glow: true },
    { verb: 'sound', target: { segs: ['A'] }, trigger: { on: 'click', at: { segs: ['B'] } }, mode: 'toggle', soundId: 'rbxassetid://99', volume: 0.7, pitch: 1.2, variance: 0.1, range: 80, fade: 0.5, loop: true },
    { verb: 'sound', target: { segs: [] }, trigger: { on: 'click' }, mode: 'toggle', sound: { segs: ['Workspace', 'Sfx', 'Siren'], abs: true }, volume: 0.6, pitch: 1, variance: 0.04, range: 60, fade: 0.3, loop: false },
    { verb: 'emit', target: { segs: ['A'] }, trigger: { on: 'click' }, mode: 'toggle', count: 30, sustain: false },
    { verb: 'bounce', target: { segs: ['A'] }, trigger: { on: 'touch' }, mode: 'pulse', power: 120, direction: [0, 1, 0.3], cooldown: 0.4 },
  ].map((r, i) => ({ id: `r${i}`, ...r }));
  const luauModule = readFileSync(join(ROOT, 'packages', 'components', 'behave', 'AppleBehave.luau'), 'utf8').replace(/^--!strict\n/, '');
  const data = C.renderConfigSource('Test', recs);
  const body = data.slice(data.indexOf('return {'));
  const probe = `local AppleBehave = (function()\n${luauModule}\nend)()\nlocal cfg = (function()\n${body}\nend)()\nfor i, raw in cfg.behaviours do\n  local rec, why = AppleBehave.check(raw)\n  if not rec then error("record " .. i .. " refused: " .. tostring(why)) end\n  for k, v in raw do\n    if type(v) ~= "table" and rec[k] ~= v then error("record " .. i .. " field " .. k .. " changed from " .. tostring(v) .. " to " .. tostring(rec[k])) end\n  end\n  if rec.trigger.on ~= raw.trigger.on or rec.mode ~= raw.mode then error("record " .. i .. " trigger or mode changed") end\n  print("ok " .. rec.id .. " " .. rec.verb)\nend\n`;
  const file = join(tmp, 'probe.luau');
  writeFileSync(file, probe);
  const out = execFileSync('luau', [file], { encoding: 'utf8' });
  assert.equal(out.trim().split('\n').length, recs.length, out);
});

test('end to end: the sign the anatomy recommends lifts the cover in the runtime, and what rides with it goes along', { skip: luauAvailable() ? false : 'luau is not on PATH' }, async () => {
  const m = coverModel();
  const studio = fakeStudio(m.root, { hash });
  const focus = JSON.parse((await T.runTool(studio, 'model_anatomy', JSON.stringify({ model: MODEL, part: `${MODEL}.Cover` }))).resultForLlm);
  const back = focus.hinges.find((h) => h.axis === 'x' && h.pivot[1] === -1 && h.pivot[2] === -1);
  const angle = back.negativeCarries === '+y' ? -100 : 100; // the agent reads which sign carries the part up
  const done = await call(studio, { behaviours: [{ verb: 'swing', id: 'open', target: `${MODEL}.Cover`, with: [`${MODEL}.Knob`], hinge: { pivot: back.pivot, axis: back.axis }, angle, seconds: 0.5, ease: 'Linear' }] });
  assert.ok(!done.error, done.error);
  const cfg = written(studio);
  const body = cfg.slice(cfg.indexOf('return {'));
  // The same geometry the fixture describes, in the mock world, with the module the tool wrote.
  const scene = `
local w = newWorld()
local base = w.part("Body", 0, 0.5, 0, 4, 1, 3)
local cover = w.part("Cover", 0, 1.2, 0, 4, 0.4, 3)
local knob = w.part("Knob", 0, 1.5, 1.4, 0.4, 0.4, 0.4)
local model = w.model("Unit", base, cover, knob)
local seam = make("Weld", "Seam"); seam.Part0 = base; seam.Part1 = cover; seam.Parent = base
local hold = make("WeldConstraint", "Hold"); hold.Part0 = cover; hold.Part1 = knob; hold.Parent = cover
local m = make("ModuleScript", "AppleBehaviours"); m._value = (function()
${body}
end)(); m.Parent = model
w.start()
assert(#warnings == 0, table.concat(warnings, "; "))
cover:FindFirstChildWhichIsA("ClickDetector").MouseClick:Fire({})
w.run(1)
local c, k, b = { cover.CFrame:GetComponents() }, { knob.CFrame:GetComponents() }, { base.CFrame:GetComponents() }
print(string.format("cover %.4f %.4f %.4f", c[1], c[2], c[3]))
print(string.format("knob %.4f %.4f %.4f", k[1], k[2], k[3]))
print(string.format("base %.4f %.4f %.4f", b[1], b[2], b[3]))
print("seam " .. tostring(seam.Enabled) .. " hold " .. tostring(hold.Enabled) .. " anchored " .. tostring(cover.Anchored) .. " " .. tostring(model:GetAttribute("AppleBehave_open")))
`;
  const out = runLuau(`${HARNESS}\nlocal AppleBehave = (function()\n${MODULE}\nend)()\n${MOCK}\n${scene}`, 'e2e');
  const row = (name) => out.split('\n').find((l) => l.startsWith(name + ' ')).split(' ').slice(1).map(Number);
  const [cx, cy, cz] = row('cover');
  assert.ok(cy > 1.2 + 1, `the cover's centre went up (y = ${cy})`);
  assert.ok(cz < 0, `and back toward the hinge edge it turns about (z = ${cz})`);
  assert.ok(Math.abs(cx) < 1e-6, 'about the x axis: no sideways drift');
  const [, ky] = row('knob');
  assert.ok(ky > 1.5 + 0.5, `the knob that rides with it went up too (y = ${ky})`);
  assert.deepEqual(row('base'), [0, 0.5, 0], 'the body did not move');
  assert.match(out, /seam false hold true anchored true true/, 'the weld to the body is off, the weld to the knob is left alone');
});

test('the runtime script and every config this tool writes pass the plugin\'s own source refusal list', () => {
  // The plugin refuses to write a script that mentions any of these; derive the list from the plugin, never copy it.
  const plugin = readFileSync(join(ROOT, 'apps', 'apple-plugin', 'src', 'Commands.luau'), 'utf8');
  const block = plugin.slice(plugin.indexOf('local function sourceDanger'));
  const forbidden = [...block.slice(0, block.indexOf('return nil\nend')).matchAll(/\{ "([a-z.]+)", "/g)].map((m) => m[1]);
  assert.ok(forbidden.length >= 8, 'the plugin\'s refusal list was found');
  const runtime = readFileSync(join(ROOT, 'packages', 'components', 'behave', 'AppleBehave.luau'), 'utf8').toLowerCase();
  for (const word of forbidden) assert.ok(!runtime.includes(word), `AppleBehave.luau contains "${word}", which the plugin refuses to write`);
  assert.ok(!/require\s*\(\s*[\d"']/.test(runtime), 'no require of an id or a string');
  const cfg = C.renderConfigSource('Unit', [{ id: 'a', verb: 'sound', soundId: 'rbxassetid://99' }]).toLowerCase();
  for (const word of forbidden) assert.ok(!cfg.includes(word), `a written config contains "${word}"`);
});

// ------------------------------------------------------------------------------------------------ the whole tool

test('with no behaviours it lists the verbs and what the model already has', async () => {
  const { studio } = place();
  const r = await call(studio, {});
  assert.ok(r.verbs.swing && r.verbs.sound && r.every);
  assert.deepEqual(r.behaviours, []);
  assert.ok(JSON.stringify(r).length <= 2900, `the lookup result is ${JSON.stringify(r).length} characters; runTool cuts at 3000 and a cut catalogue is a wrong one`);
  assert.deepEqual(studio.ops.map((o) => o.op), ['get_tree'], 'a lookup writes nothing');
});

test('first call: writes the data into the model, installs the runtime, and reads both back', async () => {
  const { studio } = place();
  const r = await call(studio, { behaviours: [swing({ id: 'open', trigger: { on: 'prompt', text: 'Open' }, ease: 'Back', with: [`${MODEL}.Knob`] })] });
  assert.ok(!r.error, r.error);
  assert.equal(r.changed, true);
  assert.deepEqual(r.behaviours, ['open:swing:prompt/toggle']);
  assert.equal(r.verified.behaviours, 'read back and matches');
  assert.equal(r.verified.runtime, 'installed and read back');
  const src = written(studio);
  assert.ok(src, 'the module was created at <model>.AppleBehaviours');
  const parsed = C.parseConfigSource(src);
  assert.equal(parsed.records.length, 1);
  assert.deepEqual(parsed.records[0].with, [{ segs: ['Knob'] }]);
  assert.equal(parsed.edited, false);
  assert.match(src, /return \{\n\tv = 1,\n\tbehaviours = \{/);
  const create = studio.ops.find((o) => o.op === 'edit_script' && o.path === `${MODEL}.AppleBehaviours`);
  assert.deepEqual(create.create, { className: 'ModuleScript', parent: MODEL });
  assert.ok(studio.scripts.get('game.ServerScriptService.AppleBehave').includes('AppleBehave.start'), 'the runtime script is in ServerScriptService');
  assert.match(r.next, /Check it in play/);
});

test('notes say which joints will be switched off and which will not', async () => {
  const { studio } = place();
  const r = await call(studio, { behaviours: [swing({ with: [`${MODEL}.Knob`] })] });
  const joints = r.notes.join(' ');
  assert.match(joints, /Weld Seam \(Body to Cover\)/, 'the weld to the body that stays still');
  assert.ok(!/WeldConstraint Hold/.test(joints), 'the weld between the cover and the knob moves together');
  const again = await call(studio, { behaviours: [{ verb: 'fade', target: `${MODEL}.Knob`, id: 'gone' }] });
  assert.ok(!again.error);
});

test('a second call adds to the file, a repeated id replaces, remove removes, and the runtime is not reinstalled', async () => {
  const { studio } = place();
  await call(studio, { behaviours: [swing({ id: 'open' })] });
  const opsBefore = studio.ops.length;
  const r = await call(studio, { behaviours: [{ verb: 'fade', target: `${MODEL}.Knob`, id: 'gone' }, swing({ id: 'open', angle: -45 })] });
  assert.ok(!r.error, r.error);
  assert.deepEqual(r.behaviours.map((b) => b.split(':')[0]), ['gone', 'open'], 'the replaced one is now last, in the order written');
  assert.deepEqual(r.replaced, ['open']);
  assert.equal(C.parseConfigSource(written(studio)).records.find((x) => x.id === 'open').angle, -45);
  const second = studio.ops.slice(opsBefore);
  assert.ok(!second.some((o) => o.op === 'delete_instances'), 'an up-to-date runtime is left alone');
  const edit = second.find((o) => o.op === 'edit_script' && o.path === `${MODEL}.AppleBehaviours`);
  assert.ok(edit.baseHash && !edit.create, 'an existing script is edited against the hash of what was read');
  assert.equal(r.verified.runtime, 'already current');

  const removed = await call(studio, { remove: ['gone'] });
  assert.deepEqual(removed.behaviours.map((b) => b.split(':')[0]), ['open']);
  assert.deepEqual(removed.removed, ['gone']);
  assert.match((await call(studio, { remove: ['nope'] })).error, /no behaviour with id "nope" .*it has: open/);
});

test('paths may be written relative to the model, as the reports print them, and mean the same as the full path', async () => {
  const { studio } = place();
  const r = await call(studio, { behaviours: [{ verb: 'swing', id: 'open', target: 'Cover', with: ['Knob'], hinge: { pivot: [0, -1, -1], axis: 'x' }, angle: -90, trigger: { on: 'click', at: 'Body' } }] });
  assert.ok(!r.error, r.error);
  const rec = C.parseConfigSource(written(studio)).records[0];
  assert.deepEqual(rec.target, { segs: ['Cover'] });
  assert.deepEqual(rec.with, [{ segs: ['Knob'] }]);
  assert.deepEqual(rec.trigger.at, { segs: ['Body'] });
  const full = place();
  await call(full.studio, { behaviours: [{ verb: 'swing', id: 'open', target: `${MODEL}.Cover`, with: [`${MODEL}.Knob`], hinge: { pivot: [0, -1, -1], axis: 'x' }, angle: -90, trigger: { on: 'click', at: `${MODEL}.Body` } }] });
  assert.equal(written(studio), written(full.studio), 'the same file either way');
  assert.match((await call(studio, { behaviours: [{ verb: 'fade', target: 'Lid' }] })).error, /no child named Lid/);
});

test('a result never outgrows the 3000-character cut, however many behaviours and notes there are', async () => {
  const { studio } = place();
  const many = Array.from({ length: 40 }, (_, i) => ({ verb: 'light', target: `${MODEL}.Cover`, id: `lamp${i}`, trigger: 'click' }));
  const r = await call(studio, { behaviours: many });
  assert.ok(!r.error, r.error);
  assert.equal(r.behaviours.length, 40);
  assert.ok(r.notes.length <= 6 && /…and \d+ more$/.test(r.notes[r.notes.length - 1]), 'the notes are the first few and a count');
  assert.ok(JSON.stringify(r).length <= 3000, `the result is ${JSON.stringify(r).length} characters`);
  const again = await call(studio, {});
  assert.equal(again.behaviours.length, 11, 'ten, and a count of the rest');
  assert.match(again.behaviours[10], /…and 30 more/);
  assert.ok(JSON.stringify(again).length <= 3000, `the lookup with 40 behaviours is ${JSON.stringify(again).length} characters`);
});

test('ids are made unique when the agent gives none', async () => {
  const { studio } = place();
  const r = await call(studio, { behaviours: [{ verb: 'fade', target: `${MODEL}.Knob` }, { verb: 'fade', target: `${MODEL}.Cover` }] });
  assert.deepEqual(r.behaviours.map((b) => b.split(':')[0]), ['fade', 'fade2']);
  const again = await call(studio, { behaviours: [{ verb: 'fade', target: `${MODEL}.Body` }] });
  assert.deepEqual(again.behaviours.map((b) => b.split(':')[0]), ['fade', 'fade2', 'fade3']);
});

test('a file edited by hand is not merged into; replace writes it afresh', async () => {
  const { studio } = place();
  await call(studio, { behaviours: [swing({ id: 'open' })] });
  const path = `${MODEL}.AppleBehaviours`;
  studio.scripts.set(path, studio.scripts.get(path).replace('angle = -100', 'angle = -120'));
  const r = await call(studio, { behaviours: [{ verb: 'fade', target: `${MODEL}.Knob` }] });
  assert.match(r.error, /edited by hand.*cannot be merged into safely.*Nothing was changed/);
  const before = studio.scripts.get(path);
  const fresh = await call(studio, { replace: true, behaviours: [{ verb: 'fade', target: `${MODEL}.Knob`, id: 'only' }] });
  assert.ok(!fresh.error, fresh.error);
  assert.deepEqual(fresh.behaviours.map((b) => b.split(':')[0]), ['only']);
  assert.notEqual(studio.scripts.get(path), before);
});

test('an existing behaviour that no longer holds (its part is gone) is dropped and said, the rest kept', async () => {
  const { m, studio } = place();
  await call(studio, { behaviours: [swing({ id: 'open' }), { verb: 'fade', target: `${MODEL}.Knob`, id: 'gone' }] });
  m.root.children = m.root.children.filter((c) => c.name !== 'Knob');
  finalize(m.root, MODEL);
  const r = await call(studio, { behaviours: [{ verb: 'fade', target: `${MODEL}.Body`, id: 'new' }] });
  assert.ok(!r.error, r.error);
  assert.deepEqual(r.behaviours.map((b) => b.split(':')[0]), ['open', 'new']);
  assert.match(r.notes.join(' '), /dropped an existing behaviour that no longer holds \(gone\).*no child named Knob/);
});

test('nothing is written when any one behaviour is wrong', async () => {
  const { studio } = place();
  const r = await call(studio, { behaviours: [swing(), swing({ angle: 0 })] });
  assert.match(r.error, /behaviours\[1\]: swing\.angle must not be 0\. Nothing was written/);
  assert.ok(!studio.ops.some((o) => o.op === 'edit_script' || o.op === 'delete_instances'));
  assert.equal(written(studio), undefined);
});

test('a sound written in an earlier run survives a merge in a later one, though that run never searched for it', async () => {
  const { studio } = place();
  studio.discoveredAssetIds = new Set([4242]);
  const first = await call(studio, { behaviours: [{ verb: 'sound', soundId: 'rbxassetid://4242', target: `${MODEL}.Cover`, id: 'hum' }] });
  assert.ok(!first.error, first.error);
  // A new run: its own context, nothing discovered yet, the same place.
  const later = Object.assign(fakeStudio(studio.root, { scripts: studio.scripts, hash }), { discoveredAssetIds: undefined });
  const r = await call(later, { behaviours: [{ verb: 'fade', target: `${MODEL}.Knob`, id: 'gone' }] });
  assert.ok(!r.error, r.error);
  assert.deepEqual(r.behaviours.map((b) => b.split(':')[0]), ['hum', 'gone'], 'the earlier sound is still there');
  assert.ok(!(r.notes ?? []).some((n) => /dropped/.test(n)), 'and was not dropped');
  const stillRefused = await call(later, { behaviours: [{ verb: 'sound', soundId: 'rbxassetid://4242', target: `${MODEL}.Cover`, id: 'again' }] });
  assert.match(stillRefused.error, /Refused \(D-FXLIB-1\)/, 'a NEW request for that id is still judged');
});

test('a sound by id needs an id from the library or one the search found; a Sound in the place is checked for its id', async () => {
  const { m, studio } = place();
  studio.discoveredAssetIds = new Set([4242]);
  const ok = await call(studio, { behaviours: [{ verb: 'sound', soundId: 'rbxassetid://4242', target: `${MODEL}.Cover`, loop: true }] });
  assert.ok(!ok.error, ok.error);
  assert.equal(C.parseConfigSource(written(studio)).records[0].soundId, 'rbxassetid://4242');

  // a Sound already inside the model
  m.cover.children.push(inst('Hum', 'Sound', { SoundId: { t: 'string', v: 'rbxassetid://4242' } }));
  m.knob.children.push(inst('Mute', 'Sound', { SoundId: { t: 'string', v: '' } }));
  m.body.children.push(inst('Rogue', 'Sound', { SoundId: { t: 'string', v: 'rbxassetid://31337' } }));
  finalize(m.root, MODEL);
  const inside = await call(studio, { behaviours: [{ verb: 'sound', sound: `${MODEL}.Cover.Hum`, id: 'hum' }] });
  assert.ok(!inside.error, inside.error);
  assert.deepEqual(C.parseConfigSource(written(studio)).records.find((r) => r.id === 'hum').sound, { segs: ['Cover', 'Hum'] });
  assert.match((await call(studio, { behaviours: [{ verb: 'sound', sound: `${MODEL}.Knob.Mute` }] })).error, /no SoundId/);
  assert.match((await call(studio, { behaviours: [{ verb: 'sound', sound: `${MODEL}.Body.Rogue` }] })).error, /not from Apple's library/);
  assert.match((await call(studio, { behaviours: [{ verb: 'sound', sound: `${MODEL}.Body` }] })).error, /is a Part, not a Sound/);
});

test('a Sound outside the model is read once and stored as an absolute path', async () => {
  const { m, studio } = place();
  studio.discoveredAssetIds = new Set([77]);
  const siren = inst('Siren', 'Sound', { SoundId: { t: 'string', v: 'rbxassetid://77' } });
  const holder = finalize(inst('Sfx', 'Folder', {}, [siren]), 'game.Workspace.Sfx');
  const realExec = studio.execStudioOp;
  studio.execStudioOp = async (op) => (op.op === 'get_instance' && op.path === 'game.Workspace.Sfx.Siren'
    ? (studio.ops.push(op), { id: 'x', ok: true, data: { class: 'Sound', props: siren.props } })
    : realExec(op));
  const r = await call(studio, { behaviours: [{ verb: 'sound', sound: 'game.Workspace.Sfx.Siren', target: `${MODEL}.Cover`, id: 'alarm' }] });
  assert.ok(!r.error, r.error);
  assert.deepEqual(C.parseConfigSource(written(studio)).records[0].sound, { segs: ['Workspace', 'Sfx', 'Siren'], abs: true });
  assert.ok(holder && m);
  const other = await call(studio, { behaviours: [{ verb: 'sound', sound: 'game.ServerScriptService.Anything' }] });
  assert.ok(other.error);
});

test('the kill switch refuses, and a tree the place cut short is refused rather than half-checked', async () => {
  const { studio } = place();
  studio.env = { BEHAVIOUR_V2: 'off' };
  assert.match((await call(studio, { behaviours: [swing()] })).error, /switched off/);
  for (const v of ['0', 'false', 'OFF', ' off ']) assert.equal(B.behaviourEnabled({ BEHAVIOUR_V2: v }), false, v);
  for (const v of [undefined, '', 'on', '1']) assert.equal(B.behaviourEnabled({ BEHAVIOUR_V2: v }), true, String(v));
  studio.env = {};
  studio.truncated = true;
  assert.match((await call(studio, { behaviours: [swing()] })).error, /too big to read in one go/);
});

test('argument errors name the argument', async () => {
  const { studio } = place();
  assert.match((await B.addBehaviour(studio, { model: 'game.ServerStorage.Unit' })).error, /game\.Workspace/);
  assert.match((await call(studio, { behaviours: [] })).error, /1 to 40/);
  assert.match((await call(studio, { behaviours: 'swing' })).error, /1 to 40/);
  assert.match((await call(studio, { remove: [3] })).error, /list of behaviour ids/);
  assert.match((await call(studio, { frobnicate: 1 })).error, /does not take "frobnicate"/);
  assert.match((await B.addBehaviour(studio, { model: 'game.Workspace.Missing', behaviours: [swing()] })).error, /could not read/);
  const leaf = leafModel();
  const s2 = fakeStudio(leaf.root, { hash });
  assert.match((await B.addBehaviour(s2, { model: 'game.Workspace.Gateway', behaviours: [{ verb: 'fade', target: 'game.Workspace.Gateway.Post' }] })).error, /2 children named Post; say which one/);
});

test('a failed write is reported as a failed write, and a half-finished one says it changed something', async () => {
  const { studio } = place();
  const real = studio.execStudioOp;
  studio.execStudioOp = async (op) => (op.op === 'edit_script' && op.path.endsWith('AppleBehaviours') ? { id: 'x', ok: false, error: 'no room' } : real(op));
  assert.match((await call(studio, { behaviours: [swing()] })).error, /The behaviours were not written: no room/);
  const s2 = place().studio;
  const real2 = s2.execStudioOp;
  s2.execStudioOp = async (op) => (op.op === 'edit_script' && op.path.endsWith('AppleBehave') ? { id: 'x', ok: false, error: 'refused' } : real2(op));
  const half = await call(s2, { behaviours: [swing()] });
  assert.equal(half.changed, true);
  assert.match(half.error, /written but the runtime .* was not installed: refused/);
});

test('a read-back that differs is said, never reported as fine', async () => {
  const { studio } = place();
  const real = studio.execStudioOp;
  let writes = 0;
  studio.execStudioOp = async (op) => {
    const r = await real(op);
    if (op.op === 'read_script' && op.path === `${MODEL}.AppleBehaviours` && studio.scripts.has(op.path)) writes++;
    if (op.op === 'read_script' && op.path === `${MODEL}.AppleBehaviours` && writes > 0) return { id: 'x', ok: true, data: { source: 'something else' } };
    return r;
  };
  const r = await call(studio, { behaviours: [swing()] });
  assert.equal(r.verified.behaviours, 'READ BACK DIFFERENT from what was sent');
  assert.match(r.notes.join(' '), /reads back different/);
});

test('a rigged model gets a warning, and parts moved by two verbs are said to compose', async () => {
  const { m, studio } = place();
  m.cover.children.push({ name: 'Rig', class: 'Motor6D', props: { Part0: { __link: m.body }, Part1: { __link: m.cover } }, children: [] });
  finalize(m.root, MODEL);
  const r = await call(studio, { behaviours: [swing({ id: 'a' }), { verb: 'bob', target: `${MODEL}.Cover`, id: 'b' }] });
  assert.match(r.notes.join(' '), /Rig is a Motor6D on a moving part.*fights/);
  assert.match(r.notes.join(' '), /moved by more than one behaviour \(a, b\).*compose/);
});

// ------------------------------------------------------------------------------------------------ the registry

test('both tools are registered with their ops, the writer counts as a project change, the reader does not', () => {
  const add = T.TOOLS.add_behaviour, look = T.TOOLS.model_anatomy;
  assert.ok(add && look);
  assert.equal(add.studio, true); assert.equal(look.studio, true);
  for (const op of ['get_tree', 'read_script', 'edit_script', 'delete_instances', 'get_instance']) assert.ok(add.studioOps.includes(op), op);
  for (const op of ['get_tree', 'read_script']) assert.ok(look.studioOps.includes(op), op);
  assert.equal(add.mutatesProject({ changed: true }), true);
  assert.equal(add.mutatesProject({ error: 'x' }), false);
  assert.equal(look.mutatesProject, undefined);
  assert.ok(T.toolDefs(true).some((d) => d.name === 'add_behaviour'));
  assert.ok(!T.toolDefs(false).some((d) => d.name === 'add_behaviour' || d.name === 'model_anatomy'), 'neither is offered without Studio');
  assert.ok(add.def.description.length < 600 && look.def.description.length < 400, 'the definitions that ride on every step stay short');
  assert.ok(!T.DEFERRED_TOOLS.has('add_behaviour'));
});

test('the card the tool points at exists, and every tool it names is a real tool', () => {
  const id = /creation skill ([a-z0-9-]+)/.exec(T.TOOLS.add_behaviour.def.description)?.[1];
  assert.equal(id, 'props-add-behaviour');
  const card = SK.CREATOR_SKILLS.find((c) => c.id === id);
  assert.ok(card, `${id} is not in the catalogue`);
  assert.equal(card.implementation.id, 'add_behaviour');
  const text = JSON.stringify(card);
  for (const name of ['model_anatomy', 'add_behaviour', 'find_sound', 'insert_sound', 'play_check', 'run_and_check']) {
    assert.ok(text.includes(name), `the card does not mention ${name}`);
    assert.ok(T.TOOLS[name], `the card names ${name}, which is not a registered tool`);
  }
  for (const verb of B.VERBS) assert.ok(text.includes(verb), `the card does not teach the verb ${verb}`);
});

test('through the real registry: model_anatomy then add_behaviour on one model, as an agent would', async () => {
  const m = coverModel();
  const studio = fakeStudio(m.root, { hash });
  const looked = await T.runTool(studio, 'model_anatomy', JSON.stringify({ model: MODEL }));
  assert.equal(looked.ok, true, looked.resultForLlm);
  const view = JSON.parse(looked.resultForLlm);
  assert.equal(view.partCount, 3);
  assert.ok(!looked.mutatedProject, 'a look changes nothing');
  const focus = JSON.parse((await T.runTool(studio, 'model_anatomy', JSON.stringify({ model: MODEL, part: `${MODEL}.Cover` }))).resultForLlm);
  const back = focus.hinges.find((h) => h.axis === 'x' && h.pivot[1] === -1 && h.pivot[2] === -1);
  // the agent reads the candidate and picks the sign that lifts the cover
  const angle = back.negativeCarries === '+y' ? -100 : 100;
  const done = await T.runTool(studio, 'add_behaviour', JSON.stringify({ model: MODEL, behaviours: [{ verb: 'swing', target: `${MODEL}.Cover`, hinge: { pivot: back.pivot, axis: back.axis }, angle }] }));
  assert.equal(done.ok, true, done.resultForLlm);
  assert.equal(done.mutatedProject, true);
  assert.equal(C.parseConfigSource(written(studio)).records[0].angle, -100);
  const after = JSON.parse((await T.runTool(studio, 'model_anatomy', JSON.stringify({ model: MODEL }))).resultForLlm);
  assert.deepEqual(after.behaviours, ['swing:swing'], 'the next look sees what was written');
});

// ------------------------------------------------------------------------------------------------ generality

test('no subject is named in the behaviour code: the words the repo treats as subjects do not appear outside a short, justified list', () => {
  // Derived from the repo's own list of subject words, not typed here. RESTATED 2026-10-03 at the merge into integration:
  // world-building (288aba9b) removed PROP_WORDS from model-rule.ts, so the list it had is kept as a fixture.
  const subjects = new Set(JSON.parse(readFileSync(join(WORKER, 'tests', 'fixtures', 'subject-words.json'), 'utf8')).words);
  assert.ok(subjects.size > 100, 'the subject list was found');
  // Ordinary English that is also a verb or noun the behaviour vocabulary needs. A subject word NOT in this list fails the test.
  const generic = new Set([
    'light', // the verb that switches lights
    'tool', // "the tool", meaning this tool
    'well', // "as well", "well-formed"
    'sign', // the sign of an angle
    'flag', // a boolean flag
    'prop', // a property
    'box', // a bounding box: geometry, not a container
    'tree', // the instance tree
    'table', // a Luau table
    'leave', // the event "a player leaves"
    'character', // a player's Character (the Roblox term for the avatar in the world)
  ]);
  const files = [
    join(WORKER, 'src', 'behaviour-tool.ts'), join(WORKER, 'src', 'behaviour-config.ts'), join(WORKER, 'src', 'model-anatomy.ts'),
    join(WORKER, 'src', 'model-geometry.ts'), join(ROOT, 'packages', 'components', 'behave', 'AppleBehave.luau'),
  ];
  const found = new Map();
  for (const f of files) {
    const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--\[\[[\s\S]*?\]\]/g, ' ').replace(/^\s*(\/\/|--).*$/gm, ' ').replace(/\s(\/\/|--) .*$/gm, ' ');
    for (const w of code.toLowerCase().match(/[a-z]+/g) ?? []) {
      const singular = w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w;
      if (subjects.has(w) || subjects.has(singular)) found.set(w, (found.get(w) ?? new Set()).add(f.split('/').pop()));
    }
  }
  const unexpected = [...found].filter(([w]) => !generic.has(w) && !generic.has(w.replace(/s$/, ''))).map(([w, fs]) => `${w} (${[...fs].join(', ')})`);
  assert.deepEqual(unexpected, [], 'a subject word is in code that is supposed to know no subjects');
});

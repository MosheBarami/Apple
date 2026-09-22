/**
 * AMBIENT EFFECTS — the Luau has to compile, and it has to reference nothing.
 *
 * `add_effect` now sends typed create/delete operations to Studio. The legacy Luau generator stays
 * covered here because it remains an exported compatibility helper, while the tool assertions below
 * prove the shipping path never executes it.
 *
 *   1. The compatibility chunk must still parse, so every preset is compiled with luau-analyze.
 *   2. A preset quietly references an asset. The whole claim of effects.ts is that these cost
 *      nothing and cannot fail a licence or safety gate, which is only true while no preset names
 *      an asset id. That claim is asserted directly rather than trusted.
 *
 * These tests EXECUTE the generator and the tool; none of them greps the source for a phrase.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const out = join(mkdtempSync(join(tmpdir(), 'fx-')), 'fx.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'effects.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { stdio: 'pipe' });
const FX = await import(`file://${out}`);

const toolOut = join(tmpdir(), `apple-fxtool-${process.pid}.mjs`);
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'tools.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + toolOut],
  { cwd: WORKER, stdio: 'pipe' });
const T = await import(`file://${toolOut}`);
rmSync(toolOut, { force: true });

const TMP = mkdtempSync(join(tmpdir(), 'fx-luau-'));
function haveLuau() {
  try { execFileSync('luau-analyze', ['--help'], { stdio: 'pipe' }); return true; } catch { return false; }
}
function syntaxErrors(source, tag) {
  const file = join(TMP, `${tag}.luau`);
  writeFileSync(file, source);
  let output = '';
  try { output = execFileSync('luau-analyze', [file], { encoding: 'utf8', stdio: 'pipe' }); }
  catch (err) { output = `${err.stdout ?? ''}${err.stderr ?? ''}`; }
  return output.split('\n').filter((l) => l.includes('SyntaxError'));
}

function stubCtx(answer) {
  const ops = [];
  const reply = answer ?? ((op) => op.op === 'get_tree'
    ? { ok: true, data: { root: { path: op.root, children: [] } } }
    : { ok: true, data: { ok: true } });
  return { ops, ctx: { env: {}, studioConnected: () => true, execStudioOp: async (o) => { ops.push(o); return typeof reply === 'function' ? reply(o) : reply; }, addMemoryFact: async () => {} } };
}

test('the catalogue is real and not empty', () => {
  assert.ok(FX.EFFECT_NAMES.length >= 8, `only ${FX.EFFECT_NAMES.length} presets`);
  for (const n of FX.EFFECT_NAMES) {
    const p = FX.EFFECTS[n];
    assert.ok(p.summary && p.use, `${n} must tell the model when to use it`);
    assert.ok(p.parts.length > 0, `${n} creates nothing`);
  }
});

test('every preset is representable by the current typed Apple plugin contract', () => {
  const commands = readFileSync(join(WORKER, '..', 'apple-plugin', 'src', 'Commands.luau'), 'utf8');
  const tableKeys = (name) => {
    const block = new RegExp(`local ${name} = \\{([\\s\\S]*?)\\n\\}`, 'm').exec(commands);
    assert.ok(block, `${name} missing from current plugin`);
    return new Set([...block[1].matchAll(/^\s*([A-Za-z0-9_]+)\s*=\s*true/gm)].map((m) => m[1]));
  };
  const classes = tableKeys('CREATE_CLASSES');
  const props = tableKeys('PROPERTY_ALLOW');
  for (const name of FX.EFFECT_NAMES) {
    const specs = FX.effectInstanceSpecs(name, 'game.Workspace.Thing');
    assert.ok(specs?.length, `${name} cannot be encoded as typed instance specs`);
    for (const spec of specs) {
      assert.equal(classes.has(spec.className), true, `${name} uses plugin-blocked class ${spec.className}`);
      for (const prop of Object.keys(spec.props ?? {})) {
        assert.equal(props.has(prop), true, `${name}.${spec.className} uses plugin-blocked property ${prop}`);
      }
      assert.equal(spec.attributes.AppleEffect.v, name);
    }
  }
});

test('every preset generates Luau that COMPILES', { skip: haveLuau() ? false : 'luau-analyze not on PATH' }, () => {
  for (const n of FX.EFFECT_NAMES) {
    const src = FX.effectLuau(n, 'game.Workspace.Thing');
    assert.ok(src.length > 100, `${n} generated only ${src.length} chars`);
    assert.deepEqual(syntaxErrors(src, `fx-${n}`), [], `${n} does not parse`);
  }
});

test('NO preset references an asset of any kind — the core claim of the module', () => {
  for (const n of FX.EFFECT_NAMES) {
    const src = FX.effectLuau(n, 'game.Workspace.Thing');
    assert.doesNotMatch(src, /rbxassetid:\/\//i, `${n} names a marketplace asset`);
    assert.doesNotMatch(src, /rbxasset:\/\//i, `${n} names engine content that cannot be verified from this repo`);
    assert.doesNotMatch(src, /rbxthumb:\/\//i);
    assert.doesNotMatch(src, /\bTexture\s*=/, `${n} sets a Texture, which needs a content path`);
    assert.doesNotMatch(src, /\bSoundId\s*=/, `${n} sets a SoundId`);
  }
});

test('the generated Luau passes the worker\'s own asset-ingress filter', () => {
  // add_effect calls the op directly rather than going through run_luau, so it does not inherit
  // that filter. It should still be true that it WOULD pass — if generated code could not survive
  // the gate the model's own code has to survive, the gate would be the thing that is wrong.
  for (const n of FX.EFFECT_NAMES) {
    assert.equal(T.refuseLuauIngress(FX.effectLuau(n, 'game.Workspace.Thing')), null, `${n} would be refused`);
  }
});

test('the generated Luau survives the plugin\'s non-yielding-loop refusal', () => {
  // Ops.luau refuses `while true` / `while 1` / `repeat ... until false` with no yield inside.
  for (const n of FX.EFFECT_NAMES) {
    const src = FX.effectLuau(n, 'game.Workspace.Thing');
    assert.doesNotMatch(src, /while\s*\(?\s*(true|1)\s*\)?\s*do/, `${n} emits an uninterruptible loop`);
    assert.doesNotMatch(src, /\brepeat\b/, `${n} emits a repeat loop`);
  }
});

test('every particle preset ramps transparency to fully invisible', () => {
  // A particle whose transparency does not end at 1 pops out of existence at the end of its
  // lifetime. It is the single most common tell of a hand-written emitter.
  let emitters = 0;
  for (const n of FX.EFFECT_NAMES) {
    for (const part of FX.EFFECTS[n].parts) {
      if (part.className !== 'ParticleEmitter') continue;
      emitters += 1;
      assert.ok(part.props.Transparency, `${n} has no transparency ramp`);
      assert.match(part.props.Transparency, /NumberSequenceKeypoint\.new\(1,\s*1\)/, `${n} does not fade out`);
      assert.ok(part.props.Size, `${n} has no size ramp`);
      assert.ok(Number(part.props.Rate) <= 40, `${n} emits ${part.props.Rate}/s, which reads as a smoke machine`);
    }
  }
  // Renaming the class would skip every part and leave this passing with nothing checked.
  assert.equal(emitters, 9, `expected 9 particle emitters across the presets, examined ${emitters}`);
});

test('re-applying clears the previous copy instead of stacking', () => {
  const src = FX.effectLuau('fire', 'game.Workspace.Torch');
  assert.match(src, /GetAttribute\("AppleEffect"\) == "fire"/, 'it must find its own previous instances');
  assert.match(src, /:Destroy\(\)/, 'and remove them');
  assert.match(src, /SetAttribute\("AppleEffect", "fire"\)/, 'and mark what it creates so the next call can find it');
});

test('the path is walked as data, never built into an index expression', () => {
  const src = FX.effectLuau('fire', 'game.Workspace.Torch');
  assert.match(src, /FindFirstChild\(seg\)/, 'the path must be resolved child by child');
  assert.doesNotMatch(src, /loadstring/);
  assert.doesNotMatch(src, /\brequire\s*\(/);
});

test('an unknown effect is refused by name and nothing reaches Studio', async () => {
  const { ctx, ops } = stubCtx();
  const res = await T.TOOLS.add_effect.run(ctx, { effect: 'lens_flare', path: 'game.Workspace.X' });
  assert.match(String(res.error), /unknown effect/);
  assert.match(String(res.error), /embers/, 'the refusal must name what IS available');
  assert.equal(ops.length, 0);
});

test('a hostile path is refused before any code is generated', async () => {
  for (const bad of ['game.Workspace."]..x', 'game.Work\nspace.X', 'game\\Workspace']) {
    const { ctx, ops } = stubCtx();
    const res = await T.TOOLS.add_effect.run(ctx, { effect: 'fire', path: bad });
    assert.ok(res.error, `${JSON.stringify(bad)} was not refused`);
    assert.equal(ops.length, 0, `${JSON.stringify(bad)} reached Studio`);
  }
});

/**
 * THE CANONICAL PATH WAS THE ONE PATH THESE TOOLS REFUSED.
 *
 * Paths.fullPath — what every other tool RETURNS to the model — brackets any name that is not a
 * bare identifier: game.Workspace["Camp Fire"].Logs. add_effect and remove_effect rejected every
 * path containing a quote, so an instance named "Camp Fire", "Rock 2" or "3rd Floor" could never be
 * given an effect, and the model was told its own system's format was "not valid". The resolver
 * could not have handled it either: it split on '.' and asked FindFirstChild for
 * `Workspace["Camp Fire"]`.
 *
 * These assert the round trip that was broken: a path of the shape create_instances hands back goes
 * into add_effect and comes out as a resolver that looks for the right child.
 */
test('A BRACKETED NAME — the form every other tool returns — is accepted and resolved', async () => {
  const { ctx, ops } = stubCtx();
  const res = await T.TOOLS.add_effect.run(ctx, { effect: 'fire', path: 'game.Workspace["Camp Fire"].Logs' });
  assert.equal(res.error, undefined, JSON.stringify(res));
  assert.deepEqual(ops.map((op) => op.op), ['get_tree', 'create_instances']);
  assert.equal(ops[0].root, 'game.Workspace["Camp Fire"].Logs', 'the canonical path stays data on the typed op');
  assert.ok(ops[1].items.every((item) => item.parent === 'game.Workspace["Camp Fire"].Logs'));
});

test('names with spaces, hyphens and leading digits all work, in both tools', async () => {
  const paths = [
    'game.Workspace["Camp Fire"].Logs',
    'game.Workspace["Rock-2"]',
    'game.Workspace["3rd Floor"].Lamp',
    "game.Workspace['Single Quoted']",
    'game.Workspace.Plain.Nested.Deep',
  ];
  for (const path of paths) {
    for (const tool of ['add_effect', 'remove_effect']) {
      const { ctx, ops } = stubCtx();
      const args = tool === 'add_effect' ? { effect: 'fire', path } : { path };
      const res = await T.TOOLS[tool].run(ctx, args);
      assert.equal(res.error, undefined, `${tool} refused ${path}: ${JSON.stringify(res)}`);
      assert.ok(ops.length >= 1, `${tool} sent nothing for ${path}`);
      assert.equal(ops[0].op, 'get_tree');
      assert.equal(ops[0].root, path);
    }
  }
});

test('a name containing a quote is reachable when it is bracketed properly', async () => {
  // Roblox lets an instance be named with a quote in it. The canonical form escapes it inside the
  // brackets; that must resolve to the real name, not to the escaped spelling.
  const { ctx, ops } = stubCtx();
  const res = await T.TOOLS.add_effect.run(ctx, { effect: 'fire', path: 'game.Workspace["Bob\\"s Hut"]' });
  assert.equal(res.error, undefined, JSON.stringify(res));
  assert.equal(ops[0].root, 'game.Workspace["Bob\\"s Hut"]');
});

test('THE PATH NEVER REACHES CODE POSITION, however it is spelled', async () => {
  const sneaky = 'game.Workspace["a\\" ]] .. tostring(game:GetService(\'Players\')) .. [[ "].B';
  const { ctx, ops } = stubCtx();
  const res = await T.TOOLS.add_effect.run(ctx, { effect: 'fire', path: sneaky });
  assert.equal(res.error, undefined, 'a legal if absurd name should be accepted');
  assert.equal(ops.some((op) => op.op === 'run_code'), false);
  assert.equal(ops[0].root, sneaky, 'the path is passed only as a typed path field');
  assert.ok(ops.filter((op) => op.op === 'create_instances').every((op) => op.items.every((item) => item.parent === sneaky)));
});

test('a real call uses typed create_instances and reports what it attached', async () => {
  const { ctx, ops } = stubCtx();
  const res = await T.TOOLS.add_effect.run(ctx, { effect: 'fire', path: 'game.Workspace.Torch' });
  assert.deepEqual(ops.map((op) => op.op), ['get_tree', 'create_instances']);
  const items = ops[1].items;
  assert.deepEqual(items.map((item) => item.className), ['ParticleEmitter', 'PointLight']);
  const emitter = items.find((item) => item.className === 'ParticleEmitter');
  assert.equal(emitter.props.Size.t, 'NumberSequence');
  assert.equal(emitter.props.Color.t, 'ColorSequence');
  assert.equal(emitter.attributes.AppleEffect.v, 'fire');
  assert.equal(ops.some((op) => op.op === 'run_code'), false);
  assert.equal(res.attached, 'fire');
  assert.deepEqual(res.parts, ['ParticleEmitter', 'PointLight']);
});

test('add_effect is offered with Studio and withheld without it', () => {
  assert.ok(T.toolDefs(true, undefined).map((d) => d.name).includes('add_effect'));
  assert.equal(T.toolDefs(false, undefined).map((d) => d.name).includes('add_effect'), false);
});

test('the tool description carries the whole catalogue, so no extra round trip is needed', () => {
  const def = T.toolDefs(true, undefined).find((d) => d.name === 'add_effect');
  for (const n of FX.EFFECT_NAMES) assert.ok(def.description.includes(n), `${n} missing from the description`);
});

// --- the other half: taking an effect back off ------------------------------------------------

test('both removal forms generate Luau that COMPILES', { skip: haveLuau() ? false : 'luau-analyze not on PATH' }, () => {
  assert.deepEqual(syntaxErrors(FX.removeEffectLuau(null, 'game.Workspace.Torch'), 'rm-all'), []);
  assert.deepEqual(syntaxErrors(FX.removeEffectLuau('fire', 'game.Workspace.Torch'), 'rm-one'), []);
});

test('THE MARKER IS THE ONLY AUTHORITY — it cannot remove what it did not place', () => {
  // The difference between "undo the thing you added" and "delete the children of this part". The
  // second is a request nobody made, and a user's own ParticleEmitter is exactly the sort of thing
  // sitting next to ours.
  const src = FX.removeEffectLuau(null, 'game.Workspace.Torch');
  assert.match(src, /GetAttribute\("AppleEffect"\)/, 'the attribute must be what it checks');
  assert.match(src, /mark ~= nil/, 'and an unmarked child must be skipped');
  assert.doesNotMatch(src, /:IsA\(/, 'it must not match on class');
  assert.doesNotMatch(src, /child\.Name ==/, 'nor on name');
});

test('CONTRACT: remove looks for exactly the marker add writes', () => {
  // These two functions have no shared constant between them. If they drifted, add would keep
  // working and remove would silently find nothing — a feature that appears to run and does not.
  const added = FX.effectLuau('fire', 'game.Workspace.Torch');
  const removed = FX.removeEffectLuau('fire', 'game.Workspace.Torch');
  const written = added.match(/SetAttribute\("([^"]+)",\s*"([^"]+)"\)/);
  assert.ok(written, 'add must mark what it creates');
  const [, attr, value] = written;
  assert.match(removed, new RegExp(`GetAttribute\\("${attr}"\\)`), `remove must read ${attr}`);
  assert.match(removed, new RegExp(`wanted = "${value}"`), `remove must scope to ${value}`);
});

test('naming an effect scopes the removal; omitting it removes them all', () => {
  assert.match(FX.removeEffectLuau('smoke', 'game.Workspace.X'), /wanted = "smoke"/);
  assert.match(FX.removeEffectLuau(null, 'game.Workspace.X'), /wanted = nil/);
  // and the scoped form must still be a comparison, not a hard-coded single branch
  assert.match(FX.removeEffectLuau('smoke', 'game.Workspace.X'), /wanted == nil or mark == wanted/);
});

test('the removal survives the ingress filter and the non-yielding-loop rule', () => {
  for (const src of [FX.removeEffectLuau(null, 'game.Workspace.X'), FX.removeEffectLuau('fire', 'game.Workspace.X')]) {
    assert.equal(T.refuseLuauIngress(src), null);
    assert.doesNotMatch(src, /while\s*\(?\s*(true|1)\s*\)?\s*do/);
    assert.doesNotMatch(src, /\brepeat\b/);
  }
});

test('an unknown effect and a hostile path are refused with nothing sent', async () => {
  for (const args of [
    { path: 'game.Workspace.X', effect: 'lens_flare' },
    { path: 'game.Workspace."]..x' },
    { path: '' },
    {},
  ]) {
    const { ctx, ops } = stubCtx();
    const res = await T.TOOLS.remove_effect.run(ctx, args);
    assert.ok(res.error, `not refused: ${JSON.stringify(args)}`);
    assert.equal(ops.length, 0, `reached Studio: ${JSON.stringify(args)}`);
  }
});

test('a real removal deletes only typed-tree children marked with AppleEffect', async () => {
  const { ctx, ops } = stubCtx((op) => op.op === 'get_tree' ? { ok: true, data: { root: { path: op.root, children: [
    { path: 'game.Workspace.Torch.Fire', class: 'ParticleEmitter', attributes: { AppleEffect: { t: 'string', v: 'fire' } } },
    { path: 'game.Workspace.Torch.FireLight', class: 'PointLight', attributes: { AppleEffect: { t: 'string', v: 'fire' } } },
    { path: 'game.Workspace.Torch.UserSmoke', class: 'ParticleEmitter', attributes: {} },
  ] } } } : { ok: true, data: { ok: true } });
  const res = await T.TOOLS.remove_effect.run(ctx, { path: 'game.Workspace.Torch', effect: 'fire' });
  assert.deepEqual(ops.map((op) => op.op), ['get_tree', 'delete_instances']);
  assert.deepEqual(ops[1].paths.sort(), ['game.Workspace.Torch.Fire', 'game.Workspace.Torch.FireLight']);
  assert.equal(res.removed, 2);
  assert.equal(ops.some((op) => op.op === 'run_code'), false);
});

test('NOTHING THERE is reported as nothing there, not as a removal', async () => {
  // "I removed it" for an instance that never had one is a claim about the world that is false,
  // and the model would report it to the user as a completed action.
  //
  // THIS TEST PASSED WHILE THE BRANCH WAS BROKEN. The fixture said `removed: 0`; the plugin sends
  // `removed: {t:"number",v:0}`, and `Number({t,v})` is NaN, so `Number.isFinite(removed)` was
  // false and this branch never ran in production. The stub agreed with the code and both
  // disagreed with the plugin.
  const { ctx } = stubCtx();
  const res = await T.TOOLS.remove_effect.run(ctx, { path: 'game.Workspace.Torch', effect: 'fire' });
  assert.equal(res.removed, 0);
  assert.match(res.note, /no fire on/);
});

test('remove_effect is offered with Studio and withheld without it', () => {
  assert.ok(T.toolDefs(true, undefined).map((d) => d.name).includes('remove_effect'));
  assert.equal(T.toolDefs(false, undefined).map((d) => d.name).includes('remove_effect'), false);
});

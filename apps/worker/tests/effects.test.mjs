/**
 * AMBIENT EFFECTS — the Luau has to compile, and it has to reference nothing.
 *
 * `add_effect` generates Luau and sends it to a user's open place through `run_code`. Two things
 * can go wrong there and neither of them raises anything the user would ever see:
 *
 *   1. The chunk does not parse. `handlers.run_code` errors, the effect never attaches, and the
 *      scene is simply inert — the same "nothing errored, it is just wrong" failure moodLuau's
 *      header describes. So every preset is compiled here with luau-analyze.
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
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
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

function stubCtx(answer = { ok: true, data: { attached: 1 } }) {
  const ops = [];
  return { ops, ctx: { env: {}, studioConnected: () => true, execStudioOp: async (o) => { ops.push(o); return answer; }, addMemoryFact: async () => {} } };
}

test('the catalogue is real and not empty', () => {
  assert.ok(FX.EFFECT_NAMES.length >= 8, `only ${FX.EFFECT_NAMES.length} presets`);
  for (const n of FX.EFFECT_NAMES) {
    const p = FX.EFFECTS[n];
    assert.ok(p.summary && p.use, `${n} must tell the model when to use it`);
    assert.ok(p.parts.length > 0, `${n} creates nothing`);
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
  for (const n of FX.EFFECT_NAMES) {
    for (const part of FX.EFFECTS[n].parts) {
      if (part.className !== 'ParticleEmitter') continue;
      assert.ok(part.props.Transparency, `${n} has no transparency ramp`);
      assert.match(part.props.Transparency, /NumberSequenceKeypoint\.new\(1,\s*1\)/, `${n} does not fade out`);
      assert.ok(part.props.Size, `${n} has no size ramp`);
      assert.ok(Number(part.props.Rate) <= 40, `${n} emits ${part.props.Rate}/s, which reads as a smoke machine`);
    }
  }
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

test('a real call sends exactly one run_code op and reports what it attached', async () => {
  const { ctx, ops } = stubCtx();
  const res = await T.TOOLS.add_effect.run(ctx, { effect: 'fire', path: 'game.Workspace.Torch' });
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op, 'run_code');
  assert.match(ops[0].code, /ParticleEmitter/);
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

test('a real removal sends one run_code op', async () => {
  // Paths.encode wraps every field, so this is what the plugin actually sends back.
  const { ctx, ops } = stubCtx({ ok: true, data: { result: {
    removed: { t: 'number', v: 2 }, effects: { t: 'string', v: 'fire' }, from: { t: 'string', v: 'game.Workspace.Torch' },
  } } });
  await T.TOOLS.remove_effect.run(ctx, { path: 'game.Workspace.Torch', effect: 'fire' });
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op, 'run_code');
  assert.match(ops[0].code, /AppleEffect/);
});

test('NOTHING THERE is reported as nothing there, not as a removal', async () => {
  // "I removed it" for an instance that never had one is a claim about the world that is false,
  // and the model would report it to the user as a completed action.
  //
  // THIS TEST PASSED WHILE THE BRANCH WAS BROKEN. The fixture said `removed: 0`; the plugin sends
  // `removed: {t:"number",v:0}`, and `Number({t,v})` is NaN, so `Number.isFinite(removed)` was
  // false and this branch never ran in production. The stub agreed with the code and both
  // disagreed with the plugin.
  const { ctx } = stubCtx({ ok: true, data: { result: {
    removed: { t: 'number', v: 0 }, effects: { t: 'string', v: '' }, from: { t: 'string', v: 'game.Workspace.Torch' },
  } } });
  const res = await T.TOOLS.remove_effect.run(ctx, { path: 'game.Workspace.Torch', effect: 'fire' });
  assert.equal(res.removed, 0);
  assert.match(res.note, /no fire on/);
});

test('remove_effect is offered with Studio and withheld without it', () => {
  assert.ok(T.toolDefs(true, undefined).map((d) => d.name).includes('remove_effect'));
  assert.equal(T.toolDefs(false, undefined).map((d) => d.name).includes('remove_effect'), false);
});

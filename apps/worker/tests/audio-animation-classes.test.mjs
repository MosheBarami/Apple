/**
 * create_instances AND THE AUDIO / ANIMATION / EXPLOSION CLASSES (plugin 1.5.0).
 *
 * Research note 07 found the Studio plugin could not create AudioPlayer, Wire, Animator, IKControl or Explosion at
 * all, so every audio and animation recipe had to go through a script. The plugin now allows them (apps/studpilot-plugin
 * Commands.luau; its Luau suite runs the real engine, including the Explosion defaults). These tests drive the REAL
 * worker tool through a stubbed execStudioOp and pin what the worker owes the plugin:
 *
 *   - every new class is accepted and forwarded with its name, parent and props intact;
 *   - a Wire's two ends (and an emitter's PositionInstance, the IKControl chain) travel as tagged Instance paths
 *     rooted at `game`, whether the model wrote a bare path, a tagged one or `Workspace.X`;
 *   - an AudioPlayer.Asset is held to the same rule as a Sound's SoundId (a library id, or one a search returned);
 *   - the worker does NOT write the Explosion defaults itself (the plugin owns them, so an explicit value is
 *     forwarded exactly), and the tool text says the default;
 *   - what stayed refused, stayed refused: UI classes, scripts, hand-made Sound and particle effects.
 *
 * Run with:  node --test tests/audio-animation-classes.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pluginPermissions } from '../../studpilot-plugin/scripts/api-dump.mjs';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(join(tmpdir(), 'audio-anim-'));
const bundle = (rel, name) => {
  const outfile = join(temp, `${name}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', rel), '--bundle', '--format=esm', '--target=es2022', '--platform=node', `--outfile=${outfile}`], { cwd: WORKER, stdio: 'pipe' });
  return pathToFileURL(outfile).href;
};
const T = await import(bundle('tools.ts', 'tools'));
const FX = await import(bundle('fx-library.ts', 'fx-library'));
const P = await import(bundle('studio-props.ts', 'studio-props'));
rmSync(temp, { recursive: true, force: true });

const COMMANDS = readFileSync(join(WORKER, '..', 'studpilot-plugin', 'src', 'Commands.luau'), 'utf8').replace(/--[^\n]*/g, '');

const ctxWith = (over = {}) => {
  const ops = [];
  return {
    ops,
    ctx: {
      env: {}, studioConnected: () => true, addMemoryFact: async () => 'refused',
      execStudioOp: async (op) => { ops.push(op); return { ok: true, data: { created: op.items?.map((i) => `${i.parent}.${i.name}`) ?? [] } }; },
      ...over,
    },
  };
};
const run = async (ctx, args) => {
  const r = await T.runTool(ctx, 'create_instances', JSON.stringify(args));
  return { ...r, data: JSON.parse(r.resultForLlm) };
};

const NEW_CLASSES = [
  'AudioPlayer', 'AudioEmitter', 'AudioListener', 'AudioDeviceOutput', 'Wire', 'AudioFader', 'AudioCompressor',
  'AudioReverb', 'AudioEqualizer', 'AudioFilter', 'AudioLimiter', 'Animator', 'AnimationController', 'Animation', 'IKControl', 'Explosion',
];
const libraryId = FX.findSounds('coin pickup')[0].assetId;

test('every new class is accepted by create_instances and forwarded to the plugin as written', async () => {
  for (const className of NEW_CLASSES) {
    const { ctx, ops } = ctxWith();
    const r = await run(ctx, { items: [{ className, name: `N${className}`, parent: 'game.Workspace.Speaker' }] });
    assert.equal(r.data.error, undefined, `${className}: ${r.resultForLlm}`);
    assert.equal(ops.length, 1, `${className} was not sent`);
    assert.equal(ops[0].op, 'create_instances');
    assert.deepEqual(ops[0].items, [{ className, name: `N${className}`, parent: 'game.Workspace.Speaker' }], `${className} was altered on the way`);
  }
});

test('every new class is one the plugin this worker is talking to will create', () => {
  // Plugin 2.0: the API dump decides (apps/studpilot-plugin/scripts/api-dump.mjs).
  const allowed = pluginPermissions().creatableNames;
  assert.deepEqual(NEW_CLASSES.filter((c) => !allowed.has(c)), [], 'the worker offers a class the plugin refuses');
});

test('the props of the new classes pass through typed, including nested children', async () => {
  const { ctx, ops } = ctxWith();
  const r = await run(ctx, {
    items: [{
      className: 'Part', name: 'Speaker', parent: 'game.Workspace', props: { Anchored: true },
      children: [
        { className: 'AudioEmitter', name: 'Emit', props: { DistanceAttenuationMode: 'Enum.DistanceAttenuationMode.InverseTapered', DistanceAttenuationBounds: { t: 'NumberRange', v: [6, 60] } } },
        { className: 'AudioReverb', name: 'Room', props: { DecayTime: 1.2, WetLevel: { t: 'number', v: -10 }, Bypass: false } },
      ],
    }],
  });
  assert.equal(r.data.error, undefined, r.resultForLlm);
  const [emit, room] = ops[0].items[0].children;
  assert.deepEqual(emit.props.DistanceAttenuationMode, { t: 'EnumItem', v: 'Enum.DistanceAttenuationMode.InverseTapered' });
  assert.deepEqual(emit.props.DistanceAttenuationBounds, { t: 'NumberRange', v: [6, 60] });
  assert.deepEqual(room.props, { DecayTime: { t: 'number', v: 1.2 }, WetLevel: { t: 'number', v: -10 }, Bypass: { t: 'bool', v: false } });
});

test('a Wire end is a tagged Instance path rooted at game, however the model spelled it', async () => {
  const { ctx, ops } = ctxWith();
  const r = await run(ctx, {
    items: [
      { className: 'Wire', name: 'A', parent: 'game.Workspace.Speaker', props: { SourceInstance: 'Workspace.Speaker.Player', TargetInstance: { t: 'Instance', v: 'workspace.Speaker.Emit' }, SourceName: 'Output', TargetName: 'Input' } },
      { className: 'Wire', name: 'B', parent: 'game.Workspace.Speaker', props: { SourceInstance: { path: 'game.SoundService.Music' }, TargetInstance: { t: 'Instance', v: 'game.SoundService.Out', o: [1] } } },
      { className: 'Wire', name: 'C', parent: 'game.Workspace.Speaker', props: { SourceInstance: 'read-ref:abc123', TargetInstance: 'game.Workspace.Speaker.Emit' } },
    ],
  });
  assert.equal(r.data.error, undefined, r.resultForLlm);
  const [a, b, c] = ops[0].items.map((i) => i.props);
  assert.deepEqual(a.SourceInstance, { t: 'Instance', v: 'game.Workspace.Speaker.Player' });
  assert.deepEqual(a.TargetInstance, { t: 'Instance', v: 'game.Workspace.Speaker.Emit' });
  assert.deepEqual(a.SourceName, { t: 'string', v: 'Output' });
  assert.deepEqual(b.SourceInstance, { t: 'Instance', v: 'game.SoundService.Music' });
  assert.deepEqual(b.TargetInstance, { t: 'Instance', v: 'game.SoundService.Out', o: [1] }, 'the sibling ordinals of a tagged reference are kept');
  assert.deepEqual(c.SourceInstance, { t: 'Instance', v: 'read-ref:abc123' }, 'a read reference is not a path to be rooted');
  assert.deepEqual(c.TargetInstance, { t: 'Instance', v: 'game.Workspace.Speaker.Emit' });
});

test('every reference property the plugin added is read as a reference, and plain strings elsewhere stay strings', () => {
  for (const name of ['SourceInstance', 'TargetInstance', 'PositionInstance', 'EndEffector', 'ChainRoot', 'Target', 'Pole']) {
    const r = P.normaliseProps({ [name]: 'Workspace.Rig.Hand' });
    assert.deepEqual(r.props[name], { t: 'Instance', v: 'game.Workspace.Rig.Hand' }, name);
    assert.equal(r.refusals.length, 0, name);
  }
  // the plugin types these as references (an Instance-valued property in the API dump); the worker must not invent one
  const PERM = pluginPermissions();
  const refClass = { SourceInstance: 'Wire', TargetInstance: 'Wire', PositionInstance: 'AudioEmitter', EndEffector: 'IKControl', ChainRoot: 'IKControl', Target: 'IKControl', Pole: 'IKControl' };
  for (const [name, cls] of Object.entries(refClass)) assert.equal(PERM.propertyType(cls, name), 'Instance', `${cls}.${name} is not a plugin reference property`);
  // Value is an ObjectValue reference but also a StringValue's text: it must stay a plain string here
  assert.deepEqual(P.normaliseProps({ Value: 'Workspace.Thing' }).props.Value, { t: 'string', v: 'Workspace.Thing' });
  // an enum item or an empty string in a reference slot is not turned into a path
  assert.deepEqual(P.normaliseProps({ Target: 'Enum.Material.Neon' }).props.Target, { t: 'EnumItem', v: 'Enum.Material.Neon' });
});

// Plugin 2.0 (owner, 2026-10-08): any Roblox audio id is accepted; what is no Roblox content id at all is refused.
test('an AudioPlayer.Asset must be a Roblox audio id, and nothing is sent otherwise', async () => {
  const bad = await ctxWith();
  const refused = await run(bad.ctx, { items: [{ className: 'AudioPlayer', name: 'Music', parent: 'game.Workspace', props: { Asset: { t: 'string', v: 'https://example.com/a.mp3' } } }] });
  assert.match(refused.data.error, /not a Roblox audio id/);
  assert.match(refused.data.error, /Asset/);
  assert.equal(bad.ops.length, 0, 'nothing may reach Studio');

  const nested = await ctxWith();
  const refusedChild = await run(nested.ctx, { items: [{ className: 'Part', name: 'P', parent: 'game.Workspace', children: [{ className: 'AudioPlayer', name: 'Music', props: { Asset: 'https://example.com/a.mp3' } }] }] });
  assert.match(refusedChild.data.error, /not a Roblox audio id/, 'a nested AudioPlayer is held to the same rule');
  assert.equal(nested.ops.length, 0);

  const good = ctxWith();
  const accepted = await run(good.ctx, { items: [{ className: 'AudioPlayer', name: 'Music', parent: 'game.Workspace', props: { Asset: { t: 'string', v: `rbxassetid://${libraryId}` }, Volume: 0.4, Looping: true } }] });
  assert.equal(accepted.data.error, undefined, accepted.resultForLlm);
  assert.deepEqual(good.ops[0].items[0].props.Asset, { t: 'string', v: `rbxassetid://${libraryId}` });
  assert.deepEqual(good.ops[0].items[0].props.Looping, { t: 'bool', v: true });

  const found = ctxWith({ discoveredAssetIds: new Set([987654321]) });
  const viaSearch = await run(found.ctx, { items: [{ className: 'AudioPlayer', name: 'Music', parent: 'game.Workspace', props: { Asset: 'rbxassetid://987654321' } }] });
  assert.equal(viaSearch.data.error, undefined, viaSearch.resultForLlm);
  assert.equal(found.ops.length, 1);

  const cleared = ctxWith();
  assert.equal((await run(cleared.ctx, { items: [{ className: 'AudioPlayer', name: 'Music', parent: 'game.Workspace', props: { Asset: '' } }] })).data.error, undefined, 'clearing the asset is not a refusal');

  const anim = ctxWith();
  const animation = await run(anim.ctx, { items: [{ className: 'Animation', name: 'Wave', parent: 'game.Workspace.Rig', props: { AnimationId: 'rbxassetid://5555' } }] });
  assert.equal(animation.data.error, undefined, 'an animation id is the owner\'s or the catalog\'s, not a library sound: it is left to the plugin');
  assert.deepEqual(anim.ops[0].items[0].props.AnimationId, { t: 'string', v: 'rbxassetid://5555' });
});

test('the worker forwards an Explosion exactly as written: the plugin owns the harmless defaults, and an explicit value stands', async () => {
  const { ctx, ops } = ctxWith();
  const r = await run(ctx, {
    items: [
      { className: 'Explosion', name: 'Plain', parent: 'game.Workspace' },
      { className: 'Explosion', name: 'Loud', parent: 'game.Workspace', props: { BlastPressure: 500000, DestroyJointRadiusPercent: 1, BlastRadius: 20 } },
    ],
  });
  assert.equal(r.data.error, undefined, r.resultForLlm);
  assert.equal(ops[0].items[0].props, undefined, 'the worker must not invent props the plugin would then have to tell from explicit ones');
  assert.deepEqual(ops[0].items[1].props, { BlastPressure: { t: 'number', v: 500000 }, DestroyJointRadiusPercent: { t: 'number', v: 1 }, BlastRadius: { t: 'number', v: 20 } });
  // and the plugin side of the same promise, pinned where it can be read here (the executable proof is studpilot-plugin/tests/commands.test.mjs)
  assert.match(COMMANDS, /className == "Explosion" then\s+if props\.BlastPressure == nil then props\.BlastPressure = 0 end\s+if props\.DestroyJointRadiusPercent == nil then props\.DestroyJointRadiusPercent = 0 end/);
});

test('the tool text names the new classes, the reference rule and the Explosion default in one sentence', () => {
  const def = T.toolDefs(true).find((d) => d.name === 'create_instances');
  const sentence = def.description.split('. ').find((s) => /Explosion/.test(s));
  assert.ok(sentence, 'no sentence mentions Explosion');
  for (const word of ['AudioPlayer', 'Wire', 'SourceInstance', 'TargetInstance', 'Animator', 'Animation', 'IKControl', 'BlastPressure', 'DestroyJointRadiusPercent']) assert.ok(sentence.includes(word), `${word} missing from: ${sentence}`);
  assert.match(sentence, /default to 0/);
  assert.equal(def.description.split('. ').filter((s) => /Explosion/.test(s)).length, 1, 'the update must be one sentence');
});

test('what was refused stays refused next to the new classes', async () => {
  for (const [className, pattern] of [
    ['ScreenGui', /Refused \(D-UIONLY-1\)|insert_ui_component/],
    ['Frame', /Refused \(D-UIONLY-1\)|insert_ui_component/],
    ['Script', /edit_script/],
    ['ModuleScript', /edit_script/],
    ['Sound', /Refused \(D-FXLIB-1\)/],
    ['ParticleEmitter', /Refused \(D-FXLIB-1\)/],
  ]) {
    const { ctx, ops } = ctxWith();
    const r = await run(ctx, { items: [{ className, name: 'X', parent: 'game.Workspace' }, { className: 'Explosion', name: 'E', parent: 'game.Workspace' }] });
    assert.match(r.data.error ?? '', pattern, `${className} was not refused`);
    assert.equal(ops.length, 0, `${className} reached Studio next to an Explosion`);
  }
});

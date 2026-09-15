// The audio tools, EXECUTED through the real dispatcher, plus the route that serves what they make.
//
// A tool can be wrong in three ways that unit tests of its module never see, and all three have
// bitten this repository before:
//
//   1. IT IS NOT REGISTERED. A tool defined in a file nothing spreads into TOOLS is a tool the model
//      can never call. So these go through `runTool` by name, not through the implementation.
//   2. ITS PAYLOAD IS DROPPED. `detailForUi` and `capUiDetail` silently discard anything oversized
//      or unserialisable, and the web app's validator refuses anything it does not recognise — so a
//      panel can be built, sent, and never rendered. The panel here is validated against the WEB
//      APP'S OWN validator, imported from apps/web.
//   3. ITS DESCRIPTION PROMISES SOMETHING THE CODE DOES NOT DO. For this cluster that is one
//      specific claim: nothing here puts audio into the user's Roblox place, and a description that
//      implies otherwise produces a user who is told the sound is in their game, hears nothing, and
//      gets no error — because a SoundId that does not resolve plays silently.
//
// Run with:  node --test tests/audio-tools.test.mjs      (from apps/worker)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const REPO = join(WORKER, '..', '..');
const built = [];
async function bundle(entry, tag) {
  const out = join(tmpdir(), `apple-${tag}-${process.pid}.mjs`);
  await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', target: 'es2022', outfile: out });
  built.push(out);
  return import(pathToFileURL(out).href);
}

const T = await bundle(join(WORKER, 'src', 'tools.ts'), 'audiotools');
const STORE = await bundle(join(WORKER, 'src', 'audio-store.ts'), 'audiostore');
const SD = await bundle(join(WORKER, 'src', 'sound-design.ts'), 'audiosd');
const UI = await bundle(join(REPO, 'apps', 'web', 'src', 'lib', 'generative-ui', 'validate.ts'), 'uivalidate');
process.on('exit', () => { for (const f of built) rmSync(f, { force: true }); });

const AUDIO_TOOL_NAMES = ['design_sound', 'assign_sounds', 'generate_sound', 'speak_line'];

/* --------------------------------------------------------------------------- the stubs ---- */

const DEFAULT_PROJECT = '11111111-1111-4111-8111-111111111111';

// `projectId` is read with `in` rather than through a default parameter, because a default
// parameter fires on an EXPLICIT undefined too: `ctxWith({ projectId: undefined })` would have
// silently handed back the default project and the two "with no project" tests below would have
// been testing the healthy path while claiming to test the absence. They were, until this line.
function ctxWith(opts = {}) {
  const { studio = true, opResult = { ok: true, data: { ok: true } }, ai } = opts;
  const projectId = 'projectId' in opts ? opts.projectId : DEFAULT_PROJECT;
  const ops = [];
  const kv = new Map();
  const budget = [];
  const ctx = {
    env: {
      AI: { async run(model, payload) { return ai ? ai(model, payload) : { audio: '' }; } },
      KV: {
        async put(key, value, opts) { kv.set(key, { value, metadata: opts?.metadata ?? null }); },
        async getWithMetadata(key) { return kv.get(key) ?? { value: null, metadata: null }; },
      },
      BUDGET_DO: {
        idFromName: (n) => n,
        get: () => ({
          async fetch(url, init) {
            const body = JSON.parse(init.body);
            budget.push({ path: new URL(url).pathname, ...body });
            return new Response(JSON.stringify({ ok: true, reserved: body.neurons }), { status: 200 });
          },
        }),
      },
    },
    projectId,
    studioConnected: () => studio,
    async execStudioOp(op) { ops.push(op); return opResult; },
    async createCheckpoint() { return { error: 'not in this test' }; },
    async addMemoryFact() {},
  };
  return { ctx, ops, kv, budget };
}

const call = async (ctx, name, args) => {
  const r = await T.runTool(ctx, name, JSON.stringify(args ?? {}));
  return { ...r, parsed: JSON.parse(r.resultForLlm) };
};

/* ================================================================ they are registered === */

test('EVERY audio tool is registered in TOOLS and reachable by name', () => {
  // The whole point of going through the dispatcher. A tool in a file nothing imports is
  // unreachable, and no test of that file could ever notice.
  const names = T.toolNames();
  for (const name of AUDIO_TOOL_NAMES) assert.ok(names.includes(name), `${name} is not in TOOLS — the model can never call it`);
  // And no duplicate registration: a spread that collided with an existing key would silently
  // replace a tool that already worked.
  assert.equal(new Set(names).size, names.length, 'a tool name is registered twice');
});

test('the Studio tools are offered only when Studio is connected', () => {
  const withStudio = T.toolDefs(true).map((d) => d.name);
  const without = T.toolDefs(false).map((d) => d.name);
  for (const name of ['design_sound', 'assign_sounds']) {
    assert.ok(withStudio.includes(name), `${name} is missing with Studio connected`);
    assert.ok(!without.includes(name), `${name} is offered with no Studio to run it in`);
  }
  for (const name of ['generate_sound', 'speak_line']) {
    assert.ok(without.includes(name), `${name} needs no Studio but is hidden without it`);
  }
});

test('every audio tool has a schema the model can fill in', () => {
  const defs = Object.fromEntries(T.toolDefs(true).map((d) => [d.name, d]));
  for (const name of AUDIO_TOOL_NAMES) {
    const def = defs[name];
    assert.ok(def.description.length > 200, `${name} has a ${def.description.length}-character description`);
    assert.equal(def.parameters.type, 'object');
    assert.ok(Object.keys(def.parameters.properties).length > 0, `${name} takes no arguments`);
  }
  // The enums the model picks from must be the real catalogues, not a stale copy.
  assert.deepEqual(defs.design_sound.parameters.properties.environment.enum, SD.ENVIRONMENT_NAMES);
  assert.deepEqual(defs.assign_sounds.parameters.properties.assignments.items.properties.bus.enum, SD.BUS_NAMES);
});

/* ======================================================= the promise they must not make === */

test('NO audio tool description claims the audio ends up in the game — and two say the opposite', () => {
  // The specific lie this cluster could tell. It is worse for audio than for images: a Sound whose
  // SoundId does not resolve plays SILENTLY rather than erroring, so a user told "it is in your
  // game" hears nothing and gets no error anywhere.
  const defs = Object.fromEntries(T.toolDefs(true).map((d) => [d.name, d]));
  for (const name of ['generate_sound', 'speak_line']) {
    const d = defs[name].description;
    assert.match(d, /NOT in their game|not in their game|NOT be in|nothing in this product uploads|does not place/i, `${name} never tells the model the audio is not placed`);
    assert.ok(!/\bplaced in (the|your) game\b/i.test(d) || /never tell/i.test(d), `${name} claims the audio is placed`);
  }
  // design_sound makes the other honest disclaimer: it configures audio and supplies none.
  assert.match(defs.design_sound.description, /does not add any audio|very well-designed silence/i);
  assert.match(defs.assign_sounds.description, /never writes a SoundId|plays silently/i);
});

test('the results carry placedInGame: false, so the model cannot infer otherwise from the data', async () => {
  const { ctx } = ctxWith();
  const r = await call(ctx, 'generate_sound', { preset: 'ui_click' });
  assert.equal(r.ok, true, r.resultForLlm);
  assert.equal(r.parsed.placedInGame, false);
  assert.match(r.parsed.note, /NOT in their Roblox place/);
});

/* ================================================================== generate_sound === */

test('generate_sound renders, stores a real WAV, and reports what it made', async () => {
  const { ctx, kv } = ctxWith();
  const r = await call(ctx, 'generate_sound', { preset: 'footstep_gravel', seed: 3 });
  assert.equal(r.ok, true, r.resultForLlm);
  assert.equal(r.parsed.preset, 'footstep_gravel');
  assert.ok(r.parsed.seconds > 0.2 && r.parsed.seconds < 1);
  assert.ok(r.parsed.bytes > 1000, `stored ${r.parsed.bytes} bytes`);

  const key = STORE.audioKvKey(ctx.projectId, r.parsed.audioId);
  const stored = kv.get(key);
  assert.ok(stored, `nothing was written to ${key}`);
  assert.equal(stored.metadata.contentType, 'audio/wav');
  assert.ok(stored.metadata.expiresAt > Math.floor(Date.now() / 1000), 'the stored object has no future expiry');
  // Real bytes, checked at the container level: the first four are "RIFF".
  const head = atob(stored.value.slice(0, 8));
  assert.equal(head.slice(0, 4), 'RIFF', 'what was stored is not a WAV');
});

test('the same seed twice stores the same bytes; a different seed does not', async () => {
  const { ctx, kv } = ctxWith();
  const a = await call(ctx, 'generate_sound', { preset: 'combat_impact_metal', seed: 5 });
  const b = await call(ctx, 'generate_sound', { preset: 'combat_impact_metal', seed: 5 });
  const c = await call(ctx, 'generate_sound', { preset: 'combat_impact_metal', seed: 6 });
  const bytes = (id) => kv.get(STORE.audioKvKey(ctx.projectId, id)).value;
  assert.equal(bytes(a.parsed.audioId), bytes(b.parsed.audioId), 'the same seed produced different audio');
  assert.notEqual(bytes(a.parsed.audioId), bytes(c.parsed.audioId), 'the seed does nothing');
});

test('generate_sound refuses a description, and says what it actually is', async () => {
  const { ctx } = ctxWith();
  const r = await call(ctx, 'generate_sound', { preset: 'a dragon eating a bell' });
  assert.equal(r.ok, false);
  assert.match(r.parsed.error, /recipes, not descriptions/);
});

test('with no project, generate_sound refuses BEFORE doing the work', async () => {
  // generate_image does this check after generating and pays for a result nobody can retrieve; its
  // own comment calls that worth a follow-up. Nothing here costs neurons, but the ordering is the
  // point: a tool that cannot deliver should not do the work.
  const { ctx } = ctxWith({ projectId: undefined });
  const r = await call(ctx, 'generate_sound', { preset: 'ui_click' });
  assert.equal(r.ok, false);
  assert.match(r.parsed.error, /needs a project/);
});

/* ======================================================================= the panel === */

test("the panel VALIDATES against the web app's own validator — not against a copy of its rules", async () => {
  // The failure this catches is invisible from the worker: a panel that is built, sent, and then
  // dropped by the client because a field is not in the schema. Importing the real validator is
  // what makes this a test of the contract rather than of my memory of it.
  const { ctx } = ctxWith();
  let captured;
  const original = ctx.env.KV.put.bind(ctx.env.KV);
  ctx.env.KV.put = original;
  const r = await T.runTool(ctx, 'generate_sound', JSON.stringify({ preset: 'ambience_wind' }));
  captured = r.detail;
  assert.ok(captured, 'the tool produced no UI payload at all, so the user hears nothing');

  const result = UI.validateDocument(captured);
  assert.ok(result.ok, `the panel is invalid: ${JSON.stringify(result.errors ?? result).slice(0, 400)}`);
  const block = result.doc.blocks[0];
  assert.equal(block.type, 'asset_picker');
  assert.equal(block.assets[0].kind, 'sound');
  // The waveform survived validation, which means `isSafeImageSrc` accepted it. An SVG would not
  // have, and the preview would have vanished silently.
  assert.ok(block.assets[0].thumbnail, 'the waveform was dropped by the validator');
  assert.match(block.assets[0].thumbnail.src, /^data:image\/png;base64,/);
  // And the AUDIO is referenced by path, never inlined: a ten-second WAV as a data URL is far past
  // the payload cap and would take the whole panel with it.
  assert.equal(block.assets[0].link.href, STORE.audioPathFor(ctx.projectId, r.detail.blocks[0].assets[0].id));
  assert.ok(!JSON.stringify(captured).includes('data:audio'), 'the audio bytes were inlined into the panel');
});

test('the waveform in the panel is drawn from THIS clip, not from a fixed image', async () => {
  // Two clips with very different envelopes must produce different pixels. A placeholder waveform
  // is the most plausible way this feature could look finished and be fake.
  const { ctx } = ctxWith();
  const click = await T.runTool(ctx, 'generate_sound', JSON.stringify({ preset: 'ui_click' }));
  const bed = await T.runTool(ctx, 'generate_sound', JSON.stringify({ preset: 'ambience_rain' }));
  const src = (r) => r.detail.blocks[0].assets[0].thumbnail.src;
  assert.notEqual(src(click), src(bed), 'both clips drew the same waveform');
});

/* ================================================================== design_sound === */

test('design_sound sends a run_code op carrying the generated chunk', async () => {
  const { ctx, ops } = ctxWith();
  const r = await call(ctx, 'design_sound', { environment: 'cave' });
  assert.equal(r.ok, true, r.resultForLlm);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op, 'run_code');
  assert.match(ops[0].code, /Enum\.ReverbType\.Cave/);
  assert.match(ops[0].code, /SoundGroup/);
  assert.ok(!/rbxassetid/i.test(ops[0].code), 'the chunk references an asset');
  assert.deepEqual(r.parsed.buses, [...SD.BUS_NAMES]);
});

test('an unknown environment never reaches Studio', async () => {
  const { ctx, ops } = ctxWith();
  const r = await call(ctx, 'design_sound', { environment: 'haunted' });
  assert.equal(r.ok, false);
  assert.equal(ops.length, 0, 'a refused environment still ran code in the user\'s place');
  assert.match(r.parsed.error, /cave/);
});

test('a Studio failure is passed through rather than reported as success', async () => {
  const { ctx } = ctxWith({ opResult: { ok: false, error: 'Studio disconnected' } });
  const r = await call(ctx, 'design_sound', { environment: 'dry' });
  assert.equal(r.ok, false);
  assert.match(r.parsed.error, /Studio disconnected/);
});

/* ================================================================== assign_sounds === */

test('assign_sounds passes the chunk through and never writes an asset id', async () => {
  const { ctx, ops } = ctxWith({ opResult: { ok: true, data: { assigned: 2, missing: [] } } });
  const r = await call(ctx, 'assign_sounds', {
    assignments: [
      { path: 'game.Workspace.Forge.Crackle', bus: 'SFX', volumeDb: -3 },
      { path: 'game.Workspace.Wind', bus: 'Ambience', looped: true, maxDistance: 400 },
    ],
  });
  assert.equal(r.ok, true, r.resultForLlm);
  assert.equal(r.parsed.assigned, 2);
  assert.ok(!/SoundId\s*=/.test(ops[0].code), 'the chunk assigns a SoundId');
});

test('a bad path or bus is refused before any code runs in the place', async () => {
  const { ctx, ops } = ctxWith();
  for (const assignments of [
    [{ path: 'Workspace.Thing', bus: 'SFX' }],
    [{ path: 'game.Workspace.X', bus: 'Master' }],
    [{ path: 'game.Workspace.X', bus: 'SFX', minDistance: 500, maxDistance: 10 }],
  ]) {
    const r = await call(ctx, 'assign_sounds', { assignments });
    assert.equal(r.ok, false, JSON.stringify(assignments));
  }
  assert.equal(ops.length, 0);
});

test('the missing list survives the dispatcher, so a partial assignment reads as partial', async () => {
  const { ctx } = ctxWith({ opResult: { ok: true, data: { assigned: 1, missing: ['game.Workspace.Gone'] } } });
  const r = await call(ctx, 'assign_sounds', { assignments: [{ path: 'game.Workspace.Gone', bus: 'SFX' }] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.parsed.missing, ['game.Workspace.Gone']);
});

/* ===================================================================== speak_line === */

const MP3_FIXTURE = (() => {
  // Twenty real MPEG-1 Layer III frame headers at 128 kbps / 44.1 kHz, so the duration the tool
  // reports is one it measured rather than one it assumed.
  const frameBytes = Math.floor((1152 / 8) * (128_000 / 44_100));
  const out = new Uint8Array(frameBytes * 20);
  for (let f = 0; f < 20; f++) {
    const at = f * frameBytes;
    out[at] = 0xff; out[at + 1] = 0xfb; out[at + 2] = 9 << 4; out[at + 3] = 0xc0;
  }
  return Buffer.from(out).toString('base64');
})();

test('speak_line synthesises, stores an MP3, and reports the duration it MEASURED', async () => {
  const seen = [];
  const { ctx, kv, budget } = ctxWith({
    ai: (model, payload) => { seen.push({ model, payload }); return { audio: MP3_FIXTURE }; },
  });
  const r = await call(ctx, 'speak_line', { text: 'The gate is open. Go north.', preset: 'guide' });
  assert.equal(r.ok, true, r.resultForLlm);
  assert.equal(r.parsed.measured, 'decoded', 'the duration was estimated even though the MP3 was readable');
  assert.ok(Math.abs(r.parsed.seconds - 20 * (1152 / 44100)) < 0.01);
  assert.equal(r.parsed.voiceSelected, false, 'the result claims a voice was chosen on an engine with none');

  const stored = kv.get(STORE.audioKvKey(ctx.projectId, r.parsed.audioId));
  assert.equal(stored.metadata.contentType, 'audio/mpeg');
  assert.equal(seen.length, 1, 'the speech engine was called a different number of times than once');
  assert.equal(seen[0].payload.lang, 'en');
  // Budget: reserved before the call, settled after. Never released on a successful call.
  assert.deepEqual(budget.map((b) => b.path), ['/reserve', '/settle']);
});

test('the preset shaping is what reaches the engine, and the result says what was spoken', async () => {
  const seen = [];
  const { ctx } = ctxWith({ ai: (model, payload) => { seen.push(payload); return { audio: MP3_FIXTURE }; } });
  const runOn = 'go to the tower and climb the stairs and open the chest and take the key and come back before dark';
  const r = await call(ctx, 'speak_line', { text: runOn, preset: 'announcer' });
  assert.equal(r.ok, true);
  assert.equal(seen[0].prompt, r.parsed.spokenText, 'the result reports text the engine was not sent');
  assert.notEqual(seen[0].prompt, runOn, 'the preset shaped nothing');
});

test('speak_line refuses empty, wordless and over-long text without calling the engine', async () => {
  const seen = [];
  const { ctx, budget } = ctxWith({ ai: (m, p) => { seen.push(p); return { audio: MP3_FIXTURE }; } });
  for (const text of ['', '   ', '!!! ??? ...', 'x'.repeat(2000)]) {
    const r = await call(ctx, 'speak_line', { text });
    assert.equal(r.ok, false, `"${text.slice(0, 12)}" was synthesised`);
  }
  assert.equal(seen.length, 0, 'a refused line reached the engine');
  assert.equal(budget.length, 0, 'a refused line reserved budget');
});

test('an asset id in the dialogue is refused rather than read aloud', async () => {
  const { ctx } = ctxWith({ ai: () => ({ audio: MP3_FIXTURE }) });
  const r = await call(ctx, 'speak_line', { text: 'rbxassetid://9046863579' });
  assert.equal(r.ok, false);
  assert.equal(r.parsed.reason, 'asset_id');
});

test('with no project, speak_line refuses BEFORE spending anything', async () => {
  const seen = [];
  const { ctx, budget } = ctxWith({ projectId: undefined, ai: (m, p) => { seen.push(p); return { audio: MP3_FIXTURE }; } });
  const r = await call(ctx, 'speak_line', { text: 'hello there' });
  assert.equal(r.ok, false);
  assert.match(r.parsed.error, /needs a project/);
  assert.equal(budget.length, 0, 'budget was reserved for audio nobody could ever retrieve');
  assert.equal(seen.length, 0);
});

test('an engine failure is scrubbed of the engine\'s identity before it reaches the model', async () => {
  // §1 of the product rules: provider and model identity are implementation details. The dispatcher
  // scrubs, and this asserts the audio path actually goes through it.
  const { ctx } = ctxWith({ ai: () => { throw new Error('AiError: 3040: Request failed for model @cf/myshell-ai/melotts'); } });
  const r = await call(ctx, 'speak_line', { text: 'hello there' });
  assert.equal(r.ok, false);
  assert.ok(!/melotts|@cf\//i.test(r.resultForLlm), `the model id leaked: ${r.resultForLlm}`);
  assert.ok(!/melotts|@cf\//i.test(r.summary), `the model id leaked into the summary: ${r.summary}`);
});

/* ================================================================== the audio store === */

test('the stored content type is an ALLOWLIST, not whatever was handed in', async () => {
  // The value ends up in a Content-Type header. `text/html` there turns an authenticated URL on our
  // own origin into a page that runs script.
  assert.equal(STORE.servableAudioType('audio/wav'), 'audio/wav');
  assert.equal(STORE.servableAudioType('audio/mpeg; charset=utf-8'), 'audio/mpeg');
  assert.equal(STORE.servableAudioType('AUDIO/WAV'), 'audio/wav');
  for (const bad of ['text/html', 'image/svg+xml', 'application/javascript', 'audio/webm', '', null, 42, '__proto__', 'constructor']) {
    assert.equal(STORE.servableAudioType(bad), null, `${String(bad)} was accepted as a servable type`);
  }
});

test('a type the route will not serve is never even stored', async () => {
  const { ctx, kv } = ctxWith();
  const id = await STORE.storeAudio(ctx.env, 'AAAA', ctx.projectId, 'text/html');
  assert.equal(id, null, 'an unservable type was stored anyway');
  assert.equal(kv.size, 0);
});

test('the key is scoped to the project — that scoping IS the authorisation', () => {
  const a = STORE.audioKvKey('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'x');
  const b = STORE.audioKvKey('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'x');
  assert.notEqual(a, b, 'the same audio id in two projects is the same key');
  assert.ok(a.includes('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
});

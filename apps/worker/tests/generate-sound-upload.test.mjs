// Handoff 2026-10-09 section 8: a sound effect must reach the game. generate_sound with upload:true puts the synthesised
// WAV into the person's own Roblox account and returns a SoundId; without it, nothing is uploaded.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const STUB = pathToFileURL(join(HERE, 'stubs', 'own-upload.mjs')).href;
const OUT = join(tmpdir(), `studpilot-gensound-${process.pid}.mjs`);
await esbuild.build({
  entryPoints: [join(HERE, '..', 'src', 'audio-tools.ts')],
  bundle: true, format: 'esm', target: 'es2022', outfile: OUT,
  plugins: [{ name: 'stub', setup(b) {
    b.onResolve({ filter: /^\.\/own-upload$/ }, () => ({ path: STUB, external: true }));
    b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: join(HERE, 'stubs', 'cloudflare-workers.mjs') }));
  } }],
});
const { AUDIO_TOOLS } = await import(`file://${OUT}`);
const stub = await import(STUB);
process.on('exit', () => rmSync(OUT, { force: true }));

const kv = new Map();
const ctx = (userId) => ({ projectId: 'p1', userId, env: { KV: { put: async (k, v) => kv.set(k, v), get: async (k) => kv.get(k) } } });
const preset = AUDIO_TOOLS.generate_sound.def.parameters.properties.preset.enum[0];

test('upload:true returns a SoundId from the person\'s own account', async () => {
  stub.calls.length = 0;
  const out = await AUDIO_TOOLS.generate_sound.run(ctx('u1'), { preset, upload: true, name: 'Coin pickup' });
  assert.equal(out.soundId, 'rbxassetid://4242');
  assert.deepEqual(stub.calls.map((c) => [c.userId, c.contentType, c.type, c.name]), [['u1', 'audio/wav', 'Audio', 'Coin pickup']]);
  assert.ok(stub.calls[0].bytes > 44, 'a real WAV, not a header');
});

test('without upload, or when the upload fails, nothing claims to be in the game', async () => {
  stub.calls.length = 0;
  const plain = await AUDIO_TOOLS.generate_sound.run(ctx('u1'), { preset });
  assert.equal(stub.calls.length, 0);
  assert.equal(plain.soundId, undefined);
  assert.equal(plain.placedInGame, false);
  stub.setAnswer({ error: 'uploads not connected' });
  const failed = await AUDIO_TOOLS.generate_sound.run(ctx('u1'), { preset, upload: true });
  assert.equal(failed.soundId, undefined);
  assert.equal(failed.uploadError, 'uploads not connected');
  stub.setAnswer({ assetId: 4242 });
});

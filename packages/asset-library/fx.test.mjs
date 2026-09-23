/**
 * THE SOUND AND EFFECT LIBRARY (D-FXLIB-1) IS WHAT IS ON DISK, AND EVERY ROW OF IT RESOLVES.
 *
 *   - the four generated files are exactly what build-fx-manifest.mjs derives from disk now;
 *   - the library is not empty (a test over an empty catalogue checks nothing);
 *   - every row resolves: a playable Roblox asset id, a committed file, a store file kept on this
 *     machine only (gitignored), or a reference with a source URL; and every row has a licence;
 *   - the categories and presets a game needs are present;
 *   - every engine texture a preset names is on the plugin's allowlist, read from the plugin with
 *     comments stripped, and every packTexture is a committed file;
 *   - committed pack files stay under 50 MB, and the store directories are gitignored;
 *   - every downloaded Roblox model file carries a scan verdict, and none that holds a script is
 *     marked usable.
 *
 * Run with:  node --test fx.test.mjs      (from packages/asset-library)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build-fx-manifest.mjs';
import { PRESETS, ENGINE_TEXTURES } from './vfx/presets.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(HERE, '..', '..');
const read = (rel) => JSON.parse(readFileSync(join(HERE, rel), 'utf8'));
const out = build();

test('the generated files are what the build derives from disk now', () => {
  assert.deepEqual(read('sfx/manifest.json'), out.sfxManifest, 'sfx/manifest.json is stale: run node build-fx-manifest.mjs');
  assert.deepEqual(read('sfx/index.json'), out.sfxIndex, 'sfx/index.json is stale');
  assert.deepEqual(read('vfx/manifest.json'), out.vfxManifest, 'vfx/manifest.json is stale');
  assert.deepEqual(read('vfx/index.json'), out.vfxIndex, 'vfx/index.json is stale');
});

test('the library is not empty', () => {
  const t = out.sfxManifest.totals;
  assert.ok(t.byUse.play > 10000, `only ${t.byUse.play} playable sounds`);
  assert.ok(out.sfxIndex.rows.length > 10000);
  assert.ok((t.byUse['upload-source'] ?? 0) > 100, 'no committed CC0 sound files');
  assert.ok(PRESETS.length >= 20, `only ${PRESETS.length} presets`);
  assert.ok(out.vfxIndex.textures.length > 100, 'no committed CC0 effect textures');
});

const https = (u) => typeof u === 'string' && /^https:\/\/[^\s]+$/.test(u);
const storeHere = (dir) => existsSync(join(HERE, dir)) && readdirSync(join(HERE, dir)).length > 0;

function resolves(row, kind) {
  const where = `${kind} ${row.id}`;
  assert.ok(typeof row.license === 'string' && row.license.length > 0, `${where}: no licence`);
  assert.ok(https(row.sourceUrl) || row.use === 'upload-source' || row.use === 'engine', `${where}: no source URL`);
  switch (row.use) {
    case 'play':
    case 'by-id':
      assert.ok(Number.isInteger(row.assetId) && row.assetId > 0, `${where}: asset id ${row.assetId}`);
      break;
    case 'upload-source':
      assert.ok(row.file.startsWith(`${kind}/packs/`), `${where}: ${row.file}`);
      assert.ok(existsSync(join(HERE, row.file)), `${where}: ${row.file} is missing`);
      break;
    case 'store-only':
      assert.ok(row.file.startsWith(`${kind}-store/`), `${where}: a non-redistributable file outside the gitignored store: ${row.file}`);
      if (storeHere(`${kind}-store`)) assert.ok(existsSync(join(HERE, row.file)), `${where}: ${row.file} is missing from the store`);
      break;
    case 'reference-only':
      assert.ok(https(row.sourceUrl), `${where}: a reference with no URL`);
      break;
    case 'engine':
      assert.match(row.texture, /^rbxasset:\/\/textures\/particles\//, where);
      break;
    default:
      assert.fail(`${where}: unknown use ${row.use}`);
  }
}

test('every sound row resolves to an id, a file or a page, with a licence', () => {
  assert.ok(out.rows.sfx.length > 10000);
  for (const row of out.rows.sfx) resolves(row, 'sfx');
  const ids = out.rows.sfx.filter((r) => r.assetId).map((r) => r.assetId);
  assert.equal(new Set(ids).size, ids.length, 'a Roblox audio id is listed twice');
});

test('every effect row resolves to an id, a file or a page, with a licence', () => {
  assert.ok(out.rows.vfx.length > 100);
  for (const row of out.rows.vfx) resolves(row, 'vfx');
});

test('the categories and presets a game needs are present', () => {
  const index = new Map();
  for (const r of out.sfxIndex.rows) index.set(r[2], (index.get(r[2]) ?? 0) + 1);
  for (const c of ['ui_click', 'coin', 'reward', 'purchase', 'win', 'lose', 'jump', 'footsteps', 'hit', 'sword', 'gun', 'explosion', 'magic', 'door', 'water', 'ambient', 'music', 'notification', 'whoosh', 'pop']) {
    assert.ok((index.get(c) ?? 0) >= 20, `the bundled index has only ${index.get(c) ?? 0} "${c}" sounds`);
  }
  const names = new Set(PRESETS.map((p) => p.name));
  for (const p of ['coin_burst', 'sparkle_shimmer', 'level_up_aura', 'rebirth_pillar', 'fire', 'smoke', 'explosion', 'magic_hit', 'heal', 'portal', 'water_splash', 'dust_trail', 'speed_trail', 'confetti', 'pet_hatch', 'egg_glow', 'lightning', 'snow', 'rain', 'fireflies']) {
    assert.ok(names.has(p), `missing preset ${p}`);
  }
  const classes = new Set(PRESETS.flatMap((p) => p.parts.map((x) => x.className)));
  for (const c of ['ParticleEmitter', 'Beam', 'Trail', 'Highlight']) assert.ok(classes.has(c), `no preset uses ${c}`);
  assert.ok(PRESETS.some((p) => p.attachments?.length), 'no preset places Attachments');
});

test('preset textures are on the plugin allowlist, and every packTexture is a committed file', () => {
  const commands = readFileSync(join(ROOT, 'apps', 'apple-plugin', 'src', 'Commands.luau'), 'utf8')
    .replace(/--\[(=*)\[[\s\S]*?\]\1\]/g, '').replace(/--[^\n]*/g, '');
  const block = /CONTENT_PROPERTY\.Texture\.ParticleEmitter = \{([\s\S]*?)\n\}/.exec(commands);
  assert.ok(block, 'the plugin engine-texture list was not found — this test would check nothing');
  const allowed = new Set([...block[1].matchAll(/\["([^"]+)"\]\s*=\s*true/g)].map((m) => m[1]));
  assert.ok(allowed.size >= 8);
  for (const path of Object.values(ENGINE_TEXTURES)) assert.ok(allowed.has(path), `the plugin refuses ${path}`);
  let seen = 0;
  for (const p of PRESETS) {
    for (const part of p.parts) {
      const tex = part.props.Texture?.v;
      if (tex) {
        seen++;
        const m = /^rbxasset:\/\/textures\/(.+)$/.exec(tex);
        assert.ok(m && allowed.has(m[1]), `${p.name}.${part.name}: ${tex}`);
      }
      if (part.packTexture) assert.ok(existsSync(join(HERE, part.packTexture)), `${p.name}.${part.name}: ${part.packTexture} missing`);
    }
  }
  assert.ok(seen > 20, 'presets name almost no textures — this test would check nothing');
});

test('committed pack files stay under 50 MB and the stores are gitignored', () => {
  const bytes = out.sfxManifest.totals.committedPackBytes + out.vfxManifest.totals.committedPackBytes;
  assert.ok(bytes > 0 && bytes < 50 * 1024 * 1024, `${bytes} bytes of packs`);
  for (const dir of ['sfx-store', 'vfx-store']) {
    const probe = join('packages', 'asset-library', dir, 'probe.wav');
    assert.equal(execFileSync('git', ['check-ignore', '-q', probe, '--no-index'], { cwd: ROOT, stdio: 'pipe' }).length, 0);
  }
  for (const dir of ['sfx/sources', 'vfx/sources']) {
    for (const f of readdirSync(join(HERE, dir))) assert.ok(statSync(join(HERE, dir, f)).size < 40 * 1024 * 1024, `${dir}/${f} is over 40 MB`);
  }
});

test('every downloaded Roblox model file has a scan verdict, and none with a script is usable', () => {
  const files = out.rows.vfx.filter((r) => /\.rbxmx?$/i.test(r.file ?? ''));
  for (const r of files) {
    assert.ok(r.scan && typeof r.scan.verdict === 'string', `${r.file} was never scanned`);
    if (r.scan.scripts > 0) assert.notEqual(r.scan.verdict, 'clean', `${r.file} holds ${r.scan.scripts} script(s) and is marked clean`);
    assert.equal(r.use, 'store-only', `${r.file}: a downloaded model file stays in the gitignored store`);
  }
});

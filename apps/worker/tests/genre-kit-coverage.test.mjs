// Every genre Apple offers is a whole kit AND has at least one reference a builder can learn from.
//
// The genre list is read from GENRE_KIT_IDS, never written out here: a hand-written list is how a
// newly added genre ships with no palette or no reference and every test stays green. The genres
// the owner named (shooter, fighting, adventure) are found by what their kit CONTAINS — a pinned
// gunshot, a melee strike — not by the id they happen to be spelled with.
//
// Run: node --test --test-reporter=tap apps/worker/tests/genre-kit-coverage.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const temp = mkdtempSync(join(tmpdir(), 'genre-kit-coverage-'));
const bundle = (name) => {
  const out = join(temp, `${name}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
    join(WORKER, 'src', `${name}.ts`), '--bundle', '--platform=browser', '--format=esm', '--target=es2022', `--outfile=${out}`,
  ], { cwd: WORKER, stdio: 'pipe' });
  return out;
};
const K = await import(pathToFileURL(bundle('genre-kits')).href);
const G = await import(pathToFileURL(bundle('genre-reference-guide')).href);
rmSync(temp, { recursive: true, force: true });

const IDS = [...K.GENRE_KIT_IDS];
const ROLES = ['base', 'surface', 'accent', 'highlight', 'danger', 'text'];
const pinnedRoles = (kit) => new Set(kit.pinned.map((p) => p.role));

test('the genre list was read from the source and found something', () => {
  assert.ok(IDS.length >= 10, `GENRE_KIT_IDS has ${IDS.length} entries — this suite would check almost nothing`);
  assert.equal(K.GENRE_KITS.length, IDS.length, 'a kit id without a kit, or a kit outside the id list');
});

test('every genre is a complete kit: palette by role, lighting, UI/VFX/SFX briefs, pins, build notes', () => {
  for (const id of IDS) {
    const kit = K.getGenreKit(id);
    assert.ok(kit, `${id} is listed but has no kit`);
    assert.ok(kit.name.length > 0 && kit.pitch.length > 20, `${id} has no name or pitch`);
    assert.deepEqual(kit.palette.map((c) => c.role).sort(), [...ROLES].sort(), `${id} palette does not cover every role once`);
    for (const c of kit.palette) {
      assert.match(c.hex, /^#[0-9a-f]{6}$/, `${id} ${c.role} is not a hex colour`);
      assert.ok(c.why.length > 20, `${id} ${c.role} colour has no reason`);
    }
    for (const key of ['brightness', 'clockTime', 'fogEnd']) {
      assert.ok(Number.isFinite(kit.lighting[key]), `${id} lighting.${key} is not a number`);
    }
    assert.ok(kit.lighting.effects.length > 0, `${id} names no post-processing`);
    const needs = new Set(kit.slots.map((s) => s.need));
    for (const need of ['ui_icon', 'particle', 'sfx']) assert.ok(needs.has(need), `${id} has no ${need} brief`);
    for (const s of kit.slots) assert.ok(s.count > 0 && s.why.length > 25, `${id} ${s.need} brief has no count or reason`);
    assert.ok(kit.pinned.length > 0, `${id} pins no sound`);
    assert.ok(kit.procedural.length > 0, `${id} says nothing about what to build from Parts`);
  }
});

test('every genre has at least one reference-only visual reference that says what to learn from it', () => {
  for (const id of IDS) {
    const guide = G.getGenreReferenceGuide({ genre: id, maxChars: G.GENRE_REFERENCE_GUIDE_MAX_CHARS });
    assert.equal(guide.noMatch, false, `${id} has no reference guide at all`);
    // Nothing from a shipped game may be handed over as ours: the rights block is the boundary.
    assert.equal(guide.rights.use, 'reference_only');
    assert.equal(guide.rights.copyPermission, false);
    const visual = guide.sources.filter((s) => s.kind === 'visual_reference');
    assert.ok(visual.length >= 1, `${id} has no visual reference`);
    for (const ref of visual) {
      assert.equal(ref.referenceUse, 'reference_only', `${ref.id} is not marked reference-only`);
      assert.match(ref.url, /^https:\/\//, `${ref.id} has no source URL`);
      assert.ok(ref.observations.length > 0 && ref.observations.every((o) => o.text.length > 20),
        `${ref.id} carries no authored lesson (layout, hierarchy, colour)`);
    }
  }
});

test('a shooter genre exists: its kit pins a gunshot and a reload', () => {
  const shooters = K.GENRE_KITS.filter((k) => pinnedRoles(k).has('gunshot') && pinnedRoles(k).has('reload'));
  assert.ok(shooters.length >= 1, 'no kit pins both a gunshot and a reload sound');
});

test('a fighting genre exists: its kit pins a melee strike and no firearm', () => {
  const fighters = K.GENRE_KITS.filter((k) => {
    const roles = pinnedRoles(k);
    return (roles.has('slash') || roles.has('impact')) && !roles.has('gunshot');
  });
  assert.ok(fighters.length >= 1, 'no kit pins a melee strike without a gunshot');
});

test('an adventure genre exists: its kit pins a treasure find and a discovery sting', () => {
  const adventures = K.GENRE_KITS.filter((k) => pinnedRoles(k).has('treasure') && pinnedRoles(k).has('discovery'));
  assert.ok(adventures.length >= 1, 'no kit pins both a treasure-find and a discovery sound');
});

/**
 * Art direction — the last worker module with no test at all.
 *
 * Two things here are load-bearing in ways that do not look it.
 *
 * `moodLuau` GENERATES LUAU that is executed in a user's place. Not a prompt, not a
 * suggestion — source code that runs. If it emits something that does not parse, the
 * mood silently fails to apply and the scene renders in default lighting, which is the
 * exact "nothing errors, the scene is simply ugly" failure the module's own header says
 * it exists to prevent. So the strongest test here compiles its output.
 *
 * `worldBuildingBrief` is injected into the system prompt on every build request, and
 * the header calls its size "a hard product constraint — must stay ~1.5k tokens". A
 * budget nobody enforces is not a budget; the landing page has a CI check for exactly
 * this reason and the prompt did not.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const out = join(mkdtempSync(join(tmpdir(), 'wb-')), 'wb.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'worldbuilding.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { stdio: 'pipe' });
const { worldBuildingBrief, moodLuau, MOODS, PALETTES, CARTOON_MOODS, CARTOON_PALETTES, SCENE_PLAN_SCHEMA } = await import(out);

const TMP = mkdtempSync(join(tmpdir(), 'wb-luau-'));
function haveLuau() {
  try { execFileSync('luau-analyze', ['--help'], { stdio: 'pipe' }); return true; } catch { return false; }
}

/** Syntax errors only — the generated chunk references Roblox globals this checker
 *  has no definitions for, and type noise is not what is under test. */
function syntaxErrors(source, tag) {
  const file = join(TMP, `${tag}.luau`);
  writeFileSync(file, source);
  let output = '';
  try { output = execFileSync('luau-analyze', [file], { encoding: 'utf8', stdio: 'pipe' }); }
  catch (err) { output = `${err.stdout ?? ''}${err.stderr ?? ''}`; }
  return output.split('\n').filter((l) => l.includes('SyntaxError'));
}

// ------------------------------------------------- the generated Luau parses --

test('every mood generates Luau that actually compiles', { skip: haveLuau() ? false : 'luau-analyze not on PATH' }, () => {
  // The whole point. This code runs in someone's place; a chunk that does not parse
  // fails silently and leaves the scene in default lighting.
  const names = Object.keys(MOODS);
  assert.ok(names.length >= 3, `expected the mood table, found ${names.length}`);
  for (const mood of names) {
    const errs = syntaxErrors(moodLuau(mood), `mood-${mood}`);
    assert.deepEqual(errs, [], `${mood} generated Luau that does not parse:\n  ${errs.join('\n  ')}`);
  }
});

test('the fallback mood also compiles', { skip: haveLuau() ? false : 'luau-analyze not on PATH' }, () => {
  assert.deepEqual(syntaxErrors(moodLuau('not-a-real-mood'), 'mood-fallback'), []);
});

test('an unknown mood falls back to day rather than emitting nothing', () => {
  // Returning '' would apply no lighting at all and report success.
  const fallback = moodLuau('not-a-real-mood');
  assert.ok(fallback.length > 0, 'an unknown mood produced no code');
  assert.equal(fallback, moodLuau('day'), 'the fallback is not day');
});

test('the generated code clears previous effects before adding its own', () => {
  // Without this, switching mood twice stacks two Atmospheres and two Blooms, and the
  // scene gets progressively murkier with each change.
  const src = moodLuau('day');
  assert.match(src, /GetChildren/, 'nothing walks the existing Lighting children');
  assert.match(src, /Destroy\(\)/, 'nothing removes the previous effects');
  assert.ok(src.indexOf('Destroy()') < src.indexOf('Instance.new'),
    'effects are created before the old ones are cleared');
});

test('every mood emits the three effects it is built on', () => {
  for (const mood of Object.keys(MOODS)) {
    const src = moodLuau(mood);
    for (const cls of ['Atmosphere', 'BloomEffect', 'ColorCorrectionEffect']) {
      assert.match(src, new RegExp(cls), `${mood} does not create a ${cls}`);
    }
  }
});

test('colours are emitted as Color3.fromRGB, not as raw arrays', () => {
  // An RGB triple pasted straight into Luau is a table literal, which assigns and then
  // fails at render time rather than at compile time — the worst place to find out.
  for (const mood of Object.keys(MOODS)) {
    const src = moodLuau(mood);
    assert.ok(!/=\s*\[/.test(src), `${mood} emitted a raw array where a Color3 belongs`);
  }
});

// ----------------------------------------------------------- the token budget --

// The cartoon-only brief now fits the module's stated ~1.5k token budget.
test('the brief stays inside its stated token budget', () => {
  const measured = {};
  for (const kind of ['obby', 'tycoon', 'simulator', 'showcase', 'anything-else']) {
    const approxTokens = Math.ceil(worldBuildingBrief(kind).length / 4);
    measured[kind] = approxTokens;
    assert.ok(approxTokens < 1500,
      `worldBuildingBrief(${kind}) is ~${approxTokens} tokens, above the ~1.5k budget.`);
  }
  assert.ok(measured.obby > 700, 'the prompt may have lost its art-direction rules');
});

// F-049: a sky island built out of Parts scored 2/10. Outdoor requests carry the Terrain/set_mood
// rules; everything else is spared the ~400 tokens.
test('outdoor requests get the natural-scene rules and indoor ones do not', () => {
  const island = worldBuildingBrief('make an awesome floating sky island with a waterfall, big trees and a sunset sky');
  assert.match(island, /NATURAL OUTDOOR SCENES/);
  assert.match(island, /edit_terrain/);
  assert.match(island, /set_mood/);
  for (const indoor of ['a cosy coffee shop interior', 'obby', 'tycoon']) {
    assert.doesNotMatch(worldBuildingBrief(indoor), /NATURAL OUTDOOR SCENES/, indoor);
  }
});

test('the active brief offers only colorful cartoon moods and palettes', () => {
  const brief = worldBuildingBrief('obby');
  assert.deepEqual(SCENE_PLAN_SCHEMA.properties.style.enum, ['stylised']);
  assert.deepEqual(SCENE_PLAN_SCHEMA.properties.mood.enum, CARTOON_MOODS);
  assert.ok(CARTOON_MOODS.includes('sunny'));
  assert.ok(!CARTOON_MOODS.includes('horror'));
  assert.ok(!CARTOON_MOODS.includes('overcast'));
  assert.ok(!CARTOON_PALETTES.includes('coldHorror'));
  assert.ok(!CARTOON_PALETTES.includes('modernCivic'));
  for (const mood of CARTOON_MOODS) assert.ok(brief.includes(mood), `${mood} is not offered`);
  for (const pal of CARTOON_PALETTES) {
    assert.ok(brief.includes(pal), `${pal} is not offered`);
    assert.ok(PALETTES[pal].materials.includes('SmoothPlastic'), `${pal} is not a cartoon palette`);
  }
  assert.doesNotMatch(brief, /- REALISTIC|palette coldHorror|mood horror|realistic cities/i);
  assert.match(brief, /find_library_model/);
  assert.match(brief, /insert_library_model/);
  assert.match(brief, /simple.*parts/i);
});

test('an unknown kind still returns the universal guidance', () => {
  const unknown = worldBuildingBrief('zzz-not-a-kind');
  assert.ok(unknown.length > 200, 'an unknown kind produced almost nothing');
  const known = worldBuildingBrief('obby');
  assert.ok(known.length >= unknown.length, 'a known kind added nothing over the fallback');
});

test('every palette and mood is structurally complete', () => {
  // A missing field surfaces as `undefined` inside generated Luau, which parses and
  // then does nothing at runtime.
  for (const [name, p] of Object.entries(MOODS)) {
    for (const key of ['atmosphere', 'bloom', 'colorCorrection', 'scriptable']) {
      assert.ok(p[key], `mood ${name} has no ${key}`);
    }
  }
  for (const [name, p] of Object.entries(PALETTES)) {
    assert.ok(Object.keys(p).length > 0, `palette ${name} is empty`);
  }
});

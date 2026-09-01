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
const { worldBuildingBrief, moodLuau, MOODS, PALETTES } = await import(out);

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

//[[ THE STATED BUDGET IS ALREADY EXCEEDED, and writing the test is how that surfaced.
//
//   worldbuilding.ts's header says "Token budget is a hard product constraint —
//   worldBuildingBrief() must stay ~1.5k tokens". Measured at ~4 characters per token:
//
//     obby       7,529 chars  ~1,883 tokens
//     tycoon     6,947 chars  ~1,737 tokens
//     simulator  6,947 chars  ~1,737 tokens
//     showcase   6,947 chars  ~1,737 tokens
//     unknown    6,947 chars  ~1,737 tokens
//
//   So it is 16–26 % over the number it calls hard, on every build request. That is a
//   product decision — trim the brief, or restate the budget — and not one to make
//   silently inside a test file.
//
//   The threshold below is therefore a RATCHET at the current worst case plus a little
//   room, not an endorsement of 2,000. It stops the brief growing further while the
//   discrepancy is decided. Picking 2,200 so the test passes and saying nothing would
//   have been the quiet version of the same choice. ]]
test('the brief does not grow past where it already is', () => {
  const measured = {};
  for (const kind of ['obby', 'tycoon', 'simulator', 'showcase', 'anything-else']) {
    const approxTokens = Math.ceil(worldBuildingBrief(kind).length / 4);
    measured[kind] = approxTokens;
    assert.ok(approxTokens < 2000,
      `worldBuildingBrief(${kind}) is ~${approxTokens} tokens. The module's header calls `
      + '~1.5k a hard constraint and it is already past that; this ratchet stops it '
      + 'growing further. Trim the brief, or change the stated budget deliberately.');
  }
  // Recorded so a reader sees the gap rather than only the ceiling.
  assert.ok(measured.obby > 1500,
    'obby is now inside the stated 1.5k budget — good news; tighten this test to match.');
});

test('the brief names the moods and palettes a model may choose from', () => {
  // The model picks a mood by name. If the list is not in the prompt it invents one,
  // moodLuau falls back to day, and every scene comes out looking the same.
  const brief = worldBuildingBrief('obby');
  for (const mood of Object.keys(MOODS)) assert.ok(brief.includes(mood), `${mood} is not offered`);
  for (const pal of Object.keys(PALETTES)) assert.ok(brief.includes(pal), `${pal} is not offered`);
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

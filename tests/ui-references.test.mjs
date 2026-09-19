import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'packages/corpus/data/ui-references');
const MINIMUM = 5;

/**
 * The owner's rule, enforced: no genre gets a design until five real references stand behind it.
 *
 * A theme with four references is a guess with a colour palette. The `simulator` theme proved that
 * from the other direction — it shipped with the right colours and still did not look like a
 * Roblox game, because the palette was never the gap. Construction was.
 *
 * PENDING is a ratchet, not an excuse. A genre listed there is a known hole, and the test fails in
 * BOTH directions: a genre outside PENDING with fewer than five references fails, and a genre
 * INSIDE pending that has reached five also fails, so the list cannot quietly outlive the gap it
 * describes.
 */
const PENDING = new Set(['tycoon', 'obby', 'horror', 'racing', 'roleplay', 'survival', 'studio']);

const genreFiles = () => (existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.json')) : []);
const load = (file) => JSON.parse(readFileSync(join(DIR, file), 'utf8'));

function themeIds() {
  const src = readFileSync(join(ROOT, 'apps/worker/src/ui-kit-themes.ts'), 'utf8');
  const block = src.slice(src.indexOf('APPLE_UI_THEMES'));
  return [...new Set([...block.matchAll(/\{\s*id:\s*'([a-z]+)'/g)].map((m) => m[1]))];
}

test('every theme the product can render is either referenced or openly pending', () => {
  const ids = themeIds();
  assert.ok(ids.length >= 5, `parsed only ${ids.length} theme ids — this check would be vacuous`);
  const have = new Set(genreFiles().map((f) => f.replace(/\.json$/, '')));
  const unaccounted = ids.filter((id) => !have.has(id) && !PENDING.has(id));
  assert.deepEqual(unaccounted, [], `these themes can be rendered with no references and are not declared pending: ${unaccounted.join(', ')}`);
});

test('a genre that is not pending carries at least five references', () => {
  const thin = [];
  for (const file of genreFiles()) {
    const data = load(file);
    if (PENDING.has(data.genre)) continue;
    const n = Array.isArray(data.references) ? data.references.length : 0;
    if (n < MINIMUM) thin.push(`${data.genre} has ${n}`);
  }
  assert.deepEqual(thin, [], `below the five-reference minimum: ${thin.join('; ')}`);
});

test('the pending list cannot outlive the gap it describes', () => {
  const ready = [];
  for (const file of genreFiles()) {
    const data = load(file);
    if (!PENDING.has(data.genre)) continue;
    if (Array.isArray(data.references) && data.references.length >= MINIMUM) ready.push(data.genre);
  }
  assert.deepEqual(ready, [], `these reached ${MINIMUM} references and must be removed from PENDING: ${ready.join(', ')}`);
});

test('a reference records where it was seen and what it shows, or it is not a reference', () => {
  const bad = [];
  for (const file of genreFiles()) {
    const data = load(file);
    for (const ref of data.references ?? []) {
      if (typeof ref.id !== 'string' || !ref.id.trim()) bad.push(`${file}: a reference has no id`);
      if (typeof ref.source !== 'string' || ref.source.trim().length < 10) bad.push(`${file}/${ref.id}: source is missing or too short to check`);
      if (!Array.isArray(ref.demonstrates) || ref.demonstrates.length < 2) bad.push(`${file}/${ref.id}: records fewer than two observations, so it is a link rather than a reference`);
    }
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('the rules say why, because a rule without a reason is a preference', () => {
  const bad = [];
  for (const file of genreFiles()) {
    const data = load(file);
    for (const [name, rule] of Object.entries(data.rules ?? {})) {
      if (name === 'note') continue;
      if (typeof rule !== 'object' || rule === null) continue;
      if (typeof rule.why !== 'string' || rule.why.trim().length < 20) bad.push(`${data.genre}.${name} states no why`);
    }
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('no reference file smuggles in an image', () => {
  // The library stores observations, not artwork. Someone else's UI art is their work; what is
  // learned from looking at it is not.
  const bad = [];
  for (const file of genreFiles()) {
    const raw = readFileSync(join(DIR, file), 'utf8');
    if (/data:image\//.test(raw)) bad.push(`${file} contains an embedded image`);
    if (/\.(png|jpg|jpeg|gif|webp)\b/i.test(raw)) bad.push(`${file} references an image file`);
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('the shipped theme gaps are recorded against the genre they belong to', () => {
  // simulator is the one genre that has been rendered and compared. Its file must carry what the
  // comparison found, or the next agent repeats the render to learn the same thing.
  const sim = load('simulator.json');
  assert.ok(Array.isArray(sim.gapsAgainstShippedTheme) && sim.gapsAgainstShippedTheme.length >= 3,
    'simulator.json must record what the shipped theme does not do, measured by rendering it');
});

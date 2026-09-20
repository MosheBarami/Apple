#!/usr/bin/env node
/**
 * Merge every per-genre file in packages/corpus/data/ui-references/ into ONE bundle the Worker can
 * import statically.
 *
 * WHY A BUILD STEP AND NOT A DIRECTORY READ. A Worker has no filesystem. `genre-reference-guide.ts`
 * already solved this for the other corpus by importing one JSON file that esbuild embeds in the
 * bundle, and the same shape is what makes the construction library reachable at generation time
 * instead of only by a test.
 *
 * WHAT THIS EXISTS TO PREVENT. `ui-references/` records what a Roblox UI is supposed to look like —
 * stroke weights, how a header overhangs its panel, how many tiles a grid runs. Commit 7ba141e
 * found that NOTHING READ IT: ui-kit.ts mentioned it twice, in comments. That was answered with a
 * test contract, which keeps the hand-written kit honest for the one genre somebody hand-wrote.
 * It does not help the model build a genre nobody has hand-written. This does.
 *
 * NO IMAGES, NO THIRD-PARTY SOURCE. The library stores observations and rules the project authored,
 * plus provenance strings saying where each was seen. That is what gets bundled; nothing else is.
 *
 * Run: node scripts/build-ui-construction.mjs [--check]
 *   --check exits non-zero if the committed bundle is stale, for the gate suite.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'packages/corpus/data/ui-references');
const OUT = join(ROOT, 'packages/corpus/data/ui-construction.json');

/** A rules object is only worth bundling if a generator could act on it. */
function usableRules(rules) {
  if (!rules || typeof rules !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(rules)) {
    if (typeof v === 'string' && v.trim()) out[k] = v.trim();
    else if (v && typeof v === 'object') out[k] = v;
  }
  return out;
}

export function buildBundle() {
  const files = readdirSync(SRC).filter((f) => f.endsWith('.json')).sort();
  const entries = [];
  const problems = [];
  for (const file of files) {
    let data;
    try { data = JSON.parse(readFileSync(join(SRC, file), 'utf8')); }
    catch (e) { problems.push(`${file}: not valid JSON — ${e.message}`); continue; }
    const genre = data.genre ?? file.replace(/\.json$/, '');
    const refs = Array.isArray(data.references) ? data.references : [];
    const rules = usableRules(data.rules);
    if (!Object.keys(rules).length) { problems.push(`${file}: no usable rules — nothing for a generator to apply`); continue; }
    entries.push({
      genre,
      label: data.label ?? genre,
      kind: genre.startsWith('screen-') ? 'screen' : 'genre',
      incomplete: data.incomplete === true,
      referenceCount: refs.length,
      // The observations, trimmed to what a generator needs: WHAT was seen, not where.
      demonstrates: refs.flatMap((r) => (Array.isArray(r.demonstrates) ? r.demonstrates : [])).slice(0, 40),
      // Provenance travels so a claim stays checkable, and so the rights boundary stays visible.
      sources: refs.map((r) => r.source).filter(Boolean).slice(0, 20),
      rules,
    });
  }
  const bundle = {
    schemaVersion: 1,
    note: 'Project-authored construction observations distilled from shipped Roblox UI. No image, asset or third-party source is reproduced here.',
    generatedBy: 'scripts/build-ui-construction.mjs',
    genres: entries.filter((e) => e.kind === 'genre'),
    screens: entries.filter((e) => e.kind === 'screen'),
  };
  return { bundle, problems };
}

const serialise = (b) => JSON.stringify(b, null, 1) + '\n';

if (process.argv[1] && process.argv[1].endsWith('build-ui-construction.mjs')) {
  const { bundle, problems } = buildBundle();
  const text = serialise(bundle);
  const sha = createHash('sha256').update(text).digest('hex');
  if (process.argv.includes('--check')) {
    let current = '';
    try { current = readFileSync(OUT, 'utf8'); } catch { /* absent counts as stale */ }
    if (current !== text) {
      console.error('ui-construction.json is STALE — run: node scripts/build-ui-construction.mjs');
      process.exit(1);
    }
    console.log(`ui-construction.json is current — ${bundle.genres.length} genres, ${bundle.screens.length} screens, sha ${sha.slice(0, 12)}`);
    process.exit(0);
  }
  writeFileSync(OUT, text);
  for (const p of problems) console.warn(`  skipped ${p}`);
  console.log(`wrote ${OUT}`);
  console.log(`  genres:  ${bundle.genres.length}  (${bundle.genres.filter((g) => g.incomplete).length} incomplete)`);
  console.log(`  screens: ${bundle.screens.length} (${bundle.screens.filter((g) => g.incomplete).length} incomplete)`);
  console.log(`  sha256:  ${sha}`);
}

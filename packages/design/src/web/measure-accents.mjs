#!/usr/bin/env node
/**
 * Measures every accent candidate in accents.json against the surfaces in tokens.css and either
 * prints the numbers or, with --write, records them in accents.json (the `measured` field).
 *
 *   node packages/design/src/web/measure-accents.mjs            print, change nothing
 *   node packages/design/src/web/measure-accents.mjs --write    record
 *
 * The recorded numbers are never typed by hand: tokens.test.mjs recomputes them from the same two
 * files and fails when the record is stale.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { ACCENTS_JSON_PATH, aaFailures, measureAccent, surfacesOf, theme, themeBlocks } from './css-tokens.mjs';

const write = process.argv.includes('--write');
const accents = JSON.parse(readFileSync(ACCENTS_JSON_PATH, 'utf8'));
const blocks = themeBlocks();
const surfaces = {
  dark: surfacesOf(theme(blocks.dark)),
  light: surfacesOf(theme(blocks.light)),
};

let failed = 0;
for (const candidate of accents.candidates) {
  candidate.measured = {};
  for (const mode of ['dark', 'light']) {
    const m = measureAccent(candidate[mode], surfaces[mode]);
    candidate.measured[mode] = m;
    const bad = aaFailures(m);
    failed += bad.length;
    console.log(`${candidate.name.padEnd(8)} ${mode.padEnd(5)} ${JSON.stringify(m)}${bad.length ? `  BELOW AA: ${bad.join('; ')}` : ''}`);
  }
}

if (write) {
  writeFileSync(ACCENTS_JSON_PATH, JSON.stringify(accents, null, 2) + '\n');
  console.log('accents.json: measured ratios recorded');
}
process.exit(failed ? 1 : 0);

/**
 * F-015, 2026-09-22: project creation said "Summon a new project" and "Project summoned" — fantasy
 * wording no Roblox creator expects. 4054ea1 replaced the dialog and toast; this holds the whole app
 * to it. Comments, component identifiers (SummonIllustration) and command-palette search keywords
 * are not copy a reader sees, so they are stripped before the scan.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|html)$/.test(name)) files.push(p);
  }
})(SRC);

const visible = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
  .replace(/\bSummon[A-Z]\w*/g, '')
  .replace(/keywords:\s*\[[^\]]*\]/g, '');

test('no screen offers to "summon" anything', () => {
  assert.ok(files.length > 100, `only ${files.length} source files found — this would check nothing`);
  const hits = files.filter((f) => /summon/i.test(visible(readFileSync(f, 'utf8'))));
  assert.deepEqual(hits.map((f) => f.slice(SRC.length + 1)), []);
});

// F-015, measured 2026-09-22 on production: creating a project read "Summon a new project" and toasted
// "Project summoned". No Roblox creator expects fantasy verbs from a build tool, and the word did the
// work of hiding which button made a project. This guards the shown copy — string literals, with
// comments stripped — not identifiers such as SummonIllustration or palette search keywords.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|mts)$/.test(f) ? [p] : [];
});
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('no shown copy summons a project', () => {
  const files = walk(SRC);
  assert.ok(files.length > 100, `found ${files.length} source files — this test would check nothing`);
  const hits = [];
  for (const f of files) {
    const code = stripComments(readFileSync(f, 'utf8'));
    // A literal is shown copy unless it is a bare lowercase word — a palette search keyword such as
    // 'summon' is typed BY the user, never shown to them. "Summoning…" is one word and still copy:
    // requiring a space here is what let the create button's busy label through.
    for (const m of code.matchAll(/(['"`])((?:(?!\1)[^\n])*)\1/g)) {
      if (/\bsummon(ed|s|ing)?\b/i.test(m[2]) && !/^[a-z]+$/.test(m[2])) hits.push(`${f.slice(SRC.length + 1)}: ${m[2]}`);
    }
    // JSX text may sit on its own line between the tags, so newlines are allowed inside it.
    for (const m of code.matchAll(/>([^<>{}]*\bsummon[^<>{}]*)</gi)) hits.push(`${f.slice(SRC.length + 1)}: ${m[1].trim()}`);
  }
  assert.deepEqual(hits, []);
});

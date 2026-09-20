/**
 * THE Env INTERFACE IS A MAP, AND A MAP MAY NOT NAME A ROAD THAT WAS NEVER BUILT.
 *
 * Defect Da8d928. `Env.RESVG_WASM` claimed to be "bound in wrangler.jsonc"; no wrangler file in
 * this repository has ever had a `wasm_modules` section, nothing in src read the field, and the
 * behaviour it implied — SVG assets are refused — is decided unconditionally somewhere else
 * (asset-import.ts returns "this deployment does not rasterise" without consulting any binding).
 *
 * This is a guard, not a deletion notice: it asserts the PROPERTY, so it fails again if any future
 * field claims a `wasm_modules` binding the wrangler files do not declare.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const ENV = readFileSync(join(WORKER, 'src', 'env.ts'), 'utf8');
const WRANGLERS = ['wrangler.jsonc', 'wrangler.apple.jsonc'].map((f) => ({
  file: f,
  text: readFileSync(join(WORKER, f), 'utf8'),
}));

test('no wrangler file declares a wasm_modules section — this is the fact the comment denied', () => {
  for (const { file, text } of WRANGLERS) {
    assert.equal(/"wasm_modules"/.test(text), false, `${file} now has wasm_modules; re-read this guard`);
  }
});

test('Env declares no WebAssembly.Module binding while no wrangler file can provide one', () => {
  const declared = [...ENV.matchAll(/^\s*([A-Z0-9_]+)\??:\s*WebAssembly\.Module/gm)].map((m) => m[1]);
  assert.deepEqual(
    declared,
    [],
    `Env names ${declared.join(', ')} as a wasm binding, and neither wrangler file declares wasm_modules`,
  );
});

test('nothing in the worker reads RESVG_WASM, so removing it changed no behaviour', () => {
  //[[ THIS USED TO READ ONE FILE, AND THAT FILE HAS BEEN DELETED.
  //
  //   `asset-import.ts` was the SVG rasterisation path: it was the only module that would have used
  //   an RESVG_WASM binding, and its refusal ("this deployment does not rasterise") was
  //   unconditional, which is exactly why the missing binding was invisible. The asset catalogue
  //   and its import pipeline were removed on 2026-09-20 and that file went with them.
  //
  //   Reading one named file is also the weaker check. The claim is about the WHOLE worker, so it
  //   is now made about the whole worker: no source file anywhere under src/ reads the binding.
  //   That covers the deleted file's replacement, wherever somebody puts it.
  //
  //   COMMENTS ARE STRIPPED FIRST, and that is not a loophole. `env.ts` carries a dated paragraph
  //   explaining why the binding was removed, and a bare substring search red-lights on the
  //   explanation — a check that fails on its own documentation and passes only once somebody
  //   deletes it is measuring the wrong thing. What is searched for is a READ: a property access
  //   or a declaration, in code. ]]
  const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  const READS = /(?:\.|\b)RESVG_WASM\s*[?!]?\s*[:.,)\]}=;]|(?:\.|\b)RESVG_WASM\s*$/m;
  const readers = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith('.ts')) continue;
      if (READS.test(stripComments(readFileSync(full, 'utf8')))) readers.push(full);
    }
  };
  walk(join(WORKER, 'src'));
  // CONTROL: the walk must actually have opened files, or "nothing reads it" is a walk that found
  // nothing — a failure to observe rendering as an observation.
  assert.ok(seenTypeScriptFiles(join(WORKER, 'src')) > 50, 'the source walk found almost no files, so it verified nothing');
  assert.deepEqual(readers, [], `${readers.join(', ')} still reads RESVG_WASM, which no wrangler file provides`);
  // CONTROL 2: the matcher must find a real binding read when one exists, or `[]` above is a regex
  // that matches nothing rather than a worker that reads nothing.
  assert.ok(READS.test(stripComments('const x = env.RESVG_WASM;')), 'the read matcher no longer matches a read');
  assert.equal(READS.test(stripComments('// RESVG_WASM was here and is gone')), false, 'a comment must not count as a read');
});

/** How many .ts files the walk above can actually see. Used as its own falsification control. */
function seenTypeScriptFiles(dir) {
  let n = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) { n += seenTypeScriptFiles(full); continue; }
    if (entry.name.endsWith('.ts')) n += 1;
  }
  return n;
}

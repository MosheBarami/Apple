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
import { readFileSync } from 'node:fs';
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
  const src = readFileSync(join(WORKER, 'src', 'asset-import.ts'), 'utf8');
  assert.equal(/RESVG_WASM/.test(src), false);
  // The refusal that the binding was supposed to gate is unconditional, which is why its absence
  // was invisible: it never asks whether a renderer is present.
  assert.match(src, /this deployment does not rasterise/);
});

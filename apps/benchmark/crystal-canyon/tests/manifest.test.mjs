// The install manifest must list every module, and list nothing that does not exist.
//
// world/Install.luau copies a fixed list of files into the place. A module that exists in
// src/ but has no row is invisible in Studio: it loads clean, tests clean, and simply is
// not there at runtime. That is not hypothetical — H1 (the gate nothing drew) and F-11
// were both "the code was fine, it just never ran".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = readFileSync(join(GAME, 'world', 'Install.luau'), 'utf8');

/** Every `{ "src/…", … }` row's path. */
const rows = [...manifest.matchAll(/\{\s*"(src\/[^"]+)"/g)].map((m) => m[1]);

const sourceFiles = ['client', 'server', 'shared'].flatMap((dir) =>
  readdirSync(join(GAME, 'src', dir))
    .filter((f) => f.endsWith('.luau'))
    .map((f) => `src/${dir}/${f}`),
);

test('every module under src/ has an install manifest row', () => {
  const missing = sourceFiles.filter((f) => !rows.includes(f));
  assert.deepEqual(
    missing,
    [],
    `these exist but would never reach the place: ${missing.join(', ')}`,
  );
});

test('every manifest row points at a file that exists', () => {
  const dangling = rows.filter((r) => !existsSync(join(GAME, r)));
  assert.deepEqual(dangling, [], `manifest rows with no file: ${dangling.join(', ')}`);
});

test('no module is listed twice', () => {
  const seen = new Set();
  const dupes = rows.filter((r) => (seen.has(r) ? true : (seen.add(r), false)));
  assert.deepEqual(dupes, [], `duplicate manifest rows: ${dupes.join(', ')}`);
});

test('every client module the boot script loads is in the manifest', () => {
  // loadModule("X") resolves a child of the LocalScript, which only exists if the
  // manifest put it there. A typo here is a silently missing surface.
  const boot = readFileSync(join(GAME, 'src', 'client', 'init.client.luau'), 'utf8');
  const loaded = [...boot.matchAll(/loadModule\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(loaded.length > 0, 'expected the boot script to load some modules');
  for (const name of loaded) {
    assert.ok(
      rows.includes(`src/client/${name}.luau`),
      `init.client.luau loads "${name}" but no manifest row ships it`,
    );
  }
});

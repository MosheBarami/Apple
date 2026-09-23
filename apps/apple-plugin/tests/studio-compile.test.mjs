// Every plugin source must COMPILE the way Roblox Studio compiles it.
//
// On 2026-09-22 the 1.1.0 build passed its 41 tests, verify-artifact.py and the luau-analyze parse
// gate, then refused to load in real Studio:
//
//   Commands:4672: Out of local registers when trying to allocate capabilityReason: exceeded limit 200
//
// luau-analyze never compiles, and luau-compile's default -O1 folds `local X = 32` constants away so
// they cost no register — both said "fine". Studio compiles plugins without that folding, which is
// luau-compile -O0, and at -O0 the file reproduced Studio's error exactly. So this test compiles every
// shipped source at -O0, and proves on a control file that the tool really rejects the limit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { pluginSources } from '../scripts/sources.mjs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const BIN = process.env.LUAU_COMPILE_BIN || 'luau-compile';

function available() {
  try { execFileSync(BIN, ['--help'], { stdio: 'pipe' }); return true; } catch (err) { return err.code !== 'ENOENT'; }
}
const compile = (file) => spawnSync(BIN, ['--null', '-O0', file], { encoding: 'utf8' });

const HAVE = available();
if (!HAVE && process.env.CI) {
  test('luau-compile is on PATH under CI', () => assert.fail('luau-compile is missing under CI, so no source was compiled'));
}

test('every shipped plugin source compiles at -O0, as Studio compiles it', { skip: !HAVE && !process.env.CI ? 'luau-compile not installed on this machine' : false }, () => {
  // Every bundled source, src/ops/ included: the families exist because Commands.luau is at the
  // local limit, so they are exactly the files a top-level-only scan would have let through.
  const files = pluginSources(SRC).map((entry) => entry.rel);
  assert.ok(files.length >= 6, `expected the shipped sources, found ${files.length} — this test would check nothing`);
  assert.ok(files.some((f) => f.startsWith('ops/')), 'no src/ops source was found — the op families would ship uncompiled');
  for (const f of files) {
    const r = compile(join(SRC, f));
    assert.equal(r.status, 0, `${f} does not compile the way Studio compiles it:\n${r.stdout}${r.stderr}`);
  }
});

test('the -O0 compile really rejects a 201-local top level (the check can fail)', { skip: !HAVE && !process.env.CI ? 'luau-compile not installed on this machine' : false }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'studio-compile-'));
  const over = join(dir, 'over.luau');
  const under = join(dir, 'under.luau');
  writeFileSync(over, Array.from({ length: 201 }, (_, i) => `local k${i} = ${i}`).join('\n') + '\nreturn k0\n');
  writeFileSync(under, Array.from({ length: 150 }, (_, i) => `local k${i} = ${i}`).join('\n') + '\nreturn k0\n');
  const bad = compile(over);
  assert.notEqual(bad.status, 0, 'a 201-local file compiled — the guard above would be vacuous');
  assert.match(`${bad.stdout}${bad.stderr}`, /Out of local registers/);
  assert.equal(compile(under).status, 0, 'control: a 150-local file must compile');
});

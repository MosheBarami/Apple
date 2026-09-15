/**
 * The companion's Luau spec, run from `node --test`.
 *
 * WHY A SECOND ENTRY POINT. `tests/run.mjs` runs every `*.spec.luau` and is what
 * `pnpm -r test` reaches. That is the right harness and this file does not replace it —
 * it exposes the same chunk to `node --test <file>`, which is the command this repo's
 * test discipline is written around, so the companion suite can be run and read on its
 * own without running the whole plugin.
 *
 * WHAT IT ASSERTS, AND WHY IT IS NOT JUST AN EXIT CODE. The Luau harness prints
 * `companion: N passed` or `companion: N passed, M FAILED` before it raises. Checking
 * only the exit code would pass for a spec file that had been emptied, or one whose
 * `--!modules` line no longer loads the module under test — a failure to observe
 * reported as an observation. So this reads the report line back and asserts three
 * things: that the line exists at all, that nothing FAILED, and that the number of
 * assertions is above a floor. The floor is the denominator.
 *
 *   node --test apps/plugin/tests/companion.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildChunk, declaredModules, luauMissing } from './run.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SPEC = join(HERE, 'companion.spec.luau');

/**
 * The lowest assertion count this file will accept as "the suite ran".
 *
 * Deliberately well below what the spec currently carries: this is a tripwire for a
 * suite that has been gutted, not a count to be kept in step with every added test.
 */
const MIN_ASSERTIONS = 60;

/** Run the companion spec under the standalone Luau CLI and return its output. */
function runSpec() {
  const specSrc = readFileSync(SPEC, 'utf8');
  const mods = declaredModules(specSrc);
  assert.ok(mods, 'companion.spec.luau must declare its modules with --!modules');
  assert.ok(
    mods.some((m) => m.name === 'Companion'),
    'the spec must load the module it is about — a spec that never loads Companion tests nothing',
  );
  assert.ok(
    mods.some((m) => m.name === 'Ops'),
    'and Ops, because the effects are asserted through the real dispatch',
  );

  const dir = mkdtempSync(join(tmpdir(), 'companion-luau-'));
  const out = join(dir, 'companion.gen.luau');
  writeFileSync(out, buildChunk(specSrc, mods));
  try {
    return { ok: true, output: execFileSync('luau', [out], { encoding: 'utf8', stdio: 'pipe' }) };
  } catch (err) {
    return { ok: false, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

test('the Studio companion spec passes under the real Luau runtime', { skip: luauMissing() ? 'luau is not on PATH' : false }, () => {
  const { ok, output } = runSpec();

  // The report line is the evidence the chunk RAN. Without it, a zero exit code would
  // mean only that nothing threw — which is also true of a file that loaded and did
  // nothing at all.
  const report = /^companion: (\d+) passed(?:, (\d+) FAILED)?$/m.exec(output);
  assert.ok(report, `no report line from the companion suite — it did not run:\n${output.slice(0, 2000)}`);

  const passed = Number(report[1]);
  const failed = Number(report[2] ?? 0);
  assert.equal(failed, 0, `companion suite: ${failed} assertion(s) failed\n${output.slice(0, 4000)}`);
  assert.ok(
    passed >= MIN_ASSERTIONS,
    `companion suite reported only ${passed} assertions; at least ${MIN_ASSERTIONS} are expected, so this run measured almost nothing`,
  );
  assert.equal(ok, true, `luau exited non-zero despite a clean report line:\n${output.slice(0, 2000)}`);
});

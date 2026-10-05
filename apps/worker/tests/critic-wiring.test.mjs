// The critic, reachable from a product path.
//
// THE DEFECT. `critic.ts` was 900 lines of measured rules with an evidence gate — a criticism that
// cannot cite a number is DISCARDED rather than down-weighted — and NONE of it shipped. Its only
// importer anywhere was a test; the deployed worker bundle contained zero occurrences of
// `runCriticPanel`. The repository's own audit had said so twice. Under §2.3 that is a dead end,
// not a feature: a capability exists only if a reachable product path executes it.
//
// So these tests are about REACHABILITY as much as behaviour. The bundle assertion is the one that
// would have caught the original state, and no amount of unit testing would have.
//
// RESTATED in M4 (no vision): the path that reached the critic used to be `inspect_visually`, which rendered the scene, sent the
// pictures to a vision model and ran the panel over the render's metrics (critic-input.ts). All of that is removed. The panel
// itself stays and is reached by `audit_build`, over the typed tree, with no judge and no model. The tests that pinned the
// render-to-input conversion, the lighting table it used and the merge into the visual critique are deleted with their subject
// (planning/proof/M4/TEST-LEDGER.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const ESBUILD = join(WORKER, 'node_modules', '.bin', 'esbuild');

// -------------------------------------------------------------- REACHABILITY ---

test('the critic SHIPS — the deployed entry point bundles it', () => {
  // This is the assertion that would have caught the dead end. Every unit test in
  // packages/evals/src/critic.test.mjs passed while zero bytes of critic.ts reached production.
  const bundle = join(tmpdir(), `studpilot-worker-bundle-${process.pid}.mjs`);
  execFileSync(ESBUILD, [
    join(WORKER, 'src', 'index.ts'), '--bundle', '--format=esm', '--target=es2022',
    '--external:cloudflare:workers', `--outfile=${bundle}`,
  ], { cwd: WORKER, stdio: 'pipe' });
  const text = readFileSync(bundle, 'utf8');
  rmSync(bundle, { force: true });

  for (const symbol of ['runCriticPanel', 'applyMetricRules']) {
    assert.ok(text.includes(symbol), `${symbol} is absent from the deployed bundle — the critic does not ship`);
  }
  // Controls: if these were also absent the bundle itself would be wrong and the test above would
  // be passing for the wrong reason.
  for (const control of ['audit_build', 'check_composition']) {
    assert.ok(text.includes(control), `control ${control} missing — the bundle is not what it should be`);
  }
});

test('audit_build is what reaches the critic, and the panel costs no model call', () => {
  const tools = readFileSync(join(WORKER, 'src', 'tools.ts'), 'utf8');
  const block = tools.slice(tools.indexOf('  audit_build: {'), tools.indexOf('  check_composition: {'));
  assert.match(block, /runCriticPanel\(/, 'audit_build runs the panel');
  // No judge argument: the deterministic lenses run and no model is called, so the panel is free.
  assert.doesNotMatch(block, /runCriticPanel\([^)]*judge/);
  assert.doesNotMatch(block, /critiqueViews|chat\(/, 'no model is asked about pictures or anything else');
});

// ------------------------------------------------------ what the web panel shows ---

test('the plugin already sends Ambient as 0-255, so nothing scales it twice', () => {
  // apps/plugin/src/Render.luau does `math.round(L.Ambient.R * 255)` before sending. The web
  // adapter multiplied by 255 again, so rgb(42, 44, 52) rendered as "10710, 11220, 13260" — in the
  // very panel that exists to show the user what the critic looked at.
  const adapters = readFileSync(join(WORKER, '..', 'web', 'src', 'lib', 'generative-ui', 'adapters.ts'), 'utf8');
  const block = adapters.slice(adapters.indexOf("key: 'Ambient'"), adapters.indexOf("key: 'Ambient'") + 400);
  assert.doesNotMatch(block, /n \* 255/, 'the plugin has already scaled it');
});

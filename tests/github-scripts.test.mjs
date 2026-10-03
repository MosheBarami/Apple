// Tests for scripts/github/*: the logic that decides what gets published and what a ruleset requires.
// Pure functions only; nothing here touches the network or runs npm.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  baseName, scopedName, validate, stagedManifest, discoverPublishable, GITHUB_REGISTRY,
} from '../scripts/github/publish-packages.mjs';
import {
  requiredContexts, validateRuleset, contextsNotInWorkflow, summarizeChecks,
} from '../scripts/github/apply-rulesets.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ruleset = JSON.parse(readFileSync(join(ROOT, '.github/rulesets/main.json'), 'utf8'));
const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');

test('scope is the lower-cased repository owner and the base name survives a rename', () => {
  assert.equal(baseName('@apple/sdk'), 'sdk');
  assert.equal(baseName('@apple/sdk'), 'sdk');
  assert.equal(scopedName('@apple/sdk', 'MosheBarami'), '@moshebarami/sdk');
  assert.equal(scopedName('@apple/sdk', '@MosheBarami'), '@moshebarami/sdk');
  assert.throws(() => scopedName('@apple/sdk', ''), /usable GitHub owner/);
  assert.throws(() => scopedName('@apple/sdk', 'bad owner'), /usable GitHub owner/);
});

test('publishable packages are exactly those that opt in, and the worker is not one of them', () => {
  const found = discoverPublishable().map((p) => p.manifest.name.replace(/^@[^/]+\//, ''));
  assert.deepEqual(found, ['sdk', 'shared']);
  const worker = JSON.parse(readFileSync(join(ROOT, 'apps/worker/package.json'), 'utf8'));
  assert.equal(worker.private, true);
});

test('validate refuses what cannot be published and accepts what can', () => {
  const ok = (m) => ({ dir: '/x', manifest: { version: '1.0.0', ...m } });
  assert.deepEqual(validate([ok({ name: 'a' }), ok({ name: 'b' })], 'packages-v1.0.0'), []);
  assert.match(validate([], null)[0], /no package declares/);
  assert.match(validate([ok({ name: 'a', private: true })], null)[0], /private/);
  assert.match(validate([ok({ name: 'a', dependencies: { x: 'workspace:*' } })], null)[0], /unresolvable/);
  assert.match(validate([ok({ name: 'a' }), ok({ name: 'b', version: '2.0.0' })], null)[0], /versions differ/);
  assert.match(validate([ok({ name: 'a' })], 'packages-v9.9.9')[0], /does not match/);
  assert.match(validate([ok({ name: 'a' })], 'v1.0.0')[0], /does not match/);
});

test('the staged manifest is renamed, public, linked to the repo and has no lifecycle scripts', () => {
  const out = stagedManifest(
    { name: '@apple/sdk', version: '1.0.0', private: true, scripts: { prepublishOnly: 'x' }, bin: { apple: './bin/apple.mjs' } },
    { owner: 'MosheBarami', repo: 'MosheBarami/Apple', directory: 'packages/sdk' },
  );
  assert.equal(out.name, '@moshebarami/sdk');
  assert.equal(out.private, undefined);
  assert.equal(out.scripts, undefined);
  assert.deepEqual(out.bin, { apple: 'bin/apple.mjs' });
  assert.equal(out.publishConfig.registry, GITHUB_REGISTRY);
  assert.equal(out.repository.url, 'git+https://github.com/MosheBarami/Apple.git');
});

test('main.json is well formed and every required check is a job name in ci.yml', () => {
  assert.deepEqual(validateRuleset(ruleset), []);
  const contexts = requiredContexts(ruleset);
  assert.equal(contexts.length, 6);
  assert.deepEqual(contextsNotInWorkflow(contexts, ci), []);
  // The detector must be able to fail: a name nobody reports is reported.
  assert.deepEqual(contextsNotInWorkflow(['Not a job'], ci), ['Not a job']);
});

test('main.json blocks deletion and force-push and requires a pull request', () => {
  const types = ruleset.rules.map((r) => r.type);
  for (const t of ['deletion', 'non_fast_forward', 'pull_request', 'required_status_checks']) assert.ok(types.includes(t), t);
});

test('summarizeChecks reports the newest run per name and a missing check as missing', () => {
  const runs = [
    { id: 1, name: 'A', conclusion: 'failure' },
    { id: 2, name: 'A', conclusion: 'success' },
    { id: 3, name: 'B', conclusion: null, status: 'in_progress' },
  ];
  assert.deepEqual(summarizeChecks(runs, ['A', 'B', 'C']), [
    { context: 'A', state: 'success' },
    { context: 'B', state: 'in_progress' },
    { context: 'C', state: 'missing' },
  ]);
});

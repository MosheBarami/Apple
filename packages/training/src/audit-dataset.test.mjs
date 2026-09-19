// The dataset is an input to training, not proof that training improved Apple.
//
// These tests exercise the audit's four boundaries with small in-memory fixtures so CI never
// needs a provider, a Hugging Face account, or a cloud job. The real 404-row measurement is run by
// `node src/audit-dataset.mjs`; this file proves that each gate can actually turn red.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { looksLikeDescription, shingles } from './build-dataset.mjs';
import {
  DATASET_SPLITS,
  INSTRUCTION_SUFFIX,
  auditRows,
  detectContextDependencies,
  extractPair,
  loadDataset,
  loadEvalGuard,
} from './audit-dataset.mjs';

const SOURCE = 'https://github.com/example/apple-fixture';
const SHA = 'a'.repeat(40);

function normalise(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function row({
  instruction = 'Returns the sum of two numbers supplied by the caller.',
  code = 'local function add(a, b)\n\treturn a + b\nend',
  source = SOURCE,
  spdx = 'MIT',
  sha = SHA,
  path = 'src/example.luau',
  meta = {},
} = {}) {
  return {
    messages: [
      { role: 'system', content: 'You are Apple, an expert Roblox engineer.' },
      { role: 'user', content: instruction + INSTRUCTION_SUFFIX },
      { role: 'assistant', content: `\`\`\`luau\n${code}\n\`\`\`` },
    ],
    meta: { source, spdx, sha, path, ...meta },
  };
}

function fixtureSplits(rows = {}) {
  return Object.fromEntries(DATASET_SPLITS.map((split) => [
    split,
    (rows[split] ?? [row({ instruction: `Returns a ${split} fixture value.` })]).map((r, i) => ({ row: r, line: i + 1 })),
  ]));
}

function licenseIndex(entries = [{ url: SOURCE, spdx: 'MIT', sha: SHA }]) {
  const admitted = entries.map((e) => ({ ...e, key: e.url, dir: '/fixture' }));
  return {
    ok: true,
    admitted,
    rejected: [],
    byUrl: new Map(admitted.map((e) => [e.url, e])),
    rejectedByUrl: new Map(),
  };
}

function evalGuard(texts = ['an unrelated evaluation corpus sentence with enough distinctive words']) {
  const set = new Set();
  for (const text of texts) for (const sh of shingles(normalise(text), 8)) set.add(sh);
  return { evalDir: '<fixture>', files: ['fixture.json'], parseErrors: [], taskCount: texts.length, shingles: set };
}

const noOpCheck = () => ({ passed: true, detail: 'fixture checker passed' });

function auditFixture(rows, options = {}) {
  return auditRows(fixtureSplits(rows), {
    evalGuard: evalGuard(),
    licenseIndex: licenseIndex(),
    syntaxCheck: noOpCheck,
    semanticCheck: noOpCheck,
    ...options,
  });
}

test('extractPair accepts the builder contract and refuses prose/code ambiguity', () => {
  const parsed = extractPair(row(), 'train:1');
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.instruction, 'Returns the sum of two numbers supplied by the caller.');
  assert.equal(parsed.code, 'local function add(a, b)\n\treturn a + b\nend');

  const badInstruction = extractPair(row({ instruction: '// This is a source comment with no user request.' }), 'train:2');
  assert.ok(badInstruction.errors.some((e) => e.code === 'instruction_quality'));

  const badResponse = row();
  badResponse.messages[2].content = 'local function add() return 1 end';
  assert.ok(extractPair(badResponse, 'train:3').errors.some((e) => e.code === 'response_format'));
});

test('context detection distinguishes a standalone function from file/module dependencies', () => {
  const standalone = detectContextDependencies('local function add(a, b)\n\treturn a + b\nend');
  assert.equal(standalone.standalone, true);
  assert.deepEqual(standalone.unknownGlobals, []);
  assert.deepEqual(standalone.requires, []);

  // A top-level function declaration writes its own name; that definition is not a missing context
  // dependency. The earlier implementation counted every such declaration as a dependency.
  const globalDefinition = detectContextDependencies('function add(a, b)\n\treturn a + b\nend');
  assert.equal(globalDefinition.standalone, true);
  assert.deepEqual(globalDefinition.implicitGlobals, ['add']);

  const dependent = detectContextDependencies(
    'local Module = require(script.Parent.Module)\nlocal function render()\n\treturn missingState.value + self.offset\nend',
    { path: 'src/render.luau' },
  );
  assert.equal(dependent.standalone, false);
  assert.deepEqual(dependent.unknownGlobals, ['missingState', 'self']);
  assert.equal(dependent.requires.length, 1);
  assert.equal(dependent.requires[0].resolved, true);
  assert.equal(dependent.dependencies.filter((d) => d.kind === 'global-read').length, 2);
  assert.equal(dependent.dependencies.filter((d) => d.kind === 'module-require').length, 1);
});

test('a clean fixture is structurally ready but is not falsely called product-trajectory data', () => {
  const report = auditFixture({
    train: [row({ instruction: 'Returns the sum of two numbers supplied by the caller.' })],
    val: [row({
      instruction: 'Creates a folder named Results under the supplied parent.',
      code: 'local function makeFolder(parent)\n\treturn Instance.new("Folder", parent)\nend',
    })],
    test: [row({
      instruction: 'Checks whether a supplied number is positive.',
      code: 'local function isPositive(n)\n\treturn n > 0\nend',
    })],
  });
  assert.equal(report.ready, true);
  assert.equal(report.productShapeReady, false);
  assert.equal(report.verdict, 'READY_FOR_CODE_SFT_NOT_PRODUCT_TRAJECTORIES');
  assert.deepEqual(report.totals, {
    rows: 3,
    validRows: 3,
    invalidRows: 0,
    contextIndependentRows: 3,
    contextDependentRows: 0,
    contextDependentRate: 0,
    trajectoryRows: 0,
    harvestedCodeRows: 3,
    instructionDuplicates: 0,
    responseDuplicates: 0,
  });
  assert.equal(report.evaluation.rowsWithLeakage, 0);
  assert.equal(report.licensing.regressionRows, 0);
});

test('the audit catches instruction artefacts, context dependencies, eval leakage, and licence drift together', () => {
  const leaked = 'The evaluation gate expects this exact phrase to remain hidden from training data.';
  const dependentCode = 'local function render()\n\treturn missingState.value\nend';
  const report = auditFixture({
    train: [
      row({ instruction: '// This C-style comment was copied from a source header.' }),
      row({ instruction: leaked }),
      row({ instruction: 'Returns the state rendered by the surrounding controller.', code: dependentCode }),
      row({ source: 'https://github.com/example/revoked', instruction: 'Returns a value from a revoked source.' }),
    ],
    val: [row({ instruction: 'Creates a val fixture folder under the supplied parent.' })],
    test: [row({ instruction: 'Checks whether the test fixture is ready.' })],
  }, { evalGuard: evalGuard([leaked]) });
  assert.equal(report.ready, false);
  assert.equal(report.verdict, 'NOT_READY_FOR_PRODUCT_SFT');
  assert.equal(report.issueCounts.instruction_quality, 1);
  assert.equal(report.issueCounts.eval_leakage, 1);
  assert.equal(report.issueCounts.license_regression, 1);
  assert.equal(report.totals.contextDependentRows, 1);
  assert.equal(report.context.dependencyRows, 1);
  assert.equal(report.evaluation.instructionHits, 1);
  assert.equal(report.evaluation.responseHits, 0);
  assert.equal(report.licensing.regressionRows, 1);
  assert.ok(report.context.samples.some((s) => s.dependency.name === 'missingState'));
});

test('an empty evaluation corpus fails closed instead of certifying every row', () => {
  const report = auditFixture({}, { evalGuard: { files: [], parseErrors: [], taskCount: 0, shingles: new Set() } });
  assert.equal(report.ready, false);
  assert.equal(report.issueCounts.eval_guard_unavailable, 1);
});

test('loadEvalGuard reads task prompts and expected check text locally', () => {
  const dir = mkdtempSync(join(tmpdir(), 'apple-training-eval-'));
  try {
    writeFileSync(join(dir, 'fixture.json'), JSON.stringify([
      { id: 'x', prompt: 'Write a safe Roblox script using this distinctive phrase here.', checks: [{ type: 'contains', value: 'DistinctiveExpectedShape' }] },
    ]));
    const guard = loadEvalGuard(dir);
    assert.equal(guard.taskCount, 1);
    assert.equal(guard.files.length, 1);
    assert.equal(guard.parseErrors.length, 0);
    assert.ok(guard.shingles.size > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadDataset refuses a missing or empty split', () => {
  const dir = mkdtempSync(join(tmpdir(), 'apple-training-data-'));
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'train.jsonl'), JSON.stringify(row()) + '\n');
    writeFileSync(join(dir, 'val.jsonl'), '\n');
    assert.throws(() => loadDataset(dir), /val: .*no rows/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the stricter builder gate and audit agree on comment artefacts', () => {
  const docs = [
    '// This returns the highest priority pending lanes regardless of whether they are suspended.',
    '/** Ensure that every element is passed in a static location. */',
    '* Copyright (c) Facebook, Inc. and its affiliates. * @flow',
  ];
  for (const doc of docs) {
    assert.equal(looksLikeDescription(doc), false);
    const parsed = extractPair(row({ instruction: doc }), 'fixture:1');
    assert.ok(parsed.errors.some((e) => e.code === 'instruction_quality'));
  }
});

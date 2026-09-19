#!/usr/bin/env node
/**
 * Fresh-case audit of inspected, saved synthetic pilot code. No model load, generation, training,
 * network or artifact writes. The unchanged historical scorer is reported separately.
 * CLI exit 0 means audit completed, not that an adapter passed. No promotion decision is made.
 */
import { readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { ALL_GAME_LOGIC_CURRICULUM } from './build-game-logic.mjs';
import { checkCandidate } from './evaluate-game-logic.mjs';
import { scorePilot } from './score-local-pilot.mjs';
import { DIAG_MISMATCH, diagnosisCasesFor } from './local-pilot-diagnosis-cases.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const FENCE = /^\s*```(luau|lua)\s*\n([\s\S]*?)\n```\s*$/;
const terminalReasons = new Set(['wall_clock', 'memory', 'output_limit', 'spawn_failed', 'unknown']);
const fence = source => '```luau\n' + source + '\n```';

/** Remove ephemeral process paths/timings, but retain actual failing source/check locations. */
export function stableProbeResult(result, source = '', checks = '') {
  const stderr = String(result.stderr ?? '').replace(/[^\s]*[\\/]program\.luau/g, 'program.luau').slice(0, 2000);
  let classification;
  if (result.passed === true) classification = 'pass';
  else if (result.reason === 'expected_single_code_block') classification = 'output-format';
  else if (result.reason === 'invalid_or_context_dependent_source') classification = 'source-or-context';
  else if (terminalReasons.has(result.reason) || String(result.reason).startsWith('refused:')) classification = 'execution-unobserved-or-limited';
  else if (result.reason === 'exit' && result.exitCode !== 0 && stderr.includes(DIAG_MISMATCH)) classification = 'wrong-result';
  else if (result.reason === 'exit' && result.exitCode !== 0 && /assertion failed/i.test(stderr)) classification = 'assertion-failure';
  else if (result.reason === 'exit' && result.exitCode !== 0) classification = 'runtime-error';
  else classification = 'execution-or-output-protocol-failure';
  const line = /program\.luau:(\d+):/.exec(stderr);
  let location = null;
  if (line && source) {
    const programLine = Number(line[1]);
    const sourceLines = source.split('\n').length;
    const checkLine = programLine - sourceLines - 2;
    if (checkLine >= 1 && checkLine <= checks.split('\n').length) {
      location = { section: 'checks', line: checkLine, statement: checks.split('\n')[checkLine - 1] };
    } else if (programLine >= 2 && programLine <= sourceLines + 1) {
      location = { section: 'source', line: programLine - 1, statement: source.split('\n')[programLine - 2] };
    }
  }
  const observed = classification === 'wrong-result' ? stderr.split(DIAG_MISMATCH)[1].split('\n')[0] : null;
  return { passed: result.passed === true, classification, reason: result.reason ?? 'unknown',
    exitCode: result.exitCode ?? null, observed, location, stderr, engineVerified: false };
}

/** Each probe starts the same literal module in a separate, resource-bounded local Luau process. */
export async function probeCandidate(example, response, { check = checkCandidate, originalResult } = {}) {
  const probes = diagnosisCasesFor(example.id);
  if (typeof response !== 'string' || Buffer.byteLength(response) > 32_000) throw new Error('bounded string response required');
  const match = FENCE.exec(response);
  const source = match?.[2] ?? '';
  const original = stableProbeResult(originalResult ?? await check(example, response), source, example.checks);
  const results = [];
  let stop = ['output-format', 'source-or-context', 'execution-unobserved-or-limited'].includes(original.classification);
  for (const probe of probes) {
    if (stop) {
      results.push({ id: probe.id, category: probe.category, expression: probe.expression, expected: probe.expected,
        passed: null, classification: 'not-run', reason: 'prior-format-source-or-execution-failure' });
      continue;
    }
    const result = stableProbeResult(await check({ ...example, checks: probe.checks }, response), source, probe.checks);
    results.push({ id: probe.id, category: probe.category, expression: probe.expression, expected: probe.expected, ...result });
    stop = result.classification === 'execution-unobserved-or-limited';
  }
  return { responseSha256: hash(response), fenceLanguage: match?.[1] ?? null,
    sourceBytes: Buffer.byteLength(source), original,
    probes: { planned: probes.length, executed: results.filter(r => r.classification !== 'not-run').length,
      passed: results.filter(r => r.passed === true).length, failed: results.filter(r => r.passed === false).length,
      notRun: results.filter(r => r.classification === 'not-run').length, results } };
}

function reader() {
  const observed = new Map();
  const read = (path, cap = 1024 * 1024) => {
    const stat = statSync(path);
    if (!stat.isFile() || stat.size > cap) throw new Error(`artifact is not a bounded file: ${basename(path)}`);
    const bytes = readFileSync(path);
    if (bytes.length > cap) throw new Error('artifact grew beyond cap');
    const digest = hash(bytes);
    if (observed.has(path) && observed.get(path) !== digest) throw new Error(`artifact changed during audit: ${basename(path)}`);
    observed.set(path, digest);
    return bytes;
  };
  return { read, json: path => JSON.parse(read(path)),
    finish: () => { for (const path of observed.keys()) read(path, 32 * 1024 * 1024); } };
}

/** Bind every original input, not just test.jsonl, and refuse split contamination. */
function inspectDataset(dataDirectory, manifest, files) {
  const cardBytes = files.read(join(dataDirectory, 'dataset-card.json'));
  const card = JSON.parse(cardBytes);
  if (card.schema !== 'apple-game-logic-seeds-v1' || card.customerData !== false || card.source !== 'first-party-authored-synthetic'
    || !Number.isSafeInteger(card.examples) || card.examples < 3 || card.examples > 64 || card.digest !== manifest.dataDigest) {
    throw new Error('synthetic bounded dataset card must match pilot digest');
  }
  const inputHashes = { 'dataset-card.json': hash(cardBytes) };
  const rows = {};
  const ids = new Set();
  const sources = new Set();
  const families = new Map();
  for (const split of ['train', 'val', 'test']) {
    const bytes = files.read(join(dataDirectory, `${split}.jsonl`));
    inputHashes[`${split}.jsonl`] = hash(bytes);
    rows[split] = bytes.toString().trim().split('\n').map(line => JSON.parse(line));
    if (!rows[split].length || rows[split].length !== card.splitSizes?.[split]) throw new Error('dataset split size mismatch');
    for (const row of rows[split]) {
      const meta = row.meta;
      const example = ALL_GAME_LOGIC_CURRICULUM.find(e => e.id === meta?.id);
      const target = FENCE.exec(row.messages?.[2]?.content ?? '');
      if (!example || row.messages?.map(m => m.role).join(',') !== 'system,user,assistant' || !target
        || row.messages[1].content !== example.prompt || target[2] !== example.source
        || meta.origin !== 'first-party-authored-synthetic' || meta.family !== example.family
        || meta.evidence?.sourceSha256 !== hash(target[2]) || meta.evidence?.checksSha256 !== hash(example.checks)
        || meta.evidence?.behaviorPassed !== true || meta.evidence?.mutationRejected !== true
        || meta.evidence?.studioVerified !== false) throw new Error('dataset row differs from synthetic execution evidence');
      if (ids.has(meta.id) || sources.has(hash(target[2]))) throw new Error('duplicate dataset identity or source');
      if (card.families?.[meta.family] !== split || (families.has(meta.family) && families.get(meta.family) !== split)) {
        throw new Error('semantic family leaks across splits');
      }
      ids.add(meta.id); sources.add(hash(target[2])); families.set(meta.family, split);
    }
  }
  if (ids.size !== card.examples || families.size !== Object.keys(card.families).length) throw new Error('dataset cardinality mismatch');
  for (const [name, digest] of Object.entries(inputHashes)) {
    if (manifest.inputHashes?.[name] !== digest) throw new Error(`input changed since training: ${name}`);
  }
  return { card, rows, inputHashes };
}

export async function auditSavedPilot(directory, dataDirectory) {
  const files = reader();
  const manifest = files.json(join(directory, 'manifest.json'));
  const completed = files.json(join(directory, 'completed.json'));
  const replay = files.json(join(directory, 'replay.json'));
  if (manifest.productionPromotion !== false || completed.trainingCompleted !== true || completed.productionPromotion !== false
    || replay.freshProcessReload !== true || replay.productionPromotion !== false
    || !Number.isSafeInteger(manifest.config?.iters) || manifest.config.iters < 1 || manifest.config.iters > 128) {
    throw new Error('completed bounded non-production pilot with recorded replay required');
  }
  const adapter = files.read(join(directory, 'adapter', 'adapters.safetensors'), 32 * 1024 * 1024);
  if (hash(adapter) !== completed.adapterSha256 || adapter.length !== completed.adapterBytes) throw new Error('adapter changed since completion');
  const dataset = inspectDataset(dataDirectory, manifest, files);
  const examples = dataset.rows.test.map(row => {
    diagnosisCasesFor(row.meta.id); // Unsupported families fail closed, never disappear from the denominator.
    return ALL_GAME_LOGIC_CURRICULUM.find(e => e.id === row.meta.id);
  });
  const answers = new Map();
  for (const example of examples) {
    for (const phase of ['before', 'after']) {
      const answer = files.json(join(directory, `${phase}-${example.id}.json`));
      if (answer.id !== example.id || answer.phase !== phase || typeof answer.response !== 'string'
        || Buffer.byteLength(answer.response) > 32_000) throw new Error('mismatched or unbounded saved response');
      answers.set(`${phase}-${example.id}`, answer.response);
    }
  }
  // Read-only function, never the scorer CLI which writes into historical artifact directories.
  const scored = await scorePilot(directory, dataDirectory);
  const reference = [];
  for (const example of examples) {
    const result = await probeCandidate(example, fence(example.source));
    if (!result.original.passed || result.probes.notRun || result.probes.failed) {
      throw new Error(`reference probe failed or unavailable: ${example.id}`);
    }
    reference.push({ id: example.id, sourceSha256: hash(example.source), originalPassed: true,
      diagnosticProbesPassed: result.probes.passed });
  }
  const outputs = [];
  for (const example of examples) {
    const original = scored.scores.find(row => row.id === example.id);
    for (const phase of ['before', 'after']) {
      outputs.push({ id: example.id, family: example.family, phase,
        ...await probeCandidate(example, answers.get(`${phase}-${example.id}`), { originalResult: original[phase] }) });
    }
  }
  files.finish();
  return { schema: 'apple-saved-pilot-probe-audit-v1', kind: 'saved-output-development-audit-not-promotion',
    run: basename(resolve(directory)), iterations: manifest.config.iters,
    dataset: { examples: dataset.card.examples, splitSizes: dataset.card.splitSizes,
      digest: dataset.card.digest, inputHashes: dataset.inputHashes, families: dataset.card.families },
    artifact: { adapterSha256: completed.adapterSha256, adapterBytes: adapter.length,
      recordedFreshProcessReplayVerified: scored.freshProcessReloadVerified, weightsReloadedNow: false },
    original: { examples: scored.examples, beforePassed: scored.beforePassed, afterPassed: scored.afterPassed },
    reference, outputs, trainingStarted: false, providerSpendUsd: 0, productionPromotion: false, studioVerified: false,
    limitations: [
      'exposed development families; these probes are not training data or an independent benchmark',
      'probe counts measure these selected cases only; not a capability or promotion score',
      'each probe starts a fresh module; the original composite contract is also executed unchanged',
      'no new inference or adapter reload; recorded replay evidence is checked against saved answers',
      'generation token counts/stop reasons were not stored; no token-level truncation claim',
      'local process ceilings are not an OS security jail; only inspected synthetic pilot code belongs here',
      'no Roblox engine, visuals, networking, production serving, or whole-agent execution',
    ] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args.some(arg => arg.startsWith('--'))) throw new Error('usage: saved-pilot-probe-audit.mjs RUN_DIRECTORY DATA_DIRECTORY');
  console.log(JSON.stringify(await auditSavedPilot(...args), null, 2));
}

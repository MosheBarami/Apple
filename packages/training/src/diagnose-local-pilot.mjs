#!/usr/bin/env node
/** Read-only, offline diagnosis of saved synthetic development-pilot responses.
 * No model load, generation, training, provider access, dataset rewrite, or promotion.
 * The ORIGINAL all-or-nothing score is rerun unchanged and kept separate from diagnostics.
 */
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { parseLuau, findNodes } from '../../evals/src/luau-ast.mjs';
import { detectContextDependencies } from './audit-dataset.mjs';
import { ALL_GAME_LOGIC_CURRICULUM } from './build-game-logic.mjs';
import { scorePilot } from './score-local-pilot.mjs';
import { runSpecLocally, isRefusal } from '../../../scripts/lib/sandbox-host.mjs';
import { supplementaryCases } from './local-pilot-diagnostic-cases.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const fence = source => '```luau\n' + source + '\n```';
const DATA_FILES = ['dataset-card.json', 'train.jsonl', 'val.jsonl', 'test.jsonl'];
const LIMITS = Object.freeze({ wallMs: 2000, memoryMb: 64, outputBytes: 16384, sourceBytes: 120000 });
const MAX_CASES = 64;
const normalizeError = text => String(text ?? '').replace(/[^\s]*[/\\]apple-sandbox-[^/\\\s]+[/\\](?:program|spec)\.luau/g, '<sandbox>/program.luau');

/** Parse, rather than grep, the frozen flat assertion sequence. Comments are not checks.
 * Each diagnostic reloads the module and replays preceding setup/calls in order, catching
 * earlier assertions so their failure cannot hide this assertion. This continuation is NOT
 * the original contract execution; scorePilot remains authoritative for its 0/N verdict.
 * Unsupported control flow/shadowing is refused instead of silently losing coverage.
 */
export function originalAssertionCases(checks) {
  const parsed = parseLuau(checks);
  if (!parsed.ok) throw new Error('diagnostic checks do not parse');
  const isAssert = node => node?.type === 'CallExpression' && node.base?.type === 'Identifier' && node.base.name === 'assert';
  const all = findNodes(parsed.ast, 'CallExpression').filter(isAssert);
  const cases = [];
  const prefix = [];
  for (const node of parsed.ast.body) {
    const text = checks.slice(node.start, node.end);
    if (node.type === 'CallStatement' && isAssert(node.expression)) {
      const call = node.expression;
      if (!call.arguments.length) throw new Error('assertion has no condition');
      const condition = call.arguments[0];
      const expression = checks.slice(condition.start, condition.end);
      let current = `assert(${expression}, "APPLE_DIAG_ASSERT: original assertion")`;
      if (condition.type === 'BinaryExpression' && condition.operator === '=='
        && condition.left?.type === 'CallExpression' && condition.left.base?.name === 'candidate'
        && ['NumericLiteral', 'NilLiteral', 'BooleanLiteral', 'StringLiteral'].includes(condition.right?.type)) {
        const invoke = checks.slice(condition.left.start, condition.left.end);
        const expected = checks.slice(condition.right.start, condition.right.end);
        current = `local __diagnostic_observed = ${invoke}\nassert(__diagnostic_observed == ${expected}, "APPLE_DIAG_ASSERT: expected " .. tostring(${expected}) .. "; observed " .. tostring(__diagnostic_observed))`;
      }
      cases.push({ id: `original:${cases.length + 1}`, kind: 'original-assertion-continuation',
        category: 'original-contract', line: node.line, assertion: text,
        checks: [...prefix, current].join('\n') });
      prefix.push(`pcall(function()\n${text}\nend)`);
    } else {
      const setup = node.type === 'LocalStatement'
        && !node.names.some(n => ['assert', 'candidate', 'pcall', 'tostring', '__diagnostic_observed'].includes(n.name));
      const invoke = node.type === 'CallStatement' && node.expression.base?.type === 'Identifier'
        && node.expression.base.name === 'candidate';
      if (!setup && !invoke) throw new Error('unsupported diagnostic setup or shadowing');
      prefix.push(text);
    }
  }
  if (!cases.length || cases.length > MAX_CASES || cases.length !== all.length) {
    throw new Error('missing, nested, or excessive diagnostic assertions');
  }
  return cases;
}

export function inspectSavedAnswer(answer) {
  if (typeof answer !== 'string' || Buffer.byteLength(answer) > 16000) return { classification: 'format', source: null };
  const match = /^\s*```(?:luau|lua)\s*\n([\s\S]*?)\n```\s*$/.exec(answer);
  if (!match) return { classification: 'format', source: null };
  const source = match[1];
  const context = detectContextDependencies(source);
  if (!context.parseOk) return { classification: 'syntax', source: null };
  if (!context.standalone || context.implicitGlobals.length) return { classification: 'context-dependency', source: null };
  return { classification: 'accepted-source', source };
}

const failureClass = message => message.includes('APPLE_DIAG_RETURN_SHAPE') ? 'module-return-shape'
  : message.includes('APPLE_DIAG_ASSERT') ? 'semantic-contract' : 'runtime-error';

/** An incomplete/duplicate/extra result, a killed process, or a refused job is NOT a pass.
 * Only already-reviewed local source is supported. The shared process runner bounds resources;
 * its network enforcement is explicitly unenforced, not a security jail.
 */
export async function diagnoseAnswer(answer, cases, { run = runSpecLocally } = {}) {
  if (!Array.isArray(cases) || !cases.length || cases.length > MAX_CASES
    || cases.some(c => typeof c.id !== 'string' || !c.id || typeof c.checks !== 'string' || !c.checks.trim())
    || new Set(cases.map(c => c.id)).size !== cases.length) throw new Error('invalid diagnostic case list');
  const inspected = inspectSavedAnswer(answer);
  const unavailable = (batch, reason) => batch.map(({ checks, ...c }) => ({ ...c, status: 'unobserved', classification: reason }));
  if (!inspected.source) return { complete: false, classification: inspected.classification, cases: unavailable(cases, inspected.classification) };
  const results = [];
  // Fresh source and setup for every case; a prior case cannot corrupt the following one.
  for (let offset = 0; offset < cases.length; offset += 24) {
    const batch = cases.slice(offset, offset + 24);
    const sent = batch.map(c => ({ name: c.id, code: `local candidate = (function()\n${inspected.source}\nend)()\nassert(type(candidate) == "function", "APPLE_DIAG_RETURN_SHAPE")\n${c.checks}` }));
    const result = await run(sent, LIMITS);
    let reason = null;
    if (isRefusal(result)) reason = `refused:${result.code}`;
    else if (!result?.ok || result.reason !== 'exit' || result.exitCode !== 0 || result.outputTruncated || !result.run) reason = `execution:${result?.reason ?? 'missing'}`;
    else {
      const received = result.run.cases;
      if (!Array.isArray(received) || received.length !== sent.length
        || new Set(received.map(c => c.name)).size !== sent.length
        || received.some(c => !sent.some(s => s.name === c.name) || !['pass', 'fail'].includes(c.status))) reason = 'incomplete-case-report';
    }
    if (reason) {
      results.push(...unavailable(cases.slice(offset), reason));
      break; // Do not keep launching batches after a refusal/timeout/infrastructure failure.
    }
    for (const { checks, ...c } of batch) {
      const actual = result.run.cases.find(row => row.name === c.id);
      const message = normalizeError(actual.message);
      results.push({ ...c, status: actual.status, classification: actual.status === 'pass' ? 'pass' : failureClass(message),
        ...(message ? { message } : {}) });
    }
  }
  const complete = results.length === cases.length && results.every(c => c.status !== 'unobserved');
  return { complete, classification: complete ? 'executed-diagnostics' : 'incomplete-diagnostics', cases: results };
}

const stableScore = result => ({ passed: result.passed, reason: result.reason,
  ...(result.exitCode !== undefined ? { exitCode: result.exitCode } : {}),
  ...(result.stderr ? { stderr: normalizeError(result.stderr) } : {}) });

/** Reads only explicitly supplied synthetic pilot artifacts. Never rewrites any input. */
export async function diagnosePilot(directory, dataDirectory) {
  directory = resolve(directory); dataDirectory = resolve(dataDirectory);
  const observed = new Map();
  function bytes(path, cap = 4 * 1024 * 1024) {
    if (!statSync(path).isFile() || statSync(path).size > cap) throw new Error('artifact is not a bounded regular file');
    const value = readFileSync(path); observed.set(path, sha(value)); return value;
  }
  const json = path => JSON.parse(bytes(path).toString('utf8'));
  const manifest = json(join(directory, 'manifest.json'));
  const completed = json(join(directory, 'completed.json'));
  const card = json(join(dataDirectory, 'dataset-card.json'));
  if (card.customerData !== false || card.source !== 'first-party-authored-synthetic'
    || card.examples < 3 || card.examples > 128) throw new Error('only bounded original synthetic datasets are admitted');
  if (manifest.productionPromotion !== false || completed.productionPromotion !== false || !completed.trainingCompleted
    || manifest.dataDigest !== card.digest || !/^[a-f0-9]{64}$/.test(card.digest)) throw new Error('pilot/card identity mismatch');
  if (!Number.isInteger(manifest.config?.iters) || manifest.config.iters < 1 || manifest.config.iters > 128) throw new Error('unbounded pilot iteration metadata');
  const inputHashes = {};
  const splits = {};
  for (const name of DATA_FILES) {
    const value = bytes(join(dataDirectory, name));
    inputHashes[name] = sha(value);
    if (inputHashes[name] !== manifest.inputHashes?.[name]) throw new Error(`dataset changed since training: ${name}`);
    if (name.endsWith('.jsonl')) splits[name.slice(0, -6)] = value.toString('utf8').trim().split('\n').map(JSON.parse);
  }
  const ids = new Set();
  const families = new Map();
  for (const [split, rows] of Object.entries(splits)) {
    if (!rows.length || rows.length !== card.splitSizes?.[split]) throw new Error('missing or mismatched split');
    for (const row of rows) {
      const meta = row.meta;
      if (!meta || meta.origin !== 'first-party-authored-synthetic' || !/^[a-z][a-z0-9-]+$/.test(meta.id)
        || ids.has(meta.id) || card.families?.[meta.family] !== split
        || (families.has(meta.family) && families.get(meta.family) !== split)) throw new Error('identity, origin, or family split mismatch');
      const source = inspectSavedAnswer(row.messages?.[2]?.content).source;
      if (row.messages?.map(m => m.role).join(',') !== 'system,user,assistant' || !source
        || sha(source) !== meta.evidence?.sourceSha256 || meta.evidence.behaviorPassed !== true
        || meta.evidence.mutationRejected !== true) throw new Error('source evidence or message shape mismatch');
      ids.add(meta.id); families.set(meta.family, split);
    }
  }
  if (ids.size !== card.examples || families.size !== Object.keys(card.families).length || splits.test.length > 8) throw new Error('card population mismatch or too many holdouts');
  bytes(join(directory, 'adapter', 'adapters.safetensors'), 16 * 1024 * 1024);
  const replay = json(join(directory, 'replay.json'));
  const responses = new Map();
  for (const row of splits.test) {
    const example = ALL_GAME_LOGIC_CURRICULUM.find(e => e.id === row.meta.id);
    if (!example || example.family !== row.meta.family || example.prompt !== row.messages[1].content
      || sha(example.source) !== row.meta.evidence.sourceSha256
      || sha(example.checks) !== row.meta.evidence.checksSha256) throw new Error('current reference or checks differ from pilot evidence');
    for (const phase of ['before', 'after']) responses.set(`${phase}:${example.id}`, json(join(directory, `${phase}-${example.id}.json`)));
  }
  // Keep the real existing scorer, including adapter/replay/response/checks-hash validation.
  // Importing its function avoids its CLI's write to historical behavior-report files.
  const original = await scorePilot(directory, dataDirectory);
  const reports = [];
  for (const row of splits.test) {
    const example = ALL_GAME_LOGIC_CURRICULUM.find(e => e.id === row.meta.id);
    const cases = [...originalAssertionCases(example.checks), ...supplementaryCases(example.id)];
    const reference = await diagnoseAnswer(fence(example.source), cases);
    if (!reference.complete || reference.cases.some(c => c.status !== 'pass')) throw new Error(`diagnostic reference did not pass: ${example.id}`);
    const record = { id: example.id, family: example.family, checksSha256: sha(example.checks),
      diagnosticCasesSha256: sha(JSON.stringify(cases)), referencePassed: reference.cases.length };
    for (const phase of ['before', 'after']) {
      const answer = responses.get(`${phase}:${example.id}`).response;
      record[phase] = { responseSha256: sha(answer), sourceSha256: sha(inspectSavedAnswer(answer).source ?? ''),
        original: stableScore(original.scores.find(s => s.id === example.id)[phase]),
        diagnostic: await diagnoseAnswer(answer, cases) };
    }
    const status = (phase, id) => record[phase].diagnostic.cases.find(c => c.id === id)?.status;
    record.diagnosticChanges = {
      newlyFailing: cases.filter(c => status('before', c.id) === 'pass' && status('after', c.id) === 'fail').map(c => c.id),
      newlyPassing: cases.filter(c => status('before', c.id) === 'fail' && status('after', c.id) === 'pass').map(c => c.id),
    };
    reports.push(record);
  }
  // A concurrent edit during observation invalidates the report instead of mixing versions.
  for (const [path, digest] of observed) if (sha(readFileSync(path)) !== digest) throw new Error('input changed during diagnosis');
  return {
    schema: 'apple-saved-pilot-diagnosis-v1', kind: 'development-diagnostics-not-training-or-promotion',
    iterations: manifest.config.iters,
    effectiveDataset: { directory: dataDirectory, digest: card.digest, examples: card.examples, splitSizes: card.splitSizes, inputHashes },
    metadataNotes: manifest.config.data === 'mlx-community/WikiSQL'
      ? ['config.data is an inherited WikiSQL label; effective dataset is the hash-verified local input above, passed directly by local_pilot.py.'] : [],
    originalGate: { examples: original.examples, beforePassed: original.beforePassed, afterPassed: original.afterPassed },
    adapterSha256: completed.adapterSha256, savedReplayEvidenceMatched: original.freshProcessReloadVerified && replay.freshProcessReload === true,
    modelReloadedNow: false, inputsUnchanged: true, diagnosticComplete: reports.every(r => r.before.diagnostic.complete && r.after.diagnostic.complete),
    reports, productionPromotion: false, studioVerified: false, providerSpendUsd: 0,
    limits: LIMITS,
    limitations: ['Known development holdouts, not independent promotion data.',
      'Assertion continuation and supplemental probes do not replace the original score.',
      'No model inference/reload/training, engine, networking, rendering, or full-agent evaluation.',
      'No token-level generation stop reason is present in saved responses.',
      'Local process resource limits are not a network/security jail.'],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [directory, dataDirectory, flag, output, ...extra] = process.argv.slice(2);
    if (!directory || !dataDirectory || extra.length || (flag !== undefined && (flag !== '--out' || !output))) {
      throw new Error('usage: diagnose-local-pilot.mjs RUN_DIRECTORY DATA_DIRECTORY [--out NEW_JSON_FILE]');
    }
    const report = await diagnosePilot(directory, dataDirectory);
    const text = JSON.stringify(report, null, 2) + '\n';
    if (output) writeFileSync(resolve(output), text, { flag: 'wx' });
    else process.stdout.write(text);
    // Completed diagnosis of a failing model is success; missing observations are not.
    if (!report.diagnosticComplete) process.exitCode = 2;
  } catch (error) {
    console.error(`diagnosis failed: ${error.message}`); process.exitCode = 1;
  }
}

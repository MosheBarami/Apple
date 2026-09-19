#!/usr/bin/env node
/**
 * Independent scalar probes for reviewed saved pilot outputs. NOT a promotion scorer.
 * Each probe runs in a fresh bounded Luau process via the existing offline checker.
 * Original scoring, datasets and captured answers are never rewritten. Stdout only.
 */
import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { ALL_GAME_LOGIC_CURRICULUM } from './build-game-logic.mjs';
import { checkCandidate } from './evaluate-game-logic.mjs';
import { scorePilot } from './score-local-pilot.mjs';
import { PILOT_DIAGNOSTIC_CASES } from './pilot-diagnostic-cases.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const fence = /^\s*```(?:luau|lua)\s*\n([\s\S]*?)\n```\s*$/;
const marker = 'APPLE-PROBE-MISMATCH:';
const scalar = value => value === null ? 'nil' : String(value);
export function stableExecution(result) {
  const reason = result.reason ?? 'unknown', exitCode = result.exitCode ?? null;
  return { passed: result.passed === true && reason === 'exit' && exitCode === 0, reason, exitCode,
    stderr: String(result.stderr ?? '').split('\n').map(line => {
      const at = line.indexOf('program.luau:');
      return at < 0 ? line : line.slice(at);
    }).join('\n') };
}

export async function probeSavedResponse(response, probes, check = checkCandidate) {
  if (!Array.isArray(probes) || !probes.length || probes.length > 64
    || new Set(probes.map(p => p.id)).size !== probes.length) throw new Error('bounded unique probes required');
  const cases = [];
  for (const p of probes) {
    if (!/^[a-z][a-z0-9-]+$/.test(p.id) || typeof p.expression !== 'string'
      || !(p.expected === null || typeof p.expected === 'boolean'
        || typeof p.expected === 'number' && Number.isFinite(p.expected))) throw new Error('invalid probe');
    const checks = `${p.setup ?? ''}\nlocal actual = (${p.expression})
local description = type(actual)
if type(actual) == "number" or type(actual) == "boolean" or type(actual) == "nil" then
    description ..= ":" .. tostring(actual)
end
assert(actual == ${scalar(p.expected)}, "${marker}${p.id}:" .. description)`;
    const execution = stableExecution(await check({ checks }, response));
    let outcome = 'unobserved', actual = null;
    if (execution.passed) {
      outcome = 'pass'; actual = scalar(p.expected);
    } else if (execution.reason === 'expected_single_code_block') outcome = 'format';
    else if (execution.reason === 'invalid_or_context_dependent_source') outcome = 'parse-or-context';
    else if (execution.reason === 'exit' && execution.exitCode !== null && execution.exitCode !== 0) {
      const needle = `${marker}${p.id}:`;
      const at = execution.stderr.indexOf(needle);
      outcome = at < 0 ? 'runtime-error' : 'wrong-result';
      if (at >= 0) actual = execution.stderr.slice(at + needle.length).split('\n')[0];
    }
    cases.push({ id: p.id, category: p.category, scope: p.scope, expression: p.expression,
      expected: p.expected, actual, outcome, execution });
  }
  const counts = {};
  for (const item of cases) counts[item.outcome] = (counts[item.outcome] ?? 0) + 1;
  return { total: cases.length, counts, cases, complete: !counts.unobserved };
}

export async function verifyProbeReference(example, probes) {
  const result = await probeSavedResponse('```luau\n' + example.source + '\n```', probes);
  const failed = result.cases.find(c => c.outcome !== 'pass');
  if (failed) throw new Error(`probe reference failed: ${example.id}/${failed.id} (${failed.outcome})`);
  return { id: example.id, passed: result.total, sourceSha256: hash(example.source), probesSha256: hash(JSON.stringify(probes)) };
}

export async function replayPilotProbes(directory, dataDirectory) {
  const snapshots = new Map();
  const read = (path, limit = 1024 * 1024) => {
    if (!statSync(path).isFile() || statSync(path).size > limit) throw new Error('bounded artifact required');
    const bytes = readFileSync(path), digest = hash(bytes);
    if (snapshots.has(path) && snapshots.get(path) !== digest) throw new Error('artifact changed during diagnosis');
    snapshots.set(path, digest); return bytes;
  };
  const json = name => JSON.parse(read(join(directory, name)));
  const manifest = json('manifest.json'), completed = json('completed.json');
  const card = JSON.parse(read(join(dataDirectory, 'dataset-card.json')));
  const rows = {};
  for (const name of ['dataset-card.json', 'train.jsonl', 'val.jsonl', 'test.jsonl']) {
    const bytes = read(join(dataDirectory, name));
    if (hash(bytes) !== manifest.inputHashes?.[name]) throw new Error(`dataset changed: ${name}`);
    if (name.endsWith('.jsonl')) rows[name] = bytes.toString().trim().split('\n').map(JSON.parse);
  }
  if (card.digest !== manifest.dataDigest || card.customerData !== false || card.source !== 'first-party-authored-synthetic') {
    throw new Error('original synthetic dataset required');
  }
  // Bound and snapshot ALL inputs before the existing scorer can read or execute them.
  // Shared-tree mutation must not combine a score from one response with probes from another.
  read(join(directory, 'adapter', 'adapters.safetensors'), 64 * 1024 * 1024);
  json('replay.json');
  const recorded = json('behavior-report-reloaded.json');
  const answers = {};
  for (const row of rows['test.jsonl']) {
    if (!/^[a-z][a-z0-9-]+$/.test(row.meta?.id ?? '') || Object.hasOwn(answers, row.meta.id)) throw new Error('invalid response identity');
    answers[row.meta.id] = {};
    for (const phase of ['before', 'after']) {
      const answer = json(`${phase}-${row.meta.id}.json`);
      if (answer.id !== row.meta.id || answer.phase !== phase || typeof answer.response !== 'string') throw new Error('response identity mismatch');
      answers[row.meta.id][phase] = answer;
    }
  }
  const original = await scorePilot(directory, dataDirectory);
  if (!original.freshProcessReloadVerified) throw new Error('saved replay required');
  const references = [], samples = [];
  for (const row of rows['test.jsonl']) {
    const e = ALL_GAME_LOGIC_CURRICULUM.find(e => e.id === row.meta.id);
    if (!e || !PILOT_DIAGNOSTIC_CASES[e.id] || card.families?.[e.family] !== 'test'
      || row.meta.origin !== 'first-party-authored-synthetic' || row.meta.family !== e.family
      || row.messages[1].content !== e.prompt || row.messages[2].content !== '```luau\n' + e.source + '\n```'
      || hash(e.source) !== row.meta.evidence.sourceSha256) throw new Error('unsupported or changed reference');
    const probes = PILOT_DIAGNOSTIC_CASES[e.id];
    references.push(await verifyProbeReference(e, probes));
    for (const phase of ['before', 'after']) {
      const answer = answers[e.id][phase];
      const frozen = stableExecution(original.scores.find(s => s.id === e.id)[phase]);
      const source = fence.exec(answer.response)?.[1];
      const programLine = Number(/program\.luau:(\d+):/.exec(frozen.stderr)?.[1]);
      const checksLine = source === undefined ? NaN : programLine - source.split('\n').length - 2;
      const statement = e.checks.split('\n')[checksLine - 1];
      const historical = recorded.scores?.find(s => s.id === e.id)?.[phase];
      samples.push({ id: e.id, phase, responseSha256: hash(answer.response), frozen,
        firstFailure: statement === undefined ? null : { checksLine, statement },
        recordedOutcomeMatches: historical?.passed === frozen.passed && historical?.exitCode === frozen.exitCode && historical?.reason === frozen.reason,
        probes: await probeSavedResponse(answer.response, probes) });
    }
  }
  for (const [path, before] of snapshots) if (hash(readFileSync(path)) !== before) throw new Error('artifact changed during diagnosis');
  return { kind: 'independent-saved-output-probes-not-promotion', iterations: manifest.config.iters,
    dataset: { examples: card.examples, splitSizes: card.splitSizes, digest: card.digest, inputHashes: manifest.inputHashes },
    adapterSha256: completed.adapterSha256,
    frozenVerdict: { beforePassed: original.beforePassed, afterPassed: original.afterPassed, total: original.examples },
    references, samples, inputsUnchanged: true, inputSnapshotSha256: hash(JSON.stringify([...snapshots.values()])),
    savedReplayEvidenceVerified: true, diagnosticComplete: samples.every(s => s.probes.complete),
    trainingStarted: false, newGeneration: false, providerSpendUsd: 0, productionPromotion: false, studioVerified: false,
    limitations: ['known development failures, not a benchmark', 'probe counts do not replace the frozen verdict',
      'no fresh model load/generation/reload', 'no recorded output-token count or stop reason',
      'local Luau only; no engine, visual, networking or whole-agent verification',
      'bounded local-process execution is not an OS security jail; reviewed local artifacts only'] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args.some(a => a.startsWith('--'))) throw new Error('usage: pilot-probe-replay.mjs RUN_DIRECTORY DATA_DIRECTORY');
  console.log(JSON.stringify(await replayPilotProbes(args[0], args[1]), null, 2));
}

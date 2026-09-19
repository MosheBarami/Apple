#!/usr/bin/env node
/** Execute both sides of a development pilot under the same held-out Luau contracts. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { ALL_GAME_LOGIC_CURRICULUM } from './build-game-logic.mjs';
import { checkCandidate } from './evaluate-game-logic.mjs';

export async function scorePilot(directory, dataDirectory, check = checkCandidate) {
  const read = (name) => JSON.parse(readFileSync(join(directory, name), 'utf8'));
  const manifest = read('manifest.json');
  const completed = read('completed.json');
  if (!completed.trainingCompleted || completed.productionPromotion !== false) throw new Error('completed non-production pilot required');
  const adapter = readFileSync(join(directory, 'adapter', 'adapters.safetensors'));
  if (createHash('sha256').update(adapter).digest('hex') !== completed.adapterSha256) throw new Error('adapter changed since completion');
  const data = readFileSync(join(dataDirectory, 'test.jsonl'));
  if (createHash('sha256').update(data).digest('hex') !== manifest.inputHashes['test.jsonl']) throw new Error('holdout changed since training');
  const rows = data.toString().trim().split('\n').map(JSON.parse);
  const replay = existsSync(join(directory, 'replay.json')) ? read('replay.json') : null;
  if (replay && (!replay.freshProcessReload || replay.adapterSha256 !== completed.adapterSha256 || replay.results?.length !== rows.length)) throw new Error('invalid saved-adapter replay');
  const scores = [];
  for (const row of rows) {
    const example = ALL_GAME_LOGIC_CURRICULUM.find((entry) => entry.id === row.meta.id);
    if (!example || createHash('sha256').update(example.checks).digest('hex') !== row.meta.evidence.checksSha256) throw new Error('missing or changed evaluation checks');
    const record = { id: example.id };
    for (const phase of ['before', 'after']) {
      const answer = read(`${phase}-${example.id}.json`);
      if (answer.id !== example.id || answer.phase !== phase) throw new Error('mismatched response identity');
      if (phase === 'after' && replay) {
        const reloaded = replay.results.filter(r => r.id === example.id);
        if (reloaded.length !== 1 || reloaded[0].response !== answer.response) throw new Error('reloaded adapter does not reproduce the scored response');
      }
      record[phase] = await check(example, answer.response);
    }
    scores.push(record);
  }
  if (!scores.length) throw new Error('empty holdout');
  return { kind: 'development-pilot-comparison', examples: scores.length,
    beforePassed: scores.filter(r => r.before.passed).length, afterPassed: scores.filter(r => r.after.passed).length,
    scores, freshProcessReloadVerified: !!replay, productionPromotion: false, studioVerified: false,
    limitations: ['tiny development holdout, not an independent promotion benchmark', 'no engine, visual, networking or whole-agent execution', ...(!replay ? ['after samples use in-memory weights; fresh-process adapter replay is still required'] : [])] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [directory, dataDirectory] = process.argv.slice(2);
  if (!directory || !dataDirectory) throw new Error('usage: score-local-pilot.mjs RUN_DIRECTORY DATA_DIRECTORY');
  const report = await scorePilot(directory, dataDirectory);
  writeFileSync(join(directory, report.freshProcessReloadVerified ? 'behavior-report-reloaded.json' : 'behavior-report.json'), JSON.stringify(report, null, 2) + '\n', {flag:'wx'});
  console.log(JSON.stringify(report, null, 2));
}

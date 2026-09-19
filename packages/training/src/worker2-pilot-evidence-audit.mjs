#!/usr/bin/env node
/** Offline provenance diagnosis only. Read explicitly supplied synthetic artifacts, never infer,
 * train, repartition, rewrite a historical report, or read customer conversations. Does not replace
 * executable behavior scoring. Its purpose is to prevent the untrained 24-row card or an inherited
 * config.data label from being reported as the effective dataset of the saved 20-row runs.
 */
import { readFileSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const sha = value => createHash('sha256').update(value).digest('hex');
const SPLITS = ['train', 'val', 'test'];
const FILES = ['dataset-card.json', ...SPLITS.map(s => `${s}.jsonl`)];
const ID = /^[a-z][a-z0-9-]{0,79}$/;

function reader() {
  const seen = new Map();
  const bytes = path => {
    const stat = statSync(path);
    if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw new Error('bounded regular artifact required');
    const value = readFileSync(path);
    if (value.length > 2 * 1024 * 1024) throw new Error('artifact grew past bound');
    seen.set(path, sha(value));
    return value;
  };
  return { bytes, json: path => JSON.parse(bytes(path).toString('utf8')),
    unchanged() {
      for (const [path, digest] of seen) if (sha(readFileSync(path)) !== digest) throw new Error('input changed during audit');
      return true;
    } };
}

function dataset(directory, read) {
  // Check declared consent/origin before opening any row files. Only these explicit synthetic
  // directories are supported; do not discover or crawl corpus/customer directories.
  const card = read.json(join(directory, 'dataset-card.json'));
  if (card.customerData !== false || card.source !== 'first-party-authored-synthetic'
    || !Number.isSafeInteger(card.examples) || card.examples < 3 || card.examples > 128
    || !/^[a-f0-9]{64}$/.test(card.digest ?? '') || !card.families || !card.splitSizes) {
    throw new Error('bounded first-party synthetic card required');
  }
  const splits = {}, families = new Map(), ids = new Set();
  const hashes = { 'dataset-card.json': sha(read.bytes(join(directory, 'dataset-card.json'))) };
  for (const split of SPLITS) {
    const bytes = read.bytes(join(directory, `${split}.jsonl`));
    hashes[`${split}.jsonl`] = sha(bytes);
    const lines = bytes.toString('utf8').trim().split('\n');
    if (!lines[0] || lines.length > 128) throw new Error('empty or oversized split');
    const rows = lines.map(JSON.parse);
    if (rows.length !== card.splitSizes[split]) throw new Error('split size differs from card');
    for (const row of rows) {
      const meta = row.meta;
      if (!meta || typeof meta.id !== 'string' || typeof meta.family !== 'string'
        || !ID.test(meta.id) || !ID.test(meta.family) || ids.has(meta.id)
        || meta.origin !== 'first-party-authored-synthetic') throw new Error('invalid synthetic row identity');
      if (card.families[meta.family] !== split || (families.has(meta.family) && families.get(meta.family) !== split)) {
        throw new Error('family crosses splits or differs from card');
      }
      ids.add(meta.id); families.set(meta.family, split);
      if (!Array.isArray(row.messages) || row.messages.map(m => m.role).join(',') !== 'system,user,assistant'
        || row.messages.some(m => typeof m.content !== 'string' || !m.content.trim())) throw new Error('invalid row messages');
    }
    splits[split] = rows;
  }
  if (ids.size !== card.examples || families.size !== Object.keys(card.families).length) throw new Error('card population differs from rows');
  return { card, hashes, splits };
}

export function auditPilotDatasetLineage(priorDirectory, reviewedDirectory, runDirectories = []) {
  if (!Array.isArray(runDirectories) || runDirectories.length > 4) throw new Error('at most four explicit runs');
  const read = reader();
  const prior = dataset(priorDirectory, read), reviewed = dataset(reviewedDirectory, read);
  const previousFamilies = Object.entries(prior.card.families);
  if (reviewed.card.lineage?.previousDigest !== prior.card.digest
    || reviewed.card.lineage?.preservedFamilies !== previousFamilies.length) throw new Error('reviewed card lineage mismatch');
  for (const [family, split] of previousFamilies) {
    if (reviewed.card.families[family] !== split) throw new Error(`prior family moved or disappeared: ${family}`);
  }
  for (const split of SPLITS) {
    for (const row of prior.splits[split]) {
      const same = reviewed.splits[split].find(r => r.meta.id === row.meta.id);
      if (!same || JSON.stringify(same) !== JSON.stringify(row)) throw new Error(`prior example changed: ${row.meta.id}`);
    }
  }
  const runs = runDirectories.map(directory => {
    const manifest = read.json(join(directory, 'manifest.json'));
    if (manifest.productionPromotion !== false || !Number.isSafeInteger(manifest.config?.iters)
      || manifest.config.iters < 1 || manifest.config.iters > 128 || manifest.dataDigest !== prior.card.digest) {
      throw new Error('bounded non-production manifest does not bind prior dataset');
    }
    for (const name of FILES) {
      if (manifest.inputHashes?.[name] !== prior.hashes[name]) throw new Error(`input changed since training: ${name}`);
    }
    return { run: basename(resolve(directory)), iterations: manifest.config.iters,
      hashBoundDatasetDigest: prior.card.digest, hashBoundExamples: prior.card.examples,
      hashBoundSplitSizes: prior.card.splitSizes, reportedConfigDataLabel: manifest.config.data ?? null,
      bindsReviewedDataset: manifest.dataDigest === reviewed.card.digest
        && FILES.every(name => manifest.inputHashes[name] === reviewed.hashes[name]) };
  });
  return { schema: 'apple-pilot-dataset-lineage-diagnosis-v1',
    prior: { digest: prior.card.digest, examples: prior.card.examples, splitSizes: prior.card.splitSizes, fileHashes: prior.hashes },
    reviewed: { digest: reviewed.card.digest, examples: reviewed.card.examples, splitSizes: reviewed.card.splitSizes, fileHashes: reviewed.hashes },
    preservedFamilies: previousFamilies.length, priorRowsUnchanged: true,
    addedFamilies: Object.entries(reviewed.card.families).filter(([f]) => !Object.hasOwn(prior.card.families, f))
      .map(([family, split]) => ({ family, split })),
    runs, inputsUnchanged: read.unchanged(), providerSpendUsd: 0, productionPromotion: false,
    trainingStarted: false, modelLoaded: false, studioVerified: false,
    limitations: ['Manifest input hashes bind the data; config.data is reported only as a label, not proof of loader behavior.',
      'This is dataset lineage verification, not a model reload, execution score, or independent promotion benchmark.'] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [prior, reviewed, ...runs] = process.argv.slice(2);
  if (!prior || !reviewed || [prior, reviewed, ...runs].some(p => p.startsWith('--'))) {
    throw new Error('usage: worker2-pilot-evidence-audit.mjs PRIOR_DATA REVIEWED_DATA [RUN_DIRECTORY ...]');
  }
  process.stdout.write(JSON.stringify(auditPilotDatasetLineage(prior, reviewed, runs), null, 2) + '\n');
}

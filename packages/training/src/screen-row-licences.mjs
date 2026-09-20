#!/usr/bin/env node
/**
 * Per-row licence screening for the acquisition queue.
 *
 * WHY THIS EXISTS, and it is not a refinement. `clear-rights.mjs` gives every measured dataset a
 * verdict from the licence its publisher declared ON THE REPOSITORY. That is the right first cut
 * and it is not sufficient, because most of these corpora are scrapes: the uploader tags the
 * compilation, and the files inside came from thousands of third parties who never saw the tag.
 *
 * The case that forced this file: `Pinkstack/luau-pretrain-corpus-unfiltered` is tagged `odc-by`
 * and carries 845,351 rows, the largest single entry in the queue. Its own card says it is the
 * companion to the FILTERED release and "additionally includes files where no license was detected
 * at all". It also ships a per-row `license_type` column, so the question is answerable from the
 * data rather than from the tag — and the answer is 808,084 `no_license` against 37,267
 * `permissive`. The repository tag was covering a corpus that is 95.6% unlicensed.
 *
 * So: where a dataset carries per-row licence evidence, that evidence outranks the repository tag,
 * and the acquirable row count becomes the permissive subset rather than the whole file. Where a
 * dataset carries NO per-row licence, that is recorded too — it is not the same as being clean,
 * and the queue must stop implying it is.
 *
 * Reads runs/rights-clearance.json. Writes runs/row-licence-screening.json, which clear-rights.mjs
 * then folds back into the queue. Uses the public dataset-viewer; no credential is required.
 *
 * Run: node packages/training/src/screen-row-licences.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TRAINING = path.resolve(HERE, '..');
const CLEARANCE = path.join(TRAINING, 'runs/rights-clearance.json');
const OUT = path.join(TRAINING, 'runs/row-licence-screening.json');
const VIEWER = 'https://datasets-server.huggingface.co';

/** Column names that carry a per-row licence. Matched case-insensitively on the whole name. */
const LICENCE_COLUMNS = ['license', 'licence', 'license_type', 'licence_type', 'detected_licenses', 'detected_licences', 'license_name'];

/** Column names that trace a row back to the file it came from, without licensing it. */
const PROVENANCE_COLUMNS = ['repo', 'repo_path', 'repo_id', 'repo_name', 'file_path', 'path', 'url', 'source', 'commit_id'];

/**
 * Per-row licence VALUES that count as permissive.
 *
 * `no_license` is the value that matters and it is deliberately absent: a scraper that looked for
 * a licence and found none has told us the file is unlicensed, which is the opposite of permission.
 */
const PERMISSIVE_VALUES = new Set([
  'permissive', 'mit', 'apache-2.0', 'apache2.0', 'apache 2.0', 'bsd-3-clause', 'bsd-2-clause',
  'isc', 'unlicense', 'cc0-1.0', 'cc0', 'zlib', 'mit-0', 'bsl-1.0',
]);

export function classifyColumns(columnNames) {
  const lower = columnNames.map((c) => String(c).toLowerCase());
  const licence = lower.filter((c) => LICENCE_COLUMNS.includes(c));
  const provenance = lower.filter((c) => PROVENANCE_COLUMNS.includes(c));
  return {
    licence_columns: licence,
    provenance_columns: provenance,
    tier: licence.length > 0 ? 'per_row_licence' : provenance.length > 0 ? 'per_row_source_only' : 'no_provenance',
  };
}

/**
 * Split a `{value: count}` frequency map into permissive and not.
 *
 * Anything unrecognised counts as NOT permissive. A licence nobody has read is not a grant, and a
 * screening that guessed in the permissive direction would defeat its own purpose.
 */
export function splitFrequencies(frequencies) {
  let permissive = 0;
  let notPermissive = 0;
  const unrecognised = {};
  for (const [rawValue, count] of Object.entries(frequencies ?? {})) {
    const value = String(rawValue).trim().toLowerCase();
    if (PERMISSIVE_VALUES.has(value)) permissive += count;
    else {
      notPermissive += count;
      unrecognised[rawValue] = count;
    }
  }
  return { permissive, not_permissive: notPermissive, values_not_counted_as_permissive: unrecognised };
}

async function getJson(url) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'apple-roblox-rights-clearance' } });
    if (!res.ok) return { error: `http ${res.status}` };
    return await res.json();
  } catch (e) {
    return { error: String(e && e.message ? e.message : e) };
  }
}

export async function screenDataset(id) {
  const info = await getJson(`${VIEWER}/info?dataset=${encodeURIComponent(id)}`);
  if (info.error) {
    return { id, screened: false, why_not: `dataset-viewer /info: ${info.error}`, tier: null };
  }
  const configs = Object.keys(info.dataset_info ?? {});
  if (configs.length === 0) return { id, screened: false, why_not: 'no configs reported by the viewer', tier: null };

  const config = configs[0];
  const features = info.dataset_info[config]?.features ?? {};
  const columns = Object.keys(features);
  const shape = classifyColumns(columns);
  const splits = Object.keys(info.dataset_info[config]?.splits ?? {});
  const split = splits.includes('train') ? 'train' : splits[0];

  const base = {
    id,
    screened: true,
    config,
    split: split ?? null,
    columns,
    ...shape,
    multiple_configs: configs.length > 1 ? configs : null,
  };

  if (shape.tier !== 'per_row_licence' || !split) {
    return {
      ...base,
      rows_total: null,
      rows_permissive: null,
      rows_not_permissive: null,
      note:
        shape.tier === 'no_provenance'
          ? 'no per-row licence and no per-row source: the repository tag is the only evidence there is'
          : 'rows trace back to a source file but carry no licence: the repository tag is still the only licence evidence',
    };
  }

  const stats = await getJson(
    `${VIEWER}/statistics?dataset=${encodeURIComponent(id)}&config=${encodeURIComponent(config)}&split=${encodeURIComponent(split)}`,
  );
  if (stats.error) {
    return { ...base, rows_total: null, rows_permissive: null, rows_not_permissive: null, note: `has a licence column but /statistics failed: ${stats.error}` };
  }

  const col = (stats.statistics ?? []).find((c) => shape.licence_columns.includes(String(c.column_name).toLowerCase()) && c.column_statistics?.frequencies);
  if (!col) {
    return { ...base, rows_total: stats.num_examples ?? null, rows_permissive: null, rows_not_permissive: null, note: 'has a licence column but the viewer reported no value frequencies for it' };
  }

  const split2 = splitFrequencies(col.column_statistics.frequencies);
  return {
    ...base,
    licence_column_used: col.column_name,
    rows_total: stats.num_examples ?? null,
    rows_permissive: split2.permissive,
    rows_not_permissive: split2.not_permissive,
    values_not_counted_as_permissive: split2.values_not_counted_as_permissive,
    note: 'per-row licence measured from the dataset-viewer statistics endpoint',
  };
}

async function main() {
  const clearance = JSON.parse(fs.readFileSync(CLEARANCE, 'utf8'));
  const targets = clearance.acquisition_queue.items.filter((i) => i.acquirable && i.rows > 0);

  const results = [];
  for (const t of targets) {
    process.stderr.write(`screening ${t.id} (${t.rows.toLocaleString()} rows) ... `);
    const r = await screenDataset(t.id);
    process.stderr.write(
      r.screened
        ? `${r.tier}${r.rows_permissive != null ? ` — ${r.rows_permissive.toLocaleString()} permissive / ${r.rows_not_permissive.toLocaleString()} not` : ''}\n`
        : `NOT SCREENED (${r.why_not})\n`,
    );
    results.push({ ...r, repository_tag: t.declared_license, rows_claimed_by_queue: t.rows });
  }

  const tier = (t) => results.filter((r) => r.tier === t);
  const sum = (rows, f) => rows.reduce((a, b) => a + (f(b) ?? 0), 0);
  const measured = results.filter((r) => r.rows_permissive != null);

  // Summing `rows_permissive` across datasets double-counts, and the double-count is not
  // hypothetical: `luau-pretrain-corpus-filtered` IS the permissive subset of
  // `luau-pretrain-corpus-unfiltered`, which its card states and which shows up as an identical
  // 37,267 on both. Adding them would report 74,534 permissive rows where 37,267 exist. Equal
  // permissive counts are collapsed to one, which is the same identical-count heuristic the
  // acquisition queue uses for re-uploads, and it is a heuristic: it would also collapse two
  // genuinely distinct corpora that happened to agree to the row.
  const seenPermissiveCounts = new Set();
  const distinctPermissive = measured.reduce((total, r) => {
    const key = String(r.rows_permissive);
    if (r.rows_permissive === 0 || seenPermissiveCounts.has(key)) return total;
    seenPermissiveCounts.add(key);
    return total + r.rows_permissive;
  }, 0);

  const out = {
    generated_at: new Date().toISOString(),
    generator: 'packages/training/src/screen-row-licences.mjs',
    method:
      'For every dataset the queue calls acquirable: read its columns from the dataset-viewer /info '
      + 'endpoint, and where a per-row licence column exists, read that column’s value frequencies '
      + 'from /statistics. Per-row licence evidence outranks the repository tag. An unrecognised '
      + 'licence value is never counted as permissive.',
    permissive_values_recognised: [...PERMISSIVE_VALUES].sort(),
    summary: {
      datasets_screened: results.filter((r) => r.screened).length,
      datasets_not_screened: results.filter((r) => !r.screened).length,
      per_row_licence: tier('per_row_licence').length,
      per_row_source_only: tier('per_row_source_only').length,
      no_provenance: tier('no_provenance').length,
      rows_claimed_by_repository_tag: sum(results, (r) => r.rows_claimed_by_queue),
      rows_with_per_row_licence_measured: sum(measured, (r) => r.rows_total),
      rows_permissive_by_per_row_evidence: sum(measured, (r) => r.rows_permissive),
      rows_permissive_distinct_after_collapsing_overlap: distinctPermissive,
      rows_rejected_by_per_row_evidence: sum(measured, (r) => r.rows_not_permissive),
      rows_resting_on_repository_tag_alone: sum(
        results.filter((r) => r.rows_permissive == null),
        (r) => r.rows_claimed_by_queue,
      ),
    },
    datasets: results,
    limits: [
      'A dataset with no licence column is not thereby clean; it is unscreened, and its repository tag remains the only evidence.',
      'Value frequencies come from the viewer’s own statistics; they were not recomputed from the rows.',
      'A per-row licence recorded by a scraper is that scraper’s detection result, not a licence audit.',
      'Overlapping permissive subsets are collapsed by equal row count, which would also collapse two distinct corpora that happened to agree to the row.',
    ],
  };

  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
  process.stderr.write(`\nwrote ${path.relative(path.resolve(TRAINING, '../..'), OUT)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}

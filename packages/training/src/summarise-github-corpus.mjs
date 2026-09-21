#!/usr/bin/env node
/**
 * The card for the GitHub corpus, derived from the corpus.
 *
 * Every hand-written list in this repository has outlived what it lists. `check-credit-figures.mjs`
 * carried a mode that had been withdrawn and reported `NaN` for its price; `pick-asset-wall.mjs`
 * balanced three packs perfectly and put six playing cards on the landing page. So nothing here is
 * typed: every count, every licence, every repository name is read out of `repos.jsonl` and
 * `rows.jsonl` at the moment of writing, and the card records the sha256 of the ledger it was
 * derived from so a reader can tell whether it has drifted.
 *
 *   node packages/training/src/summarise-github-corpus.mjs [--dir=packages/training/data/roblox-github-v1]
 *
 * The card is the only part of this corpus that reaches a fresh clone. `rows.jsonl` is third-party
 * Luau and is gitignored; `repos.jsonl` is the licence ledger and is tracked. So the card must
 * state what the data is, what verified it, and — the part that goes missing — what it does NOT
 * establish.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { syntaxReportApplies } from './check-luau-syntax.mjs';
import { currencyReportApplies } from './measure-luau-currency.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Count occurrences of `key(row)` and return the map, biggest first. Empty in, empty out. */
export function tally(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const k = key(r);
    if (k === undefined || k === null) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Object.fromEntries([...m].sort((a, b) => b[1] - a[1]));
}

/**
 * The split a reader needs and a single total hides.
 *
 * `rows` is not one number. 23% of the Luau in these repositories is one Tarmac-generated icon
 * template, and a corpus that reports 36,366 without saying so is describing something four times
 * larger than it holds. Shapes are distinct programs after literals are placeholdered.
 */
export function splitRows(rows) {
  const generated = rows.filter((r) => r.generated === true);
  const handwritten = rows.filter((r) => r.generated !== true);
  return {
    rows_total: rows.length,
    rows_machine_generated: generated.length,
    rows_hand_written: handwritten.length,
    distinct_shapes_total: new Set(rows.map((r) => r.shape_sha256)).size,
    distinct_shapes_hand_written: new Set(handwritten.map((r) => r.shape_sha256)).size,
    bytes_total: rows.reduce((n, r) => n + (r.bytes || 0), 0),
    bytes_hand_written: handwritten.reduce((n, r) => n + (r.bytes || 0), 0),
  };
}

/* c8 ignore start -- filesystem driver */
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const a = process.argv.find((x) => x.startsWith('--dir='));
  const DIR = resolve(a ? a.split('=')[1] : join(HERE, '..', 'data', 'roblox-github-v1'));
  const ROWS = join(DIR, 'rows.jsonl');
  const REPOS = join(DIR, 'repos.jsonl');
  for (const p of [ROWS, REPOS]) {
    if (!existsSync(p)) { console.error(`${p} does not exist — run acquire-github-luau.mjs first.`); process.exit(2); }
  }

  const repoBuf = readFileSync(REPOS);
  const repos = repoBuf.toString('utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const rows = readFileSync(ROWS, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  if (repos.length === 0 || rows.length === 0) { console.error('an artifact is empty — refusing to write a card describing nothing.'); process.exit(3); }

  const acquired = repos.filter((r) => r.status === 'acquired');
  const split = splitRows(rows);

  // `luau_compiler` said `not_run` for as long as it was true. It is read from the gate's own
  // report now rather than hand-edited, so the card cannot drift from the measurement — and the
  // report has to be about THIS corpus and THIS many rows, or the card goes back to saying the
  // compiler was never run. A report from a fixture shares no row ids and would certify nothing.
  const SYNTAX = join(HERE, '..', 'runs', 'luau-syntax-github-v1.json');
  const corpusRel = DIR.replace(`${resolve(HERE, '..', '..', '..')}/`, '');
  let syntax = 'not_run';
  if (existsSync(SYNTAX)) {
    const rep = JSON.parse(readFileSync(SYNTAX, 'utf8'));
    syntax = syntaxReportApplies(rep, corpusRel, rows.length)
      ? `luau-analyze, ${rep.generated_at}: ${rep.rows_that_parse} of ${rep.rows_checked} rows parse `
        + `(${rep.parse_rate_percent}%), ${rep.rows_that_do_not_parse} do not, ${rep.rows_not_measured} not measured. `
        + 'See packages/training/runs/luau-syntax-github-v1.json. Parsing is the floor, not approval.'
      : `not_run for this corpus — the report at runs/luau-syntax-github-v1.json is about ${rep.corpus} / ${rep.rows_checked} rows`;
  }

  // The fourth pass measured whether this is CURRENT Luau — the thing the request actually names,
  // "כל סוגי הluau העדכניים". It was written up in docs/github-corpus-licences.md and nowhere the
  // machine reads. A document does not fail a build, and the card is the only part of this corpus
  // that reaches a fresh clone; a consumer reading `validation` saw no currency row at all and the
  // list below still told them the corpus had never been checked for it. Same wiring as the
  // compiler row, same staleness guard: quote the report only when it is about this corpus at this
  // size, and say `not_measured` otherwise.
  const CURRENCY = join(HERE, '..', 'runs', 'luau-currency-github-v1.json');
  let currency = 'not_measured';
  let currencyReport = null;
  if (existsSync(CURRENCY)) {
    const rep = JSON.parse(readFileSync(CURRENCY, 'utf8'));
    if (currencyReportApplies(rep, corpusRel, rows.length)) {
      currencyReport = rep;
      currency = `deprecated vocabulary derived from Roblox's own engine reference, ${rep.generated_at}: `
        + `${rep.deprecated_globals.rows_calling_at_least_one} of ${rep.rows_in_corpus} rows call a deprecated GLOBAL `
        + `(${rep.deprecated_globals.percent_of_corpus}%, precise); `
        + `${rep.deprecated_method_names.rows_naming_at_least_one} NAME a deprecated method `
        + `(${rep.deprecated_method_names.percent_of_corpus}%, an UPPER BOUND — a call site never shows the receiver's class); `
        + `${rep.modern_luau.rows_with_at_least_one_marker} carry a modern-Luau marker `
        + `(${rep.modern_luau.percent_of_corpus}%). ${rep.current_luau_candidates} current-Luau CANDIDATES. `
        + 'See packages/training/runs/luau-currency-github-v1.json. Evidence of modernity is never evidence against it.';
    } else {
      currency = `not_measured for this corpus — the report at runs/luau-currency-github-v1.json is about ${rep.corpus} / ${rep.rows_in_corpus} rows`;
    }
  }

  const skipped = repos.filter((r) => r.status === 'skipped_repository_too_large');

  const card = {
    id: 'roblox-github-v1',
    generated_at: new Date().toISOString(),
    generator: 'packages/training/src/summarise-github-corpus.mjs',
    derived_from: {
      'repos.jsonl': { rows: repos.length, sha256: createHash('sha256').update(repoBuf).digest('hex') },
      'rows.jsonl': { rows: rows.length, note: 'gitignored: third-party Luau source, re-fetchable from the pinned revisions in repos.jsonl' },
    },

    what_it_is: 'Luau and Lua source files taken directly from GitHub repositories whose LICENSE text was retrieved at a pinned commit and matched against the SPDX id GitHub detected.',

    rights: {
      evidence_tier: 'licence_text',
      tier_meaning: 'the licence DOCUMENT was retrieved at the pinned revision and its sha256 recorded, per repository. This is the tier clear-rights.mjs reserves for retrieved text — four of the six sources v1 shipped from cap at publisher_declaration_only and never reach it.',
      licences: tally(acquired, (r) => r.api_license_guess),
      repositories_rejected_for_licence_text_mismatch: repos.filter((r) => r.status === 'rejected_licence_text_mismatch').length,
      vendored_paths_excluded: acquired.reduce((n, r) => n + (r.vendored_excluded || 0), 0),
      vendored_exclusion_reason: "a wally Packages/ or node_modules/ inside an MIT repository is a third party's source; the enclosing LICENSE grants none of it",
    },

    repositories: {
      eligible_by_rights: repos.length,
      acquired: acquired.length,
      rejected_licence_text_mismatch: repos.filter((r) => r.status === 'rejected_licence_text_mismatch').length,
      skipped_too_large: skipped.length,
      failed: repos.filter((r) => r.status === 'failed').length,
      statuses: tally(repos, (r) => r.status),
      largest_contributors: acquired.slice().sort((x, y) => (y.rows_written || 0) - (x.rows_written || 0)).slice(0, 10)
        .map((r) => ({ source_id: r.source_id, rows: r.rows_written, machine_generated: r.rows_machine_generated, distinct_shapes: r.distinct_shapes })),
    },

    volume: split,
    volume_note: `${split.rows_machine_generated} of ${split.rows_total} rows carry a generator banner. `
      + `Placeholdering every literal, the ${split.rows_total} rows are ${split.distinct_shapes_total} distinct programs, `
      + `${split.distinct_shapes_hand_written} of them hand-written. Quote whichever number answers the question being asked, and say which it is.`,

    validation: {
      engine_execution: 'not_run',
      luau_compiler: syntax,
      luau_currency: currency,
      human_review: 'not_performed',
      semantic_quality: 'not_measured',
      deduplication: 'exact, on content normalised for line endings and trailing whitespace. Near-duplicates are MEASURED via shape_sha256 and are NOT removed.',
    },

    what_this_does_not_establish: [
      'That the upstream author held the rights they granted. A retrieved LICENSE is the publisher speaking, not a chain of title.',
      'That any file is worth training on. Parsing is the only quality evidence here: nothing executed anything in an engine or scored quality, and training_approved is false with semantic_quality_pass null on every row.',
      // RE-AIMED, not deleted. Until 2026-09-21 this bullet said currency was unmeasured, and that
      // was true. The fourth pass measured it — and measuring it did NOT make the corpus current,
      // so the bullet still belongs here, pointed at what the measurement genuinely cannot reach:
      // a row free of deprecated calls is not thereby modern, and the candidate set is a candidate
      // set. The .lua figure is now read out of the report instead of typed beside it.
      currencyReport
        ? `That the corpus is current Luau. ${currencyReport.current_luau_candidates} rows are CANDIDATES — hand-written, `
          + 'observed to parse, calling no deprecated global — which counts evidence OF modernity and never evidence '
          + `against it: Lua 5.1 that never needed wait() is indistinguishable here from Luau that avoided it. `
          + `${currencyReport.extensions.lua ?? 0} of these rows carry a .lua extension, which is not by itself old code.`
        : 'That the corpus is current Luau. These are repositories as they stood at their pinned commits, and nothing has measured whether their Luau is the current dialect.',
      // Also derived, for the same reason the currency bullet is. Until 2026-09-21 two repositories
      // were over the snapshot cap and 1,956 of their Luau files were outside the corpus; --oversized
      // took them one blob at a time and the count is now zero. A bullet that went on warning about
      // missing files after none were missing would be a disclaimer standing in for a fact, which is
      // the same defect as a fact standing in for a disclaimer.
      skipped.length > 0
        ? `That the counts cover every eligible repository. ${skipped.length} are recorded skipped_repository_too_large `
          + `(${skipped.map((r) => r.source_id).join(', ')}) with their Luau file count, and those files are not here.`
        : 'That any repository was left out for size. None were: every eligible repository was taken, the two over the '
          + 'snapshot cap one blob at a time against the sha their pinned tree named. What the counts still do not cover '
          + 'is vendored source, which is excluded on purpose and counted separately.',
    ],
  };

  const out = join(DIR, 'dataset-card.json');
  writeFileSync(out, `${JSON.stringify(card, null, 2)}\n`);
  console.error(`wrote ${out}`);
  console.error(`${acquired.length} repositories, ${split.rows_total} rows `
    + `(${split.rows_hand_written} hand-written, ${split.rows_machine_generated} generated), `
    + `${split.distinct_shapes_total} distinct shapes`);
}
/* c8 ignore stop */

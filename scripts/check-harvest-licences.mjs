#!/usr/bin/env node
// Every harvested row's licence URL, checked before an ingest spends an hour discovering it.
//
// THE FAILURE THIS COMES FROM. `validateProvenance` requires an https licence URL. Kenney's own
// licence.txt writes the CC0 deed as `http://`, the harvester copied it verbatim, and the ingest
// ran to completion reporting:
//
//     written 453,598 · rejected 57,049 · failed batches 0
//
// Every one of those 57,049 was the same sentence, and together they were the entire Kenney pack —
// the biggest curated library we have, and the whole basis for the claim that this is not a
// Creator Store scrape. The ingest reported it honestly and nobody was reading, because the run
// takes half an hour and the rejects print at the end.
//
// So the check moved to the front. It reads the harvest files and says, in seconds, what fraction
// of each source the ingest is going to refuse and why — before the ingest starts.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toIngestRecord } from './lib/asset-ingest-record.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'packages', 'corpus', 'data');

const FILES = [
  join(DATA, 'asset-seeds.json'),
  ...readdirSync(join(DATA, 'library'))
    .filter((f) => f.endsWith('.json') && f !== 'index.json')
    .map((f) => join(DATA, 'library', f)),
].filter(existsSync);

//[[ IT RUNS THE VALIDATOR ITSELF, RATHER THAN A COPY OF ITS RULES.
//
//   The first version of this file re-stated the rules by hand, and got one wrong immediately: its
//   id pattern began `[a-z0-9]+` where the real ID_RE begins `[a-z0-9][a-z0-9._-]*`. That single
//   omission made it report 102,780 Creator Store rows and 4,239 game_icons rows as "would be
//   REFUSED" — rows that are sitting in D1 right now, ingested successfully. A checker that invents
//   refusals is worse than no checker: it sends somebody to fix data that was never broken, and it
//   buries the one real finding among six false ones.
//
//   So the actual `validateProvenance` is compiled out of the worker and called. The checker and
//   the thing it predicts cannot disagree, because they are the same function.
const { execFileSync } = await import('node:child_process');
const { mkdtempSync } = await import('node:fs');
const { tmpdir } = await import('node:os');
const WORKER = join(ROOT, 'apps', 'worker');
const bundled = join(mkdtempSync(join(tmpdir(), 'harvestcheck-')), 'lib.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'asset-library.ts'), '--bundle', '--format=esm', '--target=es2022',
   '--platform=neutral', '--main-fields=main,module', '--outfile=' + bundled],
  { cwd: WORKER, stdio: 'pipe' });
const { validateProvenance } = await import(`file://${bundled}`);

// The ingest's own options, so the prediction matches the run. Read scripts/ingest-assets.mjs and
// apps/worker/src/asset-ingest.ts if these ever drift.
const OPTS = { seed: true, cc0Only: false, requireImportDate: false };

//[[ THE INGEST NORMALISES http→https FOR A FEW HOSTS, SO THIS MUST TOO — AND MUST SAY SO.
//
//   Predicting the run means applying what the run applies. But a harvest that only passes because
//   the ingest repairs it on the way through is still a sloppy harvest, and a checker that silently
//   benefited from the repair would report "clean" over a file that is wrong on disk. So the rescue
//   is counted and printed separately from the refusals: the ingest will not fail, AND the harvester
//   still needs fixing.
//
//   Kept identical to scripts/ingest-assets.mjs on purpose. If one changes, this number diverges
//   from the run and the divergence is the signal.
const HTTPS_SAME_DOC = /^http:\/\/((www\.)?creativecommons\.org|opengameart\.org|kenney\.nl)\//;
let rescued = 0;
const rescuedBySource = new Map();

let total = 0;
const bySource = new Map();
let unreadable = 0;

for (const f of FILES) {
  let part;
  try { part = JSON.parse(readFileSync(f, 'utf8')); } catch { unreadable++; continue; }
  // A harvest that recorded its own failure is not evidence about anything and is skipped by the
  // ingest too — counting its rows here would make this check disagree with the thing it predicts.
  if (part.failed === true) continue;
  const expandedOpenGameArt = f.endsWith('opengameart-expanded.json');
  for (const a of part.assets ?? []) {
    total++;
    const src = typeof a.source === 'string' ? a.source : '(no source)';
    if (!bySource.has(src)) bySource.set(src, { n: 0, fails: new Map() });
    const s = bySource.get(src);
    s.n++;
    const { _publishedAt, _licenceId, assetCount, ...harvestRecord } = a;
    let rec = toIngestRecord(harvestRecord, { expandedOpenGameArt });
    if (typeof rec.licenceUrl === 'string' && HTTPS_SAME_DOC.test(rec.licenceUrl)) {
      rec = { ...rec, licenceUrl: rec.licenceUrl.replace(/^http:/, 'https:') };
      rescued++;
      rescuedBySource.set(src, (rescuedBySource.get(src) ?? 0) + 1);
    }
    const v = validateProvenance(rec, OPTS);
    if (v.ok) continue;
    for (const err of v.errors) {
      // The message carries the offending value for some rules; keep the first example of each.
      if (!s.fails.has(err)) s.fails.set(err, { n: 0, sample: a.id ?? '(no id)', value: a.licenceUrl ?? a.sourceUrl ?? '' });
      s.fails.get(err).n++;
    }
  }
}

// A WALK THAT FOUND NOTHING IS A BROKEN CHECK, NOT A CLEAN HARVEST — and the two are
// indistinguishable from the exit code otherwise.
if (total === 0) {
  console.error(`HARVEST CHECK IS BLIND — read ${FILES.length} file(s) and found no assets at all.\n`
    + `That is a broken walk, not a clean harvest: it can tell you nothing about what the ingest will refuse.`);
  process.exit(2);
}
if (unreadable) console.error(`note: ${unreadable} file(s) did not parse as JSON and were skipped`);

const rows = [...bySource.entries()].sort((a, b) => b[1].n - a[1].n);
let refused = 0;
const problems = [];
for (const [src, s] of rows) {
  const worst = [...s.fails.values()].reduce((m, x) => Math.max(m, x.n), 0);
  refused += worst;
  const pct = ((worst / s.n) * 100).toFixed(1);
  const mark = worst === 0 ? '  ok' : worst === s.n ? ' ALL' : ' some';
  console.log(`${mark}  ${src.padEnd(16)} ${String(s.n).padStart(7)} rows` + (worst ? `  → ${worst} refused (${pct}%)` : ''));
  for (const [rule, d] of s.fails) {
    console.log(`        ${rule} — ${d.n}, e.g. ${d.sample} carries "${String(d.value).slice(0, 60)}"`);
    problems.push({ src, rule, n: d.n });
  }
}

console.log(`\n${total.toLocaleString()} rows across ${rows.length} source(s)`);
if (rescued) {
  console.log(`\n${rescued.toLocaleString()} row(s) only pass because the ingest rewrites their licence URL from http to`);
  console.log(`https on the way through — the same deed, correctly addressed. The ingest will not fail on`);
  console.log(`them, and the HARVESTER still writes them wrong:`);
  for (const [src, n] of [...rescuedBySource].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${src.padEnd(16)} ${String(n).padStart(7)}`);
  }
}
if (!problems.length) {
  console.log('Every row would pass the ingest validator.');
  process.exit(0);
}
console.error(`\n${refused.toLocaleString()} row(s) would be REFUSED by the ingest (${((refused / total) * 100).toFixed(3)}% of the harvest).`);

//[[ THE EXIT CODE IS A DECISION, AND A CHECKER THAT CANNOT TELL 104 FROM 56,933 IS DECORATIVE.
//
//   Two things this file has seen are not the same thing. Kenney lost 56,933 of 56,933 rows — an
//   entire curated pack, 100%, one character. opengameart loses 87 of 12,458 — rows whose ids
//   genuinely contain spaces and slashes, 0.7%, real malformed data that the ingest correctly
//   refuses and reports.
//
//   Failing on both means somebody disables the check within a month. Failing on neither means the
//   Kenney outage happens again. So the gate is PER SOURCE and it is a rate: losing more than a
//   twentieth of a source is a harvester defect, and losing a handful is the validator doing its
//   job on rows that deserve it. Every refusal is printed either way — the threshold decides the
//   exit code, never what gets said.
const LOSS_LIMIT = 0.05;
const blown = rows
  .map(([src, s]) => [src, s, [...s.fails.values()].reduce((m, x) => Math.max(m, x.n), 0)])
  .filter(([, s, worst]) => worst / s.n > LOSS_LIMIT);

if (!blown.length) {
  console.error(`No single source loses more than ${(LOSS_LIMIT * 100).toFixed(0)}% — these are individually`);
  console.error('malformed rows, which the ingest refuses and reports one by one. Not a harvester defect.');
  process.exit(0);
}
console.error(`\nHARVEST DEFECT — ${blown.length} source(s) lose more than ${(LOSS_LIMIT * 100).toFixed(0)}% of their rows:`);
for (const [src, s, worst] of blown) {
  console.error(`    ${src}: ${worst.toLocaleString()} of ${s.n.toLocaleString()} (${((worst / s.n) * 100).toFixed(1)}%)`);
}
console.error('\nFix the harvest, not the validator: an https licence URL is what makes the obligation');
console.error('checkable, and a row whose licence cannot be reached is a row whose obligation cannot');
console.error('be discharged.');
process.exit(1);

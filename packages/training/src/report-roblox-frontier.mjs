#!/usr/bin/env node
/**
 * TURN THE RUN FILES INTO THE TABLES THE DOCUMENT PRINTS.
 *
 * Every number in docs/roblox-frontier-benchmark.md comes out of this script, not out of anybody's
 * hands. A document whose figures were typed from a terminal is a document that can drift from the
 * evidence on disk without anything going red — and this repository has shipped a summary whose
 * numbers no file supported any more. So the doc quotes this output, and re-running it against the
 * same runs reproduces the doc.
 *
 * It also prints, on its own line and never folded into a percentage:
 *   - how many items were NOT MEASURED (the shared daily budget refused them)
 *   - how many RAN but threw under the harness, with the message, because that can be my gap
 *   - which specific checks failed, which is the actual work queue
 *
 * Usage: node packages/training/src/report-roblox-frontier.mjs [--runs <dir>]
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRONTIER_ITEMS, AXES } from './roblox-frontier-tasks.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const RUNS_DIR = resolve(arg('runs', join(HERE, '..', 'runs')));

const runs = readdirSync(RUNS_DIR)
  .filter((f) => f.startsWith('roblox-frontier-') && f.endsWith('.json'))
  .map((f) => ({ file: f, data: JSON.parse(readFileSync(join(RUNS_DIR, f), 'utf8')) }))
  .sort((a, b) => String(a.data.measuredAt).localeCompare(String(b.data.measuredAt)));

if (!runs.length) {
  console.error(`no roblox-frontier-*.json in ${RUNS_DIR}`);
  process.exit(2);
}

const label = (r) => `${r.data.settings.lane} / ${r.data.settings.productMode} / ${r.data.arm.id}`;
const pad = (s, n) => String(s).padEnd(n);

console.log('## Runs\n');
console.log('| lane / mode / arm | gateway | model | tokens | items passed | of measured | not measured | neurons |');
console.log('|---|---|---|---|---|---|---|---|');
for (const r of runs) {
  const d = r.data;
  const s = d.settings;
  console.log(`| ${label(r)} | ${s.gateway} | ${s.modelId} | ${s.effectiveTokens}${s.clampedByCeiling ? ` (clamped from ${s.requestedTokens})` : ''} `
    + `| **${d.passed}/${d.measured}** (${d.pct}%) | ${d.measured}/${d.items} | ${d.notMeasured} | ${d.neurons} |`);
}

console.log('\n## By axis — items fully correct, and individual checks passed\n');
const header = ['| axis |', ...runs.map((r) => ` ${label(r)} |`)].join('');
console.log(header);
console.log(`|---|${runs.map(() => '---|').join('')}`);
for (const axis of AXES) {
  const cells = runs.map((r) => {
    const a = r.data.byAxis[axis];
    if (!a || !a.measured) return ' — |';
    return ` ${a.passed}/${a.measured} items, ${a.checksPassed}/${a.checksTotal} checks |`;
  });
  console.log(`| ${axis} |${cells.join('')}`);
}

console.log('\n## Per item\n');
console.log(`| item | axis |${runs.map((r) => ` ${label(r)} |`).join('')}`);
console.log(`|---|---|${runs.map(() => '---|').join('')}`);
for (const item of FRONTIER_ITEMS) {
  const cells = runs.map((r) => {
    const row = (r.data.rows ?? []).find((x) => x.id === item.id);
    if (!row) return ' not measured |';
    if (row.outcome !== 'checked') return ` ${row.outcome} |`;
    return row.ok ? ' pass |' : ` FAIL: ${row.failed.join(', ')} |`;
  });
  console.log(`| \`${item.id}\` | ${item.axis} |${cells.join('')}`);
}

console.log('\n## The work queue — every check that failed, and how often\n');
const tally = new Map();
for (const r of runs) {
  for (const f of r.data.failedChecks ?? []) {
    const key = `${f.item}/${f.check}`;
    const e = tally.get(key) ?? { ...f, runs: [], n: 0 };
    e.n += 1;
    e.runs.push(label(r));
    tally.set(key, e);
  }
}
const ordered = [...tally.values()].sort((a, b) => b.n - a.n || a.item.localeCompare(b.item));
if (!ordered.length) console.log('_nothing failed in any run._');
for (const f of ordered) {
  console.log(`- **${f.item} / ${f.check}** — failed in ${f.n} of ${runs.length} run(s) (${[...new Set(f.runs)].join('; ')})`);
  console.log(`  - why it matters: ${f.why}`);
}

console.log('\n## Outcomes that are not scores\n');
for (const r of runs) {
  const d = r.data;
  const nonChecked = (d.rows ?? []).filter((x) => x.outcome !== 'checked');
  console.log(`\n**${label(r)}** — outcomes ${JSON.stringify(d.outcomes)}; not measured ${d.notMeasured}`);
  for (const row of nonChecked) {
    console.log(`  - \`${row.id}\`: ${row.outcome} — ${String(row.detail ?? '').slice(0, 200)}`);
  }
  const probeErrors = (d.rows ?? []).filter((x) => x.probeError);
  for (const row of probeErrors) console.log(`  - \`${row.id}\`: PROBE ERROR — ${String(row.probeError).slice(0, 200)}`);
  const reads = new Map();
  for (const row of d.rows ?? []) for (const u of row.unresolvedReads ?? []) reads.set(u, (reads.get(u) ?? 0) + 1);
  if (reads.size) {
    const top = [...reads.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    console.log(`  - properties the harness had no answer for (its gap, not the model's): ${top.map(([k, v]) => `${k} x${v}`).join(', ')}`);
  }
}

console.log('\n## Answer length and finish reason\n');
for (const r of runs) {
  const rows = (r.data.rows ?? []);
  if (!rows.length) continue;
  const chars = rows.map((x) => x.chars).sort((a, b) => a - b);
  const fr = {};
  for (const x of rows) fr[x.finishReason ?? 'none'] = (fr[x.finishReason ?? 'none'] ?? 0) + 1;
  console.log(`- ${pad(label(r), 34)} median ${chars[Math.floor(chars.length / 2)]}c, range ${chars[0]}-${chars[chars.length - 1]}c, finishReason ${JSON.stringify(fr)}`);
}

console.log('\n## Provenance\n');
for (const r of runs) {
  console.log(`- ${pad(label(r), 34)} ${r.data.measuredAt}  harness ${r.data.provenance?.harness} tasks ${r.data.provenance?.tasks} scorer ${r.data.provenance?.scorer}`);
}

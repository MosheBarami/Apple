/**
 * THE PRICE THE SITE PUBLISHES MUST BE THE PRICE THE WORKER CHARGES.
 *
 * Sparks are charged by `sparksForNeurons(n) = max(1, ceil(n / NEURONS_PER_SPARK))` in
 * apps/worker/src/pricing.ts, against neuron figures measured in docs/COST-MODEL.md.
 * The pricing page states a per-mode cost and a "requests per free day" derived from it.
 * Nothing connected the two, and they had drifted:
 *
 *   Clay is 37-43 neurons. ceil(43/30) = 2 sparks. The page said 1, and 60 requests a
 *   free day when it is 30. Stone (111 -> 4) and Rune (297 -> 10) were both correct,
 *   which is what makes Clay an arithmetic slip rather than a different pricing model.
 *
 * The same number lived in three more places inside SparkMeter.astro — the visible
 * label, the `data-cost` attribute, and a literal `c * 1` in the script that ignored the
 * attribute. Correcting the first two left the calculator computing the old figure.
 *
 * This checks the chain end to end: COST-MODEL neurons -> the worker's own constants ->
 * the page's stated cost -> the slider attribute -> requests per day.
 *
 * Usage: node scripts/check-spark-figures.mjs
 */
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(root + p, 'utf8');

const pricing = read('apps/worker/src/pricing.ts');
const costModel = read('docs/COST-MODEL.md');
const page = read('apps/site/src/pages/pricing.astro');
const meter = read('apps/site/src/components/SparkMeter.astro');

const problems = [];

const perSpark = Number(/NEURONS_PER_SPARK = (\d+)/.exec(pricing)?.[1]);
const freeDay = Number(/free: \{ sparksPerDay: (\d+)/.exec(pricing)?.[1]);
if (!perSpark || !freeDay) {
  console.error('check-spark-figures: could not read NEURONS_PER_SPARK / free sparksPerDay from the worker');
  process.exit(1);
}
const sparksFor = (n) => Math.max(1, Math.ceil(n / perSpark));

/** The highest neuron figure on a COST-MODEL row whose label starts with `label`. */
function neuronsFor(label) {
  const row = costModel.split('\n').find((l) => l.startsWith(`| ${label}`) || l.startsWith(`| **${label}`));
  if (!row) return null;
  // "37–43" or "111" or "**511**"
  const cell = row.split('|')[2].replace(/\*/g, '').trim();
  const numbers = cell.split(/[–-]/).map((x) => Number(x.trim())).filter((n) => Number.isFinite(n));
  return numbers.length ? Math.max(...numbers) : null;
}

// The row each published figure is derived from. Named here rather than guessed, because
// "Stone" has four rows in COST-MODEL and only one of them is the advertised case.
const MODES = [
  { mode: 'Clay', row: 'Clay question (Studio attached)' },
  { mode: 'Stone', row: 'Stone, targeted edit + read-back verify in Studio' },
  { mode: 'Rune', row: 'Rune, build + read-back verify + playtest in Studio' },
];

for (const { mode, row } of MODES) {
  const neurons = neuronsFor(row);
  if (neurons === null) {
    problems.push(`COST-MODEL.md has no row "${row}" — the ${mode} figure cannot be derived`);
    continue;
  }
  const expected = sparksFor(neurons);

  // The pricing page's own table.
  const block = page.slice(page.indexOf(`mode: '${mode}'`));
  const stated = Number(/cost: '(\d+) spark/.exec(block)?.[1]);
  if (stated !== expected) {
    problems.push(`pricing.astro says ${mode} costs ${stated} spark(s); ${neurons} neurons / ${perSpark} = ${expected}`);
  }

  // Requests per free day, where the page states a plain number.
  const perDay = /perDay: '([^']+)'/.exec(block)?.[1];
  if (perDay && /^\d+$/.test(perDay) && Number(perDay) !== Math.floor(freeDay / expected)) {
    problems.push(`pricing.astro says ${perDay} ${mode} requests a free day; ${freeDay} / ${expected} = ${Math.floor(freeDay / expected)}`);
  }

  // The slider's label and its data-cost, which the calculator now reads.
  const ctl = meter.slice(meter.indexOf(`ctl__mode mono">${mode} ·`));
  const label = Number(new RegExp(`${mode} · (\\d+) spark`).exec(ctl)?.[1]);
  const attr = Number(/data-cost="(\d+)"/.exec(ctl)?.[1]);
  if (label !== expected) problems.push(`SparkMeter label says ${mode} · ${label}; expected ${expected}`);
  if (attr !== expected) problems.push(`SparkMeter data-cost for ${mode} is ${attr}; expected ${expected}`);
}

// The calculator must not reintroduce a literal cost.
if (/perDay = c \* \d/.test(meter)) {
  problems.push('SparkMeter computes a mode cost from a literal again instead of reading data-cost');
}

if (problems.length) {
  console.error(`check-spark-figures: ${problems.length} disagreement(s) between the site and the worker\n`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

console.log(`check-spark-figures: ${MODES.length} modes agree — COST-MODEL neurons, the worker's arithmetic, the page and the calculator`);

#!/usr/bin/env node
// Compare two eval result files: prints per-category and overall score deltas
// for every (model, category) present in both runs.
//   node src/compare.mjs results/baseline-*.json results/with-rag-*.json
import { readFileSync } from 'node:fs';

function load(file) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  if (!data.perCategory || !data.overall || !data.runMeta) throw new Error(`${file}: not an eval results file`);
  return data;
}

function pct(n) {
  return (n * 100).toFixed(1);
}

function deltaStr(a, b) {
  const d = (b - a) * 100;
  const sign = d > 0.049 ? '+' : d < -0.049 ? '' : ' ';
  return `${sign}${d.toFixed(1)}`;
}

function main() {
  const [fileA, fileB] = process.argv.slice(2);
  if (!fileA || !fileB) {
    console.error('usage: compare.mjs <results-A.json> <results-B.json>');
    process.exit(2);
  }
  const A = load(fileA);
  const B = load(fileB);
  console.log(`A: ${A.runMeta.tag} (${A.runMeta.startedAt ?? '?'})`);
  console.log(`B: ${B.runMeta.tag} (${B.runMeta.startedAt ?? '?'})\n`);

  const key = (r) => `${r.model} ${r.category}`;
  const mapA = new Map(A.perCategory.map((r) => [key(r), r]));
  const rows = [];
  for (const rb of B.perCategory) {
    const ra = mapA.get(key(rb));
    if (!ra) continue;
    rows.push({ model: rb.model, category: rb.category, a: ra.score, b: rb.score });
  }
  if (rows.length === 0) {
    console.log('no overlapping (model, category) pairs between the two runs.');
  } else {
    rows.sort((x, y) => x.model.localeCompare(y.model) || x.category.localeCompare(y.category));
    const wCat = Math.max(12, ...rows.map((r) => r.category.length)) + 2;
    const wMod = Math.max(6, ...rows.map((r) => r.model.length)) + 2;
    console.log(`${'model'.padEnd(wMod)}${'category'.padEnd(wCat)}${'A'.padStart(7)}${'B'.padStart(7)}${'delta'.padStart(8)}`);
    console.log('-'.repeat(wMod + wCat + 22));
    for (const r of rows) {
      console.log(`${r.model.padEnd(wMod)}${r.category.padEnd(wCat)}${pct(r.a).padStart(7)}${pct(r.b).padStart(7)}${deltaStr(r.a, r.b).padStart(8)}`);
    }
  }

  console.log('\noverall:');
  const oA = new Map(A.overall.map((o) => [o.model, o.score]));
  for (const ob of B.overall) {
    if (!oA.has(ob.model)) continue;
    const a = oA.get(ob.model);
    console.log(`  ${ob.model.padEnd(8)} ${pct(a).padStart(6)} -> ${pct(ob.score).padStart(6)}   (${deltaStr(a, ob.score)})`);
  }
  const onlyB = B.overall.filter((o) => !oA.has(o.model)).map((o) => o.model);
  if (onlyB.length) console.log(`  (models only in B, no delta: ${onlyB.join(', ')})`);
}

main();

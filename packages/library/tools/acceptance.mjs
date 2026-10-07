// Library acceptance L-A1 (count) and L-A2 (licence) of master plan §4.6, over every item file in git.
// L-A1: A/B items per §4.3 category against its target. L-A2: every item has a source, a licence and a licence URL,
// its licence words classify to the class it records and to no banned term, attribution where the licence needs it,
// and a passing ai_check. Prints the report; --out writes it; exits 1 when L-A2 fails (L-A1 is a progress table).
//
//   node packages/library/tools/acceptance.mjs [--items planning/library/items] [--out <report.md>]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { validateItem } from '../src/item.mjs';

export const CATEGORY_OF_KIND = { prop: 1, building: 2, map: 3, character: 4, vehicle: 5, material: 6, sky: 7, lighting: 7, icon: 8, frame: 8, font: 9, vfx: 10, sfx: 11, music: 12, animation: 13, code: 14, knowledge: 15, skill: 16, template: 17 };
export const TARGETS = { 1: ['Props and models', 10000], 2: ['Modular building parts', 5000], 3: ['Complete maps and environments', 300], 4: ['Characters, NPCs, creatures, pets', 1500], 5: ['Vehicles and mechanisms', 400], 6: ['Textures, materials, terrain presets', 1000], 7: ['Skies and lighting presets', 400], 8: ['UI art (icons and frames)', 8500], 9: ['Fonts', null], 10: ['VFX', 2000], 11: ['SFX (indexed)', 30000], 12: ['Music (indexed)', 10000], 13: ['Animations', 1000], 14: ['Code modules', 300], 15: ['Knowledge', null], 16: ['Skills', 500], 17: ['Game templates and starters', 50] };

/** { counts: { category: { A, B, C } }, failures: [{ id, file, errors }] } over items. Pure. */
export function audit(items) {
  const counts = {};
  const failures = [];
  for (const { item, file } of items) {
    const cat = CATEGORY_OF_KIND[item.kind];
    counts[cat] ??= { A: 0, B: 0, C: 0, ungraded: 0 };
    counts[cat][item.grade ?? 'ungraded'] += 1;
    const errors = validateItem(item);
    if (errors.length) failures.push({ id: item.id, file, errors });
  }
  return { counts, failures };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
  const dir = arg('items', 'planning/library/items');
  const items = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort()
    .flatMap((file) => readFileSync(join(dir, file), 'utf8').split('\n').filter(Boolean).map((l) => ({ item: JSON.parse(l), file })));
  const { counts, failures } = audit(items);
  const n = (x) => x.toLocaleString('en-US');
  const rows = Object.entries(TARGETS).map(([c, [name, target]]) => {
    const k = counts[c] ?? { A: 0, B: 0, C: 0, ungraded: 0 };
    const ab = k.A + k.B;
    return `| ${c} | ${name} | ${target ? n(target) : 'all'} | ${n(ab)} | ${n(k.A)} / ${n(k.B)} / ${n(k.C)}${k.ungraded ? ` (+${n(k.ungraded)} ungraded)` : ''} | ${target ? (ab >= target ? 'met' : `${Math.floor((100 * ab) / target)} %`) : '-'} |`;
  });
  const report = [
    `# Library acceptance L-A1 and L-A2 (${new Date().toISOString().slice(0, 10)})`, '',
    `${n(items.length)} items in ${new Set(items.map((i) => i.file)).size} files under \`${dir}\`.`, '',
    '## L-A1 count (A/B items against the §4.3 targets; not yet uploaded or load-tested)', '',
    '| # | Category | Target | A/B | A / B / C | |', '|---|---|---|---|---|---|', ...rows, '',
    `## L-A2 licence: ${failures.length ? `FAIL, ${n(failures.length)} items` : 'PASS'}`, '',
    failures.length ? failures.slice(0, 50).map((f) => `- ${f.id} (${f.file}): ${f.errors.join('; ')}`).join('\n') : 'Every item has a source, a licence class its words support, no banned term, a licence URL, attribution where the licence needs it, and a passing ai_check.',
    '',
  ].join('\n');
  console.log(report);
  if (arg('out')) writeFileSync(arg('out'), report);
  process.exit(failures.length ? 1 : 0);
}

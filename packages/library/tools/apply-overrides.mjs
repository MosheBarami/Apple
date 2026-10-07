// L4 decisions taken after grading (planning/library/maturity-overrides.jsonl): an item set to grade C (a logo, gambling,
// alcohol, a contact sheet) or to maturity Mild (horror styles, offered only on request). Rewrites the item files in
// place, the decision kept in grade_notes as critic 'L4', and writes the touched items (for to-sql.mjs) and the vector
// ids of items that left A/B (for `wrangler vectorize delete-vectors`).
//
//   node packages/library/tools/apply-overrides.mjs <overrides.jsonl> <items-dir> <touched.jsonl> <demoted-vector-ids.txt>
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { vectorId } from '../src/embed.mjs';

/** The item after one override. Pure. */
export function applyOverride(item, o) {
  const notes = (item.grade_notes ?? []).filter((n) => n.critic !== 'L4');
  if (o.grade) return { ...item, grade: o.grade, grade_notes: [...notes, { critic: 'L4', grade: o.grade, why: o.reason }] };
  if (o.maturity) return { ...item, maturity: o.maturity, grade_notes: [...notes, { critic: 'L4', grade: item.grade, why: o.reason }] };
  return item;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [ovFile, dir, touchedFile, demotedFile] = process.argv.slice(2);
  if (!demotedFile) { console.error('usage: apply-overrides.mjs <overrides.jsonl> <items-dir> <touched.jsonl> <demoted-vector-ids.txt>'); process.exit(2); }
  const ov = new Map(readFileSync(ovFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((o) => [o.id, o]));
  const touched = [], demoted = [], found = new Set();
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) {
    const items = readFileSync(join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const out = items.map((it) => {
      const o = ov.get(it.id);
      if (!o) return it;
      found.add(it.id);
      const next = applyOverride(it, o);
      if ((it.grade === 'A' || it.grade === 'B') && next.grade === 'C') demoted.push(vectorId(it.id));
      touched.push(next);
      return next;
    });
    if (out.some((it, k) => it !== items[k])) writeFileSync(join(dir, f), out.map((i) => JSON.stringify(i)).join('\n') + '\n'); // untouched files keep their bytes
  }
  writeFileSync(touchedFile, touched.map((i) => JSON.stringify(i)).join('\n') + '\n');
  writeFileSync(demotedFile, demoted.join('\n') + '\n');
  const missing = [...ov.keys()].filter((id) => !found.has(id));
  console.log(`${touched.length} items changed, ${demoted.length} left A/B${missing.length ? `; not found: ${missing.join(', ')}` : ''}`);
  if (missing.length) process.exit(1);
}

// Master plan §4.3 #6 (textures and materials): ambientCG's PBR materials (CC0), fetched by tools/fetch-ambientcg.mjs.
// One item per material: family by material type (the letters of its id: Wood096 -> wood), the release date and the
// capture technique from the API, the hash of its 1K-JPG zip; its colour map is the preview the critics grade.
// ambientCG (one studio, Lennart Demes, releases since 2017) counts as a known human for the 2024 rule because it has
// releases from before 2023, the same rule the other sources use.
//
//   node packages/library/src/ingest-ambientcg.mjs --dir <fetched> --out <items.jsonl>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { classifyLicence } from './licence.mjs';
import { aiCheck } from './aicheck.mjs';
import { validateItem } from './item.mjs';

/** The material type of an ambientCG id ('PavingStones142' -> 'paving-stones'). Pure. */
export const familyOf = (id) => id.replace(/\d+[A-Z]?$/, '').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
  const dir = arg('dir'), out = arg('out');
  if (!dir || !out) { console.error('usage: ingest-ambientcg.mjs --dir <fetched> --out <items.jsonl>'); process.exit(2); }
  const assets = JSON.parse(readFileSync(join(dir, 'assets.json'), 'utf8'));
  const known = new Set(assets.some((a) => a.releaseDate && a.releaseDate < '2023-01-01') ? ['ambientcg'] : []);
  const lic = classifyLicence('CC0');
  const items = [];
  let rejected = 0, missing = 0;
  for (const a of assets) {
    const f = join(dir, a.id, 'fetch.json');
    if (!existsSync(f)) { missing += 1; continue; }
    const fetched = JSON.parse(readFileSync(f, 'utf8'));
    if (!fetched.color) { missing += 1; continue; }
    const title = `${a.title} material`;
    const tags = [...new Set((a.tags ?? []).filter((t) => t.length > 1 && !/^\d+$/.test(t) && t !== a.id.toLowerCase()))];
    const item = {
      id: `acg:${a.id.toLowerCase()}`, title, kind: 'material', family: `ambientcg:${familyOf(a.id)}`,
      source_url: `https://ambientcg.com/view?id=${a.id}`, author: 'ambientCG (Lennart Demes)',
      licence_words: 'CC0', licence_class: lic.class, licence_url: 'https://docs.ambientcg.com/license/',
      fetched_at: fetched.at, uploader: 'none', file: `${a.id}/color.jpg`, file_sha256: fetched.sha256,
      tags, checks: { format: '1K-JPG PBR set', technique: a.technique, size_cm: a.dimensions ? [a.dimensions.width, a.dimensions.height] : undefined, zip: fetched.file },
      ai_check: aiCheck({ title, tags, created: a.releaseDate, creator: 'ambientcg' }, known, fetched.at),
    };
    const errs = validateItem(item);
    if (errs.length) { rejected += 1; if (rejected <= 10) console.log(`  reject ${item.id}: ${errs.join('; ')}`); } else items.push(item);
  }
  writeFileSync(out, items.map((i) => JSON.stringify(i)).join('\n') + '\n');
  console.log(`${items.length} materials in ${new Set(items.map((i) => i.family)).size} families, ${rejected} rejected, ${missing} not fetched -> ${out}`);
}

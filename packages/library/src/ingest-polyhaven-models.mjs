// Master plan §4.3 #1, #2, #4 (props, building parts, vehicles): Poly Haven's 3D models (CC0), fetched by
// tools/fetch-polyhaven-models.mjs and drawn by tools/render-models.mjs. One item per model, credited to its modeller,
// dated by its publication; the family is its Poly Haven collection (models made to go together) or else its top
// category. For the 2024 rule the creator is Poly Haven itself, as for its skies (ingest-skies.mjs). Photoscanned models
// can be very dense: one over Roblox's mesh import limit (20,000 triangles a mesh) or over 100,000 in all is left out.
//
//   node packages/library/src/ingest-polyhaven-models.mjs list --dir <fetched> --out <list.json>
//   node packages/library/src/ingest-polyhaven-models.mjs ingest --dir <fetched> --stats <thumbs>/stats.jsonl --out <items.jsonl>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { classifyLicence } from './licence.mjs';
import { aiCheck } from './aicheck.mjs';
import { validateItem } from './item.mjs';

const day = (unix) => (unix ? new Date(unix * 1000).toISOString().slice(0, 10) : undefined);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The library kind of a Poly Haven model, from its category path. Pure. */
export const kindOfModel = (a) => (/^Architecture/.test(a.category ?? '') ? 'building' : /^Vehicles/.test(a.category ?? '') ? 'vehicle' : 'prop');

/** Whether a model's measured triangles fit Roblox: at most 20,000 a mesh on average and 100,000 in all. Pure. */
export const fitsRoblox = (st) => st.triangles <= 100_000 && st.triangles / Math.max(1, st.meshes) <= 20_000;

/** The family of a Poly Haven model: its collection, else its top category. Pure. */
export function familyOfModel(a) {
  const col = (a.categories ?? []).find((c) => c.startsWith('collection: '));
  return `polyhaven:${slug(col ? col.slice(12) : (a.category ?? 'models').split('/')[0])}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
  const mode = process.argv[2], dir = arg('dir'), out = arg('out');
  if (!['list', 'ingest'].includes(mode) || !dir || !out) { console.error('usage: ingest-polyhaven-models.mjs list|ingest --dir <fetched> [--stats <stats.jsonl>] --out <file>'); process.exit(2); }
  const assets = JSON.parse(readFileSync(join(dir, 'assets.json'), 'utf8'));
  const fetched = Object.keys(assets).filter((id) => existsSync(join(dir, id, 'fetch.json')));
  if (mode === 'list') {
    writeFileSync(out, JSON.stringify(fetched.map((id) => ({ key: `ph__${slug(id)}`, file: `${id}/${id}.gltf` }))));
    console.log(`${fetched.length} models -> ${out}`);
  } else {
    const stats = new Map(readFileSync(arg('stats'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((s) => [s.key, s]));
    const known = new Set(Object.values(assets).some((a) => day(a.date_published) < '2023-01-01') ? ['poly haven'] : []);
    const lic = classifyLicence('CC0');
    const items = [];
    let rejected = 0, unloadable = 0, incomplete = 0, dense = 0;
    for (const id of fetched) {
      const a = assets[id], st = stats.get(`ph__${slug(id)}`);
      if (!st?.ok) { unloadable += 1; continue; }
      if (st.missing) { incomplete += 1; continue; }
      if (!fitsRoblox(st)) { dense += 1; continue; }
      const f = JSON.parse(readFileSync(join(dir, id, 'fetch.json'), 'utf8'));
      const author = Object.keys(a.authors ?? {}).join(', ') || 'Poly Haven';
      const tags = [...new Set([...(a.tags ?? []), ...(a.categories ?? []).filter((c) => !c.startsWith('collection: '))].map((t) => t.toLowerCase()))];
      const item = {
        id: `ph:${slug(id)}`, title: a.name, kind: kindOfModel(a), family: familyOfModel(a),
        source_url: `https://polyhaven.com/a/${id}`, author, licence_words: 'CC0', licence_class: lic.class,
        licence_url: 'https://polyhaven.com/license', attribution: `${a.name} by ${author}, Poly Haven (CC0). Powered by Poly Haven.`,
        fetched_at: f.at, uploader: 'none', file: `${id}/${id}.gltf`, file_sha256: f.sha256,
        tags, description: a.description,
        checks: { triangles: st.triangles, meshes: st.meshes, size: st.size, format: '1K glTF', category: a.category },
        ai_check: aiCheck({ title: a.name, tags, created: day(a.date_published), creator: 'poly haven' }, known, f.at),
      };
      const errs = validateItem(item);
      if (errs.length) { rejected += 1; if (rejected <= 10) console.log(`  reject ${item.id}: ${errs.join('; ')}`); } else items.push(item);
    }
    writeFileSync(out, items.map((i) => JSON.stringify(i)).join('\n') + '\n');
    console.log(`${items.length} models, ${rejected} rejected, ${unloadable} not loadable, ${incomplete} incomplete, ${dense} over the triangle budget -> ${out}`);
  }
}

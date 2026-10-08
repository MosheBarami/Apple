// Master plan §4.3 #7 (skies): Poly Haven's outdoor HDRIs (CC0), fetched by tools/fetch-polyhaven-hdris.mjs. One sky
// per HDRI, credited to its photographer, dated by its capture date; time of day, weather and contrast become tags so
// a request like "sunset sky" or "stormy night" finds it. The 1K HDR is the source of the 6-face skybox made at upload.
// For the 2024 rule the creator is Poly Haven itself: a curated studio publishing since 2017 whose FAQ states every
// asset is made by humans without generative AI, so it vouches for its photographers (as ambientCG does for itself);
// the photographer is still named in the attribution.
//
//   node packages/library/src/ingest-skies.mjs --dir <fetched> --out <items.jsonl>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { classifyLicence } from './licence.mjs';
import { aiCheck } from './aicheck.mjs';
import { validateItem } from './item.mjs';

const day = (unix) => (unix ? new Date(unix * 1000).toISOString().slice(0, 10) : undefined);

/** The search tags of a Poly Haven HDRI: its tags, categories and attributes. Pure. */
export function skyTags(a) {
  const at = a.attributes ?? {};
  return [...new Set([...(a.tags ?? []), ...(a.categories ?? []), at.time_of_day, at.weather?.replace(/_/g, ' '), at.contrast && `${at.contrast} contrast`].filter(Boolean).map((t) => String(t).toLowerCase()))];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
  const dir = arg('dir'), out = arg('out');
  if (!dir || !out) { console.error('usage: ingest-skies.mjs --dir <fetched> --out <items.jsonl>'); process.exit(2); }
  const assets = JSON.parse(readFileSync(join(dir, 'assets.json'), 'utf8'));
  const known = new Set(Object.values(assets).some((a) => day(a.date_taken) && day(a.date_taken) < '2023-01-01') ? ['poly haven'] : []);
  const lic = classifyLicence('CC0');
  const items = [];
  let rejected = 0, missing = 0;
  for (const [id, a] of Object.entries(assets)) {
    const f = join(dir, id, 'fetch.json');
    if (!existsSync(f) || !existsSync(join(dir, id, 'thumb.webp'))) { missing += 1; continue; }
    const fetched = JSON.parse(readFileSync(f, 'utf8'));
    const author = Object.keys(a.authors ?? {}).join(', ') || 'Poly Haven';
    const title = `${a.name} sky`;
    const tags = skyTags(a);
    const item = {
      id: `ph-sky:${id.replace(/_/g, '-')}`.slice(0, 120), title, kind: 'sky', family: 'polyhaven:skies',
      source_url: `https://polyhaven.com/a/${id}`, author, licence_words: 'CC0', licence_class: lic.class,
      licence_url: 'https://polyhaven.com/license', attribution: `${a.name} by ${author}, Poly Haven (CC0). Powered by Poly Haven.`,
      fetched_at: fetched.at, uploader: 'none', file: `${id}/thumb.webp`, file_sha256: fetched.sha256,
      tags, description: a.description, checks: { format: '1K HDR equirectangular', source_file: `${id}/sky_1k.hdr`, attributes: a.attributes },
      ai_check: aiCheck({ title, tags, created: day(a.date_taken), creator: 'poly haven' }, known, fetched.at),
    };
    const errs = validateItem(item);
    if (errs.length) { rejected += 1; if (rejected <= 10) console.log(`  reject ${item.id}: ${errs.join('; ')}`); } else items.push(item);
  }
  writeFileSync(out, items.map((i) => JSON.stringify(i)).join('\n') + '\n');
  console.log(`${items.length} skies, ${rejected} rejected, ${missing} not fetched -> ${out}`);
}

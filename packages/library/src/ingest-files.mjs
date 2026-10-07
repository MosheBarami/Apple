// Master plan §4.4 steps 2, 3 and 6 for packs fetched as loose files (OpenGameArt): one item per model in a pack, in
// any format three.js reads. Two steps, so the renderer can measure what a GLB header cannot:
//
//   node packages/library/src/ingest-files.mjs list   --ledger <jsonl> --dir <packs> --out <list.json>
//   node packages/library/tools/render-models.mjs <list.json> <packs> <thumbs>          (thumbnails + stats.jsonl)
//   node packages/library/src/ingest-files.mjs ingest --ledger <jsonl> --dir <packs> --stats <thumbs>/stats.jsonl --out <items.jsonl>
//
// One file per model name: GLB (including one blend-to-glb.mjs made from the pack's .blend), then glTF, FBX, OBJ, Collada. The licence comes from the ledger row (the page's own
// licence line); CC-BY attribution names the pack, author, licence and page, plus the page's own notice; the author and the post date from its evidence. Only models the
// renderer loaded with every file they name become items. Authors with a pack posted before 2023 count as known humans for the 2024 rule.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, basename, extname, relative } from 'node:path';
import { classifyLicence } from './licence.mjs';
import { aiCheck } from './aicheck.mjs';
import { validateItem } from './item.mjs';
import { KNOWN_HUMAN } from './ingest-pack.mjs';

const RANK = { '.glb': 0, '.gltf': 1, '.fbx': 2, '.obj': 3, '.dae': 4 };
const SKIP = /(^|[\\/])(__MACOSX|textures?|materials?|previews?|screenshots?|source|blend)([\\/]|$)/i;
// A GLB that blend-to-glb.mjs made from the pack's own .blend: where it came from (or undefined).
const convertedFrom = (packDir, f) => {
  if (basename(dirname(f)) !== 'blend-glb') return undefined;
  const m = join(dirname(f), 'manifest.json');
  return existsSync(m) ? JSON.parse(readFileSync(m, 'utf8'))[basename(f)] : undefined;
};
const KIND_OF_CATEGORY = { 1: 'prop', 2: 'building', 3: 'map', 4: 'character', 5: 'vehicle', 13: 'animation' };
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const words = (s) => s.replace(/[-_.]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim();

export const authorOf = (evidence) => (String(evidence ?? '').match(/Posted (\d{4}-\d{2}-\d{2}) by ([^;]+)/) ?? []).slice(1);
/** The first licence on an OGA licence line ('License(s): CC0 | Copyright/Attribution Notice: ...'). Pure. */
export const firstLicence = (line) => String(line ?? '').replace(/^License\(s\):\s*/i, '').split('|')[0].trim();
export const noticeOf = (line) => (String(line ?? '').match(/Attribution Notice:\s*(.+)$/i) ?? [])[1]?.trim();

function files(dir, root = dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (SKIP.test(relative(root, p))) continue;
    if (e.isDirectory()) files(p, root, out); else if (RANK[extname(e.name).toLowerCase()] !== undefined && (basename(dir) !== 'blend-glb' || convertedFrom(root, p)?.ok)) out.push(p);
  }
  return out;
}

/** One model file per model name in a pack folder, the best format first. Pure apart from reading the folder. */
export function packModels(packDir) {
  const best = new Map();
  for (const f of files(packDir)) {
    const name = basename(f, extname(f)).toLowerCase();
    const cur = best.get(name);
    if (!cur || RANK[extname(f).toLowerCase()] < RANK[extname(cur).toLowerCase()]) best.set(name, f);
  }
  return [...best.values()].sort();
}

const idOf = (packSlug, file) => `oga:${packSlug}:${slug(basename(file, extname(file)))}`.slice(0, 120);
/** The thumbnail and stats key of an item: its id with ':' as '__' (as the grading boards read it). */
const keyOf = (packSlug, file) => idOf(packSlug, file).replaceAll(':', '__');

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2];
  const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
  const ledger = arg('ledger'), dir = arg('dir'), out = arg('out');
  if (!['list', 'ingest'].includes(mode) || !ledger || !dir || !out) { console.error('usage: ingest-files.mjs list|ingest --ledger <jsonl> --dir <packs> [--stats <stats.jsonl>] --out <file>'); process.exit(2); }
  const rows = readFileSync(ledger, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const known = new Set([...KNOWN_HUMAN, ...rows.map((r) => authorOf(r.human_made_evidence)).filter(([d, a]) => d && a && d < '2023-01-01').map(([, a]) => a.toLowerCase())]);
  const packs = rows.map((r) => ({ row: r, slug: r.url.split('/').pop() })).filter((p) => existsSync(join(dir, p.slug, 'fetch.json')));
  if (mode === 'list') {
    const list = packs.flatMap((p) => packModels(join(dir, p.slug)).map((f) => ({ key: keyOf(p.slug, f), file: relative(dir, f) })));
    writeFileSync(out, JSON.stringify(list));
    console.log(`${list.length} models in ${packs.length} packs -> ${out}`);
  } else {
    const stats = new Map(readFileSync(arg('stats'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((s) => [s.key, s]));
    const items = [];
    let rejected = 0, unloadable = 0, incomplete = 0;
    for (const { row, slug: ps } of packs) {
      const [posted, author] = authorOf(row.human_made_evidence);
      const lic = classifyLicence(firstLicence(row.licence_words));
      if (!lic.ok) { console.log(`skip  ${ps}: ${lic.reason}`); continue; }
      const notice = noticeOf(row.licence_words);
      for (const f of packModels(join(dir, ps))) {
        const key = keyOf(ps, f), st = stats.get(key);
        if (!st?.ok) { unloadable += 1; continue; }
        if (st.missing) { incomplete += 1; continue; } // names a file its pack does not ship (or a .psd): not as its author made it
        const name = words(basename(f, extname(f)));
        const title = `${name} (${row.pack})`;
        const conv = convertedFrom(join(dir, ps), f);
        const tags = [...new Set(name.toLowerCase().split(' ').filter((w) => w.length > 1))];
        const item = {
          id: idOf(ps, f),
          title, kind: KIND_OF_CATEGORY[(row.categories ?? [])[0]] ?? 'prop', family: `oga:${ps}`,
          source_url: row.url, author: author ?? 'unknown',
          licence_words: firstLicence(row.licence_words), licence_class: lic.class, licence_url: row.licence_url,
          ...(lic.class.startsWith('cc-by') ? { attribution: `${row.pack} by ${author} (${lic.class.toUpperCase()}, ${row.url})${notice ? `. ${notice}` : ''}` } : {}),
          fetched_at: JSON.parse(readFileSync(join(dir, ps, 'fetch.json'), 'utf8')).at,
          uploader: 'none', file: relative(dir, f), file_sha256: createHash('sha256').update(readFileSync(f)).digest('hex'),
          categories: row.categories, tags,
          checks: { triangles: st.triangles, meshes: st.meshes, size: st.size, format: extname(f).slice(1).toLowerCase(), ...(conv ? { converted_from: conv.from, blender: conv.blender } : {}) },
          ai_check: aiCheck({ title, tags, created: posted, creator: author }, known, new Date().toISOString()),
        };
        const errs = validateItem(item);
        if (errs.length) { rejected += 1; if (rejected <= 10) console.log(`  reject ${item.id}: ${errs.join('; ')}`); } else items.push(item);
      }
    }
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, items.map((i) => JSON.stringify(i)).join('\n') + '\n');
    console.log(`${items.length} items, ${rejected} rejected, ${unloadable} not loadable, ${incomplete} incomplete -> ${out}`);
  }
}

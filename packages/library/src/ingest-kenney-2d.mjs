// Master plan §4.3 #8 (UI art): Kenney's 2D packs (CC0), one style family per pack. One item per distinct PNG at
// its base size: the same image again at 2x (Double, 2x, Retina, Large) and the sheets (tilesheets, tilemaps,
// spritesheets, textures) are left out, and byte-identical files are kept once across packs. UI packs, borders and mobile
// controls are frames; the rest are icons. The pack's own License.txt must say CC0, like its ledger row.
//
//   node packages/library/src/ingest-kenney-2d.mjs --ledger <kenney-2d-ui.jsonl> --dir <packs> --out <items.jsonl>
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, basename } from 'node:path';
import { classifyLicence } from './licence.mjs';
import { aiCheck } from './aicheck.mjs';
import { validateItem } from './item.mjs';
import { KNOWN_HUMAN } from './ingest-pack.mjs';

const DROP = /^(double|retina|large)\b|\(2[x×]\)|^2[x×]$|^(tilesheets?|tilemaps?|spritesheets?|textures)$/i;
const FRAMES = /^(ui-pack|pixel-ui-pack|fantasy-ui-borders|mobile-controls)/;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const words = (s) => s.replace(/[-_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim();

/** Whether a PNG path inside a pack is kept: in a folder (the pack root holds its preview), not a 2x copy, not a sheet. Pure. */
export const kept = (rel) => rel.toLowerCase().endsWith('.png') && rel.includes('/') && !rel.split('/').slice(0, -1).some((d) => DROP.test(d));
/** Width and height from a PNG header. Pure. */
export const pngSize = (buf) => (buf.length > 24 && buf.toString('ascii', 1, 4) === 'PNG' ? [buf.readUInt32BE(16), buf.readUInt32BE(20)] : null);
/** "Button Long (Blue, UI Pack)": the file's words, then the folders that say which variant it is. Pure. */
export function titleOf(rel, pack) {
  const parts = rel.replace(/\.png$/i, '').split('/');
  const variant = parts.slice(0, -1).filter((d) => !/^(png|default|1x|tiles|sprites|vector)$/i.test(d)).map(words);
  const name = words(parts.at(-1));
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} (${[...variant, pack].join(', ')})`;
}

const walk = (d, out = []) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p, out); else out.push(p); } return out; };

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
  const ledger = arg('ledger'), dir = arg('dir'), out = arg('out');
  if (!ledger || !dir || !out) { console.error('usage: ingest-kenney-2d.mjs --ledger <jsonl> --dir <packs> --out <items.jsonl>'); process.exit(2); }
  const items = [], seen = new Set(); // byte-identical files are kept once across all packs (an expansion re-ships its base)
  let rejected = 0;
  for (const row of readFileSync(ledger, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))) {
    const ps = row.url.replace(/\/$/, '').split('/').pop();
    const root = join(dir, ps);
    if (!existsSync(join(root, 'fetch.json'))) { console.log(`skip ${ps}: not fetched`); continue; }
    const licenceFile = readdirSync(root).find((f) => /^licen[cs]e\.txt$/i.test(f));
    const fromFile = classifyLicence(licenceFile ? readFileSync(join(root, licenceFile), 'utf8') : '');
    const lic = classifyLicence(row.licence_words);
    if (!lic.ok || !fromFile.ok || fromFile.class !== lic.class) { console.log(`skip ${ps}: licence file says ${fromFile.class ?? fromFile.reason}, ledger ${lic.class ?? lic.reason}`); continue; }
    const year = (String(row.human_made_evidence ?? '').match(/Released in (\d{4})/) ?? [])[1];
    const fetched = JSON.parse(readFileSync(join(root, 'fetch.json'), 'utf8')).at;
    let n = 0;
    for (const file of walk(root).map((f) => relative(root, f)).filter(kept).sort()) {
      const buf = readFileSync(join(root, file));
      const sha = createHash('sha256').update(buf).digest('hex');
      if (seen.has(sha)) continue;
      seen.add(sha);
      const title = titleOf(file, row.pack);
      const tags = [...new Set(words(file.replace(/\.png$/i, '')).toLowerCase().split(/[ /]+/).filter((w) => w.length > 1 && !/^(png|default|\d+)$/.test(w)))];
      const item = {
        id: `kenney2d:${ps}:${slug(file.replace(/\.png$/i, ''))}`.slice(0, 120), title, kind: FRAMES.test(ps) ? 'frame' : 'icon',
        family: `kenney2d:${ps}`, source_url: row.url, author: 'Kenney', licence_words: row.licence_words, licence_class: lic.class,
        licence_url: row.licence_url, fetched_at: fetched, uploader: 'none', file: `${ps}/${file}`, file_sha256: sha,
        categories: row.categories, tags, checks: { format: 'png', size: pngSize(buf) },
        ai_check: aiCheck({ title, tags, created: year ? `${year}-01-01` : undefined, creator: 'Kenney' }, KNOWN_HUMAN, fetched),
      };
      const errs = validateItem(item);
      if (errs.length) { rejected += 1; if (rejected <= 10) console.log(`  reject ${item.id}: ${errs.join('; ')}`); } else { items.push(item); n += 1; }
    }
    console.log(`${ps}: ${n}`);
  }
  writeFileSync(out, items.map((i) => JSON.stringify(i)).join('\n') + '\n');
  console.log(`${items.length} items from ${new Set(items.map((i) => i.family)).size} packs, ${rejected} rejected -> ${out}`);
}

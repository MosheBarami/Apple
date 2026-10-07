// Master plan §4.4 steps 2, 3 and 6 (automatic part) for packs that ship as files: one library item per GLB model,
// with its provenance (L3), the human-made check (L1), the licence class (L2), its style family (L6, the pack) and the
// automatic facts L5 grades on. The packs are unzipped under --dir (git-ignored); only the metadata is written.
//
//   node packages/library/src/ingest-pack.mjs --ledger planning/library/ledger/kenney-3d.jsonl \
//     --dir private/library-src/kenney --out planning/library/items/kenney-3d.jsonl
//
// A pack whose folder is missing, whose licence file does not say what the ledger says, or that has no GLB models is
// reported and skipped; an item that fails validateItem is reported and left out. Nothing is invented: titles and tags
// come from the file names and the pack.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, relative, basename } from 'node:path';
import { classifyLicence } from './licence.mjs';
import { aiCheck } from './aicheck.mjs';
import { validateItem } from './item.mjs';
import { readGlbStats } from './glb.mjs';

const KIND_OF_CATEGORY = { 1: 'prop', 2: 'building', 4: 'character', 5: 'vehicle', 13: 'animation' };
export const KNOWN_HUMAN = new Set(['kenney', 'quaternius', 'kay lousberg', 'kaykit']);

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const words = (s) => s.replace(/[-_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.toLowerCase().endsWith('.glb')) out.push(p);
  }
  return out;
}

/** The pack's first release date, from the ledger's evidence text (dd/mm/yyyy), as an ISO date. */
export function releaseDate(evidence) {
  const m = String(evidence ?? '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
}

/** The library items of one unzipped pack. Pure apart from reading files. */
export function packItems(row, packDir, { author, fetchedAt }) {
  const kit = basename(packDir);
  const licenceFile = ['License.txt', 'license.txt', 'LICENSE.txt'].map((f) => join(packDir, f)).find(existsSync);
  const licenceText = licenceFile ? readFileSync(licenceFile, 'utf8') : '';
  const fromFile = classifyLicence(licenceText);
  const fromLedger = classifyLicence(row.licence_words);
  if (!fromLedger.ok) return { skipped: `ledger licence refused: ${fromLedger.reason}` };
  if (!fromFile.ok || fromFile.class !== fromLedger.class) return { skipped: `licence file says ${fromFile.class ?? fromFile.reason}, ledger says ${fromLedger.class}` };
  const models = walk(packDir).filter((p) => !/[\\/]Previews?[\\/]/i.test(p));
  if (!models.length) return { skipped: 'no GLB models (other formats only)' };
  const created = releaseDate(row.human_made_evidence);
  const kind = KIND_OF_CATEGORY[(row.categories ?? [])[0]] ?? 'prop';
  const items = [];
  const rejected = [];
  for (const file of models) {
    const name = basename(file).replace(/\.glb$/i, '');
    const buf = readFileSync(file);
    let checks;
    try { checks = readGlbStats(file); } catch (e) { rejected.push(`${name}: ${e.message}`); continue; }
    const title = `${words(name)} (${row.pack})`;
    const tags = [...new Set([...words(name).toLowerCase().split(' '), ...words(kit).toLowerCase().split(' ').filter((w) => w !== 'kit')])].filter((w) => w.length > 1);
    const item = {
      id: `${slug(author)}:${kit}:${slug(name)}`,
      title,
      kind,
      family: `${slug(author)}:${kit}`,
      source_url: row.url,
      author,
      licence_words: row.licence_words,
      licence_class: fromLedger.class,
      licence_url: row.licence_url,
      fetched_at: fetchedAt,
      uploader: 'none',
      file: relative(dirname(packDir), file),
      file_sha256: sha(buf),
      categories: row.categories,
      tags,
      checks,
      ai_check: aiCheck({ title, tags, created, creator: author }, KNOWN_HUMAN, fetchedAt),
    };
    const errs = validateItem(item);
    if (errs.length) rejected.push(`${name}: ${errs.join('; ')}`); else items.push(item);
  }
  return { items, rejected };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ledger = arg('ledger'), dir = arg('dir'), out = arg('out');
  if (!ledger || !dir || !out) { console.error('usage: ingest-pack.mjs --ledger <jsonl> --dir <packs> --out <jsonl> [--author Kenney]'); process.exit(2); }
  const author = arg('author') ?? 'Kenney';
  const rows = readFileSync(ledger, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const all = [];
  let rejectedCount = 0;
  for (const row of rows) {
    const kit = row.url.split('/').filter(Boolean).pop();
    const packDir = join(dir, kit);
    if (!existsSync(packDir)) { console.log(`skip  ${kit}: not downloaded`); continue; }
    const zip = join(dir, `${kit}.zip`);
    const fetchedAt = new Date(statSync(existsSync(zip) ? zip : packDir).mtimeMs).toISOString();
    const r = packItems(row, packDir, { author, fetchedAt });
    if (r.skipped) { console.log(`skip  ${kit}: ${r.skipped}`); continue; }
    for (const why of r.rejected) console.log(`  reject ${kit}/${why}`);
    rejectedCount += r.rejected.length;
    all.push(...r.items);
    console.log(`pack  ${kit}: ${r.items.length} items`);
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, all.map((i) => JSON.stringify(i)).join('\n') + '\n');
  const byKind = {};
  for (const i of all) byKind[i.kind] = (byKind[i.kind] ?? 0) + 1;
  console.log(`${all.length} items (${JSON.stringify(byKind)}), ${rejectedCount} rejected -> ${out}`);
}

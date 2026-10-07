// Master plan §4.3 category 9 (fonts, Roblox-available, tagged by mood): one library item per font family of the fonts
// ledger. A Creator Store font carries its Roblox asset id (Font.new("rbxassetid://<id>")); a built-in one carries the
// hash of its family file in Studio's content folder (Font.new("rbxasset://fonts/families/<Name>.json")). The
// designer and the first-published date come from the ledger's evidence; mood tags from the ledger.
//
//   node packages/library/src/ingest-fonts.mjs --ledger planning/library/ledger/fonts.jsonl \
//     --content /Applications/RobloxStudio.app/Contents/Resources/content --out planning/library/items/fonts.jsonl
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { classifyLicence } from './licence.mjs';
import { aiCheck } from './aicheck.mjs';
import { validateItem } from './item.mjs';

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The designer named in the evidence ('Type designer: X; ...'), else undefined. Pure. */
export const designerOf = (evidence) => (String(evidence ?? '').match(/designer:?\s*([^;(]+)/i) ?? [])[1]?.trim().replace(/[.,]$/, '');
/** The earliest date in the evidence (first published), else undefined. Pure. */
export const firstDate = (evidence) => (String(evidence ?? '').match(/\d{4}-\d{2}-\d{2}/g) ?? []).sort()[0];

/** One font item from a ledger row, or { error }. Pure apart from reading a built-in family file. */
export function fontItem(row, contentDir) {
  const assetId = Number(String(row.roblox_ref?.asset_id ?? '').replace('rbxassetid://', '')) || undefined;
  const uri = row.roblox_ref?.family_uri;
  let sha;
  if (!assetId) {
    const file = uri ? join(contentDir, uri.replace(/^rbxasset:\/\//, '')) : '';
    if (!file || !existsSync(file)) return { error: `${row.family}: no asset id and no family file at ${uri}` };
    sha = createHash('sha256').update(readFileSync(file)).digest('hex');
  }
  const lic = classifyLicence(row.licence_words);
  if (!lic.ok) return { error: `${row.family}: ${lic.reason}` };
  const designer = designerOf(row.human_made_evidence) ?? 'Roblox';
  const created = firstDate(row.human_made_evidence);
  const title = `${row.family} (font)`;
  const item = {
    id: `font:${slug(row.family)}`,
    title,
    kind: 'font',
    family: 'roblox-fonts',
    source_url: row.url,
    author: designer,
    licence_words: row.licence_words,
    licence_class: lic.class,
    licence_url: row.licence_url,
    fetched_at: `${row.checked_at}T00:00:00.000Z`,
    uploader: assetId ? 'creator_store' : 'none',
    ...(assetId ? { roblox_asset_id: assetId } : { file_sha256: sha }),
    font_ref: assetId ? `rbxassetid://${assetId}` : uri,
    faces: row.faces,
    categories: [9],
    tags: [...new Set([...(row.mood ?? []), ...row.family.toLowerCase().split(/\s+/)])],
    // The designer is named in the evidence (a person or a type foundry), so the 2024 rule accepts them.
    ai_check: aiCheck({ title, created, creator: designer }, new Set([designer.toLowerCase()]), `${row.checked_at}T00:00:00.000Z`),
  };
  if (ALLOWED_ATTRIBUTION.has(lic.class)) item.attribution = `${row.family} by ${designer} (${lic.class.toUpperCase()}, ${row.licence_url})`;
  const errs = validateItem(item);
  return errs.length ? { error: `${row.family}: ${errs.join('; ')}` } : { item };
}
const ALLOWED_ATTRIBUTION = new Set(['cc-by-3.0', 'cc-by-4.0', 'mit', 'apache-2.0', 'bsd-2-clause', 'bsd-3-clause', 'ofl-1.1']);

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
  const ledger = arg('ledger'), content = arg('content'), out = arg('out');
  if (!ledger || !content || !out) { console.error('usage: ingest-fonts.mjs --ledger <jsonl> --content <studio content dir> --out <jsonl>'); process.exit(2); }
  const items = [];
  for (const line of readFileSync(ledger, 'utf8').split('\n').filter(Boolean)) {
    const r = fontItem(JSON.parse(line), content);
    if (r.error) console.log(`  reject ${r.error}`); else items.push(r.item);
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, items.map((i) => JSON.stringify(i)).join('\n') + '\n');
  console.log(`${items.length} fonts -> ${out}`);
}

// Master plan §4.3 #8 (UI art): the game-icons.net set (github.com/game-icons/icons), one consistent family of 512 px
// white-on-black glyph icons by 36 named artists. One item per SVG: licence from the repo's license.txt (CC BY 3.0, or
// CC0 for the artists it marks so), attribution "Icons made by {author}" as the licence asks, the date the icon was
// added from the repo's history. The badges folder (overlay pieces, not icons) and various-artists (no one to credit)
// are left out. Artists with an icon added before 2023 count as known humans for the 2024 rule.
//
//   node packages/library/src/ingest-game-icons.mjs --repo <game-icons checkout> --out <items.jsonl>
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { classifyLicence } from './licence.mjs';
import { aiCheck } from './aicheck.mjs';
import { validateItem } from './item.mjs';

const SKIP = new Set(['badges', 'various-artists']);
const words = (s) => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const key = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
/** The artist of a folder: the same letters, or the one whose name the folder starts with ('lucasms' is Lucas). Pure. */
export const artistOf = (who, folder) => who.get(key(folder)) ?? [...who].find(([k]) => key(folder).startsWith(k))?.[1];

/** Normalized name -> { name, cc0 } from license.txt lines like "- Lorc, http://..." or "- Zeromancer - CC0". Pure. */
export function artists(licenceText) {
  const out = new Map();
  for (const m of licenceText.matchAll(/^- ([^,\n]+?)(?:,\s*\S+)?(\s*-\s*CC0)?\s*$/gm)) {
    const name = m[1].trim();
    out.set(key(name), { name, cc0: !!m[2] });
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
  const repo = arg('repo'), out = arg('out');
  if (!repo || !out) { console.error('usage: ingest-game-icons.mjs --repo <game-icons checkout> --out <items.jsonl>'); process.exit(2); }
  const who = artists(readFileSync(join(repo, 'license.txt'), 'utf8'));
  const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const head = git('log', '-1', '--format=%cI').trim();
  // The oldest commit that touches each SVG at its path, in one pass over the history (newest first, so the last
  // date seen wins). A file moved in later gets the move's date: later than its making, so the 2024 rule only tightens.
  const added = new Map();
  let day = '';
  for (const l of git('log', '--format=%cs', '--name-only', '--', '*.svg').split('\n')) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(l)) day = l; else if (l.trim()) added.set(l.trim(), day);
  }
  const folders = readdirSync(repo, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.') && !SKIP.has(e.name)).map((e) => e.name);
  const known = new Set([...added].filter(([f, d]) => d < '2023-01-01').map(([f]) => f.split('/')[0]));
  const items = [];
  let rejected = 0, unknownArtist = 0;
  for (const folder of folders) {
    const artist = artistOf(who, folder);
    if (!artist) { unknownArtist += readdirSync(join(repo, folder)).length; console.log(`skip ${folder}: not in license.txt`); continue; }
    const lic = classifyLicence(artist.cc0 ? 'CC0' : 'CC-BY-3.0');
    for (const f of readdirSync(join(repo, folder)).filter((x) => x.endsWith('.svg')).sort()) {
      const name = f.replace(/\.svg$/, '');
      const rel = `${folder}/${f}`;
      const title = `${words(name)} icon`;
      const tags = [...new Set(name.split('-').filter((w) => w.length > 1 && !/^\d+$/.test(w)))];
      const url = `https://game-icons.net/1x1/${folder}/${name}.html`;
      const item = {
        id: `gi:${folder}:${name}`.slice(0, 120), title, kind: 'icon', family: 'game-icons',
        source_url: url, author: artist.name, licence_words: artist.cc0 ? 'CC0' : 'CC-BY-3.0', licence_class: lic.class,
        licence_url: artist.cc0 ? 'https://creativecommons.org/publicdomain/zero/1.0/' : 'https://creativecommons.org/licenses/by/3.0/',
        ...(artist.cc0 ? {} : { attribution: `${title} made by ${artist.name} (${url}), CC BY 3.0` }),
        fetched_at: head, uploader: 'none', file: rel, file_sha256: createHash('sha256').update(readFileSync(join(repo, rel))).digest('hex'),
        tags, checks: { format: 'svg', size: [512, 512] },
        ai_check: aiCheck({ title, tags, created: added.get(rel), creator: folder }, known, head),
      };
      const errs = validateItem(item);
      if (errs.length) { rejected += 1; if (rejected <= 10) console.log(`  reject ${item.id}: ${errs.join('; ')}`); } else items.push(item);
    }
  }
  writeFileSync(out, items.map((i) => JSON.stringify(i)).join('\n') + '\n');
  console.log(`${items.length} icons from ${new Set(items.map((i) => i.author)).size} artists, ${rejected} rejected, ${unknownArtist} with no artist in license.txt -> ${out}`);
}

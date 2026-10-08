// Master plan §4.3 #11 (SFX): OpenGameArt sound submissions (CC0, CC-BY 3.0, CC-BY 4.0), listed by tools/list-oga.mjs
// and fetched by tools/fetch-oga.mjs --audio. One item per distinct sound file (byte-identical copies kept once, across
// packs too), family by submission, credited to its author with the page's attribution notice; measured as the Kenney
// sounds are (ingest-kenney-audio.mjs). Authors with a submission posted before 2023 count as known humans for the 2024
// rule; a submission in OGA's AI-assisted collection is never fetched.
//
//   node packages/library/src/ingest-oga-audio.mjs --ledger <jsonl> --dir <packs> --out <items.jsonl>
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, relative, basename, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { classifyLicence } from './licence.mjs';
import { aiCheck } from './aicheck.mjs';
import { validateItem } from './item.mjs';
import { authorOf, firstLicence, noticeOf } from './ingest-files.mjs';
import { soundWords, measure, levels } from './ingest-kenney-audio.mjs';

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const SOUND = /\.(ogg|wav|mp3|flac)$/i;
const SKIP = /(^|\/)(__MACOSX|\._)/;
const files = (d) => (existsSync(d) ? readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(d, e.name)) : [join(d, e.name)])) : []);

/** The sound files of a fetched pack folder: direct downloads and unpacked archives, one per file name stem and folder
 * (an ogg and a wav of the same take are one sound, the ogg kept). Pure apart from reading the folder. */
export function packSounds(dir) {
  const RANK = { '.ogg': 0, '.mp3': 1, '.wav': 2, '.flac': 3 };
  const best = new Map();
  for (const f of files(dir).filter((f) => SOUND.test(f) && !SKIP.test(relative(dir, f)))) {
    const k = join(relative(dir, f).replace(/^x\//, '').split('/').slice(0, -1).join('/'), basename(f, extname(f)).toLowerCase());
    const cur = best.get(k);
    if (!cur || RANK[extname(f).toLowerCase()] < RANK[extname(cur).toLowerCase()]) best.set(k, f);
  }
  return [...best.values()].sort();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
  const ledger = arg('ledger'), dir = arg('dir'), out = arg('out');
  if (!ledger || !dir || !out) { console.error('usage: ingest-oga-audio.mjs --ledger <jsonl> --dir <packs> --out <items.jsonl>'); process.exit(2); }
  const rows = readFileSync(ledger, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const known = new Set(rows.map((r) => authorOf(r.human_made_evidence)).filter(([d, a]) => d && a && d < '2023-01-01').map(([, a]) => a.toLowerCase()));
  const items = [], seen = new Set(), ids = new Set();
  let rejected = 0, duplicate = 0, unreadable = 0, packs = 0;
  for (const row of rows) {
    const ps = row.url.split('/').pop(), pdir = join(dir, ps);
    if (!existsSync(join(pdir, 'fetch.json'))) continue;
    const lic = classifyLicence(firstLicence(row.licence_words));
    if (!lic.ok) continue;
    packs += 1;
    const [posted, author] = authorOf(row.human_made_evidence);
    const notice = noticeOf(row.licence_words);
    const fetchedAt = JSON.parse(readFileSync(join(pdir, 'fetch.json'), 'utf8')).at;
    for (const f of packSounds(pdir)) {
      const buf = readFileSync(f), sha = createHash('sha256').update(buf).digest('hex');
      if (seen.has(sha)) { duplicate += 1; continue; }
      seen.add(sha);
      let checks;
      try { checks = { format: extname(f).slice(1).toLowerCase(), ...measure(f), ...levels(f) }; } catch { unreadable += 1; continue; }
      if (!(checks.seconds > 0)) { unreadable += 1; continue; }
      const words = soundWords(basename(f, extname(f)));
      const tags = [...new Set([...words.split(' '), ...(row.tags ?? []).map((t) => t.toLowerCase())].filter((w) => w.length > 1))];
      const title = `${words} (${row.pack})`.slice(0, 160);
      let id = `oga-audio:${slug(ps)}:${slug(relative(pdir, f).replace(/^x\//, '').replace(/\.[^.]+$/, ''))}`.slice(0, 120);
      if (ids.has(id)) id = `${id.slice(0, 111)}-${sha.slice(0, 8)}`; // a long path cut to the same 120 characters
      ids.add(id);
      const item = {
        id,
        title, kind: 'sfx', family: `oga-audio:${slug(ps)}`,
        source_url: row.url, author: author ?? 'unknown',
        licence_words: firstLicence(row.licence_words), licence_class: lic.class, licence_url: row.licence_url,
        ...(lic.class.startsWith('cc-by') ? { attribution: `${row.pack} by ${author} (${lic.class.toUpperCase()}, ${row.url})${notice ? `. ${notice}` : ''}` } : {}),
        fetched_at: fetchedAt, uploader: 'none', file: relative(dir, f), file_sha256: sha, tags, checks,
        ai_check: aiCheck({ title, tags, created: posted, creator: author }, known, fetchedAt),
      };
      const errs = validateItem(item);
      if (errs.length) { rejected += 1; if (rejected <= 10) console.log(`  reject ${item.id}: ${errs.join('; ')}`); } else items.push(item);
    }
  }
  writeFileSync(out, items.map((i) => JSON.stringify(i)).join('\n') + '\n');
  console.log(`${items.length} sounds from ${packs} submissions, ${rejected} rejected, ${duplicate} byte-identical copies, ${unreadable} unreadable -> ${out}`);
}

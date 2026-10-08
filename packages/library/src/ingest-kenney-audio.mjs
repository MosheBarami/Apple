// Master plan §4.3 #11 and #12 (SFX, music): Kenney's CC0 audio packs, fetched by tools/fetch-kenney.mjs. One item per
// sound file (the packs' Preview files left out; a voice line keeps its numbers, as 'player 1' is what it says), kind sfx, or music for Music Jingles; family by pack; dated by the
// pack's License.txt creation date, or else the oldest file date in its zip (kept on unpacking). The automatic checks measure each file with ffprobe and ffmpeg (duration, sample
// rate, channels, peak and mean level), so silent, clipped or overlong files can be graded down.
//
//   node packages/library/src/ingest-kenney-audio.mjs --dir <packs> --out <items.jsonl>
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, basename, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { classifyLicence } from './licence.mjs';
import { aiCheck } from './aicheck.mjs';
import { validateItem } from './item.mjs';

/** Words of a Kenney sound file name ('impactGlass_light_002' -> 'impact glass light'; '1' stays '1'). Pure. */
export function soundWords(name) {
  const all = name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  return all.replace(/([a-z])\d+\b/g, '$1').replace(/\b\d+\b/g, '').replace(/\s+/g, ' ').trim() || all; // a take number is dropped, a spoken '1' kept
}

/** The release date written in a Kenney License.txt ('Creation date: 11-10-2020' -> '2020-10-11'). Pure. */
export function createdOf(licence) {
  const m = /Creation date:\s*(\d{1,2})-(\d{1,2})-(\d{4})/.exec(licence);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : undefined;
}

const files = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? files(join(d, f)) : [join(d, f)]));

/** Duration, sample rate and channels of a sound, from ffprobe. */
export function measure(f) {
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', f], { encoding: 'utf8' }));
  const s = probe.streams?.[0] ?? {};
  return { seconds: Number(Number(probe.format?.duration).toFixed(3)), sample_rate: Number(s.sample_rate), channels: s.channels };
}

/** Peak and mean level in dBFS of a sound, from ffmpeg's volumedetect. */
export function levels(f) {
  const out = execFileSync('sh', ['-c', 'ffmpeg -hide_banner -nostats -i "$0" -af volumedetect -f null - 2>&1', f], { encoding: 'utf8' });
  const n = (k) => Number(new RegExp(`${k}_volume: (-?[\\d.]+) dB`).exec(out)?.[1]);
  return { peak_db: n('max'), mean_db: n('mean') };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
  const dir = arg('dir'), out = arg('out');
  if (!dir || !out) { console.error('usage: ingest-kenney-audio.mjs --dir <packs> --out <items.jsonl>'); process.exit(2); }
  const lic = classifyLicence('CC0');
  const packs = readdirSync(dir).filter((p) => existsSync(join(dir, p, 'fetch.json'))).sort();
  const known = new Set(['kenney']);
  const items = [], seen = new Set();
  let rejected = 0, duplicate = 0;
  for (const p of packs) {
    const fetched = JSON.parse(readFileSync(join(dir, p, 'fetch.json'), 'utf8'));
    const sounds = files(join(dir, p)).filter((f) => /\.(ogg|wav|mp3)$/i.test(f) && !/^preview/i.test(basename(f))).sort();
    const created = createdOf(readFileSync(join(dir, p, 'License.txt'), 'utf8')) ?? new Date(Math.min(...sounds.map((f) => statSync(f).mtimeMs))).toISOString().slice(0, 10);
    const pack = p.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).replace('Sci Fi', 'Sci-fi').replace(/\b(Rpg|Ui)\b/, (w) => w.toUpperCase());
    for (const f of sounds) {
      const buf = readFileSync(f), sha = createHash('sha256').update(buf).digest('hex');
      if (seen.has(sha)) { duplicate += 1; continue; }
      seen.add(sha);
      const rel = relative(join(dir, p), f), name = basename(f, extname(f));
      const words = p.startsWith('voiceover') ? name.replace(/[_-]+/g, ' ').toLowerCase() : soundWords(name), folder = soundWords(relative(join(dir, p), f).split('/').slice(-2, -1)[0] ?? '');
      const tags = [...new Set([...words.split(' '), ...folder.split(' ')].filter((w) => w.length > 1 && w !== 'audio'))];
      const title = `${words}${folder.split(' ').some((w) => w !== 'audio' && !words.includes(w)) ? `, ${folder}` : ''} (${pack})`;
      const item = {
        id: `kenney-audio:${p}:${rel.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`.slice(0, 120),
        title, kind: p === 'music-jingles' ? 'music' : 'sfx', family: `kenney:${p}`,
        source_url: fetched.url, author: 'Kenney', licence_words: 'CC0', licence_class: lic.class,
        licence_url: 'http://creativecommons.org/publicdomain/zero/1.0/', fetched_at: fetched.at, uploader: 'none',
        file: relative(dir, f), file_sha256: sha, tags,
        checks: { format: extname(f).slice(1).toLowerCase(), ...measure(f), ...levels(f) },
        ai_check: aiCheck({ title, tags, created, creator: 'kenney' }, known, fetched.at),
      };
      const errs = validateItem(item);
      if (errs.length) { rejected += 1; if (rejected <= 10) console.log(`  reject ${item.id}: ${errs.join('; ')}`); } else items.push(item);
    }
  }
  writeFileSync(out, items.map((i) => JSON.stringify(i)).join('\n') + '\n');
  console.log(`${items.length} sounds in ${packs.length} packs, ${rejected} rejected, ${duplicate} byte-identical copies left out -> ${out}`);
}

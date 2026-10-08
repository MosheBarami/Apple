// Fetch OpenGameArt 3D packs from the ledger (master plan §4.4 step 3): for each allowed pack, its page's direct
// file links (opengameart.org/sites/default/files/...), downloaded at most one request a second, archives unpacked with
// bsdtar (zip, rar, 7z). Kenney uploads are skipped (ingested from kenney.nl); .blend files are fetched too and
// converted by blend-to-glb.mjs. With --audio it fetches sound packs instead (audio files and archives), from the file
// links list-oga.mjs wrote into each row. Resumable: a pack folder with a fetch.json is not fetched again.
//
//   node packages/library/tools/fetch-oga.mjs <ledger.jsonl> <out-dir> [--audio] [--max-file-mb 300] [--max-total-gb 8]
import { readFileSync, writeFileSync, mkdirSync, existsSync, createWriteStream, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { classifyLicence } from '../src/licence.mjs';

const [ledger, out] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flag = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
const MAX_FILE = flag('max-file-mb', 300) * 1e6, MAX_TOTAL = flag('max-total-gb', 8) * 1e9;
const UA = { 'user-agent': 'StudPilot-Library/1.0 (+https://studpilot.app; library ingestion of CC0/CC-BY packs)' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const AUDIO = process.argv.includes('--audio');
const MODEL = AUDIO ? /\.(ogg|wav|mp3|flac|zip|rar|7z)$/i : /\.(glb|gltf|obj|fbx|dae|blend|zip|rar|7z)$/i;
const FORMATS = { audio: ['ogg', 'wav', 'mp3', 'flac', 'zip', 'rar', '7z'], models: ['glb', 'gltf', 'obj', 'fbx', 'dae', 'blend'] };

/** Whether a ledger row is fetched: an allowed licence, not a Kenney upload, not in OGA's AI-assisted collection, a
 * format the run wants (a model three.js or Blender reads, or with --audio a sound or an archive). Pure. */
export function wanted(row, audio = AUDIO) {
  const words = String(row.licence_words ?? '').replace(/^License\(s\):\s*/i, '').split('|')[0];
  if (!classifyLicence(words).ok) return false;
  if (/\bby kenney\b/i.test(row.human_made_evidence ?? '') || row.ai_assisted) return false;
  const fm = (row.formats ?? []).map((f) => String(f).toLowerCase());
  return fm.some((f) => FORMATS[audio ? 'audio' : 'models'].includes(f));
}

/** The direct file links of an OGA page (archives and model files only). Pure. */
export function fileLinks(html) {
  return [...new Set([...html.matchAll(/https?:\/\/opengameart\.org\/sites\/default\/files\/[^"'<>\s]+/g)].map((m) => m[0]))]
    .filter((u) => !/\/(css|js|styles|imagecache)\//.test(u) && MODEL.test(decodeURIComponent(u)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!ledger || !out) { console.error('usage: fetch-oga.mjs <ledger.jsonl> <out-dir> [--audio]'); process.exit(2); }
  const rows = readFileSync(ledger, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter(wanted);
  mkdirSync(out, { recursive: true });
  let total = 0, packs = 0;
  for (const row of rows) {
    const slug = row.url.split('/').pop();
    const dir = join(out, slug);
    if (existsSync(join(dir, 'fetch.json'))) { packs++; continue; }
    if (total > MAX_TOTAL) { console.log(`stop: ${(total / 1e9).toFixed(1)} GB fetched this run`); break; }
    mkdirSync(dir, { recursive: true });
    let links = row.files?.filter((u) => MODEL.test(decodeURIComponent(u))); // list-oga.mjs read the page already
    if (!links) {
      try { links = fileLinks(await (await fetch(row.url, { headers: UA })).text()); } catch (e) { console.log(`page ${slug}: ${e.message}`); continue; }
      await wait(1000);
    }
    const files = [];
    for (const u of links) {
      const name = decodeURIComponent(u.split('/').pop()).replace(/[^A-Za-z0-9._ ()-]/g, '_');
      try {
        const head = await fetch(u, { method: 'HEAD', headers: UA });
        const size = Number(head.headers.get('content-length') ?? 0);
        if (size > MAX_FILE) { files.push({ url: u, skipped: `too large (${(size / 1e6).toFixed(0)} MB)` }); continue; }
        const res = await fetch(u, { headers: UA });
        if (!res.ok) { files.push({ url: u, skipped: `HTTP ${res.status}` }); continue; }
        const path = join(dir, name);
        await pipeline(Readable.fromWeb(res.body), createWriteStream(path));
        const buf = readFileSync(path);
        total += buf.length;
        files.push({ url: u, file: name, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') });
        if (/\.(zip|rar|7z)$/i.test(name)) {
          try { mkdirSync(join(dir, 'x'), { recursive: true }); execFileSync('bsdtar', ['-xf', path, '-C', join(dir, 'x')], { stdio: 'ignore' }); } catch { files[files.length - 1].unpack = 'failed'; }
        }
      } catch (e) { files.push({ url: u, skipped: e.message }); }
      await wait(1000);
    }
    writeFileSync(join(dir, 'fetch.json'), JSON.stringify({ url: row.url, pack: row.pack, at: new Date().toISOString(), files }, null, 1));
    packs++;
    console.log(`pack ${slug}: ${files.filter((f) => f.file).length} files, ${(statSync(dir).size / 1e6).toFixed(1)} MB dir entry; total ${(total / 1e9).toFixed(2)} GB`);
  }
  console.log(`${packs} packs fetched or present; ${(total / 1e9).toFixed(2)} GB this run`);
}

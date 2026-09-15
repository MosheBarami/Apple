#!/usr/bin/env node
// The asset wall on the landing page, resolved from the harvest and BAKED into the page.
//
// WHY THIS EXISTS AS A SCRIPT RATHER THAN A PASTE. The wall claims a licence and an author for
// every asset it shows. A hand-typed array can claim anything; this one is derived from
// packages/corpus/data/library/*.json — the same files scripts/check-proof-figures.mjs counts —
// so the provenance on the page is the provenance in the corpus, and the next person can re-run
// this and diff.
//
// IT IS AN AUTHOR-TIME TOOL, NOT A BUILD STEP. It reaches the network and it shells out to sips.
// The landing page must render from literals with no database and no fetch, so the OUTPUT is
// committed and the site build never runs this.
//
// WHAT IT REFUSES TO DO, and each refusal is the point:
//
//   · It will not emit a row whose harvest record it could not find. A wall card is a claim about
//     a library row; a card with no row behind it is the failure this repository keeps finding.
//   · It will not emit an image it did not verify is an image. Every candidate is fetched, checked
//     for image magic bytes, and measured. A 404 page saved as .png is not a preview.
//   · It will not use a PACK cover as an ASSET preview. Kenney ships Previews/<model>.png inside
//     each pack — a render of that one model — and that is the only Kenney image used here. The
//     pack's own sample.png shows forty things at once and would be a lie on a card naming one.
//   · It will not use a sprite STRIP as a picture of one asset. A 512x32 filmstrip of a coin
//     animation is a picture of eleven coins. Anything far from square is rejected, loudly, and
//     the row falls back to a typed placeholder rather than showing something misleading.
//
// WHAT THE ASPECT CHECK CANNOT SEE, said plainly so nobody trusts it to do work it cannot do: a
// sprite sheet laid out as a GRID is close to square and sails through. `2d-dragon-spritesheet`
// did exactly that — 144x118, one dragon body and two detached wings — and it was caught by a
// person looking at the rendered image, not by this script. The candidate list below is therefore
// curated BY EYE, and adding an id without looking at what comes out is how a card ends up naming
// one thing and showing nine.
//
// A REJECTED PREVIEW IS NOT A FAILURE OF THIS SCRIPT. It emits `img: null`, the page renders a
// typed placeholder that says what the thing is, and the run prints the reason. What would be a
// failure is emitting a row that says it has a picture when it does not.
//
// Run:  node scripts/build-asset-wall.mjs            (report only)
//       node scripts/build-asset-wall.mjs --write    (also splice the array into index.astro)
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIB = join(ROOT, 'packages', 'corpus', 'data', 'library');
const OUT_IMG = join(ROOT, 'apps', 'site', 'public', 'library');
const PAGE = join(ROOT, 'apps', 'site', 'src', 'pages', 'index.astro');
const CACHE = join(tmpdir(), 'apple-asset-wall-cache');

/** The longest side a vendored preview keeps. The wall renders them at 72px CSS. */
const PREVIEW_PX = 144;

/** How far from square a preview may be before it is a strip rather than a portrait. */
const ASPECT_MIN = 0.62;
const ASPECT_MAX = 1.62;

/* ----------------------------------------------------------------- the chosen rows --- */

/**
 * THE CURATION, and it is a human judgement this script cannot make for itself.
 *
 * Every id below is a real row in packages/corpus/data/library. They were chosen on ONE
 * criterion: a person who has never heard of these packs should read the name and know what the
 * thing is. That rules out most of the library by design — `Tile 0000`, `Variation A`,
 * `runeblack-tileoutline-021` are all real rows and all meaningless on a card.
 *
 * NOT IN HERE, deliberately: the active Creator Store rows. They are 2008-era user uploads and
 * anime rips — `Bakiiiiiiiiiiiiiiii`, `diediedieDIELess`, `Part2` — and putting them on the
 * landing page would prove the complaint this wall was built to answer.
 */
const CANDIDATES = [
  // Kenney — CC0, one author, 42 packs that ship per-model previews.
  'kenney/pirate-kit/previews/chest',
  'kenney/pirate-kit/previews/cannon',
  'kenney/mini-dungeon/previews/character-orc',
  'kenney/mini-dungeon/previews/coin',
  'kenney/car-kit/previews/ambulance',
  'kenney/car-kit/previews/taxi',
  'kenney/car-kit/previews/tractor',
  'kenney/castle-kit/previews/bridge-draw',
  'kenney/survival-kit/previews/tent',
  'kenney/survival-kit/previews/barrel',
  'kenney/food-kit/previews/burger',
  'kenney/food-kit/previews/pineapple',
  'kenney/cube-pets/previews/animal-fox',
  'kenney/cube-pets/previews/animal-bee',
  'kenney/graveyard-kit/previews/pumpkin',
  'kenney/graveyard-kit/previews/coffin',
  'kenney/mini-arcade/previews/arcade-machine',
  'kenney/mini-arcade/previews/claw-machine',
  'kenney/retro-fantasy-kit/previews/tower',
  'kenney/city-kit-roads/previews/traffic-light',
  'kenney/mini-arena/previews/trophy',
  'kenney/mini-market/previews/cash-register',
  'kenney/watercraft-kit/previews/boat-fishing-small',
  'kenney/platformer-kit/previews/crate',

  // game-icons.net — CC BY 3.0, so the author on the card is the attribution the licence requires.
  'game_icons/lorc/broadsword',
  'game_icons/lorc/campfire',
  'game_icons/lorc/crossed-swords',
  'game_icons/lorc/wizard-staff',
  'game_icons/delapouite/health-potion',
  'game_icons/delapouite/checkered-flag',
  'game_icons/willdabeast/round-shield',
  'game_icons/sbed/key',
  'game_icons/zeromancer/heart-plus',

  // cgbookcase — CC0 PBR materials, shipped as 1K BaseColor thumbnails.
  'cgbookcase/texture/brick-wall-04',
  'cgbookcase/texture/cobblestone-wall-01',
  'cgbookcase/texture/mossy-wall-02',
  'cgbookcase/texture/rusty-metal-panel-01',
  'cgbookcase/texture/marble-05',

  // OpenGameArt — CC0, many different named authors.
  'opengameart/10-spaceships/spaceship-1',
  'opengameart/10-spaceships/spaceship-4',
  'opengameart/16px-sword-and-shield/sword-0',
  // Kept even though its preview is rejected: `slime` is a 125x225 filmstrip, so this row renders
  // as a typed placeholder. That is the honest path exercised on the real page rather than left as
  // dead code nothing has ever run.
  'opengameart/25x25-slime-animation/slime',
];

/* ------------------------------------------------------------------- the harvest --- */

function harvest(name) {
  const p = join(LIB, `${name}.json`);
  if (!existsSync(p)) {
    console.error(`MISSING HARVEST ${p}\n`
      + '  packages/corpus/data is gitignored and fetched separately. Without it this script cannot\n'
      + '  resolve a single row, and it will not guess.');
    process.exit(2);
  }
  const j = JSON.parse(readFileSync(p, 'utf8'));
  if (j.failed === true) {
    console.error(`HARVEST ${name} RECORDED ITS OWN FAILURE — its rows are not evidence of anything.`);
    process.exit(2);
  }
  return j.assets ?? [];
}

const rowsById = new Map();
for (const f of ['kenney-expanded', 'game_icons', 'cgbookcase', 'opengameart-expanded']) {
  for (const a of harvest(f)) rowsById.set(a.id, a);
}
/** Pack-level rows: Kenney's carry the zip url and the pack's display name; OGA's carry the
 *  submission title that the per-file ids are slugged from. */
const kenneyPacks = new Map(harvest('kenney').map((a) => [a.id.split('/').pop(), a]));
const ogaPacks = new Map(harvest('opengameart').map((a) => [a.id.split('/').pop(), a]));

/* ------------------------------------------------------------------ fetch + verify --- */

mkdirSync(CACHE, { recursive: true });

function curl(url, dest) {
  execFileSync('curl', ['-sSL', '--max-time', '120', '--fail', '-o', dest, url], { stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Image or not, measured — never inferred from the file extension. */
function measure(file) {
  const head = readFileSync(file).subarray(0, 12);
  const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  const isJpg = head[0] === 0xff && head[1] === 0xd8;
  const isGif = head.toString('latin1', 0, 3) === 'GIF';
  if (!isPng && !isJpg && !isGif) return { ok: false, why: 'not an image — no PNG/JPEG/GIF magic bytes' };
  let out;
  try {
    out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], { encoding: 'utf8' });
  } catch {
    return { ok: false, why: 'sips could not read it' };
  }
  const w = Number(/pixelWidth:\s*(\d+)/.exec(out)?.[1]);
  const h = Number(/pixelHeight:\s*(\d+)/.exec(out)?.[1]);
  if (!w || !h) return { ok: false, why: 'no dimensions' };
  return { ok: true, w, h };
}

const fileSlug = (id) => id.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

/** Pull `Previews/<name>.png` out of a Kenney pack zip. The zip is cached; packs are ~5MB. */
function kenneyPreview(id) {
  const [, packSlug, , ...rest] = id.split('/');
  const pack = kenneyPacks.get(packSlug);
  if (!pack?._download) return { err: `no pack record or download url for ${packSlug}` };
  const zip = join(CACHE, `${packSlug}.zip`);
  if (!existsSync(zip)) curl(pack._download, zip);
  const want = `${rest.join('/')}.png`;
  const entries = execFileSync('unzip', ['-Z', '-1', zip], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
    .split('\n').filter(Boolean);
  // The id is slugified, so match case-insensitively against the real entry name and require the
  // entry to live under Previews/ — a top-level Preview.png is the PACK cover, not this model.
  const hit = entries.find((e) => /(^|\/)previews\//i.test(e) && e.toLowerCase().endsWith(`/${want}`.toLowerCase()));
  if (!hit) return { err: `no Previews/${want} inside ${packSlug}.zip` };
  const dest = join(CACHE, `${fileSlug(id)}.png`);
  if (!existsSync(dest)) {
    const tmp = join(CACHE, `x-${fileSlug(id)}`);
    rmSync(tmp, { recursive: true, force: true });
    execFileSync('unzip', ['-o', '-j', zip, hit, '-d', tmp], { stdio: ['ignore', 'pipe', 'pipe'] });
    const got = readdirSync(tmp)[0];
    writeFileSync(dest, readFileSync(join(tmp, got)));
    rmSync(tmp, { recursive: true, force: true });
  }
  return { file: dest };
}

/** The three sources whose harvest row already points straight at an image. */
function directPreview(row) {
  let url = row._download;
  if (!url) return { err: 'harvest row carries no _download' };
  if (!/\.(png|jpe?g|gif)$/i.test(url)) return { err: `_download is not an image (${url.split('/').pop()})` };
  // game-icons.net renders on demand; the harvest asks for a black plate, and a black square on a
  // charcoal card is not a preview. Same icon, same service, transparent ground.
  if (row.source === 'game_icons') url = url.replace('/ffffff/000000/', '/ffffff/transparent/');
  const dest = join(CACHE, `${fileSlug(row.id)}.png`);
  if (!existsSync(dest)) curl(url, dest);
  return { file: dest, url };
}

function packOf(row) {
  if (row.source === 'kenney') {
    const slug = row.id.split('/')[1];
    return kenneyPacks.get(slug)?.name ?? slug;
  }
  if (row.source === 'opengameart') {
    const slug = row.id.split('/')[1];
    return ogaPacks.get(slug)?.name ?? slug;
  }
  if (row.source === 'game_icons') return 'game-icons.net';
  if (row.source === 'cgbookcase') return 'cgbookcase.com';
  return row.source;
}

const SOURCE_LABEL = {
  kenney: 'Kenney',
  game_icons: 'game-icons.net',
  // Matching `packOf` exactly for the two sources that are a site rather than a pack: the card
  // prints "pack · source" and collapses to one when they are the same word, and "cgbookcase.com ·
  // cgbookcase" is the kind of line that makes a reader wonder which one is the truth.
  cgbookcase: 'cgbookcase.com',
  opengameart: 'OpenGameArt',
};

/**
 * One licence, one spelling.
 *
 * Four harvests write the same public-domain dedication four ways — "Creative Commons CC0",
 * "CC0", "cc0", "CC0 PDD" — and a wall that prints all four reads as four different licences.
 * The harvests that normalise it themselves carry `_licenceId`; the expanded ones do not, so
 * these are the raw strings actually present in the data, mapped by hand.
 *
 * IT THROWS ON ANYTHING ELSE. Falling back to the raw string would put an unreviewed licence on
 * a public page, which is the one thing this wall exists to make impossible.
 */
const LICENCE_ID = {
  'Creative Commons CC0': 'CC0-1.0',
  CC0: 'CC0-1.0',
  cc0: 'CC0-1.0',
  'CC0 PDD': 'CC0-1.0',
  'CC BY 3.0': 'CC-BY-3.0',
};

function licenceOf(row) {
  const id = row._licenceId ?? LICENCE_ID[row.licence];
  if (!id) {
    console.error(`UNKNOWN LICENCE ${JSON.stringify(row.licence)} on ${row.id}.\n`
      + '  Add it to LICENCE_ID once a person has read it. This script will not guess a licence.');
    process.exit(1);
  }
  return id;
}

/* ------------------------------------------------------------------------- the run --- */

mkdirSync(OUT_IMG, { recursive: true });

const out = [];
const notes = [];
let missing = 0;

for (const id of CANDIDATES) {
  const row = rowsById.get(id);
  if (!row) {
    console.error(`NO SUCH ROW: ${id} — it is not in any harvest file. Not emitting a card for it.`);
    missing++;
    continue;
  }

  let img = null;
  const got = row.source === 'kenney' ? kenneyPreview(id) : directPreview(row);
  if (got.err) {
    notes.push(`${id}: no preview — ${got.err}`);
  } else {
    const m = measure(got.file);
    if (!m.ok) {
      notes.push(`${id}: preview rejected — ${m.why}`);
    } else if (m.w / m.h < ASPECT_MIN || m.w / m.h > ASPECT_MAX) {
      notes.push(`${id}: preview rejected — ${m.w}x${m.h} is a sprite strip, not a picture of one asset`);
    } else {
      const name = `${fileSlug(id)}.png`;
      execFileSync('sips', ['-Z', String(PREVIEW_PX), got.file, '--out', join(OUT_IMG, name)], { stdio: ['ignore', 'pipe', 'pipe'] });
      const after = measure(join(OUT_IMG, name));
      if (!after.ok) { notes.push(`${id}: resized file is not readable — ${after.why}`); }
      else img = `/library/${name}`;
    }
  }

  out.push({
    id: row.id,
    name: row.name,
    kind: row.kind,
    pack: packOf(row),
    source: SOURCE_LABEL[row.source] ?? row.source,
    licence: licenceOf(row),
    author: row.author,
    img,
  });
}

/* --------------------------------------------------------------------- the verdict --- */

const bad = out.filter((r) => !r.licence || !r.author || !r.name || !r.kind || !r.pack);
if (bad.length) {
  console.error('ROWS WITHOUT FULL PROVENANCE — the wall cannot show these:\n');
  for (const r of bad) console.error(`  · ${r.id}: licence=${r.licence ?? '—'} author=${r.author ?? '—'}`);
  process.exit(1);
}
if (missing) {
  console.error(`\n${missing} candidate id(s) matched no harvest row. Fix the list; do not ship a card with no row behind it.`);
  process.exit(1);
}

for (const n of notes) console.log(`  note  ${n}`);
console.log(`\n${out.length} rows · ${out.filter((r) => r.img).length} with a verified preview · `
  + `${out.filter((r) => !r.img).length} typed placeholder · ${new Set(out.map((r) => r.source)).size} sources · `
  + `${new Set(out.map((r) => r.author)).size} authors · ${new Set(out.map((r) => r.licence)).size} licences`);

const literal = out.map((r) => '  '
  + `{ id: ${JSON.stringify(r.id)}, name: ${JSON.stringify(r.name)}, kind: ${JSON.stringify(r.kind)}, `
  + `pack: ${JSON.stringify(r.pack)}, source: ${JSON.stringify(r.source)}, `
  + `licence: ${JSON.stringify(r.licence)}, author: ${JSON.stringify(r.author)}, `
  + `img: ${r.img ? JSON.stringify(r.img) : 'null'} },`).join('\n');

if (process.argv.includes('--write')) {
  const page = readFileSync(PAGE, 'utf8');
  const BEGIN = '/* wall:begin — generated by scripts/build-asset-wall.mjs, do not hand-edit */';
  const END = '/* wall:end */';
  const i = page.indexOf(BEGIN);
  const j = page.indexOf(END);
  if (i < 0 || j < 0) {
    console.error(`\nCannot splice: ${PAGE} has no wall:begin / wall:end markers.`);
    process.exit(1);
  }
  writeFileSync(PAGE, `${page.slice(0, i + BEGIN.length)}\n${literal}\n  ${page.slice(j)}`);
  console.log(`\nwrote ${out.length} rows into ${PAGE}`);
} else {
  console.log(`\n${literal}`);
}

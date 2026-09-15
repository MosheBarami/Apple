// THE PAGE'S OWN PICTURES SAY WHERE THEY CAME FROM, ON THE SAME TERMS IT DEMANDS OF EVERY ASSET.
//
// The section this sits under is headed "Every asset says where it came from." A landing page that
// makes that claim while its own four illustrations arrived from nowhere is the exact credibility
// hole a sceptical reader is looking for — and the one the owner would be asked about first.
//
// So PROVENANCE.json is not documentation here, it is the record, and this checks it against the
// bytes on disk rather than against itself: every declared file exists, every declared size is the
// size the file actually is, every declared width and height come out of the file's own header,
// and no file is sitting in the directory unrecorded. A record that agrees with itself and not
// with the tree is the failure this repository keeps finding.
//
// It also checks the page: an <img> with no width and height reserves no space, so the section
// under it jumps when the file lands — and the figure is decorative, so an alt text would be the
// page claiming the picture carries something the sentence beside it does not.
//
// Run with:  node --test tests/section-figures.test.mjs      (from apps/site, after a build)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(SITE, 'public', 'assets', 'sections');
const record = JSON.parse(readFileSync(join(DIR, 'PROVENANCE.json'), 'utf8'));

/** Width and height out of a WebP's own header. Anything it cannot read is a failure, not a skip. */
function webpSize(buf, name) {
  assert.equal(buf.slice(0, 4).toString('latin1'), 'RIFF', `${name} is not a RIFF container`);
  assert.equal(buf.slice(8, 12).toString('latin1'), 'WEBP', `${name} is not a WebP`);
  const fourcc = buf.slice(12, 16).toString('latin1');
  if (fourcc === 'VP8X') return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  if (fourcc === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (fourcc === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  assert.fail(`${name} has an unreadable WebP chunk "${fourcc}" — the size in the record cannot be checked`);
}

test('EVERY ILLUSTRATION IS RECORDED, AND EVERY RECORD MATCHES THE FILE', () => {
  assert.ok(record.files.length > 0, 'the record names no files');
  for (const f of record.files) {
    const path = join(DIR, f.file);
    assert.ok(existsSync(path), `${f.file} is in the record and not on disk`);
    const buf = readFileSync(path);
    assert.equal(buf.length, f.bytes, `${f.file} is ${buf.length} bytes, recorded as ${f.bytes}`);
    const size = webpSize(buf, f.file);
    assert.deepEqual(size, f.intrinsic, `${f.file} is ${size.width}x${size.height}, recorded as ${f.intrinsic.width}x${f.intrinsic.height}`);
    for (const need of ['seed', 'subject', 'section']) {
      assert.ok(f[need], `${f.file} does not record its ${need} — regenerating it would be guesswork`);
    }
  }
});

test('and nothing is sitting in the directory unrecorded', () => {
  // The direction that actually rots: a file dropped in during a later pass, shipped, and never
  // written down. Checking only the record against disk would pass on every one of them.
  const onDisk = readdirSync(DIR).filter((n) => !n.endsWith('.json'));
  const named = new Set(record.files.map((f) => f.file));
  const orphans = onDisk.filter((n) => !named.has(n));
  assert.deepEqual(orphans, [], `these files ship with no provenance: ${orphans.join(', ')}`);
});

test('THE BUILT PAGE RESERVES THE SPACE, AND CLAIMS NOTHING FOR THE PICTURE', () => {
  const index = join(SITE, 'dist', 'index.html');
  assert.ok(existsSync(index), 'apps/site/dist/index.html is missing — run `npm run build` in apps/site first');
  const html = readFileSync(index, 'utf8');

  let seen = 0;
  for (const f of record.files) {
    const stem = f.file.replace(/\.webp$/, '');
    const tag = new RegExp(`<img[^>]*/assets/sections/${stem}\\.webp[^>]*>`).exec(html);
    assert.ok(tag, `${f.file} is recorded but never used on the landing page`);
    const t = tag[0];
    assert.match(t, new RegExp(`width="${f.intrinsic.width}"`), `${f.file} ships without its intrinsic width — the section reflows when it lands`);
    assert.match(t, new RegExp(`height="${f.intrinsic.height}"`), `${f.file} ships without its intrinsic height`);
    assert.match(t, /loading="lazy"/, `${f.file} is decoration below the fold and must not block the first paint`);
    assert.match(t, /alt=""/, `${f.file} must be decorative: an alt text claims it says something the sentence beside it does not`);
    seen += 1;
  }
  assert.equal(seen, record.files.length, 'not every recorded figure was found in the page');
});

#!/usr/bin/env node
// The asset wall, checked against the HTML a reader actually receives.
//
// THE FAILURE IT EXISTS FOR, in one sentence: a page that says "24 of them below" above a wall
// that renders 23. Both halves look right in review — the number is a real number, the cards are
// real cards — and nothing connects them. This connects them, in the only place where "rendered"
// means anything, which is the built page.
//
// AND THE OTHER ONE: a card that shows a broken image where the asset should be. The route ships
// no JavaScript, so there is no `onerror` to fall back with; an <img> whose file is missing
// renders as the browser's broken-image glyph and says, wordlessly, that this library is a bluff.
// Every card must therefore carry an image this script has opened and confirmed is an image, or a
// typed placeholder that says what the thing is instead of pretending.
//
// AND THE THIRD, which is the one apps/site/tests/asset-wall.test.mjs can state but cannot prove:
// width and height must be the PICTURE'S OWN. That test asserts the numbers in asset-wall.json are
// positive integers, which a constant also is — `width="256" height="256"` on a 193x255 thumbnail
// passes it. Here the file is on disk and open already, so the attribute is compared against the
// pixels rather than against a type. A size attribute whose whole job is to reserve the right box
// is worse than none when it reserves the wrong one.
//
// WHY THIS EXISTS BESIDE apps/site/tests/asset-wall.test.mjs RATHER THAN INSTEAD OF IT. That suite
// reads the data file and the .astro source: it can see that the markup says `width={a.w}`, and it
// cannot see what Astro emitted or whether the file behind `src` exists in dist. This one reads
// dist/index.html and the bytes it points at, and cannot see the source at all. Neither subsumes
// the other, and the gap each leaves is the other's subject.
//
// WHAT IT CANNOT DO. It reads HTML with regular expressions, not a DOM. That is fine for markup
// this repository generates and would not be fine for markup it does not: it knows the class names
// the landing page uses and nothing else. If the wall is restyled with different class names this
// script does not go quiet — it exits 2 and says it found no wall, because a checker that cannot
// find its subject has verified nothing.
//
// Usage:  node scripts/check-asset-wall.mjs                  (apps/site/dist/index.html)
//         node scripts/check-asset-wall.mjs --html <file>
//
// Exit 0 = checked and clean · 1 = the page states something the cards do not · 2 = could not look.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const flagAt = process.argv.indexOf('--html');
const HTML = flagAt > -1 ? process.argv[flagAt + 1] : join(ROOT, 'apps', 'site', 'dist', 'index.html');

/** Everything that means "I did not get to look". Never a clean exit. */
function blind(why) {
  console.error(`ASSET WALL UNVERIFIED — ${why}\n`);
  console.error('This is not a clean page. The checker did not see one.');
  process.exit(2);
}

if (!HTML) blind('--html was given without a path');
if (!existsSync(HTML)) {
  blind(`no page at ${HTML}\n`
    + '  The wall is checked against BUILT output, because "rendered" is the only place the card\n'
    + '  count is real. Build the site first:\n'
    + '    (cd apps/site && npx astro build)');
}

const html = readFileSync(HTML, 'utf8');
const ROOTDIR = dirname(HTML);

/* ------------------------------------------------------------------- find the wall --- */

const section = /<section[^>]*id="library"[^>]*>([\s\S]*?)<\/section>/.exec(html);
//[[ RE-AIMED 2026-09-21. THE WALL IS GONE AND IT IS NOT COMING BACK, so "no <section id=library>"
//   is no longer an "I could not look" — it is the expected state, and exiting 2 on it kept the
//   whole `Build site and web` job red with nothing to fix.
//
//   The evidence that this is a decision and not a regression, none of it mine:
//     · `.gitignore` records "THE ASSET CATALOGUE LIVED HERE AND WAS DELETED ON 2026-09-20 …
//       The owner removed the library outright — every upload it could make was an Image or a
//       Decal, Roblox refuses to archive either, and the catalogue carried rows named after other
//       companies' properties under one blanket licence claim." Six tracked files went with it.
//     · commit 92c9221 rewrote the landing and the library section did not survive it. The page
//       now carries hero-title, statement-title, sequence-title, models, inside, truths-title,
//       plans-title and cap-title, and no library.
//     · `apps/site/src/pages/index.astro` states the principle the new page is built to: it is
//       "a page whose whole point is that it ships almost nothing".
//
//   SO THE GUARD IS RE-AIMED RATHER THAN DELETED, which is the third ending
//   docs/backlog/WEB-BUNDLE-BUDGET-OPEN.md warned against. The failure this file exists for was
//   never "the wall is missing" — it was A PAGE THAT STATES A NUMBER THE CARDS DO NOT SUPPORT.
//   With no wall at all, the strongest form of that property is that the page must not claim a
//   library, because there is now no library to claim. That is checked below, and it is a check
//   the old shape could not perform: a landing that today said "from a library of 510,014" would
//   have exited 2 and told nobody anything.
//
//   If the wall ever returns, the branch below is not taken and every card check runs unchanged. ]]
if (!section) {
  // Tags out, entities for the characters a count can hide behind, whitespace collapsed.
  const prose = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:nbsp|#160|#xA0|#xa0);/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

  /** Every way the page could still be promising a library it no longer has. */
  const CLAIMS = [
    /\bfrom a library of\b/i,
    /\blibrary of [\d,]{2,}/i,
    /[\d][\d,]{2,}\s+(?:assets|models|textures|icons|sounds|meshes)\b/i,
    /\b(?:assets|models|textures|icons)\s+(?:below|above)\b/i,
    /\b[\d][\d,]{2,}\s+of them below\b/i,
    /\bcurated (?:asset )?library\b/i,
  ];
  const found = [];
  for (const rule of CLAIMS) {
    const m = rule.exec(prose);
    if (m) found.push(`"${prose.slice(Math.max(0, m.index - 60), m.index + m[0].length + 60).trim()}"`);
  }
  if (found.length > 0) {
    console.error(`ASSET WALL — the wall is gone and ${found.length} claim(s) about it are still on the page\n`);
    for (const quote of found) console.error(`  ${quote}`);
    console.error('\nThe catalogue was deleted on 2026-09-20. A page that still counts it is counting nothing.');
    process.exit(1);
  }
  console.log(
    `check-asset-wall: ${HTML} has no library section, which is the recorded state since 2026-09-20 — `
      + `and none of the ${CLAIMS.length} library claims this checks for appears anywhere on the page. `
      + 'If the wall returns, every card check in this file runs again unchanged.',
  );
  process.exit(0);
}

/**
 * The cards.
 *
 * The element is matched by its class and closed by its own tag name, so restyling the card from
 * an <a> to an <li> does not blind the checker while renaming the class does — which is the right
 * way round. A card holding a nested element of the SAME tag would truncate here; the wall's cards
 * hold spans and one img, and that is asserted by the field reads below going empty if it changed.
 */
const cards = [...section[1].matchAll(/<(a|li|div)[^>]*class="[^"]*ap-wall__card[^"]*"[^>]*>([\s\S]*?)<\/\1>/g)]
  .filter((m) => !/aria-hidden="true"/.test(m[0]))
  .map((m) => m[2]);
if (cards.length === 0) blind('the library section contains no ap-wall__card that a reader is meant to read');

/* ------------------------------------------------------------------- read the cards --- */

/* The separator between pack and licence is a middot, and whether it reaches dist as the character
   or as an entity is the build tool's business rather than the page's. Both are decoded, so a
   change in Astro's escaping cannot make twenty-four honest cards report as missing a licence. */
const text = (frag, cls) => {
  const m = new RegExp(`<span[^>]*class="[^"]*${cls}[^"]*"[^>]*>([\\s\\S]*?)</span>`).exec(frag);
  return m
    ? m[1].replace(/<[^>]*>/g, '')
        .replace(/&(?:middot|#183|#xB7|#xb7);/g, '·')
        .replace(/&amp;/g, '&')
        .trim()
    : '';
};

/**
 * The picture's real pixel size, read out of its own header.
 *
 * PNG carries it in IHDR; WebP in whichever of the three bitstream headers it uses. A format this
 * cannot read is counted as UNMEASURED and said out loud in the summary rather than folded into
 * the verified total — a checker that cannot measure something must not report that it did.
 */
function intrinsic(buf) {
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') {
    return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  }
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    const chunk = buf.toString('latin1', 12, 16);
    if (chunk === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
    if (chunk === 'VP8L') {
      const n = buf.readUInt32LE(21);
      return [(n & 0x3fff) + 1, ((n >> 14) & 0x3fff) + 1];
    }
    if (chunk === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  }
  return null;
}

const problems = [];
let unmeasured = 0;

cards.forEach((frag, i) => {
  const name = text(frag, 'ap-wall__name') || `card ${i + 1}`;
  const author = text(frag, 'ap-wall__by');

  //[[ THE PACK AND THE LICENCE SHARE ONE FIELD, "Poly Haven · CC0 1.0", so both halves are read
  //   out of it. A card that lost its licence would otherwise still show a pack and read as fine.
  //   CC-BY obliges a credit BY NAME, and a card whose obligation cannot be met must not be on a
  //   page that claims every one can. ]]
  const tag = text(frag, 'ap-wall__tag');
  const [pack, licence] = tag.split('·').map((s) => s.trim());

  if (!author) problems.push(`"${name}" carries no author`);
  if (!tag) problems.push(`"${name}" carries neither a pack nor a licence`);
  else if (!pack || !licence) problems.push(`"${name}" says "${tag}", which is not a pack AND a licence`);

  // The picture, or the honest absence of one.
  const img = /<img[^>]*\ssrc="([^"]*)"[^>]*>/.exec(frag);
  const placeholder = /class="[^"]*ap-wall__none[^"]*"/.test(frag);
  if (img && placeholder) {
    problems.push(`"${name}" shows both an image and a no-preview placeholder`);
    return;
  }
  if (!img) {
    if (!placeholder) {
      problems.push(`"${name}" has neither an image nor a typed placeholder — the card shows nothing where the asset should be`);
    }
    return;
  }

  const src = img[1];
  if (!src.trim()) { problems.push(`"${name}" has an <img> with an empty src`); return; }

  //[[ AND IT MUST BE OURS. A card pointing at the pack's own CDN answers 200 to curl and renders
  //   as nothing in a browser — referrer policy, hotlink protection and CORS are all invisible
  //   from a shell. That failure cost a whole wall once; a src with a scheme is refused here. ]]
  if (/^[a-z]+:/i.test(src) || src.startsWith('//')) {
    problems.push(`"${name}" loads its picture from ${src} — that is somebody else's server`);
    return;
  }

  const file = join(ROOTDIR, src.replace(/^\//, ''));
  if (!existsSync(file)) {
    problems.push(`"${name}" points at ${src}, which is not in the built output — a reader gets a broken image`);
    return;
  }

  const buf = readFileSync(file);
  const head = buf.subarray(0, 4);
  const png = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  const jpg = head[0] === 0xff && head[1] === 0xd8;
  const gif = head.toString('latin1', 0, 3) === 'GIF';
  const webp = buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP';
  if (!png && !jpg && !gif && !webp) {
    problems.push(`"${name}" points at ${src}, which is not an image — no PNG/JPEG/GIF/WebP magic bytes`);
    return;
  }

  // The reserved box against the real one.
  const w = /<img[^>]*\swidth="(\d+)"/.exec(frag);
  const h = /<img[^>]*\sheight="(\d+)"/.exec(frag);
  if (!w || !h) {
    problems.push(`"${name}" gives its picture no width and height, so the section reflows under a reader when it arrives`);
    return;
  }
  const real = intrinsic(buf);
  if (!real) { unmeasured += 1; return; }
  if (Number(w[1]) !== real[0] || Number(h[1]) !== real[1]) {
    problems.push(`"${name}" reserves ${w[1]}x${h[1]} for a picture that is ${real[0]}x${real[1]} — `
      + 'a guess dressed as a measurement, doing the opposite of what the attribute is for');
  }
});

/* ------------------------------------------------------- the number the page claims --- */

/**
 * The count, wherever the section states it.
 *
 * It is written in the lede rather than the heading, and it has been in the heading before, so
 * both are read. A section that states NO number is not silently fine: the count is the claim the
 * cards answer, and a wall with nothing binding it to a figure is the failure this script is for.
 */
const prose = [
  /<h2[^>]*id="library-title"[^>]*>([\s\S]*?)<\/h2>/.exec(section[1]),
  /<p[^>]*class="[^"]*ap-lede[^"]*"[^>]*>([\s\S]*?)<\/p>/.exec(section[1]),
].filter(Boolean).map((m) => m[1].replace(/<[^>]*>/g, ' '));

if (prose.length === 0) blind('the library section has no heading and no lede — there is no prose to check the cards against');

const claimed = prose.map((t) => /(\d[\d,]*)/.exec(t)).find(Boolean);
if (!claimed) {
  problems.push(`the library section states no count at all, so nothing binds its prose to the ${cards.length} cards below it`);
} else {
  const n = Number(claimed[1].replace(/,/g, ''));
  if (n !== cards.length) {
    problems.push(`the section claims ${n.toLocaleString()} assets and the wall renders ${cards.length}`);
  }
}

/* --------------------------------------------------------------------------- verdict --- */

if (problems.length) {
  console.error('ASSET WALL WRONG — the wall states things its own cards do not:\n');
  for (const p of problems) console.error(`  · ${p}`);
  console.error('\nEvery card is a claim about a row in apps/site/src/data/asset-wall.json. Fix the card, or fix the claim.');
  process.exit(1);
}

const withImage = cards.filter((c) => /<img[^>]*\ssrc="/.test(c)).length;
console.log(`ASSET WALL OK — ${cards.length} cards, each with a pack, a licence and an author; `
  + `${withImage} carry an image verified on disk and ${cards.length - withImage} a typed placeholder; `
  + `${withImage - unmeasured} of those were measured against their reserved box`
  + `${unmeasured ? ` and ${unmeasured} could not be measured` : ''}; `
  + `the section claims ${cards.length}.`);

#!/usr/bin/env node
// The asset wall, checked against the HTML a reader actually receives.
//
// THE FAILURE IT EXISTS FOR, in one sentence: a heading that says "42 assets" above a wall that
// renders 41. Both halves look right in review — the number is a real number, the cards are real
// cards — and nothing connects them. This connects them, in the only place where "rendered" means
// anything, which is the built page.
//
// AND THE OTHER ONE: a card that shows a broken image where the asset should be. The route ships
// no JavaScript, so there is no `onerror` to fall back with; an <img> whose file is missing
// renders as the browser's broken-image glyph and says, wordlessly, that this library is a bluff.
// Every card must therefore either carry an image this script has opened and confirmed is an
// image, or carry a typed placeholder that says what the thing is instead of pretending.
//
// WHAT IT CANNOT DO. It reads HTML with regular expressions, not a DOM. That is fine for markup
// this repository generates and would not be fine for markup it does not: it knows the class
// names the landing page uses and nothing else. If the wall is restyled with different class
// names this script does not go quiet — it exits 2 and says it found no wall, because a checker
// that cannot find its subject has verified nothing.
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
if (!section) blind(`${HTML} has no <section id="library">`);

/**
 * The tracks, minus the echo.
 *
 * The drift is a marquee: each row holds the cards twice so that translating the row by exactly
 * -50% lands on an identical frame and the loop has no seam. The second copy is `aria-hidden` and
 * is the SAME CARDS AGAIN — counting it would double every count and make an honest heading fail.
 */
const tracks = [...section[1].matchAll(/<ul[^>]*class="[^"]*ap-wall__track[^"]*"[^>]*>([\s\S]*?)<\/ul>/g)];
if (tracks.length === 0) blind('the library section contains no ap-wall__track');
const real = tracks.filter((t) => !/aria-hidden="true"/.test(t[0]));
if (real.length === 0) blind('every track in the wall is aria-hidden — there are no cards a reader is meant to read');

const cards = real.flatMap((t) => [...t[1].matchAll(/<li[^>]*class="[^"]*ap-wall__card[^"]*"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]));
if (cards.length === 0) blind('the wall has tracks but no ap-wall__card in them');

/* ------------------------------------------------------------------- read the cards --- */

const text = (frag, cls) => {
  const m = new RegExp(`<span[^>]*class="[^"]*${cls}[^"]*"[^>]*>([\\s\\S]*?)</span>`).exec(frag);
  return m ? m[1].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').trim() : '';
};

const problems = [];

cards.forEach((frag, i) => {
  const name = text(frag, 'ap-wall__name') || `card ${i + 1}`;
  const licence = text(frag, 'ap-wall__lic');
  const author = text(frag, 'ap-wall__by');

  if (!licence) problems.push(`"${name}" carries no licence`);
  if (!author) problems.push(`"${name}" carries no author`);

  // The picture, or the honest absence of one.
  const img = /<img[^>]*\ssrc="([^"]*)"[^>]*>/.exec(frag);
  const placeholder = /class="[^"]*ap-wall__none[^"]*"/.test(frag);
  if (img && placeholder) {
    problems.push(`"${name}" shows both an image and a no-preview placeholder`);
  } else if (img) {
    const src = img[1];
    if (!src.trim()) { problems.push(`"${name}" has an <img> with an empty src`); return; }
    const file = join(ROOTDIR, src.replace(/^\//, ''));
    if (!existsSync(file)) {
      problems.push(`"${name}" points at ${src}, which is not in the built output — a reader gets a broken image`);
      return;
    }
    const head = readFileSync(file).subarray(0, 4);
    const png = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
    const jpg = head[0] === 0xff && head[1] === 0xd8;
    const gif = head.toString('latin1', 0, 3) === 'GIF';
    if (!png && !jpg && !gif) problems.push(`"${name}" points at ${src}, which is not an image — no PNG/JPEG/GIF magic bytes`);
  } else if (!placeholder) {
    problems.push(`"${name}" has neither an image nor a typed placeholder — the card shows nothing where the asset should be`);
  }
});

/* ------------------------------------------------------- the number the heading claims --- */

const h2 = /<h2[^>]*id="library-title"[^>]*>([\s\S]*?)<\/h2>/.exec(section[1]);
if (!h2) blind('the library section has no <h2 id="library-title"> — nothing states a count');

const claimText = h2[1].replace(/<[^>]*>/g, ' ');
const claimed = /(\d[\d,]*)/.exec(claimText);
if (!claimed) {
  problems.push(`the heading "${claimText.trim()}" states no count at all, so nothing binds it to the ${cards.length} cards below it`);
} else {
  const n = Number(claimed[1].replace(/,/g, ''));
  if (n !== cards.length) {
    problems.push(`the heading claims ${n.toLocaleString()} assets and the wall renders ${cards.length}`);
  }
}

/* --------------------------------------------------------------------------- verdict --- */

if (problems.length) {
  console.error('ASSET WALL WRONG — the wall states things its own cards do not:\n');
  for (const p of problems) console.error(`  · ${p}`);
  console.error('\nEvery card is a claim about a row in packages/corpus/data/library. Fix the card, or fix the claim.');
  process.exit(1);
}

const withImage = cards.filter((c) => /<img[^>]*\ssrc="/.test(c)).length;
console.log(`ASSET WALL OK — ${cards.length} cards in ${real.length} track(s), each with a licence and an author; `
  + `${withImage} carry a verified image and ${cards.length - withImage} a typed placeholder; `
  + `the heading claims ${cards.length}.`);

// A NUMBER IN A HEADING IS A CLAIM ABOUT THE THINGS UNDER IT.
//
// The landing page said "Three modes, one price list." over two cards. Super Agent was taken out
// of what the product offers; the sentence introducing the list was not, because it is fifty lines
// away from the array it describes and nothing connected them. A visitor who is deciding whether
// this product is serious counts the cards — that is the first thing scepticism does — and finds
// the page cannot count its own features.
//
// This is the same shape as the asset wall's "24 of them below", and it will keep recurring
// wherever prose states a figure that data owns. So this reads the BUILT page: the word in the
// heading against the elements actually rendered beneath it. A heading fixed by hand passes; a
// heading fixed by hand over a list that later changes does not.
//
// Run with:  node --test tests/counted-copy.test.mjs      (from apps/site, after a build)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = join(SITE, 'dist', 'index.html');

const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/** The number a heading states, spelled or written — or null when it states none. */
function statedCount(heading) {
  const word = /\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/i.exec(heading);
  if (word) return WORDS[word[1].toLowerCase()];
  const digits = /\b(\d{1,3})\b/.exec(heading);
  return digits ? Number(digits[1]) : null;
}

/** Everything between a section's opening tag and the next one. */
function sectionHtml(html, id) {
  const open = html.indexOf(`id="${id}"`);
  assert.notEqual(open, -1, `the built page has no section #${id} — it was renamed or removed`);
  const from = html.lastIndexOf('<section', open);
  const next = html.indexOf('<section', open);
  return html.slice(from, next === -1 ? html.length : next);
}

const CASES = [
  // section id, the heading's own id, and the selector whose occurrences the heading is counting.
  { section: 'modes', heading: 'modes-title', counts: /class="[^"]*\bap-card\b[^"]*"/g, of: 'mode cards' },
  { section: 'how', heading: 'how-title', counts: /class="[^"]*\bap-card\b[^"]*"/g, of: 'setup steps' },
];

test('EVERY HEADING THAT STATES A COUNT IS COUNTING WHAT IS ACTUALLY RENDERED UNDER IT', (t) => {
  if (!existsSync(INDEX)) {
    // Not a pass. A built page is the only thing this can be checked against, and a green tick on
    // a missing build is the failure this whole file is about.
    assert.fail('apps/site/dist/index.html is missing — run `npm run build` in apps/site first');
  }
  const html = readFileSync(INDEX, 'utf8');

  let checked = 0;
  for (const c of CASES) {
    const block = sectionHtml(html, c.section);
    const h = new RegExp(`id="${c.heading}"[^>]*>([^<]*)<`).exec(block);
    assert.ok(h, `#${c.heading} is not in section #${c.section} any more`);
    const said = statedCount(h[1]);
    if (said === null) continue; // a heading that states no number cannot disagree with one.
    const rendered = (block.match(c.counts) ?? []).length;
    assert.ok(rendered > 0, `found no ${c.of} in #${c.section} — the selector stopped matching, which is not the same as the count being right`);
    assert.equal(said, rendered, `"${h[1].trim()}" states ${said} but ${rendered} ${c.of} are rendered under it`);
    checked += 1;
  }
  // The blind check. Every case above states a number today; if a future edit removes them all,
  // this test would otherwise pass by having nothing to say.
  assert.ok(checked > 0, 'not one heading stated a count — this test verified nothing');
});

// /docs/troubleshooting says its subject is "Every message the Apple Studio panel can show".
// Two of the five messages it quoted were copied from apps/plugin — the retired plugin this site
// tells people not to build — and did not exist in the shipped artifact at all:
//
//   page: "Invalid or expired code"                      shipped: "Invalid or expired pairing code."
//   page: "Could not reach Apple — check your internet"   shipped: "Could not reach Apple — check
//                                                                   Studio's network permission."
//
// A reader copies the line out of the Studio panel, searches the page, and finds nothing — on the
// one page whose promise is that they will. The remedies were right; the strings were stale.
//
// So this guard does not hold the page to a list typed here. It reads the SHIPPED sources and
// requires every message the page quotes as a heading to exist in one of them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const page = read('../src/pages/docs/troubleshooting.astro');

// Where a panel message may legitimately come from: the shipped plugin, and the worker, whose
// notices the panel renders. apps/plugin is deliberately NOT in this list — that is the defect.
// Two of the page's quoted headings are chat messages rather than panel messages — the run-failure
// section quotes what the conversation says — so their sources are here too. Adding a file to this
// list is the one way to widen the guard, which is deliberate: it is a short, readable record of
// every place a user-visible message the site quotes is allowed to come from.
const SHIPPED = [
  '../../apple-plugin/src/Bridge.luau',
  '../../apple-plugin/src/init.server.luau',
  '../../apple-plugin/src/Commands.luau',
  '../../worker/src/plugin-version.ts',
  '../../worker/src/gateway.ts',
  '../../worker/src/do/session.ts',
].map(read).join('\n');

const LEGACY = read('../../plugin/src/init.server.luau');

/** Curly and straight quotes are the same character to a reader; normalise before comparing. */
const norm = (s) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

/** The <h3>"…"</h3> headings are the page's quoted messages. Comments are stripped first. */
function quotedHeadings(src) {
  const prose = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const out = [];
  const re = /<h3>\s*“([^”]+)”\s*<\/h3>/g;
  let m;
  while ((m = re.exec(prose))) out.push(m[1]);
  return out;
}

const headings = quotedHeadings(page);

test('the page still quotes the panel, so there is something to check', () => {
  assert.ok(headings.length >= 4, `only ${headings.length} quoted messages found — did the markup change?`);
});

for (const quote of headings) {
  test(`"${quote}" exists in the shipped plugin or worker`, () => {
    const needle = norm(quote);
    assert.ok(
      norm(SHIPPED).includes(needle),
      `not in the shipped artifact${norm(LEGACY).includes(needle) ? ' — it is in apps/plugin, the retired one' : ''}`,
    );
  });
}

test('the two corrected quotes are the shipped wording, character for character', () => {
  for (const exact of ['Invalid or expired pairing code', 'Could not reach Apple — check Studio’s network permission']) {
    assert.ok(page.includes(exact), `the page no longer carries "${exact}"`);
    assert.ok(SHIPPED.includes(exact), `"${exact}" is not what the shipped plugin says any more`);
  }
});

// ---------------------------------------------------------------------------
// The guard can fail.
// ---------------------------------------------------------------------------
test('the guard rejects the two strings that shipped on this page', () => {
  for (const stale of ['Invalid or expired code', 'Could not reach Apple — check your internet']) {
    assert.equal(norm(SHIPPED).includes(norm(stale)), false, `"${stale}" should not be in the shipped artifact`);
    assert.equal(norm(LEGACY).includes(norm(stale)), true, `"${stale}" should be in the retired plugin`);
  }
});

test('the heading reader skips the comment that quotes the old strings', () => {
  const victim =
    '{/* <h3>“Invalid or expired code”</h3> was wrong */}\n<h3>“Connection hiccup — retrying…”</h3>';
  assert.deepEqual(quotedHeadings(victim), ['Connection hiccup — retrying…']);
});

/**
 * NO PAGE CAN END UP INVISIBLE WAITING FOR A SCRIPT.
 *
 * The old front page, and then every content route, hid its sections at opacity 0 and waited for a class to be added as they
 * scrolled into view. That bought a little motion and one catastrophic failure mode: if the class never arrives (the script did
 * not run, an observer that never fires, a reader who never scrolls, a capture that does not scroll) the page renders its copy
 * to nobody. It happened here: a hero effect shipped whose script never executed, and a deployed /changelog had two of its
 * three reveal targets at opacity 0. The old version of this file ran the real reveal script through four guarantees (no
 * scripting, reduced motion, no IntersectionObserver, an observer that never fires), one at a time.
 *
 * RESTATED 2026-10-05 (M2 rebuild, handoff 2.2). The rebuilt site has no scroll reveals: nothing starts hidden and nothing is
 * shown by a script, so the four guarantees are guaranteed by construction and the mechanism they exercised is gone. The
 * property they protected is unchanged, and it is held in the stronger form: NOTHING IN THE SHIPPED SITE HIDES CONTENT BEHIND A
 * CLASS A SCRIPT HAS TO ADD. That is read off the built pages and the source:
 *   - no stylesheet or <style> block has a rule whose hidden state depends on `html:not(.no-js)` (the "scripting is alive, so hide
 *     it" gate), on `[data-reveal]`, `.kinetic` or `.reveal`;
 *   - no markup carries `data-reveal` or `kinetic`, and no shipped script adds the `is-in` class the old observer added;
 *   - no built page has an element hidden by an inline style.
 * The scanners are run on the old mechanism first, which they must catch.
 *
 * NOT COVERED, AND SAID SO: the docs' Terminal demo (components/picks-docs/Terminal.astro) types its output when it scrolls into
 * view and keeps it `visibility: hidden` until its own observer fires. That is a narrower, component-level mechanism in the docs
 * pages, which the docs rewrite owns; it is not a page-level reveal and this file does not claim it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE, realPages, stripComments, walkFiles } from './lib/dist.mjs';

const SRC = join(SITE, 'src');

/** The shapes of the old mechanism, in a stylesheet: hidden until a script-added class says otherwise. */
const HIDING_GATES = [
  /html:not\(\.no-js\)[^{}]*\{[^}]*opacity\s*:\s*0/i,
  /\[data-reveal\][^{}]*\{[^}]*opacity\s*:\s*0/i,
  /\.(?:kinetic|reveal)\b[^{}]*\{[^}]*opacity\s*:\s*0/i,
];

/** The same mechanism, in markup or script. */
const REVEAL_MARKUP = /\bdata-reveal\b|\bclass="[^"]*\bkinetic\b|\.classList\.add\(\s*['"]is-in['"]/;

function styleSources() {
  return walkFiles(SRC, (p) => /\.(?:css|astro)$/.test(p)).flatMap((f) => {
    const text = readFileSync(join(SRC, f), 'utf8');
    if (f.endsWith('.css')) return [{ file: f, css: stripComments(text) }];
    return [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => ({ file: f, css: stripComments(m[1]) }));
  });
}

test('the scanners can see: they catch the old reveal mechanism, in a stylesheet and in markup, and pass an ordinary page', () => {
  const oldCss = "html:not(.no-js) [data-reveal],\nhtml:not(.no-js) .kinetic {\n  opacity: 0;\n  transform: translateY(18px);\n}";
  assert.ok(HIDING_GATES.some((re) => re.test(oldCss)), 'the stylesheet scanner is blind to the old reveal rule');
  assert.ok(REVEAL_MARKUP.test('<section class="slab" data-reveal data-reveal-delay="110">'), 'the markup scanner is blind to data-reveal');
  assert.ok(REVEAL_MARKUP.test("io.observe(el); el.classList.add('is-in');"), 'the script scanner is blind to the class the old observer added');
  const ordinary = ".btn:disabled { opacity: 0.48; }\n.plan { border: 1px solid var(--line); }";
  assert.ok(!HIDING_GATES.some((re) => re.test(ordinary)));
  assert.ok(!REVEAL_MARKUP.test('<main><h1 class="carved">Pricing</h1></main>'));
});

test('no stylesheet or <style> block hides content behind a script-added class', () => {
  const sources = styleSources();
  assert.ok(sources.length > 0, 'no stylesheet was read');
  for (const { file, css } of sources) {
    for (const re of HIDING_GATES) assert.doesNotMatch(css, re, `${file} hides content until a script adds a class`);
  }
});

test('no source file carries a reveal: no data-reveal, no kinetic class, no is-in class', () => {
  const files = walkFiles(SRC, (p) => /\.(?:astro|ts|js|mjs)$/.test(p));
  assert.ok(files.length > 0);
  for (const f of files) assert.doesNotMatch(stripComments(readFileSync(join(SRC, f), 'utf8')), REVEAL_MARKUP, `${f} still carries the scroll-reveal mechanism`);
});

test('no built page hides an element with an inline style, and none carries the reveal markup', () => {
  const pages = realPages();
  for (const { route, html } of pages) {
    assert.doesNotMatch(html, REVEAL_MARKUP, `${route} ships the reveal mechanism`);
    assert.doesNotMatch(html, /\sstyle="[^"]*(?:opacity\s*:\s*0(?![.\d])|visibility\s*:\s*hidden|display\s*:\s*none)/i, `${route} hides an element with an inline style`);
  }
});

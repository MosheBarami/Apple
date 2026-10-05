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
 * shown by a script, so the mechanism the four guarantees exercised is gone. The property they protected is unchanged:
 * NOTHING IN THE SHIPPED SITE HIDES CONTENT BEHIND A CLASS A SCRIPT HAS TO ADD.
 *
 * RESTATED AGAIN IN FIX CYCLE 2 (finding 11): THE FIRST RESTATEMENT MATCHED THE OLD MECHANISM'S NAMES, NOT THE PROPERTY. Its gates were
 * `html:not(.no-js)`, `[data-reveal]`, `.kinetic` and `.reveal`, so a new gate with a new name passed. Measured: an inline script adding
 * `js-ready` to <html> and `html:not(.js-ready) main { opacity: 0; }` in the stylesheet left all 355 site tests green, and with scripting
 * off the whole page was invisible, the exact failure this file was written for. It now holds the property in two ways that do not know a name:
 *   - THE SHAPE, in the built stylesheets (dist/_astro/*.css and every inline <style>): a rule that hides (opacity 0, visibility hidden, display
 *     none, content-visibility hidden) behind a class or attribute that no built markup carries (so a script has to add it), or behind a negated
 *     class or attribute (`:not(.x)`: hidden unless something adds x), fails whatever the class is called;
 *   - THE RESULT, in a browser: every built page is loaded three ways (scripting off; scripting on with an IntersectionObserver that never
 *     fires; reduced motion) and every word in <main> must be drawn at full opacity and not visibility:hidden, and <main> and its sections not
 *     display:none. The old names are kept as scanners too, and each scan is run on the old mechanism and on the new mutation first.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DIST, SITE, attrsOf, realPages, stripComments, walkFiles } from './lib/dist.mjs';
import { withBrowser } from './lib/browser.mjs';

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

// ============================================================================================= THE SHAPE, NOT THE NAMES

/** The rules of a stylesheet as { sel, decl }, at-rules that wrap rules (@media, @supports, @layer, @container) flattened. */
function rulesOf(css) {
  const out = [];
  (function walk(src) {
    let i = 0;
    while (i < src.length) {
      const open = src.indexOf('{', i);
      if (open < 0) break;
      const head = src.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (j < src.length && depth) {
        if (src[j] === '{') depth += 1;
        else if (src[j] === '}') depth -= 1;
        j += 1;
      }
      const inner = src.slice(open + 1, j - 1);
      if (head.startsWith('@')) {
        if (/^@(?:media|supports|layer|container|scope)\b/.test(head)) walk(inner);
      } else out.push({ sel: head, decl: inner });
      i = j;
    }
  })(css.replace(/\/\*[\s\S]*?\*\//g, ''));
  return out;
}

/** A declaration that takes content out of sight: opacity 0, visibility hidden, display none, content-visibility hidden. */
const HIDES = /(?:^|;)\s*(?:opacity\s*:\s*0(?![.\d])|visibility\s*:\s*hidden|display\s*:\s*none|content-visibility\s*:\s*hidden)\s*(?:!important)?\s*(?:;|$)/i;

/** The classes and attribute names a set of built pages carries in their markup (what a stylesheet can rely on WITHOUT a script). */
function staticTokens(pages) {
  const classes = new Set();
  const attrs = new Set();
  for (const { html } of pages) {
    for (const m of html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, ' ').matchAll(/<[a-zA-Z][^>]*>/g)) {
      for (const [name, value] of Object.entries(attrsOf(m[0]))) {
        attrs.add(name);
        if (name === 'class') for (const c of value.split(/\s+/).filter(Boolean)) classes.add(c);
      }
    }
  }
  return { classes, attrs };
}

/**
 * The hiding rules of a set of stylesheets that hide behind a gate: { sel, why }. A gate is (1) a class or attribute in the selector that no markup
 * carries, so a script has to add it before the rule applies, or (2) a negated class or attribute (`:not(.x)`, `:not([x])`): hidden unless x is
 * added. Astro's scoping attribute (data-astro-cid-*) and pseudo-classes and pseudo-elements are not gates.
 */
function gatedHiding(cssTexts, tokens) {
  const out = [];
  for (const css of cssTexts) {
    for (const { sel, decl } of rulesOf(css)) {
      if (!HIDES.test(decl)) continue;
      for (const one of sel.split(',').map((x) => x.trim())) {
        const scoped = one.replace(/\[data-astro-cid-[a-z0-9]+\]/g, '');
        if (/:not\(\s*(?:\.|\[)/.test(scoped)) out.push({ sel: one, why: 'hidden unless a class or attribute is added (a negated gate)' });
        const bare = scoped.replace(/:not\([^)]*\)/g, '');
        for (const m of bare.matchAll(/\.([A-Za-z_][\w-]*)/g)) if (!tokens.classes.has(m[1])) out.push({ sel: one, why: `hidden behind .${m[1]}, which no markup carries (a script has to add it)` });
        for (const m of bare.matchAll(/\[\s*([A-Za-z_:][\w:.-]*)/g)) if (!tokens.attrs.has(m[1])) out.push({ sel: one, why: `hidden behind [${m[1]}], which no markup carries (a script has to add it)` });
      }
    }
  }
  return out;
}

const SHIPPED_CSS = () => [
  ...walkFiles(DIST, (p) => p.endsWith('.css')).map((f) => readFileSync(join(DIST, f), 'utf8')),
  ...realPages().flatMap(({ html }) => [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1])),
];

test('the shape scanner can see: the finding\'s mutation (a new class a script adds, and a negated gate), the old mechanism and an unconditional gate on a new name; it passes a fallback and an ordinary rule', () => {
  const tokens = { classes: new Set(['no-js', 'nav__burger', 'sec']), attrs: new Set(['data-theme', 'class']) };
  const bad = (css) => gatedHiding([css], tokens).length;
  assert.ok(bad('html:not(.js-ready) main { opacity: 0; }') >= 1, 'the mutation (hidden unless js-ready is added) was not caught');
  assert.ok(bad('.js-ready main { opacity: 0 }') >= 1, 'a hide behind a class no markup carries was not caught');
  assert.ok(bad('html:not(.no-js) [data-reveal], html:not(.no-js) .kinetic { opacity: 0; transform: translateY(18px); }') >= 1, 'the old mechanism was not caught');
  assert.ok(bad('@media (min-width: 900px) { [data-state=closed] .sec { visibility: hidden } }') >= 1, 'a hide behind an attribute no markup carries was not caught');
  assert.equal(bad('.no-js .nav__burger { display: none }'), 0, 'the no-script fallback (hide the burger when there is no script) is read as a gate');
  assert.equal(bad('.sec:empty { display: none } html[data-theme=light] .sec { opacity: 1 } .btn:disabled { opacity: 0.48 }'), 0, 'an ordinary rule is read as a gate');
  assert.equal(bad('.sec[data-astro-cid-abc123]:not(:first-child) { display: none }'), 0, 'Astro\'s scoping attribute or a pseudo-class negation is read as a gate');
});

test('no shipped stylesheet hides content behind a class or attribute a script has to add, or behind a negated class: whatever it is called', () => {
  const pages = realPages();
  const css = SHIPPED_CSS();
  assert.ok(css.length >= 2, 'no built stylesheet was read');
  const rules = css.flatMap(rulesOf);
  assert.ok(rules.length > 200, `only ${rules.length} CSS rules were read from the build: the parser is blind`);
  assert.ok(rules.filter((r) => HIDES.test(r.decl)).length >= 3, 'no hiding rule was found in the build at all: the scanner is blind (the burger, the theme icons and the docs summary are hidden by rules)');
  const tokens = staticTokens(pages);
  assert.ok(tokens.classes.size > 100 && tokens.attrs.size > 10, 'the markup carries almost no classes: the walk of dist is blind');
  assert.deepEqual(gatedHiding(css, tokens).map((g) => `${g.sel.slice(0, 100)}: ${g.why}`), []);
});

// ============================================================================================= THE RESULT, IN A BROWSER

/** Serialised into the page: the words in <main> that are not really drawn, and whether <main> and its sections are displayed. */
function undrawn() {
  document.getAnimations().forEach((a) => { try { a.finish(); } catch { /* an infinite animation has no end: it is not a reveal */ } });
  const out = [];
  const main = document.querySelector('main');
  if (!main) return ['no <main>'];
  const shown = (el) => getComputedStyle(el).display !== 'none';
  if (!shown(main)) out.push('<main> is display:none');
  for (const s of main.querySelectorAll(':scope > section, :scope > article, :scope > div')) if (!shown(s)) out.push(`${s.tagName.toLowerCase()}.${s.className} is display:none`);
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  let t;
  let words = 0;
  while ((t = walker.nextNode())) {
    if (!t.textContent.trim()) continue;
    const el = t.parentElement;
    // A disabled control is dimmed on purpose (WCAG exempts it); `.btn:disabled` is the one dimmed thing on the site.
    if (el.closest('.visually-hidden, [hidden], script, style, noscript, template, :disabled')) continue;
    // Words inside a closed <details> (other than its summary) are not drawn on purpose; the disclosure is the reader's to open.
    const details = el.closest('details');
    if (details && !details.open && !el.closest('summary')) continue;
    words += 1;
    let opacity = 1;
    for (let n = el; n; n = n.parentElement) opacity *= parseFloat(getComputedStyle(n).opacity);
    const cs = getComputedStyle(el);
    if (opacity < 0.99 || cs.visibility === 'hidden') out.push(`"${t.textContent.trim().slice(0, 40)}" in ${el.tagName.toLowerCase()}.${el.className}: opacity ${opacity.toFixed(2)}, visibility ${cs.visibility}`);
  }
  if (words < 5) out.push(`only ${words} words are drawn in <main>`);
  return out.slice(0, 6);
}

test('in a browser with scripting OFF, with an IntersectionObserver that NEVER FIRES, and with REDUCED MOTION, every word of every built page is drawn', async () => {
  const pages = realPages().filter((p) => !/location\.replace\(/.test(p.html));
  assert.ok(pages.length >= 15, `only ${pages.length} pages were derived from dist`);
  const bad = [];
  let loaded = 0;
  await withBrowser(async (browser, base) => {
    const scenarios = [
      ['scripting off', { javaScriptEnabled: false }, null],
      ['an observer that never fires', {}, () => {
        window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
      }],
      ['reduced motion', { reducedMotion: 'reduce' }, null],
    ];
    for (const [name, options, init] of scenarios) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
      if (init) await context.addInitScript(init);
      const page = await context.newPage();
      for (const { route } of pages) {
        await page.goto(`${base}${route === '/404' ? '/404.html' : route}`, { waitUntil: 'load' });
        loaded += 1;
        for (const o of await page.evaluate(undrawn)) bad.push(`${route} (${name}): ${o}`);
      }
      await context.close();
    }
  });
  assert.ok(loaded >= pages.length * 3, `only ${loaded} loads were made`);
  assert.deepEqual(bad, []);
});

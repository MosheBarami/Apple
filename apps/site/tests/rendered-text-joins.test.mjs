// The built pages read as sentences: no word glued to the next, no entity shown as text.
//
// 2026-10-04: a compiler update (Astro, via the Dependabot bumps of that day) started dropping the
// line break between a word at the end of a source line and a `{expression}` that starts the next one,
// and passing an entity in a string prop (`heading="Privacy &amp; data"`) through to be escaped again.
// The live site then read "include.Paid checkout", "21 screens and6 maps", "up to1 MiB" and showed
// "Privacy &amp; data" as a heading. Every source-reading test passed, because the source was fine;
// only the built text was wrong. So this reads the built text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

function pages(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...pages(p));
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

/** The visible text of a page, with tags removed and entities decoded once, as a browser shows it. */
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ')
    // Code is not prose: `coins.Parent = stats` is meant to read that way.
    .replace(/<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

// A short function word fused to a number ("and6", "to1") or a sentence end fused to the next
// sentence ("include.Paid"). Abbreviations and file names (e.g. "i.e.", "index.html") do not match:
// the second form needs a lowercase word, a full stop, then a capitalised word of three letters or more.
const GLUED = [
  /\b(?:and|or|to|of|in|at|by|for|with|from|up)\d/g,
  /\b[a-z]{3,}\.[A-Z][a-z]{2,}\b/g,
];

const built = existsSync(DIST) ? pages(DIST) : [];

test('the built site exists, so the checks below measure something', { skip: built.length ? false : 'apps/site/dist is missing — run `npx astro build` first; nothing was measured' }, () => {
  assert.ok(built.length >= 15, `only ${built.length} built pages`);
});

test('no page shows an HTML entity as text', { skip: !built.length }, () => {
  const bad = [];
  for (const p of built) {
    const text = visibleText(readFileSync(p, 'utf8'));
    for (const m of text.matchAll(/&(?:amp|lt|gt|quot|#\d+);/g)) bad.push(`${relative(DIST, p)}: …${text.slice(Math.max(0, m.index - 30), m.index + 30)}…`);
  }
  assert.deepEqual(bad, []);
});

test('no page glues a word to the next one', { skip: !built.length }, () => {
  const bad = [];
  for (const p of built) {
    const text = visibleText(readFileSync(p, 'utf8'));
    for (const re of GLUED) for (const m of text.matchAll(re)) bad.push(`${relative(DIST, p)}: "${m[0]}" in …${text.slice(Math.max(0, m.index - 30), m.index + 30)}…`);
  }
  assert.deepEqual(bad, []);
});

// A WORD GLUED TO THE TAG AFTER IT (added 2026-10-05, M2 site rebuild; the debt list removed the same day, fix cycle 1).
//
// Astro 7's compiler, with its default `compressHTML: 'jsx'` (React's whitespace rules), drops the space between a word at the end of a source line and an inline tag that
// starts the next one: `...with it?\n<a href>Build</a>` was built as `with it?<a href>Build</a>` and a reader saw "with it?Build the plugin". The
// two checks above read the text, and the first pattern list cannot see a link. This reads the BUILT html: an opening inline tag directly after
// a letter, a digit or sentence punctuation is a space that was lost.
//
// THE FIRST VERSION NAMED A DEBT: 61 joins on 13 pages (the docs, /privacy and /terms) were exempt by route, "a debt that can only shrink". The
// cause was one setting (`compressHTML` in astro.config.mjs), not 61 sites; with `compressHTML: true` (lossless) every page, the legal pages
// included, is clean, so the exemption is deleted and EVERY built page is held to zero. The mutation that proves it is the setting: delete the
// line (the default 'jsx' comes back) and this fails with the 62 joins.
const GLUED_TAG = /[A-Za-z0-9.,?!:;)]<(?:a|em|strong|code|kbd)[ >]/g;
const stripNonProse = (html) => html.replace(/<(script|style|pre)[\s\S]*?<\/\1>/g, '');

test('no built page glues an inline tag to the word before it', { skip: !built.length }, () => {
  const bad = [];
  let read = 0;
  for (const p of built) {
    const route = relative(DIST, p).replace(/index\.html$/, '').replace(/\.html$/, '');
    const found = [...stripNonProse(readFileSync(p, 'utf8')).matchAll(GLUED_TAG)];
    read += 1;
    if (found.length) bad.push(`${route}: ${found.length} glued inline tag(s), e.g. "${found[0][0]}"`);
  }
  assert.ok(read >= 15, `only ${read} pages were read; the walk has drifted`);
  assert.deepEqual(bad, []);
});

test('the compiler keeps the space: astro.config.mjs sets compressHTML to a lossless value, not the JSX default', () => {
  const config = readFileSync(join(DIST, '..', 'astro.config.mjs'), 'utf8').replace(/\/\/.*$/gm, '');
  assert.match(config, /compressHTML:\s*(?:true|false)\b/, 'compressHTML is not set: Astro 7 defaults to the JSX rules and drops the space before an inline tag');
});

test('the glue scan can see: a lost space before a link is caught, a space and an opening bracket are not', () => {
  assert.equal([...'with it?<a href="/x">Build</a>'.matchAll(GLUED_TAG)].length, 1);
  assert.equal([...'with it? <a href="/x">Build</a> and (<code>x</code>)'.matchAll(GLUED_TAG)].length, 0);
});

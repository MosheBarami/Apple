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

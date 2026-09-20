/**
 * THE PUBLISHED DESCRIPTION OF "DOWNLOAD MY DATA" HAS TO MATCH WHAT THE BUTTON DOES.
 *
 * It has now been wrong in both directions, which is why this guard is two-sided rather than a
 * list of forbidden phrases.
 *
 * Wrong the first way: /privacy and /docs/privacy-and-data said the file "is not a complete archive
 * of every store" and "lists separate routes for project transcripts, checkpoints, memory,
 * workspace files, images and usage". That was true, and it described a promise — "downloads all
 * their data" — that the product was not keeping. Measured on the live product on 2026-09-20: one
 * click produced 23,899 bytes reading `"complete": false` with messages, checkpoints, usage_events
 * and studio_pairings outstanding.
 *
 * Wrong the second way, which is what this file exists to prevent: settings.tsx now follows those
 * routes itself — measured again the same day, 159,032 bytes, 101 routes, 0 failures, seven
 * transcripts and twenty messages inside the file — and a page still telling people to go and fetch
 * their transcripts separately would send them looking for something they already have.
 *
 * So the rule is DERIVED from the app. Whether the pages may describe a store as "fetch it
 * yourself" depends on whether settings.tsx covers it, and the source of that answer is the same
 * table the downloader walks.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

/**
 * Prose as a reader meets it: comments gone, tags gone, and whitespace collapsed.
 *
 * The collapse is not tidiness. This file's first run failed on "live Studio pairing\n    code" —
 * a phrase the page says and a regex written across a line break cannot see. A guard that can be
 * defeated by where the author pressed return is a guard that will be.
 */
const strip = (html) =>
  html
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&rsquo;/g, '\u2019')
    .replace(/\s+/g, ' ');

const PAGES = {
  '/privacy': strip(read('../src/pages/privacy.astro')),
  '/docs/privacy-and-data': strip(read('../src/pages/docs/privacy-and-data.astro')),
};

const SETTINGS = read('../../web/src/routes/settings.tsx');

/** The store names settings.tsx's own source tables say it follows. */
function coveredByTheApp() {
  const from = SETTINGS.indexOf('const USER_SOURCES');
  const to = SETTINGS.indexOf('const OMISSION_WHY');
  assert.ok(from > 0 && to > from, 'the export source tables are gone from settings.tsx');
  const block = SETTINGS.slice(from, to);
  const covered = new Set();
  for (const m of block.matchAll(/covers:\s*\[([^\]]*)\]/g)) {
    for (const n of m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)) covered.add(n[1]);
  }
  return covered;
}

test('the app still has a table saying what it follows', () => {
  const covered = coveredByTheApp();
  assert.ok(covered.size > 10, `only ${covered.size} stores are covered — re-derive these pages`);
});

test('a store the button collects is not published as something to fetch yourself', () => {
  const covered = coveredByTheApp();
  // The three the live file used to be missing, named the way the pages name them.
  const asWritten = [
    ['messages', /transcripts?/i],
    ['checkpoints', /checkpoints/i],
    ['usage_events', /usage|Credit spend/i],
  ];
  for (const [store, word] of asWritten) {
    if (!covered.has(store)) continue; // the app does not collect it: the pages may say so
    for (const [where, text] of Object.entries(PAGES)) {
      const at = text.search(/Download my data/);
      assert.ok(at > 0, `${where} no longer mentions the control`);
      const section = text.slice(at, at + 1600);
      assert.equal(
        /separate routes|not a complete archive/i.test(section),
        false,
        `${where} still describes the export as a partial file with routes to follow — ${store} is collected now`,
      );
      assert.match(section, word, `${where} should say the file carries ${store}`);
    }
  }
});

test('the two things that really do stay out are named on both pages', () => {
  for (const [where, text] of Object.entries(PAGES)) {
    const at = text.search(/Download my data/);
    const section = text.slice(at, at + 1800);
    assert.match(section, /bytes/i, `${where} must say bytes are not in the file`);
    assert.match(section, /pairing code/i, `${where} must say the pairing code is withheld`);
    assert.match(section, /(does not answer|did not answer|names? which one|failed)/i,
      `${where} must say what happens when a route does not answer`);
  }
});

// ---------------------------------------------------------------------------
// The guard can fail.
// ---------------------------------------------------------------------------
test('the guard rejects the paragraph that shipped', () => {
  const shipped =
    'Settings → Privacy → Download my data exports available account database records and ' +
    'API-key metadata, not secret keys. It is not a complete archive of every store. The file ' +
    'reports unreadable, failed or capped tables and lists separate routes for project ' +
    'transcripts, checkpoints, memory, workspace files, images and usage.';
  assert.match(shipped, /separate routes|not a complete archive/i);
  assert.equal(/pairing code/i.test(shipped), false);
});

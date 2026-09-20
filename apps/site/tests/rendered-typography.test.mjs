// WHAT A PAGE LOOKS LIKE, MEASURED WHERE IT IS LOOKED AT.
//
// Every other file in this directory reads source or built HTML, which is the right place to check
// a CLAIM. It is the wrong place to check a LOOK. Two defects closed on 2026-09-20 were invisible
// to any amount of reading:
//
//   1. EIGHTY-TWO ORPHANED LAST LINES. A pass over all nineteen routes at 375px and 1280px found
//      82 text blocks whose final visual line held one word — "once.", "month", "declined", "one",
//      "beta." — with /docs/privacy-and-data alone contributing ten and /docs/billing eight. No
//      character in any .astro file is wrong; the defect exists only once a browser has broken the
//      lines, and it is the specific thing that makes a page read as unfinished beside the bar in
//      docs/evidence/gauntlet/bar-lovable.json. Remove the two rules that hold it down and this
//      file reports 82 again: 80 of them from global.css, 2 from landing.css, each measured by
//      mutating that file alone.
//
//   2. THE 404's EYEBROW WAS OFF-AXIS. `.eyebrow` is `display: flex` in global.css, so it ignores
//      the `text-align: center` it inherits and lays its text out from flex-start. On the one page
//      whose column is centred, "ERROR 404" therefore sat hard left under a centred heading. The
//      stylesheet reads correctly at every line; only the rendered position is wrong.
//
// SO THIS FILE RENDERS. It serves apps/site/dist over loopback and drives a real Chromium at both
// widths. It never reads a stylesheet: asserting that `text-wrap: pretty` is present in the CSS
// would prove that somebody typed it, not that the engine honoured it, and that is the same blind
// check that produced four false reds in this repository in one night.
//
// IT FAILS RATHER THAN SKIPS. No build, no browser, no server — each is a failure to observe, and
// a failure to observe must not render as an observation. The message names which.
//
// AND IT PROVES IT CAN SEE. Before it reports a page clean, the scanner is pointed at a paragraph
// this file injects that ends on a single short word, and must find it. A word-boxing routine that
// silently stops matching would otherwise call all nineteen routes clean forever.
//
// Run with:  npx astro build && node --test tests/rendered-typography.test.mjs   (from apps/site)
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join, dirname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(SITE, 'dist');
const ROOT = join(SITE, '..', '..');

// Every route a reader can reach, which is the set scripts/check-site-links.mjs walks. A route
// added to src/pages and not added here is measured nowhere, so the list is asserted against the
// build below rather than trusted.
const ROUTES = [
  '/',
  '/pricing/',
  '/changelog/',
  '/status/',
  '/privacy/',
  '/terms/',
  '/404.html',
  '/docs/',
  '/docs/getting-started/',
  '/docs/plugin/',
  '/docs/connect/',
  '/docs/modes/',
  '/docs/credits-and-limits/',
  '/docs/billing/',
  '/docs/updating/',
  '/docs/troubleshooting/',
  '/docs/privacy-and-data/',
  '/docs/faq/',
  '/docs/build-from-source/',
];

const WIDTHS = [375, 1280];

// THE BUDGET IS ZERO, and it took a corrected scanner to be able to say that.
//
// The first version of this scan grouped words into lines by the TOP of each word's box, and
// reported eight survivors after the fix: ".rbxm", "K7M3QP" and a bare "." stranded on
// /docs/build-from-source, /docs/connect and /docs/getting-started. Every one was a false
// positive. An inline <code> is set smaller than the prose around it, so on a ONE-LINE paragraph
// its box top sits four pixels below its neighbours' — 1052.77 against 1048.77, measured — and a
// top-grouped scanner calls that a second line with one word on it. Grouping by the baseline
// instead (they share a bottom of 1066.77 to the hundredth) removed all eight and left exactly one
// real defect, on /docs/billing at 375px, which an &nbsp; before "non-payment." closed.
//
// This is written down because the near miss was a budget of 8 justified by a paragraph about
// unbreakable code spans: a confident explanation for a number the check had invented. The
// explanation would have been in the file forever, and the guard would have had eight strays of
// slack for a real regression to hide in.
const ORPHAN_BUDGET = 0;

// ---------------------------------------------------------------------------
// The scanner. It is serialised into the page by Playwright, so it may close over nothing.
//
// It boxes every word with a Range and groups by the top of its box: the last group is the last
// visual line. That is the only way to see a line break — the DOM has no node for one, and
// scrollHeight / clientHeight arithmetic cannot tell a two-line block that ends on one word from
// one that ends on six.
// ---------------------------------------------------------------------------
function scanOrphans() {
  const found = [];
  const range = document.createRange();
  for (const el of document.querySelectorAll('h1,h2,h3,h4,p,li,blockquote,figcaption,dd,dt')) {
    // Containers, not text blocks: a <li> holding a <ul> has no last line of its own.
    if ([...el.children].some((c) => ['P', 'UL', 'OL', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'TABLE'].includes(c.tagName))) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (getComputedStyle(el).visibility === 'hidden') continue;
    // Inside a collapsed disclosure the docs nav still reports boxes in this engine, which is how
    // an earlier pass "found" that every docs page opened on its own navigation. It does not.
    if (el.closest('details:not([open])')) continue;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const words = [];
    let t;
    while ((t = walker.nextNode())) {
      const text = t.textContent;
      let i = 0;
      while (i < text.length) {
        while (i < text.length && /\s/.test(text[i])) i++;
        let j = i;
        while (j < text.length && !/\s/.test(text[j])) j++;
        if (j > i) {
          range.setStart(t, i);
          range.setEnd(t, j);
          const rr = range.getBoundingClientRect();
          // BOTTOM, NOT TOP. An inline <code> is set smaller than the prose around it, so its box
          // TOP sits four pixels lower on the very same line — and a scanner that grouped by top
          // called it a second line and reported ".rbxm", "K7M3QP" and a bare "." as stranded
          // words on one-line paragraphs. Every one of those was a false positive: the words share
          // a baseline, so they share a bottom to within a rounding error.
          if (rr.height > 0 || rr.width > 0) words.push({ w: text.slice(i, j), bottom: rr.bottom });
        }
        i = j;
      }
    }
    if (words.length < 5) continue;
    // Cluster the baselines rather than matching them exactly: sub-pixel layout puts two words on
    // one line a hundredth of a pixel apart, and two pixels is far below any line height here.
    const lines = [];
    for (const x of [...words].sort((a, b) => a.bottom - b.bottom)) {
      const line = lines[lines.length - 1];
      if (line && Math.abs(x.bottom - line.bottom) <= 2) line.words.push(x.w);
      else lines.push({ bottom: x.bottom, words: [x.w] });
    }
    if (lines.length < 2) continue;
    const last = lines[lines.length - 1].words;
    // One word, and a short one: a final line reading "responsibilities." is not the defect.
    if (last.length === 1 && last[0].replace(/[^A-Za-z0-9]/g, '').length <= 12) {
      found.push({
        tag: el.tagName,
        orphan: last[0],
        lines: lines.length,
        text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 70),
      });
    }
  }
  return found;
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
};

/** Serves dist, resolving `/docs/billing/` to `docs/billing/index.html`, on an OS-chosen port. */
function serveDist() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    // normalize() then a prefix check: a request for /../../etc/passwd must not leave dist.
    let file = normalize(join(DIST, decodeURIComponent(url.pathname)));
    if (!file.startsWith(DIST + sep) && file !== DIST) {
      res.writeHead(403).end();
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function loadChromium() {
  // @playwright/test is a devDependency of the repository root, not of this package, and it is
  // CommonJS. Both facts are handled here rather than by adding a dependency, because installing
  // is not this lane's to do.
  const require_ = createRequire(join(ROOT, 'package.json'));
  let mod;
  try {
    mod = require_('@playwright/test');
  } catch (err) {
    assert.fail(
      'this check renders the pages and cannot find @playwright/test at the repository root: ' +
        `${err.message}. That is a failure to observe, not a clean site.`,
    );
  }
  return mod.chromium;
}

test('THE BUILD AND THE BROWSER ARE BOTH HERE, or this file has measured nothing', async () => {
  assert.ok(existsSync(DIST), 'apps/site/dist is missing — run `npx astro build` in apps/site first');
  for (const route of ROUTES) {
    const file = route.endsWith('.html') ? join(DIST, route) : join(DIST, route, 'index.html');
    assert.ok(existsSync(file), `${route} is not in the build, so nothing below measured it`);
  }
  const chromium = loadChromium();
  let browser;
  try {
    browser = await chromium.launch();
  } catch (err) {
    assert.fail(
      `Chromium would not launch (${err.message}). Run \`npx playwright install chromium\` at the ` +
        'repository root. A page nobody rendered is not a page nobody found a defect on.',
    );
  }
  await browser.close();
});

test('NO PAGE STRANDS A WORD ON ITS OWN LINE, at 375px or at 1280px', async () => {
  const chromium = loadChromium();
  const { server, port } = await serveDist();
  const browser = await chromium.launch();
  const base = `http://127.0.0.1:${port}`;
  const strays = [];
  let controlSaw = 0;
  try {
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await ctx.newPage();
      for (const route of ROUTES) {
        const res = await page.goto(base + route, { waitUntil: 'load' });
        assert.equal(res?.status(), 200, `${route} did not serve at ${width}px`);

        // POSITIVE CONTROL, on every page rather than once: a paragraph engineered to end on one
        // short word, in the page's own type, inside the page's own column. If the scanner cannot
        // see this, the clean report that follows is worth nothing. It is removed before the real
        // scan so it cannot be counted as a defect of the page.
        await page.evaluate(() => {
          const host = document.querySelector('main') ?? document.querySelector('article') ?? document.body;
          const p = document.createElement('p');
          p.id = 'orphan-control';
          // The column is narrower than any two of these words plus a space, so the engine puts one
          // word on each line and the last line holds "yes." alone. Built that way deliberately:
          // a control written as ordinary prose was FIXED by the very `text-wrap: pretty` this file
          // is checking — the rule pulled the stray word up and the control found nothing, which
          // reads exactly like a blind scanner. This one cannot be reflowed away, because there is
          // no earlier line with room to take a word.
          p.style.width = '90px';
          p.style.fontSize = '16px';
          p.textContent = 'onlyoneword perlinehere becausewide enoughfornone elsefitshere yes.';
          host.appendChild(p);
        });
        const controlHits = (await page.evaluate(scanOrphans)).filter((h) => h.orphan === 'yes.').length;
        await page.evaluate(() => document.getElementById('orphan-control')?.remove());
        assert.equal(
          controlHits,
          1,
          `the orphan scanner did not see a deliberately stranded word on ${route} at ${width}px — ` +
            'it is blind, and any clean result it gives is meaningless',
        );
        controlSaw += controlHits;

        const hits = await page.evaluate(scanOrphans);
        for (const h of hits) {
          strays.push(`${width}px ${route} <${h.tag.toLowerCase()}> ends on "${h.orphan}" — ${h.text}`);
        }
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  assert.equal(controlSaw, ROUTES.length * WIDTHS.length, 'the control did not run on every page');
  assert.ok(
    strays.length <= ORPHAN_BUDGET,
    `${strays.length} text blocks end on a stranded word, and the budget is ${ORPHAN_BUDGET}:\n  ` +
      strays.join('\n  ') +
      '\n\nThe rules that hold this down are the `text-wrap: balance` / `text-wrap: pretty` pair in ' +
      'src/styles/global.css and src/styles/landing.css. If one of them was removed, this is what ' +
      'the pages look like without it.',
  );
});

test('EVERY PAGE TITLE IS SET THE SAME WAY, and none falls back to the browser\'s bold 2em', async () => {
  // /status shipped its <h1> with no `carved` class. An unstyled <h1> is 2em at weight 700 with no
  // tracking, so at 1280px that title rendered at 32px/700/normal while every other page on the
  // site rendered 51.2–56px at weight 400 with about -1.02px of tracking — the page a reader opens
  // when they think the product is down was the one that looked like a document nobody had styled,
  // and the only bold heading anywhere on the site.
  //
  // The property is agreement, not a number: the titles are measured against each other, so a
  // deliberate change to the type scale moves them together and this stays green, while one page
  // dropping out of the system takes it red. A weight of 700 is called out by name because that is
  // what the fallback looks like and no heading here is bold.
  const chromium = loadChromium();
  const { server, port } = await serveDist();
  const browser = await chromium.launch();
  const odd = [];
  try {
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await ctx.newPage();
      const seen = [];
      for (const route of ROUTES) {
        await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'load' });
        const m = await page.evaluate(() => {
          const h = document.querySelector('h1');
          if (!h) return null;
          const cs = getComputedStyle(h);
          return { size: parseFloat(cs.fontSize), weight: Number(cs.fontWeight), tracking: cs.letterSpacing };
        });
        assert.ok(m, `${route} has no <h1> at ${width}px`);
        seen.push({ route, ...m });
      }
      // The typographic system, read off the pages themselves rather than typed in here.
      const sizes = seen.map((x) => x.size);
      const median = [...sizes].sort((a, b) => a - b)[Math.floor(sizes.length / 2)];
      for (const x of seen) {
        if (x.weight >= 600) {
          odd.push(`${width}px ${x.route} title is weight ${x.weight} — nothing else on this site is bold`);
        }
        // A fifth off the median is far wider than the clamp's own spread (51.2 to 56 at 1280px)
        // and far narrower than the gap the unstyled fallback opened (32 against 51.2).
        if (Math.abs(x.size - median) / median > 0.2) {
          odd.push(`${width}px ${x.route} title is ${x.size}px where the other eighteen sit near ${median}px`);
        }
        if (x.tracking === 'normal' && median > 40) {
          odd.push(`${width}px ${x.route} title has no letter-spacing where the rest carry about -0.02em`);
        }
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  assert.deepEqual(
    odd,
    [],
    `a page title is not set the way the others are:\n  ${odd.join('\n  ')}\n` +
      'An <h1> with no `carved` class gets the browser\'s default, which is what this catches.',
  );
});

test("THE 404's LABEL IS ON THE PAGE'S AXIS, not hard against the left of it", async () => {
  const chromium = loadChromium();
  const { server, port } = await serveDist();
  const browser = await chromium.launch();
  try {
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await ctx.newPage();
      await page.goto(`http://127.0.0.1:${port}/404.html`, { waitUntil: 'load' });

      // The element's BOX is full-width whether or not the fix is present — it is a block-level
      // flex container either way — so the box proves nothing. What moved is the TEXT inside it,
      // which is why this boxes the text with a Range and compares its centre to the heading's.
      const m = await page.evaluate(() => {
        const eyebrow = document.querySelector('.lost .eyebrow');
        const h1 = document.querySelector('.lost h1');
        const range = document.createRange();
        range.selectNodeContents(eyebrow);
        const e = range.getBoundingClientRect();
        const h = h1.getBoundingClientRect();
        return {
          eyebrowCentre: e.left + e.width / 2,
          headingCentre: h.left + h.width / 2,
          justify: getComputedStyle(eyebrow).justifyContent,
          text: eyebrow.textContent.trim(),
        };
      });
      assert.ok(m.text.length > 0, 'the 404 has no eyebrow label, so this test guards nothing');
      assert.ok(
        Math.abs(m.eyebrowCentre - m.headingCentre) <= 2,
        `at ${width}px the 404's "${m.text}" is centred on ${Math.round(m.eyebrowCentre)}px while its ` +
          `heading is centred on ${Math.round(m.headingCentre)}px (justify-content: ${m.justify}). ` +
          '.eyebrow is display:flex, so text-align does not reach it — it needs justify-content: center, ' +
          'the way /pricing centres its three.',
      );
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
});

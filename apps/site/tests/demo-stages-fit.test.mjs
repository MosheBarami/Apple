/**
 * THE FOUR CAPABILITY STAGES FIT WHERE THEY ARE PUT, AND STAY OPERABLE ON A PHONE.
 *
 * WHY THIS IS RENDERED AND NOT READ. `tests/capability-demos-run.test.mjs` proves the four stages
 * RESPOND — it executes the real script and presses the controls. It cannot see where anything is.
 * A stage whose right edge is 17px off the screen responds perfectly.
 *
 * WHICH IS NOT HYPOTHETICAL AND IS WHY THIS FILE EXISTS. The phone rule was written
 * `grid-template-columns: 1fr`. A bare `1fr` is `minmax(auto, 1fr)` and `auto` as a track minimum
 * is min-content, so the track floored at the min-content width of a stage holding
 * `white-space: nowrap` rows and a `white-space: pre` code block. Measured in Chromium at 375px:
 * `.demos` 343px wide at x16, every `.demo-stage` 360px wide running to x376 — 17px past its own
 * container and one pixel past the viewport.
 *
 * THE EXISTING GUARD WAS RIGHT NOT TO CATCH IT. `tests/e2e/landing.spec.ts` allows 1px of document
 * overflow, and at the document level this was exactly 1px. The defect was at the panel's edge, and
 * a document-level measurement is the wrong instrument for it. This file measures the containment
 * itself.
 *
 * WHAT IT PINS. Properties, not numbers:
 *   - no stage is wider than the grid that holds it, at any of four widths
 *   - the three defect markers in the critique are separable by a finger
 *   - the code panel's controls are all inside the panel
 * It quotes no pixel width of its own, so a change to the gutter, the shell or the breakpoint
 * cannot turn it red for being a change.
 *
 * IT FAILS RATHER THAN SKIPS. No build, no browser: each is a failure to observe, and a failure to
 * observe must not render as an observation.
 *
 * Run with:  npx astro build && node --test tests/demo-stages-fit.test.mjs   (from apps/site)
 */
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

/* 320 is the smallest width this site claims to support and is already listed by the e2e sweep;
   768 is the breakpoint itself, where a rule written for one side of it is most likely to be
   applied on the other; 1024 is the shell; 1440 is the desk. */
const WIDTHS = [320, 375, 768, 1440];

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

function serveDist() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let file = normalize(join(DIST, decodeURIComponent(url.pathname)));
    if (!file.startsWith(DIST + sep) && file !== DIST) return void res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) return void res.writeHead(404).end('not found');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function loadChromium() {
  // @playwright/test is a devDependency of the repository root, not of this package, and it is
  // CommonJS. Both handled here rather than by adding a dependency; installing is not this lane's.
  const require_ = createRequire(join(ROOT, 'package.json'));
  try {
    return require_('@playwright/test').chromium;
  } catch (err) {
    return assert.fail(
      'this check renders the page and cannot find @playwright/test at the repository root: ' +
        `${err.message}. That is a failure to observe, not a page with no defects.`,
    );
  }
}

/** One pass: every measurement this file makes, at one width. */
function measure() {
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const demos = document.querySelector('.demos');
  return {
    grid: demos ? box(demos) : null,
    stages: [...document.querySelectorAll('.demo-stage')].map(box),
    marks: [...document.querySelectorAll('.cw-mark')].map(box),
    render: [...document.querySelectorAll('.cw-render')].map(box),
    asks: [...document.querySelectorAll('.lu-ask')].map(box),
    luPanel: [...document.querySelectorAll('.lu')].map(box),
    viewport: document.documentElement.clientWidth,
  };
}

async function sweep(fn) {
  const chromium = loadChromium();
  const { server, port } = await serveDist();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
      // The stages are behind the reveal pass; its failsafe reveals everything after 2.6s, and the
      // observer normally fires long before. Waiting on the element rather than on a timer.
      await page.waitForSelector('.demo-stage', { state: 'attached' });
      fn(width, await page.evaluate(measure));
    }
  } finally {
    await browser.close();
    server.close();
  }
}

test('THE BUILD AND THE BROWSER ARE BOTH HERE, or this file has measured nothing', async () => {
  assert.ok(existsSync(DIST), 'apps/site/dist is missing — run `npx astro build` in apps/site first');
  assert.ok(
    readFileSync(join(DIST, 'index.html'), 'utf8').includes('demo-stage'),
    'the built index.html holds no .demo-stage — this file would sweep four widths and find nothing',
  );
  const browser = await loadChromium().launch();
  await browser.close();
});

test('no capability stage is wider than the grid that holds it, at any supported width', async () => {
  const bad = [];
  let seen = 0;
  await sweep((width, m) => {
    assert.ok(m.grid, `${width}px: .demos was not found, so nothing was measured here`);
    assert.equal(m.stages.length, 4, `${width}px: ${m.stages.length} stages found, not four`);
    for (const [i, s] of m.stages.entries()) {
      seen += 1;
      // 1px of tolerance for sub-pixel rounding on a fractional track, and no more: the defect
      // this was written for was 17.
      if (s.w > m.grid.w + 1 || s.r > m.grid.r + 1 || s.l < m.grid.l - 1) {
        bad.push(`${width}px stage ${i + 1}: x${s.l}->${s.r} (w ${s.w}) outside .demos x${m.grid.l}->${m.grid.r} (w ${m.grid.w})`);
      }
      if (s.r > m.viewport) bad.push(`${width}px stage ${i + 1}: right edge ${s.r} is past the viewport`);
    }
  });
  assert.equal(seen, WIDTHS.length * 4, `only ${seen} stage boxes were measured; the sweep did not run`);
  assert.deepEqual(bad, [], `a capability stage does not fit where it is put:\n  ${bad.join('\n  ')}`);
});

test('the three defect markers stay separable by a finger, and stay on the render', async () => {
  const bad = [];
  await sweep((width, m) => {
    assert.equal(m.marks.length, 3, `${width}px: ${m.marks.length} markers, not three`);
    const render = m.render[0];
    for (const [i, k] of m.marks.entries()) {
      // A marker whose box leaves the render is a marker pointing at nothing. Its own 26px box is
      // deliberately larger than the ring it draws, so half of it may sit over the edge; the
      // centre may not.
      const cx = (k.l + k.r) / 2;
      if (cx < render.l || cx > render.r) bad.push(`${width}px marker ${i + 1}: centre ${cx} is off the render x${render.l}->${render.r}`);
    }
    // THE PROPERTY IS SEPARABILITY, not a gap in pixels. Two targets a finger cannot choose between
    // are one target, and at 375px an earlier two-column layout put these 14px apart.
    const centres = m.marks.map((k) => (k.l + k.r) / 2).sort((a, b) => a - b);
    for (let i = 1; i < centres.length; i += 1) {
      const gap = centres[i] - centres[i - 1];
      if (gap < 24) bad.push(`${width}px: two markers are ${Math.round(gap)}px apart, centre to centre`);
    }
  });
  assert.deepEqual(bad, [], `the critique's markers cannot be aimed at:\n  ${bad.join('\n  ')}`);
});

test('every ask in the Luau stage is inside its own panel', async () => {
  const bad = [];
  await sweep((width, m) => {
    assert.equal(m.asks.length, 3, `${width}px: ${m.asks.length} asks, not three`);
    const panel = m.luPanel[0];
    for (const [i, a] of m.asks.entries()) {
      if (a.r > panel.r + 1 || a.l < panel.l - 1) {
        bad.push(`${width}px ask ${i + 1}: x${a.l}->${a.r} outside the panel x${panel.l}->${panel.r}`);
      }
    }
  });
  assert.deepEqual(bad, [], `an ask is clipped, so a reader cannot press it:\n  ${bad.join('\n  ')}`);
});

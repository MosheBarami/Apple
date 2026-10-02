/**
 * THE FRONT PAGE'S NEW CONTRACT (phase 6, "Ember Rail"): THE BASEPLATE, THE RAIL, THE SNAP, THE EXAMPLES.
 *
 * Reading the source cannot tell a live control from a dead one, so the first half exercises the toy's
 * RULES under Node (baseplate-model.ts is plain data and plain functions, and Node strips the types
 * natively), and the second half drives the BUILT page in a real Chromium: it places bricks with a
 * mouse and with a keyboard, drags along a row, reads the live region, checks that the bridge writes
 * into the composer and never submits, and that the Rail, the progress bar and the Snap are wired.
 *
 * WHAT THESE GUARD, in the owner's words for the gimmick: it must be honest. So the tests that
 * matter most here are the negatives: the board starts empty (no pre-built layout), nothing is
 * placed by a script on its own, the bridge never submits the form, a fully stacked stud refuses
 * a fourth brick, and under reduced motion the brick simply is there.
 *
 * The browser half needs `apps/site/dist` (run `npx astro build` first) and Playwright's Chromium at
 * the repository root; it fails, rather than skips, when either is missing: a page nobody rendered
 * is not a page nobody found a defect on.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(SITE, '..', '..');
const DIST = join(SITE, 'dist');

const model = await import(join(SITE, 'src', 'components', 'baseplate-model.ts'));

/* ====================================================================== 1. the rules of the board === */

test('the board starts empty: there is no pre-built layout to pass off as the visitor\'s', () => {
  const b = model.emptyBoard();
  assert.equal(model.countBricks(b), 0);
  assert.equal(model.describeBoard(b), '');
  assert.equal(b.length, model.MAX_ROWS);
  assert.equal(b[0].length, model.MAX_COLS);
});

test('a stud takes at most three bricks, and the fourth is refused without changing anything', () => {
  const b = model.emptyBoard();
  for (let i = 0; i < model.MAX_HEIGHT; i += 1) assert.equal(model.place(b, 1, 2, 'red').ok, true);
  const refused = model.place(b, 1, 2, 'blue');
  assert.deepEqual(refused, { ok: false, reason: 'full' });
  assert.deepEqual(b[1][2], ['red', 'red', 'red']);
});

test('placing outside the plate or with an unknown colour is refused', () => {
  const b = model.emptyBoard();
  assert.equal(model.place(b, -1, 0, 'red').ok, false);
  assert.equal(model.place(b, 0, model.MAX_COLS, 'red').ok, false);
  assert.equal(model.place(b, 0, 0, 'orange').ok, false, 'a colour outside the four brick hues was accepted (Ember is never a brick)');
  assert.equal(model.countBricks(b), 0);
});

test('remove takes the top brick only, and an empty stud gives nothing back', () => {
  const b = model.emptyBoard();
  model.place(b, 0, 0, 'red');
  model.place(b, 0, 0, 'blue');
  assert.equal(model.removeTop(b, 0, 0), 'blue');
  assert.deepEqual(b[0][0], ['red']);
  assert.equal(model.removeTop(b, 4, 4), null);
});

test('the announcements say the colour, the column and the row, counted from one', () => {
  assert.equal(model.announcePlaced('red', 0, 2), 'Red brick placed at column 3, row 1');
  assert.equal(model.announceRemoved('blue', 4, 0), 'Blue brick removed from column 1, row 5');
  const b = model.emptyBoard();
  assert.equal(model.cellLabel(b[0][0], 0, 0), 'Column 1, row 1, empty');
  model.place(b, 0, 0, 'red');
  model.place(b, 0, 0, 'green');
  assert.equal(model.cellLabel(b[0][0], 0, 0), 'Column 1, row 1, 2 bricks: red, green');
});

test('the bridge sentence is computed from the bricks that are there, and from nothing else', () => {
  const b = model.emptyBoard();
  model.place(b, 0, 0, 'red');
  assert.equal(model.describeBoard(b), 'One red brick on a baseplate.');

  const tower = model.emptyBoard();
  model.place(tower, 2, 3, 'red');
  model.place(tower, 2, 3, 'blue');
  model.place(tower, 2, 3, 'red');
  assert.equal(model.describeBoard(tower), 'A tower, 3 bricks high, in red and blue.');

  const flat = model.emptyBoard();
  for (let c = 0; c < 4; c += 1) model.place(flat, 1, c, 'green');
  assert.equal(model.describeBoard(flat), 'A flat layout of 4 bricks, 4 studs wide, in green.');

  const mixed = model.emptyBoard();
  model.place(mixed, 0, 0, 'yellow');
  model.place(mixed, 0, 0, 'yellow');
  model.place(mixed, 0, 5, 'blue');
  assert.equal(model.describeBoard(mixed), 'A build 2 studs wide and up to 2 bricks high, 3 bricks in blue and yellow.');
});

test('a narrow screen describes only what it shows, and keeps the rest', () => {
  const b = model.emptyBoard();
  model.place(b, 0, 0, 'red');
  model.place(b, 0, 11, 'blue');
  assert.equal(model.countBricks(b), 2);
  assert.equal(model.countBricks(b, { cols: 7, rows: 4 }), 1);
  assert.equal(model.describeBoard(b, { cols: 7, rows: 4 }), 'One red brick on a baseplate.');
  assert.equal(b[0][11].length, 1, 'a brick outside the visible window was deleted rather than hidden');
});

test('a stored board round-trips, and anything else is refused rather than repaired', () => {
  const b = model.emptyBoard();
  model.place(b, 3, 4, 'yellow');
  assert.deepEqual(model.parse(model.serialize(b)), b);
  for (const bad of [null, '', 'nope', '[]', '{"a":1}', JSON.stringify(model.emptyBoard().slice(1))]) {
    assert.equal(model.parse(bad), null, `parse accepted ${String(bad).slice(0, 30)}`);
  }
  const forged = model.emptyBoard();
  forged[0][0] = ['red', 'red', 'red', 'red'];
  assert.equal(model.parse(JSON.stringify(forged)), null, 'a stack taller than the limit was accepted');
  const wrongColour = JSON.parse(model.serialize(model.emptyBoard()));
  wrongColour[0][0] = ['ember'];
  assert.equal(model.parse(JSON.stringify(wrongColour)), null, 'a stored colour outside the four hues was accepted');
});

test('the view keeps every stud at least 44px wide', () => {
  for (const width of [288, 343, 375, 592, 880, 1064]) {
    const v = model.viewFor(width);
    assert.ok(v.cols >= 5 && v.cols <= model.MAX_COLS, `${width}px gave ${v.cols} columns`);
    if (v.cols > 5) assert.ok((width - (v.cols - 1) * 4) / v.cols >= 44 - 0.01, `${width}px with ${v.cols} columns gives studs under 44px`);
  }
  assert.equal(model.viewFor(1064).cols, 12);
});

/* ====================================================================== 2. the built page, in a browser === */

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.xml': 'application/xml' };

function serveDist() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let file = normalize(join(DIST, decodeURIComponent(url.pathname)));
    if (!file.startsWith(DIST + sep) && file !== DIST) { res.writeHead(403).end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

assert.ok(existsSync(join(DIST, 'index.html')), 'apps/site/dist is missing: run `npx astro build` in apps/site first');
const { chromium } = createRequire(join(ROOT, 'package.json'))('@playwright/test');
const { server, port } = await serveDist();
const browser = await chromium.launch();
const BASE = `http://127.0.0.1:${port}`;

test.after(async () => {
  await browser.close();
  server.close();
});

async function open({ width = 1280, height = 900, reduced = false, theme } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  if (theme) await page.addInitScript((t) => localStorage.setItem('apple-theme', t), theme);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-grid] .cell');
  return { ctx, page, problems };
}

const live = (page) => page.locator('[data-live]').textContent();

test('the hero is in reading order: title, composer, examples, then the toy', async () => {
  const { ctx, page, problems } = await open();
  const order = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const pos = (el) => { let n = 0; for (const x of document.querySelectorAll('*')) { if (x === el) return n; n += 1; } return -1; };
    return ['#hero-title', 'form.composer', '.examples', '[data-baseplate]'].map((s) => pos(q(s)));
  });
  assert.deepEqual([...order].sort((a, b) => a - b), order, `DOM order is ${order}`);
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('the board starts empty in the browser, and no brick is placed until a visitor acts', async () => {
  const { ctx, page } = await open();
  await page.waitForTimeout(800);
  assert.equal(await page.locator('.brick').count(), 0);
  assert.equal(await page.locator('[data-bridge]').isVisible(), false, 'the bridge is offered with nothing built');
  await ctx.close();
});

test('a click places a brick, labels the stud, announces it, and offers the bridge', async () => {
  const { ctx, page, problems } = await open();
  const stud = page.locator('.cell[data-row="1"][data-col="2"]');
  await stud.click();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.brick').count(), 1);
  assert.equal(await stud.getAttribute('aria-label'), 'Column 3, row 2, 1 brick: red');
  assert.equal(await live(page), 'Red brick placed at column 3, row 2');
  assert.equal(await page.locator('[data-bridge]').isVisible(), true);
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('every stud is at least 44px square at 375px and at 1280px', async () => {
  for (const width of [375, 1280]) {
    const { ctx, page } = await open({ width, height: 900 });
    const small = await page.evaluate(() => [...document.querySelectorAll('.cell')].map((s) => s.getBoundingClientRect()).filter((r) => r.width < 43.5 || r.height < 43.5).length);
    assert.equal(small, 0, `${small} studs are under 44px at ${width}px`);
    await ctx.close();
  }
});

test('a new brick drops in with the brick-drop animation, and under reduced motion it is simply there', async () => {
  const a = await open();
  await a.page.locator('.cell').first().click();
  const name = await a.page.locator('.brick').first().evaluate((el) => getComputedStyle(el).animationName);
  assert.equal(name, 'brick-drop', 'the placement animation does not win the cascade on the brick');
  await a.ctx.close();

  const b = await open({ reduced: true });
  await b.page.locator('.cell').first().click();
  const still = await b.page.locator('.brick').first().evaluate((el) => getComputedStyle(el).animationName);
  assert.equal(still, 'none', 'a brick still animates under prefers-reduced-motion');
  await b.ctx.close();
});

test('stacking stops at three, and says so', async () => {
  const { ctx, page } = await open();
  const stud = page.locator('.cell').nth(5);
  for (let i = 0; i < 4; i += 1) await stud.click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.brick').count(), 3);
  assert.match(await live(page), /already 3 bricks high/);
  await ctx.close();
});

test('the keyboard builds: arrows move, 2 picks blue, Space places, Delete removes, Escape returns to the page', async () => {
  const { ctx, page } = await open();
  await page.locator('.cell[tabindex="0"]').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => `${document.activeElement.dataset.row}:${document.activeElement.dataset.col}`), '1:1');
  await page.keyboard.press('2');
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.brick--blue').count(), 1, 'Space did not place exactly one blue brick');
  assert.equal(await page.locator('.brick').count(), 1);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.brick').count(), 0);
  assert.match(await live(page), /Blue brick removed from column 2, row 2/);
  // Roving tabindex: exactly one stud is in the tab order.
  assert.equal(await page.locator('.cell[tabindex="0"]').count(), 1);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'hero-start');
  await ctx.close();
});

test('dragging along a row lays a row of bricks; a vertical move lays none', async () => {
  const { ctx, page } = await open();
  const box = async (r, c) => page.locator(`.cell[data-row="${r}"][data-col="${c}"]`).boundingBox();
  const a = await box(2, 1);
  const d = await box(2, 4);
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.brick').count(), 4, 'a drag across four studs should lay four bricks');
  const rows = await page.evaluate(() => [...document.querySelectorAll('.cell[data-height="1"]')].map((s) => s.dataset.row));
  assert.deepEqual([...new Set(rows)], ['2']);
  await ctx.close();
});

test('the bridge writes a sentence into the composer, never submits, and the visitor can edit it', async () => {
  const { ctx, page } = await open();
  await page.locator('.cell').nth(3).click();
  await page.locator('.cell').nth(3).click();
  await page.locator('[data-bridge]').click();
  const value = await page.locator('#hero-start').inputValue();
  assert.equal(value, 'A tower, 2 bricks high, in red.');
  assert.equal(new URL(page.url()).pathname, '/', 'the bridge navigated away: it must never submit');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'hero-start');
  await page.locator('#hero-start').press('End');
  await page.keyboard.type(' With a door.');
  assert.match(await page.locator('#hero-start').inputValue(), /With a door\.$/);
  await ctx.close();
});

test('Clear baseplate empties it, and a reload within the tab keeps the layout (sessionStorage only)', async () => {
  const { ctx, page } = await open();
  await page.locator('.cell').nth(7).click();
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-grid] .cell');
  assert.equal(await page.locator('.brick').count(), 1, 'the layout was not kept for this tab');
  assert.equal(await page.evaluate(() => localStorage.getItem('apple.baseplate.v1')), null, 'the toy wrote to localStorage');
  await page.locator('[data-clear]').click();
  assert.equal(await page.locator('.brick').count(), 0);
  assert.equal(await page.locator('[data-bridge]').isVisible(), false);
  await ctx.close();
});

test('the example buttons fill the field and move focus there, and nothing types by itself', async () => {
  const { ctx, page } = await open();
  assert.equal(await page.locator('#hero-start').inputValue(), '');
  await page.waitForTimeout(1500);
  assert.equal(await page.locator('#hero-start').inputValue(), '', 'the field changed with nobody touching it');
  const first = page.locator('[data-example]').first();
  const text = await first.getAttribute('data-example');
  await first.click();
  assert.equal(await page.locator('#hero-start').inputValue(), text);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'hero-start');
  assert.equal(new URL(page.url()).pathname, '/');
  await ctx.close();
});

test('the Snap: the logo stud lifts when focus first enters the composer, and seats on submit', async () => {
  const { ctx, page } = await open();
  const state = () => page.locator('#site-nav .apple-mark').first().getAttribute('data-state');
  assert.equal(await state(), 'seated');
  await page.locator('#hero-start').focus();
  assert.equal(await state(), 'lifted');
  await page.evaluate(() => document.querySelector('form.composer').addEventListener('submit', (e) => e.preventDefault(), { capture: true }));
  await page.locator('#hero-start').fill('a tower');
  await page.locator('.composer-send').click();
  assert.equal(await state(), 'seated');
  await ctx.close();
});

test('the Rail: five stops on a wide screen, each naming a real section; a progress bar and no Rail on a phone', async () => {
  const wide = await open({ width: 1280 });
  const stops = await wide.page.evaluate(() => [...document.querySelectorAll('.rail a')].map((a) => ({ href: a.getAttribute('href'), exists: !!document.getElementById(a.getAttribute('href').slice(1)), visible: a.getBoundingClientRect().width > 0 })));
  assert.equal(stops.length, 5);
  assert.ok(stops.every((s) => s.exists && s.visible), JSON.stringify(stops));
  assert.equal(await wide.page.locator('nav[aria-label="On this page"]').count(), 1);
  await wide.page.evaluate(() => document.getElementById('capabilities').scrollIntoView());
  await wide.page.waitForTimeout(500);
  const passed = await wide.page.locator('.rail-node.is-passed').count();
  assert.ok(passed >= 3, `only ${passed} nodes are marked passed at the third section`);
  assert.equal(await wide.page.locator('.rail-node[aria-current="location"]').count(), 1);
  assert.equal(await wide.page.locator('.nav__progress').isVisible(), false, 'the phone progress bar shows beside the Rail');
  await wide.ctx.close();

  const phone = await open({ width: 375, height: 800 });
  assert.equal(await phone.page.locator('.rail').isVisible(), false);
  await phone.page.evaluate(() => window.scrollTo(0, 1200));
  await phone.page.waitForTimeout(300);
  assert.equal(await phone.page.locator('.nav__progress').isVisible(), true);
  const read = await phone.page.evaluate(() => Number(document.documentElement.style.getPropertyValue('--read')));
  assert.ok(read > 0 && read < 1, `--read is ${read} part-way down the page`);
  await phone.ctx.close();
});

test('the loop illustration lights its four steps once as it is reached, and is lit with reduced motion', async () => {
  const a = await open();
  assert.equal(await a.page.locator('.cycle-step.is-lit').count(), 0, 'steps are lit before anyone has scrolled to them');
  await a.page.evaluate(() => document.getElementById('inside').scrollIntoView());
  await a.page.waitForTimeout(3200);
  assert.equal(await a.page.locator('.cycle-step.is-lit').count(), 4);
  assert.match(await a.page.locator('.cycle-label .tag').textContent(), /Illustration/);
  await a.ctx.close();

  const b = await open({ reduced: true });
  assert.equal(await b.page.locator('.cycle-step.is-lit').count(), 4);
  await b.ctx.close();
});

test('no horizontal scroll at 320px, 375px or 1280px, in either theme', async () => {
  for (const theme of ['dark', 'light']) {
    for (const width of [320, 375, 1280]) {
      const { ctx, page } = await open({ width, theme });
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(over <= 0, `${theme} ${width}px scrolls sideways by ${over}px`);
      await ctx.close();
    }
  }
});

test('the theme toggle swaps the theme and the address-bar colour together', async () => {
  const { ctx, page } = await open({ theme: 'dark' });
  const band = () => page.evaluate(() => document.getElementById('theme-color').getAttribute('content'));
  assert.equal(await band(), '#0a0c10');
  await page.locator('#site-nav [data-theme-toggle]').click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
  assert.equal(await band(), '#f7f8fa');
  await ctx.close();
});

test('the page ships no canvas and the toy puts nothing in the tab order but one stud', async () => {
  const { ctx, page } = await open();
  assert.equal(await page.locator('canvas').count(), 0);
  assert.equal(await page.locator('[data-grid] [tabindex="0"]').count(), 1);
  assert.equal(await page.locator('[data-grid]').getAttribute('role'), 'grid');
  await ctx.close();
});

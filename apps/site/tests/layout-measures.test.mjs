// FIX CYCLE 2 LAYOUT FINDINGS, HELD BY WHAT A BROWSER DRAWS (findings 18 to 22; finding 17, the clipped focus ring, is in pages-render-clean).
//
//   18  /pricing on a phone: the plans of the comparison table are read in order (Free, Pro, Max, one under the other at 390 px and below, never two beside a
//       third on its own line), the "Get it" row has no hairline of its own in the stack, and its buttons are one size;
//   19  /docs: each page's one-line summary is its own line under the title, not run on from it;
//   20  /status: the orb is centred on the headline it labels, not on the whole text box (at 390 and 1440 px);
//   21  the docs column: the title, the section rules and the "Stuck?" rule under the page end where the prose ends (one measure);
//   22  /pricing at desk width: the Free card's stats panel is centred against the copy beside it, so the card does not end in a block of empty space.
//
// Each measure is run first on a page built to show the defect, then on the built site (a measure that cannot see the defect reports a clean page).
import test from 'node:test';
import assert from 'node:assert/strict';
import { withBrowser } from './lib/browser.mjs';

const open = async (browser, base, route, width, height = 900) => {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(base + route, { waitUntil: 'load' });
  return { page, context };
};

/** Serialised into the page: the comparison table's rows, each as the tops and lefts of its plan cells, the footer's cell borders and its buttons' heights. */
function compareRows() {
  const rows = [];
  for (const tr of document.querySelectorAll('.compare tr')) {
    const cells = [...tr.querySelectorAll('td[data-label]')];
    if (cells.length < 2) continue;
    rows.push({
      label: tr.querySelector('th')?.textContent?.trim().slice(0, 30) ?? '',
      foot: !!tr.closest('tfoot'),
      cells: cells.map((c) => {
        const r = c.getBoundingClientRect();
        return { plan: c.getAttribute('data-label'), top: Math.round(r.top), left: Math.round(r.left), borderTop: getComputedStyle(c).borderTopWidth, btn: c.querySelector('.btn') ? Math.round(c.querySelector('.btn').getBoundingClientRect().height) : null };
      }),
    });
  }
  return rows;
}

/**
 * The problems in a table's rows on a phone: in a STACK (480 px and under) plans side by side, a plan out of order, a cell with its own rule or buttons of
 * different heights; in a ROW (481 to 640 px, three narrow columns) a plan that is not on the same line as the others or is out of order, and the same two
 * footer problems.
 */
function phoneProblems(rows, mode = 'stack') {
  const out = [];
  for (const row of rows) {
    const plans = row.cells.map((c) => c.plan).join('/');
    for (let i = 1; i < row.cells.length; i += 1) {
      if (mode === 'stack' && row.cells[i].top <= row.cells[i - 1].top) out.push(`${row.label}: ${row.cells[i].plan} is not under ${row.cells[i - 1].plan} (${plans})`);
      if (mode === 'row' && (Math.abs(row.cells[i].top - row.cells[0].top) > 1 || row.cells[i].left <= row.cells[i - 1].left)) out.push(`${row.label}: ${row.cells[i].plan} is not beside ${row.cells[i - 1].plan} on one line (${plans})`);
    }
    if (mode === 'stack' && new Set(row.cells.map((c) => c.left)).size > 1) out.push(`${row.label}: the plans do not share a left edge`);
    if (row.foot) {
      if (row.cells.some((c) => c.borderTop !== '0px')) out.push(`${row.label}: a plan's cell carries its own hairline`);
      const heights = row.cells.map((c) => c.btn).filter(Boolean);
      if (new Set(heights).size > 1) out.push(`${row.label}: the buttons are ${heights.join(' and ')}px tall`);
    }
  }
  return out;
}

test('the phone-table measure can see: three plans in two columns (the third alone on a line), a cell with its own hairline and buttons of two heights; and the clean stack passes', async () => {
  await withBrowser(async (browser, base) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const page = await context.newPage();
    await page.setContent(`<style>
      table{width:100%} tr{display:grid;grid-template-columns:repeat(2,1fr)} td,th{display:block;padding:0}
      tfoot td{border-top:1px solid #888} .btn{display:block;height:36px}
    </style><table class="compare"><tbody><tr><th>Credits a day</th><td data-label="Free">5</td><td data-label="Pro">x</td><td data-label="Max">y</td></tr></tbody>
    <tfoot><tr><th>Get it</th><td data-label="Free"><a class="btn">a</a></td><td data-label="Pro"><a class="btn" style="height:53px">b</a></td><td data-label="Max"><a class="btn">c</a></td></tr></tfoot></table>`);
    const bad = phoneProblems(await page.evaluate(compareRows));
    assert.ok(bad.some((p) => /Max is not under Pro/.test(p)), `the orphaned third plan was not seen: ${bad.join(' | ')}`);
    assert.ok(bad.some((p) => /hairline/.test(p)), 'a cell with its own hairline was not seen');
    assert.ok(bad.some((p) => /36 and 53 and 36px/.test(p)), 'buttons of two heights were not seen');
    await page.setContent(`<style>
      table{width:100%} tr{display:grid;grid-template-columns:1fr} td,th{display:block;padding:0;border:0} .btn{display:block;height:52px}
    </style><table class="compare"><tbody><tr><th>Credits a day</th><td data-label="Free">5</td><td data-label="Pro">x</td><td data-label="Max">y</td></tr></tbody>
    <tfoot><tr><th>Get it</th><td data-label="Free"><a class="btn">a</a></td><td data-label="Pro"><a class="btn">b</a></td><td data-label="Max"><a class="btn">c</a></td></tr></tfoot></table>`);
    assert.deepEqual(phoneProblems(await page.evaluate(compareRows)), []);
    await context.close();
  });
});

test('/pricing on a phone: at 480 px and under every row of the comparison reads Free, Pro, Max one under the other, at 481 to 640 px the three plans share a line; the "Get it" row has no hairlines of its own and one button size at every width', async () => {
  const bad = [];
  let rows = 0;
  await withBrowser(async (browser, base) => {
    for (const [width, mode] of [[390, 'stack'], [320, 'stack'], [480, 'stack'], [520, 'row'], [600, 'row']]) {
      const { page, context } = await open(browser, base, '/pricing/', width, 844);
      const measured = await page.evaluate(compareRows);
      rows += measured.length;
      for (const p of phoneProblems(measured, mode)) bad.push(`${width}px: ${p}`);
      await context.close();
    }
  });
  assert.ok(rows >= 5 * 10, `only ${rows} rows of the table were measured`);
  assert.deepEqual(bad, []);
});

test('/docs: the summary of every page is its own line under the page\'s title, not run on after it', async () => {
  await withBrowser(async (browser, base) => {
    for (const width of [1440, 390]) {
      const { page, context } = await open(browser, base, '/docs/', width);
      const items = await page.evaluate(() => [...document.querySelectorAll('[data-docs-index] > li')].map((li) => {
        const a = li.querySelector('a').getBoundingClientRect();
        const summary = li.querySelector('.docs-index__summary');
        return { title: li.querySelector('a').textContent, hasSummary: !!summary, below: summary ? summary.getBoundingClientRect().top >= a.bottom - 1 : null, runOn: !summary && li.textContent.trim().length > li.querySelector('a').textContent.trim().length };
      }));
      assert.ok(items.length >= 6, `only ${items.length} pages are listed on /docs at ${width}px`);
      for (const i of items) {
        assert.equal(i.runOn, false, `${width}px: "${i.title}" has text after it that is not in its own element (it runs on from the title)`);
        if (i.hasSummary) assert.equal(i.below, true, `${width}px: the summary of "${i.title}" is not on its own line under the title`);
      }
      assert.ok(items.filter((i) => i.hasSummary).length >= 6, `${width}px: too few pages have a summary on their own line`);
      await context.close();
    }
  });
});

/** Serialised into the page: where the status orb and the headline sit. */
function statusBox() {
  const orb = document.getElementById('status-orb').getBoundingClientRect();
  const head = document.getElementById('status-headline').getBoundingClientRect();
  return { orbCentre: orb.top + orb.height / 2, headCentre: head.top + head.height / 2, headHeight: head.height };
}

test('/status: the orb is centred on the headline it labels (within 2px) at 390 and 1440 px, whatever the height reserved for the text under it', async () => {
  await withBrowser(async (browser, base) => {
    for (const width of [390, 1440]) {
      const { page, context } = await open(browser, base, '/status/', width, 844);
      const m = await page.evaluate(statusBox);
      assert.ok(m.headHeight > 10, `${width}px: the headline was not measured`);
      assert.ok(Math.abs(m.orbCentre - m.headCentre) <= 2, `${width}px: the orb is ${Math.round(m.orbCentre - m.headCentre)}px from the centre of its headline`);
      await context.close();
    }
    // The measure can see: move the orb down as the centred row did.
    const { page, context } = await open(browser, base, '/status/', 390, 844);
    await page.addStyleTag({ content: '.status-row{align-items:center!important}.status-orb{margin-top:0!important}' });
    const m = await page.evaluate(statusBox);
    assert.ok(Math.abs(m.orbCentre - m.headCentre) > 2, 'an orb centred on the whole text box passed: the measure is blind');
    await context.close();
  });
});

/** Serialised into the page: the docs column's prose, title, footer rule and section rules, as left and right edges. */
function docsColumn() {
  const r = (el) => { const b = el.getBoundingClientRect(); return { left: Math.round(b.left * 10) / 10, right: Math.round(b.right * 10) / 10 }; };
  const prose = document.querySelector('.docs__main .prose');
  return { prose: prose ? r(prose) : null, h1: r(document.querySelector('.docs__main h1')), foot: r(document.querySelector('.docs__foot')) };
}

test('the docs column has one measure: the title box and the "Stuck?" rule end where the prose ends (within 1px) on every docs page at 1440 px', async () => {
  await withBrowser(async (browser, base) => {
    const { page, context } = await open(browser, base, '/docs/', 1440);
    const routes = await page.evaluate(() => [...document.querySelectorAll('[data-docs-index] a')].map((a) => a.getAttribute('href')));
    await context.close();
    assert.ok(routes.length >= 6, `only ${routes.length} docs pages were found`);
    for (const route of ['/docs/', ...routes]) {
      const { page: p, context: c } = await open(browser, base, route, 1440);
      const m = await p.evaluate(docsColumn);
      assert.ok(m.prose, `${route}: no .prose column`);
      assert.ok(Math.abs(m.foot.right - m.prose.right) <= 1, `${route}: the footer rule ends at ${m.foot.right}, the prose at ${m.prose.right}`);
      assert.ok(Math.abs(m.h1.right - m.prose.right) <= 1, `${route}: the title box ends at ${m.h1.right}, the prose at ${m.prose.right}`);
      await c.close();
    }
  });
});

test('/pricing at 1440 px: the Free card\'s stats panel is centred against the copy beside it (within 2px), so no block of empty card sits under it', async () => {
  await withBrowser(async (browser, base) => {
    for (const width of [1440, 1100]) {
      const { page, context } = await open(browser, base, '/pricing/', width);
      const m = await page.evaluate(() => {
        const card = document.querySelector('.now').getBoundingClientRect();
        const stats = document.querySelector('.now__stats').getBoundingClientRect();
        const copy = document.querySelector('.now__copy').getBoundingClientRect();
        return { above: stats.top - copy.top, below: copy.bottom - stats.bottom, cardBelow: card.bottom - stats.bottom, copyHeight: copy.height, statsHeight: stats.height };
      });
      assert.ok(m.copyHeight > m.statsHeight, `${width}px: the copy is not taller than the panel any more: this measure no longer applies`);
      assert.ok(Math.abs(m.above - m.below) <= 2, `${width}px: the panel sits ${Math.round(m.above)}px below the top of the copy and ${Math.round(m.below)}px above its end`);
      await context.close();
    }
  });
});

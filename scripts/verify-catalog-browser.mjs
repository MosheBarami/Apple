/**
 * Browser regression for the actual dev SPA. Call verifyCatalogBrowser(existingBrowser)
 * from the connected Playwright browser; no browser process is launched here.
 * Uses a fresh, temporary context, mocked catalogue rows and an explicitly synthetic image.
 * All external traffic and all API writes are blocked. This is not production or Studio proof.
 */
import assert from 'node:assert/strict';

const ORIGIN = 'http://127.0.0.1:5197';
const IMAGE = 'https://tr.rbxcdn.com/apple-test-fixture/150/150/Image/Png';
const BROKEN = 'https://tr.rbxcdn.com/apple-test-unavailable/150/150/Image/Png';
const FIXTURE_IMAGE = '<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150"><rect width="150" height="150" fill="#dedede"/><text x="75" y="80" font-size="16" text-anchor="middle">Test fixture</text></svg>';
const row = {
  id: 'test:stone', name: 'Stone', kind: 'prop', source: 'creator_store',
  licence: 'Test fixture licence', attributionRequired: false, author: 'Fixture author',
  robloxAssetId: 123, availability: 'insertable',
};
const rows = [
  { ...row, triangles: 1200, boundsStuds: [4, 2, 3], tags: ['rock', 'low-poly'], preview: { state: 'ready', url: IMAGE } },
  { ...row, id: 'test:pending', name: 'Pending stone', preview: { state: 'pending', url: null } },
  { ...row, id: 'test:blocked', name: 'Blocked stone', preview: { state: 'blocked', url: null } },
  { ...row, id: 'test:import', name: 'Import stone', robloxAssetId: null, availability: 'needs_import', preview: { state: 'unavailable', url: null } },
  { ...row, id: 'test:broken', name: 'Long stone ' + 'LongName'.repeat(24), preview: { state: 'ready', url: BROKEN } },
];

export async function verifyCatalogBrowser(browser, { screenshots = false } = {}) {
  assert.ok(browser, 'An existing Playwright Browser is required; this helper never launches one.');
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const writes = [], queries = [], unexpected = [], pageErrors = [], checks = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  try {
    await page.route('**/*', async route => {
      const request = route.request();
      const requestUrl = request.url();
      if (request.url() === IMAGE) return route.fulfill({ status: 200, contentType: 'image/svg+xml', headers: { 'Access-Control-Allow-Origin': '*' }, body: FIXTURE_IMAGE });
      if (request.url() === BROKEN) return route.abort('failed');
      // The connected browser VM deliberately provides no Node URL/timer globals.
      // Admission here is an exact fixture-origin prefix, not production URL validation.
      if (!requestUrl.startsWith(ORIGIN + '/')) { unexpected.push(requestUrl.split('/').slice(0, 3).join('/')); return route.abort('blockedbyclient'); }
      const [path, query = ''] = requestUrl.slice(ORIGIN.length).split('?');
      const params = new Map(query.split('&').map(pair => {
        const i = pair.indexOf('=');
        return [decodeURIComponent(i < 0 ? pair : pair.slice(0, i)), decodeURIComponent(i < 0 ? '' : pair.slice(i + 1).replace(/\+/g, ' '))];
      }));
      if (!path.startsWith('/api/')) return route.continue();
      if (request.method() !== 'GET') { writes.push({ method: request.method(), path }); return route.abort('blockedbyclient'); }
      if (path.endsWith('/personalisation')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ preferences: {}, sources: {}, assetSourceCeiling: null, profile: { instructions: [] }, projectInstructions: [], teamInstructions: [], resolved: [] }) });
      if (path !== '/api/assets/search') return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Unconfigured fixture API"}' });
      queries.push({ term: params.get('query'), previews: params.get('previews'), filter: params.get('insertableOnly') });
      const term = params.get('query');
      if (term === 'failure') return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Fixture search unavailable"}' });
      const assets = term === 'none' ? [] : term === 'fresh' ? [{ ...rows[0], name: 'Fresh result' }] : rows;
      if (term === 'stale') await page.waitForTimeout(150);
      try { return await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ assets }) }); }
      catch (error) { if (term !== 'stale') throw error; /* explicitly aborted search */ }
    });
    await page.goto(ORIGIN + '/app/projects/p-lobby?mock=1');
    const draft = page.locator('#gx-composer-input');
    await draft.waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('.tour-card').waitFor({ state: 'visible', timeout: 5000 });
    const original = 'Preserve this draft exactly. שלום';
    await draft.fill(original);
    const open = async () => {
      await page.getByRole('button', { name: 'Assets', exact: true }).click();
      await page.getByRole('dialog', { name: 'Asset library' }).waitFor({ state: 'visible' });
      await page.waitForFunction(() => document.querySelector('#root')?.inert === true
        && !document.querySelector('.tour-card') && !!document.activeElement?.closest('.modal-overlay'), null, { timeout: 3000 });
    };
    const close = async () => {
      await page.keyboard.press('Escape');
      await page.getByRole('dialog', { name: 'Asset library' }).waitFor({ state: 'hidden' });
      await page.waitForFunction(() => !document.querySelector('#root')?.inert
        && document.activeElement?.textContent?.trim() === 'Assets', null, { timeout: 3000 });
    };
    const search = async term => {
      await page.getByRole('textbox', { name: 'Search assets', exact: true }).fill(term);
      await page.getByRole('button', { name: 'Search', exact: true }).click();
    };
    await open();
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => !!document.activeElement?.closest('.modal-overlay')), true, 'Tab escaped the modal');
    }
    checks.push('tour suspended without focus leakage; modal keyboard trap');
    await search('stone');
    await page.getByText('Showing 5 matches', { exact: false }).waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('.apple-catalog__preview img')].some(img => img.complete && img.naturalWidth > 0));
    await page.getByText('Preview could not load', { exact: true }).waitFor();
    const text = await page.getByRole('dialog', { name: 'Asset library' }).innerText();
    for (const required of ['Preview processing', 'Preview blocked by Roblox', 'No preview recorded', '1,200 triangles', '4 × 2 × 3 studs', 'safety checks still required', 'Needs import']) assert.ok(text.includes(required), required);
    assert.equal(await page.locator('.apple-catalog__preview img').first().getAttribute('referrerpolicy'), 'no-referrer');
    assert.equal(await page.locator('.apple-catalog__preview img').first().getAttribute('crossorigin'), 'anonymous');
    checks.push('ready/pending/blocked/missing/network-failed previews; bounded metadata; privacy attributes');
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
      const geometry = await page.getByRole('dialog', { name: 'Asset library' }).evaluate(el => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, viewport: innerWidth, overflow: el.scrollWidth - el.clientWidth };
      });
      assert.ok(geometry.left >= -1 && geometry.right <= width + 1 && geometry.overflow <= 1, JSON.stringify(geometry));
      if (screenshots) await page.screenshot({ path: `/Users/moshe/Desktop/RbxAI/docs/evidence/catalog-fixture-${width}-2026-09-18.png` });
    }
    checks.push('1440/390/320px layout, including long unbroken asset name');
    await close();
    assert.equal(await draft.inputValue(), original);
    await page.locator('.tour-card').waitFor({ state: 'visible', timeout: 3000 });
    checks.push('Escape restores Assets focus, inertness, existing draft and undiscarded tour');
    await open(); await search('stone');
    await page.getByText('Showing 5 matches', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Add reference to Stone', exact: true }).click();
    await page.getByRole('dialog', { name: 'Asset library' }).waitFor({ state: 'hidden' });
    const appended = await draft.inputValue();
    assert.ok(appended.startsWith(original + '\n\n'));
    assert.ok(appended.includes('"libraryId":"test:stone"'));
    checks.push('reference appended without replacing or sending the draft');
    const cap = Number(await draft.getAttribute('maxlength'));
    assert.ok(Number.isInteger(cap) && cap > 100 && cap <= 100000);
    const full = 'a'.repeat(cap);
    await draft.fill(full); await open(); await search('stone');
    await page.getByText('Showing 5 matches', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Add reference to Stone', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Your draft is too long' }).waitFor();
    assert.equal(await draft.inputValue(), full);
    checks.push('overflow refusal preserves the entire draft and dialog');
    await search('failure');
    await page.getByRole('alert').filter({ hasText: 'Fixture search unavailable' }).waitFor();
    await search('none');
    await page.getByText('No matches for', { exact: false }).waitFor();
    await search('stale');
    await page.getByRole('checkbox', { name: 'Only assets with a Roblox ID' }).check();
    await search('fresh');
    await page.getByText('Fresh result', { exact: true }).waitFor();
    await page.waitForTimeout(220); // longer than the intentionally delayed fixture response
    assert.equal(await page.locator('.apple-catalog__results li').count(), 1);
    assert.ok((await page.locator('.apple-catalog__status').innerText()).includes('fresh'));
    checks.push('server failure, empty search, cancelled stale search cannot overwrite newer results');
    await close();
    assert.equal(await draft.inputValue(), full);
    assert.ok(queries.length >= 6 && queries.every(q => q.previews === 'true'));
    assert.ok(queries.some(q => q.term === 'fresh' && q.filter === 'true'));
    assert.deepEqual(writes, [], 'Browsing/reference selection attempted an API mutation');
    assert.deepEqual(unexpected, [], 'Unexpected external origin');
    assert.deepEqual(pageErrors, [], 'Uncaught browser errors');
    return { checks, assertionsPassed: checks.length, queries, apiWrites: writes.length, uncaughtErrors: pageErrors,
      boundary: 'isolated mock SPA + synthetic image; not live backend/CDN, production or Studio verification' };
  } finally { await context.close(); }
}

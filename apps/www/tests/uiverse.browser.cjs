// Browser regressions for the Studio connection lifecycle and Uiverse controls.
// These use the development fixture; live deployment evidence is recorded separately.
const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const base = process.env.WWW_TEST_URL || 'http://127.0.0.1:3105';
const output = process.env.WWW_TEST_OUTPUT || '/tmp/studpilot-uiverse/connection';
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const results = [];
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const check = async (name, fn) => { try { await fn(); results.push({ name, pass: true }); console.log('PASS', name); } catch (e) { results.push({ name, pass: false, error: e.message }); console.log('FAIL', name, e.message); } };
  const prepare = async (mode = 'normal') => {
    await page.goto(base + '/dev/app?view=chat&studio=off');
    await expect(page.getByTestId('studio-light')).toBeVisible();
    await page.evaluate(mode => {
      const original = window.fetch.bind(window);
      let issued = 0;
      let cancellationFailed = false;
      const active = new Set();
      window.pairTrace = [];
      window.fetch = async (input, init) => {
        const url = String(input instanceof Request ? input.url : input);
        if (!url.includes('/pairing')) return original(input, init);
        const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
        if (url.endsWith('/cancel')) {
          const { code } = JSON.parse(init.body);
          window.pairTrace.push({ action: 'cancel', code });
          if (mode === 'cancel-fails' && !cancellationFailed) { cancellationFailed = true; return json({ error: 'unavailable' }, 503); }
          active.delete(code);
          return json({ ok: true, cancelled: true });
        }
        issued++;
        window.pairTrace.push({ action: 'mint', issued, active: active.size });
        if (mode === 'first-fails' && issued === 1) return json({ error: 'Connection service temporarily unavailable' }, 503);
        if (active.size >= 5) return json({ error: 'too many active codes' }, 429);
        await new Promise(resolve => setTimeout(resolve, 650));
        const code = 'AB' + String(issued).padStart(4, '0');
        active.add(code);
        return json({ code, expiresAtIso: new Date(Date.now() + (mode === 'expires' ? 1200 : 600000)).toISOString() });
      };
    }, mode);
    await page.getByTestId('studio-light').click();
    await expect(page.getByRole('dialog')).toBeVisible();
  };
  await check('Connection dialog opens immediately and reports pending code creation', async () => {
    await prepare();
    await expect(page.getByRole('dialog')).toContainText('Creating your connection code');
    await expect(page.getByTestId('studio-light')).toBeDisabled();
    await expect(page.getByTestId('pairing-code')).toHaveText('AB0001');
    await expect(page.getByTestId('studio-light')).toBeEnabled();
    await page.screenshot({ path: output + '/pairing-desktop.png' });
  });
  await check('Six replacements cancel the previous credential before minting and avoid the five-code cap', async () => {
    for (let n = 2; n <= 7; n++) {
      await page.getByRole('button', { name: 'Get a new code' }).click();
      await expect(page.getByTestId('pairing-code')).toHaveText('AB' + String(n).padStart(4, '0'));
    }
    const trace = await page.evaluate(() => window.pairTrace);
    expect(trace.filter(t => t.action === 'mint')).toHaveLength(7);
    expect(trace.filter(t => t.action === 'cancel')).toHaveLength(6);
    expect(trace.filter(t => t.action === 'mint').every(t => t.active === 0)).toBe(true);
  });
  await check('Copy code copies the displayed credential and closing cancels it', async () => {
    await page.getByRole('button', { name: 'Copy code' }).click();
    await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('AB0007');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.pairTrace.at(-1))).toEqual({ action: 'cancel', code: 'AB0007' });
  });
  await check('A failed code request is visible and retry obtains a usable code', async () => {
    await prepare('first-fails');
    await expect(page.getByRole('alert')).toContainText('Connection service temporarily unavailable');
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.getByTestId('pairing-code')).toHaveText('AB0002');
  });
  await check('Failed cancellation does not mint an extra credential and can be retried', async () => {
    await prepare('cancel-fails');
    await expect(page.getByTestId('pairing-code')).toHaveText('AB0001');
    await page.getByRole('button', { name: 'Get a new code' }).click();
    await expect(page.getByRole('alert')).toContainText('Could not replace');
    expect((await page.evaluate(() => window.pairTrace)).filter(t => t.action === 'mint')).toHaveLength(1);
    await page.getByRole('button', { name: 'Get a new code' }).click();
    await expect(page.getByTestId('pairing-code')).toHaveText('AB0002');
  });
  await check('Expired codes are hidden and the user can replace them', async () => {
    await prepare('expires');
    await expect(page.getByTestId('pairing-code')).toHaveText('AB0001');
    await expect(page.getByRole('dialog')).toContainText('This code has expired', { timeout: 5000 });
    await expect(page.getByTestId('pairing-code')).toHaveCount(0);
    await page.getByRole('button', { name: 'Get a new code' }).click();
    await expect(page.getByTestId('pairing-code')).toHaveText('AB0002');
  });
  await check('Connect from an empty workspace exposes creation failure and a real retry control', async () => {
    await page.goto(base + '/dev/app');
    await page.getByTestId('studio-light').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Not signed in');
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Not signed in');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('studio-light')).toBeFocused();
  });
  await check('Uiverse sun/moon switch changes the actual theme and keyboard focus is retained', async () => {
    await page.goto(base + '/dev/app');
    const toggle = page.locator('[data-uiverse="alexruix/splendid-liger-23"]');
    await expect(toggle).toBeVisible();
    const before = await toggle.getAttribute('aria-pressed');
    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
    expect(await page.locator('html').getAttribute('class')).toContain(before === 'true' ? 'light' : 'dark');
    await expect(toggle).toBeFocused();
  });
  await check('Uiverse primary control animates and reduced motion disables its animation', async () => {
    await page.goto(base + '/');
    const normal = await page.locator('.nav-primary').evaluate(e => getComputedStyle(e).animationName);
    expect(normal).toBe('uv-gradient');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await page.locator('.nav-primary').evaluate(e => getComputedStyle(e).animationName)).toBe('none');
    await page.getByRole('button', { name: 'Try a demo', exact: false }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });
  await check('Studio connection dialog fits a phone and is fully operable from the keyboard', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepare();
    await expect(page.getByTestId('pairing-code')).toHaveText('AB0001');
    const bounds = await page.getByRole('dialog').boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: output + '/pairing-mobile.png' });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
  await check('No browser exceptions in the connection lifecycle', async () => expect(errors).toEqual([]));
  fs.writeFileSync(output + '/results.json', JSON.stringify(results, null, 2));
  console.log(results.filter(r => r.pass).length + '/' + results.length + ' passed');
  await browser.close();
  if (results.some(r => !r.pass)) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });

import { chromium } from '/Users/moshe/Developer/RbxAI-web-v4/node_modules/@playwright/test/index.mjs';
const SCR = '/Users/moshe/Developer/RbxAI/docs/handoff/2026-10-04/work/shots';
const [,, tag='base', theme='dark', ...paths] = process.argv;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', colorScheme: theme });
await ctx.addInitScript((t) => { try { localStorage.setItem('apple.prefs.v1', JSON.stringify({appearance: t})); localStorage.setItem('apple-theme', t); localStorage.setItem('apple.tour.v1', JSON.stringify({seen:[],dismissed:true})); } catch {} }, theme);
const page = await ctx.newPage();
page.on('console', m => { if (m.type()==='error') console.log('console.error', m.text().slice(0,200)); });
page.on('pageerror', e => console.log('pageerror', e.message.slice(0,200)));
for (const p of paths) {
  const [name, url] = p.split('=');
  await page.goto('http://localhost:5199/app' + url + (url.includes('?') ? '&' : '?') + 'mock=1', { waitUntil: 'networkidle' }).catch(()=>{});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SCR}/${tag}-${theme}-${name}.png` });
  console.log('shot', name);
}
await browser.close();

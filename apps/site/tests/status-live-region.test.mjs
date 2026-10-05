// THE STATUS PAGE DOES NOT SPEAK EVERY SECOND (M2 site fix cycle 1).
//
// #status-card was `aria-live="polite"` and held #status-next, whose text is rewritten every second by the countdown ("in 29s", "in 28s", ...), and
// the card text that is rewritten by every 30-second poll. A polite region announces each change inside it, so a screen reader spoke continuously on
// the one page a person opens when they think the product is down. The fix: no live region on the card, and one visually hidden status element that is
// rewritten only when the STATE changes. Read off the built page and its script; the measurement of layout shift is in tests/e2e/landing.spec.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE, distPage, regionsWith } from './lib/dist.mjs';

const page = () => distPage('/status/').html;

test('no element on /status that holds a per-second or per-poll text is inside a live region', () => {
  const html = page();
  const live = regionsWith(html, 'aria-live');
  const roles = regionsWith(html, 'role="status"');
  for (const r of [...live, ...roles]) {
    for (const id of ['status-next', 'status-checked', 'status-version', 'status-sub', 'status-headline']) {
      assert.ok(!r.inner.includes(`id="${id}"`), `#${id} is inside a live region, so every rewrite of it is announced`);
    }
  }
  // The announcer is the only live region the page owns besides the layout's own, and it ships empty.
  const announcer = html.match(/<p\b[^>]*\bid="status-announce"[^>]*\brole="status"[^>]*>([\s\S]*?)<\/p>/);
  assert.ok(announcer, 'the status page has no #status-announce');
  assert.equal(announcer[1].trim(), '', 'the announcer ships with text: it would be read on load');
});

test('the countdown and the poll never write to the announcer; only a change of state does', () => {
  // The built script is minified and its names are rewritten, so the logic is read from the page's own source.
  const src = readFileSync(join(SITE, 'src', 'pages', 'status.astro'), 'utf8');
  const script = src.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
  assert.match(script, /function startCountdown/, 'the status script no longer has its countdown: re-read this guard');
  const code = script.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const writes = [...code.matchAll(/announce\.textContent\s*=/g)];
  assert.equal(writes.length, 1, `the announcer is written in ${writes.length} places`);
  const countdown = code.slice(code.indexOf('function startCountdown'), code.indexOf('async function check'));
  assert.ok(countdown.length > 50 && !/announce/.test(countdown), 'the countdown touches the announcer');
  assert.match(code, /state !== 'checking' && head !== announced/, 'the announcement is no longer limited to a change of state');
  // And the built page still ships the script that does it (a page whose script was dropped announces nothing, which is a different failure).
  assert.match(page(), /status-announce/, 'the built page has no announcer');
});

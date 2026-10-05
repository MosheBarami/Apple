// THE STATUS PAGE DOES NOT SPEAK EVERY SECOND (M2 site fix cycle 1).
//
// #status-card was `aria-live="polite"` and held #status-next, whose text is rewritten every second by the countdown ("in 29s", "in 28s", ...), and
// the card text that is rewritten by every 30-second poll. A polite region announces each change inside it, so a screen reader spoke continuously on
// the one page a person opens when they think the product is down. The fix: no live region on the card, and one visually hidden status element that is
// rewritten only when the STATE changes. Read off the built page and its script; the measurement of layout shift is in tests/e2e/landing.spec.ts.
//
// FIX CYCLE 2 (finding 14): THE SCAN KNEW TWO WAYS TO BE A LIVE REGION. It collected `aria-live` and `role="status"`, so `role="alert"` (an assertive region, announced
// at once and interrupting) or `role="log"` around the countdown passed (measured: role="alert" added to #status-card left every test green), and the announcer test counted only
// `announce.textContent =`, so a write through `announce.append`, `innerHTML` or `replaceChildren` in the countdown was not seen. It now treats every live-region role (alert,
// log, status, marquee, timer) and any `aria-live` that is not "off" as live, and counts every form of write to the announcer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE, attrsOf, distPage, regionsWith } from './lib/dist.mjs';

/** The roles that make an element a live region (marquee and timer are implicitly "off" but a page can switch them on, so they are not allowed to hold the countdown either). */
const LIVE_ROLES = ['alert', 'log', 'status', 'marquee', 'timer'];

/** Every live region of a document: an `aria-live` that is not "off", or an element whose role is a live-region role. { tag, inner }. */
function liveRegions(html) {
  const found = new Map();
  for (const r of regionsWith(html, 'aria-live')) {
    if ((attrsOf(r.tag)['aria-live'] ?? '').toLowerCase() !== 'off') found.set(r.tag + r.inner, r);
  }
  for (const role of LIVE_ROLES) {
    for (const r of regionsWith(html, `role="${role}"`)) found.set(r.tag + r.inner, r);
    // role="status alert", role='log'
    for (const r of regionsWith(html, `role='${role}'`)) found.set(r.tag + r.inner, r);
  }
  for (const r of regionsWith(html, 'role')) {
    const tokens = (attrsOf(r.tag).role ?? '').toLowerCase().split(/\s+/);
    if (tokens.some((t) => LIVE_ROLES.includes(t))) found.set(r.tag + r.inner, r);
  }
  return [...found.values()];
}

/** Every way of writing text into an element held in `name`: textContent, innerText, innerHTML, outerHTML, nodeValue, data, and the DOM methods that add or replace children. */
const writesTo = (name) => new RegExp(`\\b${name}\\b\\s*(?:\\.\\s*(?:textContent|innerText|innerHTML|outerHTML|nodeValue|data)\\s*(?:\\+?=)(?!=)|\\.\\s*(?:append|appendChild|prepend|replaceChildren|replaceWith|insertAdjacentHTML|insertAdjacentText|insertBefore|before|after)\\s*\\()`, 'g');

const page = () => distPage('/status/').html;

test('no element on /status that holds a per-second or per-poll text is inside a live region', () => {
  const html = page();
  const regions = liveRegions(html);
  assert.ok(regions.length >= 1, 'no live region was found on /status, not even the announcer: the scan is blind');
  for (const r of regions) {
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
  const writes = [...code.matchAll(writesTo('announce'))];
  assert.equal(writes.length, 1, `the announcer is written in ${writes.length} places (${writes.map((w) => w[0]).join(' | ')})`);
  assert.match(writes[0][0], /textContent/, 'the one write to the announcer is not a textContent assignment');
  // The element is also reachable without the `announce` name: by id, or from the card.
  const direct = [...code.matchAll(/status-announce['"]\s*\)\s*\??\.\s*(?:textContent|innerText|innerHTML|append|appendChild|prepend|replaceChildren)\b/g)];
  assert.equal(direct.length, 0, 'the announcer is written by looking it up by id in place');
  const countdown = code.slice(code.indexOf('function startCountdown'), code.indexOf('async function check'));
  assert.ok(countdown.length > 50 && !/announce/.test(countdown), 'the countdown touches the announcer');
  assert.match(code, /state !== 'checking' && head !== announced/, 'the announcement is no longer limited to a change of state');
  // And the built page still ships the script that does it (a page whose script was dropped announces nothing, which is a different failure).
  assert.match(page(), /status-announce/, 'the built page has no announcer');
});

test('the live-region reader can see: aria-live, role status, alert, log, marquee and timer, a role among several, and not aria-live="off"; the write finder sees textContent, innerHTML, append and replaceChildren', () => {
  const holds = (attrs) => liveRegions(`<div ${attrs}><span id="status-next">in 29s</span></div>`).filter((r) => r.inner.includes('id="status-next"')).length;
  for (const attrs of ['aria-live="polite"', 'aria-live="assertive"', 'role="status"', 'role="alert"', 'role="log"', 'role="marquee"', 'role="timer"', 'role="status alert"', "role='alert'"]) {
    assert.ok(holds(attrs) >= 1, `${attrs} around the countdown was not seen as a live region`);
  }
  assert.equal(holds('aria-live="off"'), 0, 'aria-live="off" is read as live');
  assert.equal(holds('role="group"'), 0, 'an ordinary role is read as live');
  for (const w of ['announce.textContent = head;', 'announce.innerHTML = head;', 'announce.append(head);', 'announce.replaceChildren(head);', 'announce.innerText += head;', 'announce.insertAdjacentText("beforeend", head);']) {
    assert.equal([...w.matchAll(writesTo('announce'))].length, 1, `a write through "${w}" was not seen`);
  }
  assert.equal([...'if (announce) { return announced; }'.matchAll(writesTo('announce'))].length, 0, 'a read is seen as a write');
});

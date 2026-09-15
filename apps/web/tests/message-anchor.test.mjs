/**
 * A MESSAGE IS A PLACE, AND A PLACE YOU CANNOT LINK TO IS NOT ONE.
 *
 * Search could scroll you to a message, but the URL never moved: /projects/:id before the jump
 * and /projects/:id after it. So the one thing anybody does with a found message — send it to
 * someone, or keep it — was impossible, and a reload put you back at the bottom of the thread.
 *
 * The anchor is the id the thread already renders on each turn, so the link points at an element
 * that exists rather than at a second, parallel naming scheme. Two rules make it work rather than
 * merely exist:
 *
 *   IT WAITS FOR HISTORY. The workspace pages backwards from the newest hundred, so at first
 *   paint the message a link names is usually not mounted yet. Jumping immediately would fire
 *   "that message is further back than the loaded history" at someone whose message is simply
 *   still arriving — a wrong explanation, which sends them looking for history that is not
 *   missing.
 *
 *   IT REPLACES. A jump is not a page you should have to press Back through, and search produces
 *   them in bursts.
 *
 * Run with:  node --test apps/web/tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../src');
const WS = readFileSync(join(SRC, 'routes', 'workspace.tsx'), 'utf8');

test('jumping to a message puts that message in the URL', () => {
  const fn = /const jumpToMessage = useCallback\(([\s\S]*?)\n  \);/.exec(WS);
  assert.ok(fn, 'jumpToMessage is gone — has the jump moved?');
  assert.match(fn[1], /navigate\(/, 'the jump must move the URL, or the message cannot be linked');
  assert.match(fn[1], /hash:\s*`#msg-\$\{messageId\}`/, 'the hash must name the message');
  assert.match(fn[1], /replace:\s*true/, 'a jump is not a page to press Back through');
});

test('the URL anchor and the element the thread renders are the same name', () => {
  // Two naming schemes for the same thing is the bug this asserts against: the link would look
  // right, resolve to nothing, and report the message as too far back.
  assert.match(WS, /id=\{`msg-\$\{item\.id\}`\}/, 'the thread must still render msg-<id> on each turn');
  assert.match(WS, /getElementById\(`msg-\$\{messageId\}`\)/, 'the jump must look for that same id');
});

test('a pasted link is honoured, but only once the history it names has arrived', () => {
  const hashEffect = /historyState !== 'ready'[\s\S]{0,700}?\}, \[/.exec(WS);
  assert.ok(hashEffect, 'nothing reads the hash after history loads — a pasted link does nothing');
  assert.match(hashEffect[0], /location\.hash/, 'the address bar is what a pasted link arrives in');
  assert.match(hashEffect[0], /jumpToMessage\(/, 'reading it and not acting on it is worse than not reading it');
});

test('the same anchor is not chased twice', () => {
  // jumpToMessage writes the hash, and the hash drives jumpToMessage. Without a guard that is a
  // loop, and with a smooth scroll it is a visible one.
  assert.match(WS, /anchored\s*=\s*useRef/, 'the consumed anchor has to be remembered somewhere');
  assert.match(WS, /anchored\.current = messageId/, 'a jump must record the anchor it just satisfied');
});

test('a link to a message that is not loaded says so without telling them to search', () => {
  // The search path says "load more and search again", which is right there and wrong for
  // somebody who followed a link and has no search open.
  const fn = /const jumpToMessage = useCallback\(([\s\S]*?)\n  \);/.exec(WS)[1];
  assert.match(fn, /origin/, 'the jump must know whether it came from search or from a link');
  assert.match(fn, /search again/, 'the search wording stays for the search path');
  assert.ok(
    /link[\s\S]{0,400}?further back|further back[\s\S]{0,400}?link/.test(fn),
    'the link path needs wording of its own',
  );
});

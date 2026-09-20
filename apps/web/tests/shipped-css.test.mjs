/**
 * The reader has to be able to see the three things that fooled it, or it is no better than the
 * regexes it replaces. Each case below is one a real check got wrong in this session.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { rulesFor, declares, valueOf } from './shipped-css.mjs';

const CSS = [
  '.a:after{content:"";opacity:0}',
  'button:focus-visible,a:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:4px}',
  '.gu-seg button:focus-visible{outline-offset:-2px}',
  '@media (prefers-reduced-motion:reduce){.a:after{animation:none}}',
  '.card{padding:20px}.card{padding:24px}',
].join('');

test('a minified :after is found when the source said ::after', () => {
  assert.equal(declares(CSS, '.a::after', 'opacity'), true);
});

test('an element in the MIDDLE of a selector list is found', () => {
  // The miss that reported a shipped global focus ring as absent.
  assert.equal(valueOf(CSS, 'a:focus-visible', 'outline'), '2px solid var(--accent)');
  assert.equal(valueOf(CSS, 'input:focus-visible', 'outline-offset'), '4px');
});

test('a more specific selector is NOT mistaken for the one asked about', () => {
  // `.gu-seg button:focus-visible` mentions the same element and must not answer for it.
  const only = rulesFor(CSS, 'button:focus-visible');
  assert.equal(only.length, 1);
  assert.match(only[0].body, /outline:2px/);
});

test('later rules win, as the cascade does', () => {
  assert.equal(valueOf(CSS, '.card', 'padding'), '24px');
});

test('a rule inside @media is read, not swallowed with its wrapper', () => {
  assert.equal(rulesFor(CSS, '.a:after').length, 2);
});

test('a selector that is genuinely absent still reports absent', () => {
  // The reader must not become a thing that answers yes to everything.
  assert.deepEqual(rulesFor(CSS, '.nothing-here'), []);
  assert.equal(declares(CSS, '.card', 'margin'), false);
});

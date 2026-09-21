/**
 * THE TOAST LANDED ON THE MESSAGE BOX, BECAUSE THE COMPOSER'S HEIGHT WAS A GUESS.
 *
 * components/toast.css lifts the toast stack clear of the composer. Its header says why, in as many
 * words: "a confirmation that blocks the thing you were typing into is worse than no confirmation."
 * The lift itself was a constant arrived at by ADDING UP the composer's parts inside that comment
 * — "12px of top padding + a 64px textarea + a 57px tool bar … ≈ 188px" — and the sum described a
 * box nobody had measured.
 *
 * MEASURED, in Chromium, on /app/projects/p_demo with a toast on screen (the numbers are the
 * composer's own `getBoundingClientRect().height` and the stack's `bottom`):
 *
 *   width   composer   old lift   result
 *   1440      198px      200px    clears by 2px
 *   1024      244px      200px    the toast covers the composer's top 43px
 *    768      244px      200px    the toast covers the composer's top 43px
 *    375      264px      204px    the toast covers the top 49px of an 85px textarea, and
 *                                 `document.elementFromPoint` at the field's first line returns
 *                                 `DIV.toast toast-success` — the confirmation, not the field
 *
 * On a phone the "Studio connected" toast sat on the message box: half the placeholder hidden, and
 * a thumb aimed at the first line of the field hitting the toast.
 *
 * THE FIX IS THE ONE THAT FILE NAMED AND LEFT FOR SOMEBODY ELSE: "the honest fix is a
 * `--composer-h` custom property published by ws/composer.css — a file this change does not own."
 * lib/composer-height.ts publishes it from a ResizeObserver on the panel, and every lift rule reads
 * it with its old constant as the fallback, so a first paint cannot be worse than it was.
 *
 * AFTER, same measurement: toast bottom 602/556/556/536 against composer top 615/569/569/548 — a
 * 12–13px gap at every width — and the 375px hit test returns TEXTAREA. The case the old comment
 * admitted it could not cover is covered too: forcing the textarea to 220px moved `--composer-h`
 * from 264px to 399px and the stack's bottom from 536 to 401, keeping the same gap.
 *
 * WHAT THIS FILE CAN AND CANNOT SEE. apps/web mounts nothing in `node --test`, so the geometry
 * above is evidence in this header, not an assertion below. What IS asserted is the pair that
 * produces it: the publisher writes a real measurement or nothing, and the stylesheet reads what
 * the publisher writes. Break either one and this goes red — which is the whole reason the
 * stylesheet half is here rather than trusted.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COMPOSER_HEIGHT_PROP,
  applyComposerHeight,
  composerHeightValue,
  observeComposerHeight,
} from '../src/lib/composer-height.ts';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(WEB, 'src', f), 'utf8');
/** Comments stripped: a rule described in prose is not a rule, and neither is a call. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** A style-carrying element, recording what was written and what was cleared. */
function target() {
  const t = {
    values: new Map(),
    style: {
      setProperty: (name, value) => t.values.set(name, value),
      removeProperty: (name) => {
        const had = t.values.get(name) ?? '';
        t.values.delete(name);
        return had;
      },
    },
  };
  return t;
}

test('a measured height is published in whole pixels, rounded UP', () => {
  assert.equal(composerHeightValue(264), '264px');
  // A fractional layout is ordinary. Rounding DOWN would leave the stack half a pixel inside the
  // composer, which is the defect in miniature.
  assert.equal(composerHeightValue(264.5), '265px');
  assert.equal(composerHeightValue(0.2), '1px');
});

test('AND A NON-MEASUREMENT PUBLISHES NOTHING, rather than publishing zero', () => {
  // `0` is what a display:none composer measures and `NaN` is what a detached one measures.
  // Writing `0px` for either would drop the stack onto the bottom edge of the screen — worse than
  // the constant this replaced. Clearing hands the CSS fallback back.
  for (const bad of [0, -12, NaN, Infinity, -Infinity]) {
    assert.equal(composerHeightValue(bad), null, `${bad} must not be published`);
  }
  const t = target();
  applyComposerHeight(t, 264);
  assert.equal(t.values.get(COMPOSER_HEIGHT_PROP), '264px');
  applyComposerHeight(t, 0);
  assert.equal(t.values.has(COMPOSER_HEIGHT_PROP), false, 'a zero measurement must CLEAR the property');
});

test('the first measurement does not wait for a resize', () => {
  // A stack that is only correct after the composer happens to change size is a stack that is
  // wrong on the screen the person actually arrives at.
  const t = target();
  const stop = observeComposerHeight({ getBoundingClientRect: () => ({ height: 198 }) }, t);
  assert.equal(t.values.get(COMPOSER_HEIGHT_PROP), '198px');
  stop();
});

test('and it tracks the panel afterwards — the case the old constant could not cover', () => {
  // The textarea grows to 220px as somebody types a long draft; toast.css said so and said it
  // could not follow it. Driven here with a fake observer, because the real one needs a layout.
  const t = target();
  let notify = null;
  const previous = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    constructor(cb) { notify = cb; }
    observe() { this.observing = true; }
    disconnect() { this.stopped = true; }
  };
  try {
    let height = 264;
    const stop = observeComposerHeight({ getBoundingClientRect: () => ({ height }) }, t);
    assert.equal(t.values.get(COMPOSER_HEIGHT_PROP), '264px');
    height = 399;
    notify();
    assert.equal(t.values.get(COMPOSER_HEIGHT_PROP), '399px', 'a grown composer must republish');
    // AND UNMOUNTING CLEARS IT. A composer that is gone is not 399px tall, and a stale value would
    // hold the stack off the bottom of a screen that has no composer on it at all.
    stop();
    assert.equal(t.values.has(COMPOSER_HEIGHT_PROP), false, 'teardown must clear the property');
  } finally {
    globalThis.ResizeObserver = previous;
  }
});

test('no element and no ResizeObserver are handled, not thrown from a render', () => {
  const t = target();
  assert.doesNotThrow(() => observeComposerHeight(null, t)());
  assert.equal(t.values.size, 0);
  const previous = globalThis.ResizeObserver;
  // eslint-disable-next-line no-undefined
  globalThis.ResizeObserver = undefined;
  try {
    const stop = observeComposerHeight({ getBoundingClientRect: () => ({ height: 198 }) }, t);
    // Published once and then simply not tracked — better than not published at all.
    assert.equal(t.values.get(COMPOSER_HEIGHT_PROP), '198px');
    stop();
    assert.equal(t.values.has(COMPOSER_HEIGHT_PROP), false);
  } finally {
    globalThis.ResizeObserver = previous;
  }
});

test('THE COMPOSER ACTUALLY PUBLISHES IT, from the panel and onto the root', () => {
  const composer = code(read('components/ws/composer.tsx'));
  assert.match(composer, /from '\.\.\/\.\.\/lib\/composer-height'/, 'the publisher must be imported');
  // The ref has to be on the OUTER composer panel — not on the inner form, which excludes the note
  // under it and would under-report by ~27px. The visual class list is deliberately free to change.
  const ref = /<div className=\{[^\n]*gx-composer[^\n]*\}\s+ref=\{(\w+)\}>/.exec(composer);
  assert.ok(ref, 'the outer composer panel must carry the measured ref');
  assert.match(
    composer,
    new RegExp(`observeComposerHeight\\(${ref[1]}\\.current, document\\.documentElement\\)`),
    'the height must be published on the ROOT — the toast stack is a portal and inherits nothing from the composer',
  );
  // Returned from the effect, so unmount tears the observer down and clears the value.
  assert.match(composer, /useEffect\(\(\) => observeComposerHeight\(/);
});

test('AND THE STYLESHEET READS IT — every lift, with its old constant kept as the fallback', () => {
  const css = code(readFileSync(join(WEB, 'src', 'components', 'toast.css'), 'utf8'));
  // Only the rules that fire BECAUSE THE COMPOSER is on screen. Two other groups set this property
  // and neither is a lift: the bare `body .toast-stack` inset is where the stack sits with nothing
  // to clear, and `body:has(.gx-drawer)` and friends are the overlays that TAKE the lift back —
  // see drawer-stacking.test.mjs. Selected by what the selector names rather than by what the
  // declaration says, so a lift that reverted to a constant is still in the set and still checked.
  const composerLifts = [...css.matchAll(/([^{}]+)\{[^{}]*inset-block-end:\s*([^;]+);/g)]
    .filter((m) => /:has\(\.(gx-composer|start-sheet)\)/.test(m[1]))
    .map((m) => m[2].trim());
  assert.equal(composerLifts.length, 3, `expected the three composer lifts, saw ${composerLifts.join(' | ')}`);
  for (const value of composerLifts) {
    assert.match(
      value,
      /calc\(var\(--composer-h,\s*\d+px\)\s*\+\s*12px\)/,
      `a lift of "${value}" is a constant again — that is the guess this file replaced`,
    );
  }
  // The fallbacks are the numbers that shipped. This change can improve the first paint; it must
  // not be allowed to make it worse by fetching a fallback out of the air.
  const fallbacks = composerLifts.map((v) => /var\(--composer-h,\s*(\d+)px\)/.exec(v)[1]).sort();
  assert.deepEqual(fallbacks, ['200', '204', '244'], 'the pre-measurement fallbacks must stay as they were');
  // And the property the CSS names must be the one the module writes — a rename on one side is
  // exactly the drift this repository keeps finding.
  assert.equal(COMPOSER_HEIGHT_PROP, '--composer-h');
});

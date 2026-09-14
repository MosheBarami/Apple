/**
 * AN IMAGE THAT DID NOT LOAD MUST SAY SO.
 *
 * Generated images are kept in KV for one hour (IMAGE_TTL_SECONDS). The panel that displays one
 * lives in the conversation for as long as the conversation does. So a user scrolling back to
 * yesterday's work is the NORMAL path through this branch, not an edge case — and without handling
 * they get the browser's broken-image glyph, which says nothing, reads as a bug in the product, and
 * gives no way to tell "this expired" from "this never worked".
 *
 * That is the same shape as every other finding on this branch: a failure rendering as something
 * other than a failure.
 *
 * WHAT THIS FILE CAN AND CANNOT PROVE, stated plainly rather than implied by a green tick.
 * apps/web has no DOM renderer — nothing in this package mounts a component — so the rendered
 * output of the failure branch is NOT executed here. Two things are:
 *
 *   1. The TTL and the copy agree. The component tells the user images are kept for an hour; that
 *      number is read out of the worker rather than repeated here, so changing IMAGE_TTL_SECONDS
 *      without changing the sentence fails.
 *   2. Every class the component names exists in the stylesheet. An unstyled failure state is a
 *      block of unpositioned text in the middle of an asset grid, and a renamed class in one file
 *      and not the other is the likeliest way this breaks.
 *
 * The presence of onError itself is a source assertion, and it is a weak one — a line can be
 * present and inert, which is a lesson this branch learned the hard way. It is here because the
 * alternative is asserting nothing at all about the handler, and it is labelled rather than
 * dressed up. Mounting this properly needs the DOM renderer apps/web still does not have.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const RENDER = readFileSync(join(WEB, 'src', 'lib', 'generative-ui', 'render.tsx'), 'utf8');
const STYLES = readFileSync(join(WEB, 'src', 'styles.css'), 'utf8');

const out = join(mkdtempSync(join(tmpdir(), 'ttl-')), 'ig.mjs');
execFileSync(join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'),
  [join(WEB, '..', 'worker', 'src', 'imagegen.ts'), '--bundle', '--format=esm', '--platform=neutral',
   '--main-fields=main,module', '--outfile=' + out], { stdio: 'pipe' });
const { IMAGE_TTL_SECONDS } = await import(`file://${out}`);

/** The SafeImage component body, sliced from its own declaration to the next one. */
function safeImageSource() {
  const start = RENDER.indexOf('function SafeImage(');
  assert.ok(start > 0, 'SafeImage no longer exists under that name');
  const next = RENDER.indexOf('\nfunction ', start + 1);
  return RENDER.slice(start, next > 0 ? next : undefined);
}

test('the parse is not vacuous — SafeImage was actually found', () => {
  const src = safeImageSource();
  assert.ok(src.length > 200, `sliced only ${src.length} chars`);
  assert.match(src, /<img/, 'and it is still the thing that renders an image');
});

test('the failure branch is wired to the image failing, not to anything else', () => {
  const src = safeImageSource();
  assert.match(src, /onError=/, 'a load failure must be observed');
  assert.match(src, /image\.alt/, 'and the alt text shown — it is the only thing still true');
});

test('THE COPY AND THE TTL AGREE, read from the worker rather than repeated', () => {
  // The sentence says "kept for an hour". If someone changes the TTL, this fails rather than
  // leaving the product telling users something that stopped being true.
  assert.equal(IMAGE_TTL_SECONDS, 3600, 'the TTL moved and the copy did not');
  const src = safeImageSource();
  assert.match(src, /kept for an hour/, 'the component must state the retention it actually gets');
});

test('every class the failure branch names is styled', () => {
  // An unstyled failure state is unpositioned text in the middle of an asset grid. A class renamed
  // in one file and not the other is the likeliest way this regresses, and it regresses silently.
  const src = safeImageSource();
  // Matched in both quote styles: the outer class sits in a template literal because it composes
  // with an optional passed-in className, and a regex that only saw double quotes would miss it
  // and quietly assert over two classes instead of three.
  const classes = [...src.matchAll(/(gu-img-gone(?:__[a-z]+)?)/g)].map((m) => m[1]);
  const named = [...new Set(classes)];
  assert.ok(named.length >= 3, `expected the failure-state classes, found ${named.join(', ')}`);
  for (const c of named) {
    assert.ok(STYLES.includes(`.${c}`), `${c} is rendered and never styled`);
  }
});

test('the failure state is announced to assistive tech as unavailable', () => {
  const src = safeImageSource();
  assert.match(src, /role="img"/, 'it stands in for an image');
  assert.match(src, /aria-label=\{`Unavailable/, 'and must say it is unavailable, not just repeat the alt');
});

test('the styles do not reach for a token that does not exist', () => {
  const block = STYLES.slice(STYLES.indexOf('.gu-img-gone'), STYLES.indexOf('.gu-img-gone') + 1200);
  for (const token of [...new Set([...block.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]))]) {
    assert.ok(STYLES.includes(`${token}:`), `${token} is used by the failure state and never defined`);
  }
});

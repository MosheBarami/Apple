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
const STYLES = readFileSync(join(WEB, 'src', 'design/system.css'), 'utf8');

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

test('missing-image copy does not claim every saved image expires with legacy previews', () => {
  assert.ok(IMAGE_TTL_SECONDS > 0, 'legacy previews still have a bounded lifetime');
  const src = safeImageSource();
  assert.match(src, /unavailable/);
  assert.match(src, /temporary previews may have expired/);
  assert.doesNotMatch(src, /generated images are kept for an hour|This image has expired/);
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

// --- the thing that made all of the above nearly worthless ----------------------------------

/**
 * A PLAIN <img src> CANNOT AUTHENTICATE, so the honest expiry message would have been a lie.
 *
 * /api/* requires a Bearer token; bearerToken() reads only the Authorization header and the
 * WebSocket subprotocol; an <img> tag sends neither. The tag would have got a 401, fired onError,
 * and rendered "No longer available — generated images are kept for an hour" for an image that
 * existed and was a second old. rbxai-1d's refuter found it against their route; I verified each
 * step here rather than take it on trust, and every one held.
 *
 * That is the seventh instance of this shape in this repo and the most uncomfortable, because the
 * fallback I wrote to be HONEST is precisely what would have hidden it: a confident, well-worded,
 * completely wrong explanation.
 */
const render = readFileSync(join(WEB, 'src', 'lib', 'generative-ui', 'render.tsx'), 'utf8');
const api = readFileSync(join(WEB, 'src', 'lib', 'api.ts'), 'utf8');

test('THE IMAGE IS FETCHED WITH A TOKEN, not handed to the browser as a bare src', () => {
  assert.match(api, /export async function fetchImageObjectUrl/, 'there must be an authed fetch');
  assert.match(api, /headers\.set\('Authorization', `Bearer \$\{token\}`\)/, 'carrying the bearer');
  assert.match(api, /URL\.createObjectURL/, 'and handing back something a tag can render');
  assert.match(render, /fetchImageObjectUrl\(/, 'and SafeImage must use it');
});

test('the object URL is revoked, or a scrolled conversation holds every image it ever showed', () => {
  assert.match(render, /URL\.revokeObjectURL/, 'the blob must be released');
  assert.match(render, /return \(\) => \{/, 'on unmount');
});

test('LOADING IS NOT EXPIRY — the third state', () => {
  // The first version had "shown" and "gone", so every image was briefly reported as gone while it
  // was still being fetched.
  assert.match(render, /'loading' \| 'ready' \| 'failed'/, 'three states, not two');
  assert.match(render, /state === 'loading'/, 'and loading renders its own thing');
  assert.match(render, /aria-busy="true"/, 'announced as busy rather than as a failure');
});

test('A 401 IS NOT REPORTED AS AN EXPIRED IMAGE', () => {
  // The image is fine; their session is not. Telling them it expired sends them looking for the
  // wrong problem. The taxonomy already draws that line, so this reads it rather than re-deriving.
  assert.match(render, /explainFailure\(failure\)/, 'the failure must be classified');
  assert.match(render, /e\.kind === 'missing'/, 'and only a genuine 404 gets the expiry sentence');
});

test('the status is preserved on the way out, so the caller can tell the cases apart', () => {
  const fn = api.slice(api.indexOf('export async function fetchImageObjectUrl'), api.indexOf('export function parseImagePath'));
  assert.match(fn, /res\.status === 404/, '404 is named');
  // NOT /new ApiError\([^)]*res\.status\)/. `[^)]*` stops at the first `)`, which arrives inside
  // `(${res.status})` in the message — the same hole as `[^>]*` across a JSX arrow, which is now
  // the third time today a negated class of mine has stopped at a delimiter in nested syntax.
  // Matching the argument position directly has nothing to trip on.
  assert.match(fn, /,\s*res\.status\);/, 'and the status travels with the error');
});

test('a path this app did not generate is rendered directly, with nothing to authenticate to', () => {
  assert.match(render, /parseImagePath\(image\.src\)/, 'the path is recognised, not assumed');
  assert.match(render, /internal \? 'loading' : 'ready'/, 'and a foreign src does not wait on a fetch');
});

test('save availability follows the observed image state, including expired history', () => {
  const source = render.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(source, /onAvailabilityChange\?\.\(image\.src, state\)/);
  assert.match(source, /availability === 'failed' \|\| unavailable/);
  assert.match(source, /disabled=\{saving \|\| availability !== 'ready'\}/);
  assert.match(source, /availability=\{imageStates\[single\.thumbnail\.src\] \?\? 'loading'\}/);
  assert.match(source, /availability=\{imageStates\[asset\.thumbnail!\.src\] \?\? 'loading'\}/);
});

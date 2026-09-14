/**
 * w16 — EMPTY, LOADING AND ERROR RE-AUDITED ACROSS THE SURFACES w12–w15 ADDED.
 *
 * The recurring defect in this codebase is not a missing state, it is a MERGED one: two different
 * situations rendered as the same thing, so the screen makes a confident claim from having no
 * information. It has now appeared four times, each in a different subsystem:
 *
 *   - the usage meter rendered "the usage service did not answer" during the first fetch
 *   - install_module read a timed-out read_script as "there is nothing at that path"
 *   - audit_build reported a 1,500-part sample as the whole place
 *   - and here: every plan tier said "Not available yet" while the billing config was still loading
 *
 * That last one is the same shape as the first. `onChoose` being absent meant all of "still
 * asking", "asked, and this deployment cannot sell", and "could not find out" — so the page told
 * every visitor, in the first frames after load, that nothing was for sale.
 *
 * These tests pin the distinction where it matters and then check the three states are present on
 * each surface. They read source: apps/web mounts nothing, and that bound is stated rather than
 * papered over. The rendered evidence is in the commit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(WEB, 'src', f), 'utf8');
/** Comments stripped, so prose describing a state is not mistaken for the state. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('A TIER IS NOT "NOT AVAILABLE" WHILE WE ARE STILL ASKING', () => {
  const plans = code(read('components/plans.tsx'));
  // Four states, because there are four situations and they need different words.
  for (const state of ['ready', 'checking', 'unavailable', 'unknown']) {
    assert.match(plans, new RegExp(`'${state}'`), `plan availability is missing '${state}'`);
  }
  assert.match(plans, /availability === 'checking'/, 'loading must be its own branch');
  assert.match(plans, /availability === 'unknown'/, 'and so must a failed check');
  // The definite claim is reachable ONLY once we have actually been told.
  assert.match(plans, /availability === 'ready' && onChoose/,
    'a buyable tier requires the answer to have arrived, not merely a handler to exist');
});

test('the usage page passes the real query state through, not just the payload', () => {
  const usage = code(read('routes/usage.tsx'));
  assert.match(usage, /billing\.isPending \? 'checking'/, 'loading is reported as loading');
  assert.match(usage, /billing\.isError \? 'unknown'/, 'and a failed check as unknown');
  // The bug was reading only the payload, which is falsy in both of those.
  assert.doesNotMatch(usage, /availability=\{billing\.data\?\.checkout \? 'ready' : 'unavailable'\}/);
});

test('EVERY SURFACE w12-w15 TOUCHED HAS ALL THREE STATES', () => {
  const surfaces = {
    'routes/usage.tsx': { loading: /isPending/, error: /<Failure/, empty: /days\.length === 0/ },
    'routes/settings.tsx': { loading: /isPending \? 'Loading/, error: /<Failure/, empty: null },
    'routes/dashboard.tsx': { loading: /isPending/, error: /<Failure/, empty: /length === 0|EmptyState/ },
    'routes/admin.tsx': { loading: /isPending/, error: /<Failure/, empty: /length === 0|EmptyState/ },
    'components/ws/memory-panel.tsx': { loading: /isPending/, error: /<Failure/, empty: /length === 0|EmptyState/ },
    'components/ws/credits-panel.tsx': { loading: /isPending/, error: /<Failure/, empty: /length === 0|EmptyState/ },
  };
  const gaps = [];
  for (const [file, want] of Object.entries(surfaces)) {
    const src = read(file);
    for (const [state, re] of Object.entries(want)) {
      if (re && !re.test(src)) gaps.push(`${file}: no ${state} state`);
    }
  }
  assert.deepEqual(gaps, [], gaps.join('\n'));
});

test('no surface offers two Retry controls for one failure', () => {
  // Replacing a raw message with <Failure> left the original Retry button behind in settings, so
  // one error rendered two buttons doing the same thing.
  //
  // MY FIRST VERSION OF THIS COULD NOT FAIL. It matched the element with /<Failure[^>]*\/>/, and
  // `[^>]*` stops at the first `>` — which arrives inside `onRetry={() => ...}` long before the
  // element ends. The regex matched nothing, the loop never ran, and the test passed against a
  // deliberately reintroduced duplicate. Scanning forward for the closing `/>` has no such hole,
  // and the reach count below makes an empty sweep fail rather than pass.
  let checked = 0;
  for (const file of ['routes/usage.tsx', 'routes/settings.tsx', 'routes/admin.tsx']) {
    const src = code(read(file));
    let from = 0;
    for (;;) {
      const at = src.indexOf('<Failure', from);
      if (at === -1) break;
      const end = src.indexOf('/>', at);
      assert.notEqual(end, -1, `${file}: unterminated <Failure`);
      const element = src.slice(at, end + 2);
      from = end + 2;
      if (!element.includes('onRetry')) continue;
      checked += 1;
      // `<button[^>]*>` has the SAME hole as the element matcher did — the `>` in an onClick
      // arrow truncates it. Matching the button's text content instead has nothing to trip on.
      assert.doesNotMatch(src.slice(end + 2, end + 262), />\s*Retry\s*</,
        `${file} renders a second Retry beside the one inside <Failure>`);
    }
  }
  assert.ok(checked >= 2, `expected to examine at least two retryable failures, saw ${checked}`);
});

test('a failure box is announced once, not nested inside another alert', () => {
  // <Failure> carries role="alert". Wrapping it in another one makes a screen reader announce the
  // same failure twice.
  for (const file of ['routes/usage.tsx', 'routes/settings.tsx']) {
    const src = code(read(file));
    // Same care as above: no [^>]* across JSX. Find the wrapper's end by scanning, not by regex.
    let from = 0;
    for (;;) {
      const at = src.indexOf('role="alert"', from);
      if (at === -1) break;
      const close = src.indexOf('>', at);
      from = close + 1;
      assert.doesNotMatch(src.slice(close + 1, close + 120), /^\s*<Failure/,
        `${file} nests an alert inside an alert`);
    }
  }
});

test('LOADING NEVER RENDERS AS EMPTY on a field that will have a value', () => {
  const settings = read('routes/settings.tsx');
  // A disabled input showing "How Apple should address you" says "you have not set one", which is
  // a claim about their account made before it was read.
  assert.match(settings, /profile\.isPending \? 'Loading/, 'the placeholder must say which it is');
});

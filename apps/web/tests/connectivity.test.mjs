// Whether the browser can reach Apple — and, more importantly, when we do not know.
//
// `navigator.onLine` is the single most over-trusted signal on the web. It is TRUE behind a captive
// portal, TRUE on a wifi network with no uplink, TRUE while the worker is down. It is only reliable
// in one direction: false really does mean the browser will not send anything.
//
// So this model reads it in one direction only, and the other direction comes from something we
// actually observed — a request that never left, which the API client reports as status 0 and
// error-taxonomy classifies as 'offline'. Everything else is silence, and silence renders as
// nothing at all rather than as a green light or a warning.
//
// The failure this guards against is the repo's own: a failure to observe rendered as an
// observation. A banner saying "you are offline" because a number was NaN is exactly that.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');
const read = (f) => readFileSync(join(SRC, f), 'utf8');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const { reachability, reachNotice } = await import('../src/lib/connectivity.ts');
const { explainFailure } = await import('../src/lib/error-taxonomy.ts');

/* --------------------------------------------------------- the one truth --- */

test('the browser saying it is offline is believed', () => {
  assert.equal(reachability({ navigatorOnLine: false }), 'offline');
  // Even with a successful request a moment ago: the radio is off NOW.
  assert.equal(reachability({ navigatorOnLine: false, lastSuccessAt: 10, lastFailureAt: null }), 'offline');
});

test('THE BROWSER SAYING IT IS ONLINE IS NOT EVIDENCE OF ANYTHING', () => {
  // Fed the exact shape of a captive portal: the browser is delighted, and the last thing we
  // actually observed was a request that never left.
  assert.equal(
    reachability({ navigatorOnLine: true, lastFailureKind: 'offline', lastFailureAt: 500, lastSuccessAt: 100 }),
    'unreachable',
    'navigator.onLine must not override something we watched fail',
  );
});

test('a missing or nonsense onLine flag is not read as offline', () => {
  // Old webviews and some embedded browsers do not implement it; `undefined` is not `false`.
  for (const bad of [undefined, null, 'true', 'false', 0, 1, {}]) {
    assert.notEqual(
      reachability({ navigatorOnLine: bad }),
      'offline',
      `an onLine of ${JSON.stringify(bad)} was read as the browser being offline`,
    );
  }
});

/* ------------------------------------------------------ observed failure --- */

test('a request that never left, with nothing successful since, means unreachable', () => {
  assert.equal(
    reachability({ navigatorOnLine: true, lastFailureKind: 'offline', lastFailureAt: 500, lastSuccessAt: null }),
    'unreachable',
  );
});

test('a success after the failure clears it', () => {
  assert.equal(
    reachability({ navigatorOnLine: true, lastFailureKind: 'offline', lastFailureAt: 100, lastSuccessAt: 500 }),
    'online',
  );
});

test('A FAILURE THE SERVER ANSWERED IS NOT A CONNECTION PROBLEM', () => {
  // The violating input: a 500 is a failure, and telling the user to check their wifi about it is
  // both wrong and insulting. Only the kind that never left the browser counts.
  for (const kind of ['ours', 'rate_limited', 'not_permitted', 'upstream', 'missing', 'rejected']) {
    assert.equal(
      reachability({ navigatorOnLine: true, lastFailureKind: kind, lastFailureAt: 900, lastSuccessAt: 100 }),
      'online',
      `a ${kind} failure was rendered as a connection problem`,
    );
  }
});

test('AN UNORDERABLE TIMESTAMP CLAIMS NOTHING', () => {
  // `900 > NaN` is false and `NaN > 100` is false, so whichever way the comparison is written, one
  // of these silently picks an answer. The honest answer is the observed success we DO have.
  assert.equal(
    reachability({ navigatorOnLine: true, lastFailureKind: 'offline', lastFailureAt: Number.NaN, lastSuccessAt: 100 }),
    'online',
    'a failure we cannot place in time must not raise a banner',
  );
  assert.equal(
    reachability({ navigatorOnLine: true, lastFailureKind: 'offline', lastFailureAt: '900', lastSuccessAt: 100 }),
    'online',
  );
  // But a failure with no usable success to weigh against it is still the last thing we saw.
  assert.equal(
    reachability({ navigatorOnLine: true, lastFailureKind: 'offline', lastFailureAt: 900, lastSuccessAt: Number.NaN }),
    'unreachable',
  );
});

test('knowing nothing renders as nothing', () => {
  assert.equal(reachability({}), 'online');
  assert.equal(reachNotice('online'), null, 'there is no banner for "we have no bad news"');
});

/* ---------------------------------------------------------- the wording --- */

test('the banner answers the question the taxonomy answers, in the same words', () => {
  // THE RELATIONSHIP, not the literal: whatever the taxonomy decides "did I lose anything" sounds
  // like, the banner says the same thing. Two surfaces describing one condition differently is how
  // a user ends up believing they lost work they did not lose.
  const taxonomy = explainFailure({ status: 0 });
  const offline = reachNotice('offline');
  assert.equal(offline.body, taxonomy.safety, 'the banner must not invent its own reassurance');
  assert.equal(offline.next, taxonomy.next);
  const unreachable = reachNotice('unreachable');
  assert.equal(unreachable.body, taxonomy.safety);
  assert.notEqual(unreachable.title, offline.title, 'the two conditions must not read identically');
});

test('every notice says what happened before it says what to do', () => {
  for (const reach of ['offline', 'unreachable']) {
    const n = reachNotice(reach);
    assert.ok(n && n.title && n.body, `${reach} has no notice`);
    assert.ok(n.title.length < 60, `${reach}: the title is a headline, not a paragraph`);
  }
});

/* ------------------------------------------------------------ the wiring --- */

test('the banner reads the model, and reacts to the events the browser does send', () => {
  const banner = code(read('components/offline-banner.tsx'));
  assert.match(banner, /reachability\(/);
  assert.match(banner, /addEventListener\('offline'/, 'the browser tells us when it goes offline');
  assert.match(banner, /addEventListener\('online'/, 'and when it comes back');
  assert.match(banner, /role="status"|role="alert"/, 'a banner nobody is told about is furniture');
});

test('the shell actually mounts it', () => {
  const layout = code(read('components/layout.tsx'));
  assert.match(layout, /<OfflineBanner\s*\/>/);
});

test('the API client records what it observed, so the banner has something to read', () => {
  const api = code(read('lib/api.ts'));
  assert.match(api, /noteReachability\(/, 'requests must report their own outcome');
});

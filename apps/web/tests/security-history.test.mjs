/**
 * THE SECURITY LOG THE PERSON IT IS ABOUT CAN ACTUALLY READ.
 *
 * The worker half of this was already real and already tested: `securityNotice` (index.ts) writes a
 * `security_event` row on every key mint, rotation, revocation and membership change,
 * notifications.ts makes that kind urgent and unmutable, and GET /api/notifications returns it
 * bound to the caller's own JWT. Nothing in the SPA had ever fetched it. So the product kept a
 * faithful record of who touched the account and showed it to nobody — which is exactly the failure
 * `securityNotice`'s own comment says it was written to fix, reintroduced one layer up.
 *
 * The properties under test, in the order they matter:
 *
 *   1. AN EMPTY LIST AND A FAILED FETCH ARE DIFFERENT SENTENCES. "Nothing has happened on your
 *      account" is a claim about the account; "we could not read your history" is a claim about the
 *      request. Rendering the second as the first is the house's named defect — a failure to
 *      observe rendering as an observation — and on a security page it is the version of it that
 *      costs something.
 *   2. THE FILTER KEEPS SECURITY EVENTS AND ONLY SECURITY EVENTS. A run finishing is not a security
 *      event, and the kind it filters on has to be one the worker actually emits, or the panel is a
 *      dead branch that renders empty forever and nobody can tell.
 *   3. MARKING READ TOUCHES ONLY WHAT WAS SHOWN. The read endpoint takes ids. Handing it every
 *      unread id in the inbox because the security panel happened to be open would silently clear
 *      run failures the person never saw.
 *   4. A ROW THE STORE CANNOT TYPE IS DROPPED, NOT RENDERED. The worker re-validates kind and
 *      severity on the way out for the same reason; a `text` column can hold anything.
 *
 * Structural half: apps/web has no DOM renderer, so nothing here mounts the page. The page tests
 * read settings.tsx's source and pin the wiring — that the row exists, that it is registered with
 * search, and that it reads and writes the two real endpoints. Each would have failed before this
 * change, because the row did not exist at all.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SECURITY_KIND,
  historyState,
  occurrenceNote,
  securityEvents,
  unreadSecurityIds,
} from '../src/lib/security-history.ts';
import { SETTING_FIELDS, matchSettings } from '../src/lib/settings-search.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = readFileSync(join(HERE, '..', 'src', 'routes', 'settings.tsx'), 'utf8');
const API = readFileSync(join(HERE, '..', 'src', 'lib', 'api.ts'), 'utf8');
const WORKER_NOTIFICATIONS = readFileSync(
  join(HERE, '..', '..', 'worker', 'src', 'notifications.ts'),
  'utf8',
);

const AT = Date.parse('2026-09-15T12:00:00Z');

/** A well-formed delivered row, as GET /api/notifications returns it. */
const row = (over = {}) => ({
  id: 'n1',
  kind: SECURITY_KIND,
  severity: 'urgent',
  title: 'A new API key was created on your account',
  body: 'If this was not you, revoke it.',
  subject: 'key:abc',
  href: '/app/settings',
  createdAt: AT,
  updatedAt: AT,
  deliverAt: AT,
  readAt: null,
  occurrences: 1,
  ...over,
});

// ---------------------------------------------------------------------------------------------
// 1. the two sentences that must not be the same sentence
// ---------------------------------------------------------------------------------------------

test('A FAILED FETCH IS NOT AN EMPTY HISTORY', () => {
  // The whole point. If these two collapse, the panel tells someone whose account is being taken
  // over that nothing has happened on it, on the strength of a request that never arrived.
  const broken = historyState({ loading: false, error: new Error('Network error'), data: null });
  assert.equal(broken.state, 'unavailable');
  assert.match(broken.message, /Network error/);

  const empty = historyState({ loading: false, error: null, data: { items: [], unread: 0 } });
  assert.equal(empty.state, 'empty');
  assert.notEqual(empty.state, broken.state);
});

test('a history still being fetched is neither empty nor broken', () => {
  const s = historyState({ loading: true, error: null, data: null });
  assert.equal(s.state, 'loading');
});

test('data that arrived without an items array is unavailable, not empty', () => {
  // A worker too old to serve this route, or a proxy that returned an HTML error page parsed as
  // JSON, both land here. Reading `.items` off it and finding undefined must not become "nothing
  // has happened".
  for (const data of [{}, { items: null }, { items: 'nope' }, null]) {
    const s = historyState({ loading: false, error: null, data });
    assert.equal(s.state, 'unavailable', `${JSON.stringify(data)} was read as a real answer`);
  }
});

test('a history with events reports them and counts the unseen ones', () => {
  const s = historyState({
    loading: false,
    error: null,
    data: { items: [row(), row({ id: 'n2', readAt: AT })], unread: 1 },
  });
  assert.equal(s.state, 'items');
  assert.equal(s.items.length, 2);
  assert.equal(s.unread, 1, 'counted from the rows themselves, not from the inbox-wide total');
});

test('the unread count is the security rows, not the whole inbox', () => {
  // `unread` on the payload counts EVERY kind. Printing it beside a list of security events would
  // put "4 unread" over two rows.
  const s = historyState({
    loading: false,
    error: null,
    data: { items: [row(), row({ id: 'r1', kind: 'run_failed', readAt: null })], unread: 2 },
  });
  assert.equal(s.state, 'items');
  assert.equal(s.unread, 1);
});

// ---------------------------------------------------------------------------------------------
// 2. the filter, and the kind it filters on
// ---------------------------------------------------------------------------------------------

test('only security events survive the filter', () => {
  const items = securityEvents([
    row({ id: 'a' }),
    row({ id: 'b', kind: 'run_complete' }),
    row({ id: 'c', kind: 'billing_issue' }),
    row({ id: 'd' }),
  ]);
  assert.deepEqual(items.map((i) => i.id), ['a', 'd']);
});

test('THE KIND IS ONE THE WORKER ACTUALLY EMITS', () => {
  // A client filtering on a string nobody writes renders an empty panel forever and reads as "your
  // account is quiet". Pinned against the worker's own allowlist rather than against a literal
  // repeated here.
  assert.match(
    WORKER_NOTIFICATIONS,
    new RegExp(`'${SECURITY_KIND}'`),
    'the web filters on a kind the worker does not know',
  );
  assert.match(WORKER_NOTIFICATIONS, /security_event: \{ severity: 'urgent', optional: false/,
    'and it must still be the unmutable account-level kind');
});

test('newest first, because a security page is read from the top', () => {
  const items = securityEvents([
    row({ id: 'old', deliverAt: AT - 60_000 }),
    row({ id: 'new', deliverAt: AT }),
    row({ id: 'mid', deliverAt: AT - 30_000 }),
  ]);
  assert.deepEqual(items.map((i) => i.id), ['new', 'mid', 'old']);
});

test('a row the store could not type is dropped rather than rendered', () => {
  const items = securityEvents([
    row(),
    { id: 'x', kind: SECURITY_KIND },
    null,
    'not a row',
    row({ id: '', title: 'no id' }),
    row({ id: 'y', title: '' }),
  ]);
  assert.deepEqual(items.map((i) => i.id), ['n1'], 'a malformed row must not reach the page');
});

test('a list that is entirely malformed is unavailable, not empty', () => {
  // Otherwise the worst case — every row unreadable — is the one that renders the most reassuring
  // sentence on the page.
  const s = historyState({ loading: false, error: null, data: { items: [{ nonsense: true }], unread: 0 } });
  assert.equal(s.state, 'unavailable');
  assert.match(s.message, /could not be read/i);
});

// ---------------------------------------------------------------------------------------------
// 3. marking read
// ---------------------------------------------------------------------------------------------

test('MARKING READ NAMES ONLY THE SECURITY ROWS THAT WERE UNREAD', () => {
  const ids = unreadSecurityIds([
    row({ id: 'sec-unread' }),
    row({ id: 'sec-read', readAt: AT }),
    row({ id: 'run-unread', kind: 'run_failed' }),
    row({ id: 'bill-unread', kind: 'billing_issue' }),
  ]);
  assert.deepEqual(ids, ['sec-unread'], 'opening this panel must not clear the rest of the inbox');
});

test('nothing unread means nothing is posted', () => {
  assert.deepEqual(unreadSecurityIds([row({ readAt: AT })]), []);
  assert.deepEqual(unreadSecurityIds([]), []);
});

// ---------------------------------------------------------------------------------------------
// 4. what a coalesced row says
// ---------------------------------------------------------------------------------------------

test('a repeated event says how many times, and a single one says nothing', () => {
  // The store coalesces by subject within a day and counts occurrences. "3" printed with no noun
  // beside a security event is worse than nothing.
  assert.equal(occurrenceNote(row({ occurrences: 1 })), null);
  assert.match(occurrenceNote(row({ occurrences: 3 })), /3 times/);
  assert.equal(occurrenceNote(row({ occurrences: 0 })), null);
});

// ---------------------------------------------------------------------------------------------
// the page: the consumer that did not exist
// ---------------------------------------------------------------------------------------------

test('THE SETTINGS PAGE RENDERS THE HISTORY', () => {
  assert.match(PAGE, /<Row\s+id="security-history"/, 'the Security section must carry the row');
  assert.match(PAGE, /from '\.\.\/lib\/security-history/, 'and derive from the model, not re-filter inline');
});

test('the page reads the real endpoint and marks the rows it showed', () => {
  assert.match(API, /\/api\/notifications'/, 'api.ts must fetch the inbox');
  assert.match(API, /\/api\/notifications\/read/, 'and be able to mark rows read');
  assert.match(PAGE, /fetchNotifications/, 'the page must call it');
  assert.match(PAGE, /markNotificationsRead/, 'and post the ids back');
});

test('search can find it, and the registry stays in step with the page', () => {
  // tests/settings-search.test.mjs checks the correspondence in both directions; this checks the
  // words a frightened person actually types.
  assert.ok(SETTING_FIELDS.some((f) => f.id === 'security-history'), 'registered');
  for (const q of ['security history', 'audit', 'recent activity', 'alerts']) {
    assert.ok(matchSettings(q).includes('security-history'), `"${q}" did not find the history`);
  }
});

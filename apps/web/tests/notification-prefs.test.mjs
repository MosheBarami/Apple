/**
 * THE SETTINGS THE ENGINE WAS WAITING FOR.
 *
 * apps/worker has a complete delivery-scheduling engine — quiet hours that wrap midnight and
 * survive a DST change, an hourly and a daily digest, a per-kind mute list that layers org over
 * user over project — and it is the most heavily tested thing in that subsystem. On a live
 * deployment it could never engage, because the defaults are `quiet_hours: null` and
 * `digest: 'off'` and there was no control anywhere in apps/web to change either. A scheduler
 * nobody can configure is a scheduler that always takes the same branch.
 *
 * What is checked here:
 *
 *   1. THE MODEL, as functions rather than JSX: what a switch means when nothing is stored, which
 *      switches cannot be turned off, what a half-filled quiet window does, and which sentence a
 *      person reads when the server refuses a value.
 *   2. AGAINST THE WORKER, by reading apps/worker/src/notifications.ts: the digest modes, the
 *      mandatory kinds and the whole `NotificationPrefReject` union are scraped from the server's
 *      own source, so a reason added there with no sentence here fails rather than rendering a
 *      wire word at somebody.
 *   3. THE WIRING, by reading the source: apps/web has no DOM renderer, so these pin that the
 *      controls exist, that they write through the scope the value belongs to, and that the
 *      per-project panel drives itself from the server's kind list rather than a hand-copied one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_DELIVERY,
  DIGEST_MODES,
  MANDATORY_REASON,
  REJECT_SENTENCES,
  deviceTimeZone,
  digestLabel,
  eventEnabled,
  quietHoursOf,
  rejectSentence,
  toggledEvents,
  withQuietHours,
} from '../src/lib/notification-prefs.ts';
import { MANDATORY_KINDS } from '../src/lib/notification-inbox.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');
const WORKER = join(WEB, '..', 'worker');

const specs = readFileSync(join(WORKER, 'src', 'notifications.ts'), 'utf8');
const api = readFileSync(join(WEB, 'src', 'lib', 'api.ts'), 'utf8');
const page = readFileSync(join(WEB, 'src', 'routes', 'settings.tsx'), 'utf8');
const panel = readFileSync(join(WEB, 'src', 'components', 'ws', 'instructions-panel.tsx'), 'utf8');

/** Source with comments stripped, so a name discussed in prose is not mistaken for one in use. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ------------------------------------------------------------- per-event switches --- */

test('a kind nobody has touched is ON, because a product nobody has configured still has to speak', () => {
  // The server's `wants()` answers true for an absent entry. A client that rendered an unset
  // switch as off would show every notification disabled on a fresh account, and the first thing
  // the user would do is turn on something that was never off.
  assert.equal(eventEnabled({}, 'run_failed'), true);
  assert.equal(eventEnabled(undefined, 'run_failed'), true);
  assert.equal(eventEnabled({ run_failed: false }, 'run_failed'), false);
  assert.equal(eventEnabled({ run_failed: true }, 'run_failed'), true);
});

test('the mandatory kinds read as on whatever is stored, exactly as the server answers', () => {
  for (const kind of MANDATORY_KINDS) {
    assert.equal(eventEnabled({ [kind]: false }, kind), true, `${kind} must not render as muted`);
  }
});

test('toggling writes an explicit boolean and leaves the rest of the map alone', () => {
  const before = Object.freeze({ mention: false });
  const off = toggledEvents(before, 'run_complete', false);
  assert.deepEqual(off, { mention: false, run_complete: false });
  assert.deepEqual(before, { mention: false }, 'the stored map must not be mutated in place');

  // Back ON is stored as `true`, NOT deleted. The scopes merge per entry, so an explicit true at
  // the user layer is the only way to undo a mute inherited from an organisation — dropping the
  // key would silently re-apply the org's mute.
  const on = toggledEvents(off, 'run_complete', true);
  assert.equal(on.run_complete, true);
});

test('a mandatory kind cannot be muted from here, because the server would refuse it by name', () => {
  for (const kind of MANDATORY_KINDS) {
    assert.deepEqual(toggledEvents({}, kind, false), {}, `${kind} must not be sent as a mute`);
  }
});

/* ----------------------------------------------------------------- quiet hours --- */

test('a quiet window needs both ends, and half of one is no window rather than a broken one', () => {
  assert.deepEqual(quietHoursOf('22:00', '07:00'), { hours: { start: '22:00', end: '07:00' }, problem: null });
  assert.deepEqual(quietHoursOf('', ''), { hours: null, problem: null });
  assert.equal(quietHoursOf('22:00', '').hours, null);
  assert.equal(quietHoursOf('22:00', '').problem, 'half_window');
  assert.equal(quietHoursOf('', '07:00').problem, 'half_window');
});

test('start equal to end is refused HERE with the server’s own word for it', () => {
  // The server calls it `empty_window` and discards the whole object: it is ambiguous between
  // "quiet all day" and "quiet for no time", and guessing either silences a person who asked for
  // neither. Caught before the request so the page can say so without a round trip.
  const out = quietHoursOf('09:00', '09:00');
  assert.equal(out.hours, null);
  assert.equal(out.problem, 'empty_window');
  assert.ok(specs.includes("'empty_window'"), 'the server no longer uses this word — this test is measuring nothing');
});

test('a time the server’s pattern would reject never leaves the page', () => {
  for (const bad of ['9:5', '25:00', '22:60', 'evening', '7pm']) {
    assert.equal(quietHoursOf(bad, '07:00').problem, 'bad_time', `${bad} was accepted`);
  }
});

test('setting a window keeps the rest of the delivery preference untouched', () => {
  const before = { timezone: 'Europe/London', quiet_hours: null, digest: 'daily', digest_hour: 7 };
  const after = withQuietHours(before, { start: '23:00', end: '06:30' });
  assert.deepEqual(after, { timezone: 'Europe/London', quiet_hours: { start: '23:00', end: '06:30' }, digest: 'daily', digest_hour: 7 });
  assert.equal(before.quiet_hours, null, 'the input must not be mutated');
});

/* --------------------------------------------------------------------- digest --- */

test('the digest modes are the server’s, not a second list that can drift from it', () => {
  const block = /export const DIGEST_MODES = \[([\s\S]*?)\] as const;/.exec(specs);
  assert.ok(block, 'could not find DIGEST_MODES in the worker — this test is measuring nothing');
  const theirs = [...block[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
  assert.ok(theirs.length >= 2, `only scraped ${theirs.length} modes — the scrape is broken`);
  assert.deepEqual([...DIGEST_MODES], theirs);
});

test('every digest mode has a sentence rather than a wire word', () => {
  for (const mode of DIGEST_MODES) {
    assert.ok(digestLabel(mode).length > 3, `${mode} has no readable label`);
    assert.notEqual(digestLabel(mode), mode);
  }
});

test('the defaults are the server’s defaults, so an untouched page shows what is actually stored', () => {
  const block = /export const DEFAULT_DELIVERY: DeliveryPreference = \{([^}]*)\};/.exec(specs);
  assert.ok(block, 'could not find DEFAULT_DELIVERY in the worker — this test is measuring nothing');
  assert.match(block[1], new RegExp(`timezone: '${DEFAULT_DELIVERY.timezone}'`));
  assert.match(block[1], new RegExp(`digest: '${DEFAULT_DELIVERY.digest}'`));
  assert.match(block[1], new RegExp(`digest_hour: ${DEFAULT_DELIVERY.digest_hour}`));
  assert.equal(DEFAULT_DELIVERY.quiet_hours, null);
});

test('the device zone is a real IANA zone, never the literal "system" the display setting uses', () => {
  // The display time zone may be 'system' because the browser resolves it at render time. This one
  // is stored on the server and read there, where there is no device to ask.
  const zone = deviceTimeZone();
  assert.notEqual(zone, 'system');
  assert.doesNotThrow(() => new Intl.DateTimeFormat('en-US', { timeZone: zone }));
});

/* ------------------------------------------------- what the server refused, in words --- */

test('every reason the server can return has a sentence a person can read', () => {
  // The whole union, scraped. A reason added on the worker with no sentence here would render as
  // `no_transport` in a settings page, which is the product telling somebody its own variable name.
  const block = /export type NotificationPrefReject =([\s\S]*?);/.exec(specs);
  assert.ok(block, 'could not find NotificationPrefReject in the worker — this test is measuring nothing');
  const reasons = [...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(reasons.length >= 5, `only scraped ${reasons.length} reasons — the scrape is broken`);
  for (const reason of reasons) {
    assert.ok(REJECT_SENTENCES[reason], `the server can answer ${reason} and nothing here can say it`);
  }
});

test('a rejection names the setting it is about, not the wire key it arrived under', () => {
  // The worker prefixes: `notify_delivery:timezone`, `notify_events:mention`.
  assert.match(rejectSentence('notify_delivery:timezone', 'unknown_timezone'), /time zone/i);
  assert.match(rejectSentence('notify_delivery:quiet_hours', 'empty_window'), /quiet/i);
  assert.match(rejectSentence('notify_events:billing_issue', 'mandatory'), /billing/i);
});

test('an unrecognised reason still produces a sentence rather than an empty line', () => {
  const s = rejectSentence('notify_delivery:digest', 'something_new');
  assert.ok(s.length > 0);
  assert.ok(!/undefined/.test(s));
});

test('the sentence for a mandatory kind is the one the inbox uses, not a second wording', () => {
  assert.ok(MANDATORY_REASON.length > 10);
  assert.match(rejectSentence('notify_events:security_event', 'mandatory'), /account/i);
});

/* --------------------------------------------------------------------- wiring --- */

test('the client declares the two notification preference keys the worker stores', () => {
  // Without these on the Preferences interface, a page that set them would typecheck only by
  // casting, and the value would never survive a round trip through savePreferences.
  assert.match(api, /notify_delivery\?:/, 'the delivery preference is not declared');
  assert.match(api, /notify_events\?:/, 'the per-kind mute list is not declared');
});

test('the settings page has a control for quiet hours, the digest and the zone they are read in', () => {
  const body = code(page);
  assert.match(body, /<Row id="notify-quiet-hours"/, 'there is nowhere to set a quiet window');
  assert.match(body, /<Row id="notify-digest"/, 'there is nowhere to choose a digest');
  assert.match(body, /<Row id="notify-events"/, 'there is nowhere to switch a kind off');
  assert.match(body, /type="time"/, 'quiet hours must be entered as times, sent as HH:MM');
});

test('the digest hour is only asked for when it means something', () => {
  // `digest_hour` is ignored for 'off' and 'hourly'. A select that is always visible invites
  // somebody to set an hour that changes nothing.
  const body = code(page);
  assert.match(body, /digest === 'daily'/, "the hour must be conditional on the daily digest");
});

test('the page writes the account layer, through the same call every other preference uses', () => {
  const body = code(page);
  assert.match(body, /savePreferences\(\s*'user'/, "notification settings belong to the person, not to one project");
  assert.match(body, /fetchScopeMemory\(\s*'user'/, 'the page must show what is actually stored');
});

test('the save carries the preferences already stored, because the route deletes what it is not sent', () => {
  // PUT /api/memory/user/:id/preferences REPLACES the scope: a key it does not receive is DELETED,
  // which is how "unset" is reachable at all. A save that sent only the two notification keys would
  // silently wipe this person's language, response length, coding style and Roblox conventions,
  // and nothing would say so. The whole object goes, every time.
  //[[ EVERY SAVER ON THIS PAGE, NOT THE FIRST ONE THE REGEX HAPPENS TO FIND.
  //
  //   This matched one `savePreferences(` and asserted the notification keys were in it. A second
  //   panel landed — asset sources — above the first, so the regex found ITS call and the test
  //   failed about a save that was correct. Worse in the other direction: had the new panel landed
  //   BELOW, the test would have passed while a saver that wipes every other preference sat on the
  //   page unexamined, which is the exact defect it exists to catch.
  //
  //   The property belongs to all of them: the route REPLACES the scope, so any save that does not
  //   carry the stored base deletes this person's language, response length, coding style and
  //   Roblox conventions, silently.
  const body = code(page);
  const calls = [...body.matchAll(/savePreferences\(\s*'user',\s*userId,\s*\{([\s\S]{0,500}?)\}\s*\)/g)];
  assert.ok(calls.length >= 1, 'could not find a save call — this test is measuring nothing');
  for (const [i, call] of calls.entries()) {
    assert.match(call[1], /\.\.\.base/,
      `saver ${i + 1} of ${calls.length} does not carry the stored preferences, so it deletes every key it omits`);
  }
  // And the notification panel's own save carries the two keys it owns.
  const notify = calls.find((c) => /notify_delivery/.test(c[1]));
  assert.ok(notify, 'no saver writes notify_delivery');
  assert.match(notify[1], /notify_events/);
  assert.match(body, /preferences\.prefs/, 'the base has to be what the server says is stored');
});

test('what the server refused is printed, instead of falling back to a default in silence', () => {
  // Both the reasons this page can provoke — `unknown_timezone` and `empty_window` — make the
  // server discard the value and answer with the DEFAULT. A page that renders the response without
  // reading `rejected` shows the setting snapping back with no explanation.
  const body = code(page);
  assert.match(body, /rejected/, 'the rejected list is never read');
  assert.match(body, /rejectSentence/, 'the reasons must be rendered as sentences');
});

/* ----------------------------------------------------- the per-project switches --- */

test('the project panel switches kinds off for one project, through the project scope', () => {
  const body = code(panel);
  assert.match(body, /notify_events/, 'the panel writes no notification preference');
  assert.match(body, /setPref\(\s*'notify_events'/, 'it must go through the panel’s own scoped save path');
});

test('the project panel takes its kind list from the server, not from a copy typed into the JSX', () => {
  // GET /api/notifications ships `kinds` precisely so a settings surface need not keep a second
  // list. A hand-written array here is a kind added on the worker that no project can ever mute.
  const body = code(panel);
  assert.match(
    body,
    /import \{[^}]*NOTIFICATION_KINDS[^}]*\} from '\.\.\/\.\.\/lib\/notification-inbox\.ts'/,
    'the panel must take the kinds from the list tests/notification-inbox.test.mjs pins against the worker',
  );
  assert.doesNotMatch(body, /'run_complete'[\s\S]{0,80}'run_failed'/, 'the kinds are copied into the panel by hand');
});

test('the two kinds the server refuses to mute render disabled with the reason, not missing', () => {
  // A row that is simply absent reads as "this product does not notify me about billing". It does,
  // and it always will, and the page has to say so.
  const body = code(panel);
  assert.match(body, /MANDATORY_KINDS|mandatory/i, 'the panel must know which kinds cannot be switched off');
  assert.match(body, /disabled/, 'and render them as disabled rather than omitting them');
});

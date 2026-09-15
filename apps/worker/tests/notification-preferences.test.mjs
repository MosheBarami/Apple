/**
 * NOTIFICATION SETTINGS AS SCOPED PREFERENCES - the join between notifications.ts and the memory
 * store that already knows how to scope a setting.
 *
 * The checklist asks for three separate things: delivery preferences, PER-PROJECT preferences, and
 * PER-EVENT preferences. They are one thing here, and that is the point of putting the values in
 * `PREFERENCE_KEYS` instead of building a notifications_settings table: the org/user/project
 * layering, the "which layer won" reporting, expiry, audit and export all already exist and are
 * already tested. A second store would have had to grow all of it or ship without it.
 *
 * TWO MERGE RULES, AND THEY ARE DIFFERENT ON PURPOSE:
 *
 *   - `notify_delivery` overrides WHOLESALE. Half of one layer's quiet window and half of
 *     another's is a window nobody set.
 *   - `notify_events` merges PER ENTRY. Muting one kind inside one project must not silently
 *     un-mute every kind the person muted account-wide - a switch that flips itself when you
 *     change a different switch.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'notifprefs-')), 'prefs.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'preferences.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const P = await import(`file://${out}`);

const notifOut = join(mkdtempSync(join(tmpdir(), 'notifprefs-n-')), 'notif.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'notifications.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + notifOut],
  { cwd: WORKER, stdio: 'pipe' });
const N = await import(`file://${notifOut}`);

const BERLIN_NIGHT = { timezone: 'Europe/Berlin', quiet_hours: { start: '22:00', end: '07:00' }, digest: 'off', digest_hour: 9 };

test('the two notification keys are preferences, so they inherit scoping rather than reinventing it', () => {
  assert.ok(P.PREFERENCE_KEYS.includes('notify_delivery'));
  assert.ok(P.PREFERENCE_KEYS.includes('notify_events'));
  // The store's key rule is what decides what is addressable. A preference key that cannot round
  // trip through it is a row nobody could ever delete through the normal route.
  assert.match(P.preferenceEntryKey('notify_delivery'), /^[a-z0-9][a-z0-9._-]{0,63}$/);
  assert.match(P.preferenceEntryKey('notify_events'), /^[a-z0-9][a-z0-9._-]{0,63}$/);
});

test('a delivery preference survives the trip out to rows and back', () => {
  const entries = P.preferencesToEntries({ notify_delivery: BERLIN_NIGHT, notify_events: { run_complete: false } }, 'user', 'user-a');
  assert.equal(entries.length, 2);
  // What the memory store actually stores: one row per key, JSON in the value column.
  const rows = entries.map((e) => ({ ...e, source: 'user', createdAt: '', updatedAt: '', expiresAt: null, updatedBy: 'user-a' }));
  const back = P.preferencesFromEntries(rows, {});
  assert.deepEqual(back.rejected, []);
  assert.deepEqual(back.prefs.notify_delivery, BERLIN_NIGHT);
  assert.deepEqual(back.prefs.notify_events, { run_complete: false });
});

test('a stored row that is not JSON, or is JSON the validator refuses, does not become a setting', () => {
  const row = (key, value) => ({ scope: 'user', scopeId: 'u', key, kind: 'preference', value, source: 'user', createdAt: '', updatedAt: '', expiresAt: null, updatedBy: 'u' });
  // Rows like these arrive from the memory IMPORT path - an export someone edited by hand - which
  // is a request body with extra steps.
  const back = P.preferencesFromEntries([
    row('pref.notify_delivery', 'not json at all'),
    row('pref.notify_events', JSON.stringify({ security_event: false })),
  ], {});
  assert.equal(back.prefs.notify_delivery, undefined, 'unparseable rows are dropped before validation');
  assert.equal(back.prefs.notify_events, undefined, 'the only entry in it was a mute nobody may set');
  assert.ok(back.rejected.some((r) => r.key === 'notify_events:security_event' && r.reason === 'mandatory'));
});

test('the refusal reason reaches the settings page instead of collapsing into "bad value"', () => {
  const { rejected } = P.normalisePreferences({
    notify_delivery: { timezone: 'Mars/Olympus_Mons' },
    notify_events: { email: true, run_exploded: false },
  }, {});
  const seen = rejected.map((r) => `${r.key}:${r.reason}`).sort();
  assert.deepEqual(seen, [
    'notify_delivery:timezone:unknown_timezone',
    'notify_events:email:no_transport',
    'notify_events:run_exploded:unknown_kind',
  ]);
});

// ---------------------------------------------------------------------------------------------
// the two merge rules
// ---------------------------------------------------------------------------------------------

test('a delivery window is taken whole from the nearest layer that set one', () => {
  const merged = P.mergePreferences({
    org: { notify_delivery: { timezone: 'UTC', quiet_hours: { start: '20:00', end: '06:00' }, digest: 'daily', digest_hour: 8 } },
    project: { notify_delivery: { timezone: 'Europe/Berlin', quiet_hours: null, digest: 'off', digest_hour: 9 } },
  });
  assert.deepEqual(merged.prefs.notify_delivery, { timezone: 'Europe/Berlin', quiet_hours: null, digest: 'off', digest_hour: 9 });
  assert.equal(merged.sources.notify_delivery, 'project');
  // Not a field-by-field blend: the org's 08:00 daily digest did NOT survive into a window the
  // project turned off.
  assert.equal(merged.prefs.notify_delivery.digest, 'off');
});

test('a project mute merges into the account-wide mutes rather than replacing them', () => {
  const merged = P.mergePreferences({
    user: { notify_events: { run_complete: false, mention: false } },
    project: { notify_events: { run_complete: true } },
  });
  assert.deepEqual(merged.prefs.notify_events, { run_complete: true, mention: false });
  assert.equal(merged.sources.notify_events, 'project');
  // And the property that matters, stated as the product behaviour rather than as an object shape:
  // inside this project the person still hears nothing about mentions, and does hear about builds.
  assert.equal(N.wants('mention', merged.prefs.notify_events), false);
  assert.equal(N.wants('run_complete', merged.prefs.notify_events), true);
});

test('the layers are ordered by the store precedence, not by the order the caller passed them', () => {
  // Same three layers, written in the opposite order. `mergePreferences` sorts by `precedenceOf`,
  // so an object literal whose keys happen to be ordered differently cannot change who wins.
  const a = P.mergePreferences({ org: { notify_events: { mention: false } }, user: { notify_events: { mention: true } } });
  const b = P.mergePreferences({ user: { notify_events: { mention: true } }, org: { notify_events: { mention: false } } });
  assert.deepEqual(a.prefs.notify_events, b.prefs.notify_events);
  assert.equal(a.prefs.notify_events.mention, true, 'the person overrides their organisation');
});

test('an organisation cannot mute a notification the product will not let anyone mute', () => {
  // The check is at the validator, so a mandatory mute never becomes a stored row to be merged.
  const { prefs, rejected } = P.normalisePreferences({ notify_events: { security_event: false } }, {});
  assert.equal(prefs.notify_events, undefined);
  assert.deepEqual(rejected, [{ key: 'notify_events:security_event', reason: 'mandatory' }]);
  // And even if such a row existed, the delivery path refuses to honour it.
  assert.equal(N.wants('security_event', { security_event: false }), true);
});

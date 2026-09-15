/**
 * THE API KEYS SCREEN — a credential you could mint, use and never see again.
 *
 * The worker has had the whole lifecycle for a long time: POST /api/keys mints, GET /api/keys
 * lists with expiry and last-used, POST /api/keys/:id/rotate replaces a key inheriting its scopes
 * and projects exactly, DELETE /api/keys/:id revokes and the authorizer refuses a revoked key with
 * its own code. Ten tests cover the rotation rules alone. And `grep '/api/keys' apps/web/src`
 * returned NOTHING — so a customer whose key leaked could only revoke it with curl, and the expiry
 * the server has been serving all along reached no person at all.
 *
 * WHAT THIS FILE ASSERTS, in the order the hazards rank:
 *
 *   1. A KEY THAT CANNOT DO ANYTHING SAYS SO. `projects: []` is not a small print detail — the
 *      authorizer refuses every project-scoped call from such a key with `project_not_granted`.
 *      Rendering that key as "Active" with a green tick is a working-looking credential that
 *      cannot work, which is the exact defect this codebase keeps finding.
 *
 *   2. EXPIRY REACHES A PERSON BEFORE IT REACHES A LOG. A key with four days left is its own
 *      state, not an "active" one, because the only useful moment to say so is before it dies.
 *
 *   3. NO DATE IS EVER RENDERED FROM A VALUE THAT IS NOT ONE. Every field here is an ISO string
 *      from JSON, and `new Date(undefined)` prints "Invalid Date" — a sentence nobody can act on.
 *
 *   4. THE FORM REFUSES WHAT THE SERVER WOULD REFUSE, in its own words, before the round trip.
 *
 * Run with:  node --test tests/api-keys.test.mjs      (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  statusOf,
  describeKey,
  expiryLabel,
  grantLabel,
  newKeyProblems,
} from '../src/lib/api-keys.ts';
import { API_SCOPES } from '@golem/shared';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const PANEL = readFileSync(join(WEB, 'src', 'components', 'api-keys-panel.tsx'), 'utf8');
const SETTINGS = readFileSync(join(WEB, 'src', 'routes', 'settings.tsx'), 'utf8');
const API = readFileSync(join(WEB, 'src', 'lib', 'api.ts'), 'utf8');

const NOW = Date.parse('2026-09-15T12:00:00.000Z');
const iso = (msFromNow) => new Date(NOW + msFromNow).toISOString();
const DAY = 86_400_000;

const key = (over = {}) => ({
  id: 'k1',
  name: 'CI publisher',
  mode: 'live',
  prefix: 'gk_live_',
  scopes: ['chat:write', 'runs:read'],
  projects: [{ id: 'p1', name: 'Tower Defence' }],
  created_at: iso(-30 * DAY),
  expires_at: null,
  last_used_at: iso(-2 * DAY),
  revoked_at: null,
  ...over,
});

const POISON = ['undefined', 'NaN', 'Invalid Date', '[object', 'null'];
const clean = (s, what) => {
  assert.equal(typeof s, 'string', `${what} must be a string, got ${typeof s}`);
  for (const bad of POISON) assert.equal(s.includes(bad), false, `${what} rendered "${bad}": ${s}`);
};

// ---------------------------------------------------------------- 1. a key that cannot do anything

test('A KEY GRANTED NO PROJECT SAYS SO — it is refused by every project route', () => {
  const said = grantLabel(key({ projects: [] }));
  clean(said, 'the empty-grant label');
  assert.match(said, /no project/i);
  assert.match(said, /cannot|will be refused|reaches no/i, 'it must say what that MEANS, not just what it is');
});

test('and a key with projects names them, because "2 projects" is not an answer', () => {
  const said = grantLabel(key({ projects: [{ id: 'p1', name: 'Tower Defence' }, { id: 'p2', name: 'Obby' }] }));
  clean(said, 'the grant label');
  assert.match(said, /Tower Defence/);
  assert.match(said, /Obby/);
});

// ------------------------------------------------------------------------ 2. expiry, before death

test('A KEY ABOUT TO EXPIRE IS ITS OWN STATE', () => {
  assert.equal(statusOf(key({ expires_at: iso(4 * DAY) }), NOW), 'expiring');
  assert.equal(statusOf(key({ expires_at: iso(40 * DAY) }), NOW), 'active');
  assert.equal(statusOf(key({ expires_at: iso(-1 * DAY) }), NOW), 'expired');
});

test('revoked outranks expired — the reason it stopped working is the useful half', () => {
  const both = key({ expires_at: iso(-5 * DAY), revoked_at: iso(-6 * DAY) });
  assert.equal(statusOf(both, NOW), 'revoked');
});

test('the expiry sentence counts down in days, and says plainly when there is none', () => {
  clean(expiryLabel(key({ expires_at: iso(3 * DAY) }), NOW), 'expiring label');
  assert.match(expiryLabel(key({ expires_at: iso(3 * DAY) }), NOW), /3 days/);
  assert.match(expiryLabel(key({ expires_at: iso(1 * DAY) }), NOW), /1 day\b/, 'one day, not "1 days"');
  assert.match(expiryLabel(key({ expires_at: null }), NOW), /never expires|no expiry/i);
  assert.match(expiryLabel(key({ expires_at: iso(-2 * DAY) }), NOW), /expired/i);
});

// ----------------------------------------------------------- 3. never a date from a value that isn't

test('A MISSING OR CORRUPT TIMESTAMP IS NEVER RENDERED AS A DATE', () => {
  // Every one of these arrives as JSON from a route that has been running for months; a row
  // written before a column existed is exactly how `undefined` reaches a formatter.
  for (const bad of [undefined, null, '', 'not-a-date', 0]) {
    clean(expiryLabel(key({ expires_at: bad }), NOW), `expiry from ${JSON.stringify(bad)}`);
    clean(describeKey(key({ last_used_at: bad, expires_at: bad }), NOW), `description from ${JSON.stringify(bad)}`);
  }
});

test('a key that has never been used says so, rather than dating the epoch', () => {
  const said = describeKey(key({ last_used_at: null }), NOW);
  clean(said, 'never-used description');
  assert.match(said, /never been used|not used/i);
  assert.equal(said.includes('1970'), false);
});

// -------------------------------------------------------------------------- 4. the form's refusals

test('THE FORM REFUSES WHAT THE SERVER WOULD REFUSE, before the round trip', () => {
  const ok = { name: 'CI', mode: 'live', scopes: ['chat:write'], projectIds: ['p1'], expiresInDays: 30 };
  assert.deepEqual(newKeyProblems(ok), []);

  const named = (input) => newKeyProblems(input).map((p) => p.field);
  assert.deepEqual(named({ ...ok, name: '   ' }), ['name']);
  assert.deepEqual(named({ ...ok, scopes: [] }), ['scopes']);
  // The worker takes an integer between 1 and 365 and refuses everything else, including "30".
  assert.deepEqual(named({ ...ok, expiresInDays: 0 }), ['expiresInDays']);
  assert.deepEqual(named({ ...ok, expiresInDays: 400 }), ['expiresInDays']);
  assert.deepEqual(named({ ...ok, expiresInDays: 1.5 }), ['expiresInDays']);
  assert.deepEqual(named({ ...ok, expiresInDays: '30' }), ['expiresInDays']);
  // No expiry at all is legal — the server treats it as a key that does not expire.
  assert.deepEqual(newKeyProblems({ ...ok, expiresInDays: null }), []);
});

test('a key with no project granted is a WARNING, not a refusal', () => {
  // The server mints it happily and it is a legitimate thing to want for the non-project routes.
  // Saying nothing would let somebody mint a key for a CI job it can never serve.
  const problems = newKeyProblems({ name: 'CI', mode: 'live', scopes: ['chat:write'], projectIds: [] });
  assert.deepEqual(problems.map((p) => p.field), ['projectIds']);
  assert.equal(problems[0].severity, 'warning');
  clean(problems[0].message, 'the empty-project warning');
});

test('every scope the form offers is one the worker will accept', () => {
  // The vocabulary lives in @golem/shared for this reason: a scope offered here and refused there
  // is a tickbox whose failure arrives as a 400 with no field on it.
  const offered = [...PANEL.matchAll(/'([a-z]+:[a-z]+)'/g)].map((m) => m[1]);
  // F-64: a scrape that matched nothing would pass this loop zero times and report success.
  assert.ok(offered.length >= API_SCOPES.length, `only found ${offered.length} scope strings in the panel`);
  for (const s of offered.filter((x) => x.includes(':'))) {
    assert.ok(API_SCOPES.includes(s), `${s} is not an API scope`);
  }
});

// ------------------------------------------------------------------------------------ the wiring

test('THE PANEL IS MOUNTED AND FINDABLE — the defect was that it did not exist', () => {
  assert.match(SETTINGS, /import \{ ApiKeysPanel \}/, 'settings must import it');
  assert.match(SETTINGS, /<ApiKeysPanel/, 'and render it');
  assert.match(SETTINGS, /<Row id="api-keys"/, 'under an id search can scroll to');
});

test('and it talks to the four routes that already existed', () => {
  for (const [name, route] of [
    ['fetchApiKeys', "'/api/keys'"],
    ['createApiKey', "'/api/keys'"],
    ['revokeApiKey', '/api/keys/'],
    ['rotateApiKey', '/rotate'],
  ]) {
    assert.match(API, new RegExp(`export const ${name}`), `${name} must exist in the api client`);
    assert.ok(API.includes(route.replace(/'/g, "'")), `${name} must call ${route}`);
    assert.match(PANEL, new RegExp(name), `the panel must use ${name}`);
  }
});

test('THE SECRET IS SHOWN ONCE AND NEVER FETCHED AGAIN', () => {
  // The server returns the plaintext key exactly once, on mint and on rotate. A panel that put it
  // in the query cache would keep a live credential in memory for the rest of the session and
  // re-render it on every refetch; one that never showed it would make the control useless.
  assert.match(PANEL, /only time/i, 'the page must say this is the only time it is shown');
  assert.doesNotMatch(API, /export const fetchApiKey\b/, 'there must be no route that reads a key back');
});

/**
 * THE IN-APP SUPPORT DIALOG — the half of a support desk that a signed-in person can reach.
 *
 * WHAT WAS THERE. `public.feedback` since 0001_init.sql, with a `page` column that only makes sense
 * for an in-app widget, and no widget. The product's whole support surface was an address on the
 * marketing site, so the person best placed to describe a failure — the one looking at it — had to
 * leave the app, find the site, and retype from memory what they had been doing. A help surface
 * that only exists on the marketing site is a help surface nobody signed in can reach.
 *
 * THREE PROPERTIES GET THEIR OWN TESTS, because each is a way the obvious dialog loses:
 *
 *  1. THE CATEGORIES HAVE TO BE THE DATABASE'S CATEGORIES. A radio group offering a fourth option
 *     is a 500 on submit; one offering two is a dead branch in the column. The list here is
 *     compared against `apps/worker/src/support.ts` and against the CHECK constraint in
 *     0001_init.sql, so the three copies cannot drift apart silently.
 *
 *  2. THE WIDGET MUST NOT TRANSMIT THE SESSION. This app returns from a magic link to
 *     `/app#access_token=…` (src/lib/auth-flows.ts:227). A dialog that files `location.href` sends
 *     a live credential to a table whose purpose is to be read by someone else. The worker strips
 *     it too; that is defence in depth, not a reason for the client to send it.
 *
 *  3. A RECEIPT WITH NO STATUS IS NOT AN ANSWER. `status` has existed on the column since the
 *     beginning and was excluded even from the user's own data export. "Did anyone read it" is the
 *     only question a person has after filing a report, so the list renders the answer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(WEB, '..', '..');
const ESBUILD = join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild');

function bundle(abs, name) {
  const out = join(mkdtempSync(join(tmpdir(), 'support-')), `${name}.mjs`);
  execFileSync(
    ESBUILD,
    [abs, '--bundle', '--format=esm', '--platform=neutral', '--main-fields=main,module', '--outfile=' + out],
    { stdio: 'pipe' },
  );
  return import(out);
}

const M = await bundle(join(WEB, 'src', 'components', 'support-model.ts'), 'model');
const W = await bundle(join(ROOT, 'apps', 'worker', 'src', 'support.ts'), 'worker');

const INIT_SQL = readFileSync(join(ROOT, 'infra', 'supabase', 'migrations', '0001_init.sql'), 'utf8');
const DIALOG_TSX = readFileSync(join(WEB, 'src', 'components', 'support-dialog.tsx'), 'utf8');
const LAYOUT_TSX = readFileSync(join(WEB, 'src', 'components', 'layout.tsx'), 'utf8');
const API_TS = readFileSync(join(WEB, 'src', 'lib', 'api.ts'), 'utf8');

/* -------------------------------------------------------------- the vocabulary --- */

test('the categories offered are exactly the categories the column allows', () => {
  const table = INIT_SQL.slice(INIT_SQL.indexOf('create table public.feedback'));
  const m = /kind\s+text[^\n]*check\s*\(\s*kind\s+in\s*\(([^)]*)\)\s*\)/i.exec(table.slice(0, table.indexOf(');')));
  assert.ok(m, 'public.feedback no longer constrains kind — this test is measuring nothing');
  const fromDb = m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).sort();
  assert.ok(fromDb.length === 3, `parsed ${fromDb.length} categories out of the migration — a broken parse`);
  assert.deepEqual(M.SUPPORT_CATEGORIES.map((c) => c.id).sort(), fromDb, 'the dialog offers categories the database refuses');
  assert.deepEqual([...W.SUPPORT_KINDS].sort(), fromDb, 'the worker and the database disagree');
});

test('each category is labelled in words a person would use, not in the column value', () => {
  for (const c of M.SUPPORT_CATEGORIES) {
    assert.ok(c.label && c.label.length > 2, `${c.id} has no label`);
    assert.notEqual(c.label.toLowerCase(), c.id, `${c.id} is labelled with its own column value`);
    // A radio group of three bare nouns makes the user guess which one gets answered.
    assert.ok(c.hint && c.hint.length > 12, `${c.id} gives no hint about when to choose it`);
  }
});

test('the default category is the one the column defaults to', () => {
  const m = /kind\s+text\s+not\s+null\s+default\s+'([a-z]+)'/i.exec(INIT_SQL.slice(INIT_SQL.indexOf('create table public.feedback')));
  assert.equal(M.SUPPORT_CATEGORY_DEFAULT, m[1]);
  assert.ok(M.SUPPORT_CATEGORIES.some((c) => c.id === M.SUPPORT_CATEGORY_DEFAULT), 'the default is not one of the offered categories');
});

/* --------------------------------------------------------------------- the page --- */

test('the page filed with a report is a path, never the credential in the URL', () => {
  // The real shape after a magic link.
  assert.equal(
    M.supportPageOf({ pathname: '/app/project/9b1d', search: '', hash: '#access_token=eyJhbGciOiJIUzI1NiJ9.a.b&type=recovery' }),
    '/app/project/9b1d',
  );
  assert.equal(M.supportPageOf({ pathname: '/app/settings', search: '?code=abc123', hash: '' }), '/app/settings');
  assert.equal(M.supportPageOf({ pathname: '/app', search: '?code=x', hash: '#access_token=y' }), '/app');
});

test('a location the widget cannot read produces nothing, not the string "undefined"', () => {
  for (const bad of [null, undefined, {}, { pathname: 42 }, { pathname: '' }, 'not an object']) {
    assert.equal(M.supportPageOf(bad), null);
  }
});

/* ------------------------------------------------------------------ the draft --- */

test('an empty draft cannot be sent, and the reason is not a mystery', () => {
  for (const blank of ['', '   ', '\n\t']) {
    const v = M.checkDraft(blank);
    assert.equal(v.canSend, false);
    assert.equal(v.error, null, 'a blank box is not an error the user made, it is a button that waits');
  }
});

test('a draft past the limit says so before the round trip, with the numbers', () => {
  const over = 'x'.repeat(M.SUPPORT_CONTENT_MAX + 1);
  const v = M.checkDraft(over);
  assert.equal(v.canSend, false);
  assert.ok(v.error, 'an over-long draft is silently un-sendable');
  assert.match(v.error, new RegExp(String(M.SUPPORT_CONTENT_MAX)), 'the error does not say what the limit is');
  assert.equal(v.remaining, -1, 'the counter does not go negative, so the user cannot see by how much');
});

test('the limit the dialog enforces is the limit the column enforces', () => {
  const m = /char_length\(content\)\s+between\s+\d+\s+and\s+(\d+)/i.exec(INIT_SQL.slice(INIT_SQL.indexOf('create table public.feedback')));
  assert.equal(M.SUPPORT_CONTENT_MAX, Number(m[1]));
  assert.equal(M.SUPPORT_CONTENT_MAX, W.SUPPORT_CONTENT_MAX, 'the dialog and the route disagree about how long a report may be');
});

test('a real draft can be sent and the counter counts down', () => {
  const words = 'The Studio panel says "Session ended" every time I press Build.';
  const v = M.checkDraft(words);
  assert.equal(v.canSend, true);
  assert.equal(v.error, null);
  assert.equal(v.remaining, M.SUPPORT_CONTENT_MAX - words.length);
  // Surrounding whitespace is not something the user typed and must not be charged for.
  assert.equal(M.checkDraft(`  ${words}  `).remaining, v.remaining);
});

/* ------------------------------------------------------------------- the status --- */

test('a filed request reads back with a status a person can understand', () => {
  const open = M.describeRequest({ id: 'a', kind: 'bug', content: 'x', page: null, status: 'open', createdAt: '2026-09-01T00:00:00Z' });
  const closed = M.describeRequest({ id: 'b', kind: 'bug', content: 'x', page: null, status: 'closed', createdAt: '2026-09-01T00:00:00Z' });
  for (const [what, d] of [['open', open], ['closed', closed]]) {
    assert.ok(d.statusLabel && d.statusLabel.length > 3, `${what} has no label`);
    assert.notEqual(d.statusLabel.toLowerCase(), what, `${what} is labelled with its own column value`);
  }
  assert.notEqual(open.statusLabel, closed.statusLabel, 'open and closed read identically');
});

test('a status the column grows later is shown honestly rather than guessed at', () => {
  // The refusal to invent. An unknown value is reported as unknown; it is not silently called open,
  // which would tell a person their answered request is still waiting.
  const d = M.describeRequest({ id: 'c', kind: 'bug', content: 'x', page: null, status: 'escalated', createdAt: '2026-09-01T00:00:00Z' });
  assert.ok(d.statusLabel, 'an unknown status rendered as nothing at all');
  assert.equal(d.statusLabel.toLowerCase().includes('open'), false, 'an unknown status was reported as open');
});

test('the category is named in the reader\'s words when the list is read back', () => {
  const d = M.describeRequest({ id: 'a', kind: 'bug', content: 'x', page: null, status: 'open', createdAt: '2026-09-01T00:00:00Z' });
  assert.equal(d.kindLabel, M.SUPPORT_CATEGORIES.find((c) => c.id === 'bug').label);
});

/* ------------------------------------------------------------------- the wiring --- */

test('the dialog is reachable from inside the app, not only from the marketing site', () => {
  assert.match(LAYOUT_TSX, /SupportDialog/, 'nothing in the app chrome opens the support dialog');
  // A menu item that opens nothing is the same as no menu item.
  assert.match(LAYOUT_TSX, /setSupportOpen|supportOpen/, 'the account menu has no state for the dialog it claims to open');
});

test('the dialog posts through the api client, so it carries the session like everything else', () => {
  assert.match(API_TS, /\/api\/feedback/, 'the api client cannot reach the support routes');
  assert.match(API_TS, /submitSupportRequest/, 'there is no submit function');
  assert.match(API_TS, /fetchSupportRequests/, 'there is no way to read your own requests back');
  assert.match(DIALOG_TSX, /submitSupportRequest/, 'the dialog does not call the submit function');
});

test('the dialog sends a category and a page, not just a blob of text', () => {
  assert.match(DIALOG_TSX, /supportPageOf/, 'the dialog never computes the page, so the page column stays empty forever');
  assert.match(DIALOG_TSX, /SUPPORT_CATEGORIES/, 'the dialog does not render the categories');
});

/** Source with comments removed, so a rule about CODE is not satisfied or broken by prose. */
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

test('no line in this feature can read the whole URL, because none of them touches it', () => {
  // `location.href` and `window.location` both carry the fragment, and the fragment is where this
  // app's magic-link `access_token` lives. Neither appears in the code — the dialog takes a
  // pathname as a required prop instead, so there is no fallback path back to the real object.
  for (const [name, src] of [
    ['support-dialog.tsx', DIALOG_TSX],
    ['support-model.ts', readFileSync(join(WEB, 'src', 'components', 'support-model.ts'), 'utf8')],
  ]) {
    const body = code(src);
    assert.equal(/location\.href/.test(body), false, `${name} reads the whole URL, fragment and all`);
    assert.equal(/window\.location/.test(body), false, `${name} reaches the browser's location object`);
  }
  // And the caller hands it a pathname, not a location. A `location={window.location}` at the call
  // site would put the fragment back with nothing in this feature to stop it.
  assert.match(code(LAYOUT_TSX), /location=\{\{\s*pathname:/, 'the call site passes something other than a bare pathname');
});

test('the submitter is told when their report was edited on the way in', () => {
  // The worker removes a pasted credential and reports `redacted`. Dropping that on the floor means
  // a person reads back a report that does not match what they typed, with no explanation.
  assert.match(DIALOG_TSX, /redacted/, 'the dialog ignores the fact that the report was changed');
});
